# LinkServi Workspace

## Recent Changes
- **2026-04-28 — Modern checkout (FASE CHECKOUT MODERNO)**: Replaced manual seller acceptance with automatic order acceptance and a new multi-store cart + group checkout flow. Added `order_groups` table; `product_orders` now has `group_id` and `quantity`. New endpoints: `POST/GET /api/order-groups`, `POST /api/order-groups/:id/{submit-proof,confirm-payment,reject-payment}`. The legacy `POST /api/product-orders/:id/accept` is now an idempotent no-op. Canonical statuses (`pending|paid|shipped|delivered|released|cancelled`) are exposed via `statusCanonical` on every order endpoint while keeping legacy `status` intact for backward compat. Frontend additions: cart context (localStorage `linkservi_cart_v1`), `CartButton` + `CartDrawer` mounted in `AppLayout`, `/checkout` route with single-proof upload (with sessionStorage idempotency to prevent duplicate groups on retry). `ClientProductOrdersPage` now shows the prominent "Recibí mi producto" button on shipped orders to release escrow, and the payment panel is shown for `pending` legacy single orders too. `CoHostOrdersPage` no longer has the "Aceptar pedido" button.

## Overview
LinkServi is a comprehensive marketplace for Venezuela, developed by Tartus Digital Solutions. It integrates services, product sales, rentals, and employment opportunities, aiming to connect clients with professionals, facilitate e-commerce and rentals, and provide a robust job board with advanced features for job seekers and employers. The platform enables multi-faceted transactions, including service bookings, product sales, rentals, and transportation services, all within a secure and user-friendly environment.

## User Preferences
I want iterative development.
I prefer detailed explanations.
Do not make changes to the folder `artifacts/api-server/src/routes/admin.ts`.
Do not make changes to the file `artifacts/servilink/src/sw.ts`.

## System Architecture

**Monorepo Structure**: A pnpm workspace monorepo utilizing TypeScript, Node.js 24.

**Backend**:
- **API Framework**: Express 5.
- **Database**: PostgreSQL with Drizzle ORM.
- **Validation**: Zod.
- **API Codegen**: Orval from OpenAPI spec.
- **Build**: esbuild.
- **Object Storage**: Google Cloud Storage for uploads and streaming.
- **Security**: `helmet` for CSP/HSTS, CORS, rate limiting, and robust authentication/authorization.

**Frontend**:
- **Framework**: React with Vite.
- **Styling**: TailwindCSS.
- **UI/UX**: Consistent dark mode with obsidian backgrounds, glassmorphism cards, cyan-blue accents, Inter font, Rule-of-8 spacing, and primary gradient CTAs. Features PWA support, mobile-first design, and micro-interactions.
- **User Roles**: Client, Worker/Professional, Admin, Co-host, Seller, with tailored functionalities and dashboards, including a "Gestor" (Business Manager) role with granular permissions.
- **Monetization**: Platform commission on bookings/rentals, premium worker subscriptions, and store-based marketplace with custom commission splits.
- **Financials**: Withdrawal reserve model with anti-double-spend logic.
- **Profile Management**: Mandatory avatar upload, integrated with social login.
- **Real-time Features**: Chat and notifications with polling mechanisms.
- **Location Services**: Mapbox GL JS for interactive dark maps, supporting proximity search for workers, product locations, and real-time driver tracking for transportation services.
- **Worker Management**: Badges, trust scores, dynamic pricing, service menus, "Before" and "After" photo uploads.
- **Payment Processing**: Platform-first protection with multi-step verification for local Venezuelan methods (Pago Móvil, Zelle, PayPal, Transferencia) and proof upload.
- **Identity Verification (KYC Universal)**: Bidirectional verification for all roles with a "Selfie-Fast" UX, utilizing Gemini Vision for auto-KYC with manual review fallback.
- **Referral System**: User-specific referral codes.
- **Negotiation**: Workers can propose counter-offers.
- **Quote Request (Inquiry Bookings)**: Clients request quotes, workers send offers.
- **Conversations**: WhatsApp-style list of bookings with chat contact filters.
- **ServiRent Module**: Integrated rental listing support within the product system for various sub-types (tool, vehicle, property, experience).
- **ProductMap**: GeoJSON native clustering, HTML price-bubble markers, smart initial zoom, location FAB, and popup cards.
- **Co-Host Team Invite System**: Full invite link system for co-host team management.
- **Sistema de Gestores (Business Managers)**: A cohost or admin can invite managers per store via email to operate the business on their behalf, with granular permissions and dedicated tables. Users can switch between Client, Professional, and Manager modes. Includes access validation helpers and data redaction for non-owned stores.
- **Instant Store V1 (Bulk Product Import)**: One-step CSV/XLSX bulk product import for cohosts and sellers with upsert logic, error logging, and a 10-minute stale-run watchdog.
- **Admin Role System**: Sub-roles (super_admin, soporte, finanzas) with granular access control and collaborator management.
- **Authentication**: JWT stored in localStorage, extended for Socket.io authorization.
- **Global Search (geo-aware)**: Unified search across products, workers, stores, job_profiles with parallel execution, proximity ranking, and premium sorting, featuring autocomplete.
- **LinkServi Instant Store™ (Enterprise Importer)**: Bulk catalog importer with auto-mapping from file upload, URL, and Google Sheets, featuring auto-sync capabilities.
- **Métricas de Gestor + Evento "Primera Venta"**: Business manager summary metrics per store with a "first sale" celebration banner.
- **Delivery On Demand (Uber-style)**: System for clients to request delivery for marketplace products, matching nearest drivers with push notifications and a first-accept-wins model.
- **Geolocalización Transporte V1 (Rideshare)**: Marketplace for passenger transport with real-time driver locations, ride requests, atomic acceptance, compare-and-set status updates, and Socket.io-based real-time communication with room-based authorization. Includes C2P monetization, ratings, and in-ride chat.
- **Sistema Multi-Modo (Cliente / Profesional / Gestor / Conductor) — UX Final**: Single source of truth in `artifacts/servilink/src/lib/mode-meta.ts` for consistent mode-specific styling and routing. Features `ModeSwitch` in header and `Mode Indicator` in sidebar. Total menu separation enforced per mode.
- **Marketplace Escalable (FASE 2 — `/store`)**: Server-side filtering & sorting moved into `GET /api/products` (params: `q`, `priceMin/Max`, `delivery`, `condition`, `subType`, `minRating`, `sort`, `page`, `limit`); the frontend only presents. Real pagination (`?page=N&limit=24`) with infinite scroll backed by `@tanstack/react-virtual` (`useWindowVirtualizer`) — only visible rows are rendered, dramatically lowering DOM cost for large catalogs. `view=map` keeps the legacy single-shot fetch (needs all pins). Search input is debounced 300 ms; `reqIdRef` discards stale responses on rapid filter changes. Product/store images use `loading="lazy" decoding="async"`.

