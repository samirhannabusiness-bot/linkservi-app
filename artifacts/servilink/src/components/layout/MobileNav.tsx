import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { LogoutButton } from "@/components/ui/LogoutDialog";
import { Home, ShoppingBag, MessageCircle, User } from "lucide-react";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

// ── Inicio y Perfil cambian según el rol principal del usuario ───────────────
function getHomeHref(role: string, activeMode: string, hasDualRole: boolean): string {
  if (activeMode === "secondary" && hasDualRole) {
    return role === "client" ? "/professional" : "/client";
  }
  if (role === "worker") return "/professional";
  if (role === "cohost") return "/cohost";
  if (role === "seller") return "/seller";
  if (role === "admin") return "/admin";
  return "/client";
}

function getProfileHref(role: string, activeMode: string, hasDualRole: boolean): string {
  if (activeMode === "secondary" && hasDualRole) {
    return role === "client" ? "/professional/profile" : "/client/profile";
  }
  if (role === "worker") return "/professional/profile";
  if (role === "cohost") return "/cohost/profile";
  if (role === "seller") return "/cohost/profile";
  return "/client/profile";
}

export function MobileNav() {
  const { user, activeMode, hasDualRole } = useAuth();
  const [location] = useLocation();
  const unread = useUnreadMessages();

  if (!user) return null;

  // Admin tiene su propio nav especial compacto
  if (user.role === "admin") {
    const adminLinks = [
      { href: "/admin", label: "Inicio", icon: Home },
      { href: "/store", label: "ServiMarket", icon: ShoppingBag },
      { href: "/mensajes", label: "Mensajes", icon: MessageCircle },
      { href: "/admin/users", label: "Perfil", icon: User },
    ];
    return (
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden glass-nav"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch">
          {adminLinks.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href !== "/admin" && location.startsWith(href));
            return (
              <Link key={href} href={href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2.5 gap-1 min-h-[60px] transition-all duration-200",
                  active ? "text-cyan-400" : "text-white/35 hover:text-white/70"
                )}
              >
                <div className={cn(
                  "relative flex items-center justify-center w-8 h-6 rounded-lg transition-all duration-200",
                  active ? "bg-gradient-to-r from-cyan-400/20 to-blue-500/20" : ""
                )}>
                  <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={active ? 2.5 : 1.8} />
                  {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400" />}
                  {href === "/mensajes" && unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                      style={{ background: "#ef4444", lineHeight: 1 }}>
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </div>
                <span className={cn("text-[10px] font-medium leading-tight", active ? "text-cyan-400" : "")}>{label}</span>
              </Link>
            );
          })}
          <LogoutButton variant="mobile" />
        </div>
      </nav>
    );
  }

  // ── 4 puntos universales para todos los demás roles ──────────────────────
  const homeHref    = getHomeHref(user.role, activeMode, hasDualRole);
  const profileHref = getProfileHref(user.role, activeMode, hasDualRole);

  const universalLinks = [
    { href: homeHref,    label: "Inicio",      icon: Home },
    { href: "/store",    label: "ServiMarket",  icon: ShoppingBag },
    { href: "/mensajes", label: "Mensajes",     icon: MessageCircle },
    { href: profileHref, label: "Mi Perfil",    icon: User },
  ];

  // Raíces que NO deben hacer startsWith-match (evitar falsos activos)
  const exactRoots = ["/client", "/professional", "/cohost", "/seller", "/admin"];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden glass-nav"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch">
        {universalLinks.map(({ href, label, icon: Icon }) => {
          const isExactRoot = exactRoots.includes(href);
          const active = isExactRoot
            ? location === href
            : location === href || location.startsWith(href + "/") || location.startsWith(href);
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2.5 gap-1 min-h-[60px] transition-all duration-200",
                active ? "text-cyan-400" : "text-white/35 hover:text-white/70"
              )}
            >
              <div className={cn(
                "relative flex items-center justify-center w-8 h-6 rounded-lg transition-all duration-200",
                active ? "bg-gradient-to-r from-cyan-400/20 to-blue-500/20" : ""
              )}>
                <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={active ? 2.5 : 1.8} />
                {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-400" />}
                {href === "/mensajes" && unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                    style={{ background: "#ef4444", lineHeight: 1 }}>
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </div>
              <span className={cn("text-[10px] font-medium leading-tight", active ? "text-cyan-400" : "")}>{label}</span>
            </Link>
          );
        })}
        <LogoutButton variant="mobile" />
      </div>
    </nav>
  );
}
