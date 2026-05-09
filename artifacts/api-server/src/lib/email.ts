import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "./logger";
import { db, emailEventsTable } from "@workspace/db";
import { sendViaResend, verifyResendConnection } from "./resend-client";

// Resend (primary): sends from the dedicated transactional address.
// SMTP (fallback): keeps legacy info@linkservi.com because privateemail
// SMTP auth is bound to that mailbox.
const FROM_RESEND = "LinkServi <no-reply@linkservi.com>";
const FROM_SMTP = "LinkServi <info@linkservi.com>";
const REPLY_TO = "soporte@linkservi.com";
const ADMIN_EMAIL = "pagos@linkservi.com";
const TRACKING_BASE = "https://linkservi.com/api/email";

// ── Singleton transport — one SMTP connection, reused across all emails ────────
let _transport: Transporter | null = null;

function getTransport(): Transporter {
  if (_transport) return _transport;
  const pass = process.env.EMAIL_PASSWORD;
  if (!pass) throw new Error("EMAIL_PASSWORD secret not set — add it in Replit Secrets.");
  _transport = nodemailer.createTransport({
    host: "mail.privateemail.com",
    port: 465,
    secure: true,
    auth: { user: "info@linkservi.com", pass },
    pool: true,
    maxConnections: 3,
  });
  return _transport;
}

// ── Verify SMTP on startup ─────────────────────────────────────────────────────
export async function verifySmtpConnection(): Promise<void> {
  try {
    await getTransport().verify();
    logger.info({ host: "mail.privateemail.com", port: 465 }, "✅ EMAIL — SMTP connection verified");
  } catch (err) {
    logger.error({ err }, "❌ EMAIL — SMTP connection FAILED — emails will not send until fixed");
  }
}

// ── Failure rate tracker — detects SMTP outages ───────────────────────────────
const _failures = { count: 0, since: Date.now(), alerted: false };
const FAILURE_THRESHOLD  = 5;
const FAILURE_WINDOW_MS  = 5 * 60 * 1000; // 5 minutes

function _trackFailure(to: string, errMsg: string): void {
  const now = Date.now();
  if (now - _failures.since > FAILURE_WINDOW_MS) {
    _failures.count = 0;
    _failures.since = now;
    _failures.alerted = false;
  }
  _failures.count++;
  logger.warn({ failuresInWindow: _failures.count, threshold: FAILURE_THRESHOLD }, "EMAIL FAILURE tracked");

  if (_failures.count >= FAILURE_THRESHOLD && !_failures.alerted) {
    _failures.alerted = true;
    const count = _failures.count;
    _sendCriticalAlert(count, to, errMsg).catch(e =>
      logger.error({ err: e }, "Critical alert email itself failed"),
    );
  }
}

// Direct send (used for critical alerts) — tries Resend first, falls back to SMTP.
// Bypasses the queue to avoid circular dependency.
async function _directSend(to: string, subject: string, html: string): Promise<void> {
  const headers = { "Reply-To": REPLY_TO, "X-Mailer": "LinkServi v1" };
  const r = await sendViaResend({ from: FROM_RESEND, to, subject, html, replyTo: REPLY_TO, headers });
  if (r.ok) return;
  const transport = getTransport();
  await transport.sendMail({ from: FROM_SMTP, to, subject, html, headers });
}

