import { Router } from "express";
import { db, notificationsTable, bookingsTable } from "@workspace/db";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { authenticate } from "../lib/auth";

const router = Router();

router.get("/notifications", authenticate, async (req, res): Promise<void> => {
  const { role } = req.query as { role?: string };
  const base = eq(notificationsTable.userId, req.user!.id);
  const whereClause = role
    ? and(base, or(isNull(notificationsTable.targetRole), eq(notificationsTable.targetRole, role)))
    : base;
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(whereClause)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(40);
  res.json(notifications);
});

router.post("/notifications/:id/read", authenticate, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

router.post("/notifications/read-all", authenticate, async (req, res): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.user!.id));
  res.json({ ok: true });
});

router.delete("/notifications/read", authenticate, async (req, res): Promise<void> => {
  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.userId, req.user!.id), eq(notificationsTable.isRead, true)));
  res.json({ ok: true });
});

router.delete("/notifications/:id", authenticate, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.user!.id)));
  res.json({ ok: true });
});

export default router;

// Map notification type → frontend URL for deep links.
// Always emits canonical /professional/* URLs (Phase 2 of /worker → /professional migration).
function resolveUrl(type: string, bookingId?: number, userRole?: string): string {
  if (bookingId) {
    if (type === "new_booking") return `/professional/bookings`;
    if (type.startsWith("booking_") || type.startsWith("payment_")) {
      return userRole === "worker" ? `/professional/bookings` : `/client/bookings`;
    }
    if (type.startsWith("chat_")) {
      return userRole === "worker" ? `/professional/chat/${bookingId}` : `/client/chat/${bookingId}`;
    }
    if (type.startsWith("verification_")) return `/professional/verification`;
  }
  return `/`;
}

export async function createNotification(
  userId: number,
  type: string,
  title: string,
  message: string,
  bookingId?: number,
  userRole?: string,
  linkUrl?: string
) {
  await db.insert(notificationsTable).values({
    userId,
    type,
    title,
    message,
    bookingId: bookingId ?? null,
    linkUrl: linkUrl ?? null,
    targetRole: userRole ?? null,
  });

  // Also send Web Push (non-blocking)
  try {
    const { sendPushToUser } = await import("./push");
    const url = linkUrl ?? resolveUrl(type, bookingId, userRole);
    await sendPushToUser(userId, { title, body: message, tag: type, url });
  } catch {}
}
