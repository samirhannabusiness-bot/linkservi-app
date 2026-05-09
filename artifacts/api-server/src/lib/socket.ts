import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { db, transportRidesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let _io: Server | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCookieToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)sl_token=([^;]+)/);
  return match?.[1] ?? undefined;
}

interface TokenPayload {
  userId: number;
  role: string;
}

function verifyToken(token: string | undefined): TokenPayload | null {
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    return jwt.verify(token, secret) as TokenPayload;
  } catch {
    return null;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSocketServer(httpServer: HttpServer): Server {
  _io = new Server(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // ── Auth middleware ─────────────────────────────────────────────────────────
  _io.use((socket, next) => {
    // 1. Bearer token sent explicitly by the client (auth.token)
    const authToken = socket.handshake.auth?.token as string | undefined;

    // 2. HttpOnly cookie fallback (sl_token — sent automatically by the browser)
    const cookieToken = parseCookieToken(socket.handshake.headers.cookie);

    const payload = verifyToken(authToken) ?? verifyToken(cookieToken);

    if (!payload) {
      logger.warn(
        { socketId: socket.id, ip: socket.handshake.address },
        "Socket auth rejected — invalid or missing token",
      );
      return next(new Error("Unauthorized"));
    }

    // Attach identity to socket for downstream use in handlers
    socket.data.userId = payload.userId;
    socket.data.role = payload.role;
    // `secondaryRole` viene en el JWT (ver routes/auth.ts) — necesario para
    // unificar la authz REST↔Socket en flujos multi-rol como conductor.
    socket.data.secondaryRole = (payload as { secondaryRole?: string | null }).secondaryRole ?? null;

    next();
  });

  // ── Connection handler ──────────────────────────────────────────────────────
  _io.on("connection", (socket: Socket) => {
    logger.info(
      { socketId: socket.id, userId: socket.data.userId, role: socket.data.role },
      "Socket connected",
    );

    // ── Auto-join por query param ELIMINADO ─────────────────────────────────
    // El antiguo `?room=...` permitía unirse a CUALQUIER sala sin autorización,
    // saltándose `socket.on("join")`. Ahora todos los joins pasan por el
    // handler "join" para que las salas sensibles (`ride:<id>`,
    // `transport:drivers`) sean auditadas.

    socket.on("join", async (roomName: string) => {
      if (typeof roomName !== "string" || !roomName) return;

      // ── Autorización por sala — protege flujos sensibles ─────────────────
      // Para rooms `ride:<id>` solo el cliente o el conductor del viaje
      // pueden unirse. Esto evita filtraciones de ubicación / estado.
      if (roomName.startsWith("ride:")) {
        const id = Number(roomName.slice("ride:".length));
        if (!Number.isInteger(id) || id <= 0) return;
        const userId = socket.data.userId as number | undefined;
        const role = socket.data.role as string | undefined;
        if (!userId) return;
        if (role !== "admin") {
          try {
            const [r] = await db
              .select({ clientId: transportRidesTable.clientId, driverId: transportRidesTable.driverId })
              .from(transportRidesTable)
              .where(eq(transportRidesTable.id, id))
              .limit(1);
            if (!r || (r.clientId !== userId && r.driverId !== userId)) {
              logger.warn({ socketId: socket.id, room: roomName, userId }, "Socket join rejected — not a ride participant");
              return;
            }
          } catch (e) {
            logger.error({ err: e, room: roomName }, "Socket ride-join authz failed");
            return;
          }
        }
      }

      // `transport:drivers` solo para conductores — recibe ofertas de viaje.
      // Coherente con `isDriver()` del REST: acepta role primario === "driver"
      // O secondaryRole === "driver" (admin bypass).
      if (roomName === "transport:drivers") {
        const role = socket.data.role as string | undefined;
        const secondaryRole = socket.data.secondaryRole as string | null | undefined;
        const isDriver = role === "driver" || secondaryRole === "driver" || role === "admin";
        if (!isDriver) {
          logger.warn({ socketId: socket.id, role, secondaryRole, userId: socket.data.userId }, "Socket join rejected — transport:drivers requires driver role");
          return;
        }
      }

      socket.join(roomName);
      logger.debug(
        { socketId: socket.id, room: roomName, userId: socket.data.userId },
        "Socket joined room",
      );
    });

    socket.on("leave", (roomName: string) => {
      if (typeof roomName === "string" && roomName) {
        socket.leave(roomName);
        logger.debug(
          { socketId: socket.id, room: roomName, userId: socket.data.userId },
          "Socket left room",
        );
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info(
        { socketId: socket.id, userId: socket.data.userId, reason },
        "Socket disconnected",
      );
    });
  });

  logger.info("⚡ Socket.io server initialized — path: /api/socket.io");
  return _io;
}

export function getIO(): Server {
  if (!_io) throw new Error("Socket.io server not initialized");
  return _io;
}

export function emitToRoom(room: string, event: string, data: unknown): void {
  if (!_io) return;
  _io.to(room).emit(event, data);
}