async function _sendCriticalAlert(failureCount: number, lastTo: string, lastError: string): Promise<void> {
  const ts = new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" });
  const html = wrap("🚨 Alerta Crítica — Sistema de Correos", `
    <h1 style="color:#ef4444;font-size:20px;margin:0 0 16px;font-weight:700;">🚨 Fallos en sistema de correos</h1>
    <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <p style="color:#fca5a5;font-size:15px;font-weight:700;margin:0 0 4px;">${failureCount} correos fallaron en los últimos 5 minutos</p>
      <p style="color:#64748b;font-size:13px;margin:0;">Revisión inmediata requerida</p>
    </div>
    ${[
      ["📅 Timestamp", ts],
      ["📧 Último destinatario", lastTo],
      ["❌ Último error", lastError.slice(0, 120)],
      ["🖥 Servidor SMTP", "mail.privateemail.com:465"],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <span style="color:#64748b;font-size:13px;">${k}</span>
        <span style="color:#e2e8f0;font-size:13px;font-weight:600;word-break:break-all;max-width:60%;text-align:right;">${v}</span>
      </div>`).join("")}
    <p style="color:#64748b;font-size:13px;margin-top:20px;">
      Verifica la contraseña SMTP, la cuota del servidor y la conectividad de red.
    </p>`);
  await _directSend("admin@linkservi.com", "🚨 Alerta: Fallos en sistema de correos — LinkServi", html);
  logger.warn({ failureCount, lastTo }, "🚨 CRITICAL ALERT sent to admin — email system failures detected");
}

// ── A/B Test variant definitions ──────────────────────────────────────────────
// Each emailType can define 2 variants. Callers pass the base content and the
// variant system swaps subject / CTA automatically before enqueueing.
type AbVariant = "A" | "B";

function _pickVariant(): AbVariant {
  return Math.random() < 0.5 ? "A" : "B";
}

// ── In-memory email queue — non-blocking, sequential processing ───────────────
interface QueuedEmail {
  to: string;
  subject: string;
  html: string;
  opts?: { emailType?: string; replyTo?: string; variant?: AbVariant };
  trackingId: string;
}

const _queue: QueuedEmail[] = [];
let _queueRunning = false;

function _enqueue(email: QueuedEmail): void {
  _queue.push(email);
  logger.info({ to: email.to, trackingId: email.trackingId, queueDepth: _queue.length }, "EMAIL QUEUED");
  if (!_queueRunning) _drainQueue();
}

function _drainQueue(): void {
  if (_queueRunning || _queue.length === 0) return;
  _queueRunning = true;
  const next = _queue.shift()!;
  _processWithRetry(next).finally(() => {
    _queueRunning = false;
    if (_queue.length > 0) _drainQueue();
  });
}

async function _processWithRetry(email: QueuedEmail): Promise<void> {
  const MAX_RETRIES = 2;
  const emailType = email.opts?.emailType ?? "unknown";
  const variant   = email.opts?.variant ?? null;
  const replyTo   = email.opts?.replyTo ?? REPLY_TO;
  const headers   = {
    "X-Mailer": "LinkServi v1",
    "X-Priority": "3",
    "List-Unsubscribe": `<mailto:${REPLY_TO}>`,
    "Reply-To": replyTo,
  };

  let lastErr: string = "";
  let lastProvider: "resend" | "smtp" | "none" = "none";

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (attempt > 1) {
      const delayMs = (attempt - 1) * 4000;
      logger.info({ to: email.to, attempt, delayMs, trackingId: email.trackingId }, `EMAIL RETRY #${attempt - 1}`);
      await new Promise(r => setTimeout(r, delayMs));
    }

    // ── Provider 1 (primary): Resend ─────────────────────────────────────────
    const r = await sendViaResend({
      from: FROM_RESEND,
      to: email.to,
      subject: email.subject,
      html: email.html,
      replyTo,
      headers,
    });
    if (r.ok) {
      logger.info(
        { provider: "resend", messageId: r.messageId, to: email.to, trackingId: email.trackingId, emailType, variant, attempt },
        "✅ EMAIL PROCESSED",
      );
      db.insert(emailEventsTable)
        .values({ trackingId: email.trackingId, eventType: "sent", emailType, variant, recipientEmail: email.to, subject: email.subject, metadata: JSON.stringify({ provider: "resend", messageId: r.messageId }) })
        .catch(e => logger.warn({ err: e }, "Failed to log email_sent to DB"));
      return;
    }
    lastProvider = "resend";
    lastErr = r.error ?? "resend_unknown_error";
    logger.warn({ to: email.to, attempt, trackingId: email.trackingId, error: lastErr }, "EMAIL — Resend send failed, falling back to SMTP");

    // ── Provider 2 (fallback): SMTP ──────────────────────────────────────────
    try {
      const transport = getTransport();
      const info = await transport.sendMail({
        from: FROM_SMTP,
        to: email.to,
        subject: email.subject,
        html: email.html,
        headers,
      });
      logger.info(
        { provider: "smtp", messageId: info.messageId, to: email.to, trackingId: email.trackingId, emailType, variant, attempt },
        "✅ EMAIL PROCESSED (via SMTP fallback)",
      );
      db.insert(emailEventsTable)
        .values({ trackingId: email.trackingId, eventType: "sent", emailType, variant, recipientEmail: email.to, subject: email.subject, metadata: JSON.stringify({ provider: "smtp", messageId: info.messageId, fallbackFrom: "resend", resendError: lastErr }) })
        .catch(e => logger.warn({ err: e }, "Failed to log email_sent to DB"));
      return;
    } catch (err) {
      lastProvider = "smtp";
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt <= MAX_RETRIES) {
        logger.warn({ err, to: email.to, attempt, trackingId: email.trackingId }, `EMAIL RETRY #${attempt} — both providers failed, will retry`);
      }
    }
  }

  logger.error(
    { to: email.to, trackingId: email.trackingId, emailType, lastProvider, lastError: lastErr },
    "❌ EMAIL FAILED — all retries exhausted (both Resend and SMTP)",
  );
  db.insert(emailEventsTable)
    .values({ trackingId: email.trackingId, eventType: "failed", emailType, variant, recipientEmail: email.to, subject: email.subject, metadata: JSON.stringify({ error: lastErr, lastProvider }) })
    .catch(() => {});
  _trackFailure(email.to, lastErr);
}

// ── Core send helper — injects tracking, enqueues job ────────────────────────
async function send(
  to: string,
  subject: string,
  html: string,
  opts?: { emailType?: string; replyTo?: string; variant?: AbVariant },
): Promise<void> {
  const trackingId = `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // Inject click tracking for linkservi.com links
  const trackedHtml = html.replace(
    /href="(https?:\/\/linkservi\.com[^"]*)"/g,
    (_, url: string) => `href="${TRACKING_BASE}/click/${trackingId}?redirect=${encodeURIComponent(url)}"`,
  );

  // Inject 1×1 open-tracking pixel before </body>
  const finalHtml = trackedHtml.replace(
    "</body>",
    `<img src="${TRACKING_BASE}/open/${trackingId}" width="1" height="1" style="display:none;border:0;outline:0;" alt="" />\n</body>`,
  );

  _enqueue({ to, subject, html: finalHtml, opts, trackingId });
}

// ── A/B variant builder — returns {subject, ctaLabel, ctaUrl} per variant ────
interface AbConfig {
  subjectA: string;
  subjectB: string;
  ctaLabelA: string;
  ctaLabelB: string;
  ctaUrl: string;
  emailType: string;
}

async function sendAbEmail(
  to: string,
  headerTitle: string,
  body: string,
  cfg: AbConfig,
): Promise<void> {
  const variant  = _pickVariant();
  const subject  = variant === "A" ? cfg.subjectA  : cfg.subjectB;
  const ctaLabel = variant === "A" ? cfg.ctaLabelA : cfg.ctaLabelB;

  const ctaBlock = `
    <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
      <tr><td>
        <a href="${cfg.ctaUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;
                  text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;
                  border-radius:10px;letter-spacing:0.02em;">
          ${ctaLabel}
        </a>
      </td></tr>
    </table>`;

  await send(to, subject, wrap(headerTitle, body + ctaBlock), { emailType: cfg.emailType, variant });
}

// ── Shared HTML wrapper ────────────────────────────────────────────────────────
function wrap(title: string, body: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
      <tr>
        <td style="background:linear-gradient(135deg,#06b6d4,#3b82f6);padding:28px 32px;text-align:center;">
          <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">⚡ LinkServi</span>
          <p style="color:rgba(255,255,255,0.85);margin:10px 0 0;font-size:13px;">${title}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 0;">
          ${body}
        </td>
      </tr>

      <!-- ── Corporate signature ── -->
      <tr>
        <td style="padding:24px 32px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-top:1px solid rgba(255,255,255,0.08);padding-top:22px;">
                <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;font-style:italic;">Atentamente,</p>
                <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#e2e8f0;letter-spacing:-0.2px;">Soporte LinkServi</p>
                <p style="margin:0 0 16px;font-size:12px;color:#64748b;">Una solución de <span style="color:#7dd3fc;font-weight:600;">Tartus Digital Solutions</span></p>
                <table cellpadding="0" cellspacing="0"><tr><td>
                  <a href="https://linkservi.com"
                     style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:9px 22px;border-radius:8px;letter-spacing:0.01em;">
                    Visitar LinkServi →
                  </a>
                </td></tr></table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="background:#0f172a;padding:18px 32px 20px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#475569;font-size:11px;margin:0 0 10px;line-height:1.5;">
            © ${year} LinkServi · Tartus Digital Solutions · Venezuela
          </p>
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
                <p style="color:#94a3b8;font-size:10px;font-weight:700;margin:0 0 7px;text-transform:uppercase;letter-spacing:0.08em;">Contacto</p>
                <p style="color:#64748b;font-size:11px;margin:0;line-height:2;">
                  🛟 Dudas técnicas:
                  <a href="mailto:soporte@linkservi.com" style="color:#38bdf8;text-decoration:none;">soporte@linkservi.com</a>
                  &nbsp;·&nbsp;
                  💳 Reportar pago:
                  <a href="mailto:pagos@linkservi.com" style="color:#38bdf8;text-decoration:none;">pagos@linkservi.com</a>
                  &nbsp;·&nbsp;
                  🤝 Alianzas:
                  <a href="mailto:aliados@linkservi.com" style="color:#38bdf8;text-decoration:none;">aliados@linkservi.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`.trim();
}

