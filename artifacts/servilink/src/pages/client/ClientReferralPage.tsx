import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeader } from "@/lib/api";
import { Gift, Copy, Check, Users, DollarSign, Share2, ChevronRight } from "lucide-react";

async function fetchReferral() {
  const res = await fetch("/api/referral/me", { headers: getAuthHeader() });
  if (!res.ok) return null;
  return res.json();
}

async function useReferralCode(code: string) {
  const res = await fetch("/api/referral/use", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Error al usar código");
  return data;
}

export function ClientReferralPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [referCode, setReferCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchReferral().then((d) => { setData(d); setLoading(false); });
  }, []);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    if (!data) return;
    const text = `🔧 ¡Únete a LinkServi! La plataforma de servicios y ServiMarket de Venezuela.\nUsa mi código ${data.referralCode} al registrarte y obtén $2 de bono. 🎁\n${data.referralUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referCode.trim()) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const result = await useReferralCode(referCode.trim());
      setApplyResult({ success: true, message: `¡Código aplicado! Ganaste $${result.bonusEarned} de bono gracias a ${result.referrerName}.` });
      const refreshed = await fetchReferral();
      setData(refreshed);
    } catch (err: any) {
      setApplyResult({ success: false, message: err.message });
    } finally {
      setApplying(false);
    }
  };

  if (loading) return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Referidos y Bonos</h1>
          <p className="text-sm text-muted-foreground mt-1">Invita amigos y gana bonos en tu billetera LinkServi</p>
        </div>

        {/* Bonus balance */}
        <div className="bg-gradient-to-br from-primary/90 to-primary rounded-2xl p-6 text-primary-foreground shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-5 h-5 opacity-80" />
            <p className="text-sm font-medium opacity-80">Tu bono acumulado</p>
          </div>
          <p className="text-4xl font-bold">${(data?.referralBonus ?? 0).toFixed(2)}</p>
          <p className="text-xs opacity-70 mt-1">Se aplica automáticamente en tu próxima solicitud</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{data?.referralCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Amigos referidos</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">${((data?.referralCount ?? 0) * 5).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Total ganado</p>
            </div>
          </div>
        </div>

        {/* My referral code */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" /> Tu código de referido
          </h2>
          <p className="text-sm text-muted-foreground">Comparte este código con amigos. Ganas <strong className="text-foreground">$5</strong> por cada amigo que se registre, y tu amigo recibe <strong className="text-foreground">$2</strong> de bono.</p>

          <div className="flex items-center gap-2">
            <div className="flex-1 bg-muted rounded-xl px-4 py-3">
              <span className="text-xl font-bold font-mono tracking-widest text-foreground">{data?.referralCode ?? "—"}</span>
            </div>
            <button
              onClick={() => copy(data?.referralCode ?? "")}
              className="px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              {copied ? <><Check className="w-4 h-4" /> Copiado</> : <><Copy className="w-4 h-4" /> Copiar</>}
            </button>
          </div>

          <button
            onClick={shareWhatsApp}
            className="w-full py-2.5 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            Compartir por WhatsApp
          </button>
        </div>

        {/* Use a referral code */}
        {!data?.referredBy && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-foreground">Usar código de un amigo</h2>
            <p className="text-sm text-muted-foreground">Si alguien te invitó, ingresa su código y recibe un bono de $2 en tu billetera.</p>
            <form onSubmit={handleApplyCode} className="flex gap-2">
              <input
                type="text"
                value={referCode}
                onChange={(e) => setReferCode(e.target.value.toUpperCase())}
                placeholder="Ej: ROBQ8Y"
                maxLength={8}
                className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary uppercase"
              />
              <button
                type="submit"
                disabled={applying || !referCode.trim()}
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                {applying ? "..." : <><ChevronRight className="w-4 h-4" /> Aplicar</>}
              </button>
            </form>
            {applyResult && (
              <div className={`px-3 py-2 rounded-lg text-sm ${applyResult.success ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {applyResult.message}
              </div>
            )}
          </div>
        )}

        {data?.referredBy && (
          <div className="px-4 py-3 rounded-xl bg-muted border border-border text-sm text-muted-foreground">
            ✅ Ya usaste el código <span className="font-mono font-bold text-foreground">{data.referredBy}</span> y recibiste tu bono.
          </div>
        )}

        {/* How it works */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">¿Cómo funciona?</h2>
          <div className="space-y-2">
            {[
              { step: "1", text: "Comparte tu código único con amigos y familiares" },
              { step: "2", text: "Tu amigo se registra en LinkServi usando tu código" },
              { step: "3", text: "Ambos reciben bonos: tú $5, tu amigo $2" },
              { step: "4", text: "Los bonos se aplican automáticamente en servicios" },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step}
                </div>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
