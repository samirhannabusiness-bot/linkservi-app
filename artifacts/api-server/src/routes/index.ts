import { Router, type IRouter } from "express";

// ── Shared / Platform ─────────────────────────────────────────────────────────
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import configRouter from "./config";
import categoriesRouter from "./categories";
import notificationsRouter from "./notifications";
import profileRouter from "./profile";
import referralRouter from "./referral";
import supportRouter from "./support";
import emailTrackingRouter from "./email-tracking";
import emailCampaignsRouter from "./email-campaigns";
import pushRouter from "./push";
import withdrawalsRouter from "./withdrawals";
import walletRouter from "./wallet";
import premiumRequestsRouter from "./premium-requests";
import clientPremiumRouter from "./client-premium";
import disputesRouter from "./disputes";
import bcvRouter from "./bcv";
import reportsRouter from "./reports";
import passkeysRouter from "./passkeys";
import analyticsRouter from "./analytics";
import adminRouter from "./admin";
import adminMetricsRouter from "./admin-metrics";
import adminCollaboratorsRouter from "./admin-collaborators";
import adminIntelligenceRouter from "./admin-intelligence";
import adminDriversRouter from "./admin-drivers";
import verificationsRouter from "./verifications";
import eventsRouter from "./events";

// ── Dominio: Servicios ────────────────────────────────────────────────────────
import {
  workersRouter,
  bookingsRouter,
  urgentRouter,
  chatRouter,
  reviewsRouter,
  warrantiesRouter,
  workerServicesRouter,
  servicePhotosRouter,
  clientRatingsRouter,
} from "./servicios";

// ── Dominio: Marketplace ──────────────────────────────────────────────────────
import {
  storesRouter,
  productsRouter,
  productOrdersRouter,
  orderGroupsRouter,
  storeMessagesRouter,
  customOrdersRouter,
  cohostRouter,
  cohostPlansRouter,
  favoritesRouter,
  adminProductPremiumRouter,
} from "./marketplace";

// ── Dominio: Empleo ───────────────────────────────────────────────────────────
import {
  jobsRouter,
  jobChatRouter,
} from "./empleo";

// ── Dominio: Alquileres ───────────────────────────────────────────────────────
import {
  adminRentalsRouter,
} from "./alquileres";

// ── Dominio: Delivery On Demand ───────────────────────────────────────────────
import { deliveryRouter } from "./delivery";

// ── Dominio: Transporte (rideshare V1) ────────────────────────────────────────
import transportRouter from "./transport";

// ── Pagos — BDV Conciliación ──────────────────────────────────────────────────
import bdvConciliacionRouter from "./bdv-conciliacion";
import bdvPaymentsRouter from "./bdv-payments";

// ── Blog + SEO ────────────────────────────────────────────────────────────────
import blogRouter from "./blog";
import seoRouter from "./seo";

// ── Búsqueda Global ───────────────────────────────────────────────────────────
import searchRouter from "./search";

// ── Instant Store: importador de catálogos ───────────────────────────────────
import importsRouter from "./imports";

// ── Gestores (managers): invitación + dashboard ──────────────────────────────
import managersRouter from "./managers";

// ── Integraciones (Sync Agent SAINT — UI + mock backend) ─────────────────────
import integrationsRouter from "./integrations";
import integrationsAgentRouter from "./integrations-agent";

const router: IRouter = Router();

// Shared / Platform
router.use(healthRouter);
router.use(storageRouter);
router.use(configRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(notificationsRouter);
router.use(profileRouter);
router.use(adminDriversRouter);
router.use(referralRouter);
router.use(supportRouter);
router.use(emailTrackingRouter);
router.use(emailCampaignsRouter);
router.use(pushRouter);
router.use(withdrawalsRouter);
router.use(walletRouter);
router.use(premiumRequestsRouter);
router.use(clientPremiumRouter);
router.use(disputesRouter);
router.use(bcvRouter);
router.use(reportsRouter);
router.use(passkeysRouter);
router.use(analyticsRouter);
router.use(adminRouter);
router.use(adminMetricsRouter);
router.use(adminCollaboratorsRouter);
router.use(adminIntelligenceRouter);
router.use(verificationsRouter);
router.use(eventsRouter);

// Servicios
router.use(workersRouter);
router.use(bookingsRouter);
router.use(urgentRouter);
router.use(chatRouter);
router.use(reviewsRouter);
router.use(warrantiesRouter);
router.use(workerServicesRouter);
router.use(servicePhotosRouter);
router.use(clientRatingsRouter);

// Marketplace
router.use(storesRouter);
router.use(productsRouter);
router.use(productOrdersRouter);
router.use(orderGroupsRouter);
router.use("/store-messages", storeMessagesRouter);
router.use(customOrdersRouter);
router.use(cohostRouter);
router.use(cohostPlansRouter);
router.use(managersRouter);

// ── Telemetría: tracking de redirects legacy /worker → /professional ─────────
import logsRouter from "./logs";
router.use(logsRouter);
router.use(favoritesRouter);
router.use(adminProductPremiumRouter);

// Empleo
router.use(jobsRouter);
router.use(jobChatRouter);

// Alquileres
router.use(adminRentalsRouter);

// Delivery On Demand
router.use(deliveryRouter);

// Transporte (rideshare V1) — heartbeat + drivers nearby + rides
router.use(transportRouter);

// Pagos — BDV Conciliación + C2P + Webhook
router.use(bdvConciliacionRouter);
router.use(bdvPaymentsRouter);

// Blog + SEO
router.use(blogRouter);
router.use(seoRouter);

// Búsqueda Global
router.use(searchRouter);

// Instant Store importer
router.use(importsRouter);

// Integraciones — Sync Agent SAINT
router.use(integrationsRouter);
router.use(integrationsAgentRouter);

export default router;
