import { Router } from "express";
import { db, emailEventsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { authenticate, requireRole } from "../lib/auth";

const router = Router();

// 1×1 transparent GIF — standard tracking pixel
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

// ── Open tracking ─────────────────────────────────────────────────────────────
router.get("/email/open/:trackingId", async (req, res): Promise<void> => {
  const { trackingId } = req.params;

  // Record open event (non-blocking — never delay the pixel response)
  db.insert(emailEventsTable)
    .values({
      trackingId: `${trackingId}-open-${Date.now()}`,
      eventType:      "opened",
      emailType:      "unknown",
      recipientEmail: "",
      subject:        "",
      metadata:       JSON.stringify({ originalTrackingId: trackingId }),
    })
    .catch(err => logger.warn({ err, trackingId }, "Failed to log email_opened event"));

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.end(TRACKING_PIXEL);
});

// ── Click tracking ────────────────────────────────────────────────────────────
router.get("/email/click/:trackingId", async (req, res): Promise<void> => {
  const { trackingId } = req.params;
  const redirectUrl = req.query["redirect"] as string | undefined;

  const safeRedirect = (() => {
    if (!redirectUrl) return "https://linkservi.com";
    try {
      const url = new URL(redirectUrl);
      // Only allow redirects to linkservi.com
      if (url.hostname === "linkservi.com" || url.hostname.endsWith(".linkservi.com")) {
        return url.toString();
      }
      return "https://linkservi.com";
    } catch {
      return "https://linkservi.com";
    }
  })();

  // Record click event (non-blocking — redirect first)
  db.insert(emailEventsTable)
    .values({
      trackingId: `${trackingId}-click-${Date.now()}`,
      eventType:      "clicked",
      emailType:      "unknown",
      recipientEmail: "",
      subject:        "",
      clickedUrl:     safeRedirect,
      metadata:       JSON.stringify({ originalTrackingId: trackingId }),
    })
    .catch(err => logger.warn({ err, trackingId }, "Failed to log email_clicked event"));

  res.redirect(302, safeRedirect);
});

// ── Admin stats — summary of email events ────────────────────────────────────
router.get("/admin/email-stats", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(emailEventsTable)
      .orderBy(emailEventsTable.createdAt)
      .limit(500);

    const grouped: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const type = row.emailType;
      const evt  = row.eventType;
      if (!grouped[type]) grouped[type] = { sent: 0, opened: 0, clicked: 0, failed: 0 };
      grouped[type][evt] = (grouped[type][evt] ?? 0) + 1;
    }

    res.json({ ok: true, stats: grouped, total: rows.length });
  } catch (err) {
    logger.error({ err }, "Failed to fetch email stats");
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

export default router;
