# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Builder
# Installs all dependencies, compiles the API server (esbuild) and builds the
# Vite frontend (React SPA).
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Copy workspace manifests first so Docker caches the install layer.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy every package.json in the monorepo (needed before pnpm install).
COPY lib/db/package.json                    ./lib/db/
COPY lib/api-zod/package.json               ./lib/api-zod/
COPY lib/api-spec/package.json              ./lib/api-spec/
COPY lib/api-client-react/package.json      ./lib/api-client-react/
COPY lib/object-storage-web/package.json    ./lib/object-storage-web/
COPY artifacts/api-server/package.json      ./artifacts/api-server/
COPY artifacts/servilink/package.json       ./artifacts/servilink/

# Install all dependencies (dev + prod).
RUN pnpm install --frozen-lockfile

# Copy all source code.
COPY lib/                   ./lib/
COPY artifacts/api-server/  ./artifacts/api-server/
COPY artifacts/servilink/   ./artifacts/servilink/

# --- Build API server (esbuild → single ESM bundle) ---
RUN pnpm --filter @workspace/api-server run build

# --- Build Vite frontend ---
# BASE_PATH=/ means the SPA is served from the root in production.
ENV BASE_PATH=/
ENV PORT=8080
ENV NODE_ENV=production

# VITE_* variables are baked into the JS bundle at build time.
# They must be passed as --build-arg from cloudbuild.yaml (not as runtime env vars).
ARG VITE_GOOGLE_MAPS_API_KEY=""
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ARG VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

RUN pnpm --filter @workspace/servilink run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Runner
# Lean production image. Only runtime node_modules are copied; the entire
# source tree is left behind.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# --- Workspace manifests (needed for pnpm to resolve workspace links) ---
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

COPY lib/db/package.json                    ./lib/db/
COPY lib/api-zod/package.json               ./lib/api-zod/
COPY lib/api-spec/package.json              ./lib/api-spec/
COPY lib/api-client-react/package.json      ./lib/api-client-react/
COPY lib/object-storage-web/package.json    ./lib/object-storage-web/
COPY artifacts/api-server/package.json      ./artifacts/api-server/
COPY artifacts/servilink/package.json       ./artifacts/servilink/

# Install only production dependencies.
RUN pnpm install --frozen-lockfile --prod

# --- Copy build artefacts ---
# API server bundle
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
# Built frontend — served as static files from /app/public
COPY --from=builder /app/artifacts/servilink/dist/public ./public

# --- Runtime environment ---
ENV NODE_ENV=production
# Bypass Google Cloud SQL self-signed certificate (same fix applied in dev).
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
# Cloud Run injects PORT automatically; default to 8080.
ENV PORT=8080

EXPOSE 8080

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
