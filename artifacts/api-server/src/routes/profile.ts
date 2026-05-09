import { Router } from "express";
import { db, usersTable, workersTable, bookingsTable, reviewsTable, userVerificationsTable, driverProfilesTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { authenticate } from "../lib/auth";
import { aliasedTable } from "drizzle-orm";
import { processVerificationKYC } from "../lib/kyc";

const router = Router();

router.put("/profile/avatar", authenticate, async (req, res): Promise<void> => {
  const { avatarUrl } = req.body;
  if (!avatarUrl || typeof avatarUrl !== "string") {
    res.status(400).json({ error: "avatarUrl is required" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ avatarUrl })
    .where(eq(usersTable.id, req.user!.id))
    .returning();
  const { passwordHash, ...safe } = updated;
  res.json(safe);
});

router.put("/profile", authenticate, async (req, res): Promise<void> => {
  const { name, phone, state, city } = req.body;
  const [updated] = await db
    .update(usersTable)
    .set({
      name: name ?? undefined,
      phone: phone ?? undefined,
      state: state ?? undefined,
      city: city ?? undefined,
    })
    .where(eq(usersTable.id, req.user!.id))
    .returning();
  const { passwordHash, ...safe } = updated;
  res.json(safe);
});

// Save user GPS coordinates
router.put("/profile/location", authenticate, async (req, res): Promise<void> => {
  const { latitude, longitude } = req.body;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    res.status(400).json({ error: "latitude and longitude must be numbers" });
    return;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    res.status(400).json({ error: "Invalid coordinates" });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ latitude, longitude })
    .where(eq(usersTable.id, req.user!.id))
    .returning();
  const { passwordHash, ...safe } = updated;
  res.json(safe);
});

router.put("/workers/me/verification", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "worker" && req.user!.secondaryRole !== "worker") { res.status(403).json({ error: "Acceso denegado" }); return; }
  const { documentType, documentNumber, documentImageUrl, selfieImageUrl, emergencyContact, emergencyPhone } = req.body;

  // ── Validación dura: ambas fotos son obligatorias ─────────────────────────
  if (!documentImageUrl || typeof documentImageUrl !== "string" || !documentImageUrl.trim()) {
    res.status(400).json({ error: "Debes subir la foto del documento de identidad." });
    return;
  }
  if (!selfieImageUrl || typeof selfieImageUrl !== "string" || !selfieImageUrl.trim()) {
    res.status(400).json({ error: "Debes subir tu selfie." });
    return;
  }

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
  if (!worker) { res.status(404).json({ error: "Worker profile not found" }); return; }

  const [updated] = await db
    .update(workersTable)
    .set({
      documentType: documentType ?? undefined,
      documentNumber: documentNumber ?? undefined,
      documentImageUrl,
      selfieImageUrl,
      emergencyContact: emergencyContact ?? undefined,
      emergencyPhone: emergencyPhone ?? undefined,
      verificationStatus: "pending",
    })
    .where(eq(workersTable.id, worker.id))
    .returning();

  // Also upsert into unified user_verifications for admin queue
  const [existing] = await db.select().from(userVerificationsTable)
    .where(eq(userVerificationsTable.userId, req.user!.id));

  let verificationId: number;

  if (existing) {
    const [uvUpdated] = await db.update(userVerificationsTable).set({
      documentType: documentType ?? existing.documentType,
      documentNumber: documentNumber ?? existing.documentNumber,
      documentImageUrl,
      selfieImageUrl,
      emergencyContact: emergencyContact ?? existing.emergencyContact,
      emergencyPhone: emergencyPhone ?? existing.emergencyPhone,
      status: "pending",
      notes: null,
      updatedAt: new Date(),
    }).where(eq(userVerificationsTable.id, existing.id)).returning();
    verificationId = uvUpdated.id;
  } else {
    const [uvCreated] = await db.insert(userVerificationsTable).values({
      userId: req.user!.id,
      role: "worker",
      documentType: documentType ?? "cedula",
      documentNumber: documentNumber ?? null,
      documentImageUrl,
      selfieImageUrl,
      emergencyContact: emergencyContact ?? null,
      emergencyPhone: emergencyPhone ?? null,
      status: "pending",
    }).returning();
    verificationId = uvCreated.id;
  }

  // ── Trigger KYC automático (fire-and-forget, no bloquea la respuesta) ──────
  processVerificationKYC(req.user!.id, verificationId, documentImageUrl, selfieImageUrl, "worker")
    .catch(err => console.error("[KYC] Error no capturado (worker):", err));

  res.json(updated);
});

