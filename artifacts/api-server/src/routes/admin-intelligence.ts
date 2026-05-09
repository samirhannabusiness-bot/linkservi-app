import { Router } from "express";
import { db, bookingsTable, usersTable } from "@workspace/db";
import { eq, and, sql, count } from "drizzle-orm";
import { authenticate, requireRole } from "../lib/auth";
import { logger } from "../lib/logger";
import nodemailer from "nodemailer";

const router = Router();

const ADMIN_EMAIL = "admin@servilink.com";
const FROM_EMAIL  = "LinkServi <info@linkservi.com>";

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#1e293b;border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(135deg,#06b6d4,#6366f1);padding:28px 32px;text-align:center;">
          <span style="font-size:22px;font-weight:900;color:#fff;">⚡ LinkServi</span>
          <p style="color:rgba(255,255,255,0.85);margin:10px 0 0;font-size:13px;">${title}</p>
        </td>
      </tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr>
        <td style="background:#0f172a;padding:18px 32px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#475569;font-size:11px;margin:0;">© ${new Date().getFullYear()} LinkServi · Tartus Digital Solutions · Venezuela</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function stat(label: string, value: string, color = "#e2e8f0"): string {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:10px;margin-bottom:8px;">
    <span style="color:#94a3b8;font-size:13px;">${label}</span>
    <span style="color:${color};font-size:14px;font-weight:700;">${value}</span>
  </div>`;
}

function alertBox(icon: string, msg: string, color: string): string {
  return `<div style="background:${color}11;border:1px solid ${color}44;border-radius:10px;padding:12px 16px;margin-bottom:10px;display:flex;align-items:flex-start;gap:10px;">
    <span style="font-size:18px;">${icon}</span>
    <span style="color:${color};font-size:13px;font-weight:600;">${msg}</span>
  </div>`;
}

function fmtUSD(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

async function getTransport() {
  const pass = process.env.EMAIL_PASSWORD;
  if (!pass) throw new Error("EMAIL_PASSWORD not set");
  return nodemailer.createTransport({
    host: "mail.privateemail.com",
    port: 465,
    secure: true,
    auth: { user: "info@linkservi.com", pass },
  });
}

// ── POST /api/admin/intelligence/send-alert ───────────────────────────────────
// Manually (or auto) triggered: sends current metrics snapshot to admin email
router.post(
  "/admin/intelligence/send-alert",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { payload } = req.body as {
      payload: {
        today: number;
        todayComm: number;
        thisWeek: number;
        revenueYesterday: number;
        openDisputes: number;
        pendingWithdrawals: number;
        pendingVerifications: number;
        totalUsers: number;
        suggestions: string[];
        alertType: string;
      };
    };

    if (!payload) {
      res.status(400).json({ error: "payload required" });
      return;
    }

    const ts = new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" });
    const todayVsYesterday = payload.revenueYesterday > 0
      ? ((payload.today - payload.revenueYesterday) / payload.revenueYesterday * 100).toFixed(1)
      : null;
    const pctStr = todayVsYesterday !== null
      ? (Number(todayVsYesterday) >= 0 ? `+${todayVsYesterday}%` : `${todayVsYesterday}%`)
      : "N/D";
    const pctColor = todayVsYesterday !== null && Number(todayVsYesterday) < 0 ? "#f87171" : "#34d399";

    const alertTypeLabels: Record<string, string> = {
      manual:       "Reporte manual solicitado",
      revenue_drop: "⚠️ Caída de ingresos detectada",
      high_disputes:"🔴 Alto número de disputas",
      low_activity: "🔇 Baja actividad en la plataforma",
    };

    const alertsHtml = payload.suggestions.map(s => {
      const isWarning = s.startsWith("⚠️") || s.startsWith("🔴") || s.startsWith("↓");
      const isInfo    = s.startsWith("💡") || s.startsWith("📈") || s.startsWith("🚀");
      const color     = isWarning ? "#f87171" : isInfo ? "#34d399" : "#93c5fd";
      const icon      = isWarning ? "⚠️" : isInfo ? "💡" : "📊";
      return alertBox(icon, s, color);
    }).join("") || alertBox("📊", "Sin sugerencias activas en este momento.", "#93c5fd");

    const html = wrap(
      alertTypeLabels[payload.alertType] ?? "Alerta del panel inteligente",
      `
      <h2 style="color:#e2e8f0;font-size:18px;font-weight:800;margin:0 0 6px;">Panel de Inteligencia — LinkServi</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 24px;">${ts}</p>

      <p style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px;">Métricas clave</p>
      ${stat("Ingresos hoy", fmtUSD(payload.today), pctColor)}
      ${stat("Vs. ayer", `${fmtUSD(payload.revenueYesterday)} (${pctStr})`, pctColor)}
      ${stat("Esta semana", fmtUSD(payload.thisWeek))}
      ${stat("Comisiones hoy", fmtUSD(payload.todayComm), "#a5b4fc")}
      ${stat("Usuarios totales", String(payload.totalUsers))}

      <div style="margin:20px 0 10px;border-top:1px solid rgba(255,255,255,0.07);padding-top:18px;">
        <p style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px;">Riesgo operativo</p>
        ${payload.openDisputes > 0 ? stat("Disputas activas", String(payload.openDisputes), "#f87171") : ""}
        ${payload.pendingWithdrawals > 0 ? stat("Retiros pendientes", String(payload.pendingWithdrawals), "#fbbf24") : ""}
        ${payload.pendingVerifications > 0 ? stat("KYC pendientes", String(payload.pendingVerifications), "#fbbf24") : ""}
        ${payload.openDisputes === 0 && payload.pendingWithdrawals === 0 && payload.pendingVerifications === 0
          ? `<p style="color:#34d399;font-size:13px;font-weight:600;">✅ Sin riesgos operativos activos</p>`
          : ""}
      </div>

      <div style="margin:20px 0 10px;border-top:1px solid rgba(255,255,255,0.07);padding-top:18px;">
        <p style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px;">Sugerencias IA</p>
        ${alertsHtml}
      </div>

      <div style="margin-top:24px;text-align:center;">
        <a href="https://linkservi.com/admin"
           style="display:inline-block;background:linear-gradient(135deg,#6366f1,#06b6d4);color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:12px 28px;border-radius:10px;">
          Ir al Panel de Admin →
        </a>
      </div>`,
    );

    try {
      const transport = await getTransport();
      await transport.sendMail({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: `📊 Alerta LinkServi — ${alertTypeLabels[payload.alertType] ?? "Reporte"} — ${ts}`,
        html,
      });
      logger.info({ alertType: payload.alertType }, "Intelligence alert email sent");
      res.json({ ok: true, sentTo: ADMIN_EMAIL });
    } catch (err) {
      logger.error({ err }, "Failed to send intelligence alert email");
      res.status(500).json({ error: "Email send failed", detail: String(err) });
    }
  },
);

export default router;
