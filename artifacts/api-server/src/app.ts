import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import path from "path";
import router from "./routes";
import seoRouter from "./routes/seo";
import { seoBotMiddleware } from "./lib/seo-bot";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first reverse proxy (Replit's proxy / any load balancer).
// Without this, req.ip = the proxy IP and ALL users share one rate-limit bucket.
// With this, req.ip = the real client IP from X-Forwarded-For.
app.set("trust proxy", 1);

// ── Logging ───────────────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── Security headers (helmet) ──────────────────────────────────────────────────
// CSP disabled — API responses are JSON; CSP on JSON responses doesn't affect
// frontend security and would block legitimate cross-origin requests.
// CORP set to cross-origin so the API is readable across Replit proxy origins.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
  })
);

// ── CORS — permit all Replit-hosted origins + localhost ───────────────────────
// Replit proxy architecture: frontend and API may appear on different subdomains
// in various contexts (workspace preview, deployed app, embedding). We allow all
// Replit-controlled domains. For same-origin requests the Origin header is absent
// and we pass through immediately.
const ALLOWED_ORIGINS: (string | RegExp)[] = [
  // All Replit dev/preview/deployment domains
  /\.replit\.dev$/,
  /\.repl\.co$/,
  /\.replit\.app$/,
  /\.replit\.com$/,
  // Localhost for local dev
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  // Any explicitly configured production domain
  ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header = same-origin or server-to-server — always allow
      if (!origin) return callback(null, true);

      const allowed = ALLOWED_ORIGINS.some((pattern) =>
        typeof pattern === "string" ? pattern === origin : pattern.test(origin)
      );

      if (allowed) {
        callback(null, true);
      } else {
        // Log the blocked origin but do NOT throw — throwing causes Express to
        // return 500 which the browser treats as a network error. Instead,
        // return false so cors sends no ACAO header; the browser enforces the block.
        logger.warn({ origin }, "CORS: blocked request from unrecognized origin");
        callback(null, false);
      }
    },
    credentials: true,
  })
);

// ── Body size limits ──────────────────────────────────────────────────────────
// 500 MB allows large bulk catalog imports from retail chains (Farmatodo,
// Excelsior Gama, CADA, Sams Club, etc.) which can ship CSV/JSON catalogs of
// 100k+ SKUs in a single payload. KYC base64 images and standard JSON bodies
// fit comfortably within this envelope.
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Login es el endpoint más expuesto a fuerza bruta. Lo separamos en dos capas:
//   - loginLimiter: 5 intentos cada 5 min por IP (protege contraseñas)
//   - authRateLimiter: 10 intentos cada 15 min por IP (registro / forgot)
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de inicio de sesión. Espera 5 minutos antes de intentar de nuevo." },
  skip: (req) => process.env.NODE_ENV === "test",
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera 15 minutos antes de intentar de nuevo." },
  skip: (req) => process.env.NODE_ENV === "test",
});

// Lighter limiter for creation/upload endpoints — prevents spam
const createRateLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute window
  max: 20,                   // 20 actions per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Espera un momento antes de continuar." },
  skip: (req) => process.env.NODE_ENV === "test",
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/forgot-password", authRateLimiter);
app.use("/api/auth/register", authRateLimiter);

// Prevent booking/proof spam
app.use("/api/bookings", createRateLimiter);

// SEO routes at root level — /sitemap.xml and /robots.txt served without /api prefix
// so search engines and crawlers can access them directly
app.use("/", seoRouter);

app.use("/api", router);

// Log API errors so production failures show up in Cloud Run logs instead of
// silently returning the default Express "Internal Server Error" page.
const apiErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const cause = (err as { cause?: { message?: string; code?: string; stack?: string } } | null)?.cause;
  const detail = cause?.message || (err as Error)?.message || String(err);
  const code = cause?.code || (err as { code?: string })?.code;
  console.error(`[api error] ${req.method} ${req.originalUrl}:`, detail, code, (err as Error)?.stack, cause?.stack);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal Server Error" });
};
app.use("/api", apiErrorHandler);

// ── Production: serve built Vite frontend ────────────────────────────────────
// In the Docker image the compiled SPA lives at /app/public (copied from
// artifacts/servilink/dist/public during the Docker build).
// All non-/api routes fall through to index.html (SPA client-side routing).
if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(process.cwd(), "public");

  // ── SEO bot middleware ────────────────────────────────────────────────────
  // Crawlers de WhatsApp/Twitter/Facebook/Google no ejecutan JS, así que la SPA
  // no inyecta meta tags a tiempo para mostrar preview con foto/nombre del
  // profesional al compartir un link. Este middleware detecta el user-agent
  // del bot y devuelve un HTML mínimo con og:title, og:description y og:image
  // específicos del recurso. Usuarios reales no se ven afectados.
  app.use(seoBotMiddleware());

  // CRÍTICO: NO cachear archivos HTML — solo archivos hasheados (/assets/*).
  // Cachear index.html con max-age=1y bloqueaba a usuarios en versiones viejas
  // por 1 año porque el navegador no volvía a pedirlo nunca, así que apuntaba
  // a chunks JS antiguos aun después de redeploys. Ahora index.html siempre
  // hace revalidación con el servidor (etag) y los assets hasheados sí se
  // cachean agresivamente (sus nombres cambian con cada build).
  app.use(
    express.static(publicDir, {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          // Vite emite /assets/<name>-<hash>.<ext> — seguro cachear largo plazo.
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          // Iconos, manifest, sw.js, etc. — revalidación corta.
          res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
        }
      },
    }),
  );

  // Fallback SPA: cualquier ruta no-API devuelve index.html SIN caché.
  app.get("{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