// ── Support email constants ────────────────────────────────────────────────────
const SUPPORT_EMAIL = "soporte@linkservi.com";

// ── 0. Welcome email — sent on successful registration ────────────────────────
export async function sendWelcomeEmail(
  toEmail: string,
  toName: string,
  role: string,
): Promise<void> {
  const roleLabel: Record<string, string> = {
    client: "Cliente",
    worker: "Profesional",
    seller: "Vendedor",
    cohost: "Co-anfitrión",
  };
  const roleIcon: Record<string, string> = {
    client: "🔍",
    worker: "💼",
    seller: "🛍️",
    cohost: "🤝",
  };
  const nextStep: Record<string, string> = {
    client: "Ahora puedes buscar profesionales verificados y solicitar servicios con un solo toque.",
    worker: "Completa tu perfil y verifica tu identidad para recibir solicitudes de clientes.",
    seller: "Verifica tu cuenta y empieza a publicar tus productos en ServiMarket.",
    cohost: "Accede a tu panel para gestionar alquileres y reservas.",
  };
  const icon = roleIcon[role] ?? "⚡";
  const label = roleLabel[role] ?? "Usuario";
  const next = nextStep[role] ?? "Explora la plataforma y descubre todo lo que puedes hacer.";

  const body = `
    <h1 style="color:#f1f5f9;font-size:22px;margin:0 0 8px;font-weight:800;">¡Bienvenido a LinkServi, ${toName.split(" ")[0]}! ${icon}</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Tu cuenta como <strong style="color:#e2e8f0;">${label}</strong> fue creada exitosamente.
      Estás a un paso de conectarte con toda Venezuela.
    </p>

    <div style="background:linear-gradient(135deg,rgba(6,182,212,0.1),rgba(59,130,246,0.08));border:1px solid rgba(6,182,212,0.25);border-radius:14px;padding:18px 20px;margin-bottom:24px;">
      <p style="color:#7dd3fc;font-size:12px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.06em;">¿Qué sigue?</p>
      <p style="color:#cbd5e1;font-size:14px;margin:0;line-height:1.6;">${next}</p>
    </div>

    <div style="margin-bottom:24px;">
      ${[
        ["✅ Cuenta creada", "Tu acceso está listo"],
        ["🔒 Plataforma segura", "Pagos y datos protegidos"],
        ["🇻🇪 100% venezolano", "Hecho para tu realidad"],
      ].map(([label, desc]) => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
          <span style="font-size:16px;">${label.split(" ")[0]}</span>
          <div>
            <p style="color:#e2e8f0;font-size:13px;font-weight:600;margin:0;">${label.slice(label.indexOf(" ")+1)}</p>
            <p style="color:#64748b;font-size:12px;margin:2px 0 0;">${desc}</p>
          </div>
        </div>`).join("")}
    </div>

    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="https://linkservi.com" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 44px;border-radius:14px;letter-spacing:0.01em;box-shadow:0 4px 20px rgba(6,182,212,0.4);">
        ⚡ Comenzar ahora →
      </a>
    </td></tr></table>
    <p style="color:#64748b;font-size:12px;margin:20px 0 0;text-align:center;">
      ¿Necesitas ayuda? <a href="mailto:soporte@linkservi.com" style="color:#38bdf8;">soporte@linkservi.com</a>
    </p>`;

  await send(toEmail, `¡Bienvenido a LinkServi, ${toName.split(" ")[0]}! ${icon}`, wrap("Tu cuenta está lista", body), { emailType: "welcome" });
  logger.info({ toEmail, role }, "Welcome email sent");
}

// ── 0.5 Email verification — sent on registration ─────────────────────────────
// The link points to the frontend page /verify-email?token=<raw>, which calls
// the GET /api/auth/verify-email endpoint to mark the account as verified.
export async function sendVerificationEmail(
  toEmail: string,
  toName: string,
  verifyLink: string,
): Promise<void> {
  logger.info({ toEmail }, "Sending email verification");
  const firstName = toName.split(" ")[0];
  const body = `
    <h1 style="color:#f1f5f9;font-size:22px;margin:0 0 12px;font-weight:800;">¡Bienvenido a LinkServi, ${firstName}! ⚡</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Solo falta un paso: confirma tu correo para activar tu cuenta.
    </p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 28px;">
      El enlace es válido por <strong style="color:#e2e8f0;">24 horas</strong> y solo puede usarse una vez.
    </p>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="${verifyLink}" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;">
        Confirmar email →
      </a>
    </td></tr></table>
    <p style="color:#64748b;font-size:11px;margin:20px 0 0;word-break:break-all;">
      Si el botón no funciona: <a href="${verifyLink}" style="color:#38bdf8;">${verifyLink}</a>
    </p>
    <p style="color:#64748b;font-size:11px;margin:12px 0 0;">
      Si no creaste esta cuenta, puedes ignorar este mensaje.
    </p>`;
  await send(toEmail, "Verifica tu cuenta en LinkServi", wrap("Confirma tu correo", body), { emailType: "email_verification" });
}

// ── 1. Password reset ──────────────────────────────────────────────────────────
export async function sendPasswordResetEmail(
  toEmail: string,
  toName: string,
  resetLink: string,
): Promise<void> {
  logger.info({ toEmail }, "Sending password reset email");
  const body = `
    <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 12px;font-weight:700;">¿Olvidaste tu contraseña?</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong style="color:#e2e8f0;">${toName}</strong>, recibimos una solicitud para restablecer tu contraseña en LinkServi.
    </p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 28px;">
      El enlace es válido por <strong style="color:#e2e8f0;">30 minutos</strong> y solo puede usarse una vez.
    </p>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;">
        Restablecer mi contraseña →
      </a>
    </td></tr></table>
    <p style="color:#64748b;font-size:11px;margin:20px 0 0;word-break:break-all;">
      Si el botón no funciona: <a href="${resetLink}" style="color:#38bdf8;">${resetLink}</a>
    </p>
    <p style="color:#64748b;font-size:11px;margin:12px 0 0;">
      Si no solicitaste este cambio, ignora este correo.
    </p>`;
  await send(toEmail, "Restablece tu contraseña — LinkServi", wrap("Recuperación de cuenta", body), { emailType: "password_reset" });
}

// ── 2. Admin alert when user reports a Pago Móvil payment ─────────────────────
export async function sendPaymentReportAlert(opts: {
  userName: string;
  userEmail: string;
  userId: number;
  type: string;
  amount: number;
  reference: string;
}): Promise<void> {
  const label = opts.type === "worker_featured" ? "Profesional Destacado ($1)" : "Empresa Premium ($2)";
  const body = `
    <h1 style="color:#f59e0b;font-size:20px;margin:0 0 12px;font-weight:700;">💰 Nuevo Pago Reportado</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Un usuario acaba de reportar un pago por Pago Móvil. Verifica la referencia y aprueba la suscripción en el panel admin.
    </p>
    ${[
      ["Usuario", opts.userName],
      ["Email", opts.userEmail],
      ["User ID", String(opts.userId)],
      ["Tipo", label],
      ["Monto", `$${opts.amount} USD`],
      ["Referencia", opts.reference],
      ["Fecha", new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" })],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <span style="color:#64748b;font-size:13px;">${k}</span>
        <span style="color:#e2e8f0;font-size:13px;font-weight:600;">${v}</span>
      </div>`).join("")}
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;"><tr><td align="center">
      <a href="https://linkservi.com/admin/jobs/subscriptions" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">
        Ir al Panel Admin →
      </a>
    </td></tr></table>`;
  await send(ADMIN_EMAIL, `⚡ Pago reportado: ${label} — ${opts.userName}`, wrap("Alerta de Pago", body), { emailType: "payment_alert" });
}

// ── 2b. Product order — buyer confirmation + seller alert ─────────────────────
export async function sendProductOrderEmail(opts: {
  buyerEmail: string;
  buyerName: string;
  sellerEmail?: string | null;
  sellerName?: string | null;
  productName: string;
  priceUsd: number;
  orderId: number;
}): Promise<void> {
  const priceStr = `$${opts.priceUsd.toFixed(2)} USD`;

  // ── Buyer confirmation ──
  const buyerBody = `
    <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:800;">🛍 Pedido recibido</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Hola <strong style="color:#e2e8f0;">${opts.buyerName.split(" ")[0]}</strong>,
      tu pedido fue registrado exitosamente. El vendedor revisará tu solicitud pronto.
    </p>
    ${[
      ["📦 Producto", opts.productName],
      ["💵 Precio", priceStr],
      ["🔖 Pedido #", String(opts.orderId)],
      ["📋 Estado", "Pendiente de confirmación"],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:9px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <span style="color:#64748b;font-size:13px;">${k}</span>
        <span style="color:#e2e8f0;font-size:13px;font-weight:600;">${v}</span>
      </div>`).join("")}
    <div style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.2);border-radius:12px;padding:14px 18px;margin:20px 0;">
      <p style="color:#7dd3fc;font-size:13px;margin:0;line-height:1.6;">
        💡 Recibirás una notificación cuando el vendedor confirme o cuando necesites completar el pago.
      </p>
    </div>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="https://linkservi.com/store" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">
        Ver mis pedidos →
      </a>
    </td></tr></table>`;
  await send(opts.buyerEmail, `🛍 Tu pedido #${opts.orderId} fue recibido — LinkServi`, wrap("Confirmación de Pedido", buyerBody), { emailType: "product_order_buyer" }).catch(() => {});

  // ── Seller notification ──
  if (opts.sellerEmail) {
    const sellerBody = `
      <h1 style="color:#f59e0b;font-size:20px;margin:0 0 8px;font-weight:800;">🔔 Nuevo pedido recibido</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Hola <strong style="color:#e2e8f0;">${(opts.sellerName ?? "").split(" ")[0] || "Vendedor"}</strong>,
        tienes un nuevo pedido esperando tu confirmación.
      </p>
      ${[
        ["📦 Producto", opts.productName],
        ["💵 Precio", priceStr],
        ["🛒 Pedido #", String(opts.orderId)],
        ["👤 Comprador", opts.buyerName],
      ].map(([k, v]) => `
        <div style="display:flex;justify-content:space-between;padding:9px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
          <span style="color:#64748b;font-size:13px;">${k}</span>
          <span style="color:#e2e8f0;font-size:13px;font-weight:600;">${v}</span>
        </div>`).join("")}
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;"><tr><td align="center">
        <a href="https://linkservi.com/cohost/orders" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">
          Revisar pedido →
        </a>
      </td></tr></table>`;
    await send(opts.sellerEmail, `🔔 Nuevo pedido: ${opts.productName} — LinkServi`, wrap("Nuevo Pedido", sellerBody), { emailType: "product_order_seller" }).catch(() => {});
  }
}

