import { Router } from "express";
import { db, driverProfilesTable, usersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Admin · Verificación de conductores
//
// Mantenido en archivo aparte — no toca routes/admin.ts.
// Endpoints:
//   GET  /api/admin/drivers                — lista con filtro opcional ?status=
//   POST /api/admin/driver/approve/:id     — marca status='approved'
//   POST /api/admin/driver/reject/:id      — marca status='rejected'
//
// :id es el userId del conductor (driver_profiles tiene userId como PK).
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

const VALID_FILTERS = new Set(["pending_verification", "approved", "rejected", "all"]);

// ── Listar conductores con su perfil ────────────────────────────────────────
// Devuelve el join driver_profiles + users para que el panel pueda mostrar
// nombre/email sin pedir cada usuario por separado. Por defecto trae todos
// ordenados por status (pending primero) y luego por fecha de creación.
router.get("/admin/drivers", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const status = String(req.query.status ?? "all");
  if (!VALID_FILTERS.has(status)) {
    res.status(400).json({ error: "status inválido" });
    return;
  }

  const baseQuery = db
    .select({
      userId:      driverProfilesTable.userId,
      name:        usersTable.name,
      email:       usersTable.email,
      phone:       usersTable.phone,
      vehicleType: driverProfilesTable.vehicleType,
      brand:       driverProfilesTable.brand,
      model:       driverProfilesTable.model,
      year:        driverProfilesTable.year,
      color:       driverProfilesTable.color,
      plate:       driverProfilesTable.plate,
      photoUrl:    driverProfilesTable.photoUrl,
      status:      driverProfilesTable.status,
      createdAt:   driverProfilesTable.createdAt,
      updatedAt:   driverProfilesTable.updatedAt,
    })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(usersTable.id, driverProfilesTable.userId));

  const rows =
    status === "all"
      ? await baseQuery
          .orderBy(
            // pending primero (alfabéticamente "p" no es primero, así que forzamos)
            sql`CASE ${driverProfilesTable.status}
                  WHEN 'pending_verification' THEN 0
                  WHEN 'rejected' THEN 1
                  WHEN 'approved' THEN 2
                  ELSE 3 END`,
            desc(driverProfilesTable.updatedAt),
          )
      : await baseQuery
          .where(eq(driverProfilesTable.status, status))
          .orderBy(desc(driverProfilesTable.updatedAt));

  res.json({ drivers: rows });
});

// ── Aprobar ──────────────────────────────────────────────────────────────────
router.post("/admin/driver/approve/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "id inválido" });
    return;
  }

  const [updated] = await db
    .update(driverProfilesTable)
    .set({ status: "approved" })
    .where(eq(driverProfilesTable.userId, userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Conductor no encontrado" });
    return;
  }
  res.json({ profile: updated });
});

// ── Rechazar ─────────────────────────────────────────────────────────────────
router.post("/admin/driver/reject/:id", authenticate, requireRole("admin"), async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "id inválido" });
    return;
  }

  const [updated] = await db
    .update(driverProfilesTable)
    .set({ status: "rejected" })
    .where(eq(driverProfilesTable.userId, userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Conductor no encontrado" });
    return;
  }
  res.json({ profile: updated });
});

export default router;