router.get("/workers/me/verification", authenticate, async (req, res): Promise<void> => {
  if (req.user!.role !== "worker" && req.user!.secondaryRole !== "worker") { res.status(403).json({ error: "Acceso denegado" }); return; }
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
  if (!worker) { res.status(404).json({ error: "Worker profile not found" }); return; }
  // Only report "pending" (or the actual status) once photos exist.
  // Without photos the status is "not_submitted" so the UI shows the upload
  // form — never the "Cuenta en revisión" screen.
  const effectiveStatus = (worker.documentImageUrl && worker.selfieImageUrl)
    ? worker.verificationStatus
    : "not_submitted";

  res.json({
    documentType: worker.documentType,
    documentNumber: worker.documentNumber,
    documentImageUrl: worker.documentImageUrl,
    selfieImageUrl: worker.selfieImageUrl,
    emergencyContact: worker.emergencyContact,
    emergencyPhone: worker.emergencyPhone,
    verificationStatus: effectiveStatus,
    verificationNotes: worker.verificationNotes,
    isVerified: worker.isVerified,
  });
});

// GET /api/users/:userId/profile — public profile (for workers viewing clients)
const workerUsersAlias = aliasedTable(usersTable, "wu");
router.get("/users/:userId/profile", authenticate, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "ID inválido" }); return; }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl, state: usersTable.state, city: usersTable.city, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Usuario no encontrado" }); return; }

  const [{ total: bookingCount }] = await db
    .select({ total: count() })
    .from(bookingsTable)
    .where(eq(bookingsTable.clientId, userId));

  const reviewRows = await db
    .select({ review: reviewsTable, workerName: workerUsersAlias.name, workerAvatarUrl: workerUsersAlias.avatarUrl })
    .from(reviewsTable)
    .innerJoin(workersTable, eq(reviewsTable.workerId, workersTable.id))
    .innerJoin(workerUsersAlias, eq(workersTable.userId, workerUsersAlias.id))
    .where(eq(reviewsTable.clientId, userId))
    .orderBy(sql`${reviewsTable.createdAt} DESC`);

  res.json({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    state: user.state,
    city: user.city,
    memberSince: user.createdAt,
    bookingCount,
    reviews: reviewRows.map(r => ({
      id: r.review.id,
      workerId: r.review.workerId,
      workerName: r.workerName,
      workerAvatarUrl: r.workerAvatarUrl,
      rating: r.review.rating,
      comment: r.review.comment,
      createdAt: r.review.createdAt,
    })),
  });
});

// ── Universal Identity Verification (all roles: client, cohost, seller, worker) ──

// GET /api/me/verification — fetch my verification record from unified table
router.get("/me/verification", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const [record] = await db
    .select()
    .from(userVerificationsTable)
    .where(eq(userVerificationsTable.userId, userId));
  if (!record) {
    res.json({ status: "not_submitted", role });
    return;
  }
  // A record without images means the user started but didn't finish uploading.
  // Show the upload form, never the "Cuenta en revisión" screen.
  const effectiveStatus = (record.documentImageUrl && record.selfieImageUrl)
    ? record.status
    : "not_submitted";

  res.json({
    id: record.id,
    role: record.role,
    documentType: record.documentType,
    documentNumber: record.documentNumber,
    documentImageUrl: record.documentImageUrl,
    selfieImageUrl: record.selfieImageUrl,
    emergencyContact: record.emergencyContact,
    emergencyPhone: record.emergencyPhone,
    status: effectiveStatus,
    notes: record.notes,
    updatedAt: record.updatedAt,
  });
});

