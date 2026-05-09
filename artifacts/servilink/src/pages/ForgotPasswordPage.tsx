import { useState } from "react";
import { Link } from "wouter";
import { Zap, Mail, ArrowLeft, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useSeo } from "@/lib/seo-helpers";

export function ForgotPasswordPage() {
  useSeo({ title: "Recuperar contraseña — LinkServi", noIndex: true });
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error inesperado");
      setStatus("sent");
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden"
         style={{ background: "linear-gradient(145deg, #0B0F19 0%, #0f1724 50%, #111827 100%)" }}>

      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/3 w-72 h-72 rounded-full pointer-events-none"
           style={{ background: "radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)" }} />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-11 h-11 rounded-2xl btn-gradient flex items-center justify-center shadow-lg glow-cyan">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">LinkServi</span>
        </div>

        <div className="glass-strong rounded-3xl p-8">
          {status === "sent" ? (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white mb-2">Revisa tu correo</h1>
                <p className="text-white/50 text-sm leading-relaxed">
                  Si <strong className="text-white/80">{email}</strong> está registrado, recibirás un enlace para restablecer tu contraseña.
                </p>
                <p className="text-white/30 text-xs mt-2">
                  Válido por 30 minutos. Revisa también tu carpeta de spam.
                </p>
              </div>
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl glass border border-white/10 text-white/70 text-sm font-medium hover:text-white hover:border-white/20 transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white mb-1">¿Olvidaste tu contraseña?</h1>
              <p className="text-white/50 text-sm mb-6">
                Ingresa tu correo y te enviaremos un enlace de recuperación.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                      className="input-glass pl-10"
                    />
                  </div>
                </div>

                {status === "error" && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === "loading" || !email.trim()}
                  className="btn-gradient w-full py-3.5 text-sm flex items-center justify-center gap-2 mt-1"
                >
                  {status === "loading" ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : "Enviar enlace de recuperación"}
                </button>
              </form>

              <div className="mt-5 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-white/35 hover:text-cyan-400 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio de sesión
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
