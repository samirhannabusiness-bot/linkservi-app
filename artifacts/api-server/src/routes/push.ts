import { Router } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authenticate } from "../lib/auth";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "BEsQvbiGKy2UYuCnIq9V_5cwHf26wx_Hzy4xEr8h4rXNFbcZ5lVhOkw8M4q_cPu83FFjrk1sEE5OGf3QkxedX34";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "qag9a9LM0_c5uPjw-w_G9eMKmisICw6wrgeQMh2GNrA";

webpush.setVapidDetails(
  "mailto:support@servilink.app",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export { VAPID_PUBLIC_KEY };

export async function sendPushToUser(
  userId: number,
  payload: { title: string; body: string; tag?: string; url?: string }
) {
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  const failed: number[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { urgency: "normal", TTL: 60 * 60 }
        );
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          failed.push(sub.id);
        }
      }
    })
  );
  if (failed.length > 0) {
    for (const id of failed) {
      await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, id));
    }
  }
}

const router = Router();

router.get("/push/vapid-key", (_req, res): void => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

router.post("/push/subscribe", authenticate, async (req, res): Promise<void> => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "Invalid subscription" });
    return;
  }
  const existing = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(and(
      eq(pushSubscriptionsTable.userId, req.user!.id),
      eq(pushSubscriptionsTable.endpoint, endpoint)
    ));

  if (existing.length === 0) {
    await db.insert(pushSubscriptionsTable).values({
      userId: req.user!.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    });
  }
  res.json({ success: true });
});

router.delete("/push/unsubscribe", authenticate, async (req, res): Promise<void> => {
  const { endpoint } = req.body;
  if (endpoint) {
    await db.delete(pushSubscriptionsTable)
      .where(and(
        eq(pushSubscriptionsTable.userId, req.user!.id),
        eq(pushSubscriptionsTable.endpoint, endpoint)
      ));
  } else {
    await db.delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, req.user!.id));
  }
  res.json({ success: true });
});

export default router;
