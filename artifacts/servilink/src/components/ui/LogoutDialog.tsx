import { useState } from "react";
import { useLocation } from "wouter";
import { LogOut, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface LogoutDialogProps {
  variant?: "sidebar" | "mobile";
  onClose?: () => void;
}

export function LogoutButton({ variant = "sidebar", onClose }: LogoutDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { logout } = useAuth();
  const [, navigate] = useLocation();

  const handleLogout = () => {
    setLoading(true);
    setTimeout(() => {
      logout();
      navigate("/login", { replace: true } as any);
    }, 350);
  };

  if (variant === "mobile") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors text-slate-500 hover:text-red-400"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" strokeWidth={1.8} />
          <span className="text-[10px] font-medium leading-tight">Salir</span>
        </button>
        {open && <LogoutModal loading={loading} onCancel={() => setOpen(false)} onConfirm={handleLogout} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); onClose?.(); }}
        className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-all duration-150"
      >
        <LogOut className="w-4 h-4 flex-shrink-0" />
        Cerrar sesión
      </button>
      {open && <LogoutModal loading={loading} onCancel={() => setOpen(false)} onConfirm={handleLogout} />}
    </>
  );
}

function LogoutModal({ onCancel, onConfirm, loading }: { onCancel: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex flex-col items-center gap-1 px-6 pt-6 pb-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-1">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-foreground">¿Cerrar sesión?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Serás redirigido a la pantalla de inicio. Tendrás que volver a ingresar tus datos para acceder.
          </p>
        </div>

        <div className="flex flex-col gap-2 px-6 pt-4">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Cerrando sesión...
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4" />
                Sí, cerrar sesión
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full py-3 rounded-xl border border-border bg-muted/40 text-foreground font-medium text-sm hover:bg-muted transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
