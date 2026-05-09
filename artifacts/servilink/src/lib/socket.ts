import { io, type Socket } from "socket.io-client";

let _socket: Socket | null = null;

// Rooms the current session has joined — used to re-join automatically on reconnect
const _activeRooms = new Set<string>();

function getSocketUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function getAuthToken(): string {
  return localStorage.getItem("sl_token") ?? "";
}

export function getSocket(): Socket {
  if (_socket?.connected) return _socket;

  // Clean up a disconnected instance before creating a new one
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }

  _socket = io(getSocketUrl(), {
    path: "/api/socket.io",
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: { token: getAuthToken() },
  });

  // ── Re-join all active rooms on every (re)connect ──────────────────────────
  _socket.on("connect", () => {
    if (import.meta.env.DEV) console.log("[socket] connected:", _socket?.id);
    _activeRooms.forEach((room) => _socket!.emit("join", room));
  });

  // ── Auth rejection — session expired ───────────────────────────────────────
  _socket.on("connect_error", (err) => {
    if (err.message === "Unauthorized") {
      // Stop all reconnection attempts — retrying with the same bad token is useless
      _socket?.disconnect();
      _socket = null;
      _activeRooms.clear();
      window.dispatchEvent(new CustomEvent("socket:session-expired"));
    } else if (import.meta.env.DEV) {
      console.warn("[socket] connect_error:", err.message);
    }
  });

  // ── All reconnect attempts exhausted ───────────────────────────────────────
  _socket.on("reconnect_failed", () => {
    window.dispatchEvent(new CustomEvent("socket:reconnect-failed"));
  });

  // ── Dev-only disconnect logging ────────────────────────────────────────────
  if (import.meta.env.DEV) {
    _socket.on("disconnect", (reason) => {
      console.log("[socket] disconnected:", reason);
    });
  }

  return _socket;
}

export function joinRoom(room: string): void {
  _activeRooms.add(room);
  getSocket().emit("join", room);
}

export function leaveRoom(room: string): void {
  _activeRooms.delete(room);
  const s = _socket;
  if (s) s.emit("leave", room);
}

export function disconnectSocket(): void {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
  _activeRooms.clear();
}