// ── 2c. New service booking — worker notification ──────────────────────────────
export async function sendNewBookingEmail(opts: {
  workerEmail: string;
  workerName: string;
  clientName: string;
  categoryName: string;
  description: string;
  address: string;
  budgetUsd?: number | null;
  bookingId: number;
  isPremium?: boolean;
}): Promise<void> {
  const budgetStr = opts.budgetUsd ? `$${Number(opts.budgetUsd).toFixed(2)} USD` : "A convenir";
  const priorityBadge = opts.isPremium
    ? `<div style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;margin-bottom:14px;letter-spacing:0.05em;">⭐ ACCESO PRIORITARIO</div>`
    : "";
  const body = `
    ${priorityBadge}
    <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:800;">🔔 Tienes una nueva solicitud</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Hola <strong style="color:#e2e8f0;">${opts.workerName.split(" ")[0]}</strong>,
      un cliente quiere contratarte. Revisa los detalles y acepta rápido para asegurar el trabajo.
    </p>
    ${[
      ["👤 Cliente", opts.clientName],
      ["🔧 Servicio", opts.categoryName],
      ["📍 Dirección", opts.address],
      ["💵 Presupuesto", budgetStr],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:9px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <span style="color:#64748b;font-size:13px;">${k}</span>
        <span style="color:#e2e8f0;font-size:13px;font-weight:600;">${v}</span>
      </div>`).join("")}
    <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:14px 16px;margin:16px 0;">
      <p style="color:#64748b;font-size:12px;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.06em;">Descripción</p>
      <p style="color:#cbd5e1;font-size:14px;margin:0;line-height:1.6;">${opts.description}</p>
    </div>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="https://linkservi.com/professional/bookings" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 32px;border-radius:10px;">
        Ver solicitud y aceptar →
      </a>
    </td></tr></table>
    <p style="color:#64748b;font-size:12px;margin:16px 0 0;text-align:center;">Responde pronto — los clientes eligen al primer profesional que acepta.</p>`;
  await send(opts.workerEmail, `🔔 Nueva solicitud: ${opts.categoryName} — LinkServi`, wrap("Nueva Solicitud de Servicio", body), { emailType: "new_booking" });
}

// ── 2d. Product premium payment alert — internal admin ────────────────────────
export async function sendProductPremiumPaymentAlert(opts: {
  userName: string;
  userEmail: string;
  userId: number;
  productName: string;
  productId: number;
  months: number;
  amountUsd: number;
  pagoMovilRef: string;
  pagoMovilPhone: string;
}): Promise<void> {
  const body = `
    <h1 style="color:#f59e0b;font-size:20px;margin:0 0 12px;font-weight:700;">💎 Nuevo Pago Premium Recibido</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Un co-anfitrión ha enviado un pago para destacar su producto. Verifica la referencia y aprueba en el panel admin.
    </p>
    ${[
      ["👤 Usuario", opts.userName],
      ["📧 Email", opts.userEmail],
      ["🆔 User ID", String(opts.userId)],
      ["📦 Producto", opts.productName],
      ["🆔 Producto ID", String(opts.productId)],
      ["📅 Duración", `${opts.months} ${opts.months === 1 ? "mes" : "meses"}`],
      ["💵 Monto", `$${opts.amountUsd} USD`],
      ["📱 Referencia", opts.pagoMovilRef],
      ["📲 Teléfono", opts.pagoMovilPhone],
      ["🕐 Fecha", new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" })],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <span style="color:#64748b;font-size:13px;">${k}</span>
        <span style="color:#e2e8f0;font-size:13px;font-weight:600;">${v}</span>
      </div>`).join("")}
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;"><tr><td align="center">
      <a href="https://linkservi.com/admin/product-premium" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">
        Revisar y Aprobar →
      </a>
    </td></tr></table>`;
  const subject = `💎 Pago Premium: ${opts.productName} — ${opts.userName}`;
  await Promise.allSettled([
    send(ADMIN_EMAIL, subject, wrap("Alerta de Pago Premium", body), { emailType: "premium_payment_alert" }),
    send("admin@linkservi.com", subject, wrap("Alerta de Pago Premium", body), { emailType: "premium_payment_alert" }),
  ]);
}

// ── 2e. Product premium approved — user notification ─────────────────────────
export async function sendProductPremiumApprovedEmail(opts: {
  toEmail: string;
  toName: string;
  productName: string;
  months: number;
  premiumUntil: Date;
}): Promise<void> {
  const untilStr = opts.premiumUntil.toLocaleDateString("es-VE", {
    day: "numeric", month: "long", year: "numeric", timeZone: "America/Caracas",
  });
  const body = `
    <h1 style="color:#f59e0b;font-size:20px;margin:0 0 8px;font-weight:700;">⭐ ¡Tu producto fue destacado!</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Hola <strong style="color:#e2e8f0;">${opts.toName.split(" ")[0]}</strong>,
      hemos verificado tu pago y tu producto ya aparece como <strong style="color:#fbbf24;">Destacado Premium</strong> en ServiMarket.
    </p>
    ${[
      ["📦 Producto", opts.productName],
      ["📅 Duración", `${opts.months} ${opts.months === 1 ? "mes" : "meses"}`],
      ["⏳ Vigente hasta", untilStr],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:9px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <span style="color:#64748b;font-size:13px;">${k}</span>
        <span style="color:#e2e8f0;font-size:13px;font-weight:600;">${v}</span>
      </div>`).join("")}
    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:14px 18px;margin:20px 0;">
      <p style="color:#fde68a;font-size:13px;font-weight:700;margin:0 0 8px;">Beneficios activos ahora:</p>
      ${["Apareces primero en la sección Destacados", "Borde dorado en tu tarjeta de producto", "2× más visibilidad ante compradores", "Etiqueta ⭐ Premium visible"].map(b =>
        `<p style="color:#fcd34d;font-size:13px;margin:0 0 5px;">✅ ${b}</p>`).join("")}
    </div>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="https://linkservi.com/store" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 32px;border-radius:10px;">
        Ver mi producto destacado →
      </a>
    </td></tr></table>`;
  await send(opts.toEmail, `⭐ Tu producto "${opts.productName}" ya está destacado — LinkServi`, wrap("Producto Destacado Premium", body), { emailType: "premium_approved" });
}

// ── 2f. Product premium rejected — user notification ─────────────────────────
export async function sendProductPremiumRejectedEmail(opts: {
  toEmail: string;
  toName: string;
  productName: string;
  reason?: string | null;
}): Promise<void> {
  const reasonBlock = opts.reason
    ? `<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:14px 18px;margin:16px 0;">
        <p style="color:#f87171;font-size:12px;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Motivo del rechazo</p>
        <p style="color:#fca5a5;font-size:14px;margin:0;line-height:1.6;">${opts.reason}</p>
      </div>`
    : "";
  const body = `
    <h1 style="color:#f87171;font-size:20px;margin:0 0 8px;font-weight:700;">❌ Solicitud Premium rechazada</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong style="color:#e2e8f0;">${opts.toName.split(" ")[0]}</strong>,
      lamentamos informarte que tu solicitud para destacar el producto
      <strong style="color:#e2e8f0;">"${opts.productName}"</strong> fue rechazada.
    </p>
    ${reasonBlock}
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:16px 0;">
      Puedes volver a enviar una solicitud una vez que corrijas el motivo indicado. 
      Si tienes dudas, escríbenos a 
      <a href="mailto:pagos@linkservi.com" style="color:#38bdf8;">pagos@linkservi.com</a>.
    </p>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="https://linkservi.com/cohost/products" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">
        Volver a mis productos →
      </a>
    </td></tr></table>`;
  await send(opts.toEmail, `❌ Solicitud Premium rechazada: "${opts.productName}" — LinkServi`, wrap("Solicitud Rechazada", body), { emailType: "premium_rejected" });
}

// ── 3. User confirmation when admin approves subscription ─────────────────────
export async function sendSubscriptionApprovedEmail(opts: {
  toEmail: string;
  toName: string;
  type: string;
  endDate: Date;
}): Promise<void> {
  const label = opts.type === "worker_featured" ? "Profesional Destacado" : "Empresa Premium";
  const icon  = opts.type === "worker_featured" ? "⚡" : "👑";
  const endStr = opts.endDate.toLocaleDateString("es-VE", {
    day: "numeric", month: "long", year: "numeric", timeZone: "America/Caracas",
  });
  const benefits = opts.type === "worker_featured"
    ? ["Apareces primero en las búsquedas de empleadores", "Etiqueta \"Destacado\" en tu hoja de vida", "Mayor visibilidad durante 30 días"]
    : ["Acceso al teléfono de contacto de todos los candidatos", "Etiqueta \"Empresa Premium\" en tu cuenta", "Contacto directo sin intermediarios por 30 días"];
  const body = `
    <h1 style="color:#10b981;font-size:20px;margin:0 0 8px;font-weight:700;">${icon} ¡Suscripción Activada!</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Hola <strong style="color:#e2e8f0;">${opts.toName}</strong>,<br/>
      confirmamos que tu pago fue verificado y tu suscripción <strong style="color:#e2e8f0;">${label}</strong> ya está activa en LinkServi.
    </p>
    <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="color:#6ee7b7;font-size:13px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Beneficios incluidos</p>
      ${benefits.map(b => `<p style="color:#a7f3d0;font-size:14px;margin:0 0 6px;">✅ ${b}</p>`).join("")}
    </div>
    <p style="color:#64748b;font-size:13px;margin:0 0 20px;">
      Tu suscripción es válida hasta el <strong style="color:#e2e8f0;">${endStr}</strong>.
    </p>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="https://linkservi.com/jobs" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">
        Ir a Buscar Personal →
      </a>
    </td></tr></table>`;
  await send(opts.toEmail, `${icon} Tu suscripción ${label} está activa — LinkServi`, wrap("Confirmación de Suscripción", body), { emailType: "job_subscription" });
}

// ── 8. Support contact — auto-reply to user + forward to support team ──────────
export async function sendSupportContactEmail(opts: {
  toEmail: string;
  toName: string;
  subject: string;
  message: string;
  category?: string;
}): Promise<void> {
  const ticketId = `TKT-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const dateStr = new Date().toLocaleString("es-VE", {
    timeZone: "America/Caracas", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // ── Auto-reply to user ──
  const userBody = `
    <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:700;">🛟 Recibimos tu mensaje</h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong style="color:#e2e8f0;">${opts.toName.split(" ")[0]}</strong>, hemos recibido tu solicitud.
    </p>
    <div style="background:linear-gradient(135deg,rgba(6,182,212,0.15),rgba(59,130,246,0.1));border:1px solid rgba(6,182,212,0.35);border-radius:12px;padding:14px 18px;margin-bottom:20px;text-align:center;">
      <p style="color:#67e8f9;font-size:15px;font-weight:700;margin:0;">⏱ Nuestro equipo te responderá en menos de 24 horas</p>
    </div>
    ${[
      ["🎫 Ticket", ticketId],
      ["📋 Categoría", opts.category ?? "General"],
      ["📅 Recibido", dateStr],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <span style="color:#64748b;font-size:13px;">${k}</span>
        <span style="color:#e2e8f0;font-size:13px;font-weight:600;">${v}</span>
      </div>`).join("")}
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 16px;margin:20px 0;">
      <p style="color:#64748b;font-size:12px;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.06em;">Tu mensaje</p>
      <p style="color:#cbd5e1;font-size:14px;margin:0;line-height:1.7;">${opts.message.replace(/\n/g, "<br/>")}</p>
    </div>
    <div style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.2);border-radius:12px;padding:14px 18px;margin-bottom:20px;">
      <p style="color:#7dd3fc;font-size:13px;margin:0;line-height:1.6;">
        🔒 <strong>Plataforma protegida.</strong> Nunca te pediremos contraseñas ni datos bancarios por correo.
        Si tienes dudas urgentes, escríbenos directamente a
        <a href="mailto:soporte@linkservi.com" style="color:#38bdf8;">soporte@linkservi.com</a>.
      </p>
    </div>
    <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
      <a href="https://linkservi.com" style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;">
        Volver a LinkServi →
      </a>
    </td></tr></table>`;
  await send(opts.toEmail, `🛟 Ticket ${ticketId} recibido — LinkServi Soporte`, wrap("Soporte LinkServi", userBody), {
    emailType: "support_autoreply",
    replyTo: `soporte+${ticketId}@linkservi.com`,
  }).catch(() => {});

  // ── Forward to support team ──
  const teamBody = `
    <h1 style="color:#f59e0b;font-size:20px;margin:0 0 12px;font-weight:700;">📩 Nueva solicitud de soporte</h1>
    ${[
      ["🎫 Ticket", ticketId],
      ["👤 Usuario", opts.toName],
      ["📧 Email", opts.toEmail],
      ["📋 Categoría", opts.category ?? "General"],
      ["📅 Fecha", dateStr],
      ["📝 Asunto", opts.subject],
    ].map(([k, v]) => `
      <div style="display:flex;justify-content:space-between;padding:8px 12px;margin-bottom:4px;background:rgba(255,255,255,0.04);border-radius:8px;">
        <span style="color:#64748b;font-size:13px;">${k}</span>
        <span style="color:#e2e8f0;font-size:13px;font-weight:600;">${v}</span>
      </div>`).join("")}
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 16px;margin:16px 0;">
      <p style="color:#64748b;font-size:12px;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.06em;">Mensaje</p>
      <p style="color:#cbd5e1;font-size:14px;margin:0;line-height:1.7;">${opts.message.replace(/\n/g, "<br/>")}</p>
    </div>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;"><tr><td align="center">
      <a href="mailto:${opts.toEmail}" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 26px;border-radius:10px;">
        Responder a ${opts.toName.split(" ")[0]} →
      </a>
    </td></tr></table>`;
  await send(SUPPORT_EMAIL, `[${ticketId}] ${opts.subject} — ${opts.toName}`, wrap("Nuevo Ticket de Soporte", teamBody), {
    emailType: "support_forward",
    replyTo: opts.toEmail,
  }).catch(() => {});
}

// ── Campaign: Impulse — for ACTIVE users (activity in last 7 days) ────────────
export async function sendImpulseEmail(opts: {
  toEmail: string;
  toName: string;
  role: string;
}): Promise<void> {
  const first = opts.toName.split(" ")[0];
  const isWorker = opts.role === "worker";

  const body = isWorker
    ? `
      <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:700;">⚡ Sigue así, ${first}</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Tu perfil está activo y recibiendo visitas. Asegúrate de que tus servicios y precios estén al día
        para no perder ninguna oportunidad.
      </p>
      <div style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25);border-radius:12px;padding:14px 18px;margin-bottom:20px;">
        <p style="color:#67e8f9;font-size:14px;font-weight:700;margin:0 0 4px;">💡 Consejo del día</p>
        <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">
          Los profesionales con foto de perfil actualizada reciben hasta <strong style="color:#e2e8f0;">3x más solicitudes</strong>.
          ¿La tuya está lista?
        </p>
      </div>`
    : `
      <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:700;">⚡ Estás en racha, ${first}</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Hay nuevos productos y servicios disponibles en tu área. No dejes pasar las mejores ofertas de hoy.
      </p>
      <div style="background:rgba(129,140,248,0.1);border:1px solid rgba(129,140,248,0.25);border-radius:12px;padding:14px 18px;margin-bottom:20px;">
        <p style="color:#a5b4fc;font-size:14px;font-weight:700;margin:0 0 4px;">🛍 Marketplace activo</p>
        <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">
          Nuevas publicaciones esta semana. Compara precios y encuentra lo que necesitas.
        </p>
      </div>`;

  await sendAbEmail(
    opts.toEmail,
    "Tu actividad en LinkServi",
    body,
    {
      emailType: "campaign_impulse",
      ctaUrl: `https://linkservi.com/${isWorker ? "worker/dashboard" : "store"}`,
      subjectA:  isWorker ? `⚡ ${first}, estás recibiendo visitas — revisa tu perfil` : `⚡ ${first}, hay ofertas esperándote hoy`,
      subjectB:  isWorker ? `${first}, tu perfil activo atrae más clientes — mira esto` : `${first}, nuevos productos cerca de ti esta semana`,
      ctaLabelA: isWorker ? "Ver mi perfil →"      : "Ver el marketplace →",
      ctaLabelB: isWorker ? "Actualizar servicios →" : "Explorar ahora →",
    },
  );
}

