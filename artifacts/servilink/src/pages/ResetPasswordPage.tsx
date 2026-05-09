import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Zap, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, Lock } from "lucide-react";
import { useSeo } from "@/lib/seo-helpers";

type PageState = "validating" | "invalid" | "ready" | "loading" | "success" | "error";

export function ResetPasswordPage() {
  useSeo({ title: "Restablecer contraseña — LinkServi", noIndex: true });
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [pageState, setPageState] = useState<PageState>("validating");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) { setPageState("invalid"); return; }

    fetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => setPageState(data.valid ? "ready" : "invalid"))
      .catch(() => setPageState("invalid"));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 6) {
      setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }

    setPageState("loading");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error inesperado");
      setPageState("success");
    } catch (e: any) {
      setErrorMsg(e.message);
      setPageState("error");
    }
  };

  const passwordStrength = (): { label: string; color: string; width: string } => {
    const len = password.length;
    if (len === 0) return { label: "", color: "bg-slate-700", width: "w-0" };
    if (len < 6) return { label: "Muy corta", color: "bg-red-500", width: "w-1/4" };
    if (len < 10) return { label: "Aceptable", color: "bg-amber-400", width: "w-1/2" };
    if (len < 14 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
      return { label: "Buena", color: "bg-blue-400", width: "w-3/4" };
    return { label: "Excelente", color: "bg-emerald-400", width: "w-full" };
  };

  const strength = passwordStrength();

  return (
    <div className="min-h-screen bg-slate-900 dark:bg-slate-950 flex items-center justify-center p-4 relative">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-cyan-400 flex items-center justify-center">
            <Zap className="w-5 h-5 text-slate-900" />
          </div>
          <span className="text-xl font-black text-white tracking-tight">LinkServi</span>
        </div>

        <div className="bg-slate-800 dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-700">

          {/* Validating */}
          {pageState === "validating" && (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <p className="text-slate-400 text-sm">Verificando enlace...</p>
            </div>
          )}

          {/* Invalid token */}
          {pageState === "invalid" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white mb-2">Enlace inválido</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Este enlace de recuperación ha expirado o ya fue utilizado. Los enlaces son válidos por 30 minutos y de un solo uso.
                </p>
              </div>
              <Link
                href="/forgot-password"
                className="block w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 text-sm font-bold transition-colors text-center"
              >
                Solicitar nuevo enlace
              </Link>
              <Link href="/login" className="block text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Volver al inicio de sesión
              </Link>
            </div>
          )}

          {/* Success */}
          {pageState === "success" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white mb-2">¡Contraseña actualizada!</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Tu contraseña ha sido restablecida correctamente. Ya puedes iniciar sesión con tu nueva contraseña.
                </p>
              </div>
              <button
                onClick={() => navigate("/login")}
                className="w-full py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 font-bold text-sm transition-colors"
              >
                Iniciar sesión
              </button>
            </div>
          )}

          {/* Form */}
          {(pageState === "ready" || pageState === "loading" || pageState === "error") && (
            <>
              <div className="mb-6">
                <div className="w-10 h-10 rounded-xl bg-cyan-400/10 flex items-center justify-center mb-3">
                  <Lock className="w-5 h-5 text-cyan-400" />
                </div>
                <h1 className="text-xl font-bold text-white mb-1">Nueva contraseña</h1>
                <p className="text-slate-400 text-sm">Elige una contraseña segura para proteger tu cuenta.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Nueva contraseña</label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full px-4 py-3 pr-11 rounded-xl bg-slate-700/60 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Strength bar */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                      </div>
                      <p className="text-xs text-slate-500">{strength.label}</p>
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirmar contraseña</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      required
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repite la contraseña"
                      className={`w-full px-4 py-3 pr-11 rounded-xl bg-slate-700/60 border text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all ${
                        confirm.length > 0
                          ? password === confirm
                            ? "border-emerald-500"
                            : "border-red-500"
                          : "border-slate-600"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirm.length > 0 && password !== confirm && (
                    <p className="text-xs text-red-400 mt-1">Las contraseñas no coinciden</p>
                  )}
                </div>

                {errorMsg && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={pageState === "loading" || !password || !confirm}
                  className="w-full py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-900 font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pageState === "loading" ? "Actualizando..." : "Actualizar contraseña"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
