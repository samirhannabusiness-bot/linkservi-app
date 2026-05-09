import { Resend } from "resend";
import { logger } from "./logger";

interface ResendConnectionSettings {
  api_key: string;
  from_email: string;
}

interface ConnectorApiItem {
  settings?: ResendConnectionSettings;
}

interface ConnectorApiResponse {
  items?: ConnectorApiItem[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedResend {
  client: Resend;
  fromEmail: string;
  fetchedAt: number;
}

let _cached: CachedResend | null = null;
let _inflight: Promise<CachedResend | null> | null = null;

function _getReplitToken(): string | null {
  if (process.env.REPL_IDENTITY) return `repl ${process.env.REPL_IDENTITY}`;
  if (process.env.WEB_REPL_RENEWAL) return `depl ${process.env.WEB_REPL_RENEWAL}`;
  return null;
}

async function _fetchConnectionSettings(): Promise<ResendConnectionSettings | null> {
  // Direct env var — works in Cloud Run and any non-Replit environment
  const directKey = process.env.RESEND_API_KEY;
  const directFrom = process.env.RESEND_FROM_EMAIL ?? "noreply@linkservi.com";
  if (directKey) {
    logger.info({ fromEmail: directFrom }, "RESEND — using direct RESEND_API_KEY env var");
    return { api_key: directKey, from_email: directFrom };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = _getReplitToken();
  if (!hostname || !token) {
    logger.warn(
      { hasHostname: !!hostname, hasToken: !!token },
      "RESEND — connector credentials unavailable (REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY missing)",
    );
    return null;
  }

  const url = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
  });
  if (!res.ok) {
    logger.warn({ status: res.status }, "RESEND — connector lookup failed");
    return null;
  }
  const data = (await res.json()) as ConnectorApiResponse;
  const item = data.items?.[0];
  if (!item?.settings?.api_key) {
    logger.warn("RESEND — no Resend connection found in connectors response");
    return null;
  }
  return item.settings;
}

/** Returns a memoized Resend client + the configured from_email, or null if unavailable. */
export async function getResendClient(): Promise<{ client: Resend; fromEmail: string } | null> {
  const now = Date.now();
  if (_cached && now - _cached.fetchedAt < CACHE_TTL_MS) return _cached;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const settings = await _fetchConnectionSettings();
      if (!settings) return null;
      _cached = {
        client: new Resend(settings.api_key),
        fromEmail: settings.from_email,
        fetchedAt: Date.now(),
      };
      return _cached;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

export interface ResendSendArgs {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export interface ResendSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** Sends one email via Resend. Returns ok:false on any failure (caller decides whether to fall back). */
export async function sendViaResend(args: ResendSendArgs): Promise<ResendSendResult> {
  const ctx = await getResendClient();
  if (!ctx) return { ok: false, error: "resend_not_configured" };

  try {
    const { data, error } = await ctx.client.emails.send({
      from: args.from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      replyTo: args.replyTo,
      headers: args.headers,
    });
    if (error) {
      const msg = `${error.name ?? ""}:${error.message ?? ""}`;
      if (_isAuthError(msg)) _cached = null;
      return { ok: false, error: msg };
    }
    return { ok: true, messageId: data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (_isAuthError(msg)) _cached = null;
    return { ok: false, error: msg };
  }
}

function _isAuthError(msg: string): boolean {
  return /api[_ ]?key|unauthor|invalid[_ ]?token|forbidden|401|403/i.test(msg);
}

/** Boot-time probe — logs whether Resend is configured (does NOT send anything). */
export async function verifyResendConnection(): Promise<void> {
  try {
    const ctx = await getResendClient();
    if (ctx) {
      logger.info({ fromEmail: ctx.fromEmail }, "✅ EMAIL — Resend connection ready (primary provider)");
    } else {
      logger.warn("⚠️  EMAIL — Resend NOT configured — falling back to SMTP for all sends");
    }
  } catch (err) {
    logger.warn({ err }, "⚠️  EMAIL — Resend probe threw — falling back to SMTP");
  }
}
