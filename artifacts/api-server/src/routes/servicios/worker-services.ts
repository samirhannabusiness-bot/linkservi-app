import { Router } from "express";
import { db, workerServicesTable, workersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { authenticate } from "../../lib/auth";

const router = Router();

// ── Public: list active services for a worker ─────────────────────────────────
router.get("/workers/:workerId/services", async (req, res): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.workerId) ? req.params.workerId[0] : req.params.workerId;
    const workerId = parseInt(raw, 10);
    if (isNaN(workerId)) { res.status(400).json({ error: "ID inválido" }); return; }

    const services = await db
      .select()
      .from(workerServicesTable)
      .where(and(eq(workerServicesTable.workerId, workerId), eq(workerServicesTable.isActive, true)))
      .orderBy(asc(workerServicesTable.sortOrder), asc(workerServicesTable.createdAt));

    res.json(services);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener servicios" });
  }
});

// ── Worker: list own services (including inactive) ────────────────────────────
router.get("/my/services", authenticate, async (req, res): Promise<void> => {
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
    if (!worker) { res.status(404).json({ error: "Perfil de profesional no encontrado" }); return; }

    const services = await db
      .select()
      .from(workerServicesTable)
      .where(eq(workerServicesTable.workerId, worker.id))
      .orderBy(asc(workerServicesTable.sortOrder), asc(workerServicesTable.createdAt));

    res.json(services);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener servicios" });
  }
});

// ── Worker: create service ────────────────────────────────────────────────────
router.post("/my/services", authenticate, async (req, res): Promise<void> => {
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
    if (!worker) { res.status(404).json({ error: "Perfil de profesional no encontrado" }); return; }

    const { name, description, basePrice, sortOrder } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "El nombre del servicio es requerido" }); return;
    }
    if (typeof basePrice !== "number" || basePrice < 0) {
      res.status(400).json({ error: "El precio base debe ser un número positivo" }); return;
    }

    const existing = await db
      .select()
      .from(workerServicesTable)
      .where(eq(workerServicesTable.workerId, worker.id));
    if (existing.length >= 20) {
      res.status(400).json({ error: "Máximo 20 servicios permitidos" }); return;
    }

    const [service] = await db
      .insert(workerServicesTable)
      .values({
        workerId: worker.id,
        name: name.trim(),
        description: description?.trim() ?? null,
        basePrice,
        sortOrder: typeof sortOrder === "number" ? sortOrder : existing.length,
        isActive: true,
      })
      .returning();

    res.status(201).json(service);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al crear servicio" });
  }
});

// ── Worker: update service ────────────────────────────────────────────────────
router.put("/my/services/:serviceId", authenticate, async (req, res): Promise<void> => {
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
    if (!worker) { res.status(404).json({ error: "Perfil de profesional no encontrado" }); return; }

    const raw = Array.isArray(req.params.serviceId) ? req.params.serviceId[0] : req.params.serviceId;
    const serviceId = parseInt(raw, 10);

    const [existing] = await db
      .select()
      .from(workerServicesTable)
      .where(and(eq(workerServicesTable.id, serviceId), eq(workerServicesTable.workerId, worker.id)));
    if (!existing) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

    const { name, description, basePrice, isActive, sortOrder } = req.body;
    const updates: Partial<typeof workerServicesTable.$inferInsert> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = description ? String(description).trim() : null;
    if (basePrice !== undefined) updates.basePrice = Number(basePrice);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);

    const [updated] = await db
      .update(workerServicesTable)
      .set(updates)
      .where(and(eq(workerServicesTable.id, serviceId), eq(workerServicesTable.workerId, worker.id)))
      .returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al actualizar servicio" });
  }
});

// ── Worker: delete service ────────────────────────────────────────────────────
router.delete("/my/services/:serviceId", authenticate, async (req, res): Promise<void> => {
  try {
    const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, req.user!.id));
    if (!worker) { res.status(404).json({ error: "Perfil de profesional no encontrado" }); return; }

    const raw = Array.isArray(req.params.serviceId) ? req.params.serviceId[0] : req.params.serviceId;
    const serviceId = parseInt(raw, 10);

    const [deleted] = await db
      .delete(workerServicesTable)
      .where(and(eq(workerServicesTable.id, serviceId), eq(workerServicesTable.workerId, worker.id)))
      .returning();

    if (!deleted) { res.status(404).json({ error: "Servicio no encontrado" }); return; }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al eliminar servicio" });
  }
});

export default router;
