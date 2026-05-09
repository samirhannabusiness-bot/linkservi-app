import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { autoSubscribeIfPermitted } from "./push";

export type AdminRole = "super_admin" | "soporte" | "finanzas";
export type ActiveMode = "primary" | "secondary";
// "manager" / "worker" / "driver" are additional UI modes (orthogonal to
// primary/secondary). When the user is in one of these modes, the app routes
// them to the matching dashboard (/manager, /professional, /driver/transport).
// Cliente mode is the default — primary/secondary still drives the classic
// role-switching for cohost ↔ client.
export type AppMode = "client" | "worker" | "manager" | "driver";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: "client" | "worker" | "admin" | "cohost" | "seller";
  // Multi-role array. Includes "client", and may also include "worker",
  // "cohost", "admin", "seller", and/or "gestor" — the new role added when a
  // user accepts a manager invitation. Backwards compatible with `role`.
  roles?: string[];
  secondaryRole?: string | null;
  adminRole?: AdminRole | null;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  state?: string | null;
  city?: string | null;
  clientPlan?: "free" | "premium";
  clientPremiumUntil?: string | null;
  clientPremiumDiscount?: number;
  emailVerified?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
  isLoading: boolean;
  activeMode: ActiveMode;
  setActiveMode: (mode: ActiveMode) => void;
  hasDualRole: boolean;
  // ── Multi-role helpers (gestor system) ──────────────────────────────────────
  hasRole: (role: string) => boolean;
  isManager: boolean;
  isWorker: boolean;
  isDriver: boolean;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
}

// sl_token is intentionally NOT stored in localStorage — it lives only in the
// HttpOnly cookie (set by the backend) and in React state (in-memory only).
// This prevents XSS attacks from stealing the session token.
const USER_KEY = "sl_user";
const MODE_KEY = "sl_active_mode";
const APP_MODE_KEY = "sl_app_mode";

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function readCachedMode(): ActiveMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return (raw === "secondary" ? "secondary" : "primary") as ActiveMode;
  } catch {
    return "primary";
  }
}

