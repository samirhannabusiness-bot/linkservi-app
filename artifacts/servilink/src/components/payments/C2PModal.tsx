import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Shield, CheckCircle2, AlertTriangle, Loader2, Zap, Smartphone, CreditCard, Clock, RefreshCw } from "lucide-react";
import { BANCOS_VE } from "@/lib/bancos-ve";
import { getAuthHeader, notifyIfVerificationRequired } from "@/lib/api";
import { useBcvRate } from "@/hooks/useBcvRate";
import { useToast } from "@/hooks/use-toast";

export type C2PReferenceType =
  | "booking"
  | "product_order"
  | "order_group"
  | "custom_order"
  | "client_premium"
  | "worker_premium"
  | "cohost_plan"
  | "ride"
  | "worker_featured"
  | "business_premium"
  | "wallet_deposit";

export interface C2PSuccessPayload {
  transactionId: number;
  endToEndId?: string;
  referencia?: string;
  date?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  amountUsd: number;
  concept?: string;
  referenceType: C2PReferenceType;
  referenceId?: number | null;
  metadata?: Record<string, any>;
  onSuccess: (payload: C2PSuccessPayload) => void;
}

type Step = "form" | "otp" | "success";

// El OTP del BDV expira a los ~2 minutos. Damos un margen un poco menor
// para que el cliente lo confirme antes que el banco lo rechace por tiempo.
const OTP_TTL_SECONDS = 110;

const friendlyError = (raw?: string): string => {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("no afiliado") || m.includes("no esta afiliado") || m.includes("no está afiliado"))
    return "Tu teléfono o cédula aún no están afiliados al servicio C2P del banco. Verifica con tu banco que tu Pago Móvil esté activo.";
  if (m.includes("saldo") || m.includes("fondos") || m.includes("insuficiente"))
    return "Saldo insuficiente. Verifica el saldo de tu cuenta y vuelve a intentar.";
  if (m.includes("clave") || m.includes("otp") || m.includes("incorrect") || m.includes("invalid"))
    return "La clave que ingresaste es incorrecta o expiró. Solicita una nueva.";
  if (m.includes("límite") || m.includes("limite") || m.includes("excede"))
    return "El monto excede tu límite diario de Pago Móvil. Reduce el monto o aumenta tu límite con tu banco.";
  if (m.includes("ced") || m.includes("documento"))
    return "La cédula no es válida o no coincide con el número de teléfono. Verifica los datos.";
  return raw ?? "Ocurrió un problema procesando el pago. Intenta de nuevo.";
};

