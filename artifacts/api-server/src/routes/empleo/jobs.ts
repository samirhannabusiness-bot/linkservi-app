import { Router } from "express";
import { db, jobProfilesTable, jobSubscriptionsTable, usersTable, notificationsTable, userVerificationsTable } from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { authenticate } from "../../lib/auth";
import jwt from "jsonwebtoken";
import { sendPaymentReportAlert, sendSubscriptionApprovedEmail } from "../../lib/email";

// Venezuelan phone number regex — blocks any VE mobile format
const VE_PHONE_RE =
  /(?:\+?58[\s.\-]?)?(?:0?4(?:1[246]|2[46]))[\s.\-]?\d{3}[\s.\-]?\d{4}/;

// Extract userId from token without throwing
function tryGetUserId(authHeader?: string): number | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify(authHeader.slice(7), secret) as { userId: number; [k: string]: unknown };
    return payload.userId ?? null;
  } catch { return null; }
}

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
function isSubscriptionActive(profile: { subscriptionEnd: Date | null }): boolean {
  if (!profile.subscriptionEnd) return false;
  return new Date(profile.subscriptionEnd) > new Date();
}

// ── GET /jobs/profiles — search profiles (featured first) ─────────────────────
router.get("/jobs/profiles", async (req, res): Promise<void> => {
  try {
    const { trade, city, years } = req.query;

    // Optional auth — check if requester has business_premium
    const requesterId = tryGetUserId(req.headers.authorization);
    let hasPremium = false;
    if (requesterId) {
      const [activeSub] = await db
        .select({ id: jobSubscriptionsTable.id })
        .from(jobSubscriptionsTable)
        .where(and(
          eq(jobSubscriptionsTable.userId, requesterId),
          eq(jobSubscriptionsTable.type, "business_premium"),
          eq(jobSubscriptionsTable.status, "active"),
          gte(jobSubscriptionsTable.endDate, new Date()),
        ))
        .limit(1);
      hasPremium = !!activeSub;
    }

    let rows = await db
      .select({
        id: jobProfilesTable.id,
        userId: jobProfilesTable.userId,
        bio: jobProfilesTable.bio,
        videoUrl: jobProfilesTable.videoUrl,
        city: jobProfilesTable.city,
        skills: jobProfilesTable.skills,
        workExperience: jobProfilesTable.workExperience,
        isAvailable: jobProfilesTable.isAvailable,
        cedula: jobProfilesTable.cedula,
        subscriptionEnd: jobProfilesTable.subscriptionEnd,
        createdAt: jobProfilesTable.createdAt,
        userName: usersTable.name,
        userAvatar: usersTable.avatarUrl,
        isVerified: sql<boolean>`EXISTS (
          SELECT 1 FROM user_verifications uv
          WHERE uv.user_id = ${jobProfilesTable.userId}
          AND uv.status = 'approved'
        )`,
        userPhone: usersTable.phone,
      })
      .from(jobProfilesTable)
      .innerJoin(usersTable, eq(jobProfilesTable.userId, usersTable.id))
      .where(jobProfilesTable.isAvailable)
      .orderBy(desc(jobProfilesTable.subscriptionEnd), desc(jobProfilesTable.createdAt));

    // Filter by city
    if (city && typeof city === "string" && city.trim()) {
      rows = rows.filter(r => r.city.toLowerCase().includes(city.toLowerCase()));
    }

    // Filter by trade (skill match)
    if (trade && typeof trade === "string" && trade.trim()) {
      rows = rows.filter(r => {
        try {
          const skills: string[] = JSON.parse(r.skills);
          return skills.some(s => s.toLowerCase().includes(trade.toLowerCase()));
        } catch { return false; }
      });
    }

    // Filter by minimum years of experience
    if (years && typeof years === "string") {
      const minYears = parseInt(years);
      if (!isNaN(minYears)) {
        rows = rows.filter(r => {
          try {
            const exp: { years: number }[] = JSON.parse(r.workExperience);
            const totalYears = exp.reduce((acc, e) => acc + (e.years || 0), 0);
            return totalYears >= minYears;
          } catch { return false; }
        });
      }
    }

    // Parse JSON fields and add featured flag; mask phone unless business_premium
    const result = rows.map(r => ({
      ...r,
      skills: (() => { try { return JSON.parse(r.skills); } catch { return []; } })(),
      workExperience: (() => { try { return JSON.parse(r.workExperience); } catch { return []; } })(),
      isFeatured: isSubscriptionActive(r),
      userPhone: hasPremium ? r.userPhone : null,
    }));

    // Featured first, then by date
    result.sort((a, b) => {
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return 0;
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: "Error al obtener perfiles" });
  }
});

