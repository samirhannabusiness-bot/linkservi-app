import { Router } from "express";
import { db, storesTable, storeMessagesTable, usersTable, productsTable } from "@workspace/db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { authenticate } from "../../lib/auth";
import { filterMessage } from "../../lib/messageFilter";
import { createNotification } from "../notifications";
import { emitToRoom } from "../../lib/socket";

const router = Router();

// ── In-memory typing state ────────────────────────────────────────────────────
// Key: `${storeId}:${buyerId}` → { userId, userName, typingAt }
const typingState = new Map<string, { userId: number; userName: string; typingAt: number }>();
const TYPING_TTL_MS = 4000;

// ── In-memory presence state ──────────────────────────────────────────────────
// Key: userId → lastSeenAt (ms timestamp)
const presenceState = new Map<number, number>();
const ONLINE_TTL_MS = 45_000; // 45s — heartbeat every 30s from client

async function getStoreCoHostId(storeId: number): Promise<number | null> {
  const [store] = await db.select({ coHostId: storesTable.coHostId }).from(storesTable).where(eq(storesTable.id, storeId));
  return store?.coHostId ?? null;
}

function resolveBuyerId(userId: number, coHostId: number, paramBuyerId?: number): number {
  if (userId === coHostId) return paramBuyerId!;
  return userId;
}

// ── GET /conversations ────────────────────────────────────────────────────────
router.get("/conversations", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const convos = await db
      .selectDistinctOn([storeMessagesTable.storeId, storeMessagesTable.buyerId], {
        storeId: storeMessagesTable.storeId,
        buyerId: storeMessagesTable.buyerId,
        lastMessage: storeMessagesTable.content,
        lastMessageType: storeMessagesTable.messageType,
        lastAt: storeMessagesTable.createdAt,
        storeName: storesTable.name,
        storeLogoUrl: storesTable.logoUrl,
        coHostId: storesTable.coHostId,
        buyerName: usersTable.name,
        unreadCount: sql<number>`(
          select count(*) from store_messages sm2
          where sm2.store_id = ${storeMessagesTable.storeId}
            and sm2.buyer_id = ${storeMessagesTable.buyerId}
            and sm2.receiver_id = ${uid}
            and sm2.is_read = false
        )`,
      })
      .from(storeMessagesTable)
      .innerJoin(storesTable, eq(storeMessagesTable.storeId, storesTable.id))
      .innerJoin(usersTable, eq(storeMessagesTable.buyerId, usersTable.id))
      .where(or(eq(storeMessagesTable.buyerId, uid), eq(storesTable.coHostId, uid)))
      .orderBy(storeMessagesTable.storeId, storeMessagesTable.buyerId, desc(storeMessagesTable.createdAt));

    res.json(convos);
  } catch {
    res.status(500).json({ error: "Error al obtener conversaciones" });
  }
});

// ── GET /unread/count ─────────────────────────────────────────────────────────
router.get("/unread/count", authenticate, async (req, res): Promise<void> => {
  try {
    const uid = req.user!.id;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(storeMessagesTable)
      .where(and(eq(storeMessagesTable.receiverId, uid), eq(storeMessagesTable.isRead, false)));
    res.json({ count: Number(count) });
  } catch {
    res.json({ count: 0 });
  }
});

// ── GET /store-products/:storeId ──────────────────────────────────────────────
router.get("/store-products/:storeId", authenticate, async (req, res): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const uid = req.user!.id;
    const coHostId = await getStoreCoHostId(storeId);
    if (!coHostId) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    if (uid !== coHostId) { res.status(403).json({ error: "Solo el vendedor puede ver sus productos" }); return; }

    const products = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        priceUsd: productsTable.priceUsd,
        image: productsTable.image,
        description: productsTable.description,
        stock: productsTable.stock,
        hasDelivery: productsTable.hasDelivery,
      })
      .from(productsTable)
      .where(and(eq(productsTable.storeId, storeId), eq(productsTable.isActive, true)));

    res.json(products);
  } catch {
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

// ── DELETE /:storeId — client deletes their own conversation ─────────────────
router.delete("/:storeId", authenticate, async (req, res): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const uid = req.user!.id;
    const coHostId = await getStoreCoHostId(storeId);
    if (!coHostId) { res.status(404).json({ error: "Tienda no encontrada" }); return; }
    if (uid === coHostId) { res.status(403).json({ error: "Solo el cliente puede borrar su conversación" }); return; }

    await db.delete(storeMessagesTable).where(
      and(eq(storeMessagesTable.storeId, storeId), eq(storeMessagesTable.buyerId, uid))
    );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Error al borrar la conversación" });
  }
});