// PUT /api/me/verification — submit or update verification documents
router.put("/me/verification", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const { documentType, documentNumber, documentImageUrl, selfieImageUrl, emergencyContact, emergencyPhone } = req.body;

  if (!documentImageUrl || !selfieImageUrl) {
    res.status(400).json({ error: "Debes subir la foto del documento y la selfie." });
    return;
  }

  const [existing] = await db.select().from(userVerificationsTable).where(eq(userVerificationsTable.userId, userId));

  let record: typeof userVerificationsTable.$inferSelect;

  if (existing) {
    const [updated] = await db
      .update(userVerificationsTable)
      .set({
        documentType: documentType ?? existing.documentType,
        documentNumber: documentNumber ?? existing.documentNumber,
        documentImageUrl,
        selfieImageUrl,
        emergencyContact: emergencyContact ?? existing.emergencyContact,
        emergencyPhone: emergencyPhone ?? existing.emergencyPhone,
        status: "pending",
        notes: null,
        updatedAt: new Date(),
      })
      .where(eq(userVerificationsTable.id, existing.id))
      .returning();
    record = updated;
  } else {
    const [created] = await db
      .insert(userVerificationsTable)
      .values({
        userId,
        role: userRole,
        documentType: documentType ?? "cedula",
        documentNumber: documentNumber ?? null,
        documentImageUrl,
        selfieImageUrl,
        emergencyContact: emergencyContact ?? null,
        emergencyPhone: emergencyPhone ?? null,
        status: "pending",
      })
      .returning();
    record = created;
  }

  // ── Trigger KYC automático (fire-and-forget, no bloquea la respuesta) ──────
  processVerificationKYC(userId, record.id, documentImageUrl, selfieImageUrl, userRole)
    .catch(err => console.error("[KYC] Error no capturado (me/verification):", err));

  res.json(record);
});

// ── Dual-role: activate client mode for workers/sellers/cohosts ───────────────

router.post("/profile/activate-client-mode", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  if (req.user!.role === "client") {
    res.json({ success: true, message: "Ya eres cliente" });
    return;
  }
  await db.update(usersTable)
    .set({ secondaryRole: "client" } as any)
    .where(eq(usersTable.id, userId));
  res.json({ success: true });
});

// ── Dual-role: activate worker mode for a client ─────────────────────────────

// Check if user has a worker profile (dual-role enabled)
router.get("/profile/worker-status", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, userId));
  const secondaryRole = (req.user as any).secondaryRole ?? null;
  res.json({
    hasWorkerProfile: !!worker,
    workerId: worker?.id ?? null,
    isActivated: secondaryRole === "worker" || req.user!.role === "worker",
    worker: worker ?? null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Activación de roles dentro de la cuenta única
//
// El usuario se registra UNA sola vez. Los roles adicionales (worker, driver,
// seller, cohost) se activan agregándolos al array `users.roles[]` de forma
// idempotente. Mantenemos también `secondary_role` por compat hacia atrás
// (varios componentes legacy aún lo leen) — pero la fuente de verdad nueva es
// el array `roles[]`. Las nuevas guards (`userHasRole`) ya consultan ambos.
//
// Cada activate-* endpoint:
//   1. Es idempotente (re-llamar no rompe nada).
//   2. Ejecuta el append a roles[] con un UPDATE atómico vía SQL para no
//      perder roles agregados por requests concurrentes.
//   3. Devuelve el user actualizado para que el frontend invalide /me.
// ─────────────────────────────────────────────────────────────────────────────

async function appendRoleAtomic(userId: number, role: string): Promise<void> {
  await db.update(usersTable).set({
    roles: sql`(
      SELECT ARRAY(SELECT DISTINCT unnest(
        COALESCE(${usersTable.roles}, ARRAY[]::text[]) || ARRAY[${role}]::text[]
      ))
    )` as any,
  }).where(eq(usersTable.id, userId));
}

// Activate worker mode: create a worker profile + add 'worker' to roles[]
router.post("/profile/activate-worker-mode", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { categoryId, description, basePrice, servicePrice, skills } = req.body;

  // If already a native worker, just return success
  if (req.user!.role === "worker") {
    res.json({ success: true, message: "Ya eres profesional" });
    return;
  }

  // Check for existing worker profile
  const [existing] = await db.select().from(workersTable).where(eq(workersTable.userId, userId));

  let worker = existing;
  if (!worker) {
    if (!categoryId) {
      res.status(400).json({ error: "categoryId is required to create a worker profile" });
      return;
    }
    const [created] = await db.insert(workersTable).values({
      userId,
      categoryId: Number(categoryId),
      description: description ?? null,
      basePrice: basePrice ? Number(basePrice) : 10,
      servicePrice: servicePrice ? Number(servicePrice) : 50,
      hourlyRate: basePrice ? Number(basePrice) : 10,
      skills: Array.isArray(skills) ? skills : [],
      isAvailable: false,
      verificationStatus: "pending",
    }).returning();
    worker = created;
  }

  // Set secondaryRole + add 'worker' to roles[]
  await db.update(usersTable)
    .set({ secondaryRole: "worker" } as any)
    .where(eq(usersTable.id, userId));
  await appendRoleAtomic(userId, "worker");

  res.json({ success: true, worker });
});

// ── Activate cohost mode for a client ────────────────────────────────────────

router.post("/profile/activate-cohost-mode", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  if (req.user!.role === "cohost" || req.user!.secondaryRole === "cohost") {
    res.json({ success: true, message: "Ya eres gestor de equipo" });
    return;
  }

  await db.update(usersTable)
    .set({ secondaryRole: "cohost" } as any)
    .where(eq(usersTable.id, userId));
  await appendRoleAtomic(userId, "cohost");

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.json({ success: true, user: updated });
});