**Sync Agent (Distribución Windows)**:
- A standalone Windows program (`sync-agent/`) for merchants to synchronize their SAINT database (SQL Server / Firebird) with the LinkServi API.
- **Packaging**: `@yao-pkg/pkg` cross-compiles to a single `.exe` (Node.js + UI + assets embedded).
- **Installer**: NSIS generates a bilingual installer with optional "Start with Windows" and desktop shortcut. The compiled `.exe` is served from `artifacts/servilink/public/downloads/` and linked from `IntegrationsPage.tsx` and the API endpoint.
- **Runtime Paths**: Detects `process.pkg` for config and logs in `%LOCALAPPDATA%`.
- **Plug & Play UX (FASE FINAL)**:
  - **Welcome screen**: Shown on first run; "Empezar configuración" CTA. Dismissal persisted in `localStorage`.
  - **3-step wizard**: (1) API Key validation, (2) DB connection with auto-detect, (3) Activation with health checks.
  - **DB auto-detect**: `db-detect.js` does parallel TCP probes to common SQL Server hosts/ports; exposed via `GET /api/db/detect`.
  - **Auto-activation**: When config transitions invalid→valid (after wizard save), the agent awaits `reconnectSaint()` then fires the first sync automatically — no manual click needed. Same flow on agent startup if `validateRuntimeConfig` is already valid.
  - **Wizard guard**: A `wizardActive` flag prevents `decideScreen()` from skipping the user past step 3 once the config becomes complete mid-wizard.
  - **Simple-by-default dashboard**: 4 KPIs (state / products / last sync / next sync), giant "SINCRONIZAR AHORA" CTA, recent errors box (max 3), with the field-mapping/advanced section collapsed.
  - **Human error messages**: `error-mapper.js` normalizes ECONNREFUSED, login failures, 401, fetch errors and surfaces user-readable Spanish copy.
  - **Pre-activation validation**: `validateRuntimeConfig` blocks activation if API key, host, database, user, OR password is missing (prevents auto-activation from failing on auth).

## External Dependencies

- **Database**: PostgreSQL
- **Object Storage**: Google Cloud Storage
- **Payment Methods**: Pago Móvil, Zelle, PayPal, Transferencia (manual)
- **Mapping**: Mapbox GL JS
- **Auto-KYC**: Gemini Vision via Replit AI Integrations
- **Email**: Resend (primary) with SMTP fallback (privateemail.com)
- **Push Notifications**: Web Push API (VAPID)