export function C2PModal({
  open, onClose, amountUsd, concept, referenceType, referenceId, metadata, onSuccess,
}: Props) {
  const { data: bcvData, formatBs } = useBcvRate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("form");
  const [cedula, setCedula] = useState("");
  const [phone, setPhone] = useState("");
  const [bankCode, setBankCode] = useState("0102");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successData, setSuccessData] = useState<C2PSuccessPayload | null>(null);
  // Cuenta regresiva del OTP en segundos. 0 = expirado.
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(OTP_TTL_SECONDS);

  const cedulaRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep("form"); setOtp(""); setError(""); setSuccessData(null); setLoading(false);
      setOtpSecondsLeft(OTP_TTL_SECONDS);
      setTimeout(() => cedulaRef.current?.focus(), 250);
    }
  }, [open]);

  // Cuenta regresiva del OTP — solo activa mientras estamos en el paso "otp"
  useEffect(() => {
    if (step !== "otp") return;
    if (otpSecondsLeft <= 0) return;
    const t = setInterval(() => {
      setOtpSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [step, otpSecondsLeft]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, [open]);

  // Focus OTP when entering OTP step
  useEffect(() => {
    if (step === "otp") setTimeout(() => otpRef.current?.focus(), 250);
  }, [step]);

  const handleRequestOtp = async () => {
    setError("");
    const cedulaClean = cedula.trim().toUpperCase();
    const phoneClean = phone.trim().replace(/\D/g, "");
    if (!/^[VEJGP]\d{6,9}$/.test(cedulaClean)) {
      setError("Cédula inválida. Formato: V12345678 (incluye la letra V/E/J/G/P)"); return;
    }
    if (!/^0\d{10}$/.test(phoneClean)) {
      setError("Teléfono inválido. Debe tener 11 dígitos comenzando con 0 (ej: 04141234567)"); return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/payments/bdv/c2p/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ customerDocumentId: cedulaClean }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        // Si es 403 con code de verificación, dispara toast global con CTA y
        // cerramos el modal para que el usuario vea la acción "Verificar ahora".
        if (notifyIfVerificationRequired(r, data)) { onClose(); return; }
        setError(friendlyError(data.message ?? data.error));
        return;
      }
      setStep("otp");
      setOtpSecondsLeft(OTP_TTL_SECONDS);
      setOtp("");
      toast({ title: "Clave enviada", description: "Revisa los SMS de tu teléfono." });
    } catch (e: any) {
      setError("Error de red: " + e.message);
    } finally { setLoading(false); }
  };

  const handleConfirm = async () => {
    setError("");
    if (!/^\d{4,8}$/.test(otp.trim())) {
      setError("La clave debe tener entre 4 y 8 dígitos"); return;
    }
    setLoading(true);
    try {
      const cedulaClean = cedula.trim().toUpperCase();
      const phoneClean = phone.trim().replace(/\D/g, "");
      const amountVes = bcvData ? Math.round(amountUsd * bcvData.rate * 100) / 100 : null;
      if (!amountVes) {
        setError("No se pudo obtener la tasa BCV. Recarga la página e intenta de nuevo."); return;
      }
      const r = await fetch("/api/payments/bdv/c2p/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          customerDocumentId: cedulaClean,
          customerPhone: phoneClean,
          customerBankCode: bankCode,
          amount: amountVes,
          concept: concept ?? "Pago LinkServi",
          otp: otp.trim(),
          referenceType,
          referenceId: referenceId ?? null,
          metadata: metadata ?? null,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data.success) {
        if (notifyIfVerificationRequired(r, data)) { onClose(); return; }
        setError(friendlyError(data.message ?? data.error));
        return;
      }
      const payload: C2PSuccessPayload = {
        transactionId: data.transactionId,
        endToEndId: data.endToEndId,
        referencia: data.referencia,
        date: data.date,
      };
      setSuccessData(payload);
      setStep("success");
      toast({ title: "✅ Pago confirmado", description: "El banco aprobó el cobro." });
      // Notify caller after a short delay so user sees success animation
      setTimeout(() => onSuccess(payload), 1800);
    } catch (e: any) {
      setError("Error de red: " + e.message);
    } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
        style={{ background: "rgba(2,6,23,0.85)", backdropFilter: "blur(8px)" }}
        onClick={loading ? undefined : onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          onClick={e => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
          style={{
            background: "linear-gradient(180deg, #0b1628 0%, #040c1a 100%)",
            border: "1px solid rgba(56,189,248,0.18)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(56,189,248,0.10)",
            maxHeight: "92vh",
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-5 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #38bdf8, #0ea5e9)", boxShadow: "0 8px 24px rgba(56,189,248,0.35)" }}>
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-black text-white leading-tight">Pago Móvil C2P</h2>
                <p className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: "rgba(56,189,248,0.85)" }}>
                  Banco de Venezuela · Instantáneo
                </p>
              </div>
            </div>
            <button onClick={onClose} disabled={loading}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.06)" }}>
              <X className="w-4 h-4 text-white/70" />
            </button>
          </div>

          {/* Amount */}
          <div className="px-5 py-4 text-center" style={{ background: "rgba(56,189,248,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              Monto a debitar
            </p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-3xl font-black text-white">${amountUsd.toFixed(2)}</span>
              <span className="text-xs font-semibold text-white/40">USD</span>
            </div>
            {bcvData && (
              <p className="text-sm font-bold mt-1" style={{ color: "rgba(16,185,129,0.95)" }}>
                ≈ {formatBs(amountUsd)}
              </p>
            )}
          </div>

          {/* Body — scrollable */}
          <div className="overflow-y-auto px-5 py-5" style={{ flex: 1 }}>
            {step === "form" && (
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                {/* Cédula */}
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Cédula del pagador <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <input
                    ref={cedulaRef}
                    value={cedula}
                    onChange={e => setCedula(e.target.value.toUpperCase())}
                    placeholder="V12345678"
                    autoComplete="off"
                    className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-white placeholder:text-white/25 focus:outline-none transition-all"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = "rgba(56,189,248,0.6)")}
                    onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)")}
                  />
                  <p className="text-[10px] mt-1 ml-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Incluye la letra: V, E, J, G o P
                  </p>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Teléfono del Pago Móvil <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(56,189,248,0.6)" }} />
                    <input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="04141234567"
                      type="tel"
                      autoComplete="tel"
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-semibold text-white placeholder:text-white/25 focus:outline-none"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = "rgba(56,189,248,0.6)")}
                      onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)")}
                    />
                  </div>
                </div>

                {/* Bank */}
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: "rgba(255,255,255,0.85)" }}>
                    Banco origen <span style={{ color: "#38bdf8" }}>*</span>
                  </label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "rgba(56,189,248,0.6)" }} />
                    <select
                      value={bankCode}
                      onChange={e => setBankCode(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-semibold text-white focus:outline-none appearance-none cursor-pointer"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                    >
                      {BANCOS_VE.map(b => (
                        <option key={b.code} value={b.code} style={{ background: "#0b1628" }}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Trust banner */}
                <div className="flex items-start gap-2 p-3 rounded-xl"
                  style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.20)" }}>
                  <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "rgba(16,185,129,0.95)" }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: "rgba(167,243,208,0.95)" }}>
                    El banco te enviará una <strong>clave temporal por SMS</strong> para autorizar este cobro. Tu cédula y teléfono <strong>nunca</strong> se comparten con terceros.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl"
                    style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                    <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
                  </div>
                )}
              </motion.div>
            )}

            {step === "otp" && (() => {
              const expired = otpSecondsLeft <= 0;
              const urgent = otpSecondsLeft > 0 && otpSecondsLeft <= 20;
              const mm = Math.floor(otpSecondsLeft / 60);
              const ss = otpSecondsLeft % 60;
              const timeText = `${mm}:${ss.toString().padStart(2, "0")}`;
              const timeColor = expired ? "#ef4444" : urgent ? "#f59e0b" : "#38bdf8";
              const timeBg = expired
                ? "rgba(239,68,68,0.10)"
                : urgent
                  ? "rgba(245,158,11,0.10)"
                  : "rgba(56,189,248,0.10)";
              const timeBorder = expired
                ? "rgba(239,68,68,0.35)"
                : urgent
                  ? "rgba(245,158,11,0.35)"
                  : "rgba(56,189,248,0.30)";
              return (
              <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                <div className="text-center py-2">
                  <div className="inline-flex w-14 h-14 rounded-full items-center justify-center mb-3"
                    style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.35)" }}>
                    <Smartphone className="w-6 h-6" style={{ color: "#38bdf8" }} />
                  </div>
                  <h3 className="text-lg font-black text-white mb-1">Ingresa la clave</h3>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Te enviamos un SMS al <span className="font-bold text-white">{phone}</span>
                  </p>
                </div>

                {/* Cuenta regresiva — el OTP expira a los ~2 minutos */}
                <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl mx-auto"
                  style={{ background: timeBg, border: `1px solid ${timeBorder}`, width: "fit-content" }}>
                  <Clock className="w-3.5 h-3.5" style={{ color: timeColor }} />
                  <span className="text-xs font-bold" style={{ color: timeColor }}>
                    {expired ? "La clave expiró" : `Válida por ${timeText}`}
                  </span>
                </div>

                <div>
                  <input
                    ref={otpRef}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••••"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    disabled={expired}
                    className="w-full text-center text-3xl font-black tracking-[0.5em] py-4 rounded-xl text-white placeholder:text-white/15 focus:outline-none disabled:opacity-40"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${expired ? "rgba(239,68,68,0.30)" : "rgba(56,189,248,0.30)"}`,
                      letterSpacing: "0.5em",
                    }}
                  />
                  <p className="text-[10px] text-center mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Entre 4 y 8 dígitos
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-xl"
                    style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                    <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
                  </div>
                )}

                {/* Botón de reenvío — siempre visible, destacado cuando expira */}
                <button
                  onClick={handleRequestOtp}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold disabled:opacity-30 transition-all active:scale-[0.98]"
                  style={{
                    background: expired
                      ? "linear-gradient(135deg, rgba(56,189,248,0.20), rgba(14,165,233,0.20))"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${expired ? "rgba(56,189,248,0.55)" : "rgba(255,255,255,0.10)"}`,
                    color: expired ? "#7dd3fc" : "rgba(56,189,248,0.85)",
                  }}
                >
                  {loading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Enviando…</>
                    : <><RefreshCw className="w-3.5 h-3.5" />{expired ? "Solicitar nueva clave" : "Reenviar clave por SMS"}</>}
                </button>
              </motion.div>
              );
            })()}

            {step === "success" && successData && (
              <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", damping: 18 }}
                className="flex flex-col items-center text-center py-6">
                <motion.div
                  initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", damping: 12, delay: 0.1 }}
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", boxShadow: "0 0 60px rgba(16,185,129,0.45)" }}>
                  <CheckCircle2 className="w-10 h-10 text-white" />
                </motion.div>
                <h3 className="text-xl font-black text-white mb-1">¡Pago aprobado!</h3>
                <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
                  El banco debitó {bcvData ? formatBs(amountUsd) : `$${amountUsd.toFixed(2)}`} de tu cuenta.
                </p>
                {successData.referencia && (
                  <div className="w-full p-3 rounded-xl text-left"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex justify-between text-[11px] py-1">
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>Referencia BDV</span>
                      <span className="font-mono font-bold text-white">{successData.referencia}</span>
                    </div>
                    {successData.date && (
                      <div className="flex justify-between text-[11px] py-1">
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>Fecha</span>
                        <span className="font-mono font-bold text-white">{successData.date}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Footer CTA */}
          {step !== "success" && (
            <div className="px-5 pb-5 pt-2" style={{ background: "rgba(255,255,255,0.02)" }}>
              {step === "form" && (
                <button onClick={handleRequestOtp} disabled={loading}
                  className="w-full py-4 rounded-2xl font-black text-sm text-white transition-all disabled:opacity-50 active:scale-[0.98]"
                  style={{
                    background: loading ? "#0891b2" : "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 50%, #0284c7 100%)",
                    boxShadow: "0 10px 30px rgba(56,189,248,0.35)",
                  }}>
                  {loading
                    ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Solicitando clave…</span>
                    : <span className="flex items-center justify-center gap-2"><Zap className="w-4 h-4" />Solicitar clave por SMS</span>}
                </button>
              )}
              {step === "otp" && (
                <button onClick={handleConfirm} disabled={loading || otp.length < 4 || otpSecondsLeft <= 0}
                  className="w-full py-4 rounded-2xl font-black text-sm text-white transition-all disabled:opacity-40 active:scale-[0.98]"
                  style={{
                    background: loading ? "#059669" : "linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)",
                    boxShadow: "0 10px 30px rgba(16,185,129,0.35)",
                  }}>
                  {loading
                    ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Procesando con BDV…</span>
                    : <span className="flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />Confirmar pago</span>}
                </button>
              )}
              <p className="text-center text-[10px] mt-3" style={{ color: "rgba(255,255,255,0.30)" }}>
                Powered by BDV C2P · Cobro instantáneo
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