// ── Activate driver mode ─────────────────────────────────────────────────────
// Self-service: el cliente declara que quiere ser conductor. Sólo agrega el
// rol; los documentos (licencia, RCV, etc.) se suben aparte en /verification y
// el ride request real exige verificación KYC vigente. Esto desbloquea las
// pantallas de conductor (DriverTransportPage) sin gating administrativo.
router.post("/profile/activate-driver-mode", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const u = req.user!;

  const alreadyDriver =
    u.role === "driver" ||
    u.secondaryRole === "driver" ||
    (Array.isArray((u as any).roles) && (u as any).roles.includes("driver"));
  if (alreadyDriver) {
    res.json({ success: true, message: "Ya eres conductor" });
    return;
  }

  // Si no hay secondaryRole (cliente puro), también lo seteamos para que el
  // ModeSwitch detecte el modo conductor sin tocar el primary role.
  if (!u.secondaryRole) {
    await db.update(usersTable)
      .set({ secondaryRole: "driver" } as any)
      .where(eq(usersTable.id, userId));
  }
  await appendRoleAtomic(userId, "driver");

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.json({ success: true, user: updated });
});

// ── Activate seller mode ─────────────────────────────────────────────────────
// Llamado por el frontend antes de abrir el flujo "Crear tienda" cuando el
// usuario aún no tiene rol seller/cohost. Sólo agrega el rol; la creación de
// la tienda en sí pasa por POST /api/stores (que ahora encontrará el rol).
router.post("/profile/activate-seller-mode", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const u = req.user!;

  const alreadySeller =
    u.role === "seller" ||
    u.role === "cohost" ||
    u.secondaryRole === "seller" ||
    u.secondaryRole === "cohost" ||
    (Array.isArray((u as any).roles) &&
      ((u as any).roles.includes("seller") || (u as any).roles.includes("cohost")));
  if (alreadySeller) {
    res.json({ success: true, message: "Ya tienes acceso a tiendas" });
    return;
  }

  if (!u.secondaryRole) {
    await db.update(usersTable)
      .set({ secondaryRole: "seller" } as any)
      .where(eq(usersTable.id, userId));
  }
  await appendRoleAtomic(userId, "seller");

  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.json({ success: true, user: updated });
});

// ── Driver profile ───────────────────────────────────────────────────────────
// Datos del vehículo. Sin esta fila el panel /transport/driver redirige al
// formulario. La fila se crea con status="pending_verification" y queda a la
// espera de revisión (manual hoy; automatizable después).
router.get("/profile/driver-profile", authenticate, async (req, res): Promise<void> => {
  const [profile] = await db
    .select()
    .from(driverProfilesTable)
    .where(eq(driverProfilesTable.userId, req.user!.id));
  res.json({ profile: profile ?? null });
});

