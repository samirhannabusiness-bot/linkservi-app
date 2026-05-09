/**
 * Sistema de reportes PDF — nivel corporativo
 * GET /api/admin/reports/pdf?range=today|yesterday|this_week|this_month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
import { Router } from "express";
import PDFDocument from "pdfkit";
import { db, usersTable, workersTable, bookingsTable, storesTable, storeWithdrawalsTable, productsTable, actionLogsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count, sum, inArray, desc } from "drizzle-orm";
import { authenticate, requireRole, getEffectiveAdminRole } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg:        "#0a0f1e",
  primary:   "#6366f1",   // indigo
  cyan:      "#06b6d4",
  green:     "#10b981",
  red:       "#ef4444",
  amber:     "#f59e0b",
  purple:    "#a78bfa",
  textDark:  "#1e293b",
  textMid:   "#475569",
  textLight: "#94a3b8",
  white:     "#ffffff",
  border:    "#e2e8f0",
  rowAlt:    "#f8fafc",
};

// ── Date range helpers ────────────────────────────────────────────────────────

function parseRange(range: string, from?: string, to?: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  switch (range) {
    case "today":
      return { from: today, to: tomorrow, label: "Hoy" };
    case "yesterday": {
      const y = new Date(today); y.setDate(today.getDate() - 1);
      return { from: y, to: today, label: "Ayer" };
    }
    case "this_week": {
      const w = new Date(today); w.setDate(today.getDate() - today.getDay());
      return { from: w, to: tomorrow, label: "Esta semana" };
    }
    case "this_month": {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: m, to: tomorrow, label: "Este mes" };
    }
    case "custom": {
      if (!from || !to) throw new Error("Rango personalizado requiere 'from' y 'to'");
      const f = new Date(from); const t = new Date(to); t.setDate(t.getDate() + 1);
      const label = `${fmtDate(new Date(from))} — ${fmtDate(new Date(to))}`;
      return { from: f, to: t, label };
    }
    default:
      throw new Error(`Rango inválido: ${range}`);
  }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Role permission map ───────────────────────────────────────────────────────

const ROLE_SECTIONS: Record<string, string[]> = {
  super_admin: ["summary", "channels", "activity", "transactions", "alerts", "top_performance"],
  finanzas:    ["summary", "channels", "alerts_financial"],
  soporte:     ["activity", "alerts_disputes"],
  marketing:   ["activity", "top_performance", "growth"],
};

function getRoleSections(adminRole: string): string[] {
  return ROLE_SECTIONS[adminRole] ?? ROLE_SECTIONS["soporte"];
}

function canSee(sections: string[], key: string): boolean {
  return sections.includes(key) || sections.includes("summary") && key.startsWith("summary");
}

// ── Data fetcher ──────────────────────────────────────────────────────────────

async function fetchReportData(from: Date, to: Date, sections: string[]) {
  const showAll    = sections.includes("summary");
  const showFin    = showAll || sections.includes("channels") || sections.includes("alerts_financial");
  const showAct    = showAll || sections.includes("activity") || sections.includes("growth");
  const showAlerts = showAll || sections.includes("alerts_disputes") || sections.includes("alerts_financial");
  const showTop    = showAll || sections.includes("top_performance");
  const showTx     = showAll || sections.includes("transactions");

  const [totalUsersRes] = await db.select({ count: count() }).from(usersTable);
  const [totalWorkersRes] = await db.select({ count: count() }).from(workersTable);

  // Revenue in range (services)
  const [revenueRes] = await db
    .select({ total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)` })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt} >= ${from}`,
      sql`${bookingsTable.completedAt} < ${to}`,
    ));

  const [commRes] = await db
    .select({ total: sql<string>`COALESCE(SUM(COALESCE(${bookingsTable.commission}, ${bookingsTable.totalAmount} * 0.10)), 0)` })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt} >= ${from}`,
      sql`${bookingsTable.completedAt} < ${to}`,
    ));

  const [txCountRes] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt} >= ${from}`,
      sql`${bookingsTable.completedAt} < ${to}`,
    ));

  // Prior period for growth calculation
  const duration = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - duration);
  const [prevRevRes] = await db
    .select({ total: sql<string>`COALESCE(SUM(${bookingsTable.totalAmount}), 0)` })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt} >= ${prevFrom}`,
      sql`${bookingsTable.completedAt} < ${from}`,
    ));

  const prevRev = Number(prevRevRes?.total ?? 0);
  const curRev  = Number(revenueRes?.total ?? 0);
  const growth  = prevRev === 0 ? (curRev > 0 ? 100 : 0) : +((curRev - prevRev) / prevRev * 100).toFixed(1);

  // Activity
  const [completedRes] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(and(
      eq(bookingsTable.status, "completed"),
      sql`${bookingsTable.completedAt} >= ${from}`,
      sql`${bookingsTable.completedAt} < ${to}`,
    ));

  const [activeBookRes] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(inArray(bookingsTable.status, ["accepted", "in_progress"]));

  // Alerts
  const [disputesRes] = await db
    .select({ count: count() })
    .from(bookingsTable)
    .where(inArray(bookingsTable.status, ["disputed", "dispute_in_review"]));

  const [pendingWithdRes] = await db
    .select({ count: count() })
    .from(storeWithdrawalsTable)
    .where(eq(storeWithdrawalsTable.status, "pending"));

  const [pendingKycRes] = await db
    .select({ count: count() })
    .from(workersTable)
    .where(eq(workersTable.verificationStatus, "pending"));

  // Transactions table (last 15 in range)
  const txRows = showTx ? await db
    .select({
      id: bookingsTable.id,
      completedAt: bookingsTable.completedAt,
      totalAmount: bookingsTable.totalAmount,
      status: bookingsTable.status,
    })
    .from(bookingsTable)
    .where(and(
      sql`${bookingsTable.completedAt} >= ${from}`,
      sql`${bookingsTable.completedAt} < ${to}`,
    ))
    .orderBy(desc(bookingsTable.completedAt))
    .limit(15) : [];

  // Top workers
  const topWorkers = showTop ? await db
    .select({ user: usersTable, worker: workersTable })
    .from(workersTable)
    .innerJoin(usersTable, eq(workersTable.userId, usersTable.id))
    .where(eq(workersTable.isVerified, true))
    .orderBy(desc(workersTable.completedJobs))
    .limit(5) : [];

  // Top products
  const topProducts = showTop ? await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.isActive, true))
    .orderBy(desc(productsTable.viewCount))
    .limit(5) : [];

  return {
    totalUsers:    totalUsersRes?.count ?? 0,
    totalWorkers:  totalWorkersRes?.count ?? 0,
    revenue:       curRev,
    commissions:   Number(commRes?.total ?? 0),
    txCount:       txCountRes?.count ?? 0,
    growth,
    prevRev,
    completed:     completedRes?.count ?? 0,
    activeBookings:activeBookRes?.count ?? 0,
    disputes:      disputesRes?.count ?? 0,
    pendingWithdrawals: pendingWithdRes?.count ?? 0,
    pendingKyc:    pendingKycRes?.count ?? 0,
    transactions:  txRows,
    topWorkers,
    topProducts,
  };
}

// ── PDF builder ───────────────────────────────────────────────────────────────

function buildPdf(
  doc: PDFKit.PDFDocument,
  data: Awaited<ReturnType<typeof fetchReportData>>,
  sections: string[],
  rangeLabel: string,
  generatedAt: Date,
  adminRoleLabel: string,
): void {
  const W = doc.page.width;
  const ML = 56, MR = 56;
  const CONTENT_W = W - ML - MR;

  let y = 0;

  // ── HEADER BAND ───────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 110).fill("#0f172a");

  // Brand pill
  doc.roundedRect(ML, 24, 130, 28, 14).fill(C.primary);
  doc.fontSize(13).fillColor(C.white).font("Helvetica-Bold")
    .text("LINKSERVI", ML + 12, 32);

  doc.fontSize(18).fillColor(C.white).font("Helvetica-Bold")
    .text("Reporte de Operaciones", ML, 62, { continued: false });

  // Right side meta
  const metaX = W - MR - 200;
  doc.fontSize(8).fillColor("rgba(255,255,255,0.5)").font("Helvetica")
    .text(`Generado: ${fmtDate(generatedAt)}`, metaX, 28, { width: 200, align: "right" })
    .text(`Período: ${rangeLabel}`, metaX, 42, { width: 200, align: "right" })
    .text(`Acceso: ${adminRoleLabel}`, metaX, 56, { width: 200, align: "right" });

  // Thin bottom border on header
  doc.moveTo(ML, 108).lineTo(W - MR, 108).strokeColor(C.primary).lineWidth(1.5).stroke();

  y = 130;

  // ── Helper functions ──────────────────────────────────────────────────────

  function sectionTitle(title: string, icon = "●") {
    doc.rect(ML, y, CONTENT_W, 28).fillAndStroke("#f1f5f9", "#e2e8f0");
    doc.fontSize(9).fillColor(C.textMid).font("Helvetica-Bold")
      .text(`${icon}  ${title.toUpperCase()}`, ML + 10, y + 9);
    y += 36;
  }

  function kpiRow(items: { label: string; value: string; color?: string }[]) {
    const colW = CONTENT_W / items.length;
    items.forEach((item, i) => {
      const x = ML + i * colW;
      doc.rect(x + 2, y, colW - 4, 58).fillAndStroke("#ffffff", C.border);
      doc.fontSize(7).fillColor(C.textLight).font("Helvetica")
        .text(item.label, x + 10, y + 10, { width: colW - 20 });
      doc.fontSize(18).fillColor(item.color ?? C.textDark).font("Helvetica-Bold")
        .text(item.value, x + 10, y + 22, { width: colW - 20 });
    });
    y += 68;
  }

  function tableRow(cells: string[], isHeader = false, isAlt = false) {
    const colW = CONTENT_W / cells.length;
    const rowH = 22;
    const bgColor = isHeader ? "#1e293b" : isAlt ? C.rowAlt : C.white;
    const textColor = isHeader ? C.white : C.textDark;

    doc.rect(ML, y, CONTENT_W, rowH).fillAndStroke(bgColor, C.border);
    cells.forEach((cell, i) => {
      doc.fontSize(isHeader ? 7 : 8)
        .fillColor(textColor)
        .font(isHeader ? "Helvetica-Bold" : "Helvetica")
        .text(cell, ML + i * colW + 8, y + 7, { width: colW - 16, height: rowH - 4, ellipsis: true });
    });
    y += rowH;
  }

  function spacer(h = 18) { y += h; }

  function checkPageBreak(needed = 80) {
    if (y + needed > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
  }

  function alertBadge(label: string, count: number, color: string) {
    if (count === 0) return;
    doc.rect(ML, y, CONTENT_W, 30).fillAndStroke(`${color}18`, color);
    doc.circle(ML + 18, y + 15, 10).fill(color);
    doc.fontSize(9).fillColor(C.white).font("Helvetica-Bold")
      .text(String(count), ML + 18 - (count > 9 ? 5 : 3), y + 10);
    doc.fontSize(9).fillColor(C.textDark).font("Helvetica")
      .text(label, ML + 36, y + 10, { width: CONTENT_W - 40 });
    y += 38;
  }

  // ── SECTION 1: RESUMEN GENERAL ────────────────────────────────────────────
  if (sections.includes("summary") || sections.includes("channels")) {
    checkPageBreak(160);
    sectionTitle("Resumen General", "①");

    kpiRow([
      { label: "Ingresos en el período", value: fmtMoney(data.revenue),    color: C.green },
      { label: "Comisiones generadas",   value: fmtMoney(data.commissions), color: C.primary },
      { label: "Transacciones",          value: String(data.txCount),       color: C.cyan },
      { label: "Crecimiento vs anterior",value: `${data.growth > 0 ? "+" : ""}${data.growth}%`, color: data.growth >= 0 ? C.green : C.red },
    ]);

    spacer(4);
  }

  // ── SECTION 2: INGRESOS POR CANAL ────────────────────────────────────────
  if (sections.includes("summary") || sections.includes("channels")) {
    checkPageBreak(120);
    sectionTitle("Ingresos por Canal", "②");

    // Servicios = bookings revenue (100% of our revenue for now; expandable)
    const totalRev = data.revenue || 1;
    const servicePct = 100;
    const storePct   = 0;
    const rentalPct  = 0;

    const channels = [
      { label: "Servicios profesionales", amount: data.revenue,  pct: servicePct },
      { label: "Tienda / Marketplace",    amount: 0,             pct: storePct   },
      { label: "Alquileres",              amount: 0,             pct: rentalPct  },
    ];

    channels.forEach((ch, i) => {
      doc.rect(ML, y, CONTENT_W, 28).fillAndStroke(i % 2 ? C.rowAlt : C.white, C.border);
      doc.fontSize(9).fillColor(C.textDark).font("Helvetica").text(ch.label, ML + 10, y + 9, { width: CONTENT_W * 0.45 });
      doc.fontSize(9).fillColor(C.green).font("Helvetica-Bold").text(fmtMoney(ch.amount), ML + CONTENT_W * 0.5, y + 9, { width: 120 });
      // bar
      const barW = Math.round(CONTENT_W * 0.2 * ch.pct / 100);
      doc.rect(ML + CONTENT_W * 0.7, y + 9, barW, 10).fill(C.green);
      doc.fontSize(8).fillColor(C.textLight).font("Helvetica").text(`${ch.pct}%`, ML + CONTENT_W * 0.72 + barW, y + 9);
      y += 28;
    });

    spacer(14);
  }

  // ── SECTION 3: ACTIVIDAD ─────────────────────────────────────────────────
  if (sections.includes("summary") || sections.includes("activity") || sections.includes("growth")) {
    checkPageBreak(120);
    sectionTitle("Actividad de la Plataforma", "③");

    kpiRow([
      { label: "Servicios completados",  value: String(data.completed),      color: C.green  },
      { label: "Reservas activas ahora", value: String(data.activeBookings), color: C.cyan   },
      { label: "Usuarios registrados",   value: String(data.totalUsers),     color: C.purple },
      { label: "Profesionales activos",   value: String(data.totalWorkers),   color: C.amber  },
    ]);

    spacer(4);
  }

  // ── SECTION 4: TRANSACCIONES ─────────────────────────────────────────────
  if ((sections.includes("summary") || sections.includes("transactions")) && data.transactions.length > 0) {
    checkPageBreak(180);
    sectionTitle("Transacciones del Período", "④");

    tableRow(["Fecha", "Tipo", "Monto", "Estado"], true);

    data.transactions.forEach((tx: any, i: number) => {
      checkPageBreak(30);
      const dateStr = tx.completedAt ? fmtDate(new Date(tx.completedAt)) : "—";
      const monto   = tx.totalAmount != null ? fmtMoney(tx.totalAmount) : "—";
      tableRow([dateStr, "Servicio", monto, tx.status ?? "—"], false, i % 2 === 1);
    });

    spacer(14);
  }

  // ── SECTION 5: ALERTAS ───────────────────────────────────────────────────
  if (
    sections.includes("summary") ||
    sections.includes("alerts_disputes") ||
    sections.includes("alerts_financial")
  ) {
    const hasAlerts = data.disputes > 0 || data.pendingWithdrawals > 0 || data.pendingKyc > 0;
    if (hasAlerts) {
      checkPageBreak(120);
      sectionTitle("Alertas Activas", "⑤");

      if (sections.includes("summary") || sections.includes("alerts_disputes")) {
        alertBadge("Disputas abiertas que requieren atención", data.disputes, C.red);
      }
      if (sections.includes("summary") || sections.includes("alerts_financial")) {
        alertBadge("Retiros pendientes de aprobación", data.pendingWithdrawals, C.amber);
      }
      if (sections.includes("summary")) {
        alertBadge("Verificaciones KYC pendientes", data.pendingKyc, C.primary);
      }

      spacer(14);
    }
  }

  // ── SECTION 6: TOP PERFORMANCE ────────────────────────────────────────────
  if ((sections.includes("summary") || sections.includes("top_performance")) && data.topWorkers.length > 0) {
    checkPageBreak(180);
    sectionTitle("Top Rendimiento", "⑥");

    // Top workers
    doc.fontSize(8).fillColor(C.textMid).font("Helvetica-Bold").text("Mejores profesionales", ML, y); y += 14;
    tableRow(["Nombre", "Trabajos completados", "Calificación"], true);
    data.topWorkers.slice(0, 5).forEach((w: any, i: number) => {
      tableRow([
        w.user?.name ?? "—",
        String(w.worker?.completedJobs ?? 0),
        w.worker?.rating ? `${Number(w.worker.rating).toFixed(1)} ★` : "—",
      ], false, i % 2 === 1);
    });

    spacer(12);

    if (data.topProducts.length > 0) {
      checkPageBreak(100);
      doc.fontSize(8).fillColor(C.textMid).font("Helvetica-Bold").text("Productos más vistos", ML, y); y += 14;
      tableRow(["Producto", "Vistas", "Precio"], true);
      data.topProducts.slice(0, 5).forEach((p: any, i: number) => {
        tableRow([
          p.name ?? "—",
          String(p.views ?? 0),
          p.price != null ? fmtMoney(p.price) : "—",
        ], false, i % 2 === 1);
      });
    }

    spacer(14);
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const pageCount = (doc as any)._pageBuffer?.length ?? 1;
  const footerY = doc.page.height - 36;
  doc.moveTo(ML, footerY - 4).lineTo(W - MR, footerY - 4).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fontSize(7).fillColor(C.textLight).font("Helvetica")
    .text(`LinkServi · Reporte generado el ${fmtDate(generatedAt)} · Confidencial`, ML, footerY, { width: CONTENT_W, align: "center" });
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/admin/reports/pdf", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  try {
    const adminRole = getEffectiveAdminRole(req.user!);
    const sections  = getRoleSections(adminRole);

    const range   = (req.query["range"] as string) || "this_month";
    const fromStr = req.query["from"] as string | undefined;
    const toStr   = req.query["to"]   as string | undefined;

    let dateRange: ReturnType<typeof parseRange>;
    try {
      dateRange = parseRange(range, fromStr, toStr);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    const data = await fetchReportData(dateRange.from, dateRange.to, sections);

    // Log the export event
    try {
      await db.insert(actionLogsTable).values({
        userId:     req.user!.id,
        action:     "export_report",
        targetType: "report",
        meta:       JSON.stringify({ range, from: dateRange.from.toISOString(), to: dateRange.to.toISOString(), adminRole }),
        ip:         req.ip ?? null,
      });
    } catch (e) { logger.warn({ e }, "Failed to log export_report"); }

    const generatedAt = new Date();
    const rangeSlug   = range === "custom" ? `${fromStr}-${toStr}` : range;
    const filename    = `reporte-${rangeSlug}-${generatedAt.toISOString().slice(0, 10)}.pdf`;

    // Role display name
    const roleLabels: Record<string, string> = {
      super_admin: "Super Administrador",
      finanzas:    "Finanzas",
      soporte:     "Soporte",
      marketing:   "Marketing",
    };

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");

    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    doc.pipe(res);

    buildPdf(doc, data, sections, dateRange.label, generatedAt, roleLabels[adminRole] ?? adminRole);

    doc.end();

    logger.info({ userId: req.user!.id, adminRole, range, filename }, "PDF report exported");
  } catch (err: any) {
    logger.error({ err: err?.message }, "Failed to generate PDF report");
    if (!res.headersSent) {
      res.status(500).json({ error: "No se pudo generar el reporte" });
    }
  }
});

export default router;