// ── POST /:storeId/typing — mark user as typing ───────────────────────────────
router.post("/:storeId/typing", authenticate, async (req, res): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const uid = req.user!.id;
    const coHostId = await getStoreCoHostId(storeId);
    if (!coHostId) { res.status(404).json({ error: "Tienda no encontrada" }); return; }

    const paramBuyerId = req.body.buyerId ? parseInt(req.body.buyerId) : undefined;
    const buyerId = resolveBuyerId(uid, coHostId, paramBuyerId);

    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
    const key = `${storeId}:${buyerId}`;
    typingState.set(key, { userId: uid, userName: user?.name ?? "Usuario", typingAt: Date.now() });

    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// ── GET /:storeId/typing — check if the OTHER person is typing ────────────────
router.get("/:storeId/typing", authenticate, async (req, res): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const uid = req.user!.id;
    const coHostId = await getStoreCoHostId(storeId);
    if (!coHostId) { res.json({ typing: false }); return; }

    const paramBuyerId = req.query.buyerId ? parseInt(req.query.buyerId as string) : undefined;
    const buyerId = resolveBuyerId(uid, coHostId, paramBuyerId);

    const key = `${storeId}:${buyerId}`;
    const state = typingState.get(key);

    if (!state) { res.json({ typing: false }); return; }

    if (Date.now() - state.typingAt > TYPING_TTL_MS) {
      typingState.delete(key);
      res.json({ typing: false }); return;
    }

    if (state.userId === uid) { res.json({ typing: false }); return; }

    res.json({ typing: true, userName: state.userName });
  } catch {
    res.json({ typing: false });
  }
});

// ── POST /:storeId/presence — heartbeat (I am online) ────────────────────────
router.post("/:storeId/presence", authenticate, async (req, res): Promise<void> => {
  presenceState.set(req.user!.id, Date.now());
  res.json({ ok: true });
});

// ── GET /:storeId/presence — check other party's online status ────────────────
router.get("/:storeId/presence", authenticate, async (req, res): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const uid = req.user!.id;
    const coHostId = await getStoreCoHostId(storeId);
    if (!coHostId) { res.json({ online: false, lastSeenMs: null }); return; }

    const paramBuyerId = req.query.buyerId ? parseInt(req.query.buyerId as string) : undefined;
    const buyerId = resolveBuyerId(uid, coHostId, paramBuyerId);

    // The "other" party
    const otherId = uid === coHostId ? buyerId : coHostId;
    const lastSeen = presenceState.get(otherId) ?? null;
    const online = lastSeen !== null && (Date.now() - lastSeen) < ONLINE_TTL_MS;

    res.json({ online, lastSeenMs: lastSeen });
  } catch {
    res.json({ online: false, lastSeenMs: null });
  }
});

// ── GET /:storeId — fetch messages ────────────────────────────────────────────
router.get("/:storeId", authenticate, async (req, res): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const uid = req.user!.id;
    const coHostId = await getStoreCoHostId(storeId);
    if (!coHostId) { res.status(404).json({ error: "Tienda no encontrada" }); return; }

    const paramBuyerId = req.query.buyerId ? parseInt(req.query.buyerId as string) : undefined;
    const buyerId = resolveBuyerId(uid, coHostId, paramBuyerId);

    await db
      .update(storeMessagesTable)
      .set({ isRead: true })
      .where(and(
        eq(storeMessagesTable.storeId, storeId),
        eq(storeMessagesTable.buyerId, buyerId),
        eq(storeMessagesTable.receiverId, uid)
      ));

    const messages = await db
      .select({
        id: storeMessagesTable.id,
        senderId: storeMessagesTable.senderId,
        content: storeMessagesTable.content,
        messageType: storeMessagesTable.messageType,
        imageUrl: storeMessagesTable.imageUrl,
        audioUrl: storeMessagesTable.audioUrl,
        videoUrl: storeMessagesTable.videoUrl,
        productData: storeMessagesTable.productData,
        wasFiltered: storeMessagesTable.wasFiltered,
        isRead: storeMessagesTable.isRead,
        createdAt: storeMessagesTable.createdAt,
        senderName: usersTable.name,
        senderAvatar: usersTable.avatarUrl,
      })
      .from(storeMessagesTable)
      .innerJoin(usersTable, eq(storeMessagesTable.senderId, usersTable.id))
      .where(and(eq(storeMessagesTable.storeId, storeId), eq(storeMessagesTable.buyerId, buyerId)))
      .orderBy(storeMessagesTable.createdAt);

    res.json(messages);
  } catch {
    res.status(500).json({ error: "Error al obtener mensajes" });
  }
});