const VEHICLE_TYPES = new Set(["moto", "carro", "camioneta", "grua"]);
// Subtipos válidos por tipo. Hoy sólo "grua" tiene subtipos.
const VEHICLE_SUBTYPES: Record<string, Set<string>> = {
  grua: new Set(["plataforma", "arrastre", "otro"]),
};
const CURRENT_YEAR = new Date().getFullYear();

router.post("/profile/driver-profile", authenticate, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { vehicleType, vehicleSubtype, brand, model, year, color, plate, photoUrl } = req.body ?? {};

  // ── Validación estricta ───────────────────────────────────────────────────
  const typeStr = String(vehicleType ?? "").toLowerCase();
  if (!typeStr || !VEHICLE_TYPES.has(typeStr)) {
    res.status(400).json({ error: "Tipo de vehículo inválido" });
    return;
  }
  const brandStr = String(brand ?? "").trim();
  const modelStr = String(model ?? "").trim();
  const colorStr = String(color ?? "").trim();
  const plateStr = String(plate ?? "").trim().toUpperCase();
  const yearNum  = Number(year);

  if (!brandStr || brandStr.length > 60) { res.status(400).json({ error: "Marca requerida" });  return; }
  if (!modelStr || modelStr.length > 60) { res.status(400).json({ error: "Modelo requerido" }); return; }
  if (!colorStr || colorStr.length > 30) { res.status(400).json({ error: "Color requerido" });  return; }
  if (!plateStr || plateStr.length > 12) { res.status(400).json({ error: "Placa requerida" });  return; }
  if (!Number.isInteger(yearNum) || yearNum < 1980 || yearNum > CURRENT_YEAR + 1) {
    res.status(400).json({ error: "Año inválido" });
    return;
  }

  // Subtipo: requerido cuando el tipo lo soporta (grúa); ignorado en otros casos.
  let subtypeOut: string | null = null;
  if (VEHICLE_SUBTYPES[typeStr]) {
    const sub = String(vehicleSubtype ?? "").toLowerCase().trim();
    if (!sub || !VEHICLE_SUBTYPES[typeStr].has(sub)) {
      res.status(400).json({ error: "Tipo de grúa requerido" });
      return;
    }
    subtypeOut = sub;
  }

  // photoUrl: sólo aceptamos paths internos del bucket (firmados por nuestro
  // /api/storage/uploads/request-url). Esto evita que se persistan URLs
  // externas o arbitrarias inyectadas vía API.
  let photo: string | null = null;
  if (typeof photoUrl === "string" && photoUrl.trim()) {
    const trimmed = photoUrl.trim();
    if (!/^\/objects\/[A-Za-z0-9_\-\/\.]+$/.test(trimmed)) {
      res.status(400).json({ error: "Foto del vehículo inválida" });
      return;
    }
    photo = trimmed;
  }

  // ── Upsert ────────────────────────────────────────────────────────────────
  // Si ya existe (re-edición), actualizamos los datos pero volvemos a poner
  // status=pending_verification (cualquier cambio relevante reinicia revisión).
  const [existing] = await db
    .select()
    .from(driverProfilesTable)
    .where(eq(driverProfilesTable.userId, userId));

  if (existing) {
    const [updated] = await db
      .update(driverProfilesTable)
      .set({
        vehicleType: typeStr,
        vehicleSubtype: subtypeOut,
        brand: brandStr, model: modelStr, year: yearNum,
        color: colorStr, plate: plateStr, photoUrl: photo,
        status: "pending_verification",
      })
      .where(eq(driverProfilesTable.userId, userId))
      .returning();
    res.json({ profile: updated });
    return;
  }

  const [created] = await db
    .insert(driverProfilesTable)
    .values({
      userId,
      vehicleType: typeStr,
      vehicleSubtype: subtypeOut,
      brand: brandStr, model: modelStr, year: yearNum,
      color: colorStr, plate: plateStr, photoUrl: photo,
      status: "pending_verification",
    })
    .returning();
  res.status(201).json({ profile: created });
});

export default router;
