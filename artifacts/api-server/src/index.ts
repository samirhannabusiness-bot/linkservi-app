import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { verifySmtpConnection } from "./lib/email";
import { verifyResendConnection } from "./lib/resend-client";
import { runEmailCampaigns } from "./routes/email-campaigns";
import { initSocketServer } from "./lib/socket";
import { startLegacyWorkerAlertScheduler } from "./lib/legacy-worker-alerts";
import { startImportScheduler } from "./services/import-scheduler";
import { autoExpireAcceptedBookings, autoConfirmFinishedBookings } from "./routes/servicios/bookings";

function isMissingTableError(err: unknown, table: string): boolean {
  const message = String((err as any)?.message ?? err);
  return message.includes(`relation "${table}" does not exist`);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);
initSocketServer(httpServer);

httpServer.listen(port, async () => {
  logger.info({ port }, "Server listening");

  if (!process.env.APP_URL) {
    logger.warn("⚠️ APP_URL not set — using fallback domain");
  }

  verifySmtpConnection();
  verifyResendConnection();

  // ── Daily email campaign scheduler (runs every 24 h) ─────────────────────
  const CAMPAIGN_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const scheduleCampaign = () => {
    setTimeout(async () => {
      try {
        const result = await runEmailCampaigns();
        logger.info(result, "📧 Scheduled email campaign completed");
      } catch (err) {
        logger.error({ err }, "📧 Scheduled email campaign failed");
      }
      scheduleCampaign();
    }, CAMPAIGN_INTERVAL_MS);
  };
  scheduleCampaign();
  logger.info("📧 Email campaign scheduler started — first run in 24 h");

  // ── Legacy /worker sunset alert scheduler ────────────────────────────────
  try {
    startLegacyWorkerAlertScheduler();
  } catch (err) {
    if (!isMissingTableError(err, "legacy_redirects") && !isMissingTableError(err, "system_alerts")) {
      throw err;
    }
    logger.warn({ err }, "Legacy worker alert scheduler skipped");
  }

  // ── Importador automático (auto-sync de catálogos vía URL) ───────────────
  // Cada minuto revisa tiendas con autoSync activo y dispara runImport si
  // el intervalMin configurado ya transcurrió desde lastRunAt.
  try {
    startImportScheduler(60_000);
  } catch (err) {
    if (!isMissingTableError(err, "store_imports") && !isMissingTableError(err, "store_import_runs")) {
      throw err;
    }
    logger.warn({ err }, "Import scheduler skipped");
  }

  // ── Booking lifecycle scheduler (every 60s) ──────────────────────────────
  // - autoExpireAcceptedBookings: cancela solicitudes aceptadas no pagadas (30 min)
  // - autoConfirmFinishedBookings: libera el escrow al profesional si el cliente
  //   no confirmó ni abrió disputa (35 min). El frontend muestra un reloj
  //   regresivo en BookingDetailPage > ConfirmDisputePanel.
  const BOOKING_TICK_MS = 60_000;
  const tickBookings = async () => {
    try { await autoExpireAcceptedBookings(); }
    catch (err) { logger.warn({ err }, "autoExpireAcceptedBookings failed"); }
    try { await autoConfirmFinishedBookings(); }
    catch (err) { logger.warn({ err }, "autoConfirmFinishedBookings failed"); }
  };
  setInterval(tickBookings, BOOKING_TICK_MS);
  logger.info("⏱  Booking lifecycle scheduler started — every 60s (auto-confirm @ 35 min)");
});