function readCachedAppMode(): AppMode {
  try {
    const raw = localStorage.getItem(APP_MODE_KEY);
    if (raw === "manager") return "manager";
    if (raw === "worker") return "worker";
    if (raw === "driver") return "driver";
    return "client";
  } catch {
    return "client";
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // token lives ONLY in React state — never written to localStorage.
  // On fresh page load it starts null; it is set either:
  //   a) immediately after login/register (backend returns it in body)
  //   b) as the sentinel "__cookie__" when the session is restored from the
  //      HttpOnly cookie via the /api/auth/me check below.
  const [token, setToken] = useState<string | null>(null);

  // User profile is cached in localStorage for instant first paint (no flicker).
  // It is NOT a security credential — only the cookie matters for auth.
  const [user, setUser] = useState<AuthUser | null>(() => readCachedUser());

  const [activeMode, setActiveModeState] = useState<ActiveMode>(() => readCachedMode());
  const [appMode, setAppModeState] = useState<AppMode>(() => readCachedAppMode());

  // Always fire the /api/auth/me check if we have a cached user — the HttpOnly
  // cookie will be sent automatically (same-origin) without any Authorization
  // header. If the cookie is valid the server returns fresh user data; if it has
  // expired the server returns 401 and we clear the session.
  const hasCachedUser = !!readCachedUser();
  const { data, isLoading, error } = useGetMe({
    query: {
      enabled: hasCachedUser || !!token,
      retry: 2,
      retryDelay: 1200,
      staleTime: 60_000,
    },
    // No Authorization header — the HttpOnly cookie is sent automatically.
    // If `token` is the in-memory JWT (right after login), it is sent as Bearer
    // header for compatibility; on subsequent refreshes the cookie takes over.
    request: {
      headers: token && token !== "__cookie__" ? { Authorization: `Bearer ${token}` } : {},
    },
  } as any);

  useEffect(() => {
    if (!data) return;
    const fresh = data as unknown as AuthUser;
    setUser(fresh);
    localStorage.setItem(USER_KEY, JSON.stringify(fresh));
    // If token is still null (session restored from cookie after page refresh),
    // set the sentinel so components that check `!!token` know they're authenticated.
    setToken(prev => prev ?? "__cookie__");
  }, [data]);

  useEffect(() => {
    if (!error) return;
    const status: number =
      (error as any)?.status ??
      (error as any)?.response?.status ??
      0;
    // Only 401 means "session is dead" (no/invalid cookie). 403 from /me would
    // mean "authenticated but forbidden" — we should NOT log the user out for
    // a transient 403, that was causing the "I clicked a button and got
    // logged out" reports. The /me endpoint never legitimately returns 403
    // for a healthy session.
    if (status === 401) {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(MODE_KEY);
      setToken(null);
      setUser(null);
      setActiveModeState("primary");
    }
  }, [error]);

  const setAuth = useCallback((newUser: AuthUser, newToken: string) => {
    // Store user profile for fast initial render — NOT the token.
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setTimeout(() => autoSubscribeIfPermitted(), 500);
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const logout = useCallback(async () => {
    // Ask the backend to clear the HttpOnly cookie — the frontend cannot do this.
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors — local state is cleared regardless.
    }
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(MODE_KEY);
    localStorage.removeItem(APP_MODE_KEY);
    setToken(null);
    setUser(null);
    setActiveModeState("primary");
    setAppModeState("client");
  }, []);

  const setActiveMode = useCallback((mode: ActiveMode) => {
    localStorage.setItem(MODE_KEY, mode);
    setActiveModeState(mode);
  }, []);

  const setAppMode = useCallback((mode: AppMode) => {
    localStorage.setItem(APP_MODE_KEY, mode);
    setAppModeState(mode);
  }, []);

  const loading = isLoading && !user;

  const hasDualRole = !!user && (
    (user.role !== "client" && user.secondaryRole === "client") ||
    (user.role === "client" && user.secondaryRole === "worker")
  );

  // ── Multi-role helpers ─────────────────────────────────────────────────────
  const hasRole = useCallback((role: string): boolean => {
    if (!user) return false;
    if (Array.isArray(user.roles) && user.roles.includes(role)) return true;
    if (user.role === role) return true;
    if (user.secondaryRole === role) return true;
    return false;
  }, [user]);

  const isManager = !!user && (
    (Array.isArray(user.roles) && user.roles.includes("gestor")) ||
    (user.role as string) === "gestor" ||
    user.secondaryRole === "gestor"
  );

  const isWorker = !!user && (
    (Array.isArray(user.roles) && user.roles.includes("worker")) ||
    user.role === "worker" ||
    user.secondaryRole === "worker"
  );

  const isDriver = !!user && (
    (Array.isArray(user.roles) && user.roles.includes("driver")) ||
    (user.role as string) === "driver" ||
    user.secondaryRole === "driver"
  );

  // If the user no longer has the role backing their current appMode, force-
  // collapse back to "client" so we never strand them on a screen they can't use.
  // Guarded against the bootstrap race: when there is no `user` yet (page just
  // loaded, /api/auth/me still in flight) we skip the check, otherwise a cached
  // `sl_app_mode=driver` would be wiped before the roles array even arrives.
  useEffect(() => {
    if (!user) return;
    if (appMode === "manager" && !isManager) {
      setAppModeState("client");
      try { localStorage.setItem(APP_MODE_KEY, "client"); } catch { /* ignore */ }
    }
    if (appMode === "worker" && !isWorker) {
      setAppModeState("client");
      try { localStorage.setItem(APP_MODE_KEY, "client"); } catch { /* ignore */ }
    }
    if (appMode === "driver" && !isDriver) {
      setAppModeState("client");
      try { localStorage.setItem(APP_MODE_KEY, "client"); } catch { /* ignore */ }
    }
  }, [user, appMode, isManager, isWorker, isDriver]);

  return (
    <AuthContext.Provider value={{
      user, token, setAuth, updateUser, logout, isLoading: loading,
      activeMode, setActiveMode, hasDualRole,
      hasRole, isManager, isWorker, isDriver, appMode, setAppMode,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