// ── GET /jobs/profiles/me — get my own profile ────────────────────────────────
router.get("/jobs/profiles/me", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const rows = await db
      .select({
        id: jobProfilesTable.id,
        userId: jobProfilesTable.userId,
        bio: jobProfilesTable.bio,
        videoUrl: jobProfilesTable.videoUrl,
        city: jobProfilesTable.city,
        skills: jobProfilesTable.skills,
        workExperience: jobProfilesTable.workExperience,
        isAvailable: jobProfilesTable.isAvailable,
        cedula: jobProfilesTable.cedula,
        subscriptionEnd: jobProfilesTable.subscriptionEnd,
        createdAt: jobProfilesTable.createdAt,
        updatedAt: jobProfilesTable.updatedAt,
        userName: usersTable.name,
        userAvatar: usersTable.avatarUrl,
        userPhone: usersTable.phone,
      })
      .from(jobProfilesTable)
      .innerJoin(usersTable, eq(jobProfilesTable.userId, usersTable.id))
      .where(eq(jobProfilesTable.userId, uid));
    const profile = rows[0];
    if (!profile) { res.json(null); return; }
    res.json({
      ...profile,
      skills: (() => { try { return JSON.parse(profile.skills); } catch { return []; } })(),
      workExperience: (() => { try { return JSON.parse(profile.workExperience); } catch { return []; } })(),
      isFeatured: isSubscriptionActive(profile),
    });
  } catch {
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// ── GET /jobs/profiles/:id — get a single profile ────────────────────────────
router.get("/jobs/profiles/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [profile] = await db
      .select({
        id: jobProfilesTable.id,
        userId: jobProfilesTable.userId,
        bio: jobProfilesTable.bio,
        videoUrl: jobProfilesTable.videoUrl,
        city: jobProfilesTable.city,
        skills: jobProfilesTable.skills,
        workExperience: jobProfilesTable.workExperience,
        isAvailable: jobProfilesTable.isAvailable,
        cedula: jobProfilesTable.cedula,
        subscriptionEnd: jobProfilesTable.subscriptionEnd,
        createdAt: jobProfilesTable.createdAt,
        userName: usersTable.name,
        userAvatar: usersTable.avatarUrl,
        isVerified: sql<boolean>`EXISTS (
          SELECT 1 FROM user_verifications uv
          WHERE uv.user_id = ${jobProfilesTable.userId}
          AND uv.status = 'approved'
        )`,
      })
      .from(jobProfilesTable)
      .innerJoin(usersTable, eq(jobProfilesTable.userId, usersTable.id))
      .where(eq(jobProfilesTable.id, id));

    if (!profile) { res.status(404).json({ error: "Perfil no encontrado" }); return; }

    res.json({
      ...profile,
      skills: (() => { try { return JSON.parse(profile.skills); } catch { return []; } })(),
      workExperience: (() => { try { return JSON.parse(profile.workExperience); } catch { return []; } })(),
      isFeatured: isSubscriptionActive(profile),
    });
  } catch {
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// ── POST /jobs/profile — create or update own profile ─────────────────────────
router.post("/jobs/profile", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const { bio, videoUrl, city, skills, workExperience, isAvailable, cedula, fullName, avatarUrl, phone } = req.body;

    if (!city?.trim()) { res.status(400).json({ error: "Ciudad requerida" }); return; }

    // ── KYC gate: to appear as "available" (visible to employers), the user
    //    must have an approved identity verification (Gemini KYC). ──────────────
    if (isAvailable !== false) {
      const [kyc] = await db
        .select({ status: userVerificationsTable.status })
        .from(userVerificationsTable)
        .where(eq(userVerificationsTable.userId, uid))
        .limit(1);
      if (!kyc || kyc.status !== "approved") {
        res.status(403).json({
          error: "Para que tu perfil sea visible en la Bolsa de Empleo, necesitas verificar tu identidad (KYC). Completa el proceso de verificación y vuelve a intentarlo.",
          kycStatus: kyc?.status ?? "not_submitted",
          kycRequired: true,
        });
        return;
      }
    }

    // Block phone numbers in bio (security filter)
    if (bio && VE_PHONE_RE.test(bio)) {
      res.status(422).json({ error: "No puedes incluir números telefónicos en tu perfil. El contacto se gestiona a través de la plataforma." });
      return;
    }

    const skillsJson = JSON.stringify(Array.isArray(skills) ? skills.slice(0, 20) : []);
    const expJson = JSON.stringify(Array.isArray(workExperience) ? workExperience.slice(0, 10) : []);

    // Update user's display name, avatar and phone if provided
    const userUpdate: Record<string, any> = {};
    if (fullName?.trim()) userUpdate.name = fullName.trim();
    if (avatarUrl !== undefined) userUpdate.avatarUrl = avatarUrl || null;
    if (phone !== undefined) userUpdate.phone = phone?.trim() || null;
    if (Object.keys(userUpdate).length > 0) {
      await db.update(usersTable).set(userUpdate).where(eq(usersTable.id, uid));
    }

    const [existing] = await db.select().from(jobProfilesTable).where(eq(jobProfilesTable.userId, uid));

    if (existing) {
      const [updated] = await db.update(jobProfilesTable)
        .set({
          bio: bio?.trim() ?? "",
          videoUrl: videoUrl ?? null,
          city: city.trim(),
          skills: skillsJson,
          workExperience: expJson,
          isAvailable: isAvailable !== false,
          cedula: cedula?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(jobProfilesTable.userId, uid))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(jobProfilesTable)
        .values({
          userId: uid,
          bio: bio?.trim() ?? "",
          videoUrl: videoUrl ?? null,
          city: city.trim(),
          skills: skillsJson,
          workExperience: expJson,
          isAvailable: isAvailable !== false,
          cedula: cedula?.trim() || null,
        })
        .returning();
      res.status(201).json(created);
    }
  } catch {
    res.status(500).json({ error: "Error al guardar perfil" });
  }
});

// ── POST /jobs/subscribe/report-payment — report pago móvil reference ─────────
router.post("/jobs/subscribe/report-payment", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const { type, reference } = req.body;

    if (!["worker_featured", "business_premium"].includes(type)) {
      res.status(400).json({ error: "Tipo de suscripción inválido" }); return;
    }
    if (!reference?.trim()) {
      res.status(400).json({ error: "Número de referencia requerido" }); return;
    }

    const amount = type === "worker_featured" ? 1.0 : 2.0;
    const label = type === "worker_featured" ? "Profesional Destacado ($1)" : "Empresa Premium ($2)";

    // Create a pending subscription record so admin can track it
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);

    await db.update(jobSubscriptionsTable)
      .set({ status: "expired" })
      .where(and(eq(jobSubscriptionsTable.userId, uid), eq(jobSubscriptionsTable.type, type), eq(jobSubscriptionsTable.status, "pending_payment")));

    await db.insert(jobSubscriptionsTable).values({
      userId: uid,
      type,
      startDate,
      endDate,
      amountUsd: amount,
      status: "pending_payment",
    });

    // Notify admin via in-app notification
    const [adminUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role as any, "admin"))
      .limit(1);

    if (adminUser) {
      await db.insert(notificationsTable).values({
        userId: adminUser.id,
        type: "payment_report",
        title: `Pago reportado — ${label}`,
        message: `Un usuario reportó pago por Pago Móvil. Referencia: ${reference.trim()}. Monto: $${amount} USD. Tipo: ${type}. User ID: ${uid}`,
        targetRole: "admin",
      });
    }

    // Get reporter info for email alert
    const [reporter] = await db
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, uid));

    // Send email alert to admin (non-blocking)
    sendPaymentReportAlert({
      userName: reporter?.name ?? "Usuario",
      userEmail: reporter?.email ?? "",
      userId: uid,
      type,
      amount,
      reference: reference.trim(),
    }).catch(err => console.error("[email] payment alert failed:", err));

    res.json({
      ok: true,
      message: "Tu pago fue reportado. En menos de 24 horas activaremos tu suscripción una vez confirmado el pago.",
    });
  } catch (err) {
    console.error("[jobs] report-payment error:", err);
    res.status(500).json({ error: "Error al reportar pago" });
  }
});

