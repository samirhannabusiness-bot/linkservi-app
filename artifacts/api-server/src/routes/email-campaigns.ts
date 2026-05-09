import { Router } from "express";
import { and, gte, lte, ne, sql, eq } from "drizzle-orm";
import { db, usersTable, emailEventsTable } from "@workspace/db";
import { authenticate, requireRole } from "../lib/auth";
import { sendImpulseEmail, sendReactivationEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

// ── Segment boundaries ────────────────────────────────────────────────────────
const ACTIVE_DAYS   = 7;   // updated in last 7 days  → impulse email
const INACTIVE_MIN  = 14;  // no activity for 14 days  → reactivation starts
const INACTIVE_MAX  = 60;  // cap at 60 days (beyond that, user likely churned)
const COOLDOWN_DAYS = 21;  // never send campaign email twice within 21 days

// ── Core campaign runner ──────────────────────────────────────────────────────
export async function runEmailCampaigns(): Promise<{ impulse: number; reactivation: number; skipped: number }> {
  const now      = new Date();
  const ago7d    = new Date(now.getTime() - ACTIVE_DAYS   * 864e5);
  const ago14d   = new Date(now.getTime() - INACTIVE_MIN  * 864e5);
  const ago60d   = new Date(now.getTime() - INACTIVE_MAX  * 864e5);
  const ago21d   = new Date(now.getTime() - COOLDOWN_DAYS * 864e5);

  // Fetch all non-admin users with an email (exclude admin, cohost internal, etc.)
  const candidates = await db
    .select({
      id:        usersTable.id,
      email:     usersTable.email,
      name:      usersTable.name,
      role:      usersTable.role,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(
      and(
        ne(usersTable.role, "admin"),
        gte(usersTable.updatedAt, ago60d),   // ignore fully churned users
      ),
    );

  // Fetch recent campaign events to enforce cooldown
  const recentCampaigns = await db
    .select({ recipientEmail: emailEventsTable.recipientEmail })
    .from(emailEventsTable)
    .where(
      and(
        sql`${emailEventsTable.emailType} IN ('campaign_impulse','campaign_reactivation')`,
        eq(emailEventsTable.eventType, "sent"),
        gte(emailEventsTable.createdAt, ago21d),
      ),
    );

  const recentSet = new Set(recentCampaigns.map(r => r.recipientEmail));

  let impulse = 0, reactivation = 0, skipped = 0;

  for (const user of candidates) {
    if (!user.email || recentSet.has(user.email)) { skipped++; continue; }

    const lastActive = user.updatedAt ?? new Date(0);

    // Active segment — updated within last 7 days
    if (lastActive >= ago7d) {
      sendImpulseEmail({ toEmail: user.email, toName: user.name ?? "Usuario", role: user.role })
        .catch(err => logger.warn({ err, userId: user.id }, "Impulse email failed"));
      impulse++;
      continue;
    }

    // Inactive segment — between 14 and 60 days
    if (lastActive <= ago14d && lastActive >= ago60d) {
      sendReactivationEmail({ toEmail: user.email, toName: user.name ?? "Usuario", role: user.role })
        .catch(err => logger.warn({ err, userId: user.id }, "Reactivation email failed"));
      reactivation++;
      continue;
    }

    skipped++;
  }

  logger.info({ impulse, reactivation, skipped, total: candidates.length }, "📧 Email campaign run completed");
  return { impulse, reactivation, skipped };
}

// ── Admin endpoint: manually trigger campaign ─────────────────────────────────
router.post("/admin/email-campaigns/run", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const result = await runEmailCampaigns();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err }, "Manual campaign run failed");
    res.status(500).json({ error: "Error al ejecutar campaña" });
  }
});

// ── Admin endpoint: A/B stats per emailType and variant ──────────────────────
router.get("/admin/email-ab-stats", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(emailEventsTable)
      .orderBy(emailEventsTable.createdAt)
      .limit(2000);

    // Group by emailType → variant → eventType
    type VariantStats = { sent: number; opened: number; clicked: number; failed: number };
    const grouped: Record<string, Record<string, VariantStats>> = {};

    for (const row of rows) {
      const type    = row.emailType;
      const variant = row.variant ?? "none";
      const evt     = row.eventType as keyof VariantStats;

      if (!grouped[type])          grouped[type] = {};
      if (!grouped[type][variant]) grouped[type][variant] = { sent: 0, opened: 0, clicked: 0, failed: 0 };
      if (evt in grouped[type][variant]) {
        (grouped[type][variant] as Record<string, number>)[evt]++;
      }
    }

    // Compute rates
    const withRates = Object.entries(grouped).map(([emailType, variants]) => ({
      emailType,
      variants: Object.entries(variants).map(([variant, counts]) => {
        const openRate  = counts.sent > 0 ? ((counts.opened  / counts.sent) * 100).toFixed(1) : "0.0";
        const clickRate = counts.sent > 0 ? ((counts.clicked / counts.sent) * 100).toFixed(1) : "0.0";
        return { variant, ...counts, openRate: `${openRate}%`, clickRate: `${clickRate}%` };
      }),
    }));

    res.json({ ok: true, data: withRates, totalEvents: rows.length });
  } catch (err) {
    logger.error({ err }, "Failed to fetch A/B stats");
    res.status(500).json({ error: "Error al obtener estadísticas A/B" });
  }
});

export default router;