// ── Campaign: Reactivation — for INACTIVE users (14–60 days without activity) ─
export async function sendReactivationEmail(opts: {
  toEmail: string;
  toName: string;
  role: string;
}): Promise<void> {
  const first = opts.toName.split(" ")[0];
  const isWorker = opts.role === "worker";

  const body = isWorker
    ? `
      <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:700;">👋 Te extrañamos, ${first}</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Hace un tiempo que no actualizas tu perfil. Los clientes siguen buscando profesionales
        en tu categoría — no dejes que otro se lleve esas oportunidades.
      </p>
      <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 18px;margin-bottom:20px;">
        <p style="color:#fcd34d;font-size:14px;font-weight:700;margin:0 0 4px;">🔔 Oportunidades disponibles</p>
        <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">
          Activa tu disponibilidad y vuelve a aparecer en las búsquedas de clientes.
          Solo toma un minuto.
        </p>
      </div>`
    : `
      <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:700;">👋 ¿Todo bien, ${first}?</h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 16px;">
        Llevas un tiempo sin visitar LinkServi. La plataforma ha crecido y hay nuevas
        opciones que quizás te interesan.
      </p>
      <div style="background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:12px;padding:14px 18px;margin-bottom:20px;">
        <p style="color:#6ee7b7;font-size:14px;font-weight:700;margin:0 0 4px;">✨ Novedades en LinkServi</p>
        <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">
          Nuevos profesionales verificados, productos en el marketplace y ahora también alquileres.
          ¡Vuelve y descúbrelo!
        </p>
      </div>`;

  await sendAbEmail(
    opts.toEmail,
    "Te esperamos en LinkServi",
    body,
    {
      emailType: "campaign_reactivation",
      ctaUrl: `https://linkservi.com/${isWorker ? "worker/dashboard" : "search"}`,
      subjectA:  isWorker ? `${first}, tus clientes te están buscando — vuelve a LinkServi` : `${first}, LinkServi creció — mira qué hay nuevo para ti`,
      subjectB:  isWorker ? `👋 ${first}, reactiva tu perfil y recibe solicitudes hoy` : `👋 ${first}, hay servicios nuevos cerca de ti`,
      ctaLabelA: isWorker ? "Reactivar mi perfil →" : "Ver novedades →",
      ctaLabelB: isWorker ? "Volver a LinkServi →"  : "Explorar LinkServi →",
    },
  );
}