// ── GET /jobs/subscriptions/me — get my active subscription ───────────────────
// Returns the most recent active subscription for the user.
router.get("/jobs/subscriptions/me", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const [sub] = await db
      .select()
      .from(jobSubscriptionsTable)
      .where(and(
        eq(jobSubscriptionsTable.userId, uid),
        eq(jobSubscriptionsTable.status, "active"),
        gte(jobSubscriptionsTable.endDate, new Date()),
      ))
      .orderBy(desc(jobSubscriptionsTable.endDate))
      .limit(1);
    res.json(sub ?? null);
  } catch {
    res.status(500).json({ error: "Error al obtener suscripción" });
  }
});

// ── GET /jobs/subscriptions/status — full status (active + pending) ────────────
// Returns { active: sub | null, pending: sub | null } for real-time UI sync.
router.get("/jobs/subscriptions/status", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const now = new Date();

    // Most recent active subscription (not expired)
    const [active] = await db
      .select()
      .from(jobSubscriptionsTable)
      .where(and(
        eq(jobSubscriptionsTable.userId, uid),
        eq(jobSubscriptionsTable.status, "active"),
        gte(jobSubscriptionsTable.endDate, now),
      ))
      .orderBy(desc(jobSubscriptionsTable.endDate))
      .limit(1);

    // Most recent pending_payment subscription
    const [pending] = await db
      .select()
      .from(jobSubscriptionsTable)
      .where(and(
        eq(jobSubscriptionsTable.userId, uid),
        eq(jobSubscriptionsTable.status, "pending_payment"),
      ))
      .orderBy(desc(jobSubscriptionsTable.startDate))
      .limit(1);

    res.json({ active: active ?? null, pending: pending ?? null });
  } catch {
    res.status(500).json({ error: "Error al obtener estado de suscripción" });
  }
});