// ── POST /:storeId — send message ─────────────────────────────────────────────
router.post("/:storeId", authenticate, async (req, res): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const uid = req.user!.id;
    const { content, buyerId: bodyBuyerId, messageType = "text", imageUrl, audioUrl, videoUrl, productData } = req.body;

    const coHostId = await getStoreCoHostId(storeId);
    if (!coHostId) { res.status(404).json({ error: "Tienda no encontrada" }); return; }

    const paramBuyerId = bodyBuyerId ? parseInt(bodyBuyerId) : undefined;
    const buyerId = resolveBuyerId(uid, coHostId, paramBuyerId);
    const receiverId = uid === coHostId ? buyerId : coHostId;

    // Validate by type
    if (messageType === "text") {
      if (!content?.trim()) { res.status(400).json({ error: "Mensaje vacío" }); return; }
      if (content.trim().length > 1000) { res.status(400).json({ error: "Mensaje demasiado largo (máx. 1000 caracteres)" }); return; }
    }
    if (messageType === "image") {
      if (!imageUrl) { res.status(400).json({ error: "URL de imagen requerida" }); return; }
    }
    if (messageType === "voice") {
      if (!audioUrl) { res.status(400).json({ error: "URL de audio requerida" }); return; }
    }
    if (messageType === "video") {
      if (!videoUrl) { res.status(400).json({ error: "URL de video requerida" }); return; }
    }
    if (messageType === "product_offer") {
      if (uid !== coHostId) { res.status(403).json({ error: "Solo el vendedor puede enviar ofertas de producto" }); return; }
      if (!productData) { res.status(400).json({ error: "Datos de producto requeridos" }); return; }
    }
    if (messageType === "purchase_request") {
      if (uid === coHostId) { res.status(403).json({ error: "Solo el cliente puede enviar solicitudes de compra" }); return; }
      if (!productData) { res.status(400).json({ error: "Datos de solicitud requeridos" }); return; }
    }

    const rawContent = content?.trim() ?? "";
    const { content: filtered, wasFiltered } = messageType === "text"
      ? filterMessage(rawContent)
      : { content: rawContent, wasFiltered: false };

    const [msg] = await db
      .insert(storeMessagesTable)
      .values({
        storeId, senderId: uid, receiverId, buyerId,
        content: filtered,
        messageType,
        imageUrl: imageUrl ?? null,
        audioUrl: audioUrl ?? null,
        videoUrl: videoUrl ?? null,
        productData: productData ? JSON.stringify(productData) : null,
        wasFiltered,
      })
      .returning();

    emitToRoom(`store:${storeId}:${buyerId}`, "new_message", {
      id: msg.id,
      storeId: msg.storeId,
      senderId: msg.senderId,
      content: msg.content,
      messageType: msg.messageType,
      imageUrl: msg.imageUrl,
      audioUrl: msg.audioUrl,
      videoUrl: msg.videoUrl,
      productData: msg.productData,
      createdAt: msg.createdAt,
    });

    // ── Clear typing indicator for the sender ──────────────────────────────
    const typingKey = `${storeId}:${buyerId}`;
    typingState.delete(typingKey);

    // ── Send notification to receiver ──────────────────────────────────────
    try {
      const [sender] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, uid));
      const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, storeId));
      const senderName = sender?.name ?? "Usuario";
      const storeName = store?.name ?? "Tienda";

      let notifBody: string;
      switch (messageType) {
        case "image": notifBody = `${senderName} te envió una foto`; break;
        case "voice": notifBody = `${senderName} te envió una nota de voz`; break;
        case "video": notifBody = `${senderName} te envió un video`; break;
        case "product_offer": notifBody = `${senderName} te envió una oferta de producto`; break;
        case "purchase_request": notifBody = `${senderName} envió una solicitud de compra`; break;
        default: {
          const preview = filtered.length > 80 ? filtered.slice(0, 80) + "…" : filtered;
          notifBody = `${senderName}: ${preview}`;
        }
      }

      // If the SENDER is the client → receiver is cohost → cohost needs /buyer/:buyerId URL
      // If the SENDER is the cohost → receiver is the client → client uses /store-chat/:storeId
      const chatPath = uid === coHostId
        ? `/store-chat/${storeId}`
        : `/store-chat/${storeId}/buyer/${buyerId}`;

      // title = store name (shown as header), message = text content, linkUrl = deep-link to chat
      await createNotification(receiverId, "chat_message", storeName, notifBody, undefined, undefined, chatPath);
    } catch {
      // Notification failure is non-critical
    }

    res.status(201).json({ ...msg, wasFiltered, senderName: "" });
  } catch {
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
});

export default router;