// ── Admin collaborator invitation email ───────────────────────────────────────
export async function sendCollaboratorInvitationEmail(opts: {
  toEmail:      string;
  inviterName:  string;
  adminRole:    string;
  inviteUrl:    string;
  expiresHours: number;
  inviteToken?: string;
}): Promise<void> {
  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    soporte:     "Soporte",
    finanzas:    "Finanzas",
    marketing:   "Marketing",
  };
  const roleLabel = roleLabels[opts.adminRole] ?? opts.adminRole;

  const appUrl = process.env.APP_URL ?? "https://linkservi.com";

  // Wrap the CTA link and embed pixel when tracking token is provided
  const ctaUrl    = opts.inviteToken
    ? `${appUrl}/api/email/track/click/${opts.inviteToken}?url=${encodeURIComponent(opts.inviteUrl)}`
    : opts.inviteUrl;
  const pixelHtml = opts.inviteToken
    ? `<img src="${appUrl}/api/email/track/open/${opts.inviteToken}" width="1" height="1" alt="" style="display:block;border:0;"/>`
    : "";

  const body = `
    <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:700;">
      Fuiste invitado al equipo de administración
    </h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 20px;">
      <strong style="color:#f1f5f9;">${opts.inviterName}</strong> te ha invitado a unirte como
      colaborador de <strong style="color:#f1f5f9;">LinkServi</strong> con el rol de
      <strong style="color:#22d3ee;">${roleLabel}</strong>.
    </p>

    <div style="background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.2);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <p style="color:#67e8f9;font-size:13px;font-weight:700;margin:0 0 4px;">
        🛡 Tu rol: ${roleLabel}
      </p>
      <p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.6;">
        Podrás acceder al panel de administración y gestionar las secciones
        correspondientes a tu rol.
      </p>
    </div>

    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:12px 16px;margin-bottom:24px;">
      <p style="color:#fcd34d;font-size:13px;margin:0;line-height:1.6;">
        ⏱ Este enlace expira en <strong>${opts.expiresHours} horas</strong>. Si no lo usas a tiempo,
        pide que te envíen una nueva invitación.
      </p>
    </div>

    <p style="color:#64748b;font-size:13px;margin:0 0 4px;">
      Al aceptar, crearás tu contraseña y activarás tu acceso de forma segura.
    </p>`;

  await send(
    opts.toEmail,
    `${opts.inviterName} te invitó a gestionar LinkServi como ${roleLabel}`,
    wrap("Invitación al equipo administrativo", body + `
      <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
        <tr><td>
          <a href="${ctaUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;
                    text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;
                    border-radius:10px;letter-spacing:0.02em;">
            Aceptar invitación →
          </a>
        </td></tr>
      </table>
      ${pixelHtml}`),
    { emailType: "collaborator_invitation" },
  );
}