// ── POST /jobs/subscribe — open Pago Móvil modal (always pending_payment) ─────
// Subscriptions are manually approved by admin. No balance deduction.
router.post("/jobs/subscribe", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const { type } = req.body;

    if (!["worker_featured", "business_premium"].includes(type)) {
      res.status(400).json({ error: "Tipo de suscripción inválido" }); return;
    }

    // Always redirect to manual payment flow — return 402 so frontend opens modal
    res.status(402).json({
      needsPayment: true,
      type,
      message: "Realiza tu pago por Pago Móvil y reporta la referencia.",
    });
  } catch {
    res.status(500).json({ error: "Error al procesar suscripción" });
  }
});

// ── Admin: GET /admin/jobs/subscriptions — list pending subscriptions ─────────
router.get("/admin/jobs/subscriptions", authenticate, async (req, res): Promise<void> => {
  try {
    if (!["admin", "super_admin"].includes(req.user!.role as string)) {
      res.status(403).json({ error: "Solo admin" }); return;
    }
    const rows = await db
      .select({
        id: jobSubscriptionsTable.id,
        userId: jobSubscriptionsTable.userId,
        type: jobSubscriptionsTable.type,
        status: jobSubscriptionsTable.status,
        amountUsd: jobSubscriptionsTable.amountUsd,
        startDate: jobSubscriptionsTable.startDate,
        endDate: jobSubscriptionsTable.endDate,
        userName: usersTable.name,
        userEmail: usersTable.email,
      })
      .from(jobSubscriptionsTable)
      .innerJoin(usersTable, eq(jobSubscriptionsTable.userId, usersTable.id))
      .orderBy(desc(jobSubscriptionsTable.startDate));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Error" });
  }
});

