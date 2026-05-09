// ─────────────────────────────────────────────────────────────────────────────
// serializeAuthUser — single source of truth for the user payload returned by
// every endpoint that emits `{ user, token }` to the frontend (register,
// login, social login, passkeys/biometric verify, /me).
//
// Keeping this consistent prevents the "missing role chips until F5" bug,
// where the login response omitted the `roles` array (and other fields like
// adminRole, state, city, clientPlan) that /me later filled in once it
// loaded — causing the UI to render with incomplete data on first paint.
//
// Any new auth endpoint that emits a user payload MUST use this helper.
// ─────────────────────────────────────────────────────────────────────────────
export function serializeAuthUser(user: any) {
  const isPremiumActive =
    user.clientPlan === "premium" &&
    !!user.clientPremiumUntil &&
    new Date(user.clientPremiumUntil) > new Date();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    roles: Array.isArray(user.roles) ? user.roles : [user.role].filter(Boolean),
    adminRole: user.role === "admin" ? (user.adminRole ?? "super_admin") : null,
    secondaryRole: user.secondaryRole ?? null,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    createdAt: user.createdAt,
    state: user.state ?? null,
    city: user.city ?? null,
    clientPlan: isPremiumActive ? "premium" : "free",
    clientPremiumUntil: user.clientPremiumUntil ?? null,
    clientPremiumDiscount: isPremiumActive ? (user.clientPremiumDiscount ?? 0.05) : 0,
    emailVerified: !!user.emailVerified,
  };
}
