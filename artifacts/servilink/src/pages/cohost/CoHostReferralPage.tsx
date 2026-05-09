import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Copy, Share2, Users, Gift, Zap, Check, ChevronRight, Star } from "lucide-react";

async function fetchReferral() {
  return apiFetch("/api/referral/me", { headers: getAuthHeader() });
}

export function CoHostReferralPage() {
  const [copied, setCopied] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["referral-me"], queryFn: fetchReferral });
  const info = data as any;

  const referralUrl: string = info?.referralUrl ?? "";
  const code: string        = info?.referralCode ?? "";
  const count: number       = info?.referralCount ?? 0;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Enlace copiado", description: "Compártelo por WhatsApp o redes sociales." });
    } catch {
      toast({ title: "Copia este enlace", description: referralUrl });
    }
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `🛍 ¡Únete a ServiMarket y vende en Venezuela!\n\nUsa mi código *${code}* al registrarte y tu primer producto recibe *48h Premium gratis* ⭐\n\n${referralUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const steps = [
    { icon: Share2, title: "Comparte tu enlace",    desc: "Envíalo a vendedores por WhatsApp, Instagram o Telegram" },
    { icon: Users,  title: "Se registran contigo", desc: "Usan tu código al crear su cuenta en LinkServi" },
    { icon: Gift,   title: "Ambos ganan",           desc: "Su primer producto recibe 48h Premium gratis automáticamente" },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invitar Vendedores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Trae nuevos vendedores y <span style={{ color: "#f59e0b" }} className="font-medium">ambos reciben 48h Premium gratis</span>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-foreground">{count}</p>
          <p className="text-xs text-muted-foreground mt-1">Vendedores referidos</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <Zap className="w-4 h-4" style={{ color: "#f59e0b" }} />
            <p className="text-3xl font-bold" style={{ color: "#f59e0b" }}>48h</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Premium por cada referido</p>
        </div>
      </div>

      {/* Referral card */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: "linear-gradient(135deg,rgba(245,158,11,0.1),rgba(217,119,6,0.06))", border: "1px solid rgba(245,158,11,0.25)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-4 h-4" style={{ color: "#f59e0b" }} />
          <p className="text-sm font-bold text-foreground">Tu enlace de referido</p>
        </div>

        {isLoading ? (
          <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
        ) : (
          <>
            {/* Code chip */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Código:</span>
              <span className="font-mono font-black text-base tracking-widest px-3 py-1 rounded-lg"
                style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                {code}
              </span>
            </div>

            {/* URL */}
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="flex-1 text-xs text-muted-foreground truncate">{referralUrl}</p>
              <button onClick={copyLink} className="flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                style={{ background: copied ? "rgba(16,185,129,0.15)" : "rgba(6,182,212,0.12)", color: copied ? "#6ee7b7" : "#67e8f9" }}>
                {copied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
              </button>
            </div>

            {/* Share buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={shareWhatsApp}
                className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </button>
              <button onClick={copyLink}
                className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)" }}>
                <Share2 className="w-4 h-4" />
                Copiar enlace
              </button>
            </div>
          </>
        )}
      </div>

      {/* How it works */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">¿Cómo funciona?</p>
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3 glass rounded-xl p-3.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,rgba(6,182,212,0.2),rgba(59,130,246,0.15))" }}>
              <s.icon className="w-4 h-4" style={{ color: "#67e8f9" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{s.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
            )}
          </div>
        ))}
      </div>

      {/* Trust note */}
      <div className="rounded-xl p-3.5 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-xs text-muted-foreground leading-relaxed">
          El trial Premium se activa automáticamente al publicar el primer producto.<br />
          No requiere pago ni tarjeta de crédito.
        </p>
      </div>
    </div>
  );
}