// ── Admin: PUT /admin/jobs/subscriptions/:id/approve ─────────────────────────
router.put("/admin/jobs/subscriptions/:id/approve", authenticate, async (req, res): Promise<void> => {
  try {
    if (!["admin", "super_admin"].includes(req.user!.role as string)) {
      res.status(403).json({ error: "Solo admin" }); return;
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

    const [sub] = await db.select().from(jobSubscriptionsTable).where(eq(jobSubscriptionsTable.id, id));
    if (!sub) { res.status(404).json({ error: "Suscripción no encontrada" }); return; }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);

    // Expire previous active of same type
    await db.update(jobSubscriptionsTable)
      .set({ status: "expired" })
      .where(and(
        eq(jobSubscriptionsTable.userId, sub.userId),
        eq(jobSubscriptionsTable.type, sub.type),
        eq(jobSubscriptionsTable.status, "active"),
      ));

    const [updated] = await db.update(jobSubscriptionsTable)
      .set({ status: "active", startDate, endDate })
      .where(eq(jobSubscriptionsTable.id, id))
      .returning();

    // Update job profile subscriptionEnd if worker_featured
    if (sub.type === "worker_featured") {
      await db.update(jobProfilesTable)
        .set({ subscriptionEnd: endDate, updatedAt: new Date() })
        .where(eq(jobProfilesTable.userId, sub.userId));
    }

    // Send confirmation email to subscriber (non-blocking)
    const [subUser] = await db
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, sub.userId));

    if (subUser?.email) {
      sendSubscriptionApprovedEmail({
        toEmail: subUser.email,
        toName: subUser.name ?? "Usuario",
        type: sub.type,
        endDate,
      }).catch(err => console.error("[email] subscription approval email failed:", err));
    }

    res.json({ ok: true, subscription: updated });
  } catch (err) {
    console.error("[admin] approve sub error:", err);
    res.status(500).json({ error: "Error al aprobar suscripción" });
  }
});

// ── Admin: PUT /admin/jobs/subscriptions/:id/reject ──────────────────────────
router.put("/admin/jobs/subscriptions/:id/reject", authenticate, async (req, res): Promise<void> => {
  try {
    if (!["admin", "super_admin"].includes(req.user!.role as string)) {
      res.status(403).json({ error: "Solo admin" }); return;
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

    const [updated] = await db.update(jobSubscriptionsTable)
      .set({ status: "expired" })
      .where(eq(jobSubscriptionsTable.id, id))
      .returning();

    res.json({ ok: true, subscription: updated });
  } catch {
    res.status(500).json({ error: "Error al rechazar suscripción" });
  }
});

// ── Admin: GET /admin/jobs/profiles — all profiles ────────────────────────────
router.get("/admin/jobs/profiles", authenticate, async (req, res): Promise<void> => {
  try {
    if (req.user!.role !== "admin") { res.status(403).json({ error: "Solo admin" }); return; }
    const rows = await db
      .select({
        id: jobProfilesTable.id,
        userId: jobProfilesTable.userId,
        city: jobProfilesTable.city,
        isAvailable: jobProfilesTable.isAvailable,
        subscriptionEnd: jobProfilesTable.subscriptionEnd,
        createdAt: jobProfilesTable.createdAt,
        userName: usersTable.name,
        userAvatar: usersTable.avatarUrl,
      })
      .from(jobProfilesTable)
      .innerJoin(usersTable, eq(jobProfilesTable.userId, usersTable.id))
      .orderBy(desc(jobProfilesTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Error" });
  }
});

export default router;
