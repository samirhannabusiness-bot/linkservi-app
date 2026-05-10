import { Router } from "express";
import {
  db, jobConversationsTable, jobMessagesTable,
  jobSubscriptionsTable, usersTable, systemAlertsTable,
} from "@workspace/db";
import { eq, and, or, desc, gte, ne, isNull } from "drizzle-orm";
import { authenticate } from "../../lib/auth";
import { sendPushToUser } from "../push";
import { emitToRoom } from "../../lib/socket";
import { filterMessage } from "../../lib/messageFilter";

const router = Router();

// In-memory typing indicators  Map<"convId:userId", timestamp_ms>
const typingMap = new Map<string, number>();

// ── Helpers ───────────────────────────────────────────────────────────────────
async function hasBusinessPremium(userId: number): Promise<boolean> {
  const [sub] = await db
    .select({ id: jobSubscriptionsTable.id })
    .from(jobSubscriptionsTable)
    .where(and(
      eq(jobSubscriptionsTable.userId, userId),
      eq(jobSubscriptionsTable.type, "business_premium"),
      eq(jobSubscriptionsTable.status, "active"),
      gte(jobSubscriptionsTable.endDate, new Date()),
    ))
    .limit(1);
  return !!sub;
}

function notifBody(messageType: string, content: string) {
  if (messageType === "audio") return "🎤 Nota de voz";
  if (messageType === "image") return "📷 Imagen";
  if (messageType === "document") return "📎 Documento";
  return content.length > 80 ? content.slice(0, 77) + "…" : content;
}