// ── Manager (gestor) invitation email — sent by store owner to invitee ────────
export async function sendManagerInvitationEmail(opts: {
  toEmail:              string;
  inviterName:          string;
  storeName:            string;
  commissionPercentage: number;
  inviteUrl:            string;
  expiresHours:         number;
}): Promise<void> {
  const body = `
    <h1 style="color:#f1f5f9;font-size:20px;margin:0 0 8px;font-weight:700;">
      Te invitaron a gestionar un negocio en LinkServi
    </h1>
    <p style="color:#94a3b8;font-size:15px;line-height:1.7;margin:0 0 20px;">
      <strong style="color:#f1f5f9;">${opts.inviterName}</strong> te invitó a ser <strong style="color:#22d3ee;">gestor</strong>
      del negocio <strong style="color:#f1f5f9;">${opts.storeName}</strong>.
    </p>

    <div style="background:rgba(34,211,238,0.08);border:1px solid rgba(34,211,238,0.2);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <p style="color:#67e8f9;font-size:13px;font-weight:700;margin:0 0 8px;">
        ¿Qué puedes hacer como gestor?
      </p>
      <p style="color:#cbd5e1;font-size:13px;margin:0 0 6px;line-height:1.6;">• Atender clientes en chat</p>
      <p style="color:#cbd5e1;font-size:13px;margin:0 0 6px;line-height:1.6;">• Gestionar pedidos y servicios</p>
      <p style="color:#cbd5e1;font-size:13px;margin:0;line-height:1.6;">• Mantener el catálogo actualizado</p>
    </div>

    <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:12px;padding:14px 18px;margin-bottom:20px;">
      <p style="color:#6ee7b7;font-size:13px;font-weight:700;margin:0 0 4px;">
        💰 Comisión acordada: ${opts.commissionPercentage.toFixed(2)}%
      </p>
      <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">
        Sobre las ventas que el negocio genere mientras lo gestiones. Los pagos se hacen automáticamente.
      </p>
    </div>

    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:12px 16px;margin-bottom:24px;">
      <p style="color:#fcd34d;font-size:13px;margin:0;line-height:1.6;">
        ⏱ Este enlace expira en <strong>${opts.expiresHours} horas</strong>.
      </p>
    </div>

    <p style="color:#64748b;font-size:13px;margin:0 0 4px;">
      Si aún no tienes cuenta, podrás crearla en el mismo paso. Si ya tienes una, solo inicia sesión.
    </p>`;

  await send(
    opts.toEmail,
    `${opts.inviterName} te invitó a gestionar ${opts.storeName} en LinkServi`,
    wrap("Invitación de gestor", body + `
      <table cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
        <tr><td>
          <a href="${opts.inviteUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;
                    text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;
                    border-radius:10px;letter-spacing:0.02em;">
            Aceptar y empezar →
          </a>
        </td></tr>
      </table>`),
    { emailType: "manager_invitation" },
  );
}