// ── GET /jobs/conversations ───────────────────────────────────────────────
router.get("/jobs/conversations", authenticate, async (req, res): Promise<void> => {
  try {
    const userId = req.user!.id;

    const convs = await db
      .select()
      .from(jobConversationsTable)
      .where(or(
        eq(jobConversationsTable.employerId, userId),
        eq(jobConversationsTable.applicantId, userId),
      ))
      .orderBy(desc(jobConversationsTable.lastMessageAt));

    const result = [];
    for (const conv of convs) {
      const otherId = conv.employerId === userId ? conv.applicantId : conv.employerId;
      const [other] = await db
        .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl, updatedAt: usersTable.updatedAt })
        .from(usersTable)
        .where(eq(usersTable.id, otherId));

      const [lastMsg] = await db
        .select()
        .from(jobMessagesTable)
        .where(eq(jobMessagesTable.conversationId, conv.id))
        .orderBy(desc(jobMessagesTable.createdAt))
        .limit(1);

      // Count unread: messages from other user without readAt
      const unreadRows = await db
        .select({ id: jobMessagesTable.id })
        .from(jobMessagesTable)
        .where(and(
          eq(jobMessagesTable.conversationId, conv.id),
          eq(jobMessagesTable.senderId, otherId),
          isNull(jobMessagesTable.readAt),
        ));

      result.push({
        ...conv,
        otherUser: other ?? null,
        lastMessage: lastMsg ?? null,
        unreadCount: unreadRows.length,
        role: conv.employerId === userId ? "employer" : "applicant",
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener conversaciones" });
  }
});

// ── POST /jobs/conversations ── create or return existing ─────────────────
router.post("/jobs/conversations", authenticate, async (req, res): Promise<void> => {
  try {
    const employerId = req.user!.id;
    const { applicantId } = req.body;

    if (!applicantId || typeof applicantId !== "number") {
      res.status(400).json({ error: "applicantId es requerido" });
      return;
    }

    if (employerId === applicantId) {
      res.status(400).json({ error: "No puedes chatear contigo mismo" });
      return;
    }

    const isPremium = await hasBusinessPremium(employerId);
    if (!isPremium) {
      res.status(403).json({ error: "Se requiere suscripción Business Premium para iniciar chats" });
      return;
    }

    // Return existing if found
    const [existing] = await db
      .select()
      .from(jobConversationsTable)
      .where(and(
        eq(jobConversationsTable.employerId, employerId),
        eq(jobConversationsTable.applicantId, applicantId),
      ))
      .limit(1);

    if (existing) {
      res.json(existing);
      return;
    }

    const [conv] = await db
      .insert(jobConversationsTable)
      .values({ employerId, applicantId })
      .returning();

    res.status(201).json(conv);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al crear conversación" });
  }
});

// ── GET /jobs/conversations/:id/messages ──────────────────────────────────
router.get("/jobs/conversations/:id/messages", authenticate, async (req, res): Promise<void> => {
  try {
    const convId = parseInt(req.params.id);
    const userId = req.user!.id;

    const [conv] = await db
      .select()
      .from(jobConversationsTable)
      .where(eq(jobConversationsTable.id, convId));

    if (!conv) { res.status(404).json({ error: "Conversación no encontrada" }); return; }
    if (conv.employerId !== userId && conv.applicantId !== userId) {
      res.status(403).json({ error: "Acceso denegado" }); return;
    }

    const messages = await db
      .select({
        msg: jobMessagesTable,
        senderName: usersTable.name,
        senderAvatar: usersTable.avatarUrl,
      })
      .from(jobMessagesTable)
      .innerJoin(usersTable, eq(usersTable.id, jobMessagesTable.senderId))
      .where(eq(jobMessagesTable.conversationId, convId))
      .orderBy(jobMessagesTable.createdAt);

    // Mark messages from the other user as read (async, don't block response)
    const otherId = conv.employerId === userId ? conv.applicantId : conv.employerId;
    db.update(jobMessagesTable)
      .set({ readAt: new Date() })
      .where(and(
        eq(jobMessagesTable.conversationId, convId),
        eq(jobMessagesTable.senderId, otherId),
        isNull(jobMessagesTable.readAt),
      ))
      .then(() => {})
      .catch(() => {});

    res.json(messages.map(m => ({
      id: m.msg.id,
      conversationId: m.msg.conversationId,
      senderId: m.msg.senderId,
      senderName: m.senderName,
      senderAvatar: m.senderAvatar,
      messageType: m.msg.messageType,
      content: m.msg.content,
      mediaUrl: m.msg.mediaUrl,
      mediaMime: m.msg.mediaMime,
      duration: m.msg.duration,
      readAt: m.msg.readAt,
      createdAt: m.msg.createdAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al obtener mensajes" });
  }
});

// ── POST /jobs/conversations/:id/messages ─────────────────────────────────
router.post("/jobs/conversations/:id/messages", authenticate, async (req, res): Promise<void> => {
  try {
    const convId = parseInt(req.params.id);
    const userId = req.user!.id;

    const [conv] = await db
      .select()
      .from(jobConversationsTable)
      .where(eq(jobConversationsTable.id, convId));

    if (!conv) { res.status(404).json({ error: "Conversación no encontrada" }); return; }
    if (conv.employerId !== userId && conv.applicantId !== userId) {
      res.status(403).json({ error: "Acceso denegado" }); return;
    }

    const { messageType = "text", content = "", mediaUrl, mediaMime, duration } = req.body;

    if (messageType === "text" && !content.trim()) {
      res.status(400).json({ error: "El mensaje no puede estar vacío" }); return;
    }
    if (messageType !== "text" && !mediaUrl) {
      res.status(400).json({ error: "mediaUrl es requerido para este tipo de mensaje" }); return;
    }

    // ── Anti-bypass filter (text messages only) ────────────────────────────
    const rawContent = (content ?? "").trim();
    const { content: filteredContent, wasFiltered } = messageType === "text"
      ? filterMessage(rawContent)
      : { content: rawContent, wasFiltered: false };
    if (wasFiltered) {
      try {
        await db.insert(systemAlertsTable).values({
          type: "CHAT_BYPASS_ATTEMPT",
          payload: {
            channel: "jobs_chat",
            conversationId: convId,
            senderId: userId,
            rawContent,
            filteredContent,
          },
        });
      } catch { /* non-critical */ }
    }

    const [msg] = await db
      .insert(jobMessagesTable)
      .values({
        conversationId: convId,
        senderId: userId,
        messageType,
        content: filteredContent,
        mediaUrl: mediaUrl ?? null,
        mediaMime: mediaMime ?? null,
        duration: duration ?? null,
      })
      .returning();

    await db
      .update(jobConversationsTable)
      .set({ lastMessageAt: new Date() })
      .where(eq(jobConversationsTable.id, convId));

    const [senderInfo] = await db
      .select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    emitToRoom(`job:${convId}`, "new_message", {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: senderInfo?.name ?? "Usuario",
      senderAvatar: senderInfo?.avatarUrl ?? null,
      messageType: msg.messageType,
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      mediaMime: msg.mediaMime,
      duration: msg.duration,
      createdAt: msg.createdAt,
    });

    // Push to recipient
    const recipientId = conv.employerId === userId ? conv.applicantId : conv.employerId;
    try {
      await sendPushToUser(recipientId, {
        title: `💬 ${senderInfo?.name ?? "Usuario"}`,
        body: notifBody(messageType, content),
        tag: `job-chat-${convId}`,
        url: `/jobs/chat/${convId}`,
      });
    } catch {}

    res.status(201).json({
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: senderInfo?.name ?? "Usuario",
      senderAvatar: senderInfo?.avatarUrl ?? null,
      messageType: msg.messageType,
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      mediaMime: msg.mediaMime,
      duration: msg.duration,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
      wasFiltered,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Error al enviar mensaje" });
  }
});

// ── POST /jobs/conversations/:id/typing ───────────────────────────────────
router.post("/jobs/conversations/:id/typing", authenticate, (req, res): void => {
  const key = `${req.params.id}:${req.user!.id}`;
  typingMap.set(key, Date.now());
  res.json({ ok: true });
});

// ── GET /jobs/conversations/:id/typing ────────────────────────────────────
router.get("/jobs/conversations/:id/typing", authenticate, async (req, res): Promise<void> => {
  try {
    const convId = parseInt(req.params.id);
    const userId = req.user!.id;

    const [conv] = await db
      .select()
      .from(jobConversationsTable)
      .where(eq(jobConversationsTable.id, convId));

    if (!conv) { res.json({ typing: false }); return; }

    const otherId = conv.employerId === userId ? conv.applicantId : conv.employerId;
    const ts = typingMap.get(`${convId}:${otherId}`);
    res.json({ typing: !!(ts && Date.now() - ts < 5000) });
  } catch {
    res.json({ typing: false });
  }
});

// ── GET /jobs/conversations/:id/online ────────────────────────────────────
// Returns last-seen of the other user (we track via updatedAt or a dedicated field)
router.get("/jobs/conversations/:id/online", authenticate, async (req, res): Promise<void> => {
  try {
    const convId = parseInt(req.params.id);
    const userId = req.user!.id;

    const [conv] = await db
      .select()
      .from(jobConversationsTable)
      .where(eq(jobConversationsTable.id, convId));

    if (!conv) { res.json({ online: false, lastSeen: null }); return; }

    const otherId = conv.employerId === userId ? conv.applicantId : conv.employerId;
    const [other] = await db
      .select({ updatedAt: usersTable.updatedAt })
      .from(usersTable)
      .where(eq(usersTable.id, otherId));

    if (!other) { res.json({ online: false, lastSeen: null }); return; }

    const lastSeen = other.updatedAt ? new Date(other.updatedAt) : null;
    const online = lastSeen ? (Date.now() - lastSeen.getTime()) < 5 * 60 * 1000 : false;
    res.json({ online, lastSeen });
  } catch {
    res.json({ online: false, lastSeen: null });
  }
});

export default router;
