import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { getAuthHeader } from "@/lib/api";
import { getSocket, joinRoom, leaveRoom } from "@/lib/socket";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  Send, ArrowLeft, ShieldAlert, MessageCircle,
  Image, Package, ShoppingBag, X, Loader2, ChevronRight, Truck,
  ShoppingCart, Check, Copy, CreditCard, Info,
  CheckCircle, AlertTriangle, Mic, MicOff, Play, Pause,
  Zap, Star, Trash2, Video, CheckCheck, CalendarDays, FileDown,
} from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { useBcvRate } from "@/hooks/useBcvRate";
import { mediaSrc } from "@/lib/media-url";

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────
interface StoreMessage {
  id: number; senderId: number; senderName: string; senderAvatar: string | null;
  content: string; messageType: string; imageUrl: string | null; audioUrl: string | null;
  videoUrl: string | null; productData: string | null; wasFiltered: boolean; isRead: boolean; createdAt: string;
}
interface StoreInfo { id: number; name: string; logoUrl: string | null; coHostId: number; accentColor: string | null; }
interface StoreProduct { id: number; name: string; priceUsd: number; image: string | null; description: string | null; stock: number | null; hasDelivery: boolean; }
interface PurchaseRequestData { productName: string; imageUrl: string | null; priceUsd: number; hasDelivery: boolean; notes: string; }

// ─────────────────────────────────────────────────────────────────────────────
// Quick replies for vendor
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_REPLIES = [
  "¿Cuándo lo necesitas?", "Disponible ✓", "Revisando stock...",
  "Te envío el precio", "Con placer 🙌", "¿Quieres delivery?",
];

// ─────────────────────────────────────────────────────────────────────────────
// Smart timestamp
// ─────────────────────────────────────────────────────────────────────────────
function smartTime(dateStr: string): string {
  const d = new Date(dateStr);
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${Math.floor(diffMin)} min`;
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `ayer ${format(d, "HH:mm")}`;
  return format(d, "d MMM HH:mm", { locale: es });
}
function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Hoy";
  if (isYesterday(d)) return "Ayer";
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

// ─────────────────────────────────────────────────────────────────────────────
// Message footer: timestamp + read receipt ticks
// ─────────────────────────────────────────────────────────────────────────────
function MsgFooter({ isMe, time, isRead }: { isMe: boolean; time: string; isRead: boolean }) {
  return (
    <div className={`flex items-center gap-1 mt-1 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
      <span className="text-[10px] text-white/25">{smartTime(time)}</span>
      {isMe && (
        isRead
          ? <CheckCheck className="w-3 h-3 text-sky-400 flex-shrink-0" />
          : <Check className="w-3 h-3 text-white/30 flex-shrink-0" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Waveform voice player
// ─────────────────────────────────────────────────────────────────────────────
const BARS = 28;
const BAR_HEIGHTS = Array.from({ length: BARS }, (_, i) =>
  20 + Math.abs(Math.sin(i * 0.8 + 1.2) * 55 + Math.cos(i * 1.3) * 25)
);

function VoicePlayer({ url, accent, isMe }: { url: string; accent: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const currentTime = audioRef.current?.currentTime ?? 0;

  const toggle = () => {
    const el = audioRef.current; if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  const seek = (pct: number) => {
    if (audioRef.current) { audioRef.current.currentTime = pct * audioRef.current.duration; setProgress(pct); }
  };

  return (
    <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl min-w-[220px] max-w-[260px]"
      style={isMe
        ? { background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.15)" }
        : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }
      }>
      <audio ref={audioRef} src={url}
        onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
        onTimeUpdate={e => { const el = e.target as HTMLAudioElement; setProgress(el.duration ? el.currentTime / el.duration : 0); }}
        onEnded={() => { setPlaying(false); setProgress(0); if (audioRef.current) audioRef.current.currentTime = 0; }} />

      <button onClick={toggle}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95"
        style={{ background: isMe ? "rgba(255,255,255,0.22)" : `${accent}30`, boxShadow: playing ? `0 0 14px ${accent}50` : "none" }}>
        {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 ml-0.5 text-white" />}
      </button>

      {/* Waveform bars */}
      <div className="flex-1 flex items-center gap-[2px] cursor-pointer h-8"
        onClick={e => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          seek((e.clientX - rect.left) / rect.width);
        }}>
        {BAR_HEIGHTS.map((h, i) => {
          const barPct = i / BARS;
          const filled = barPct <= progress;
          return (
            <div key={i} className="flex-1 rounded-full transition-all"
              style={{
                height: `${Math.max(20, h * 0.7)}%`,
                background: filled ? (isMe ? "#fff" : accent) : "rgba(255,255,255,0.18)",
                opacity: filled ? 1 : 0.5,
                transform: playing && Math.abs(barPct - progress) < 0.08 ? `scaleY(${1 + Math.sin(Date.now() / 200 + i) * 0.3})` : "scaleY(1)",
                transition: "background 0.1s, height 0.2s",
              }} />
          );
        })}
      </div>

      <span className="text-[10px] tabular-nums flex-shrink-0 text-white/50 w-8 text-right">
        {playing ? fmtTime(currentTime) : fmtTime(duration)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────
function Avatar({ name, url, size = 7 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} className={`w-${size} h-${size} rounded-full object-cover flex-shrink-0 ring-1 ring-white/10`} />;
  return (
    <div className={`w-${size} h-${size} rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-xs`}
      style={{ background: "linear-gradient(135deg,#06b6d4,#7c3aed)" }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing dots
// ─────────────────────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <span className="inline-flex items-end gap-[3px]">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-[5px] h-[5px] rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }} />
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy button
// ─────────────────────────────────────────────────────────────────────────────
function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className="ml-2 w-7 h-7 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors border border-white/10 flex-shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-white/50" />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Offer Card — clicking navigates to the store's product page
// ─────────────────────────────────────────────────────────────────────────────
function ProductOfferCard({ data, accent, onView }: { data: StoreProduct; accent: string; onView: () => void }) {
  const { data: bcv } = useBcvRate();
  const bs = bcv?.rate ? (data.priceUsd * bcv.rate).toLocaleString("es-VE", { maximumFractionDigits: 0 }) : null;
  return (
    <div className="rounded-2xl overflow-hidden cursor-pointer group max-w-[264px] select-none"
      onClick={onView}
      style={{
        background: "linear-gradient(160deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: `0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
        backdropFilter: "blur(20px)",
      }}>
      {data.image && (
        <div className="h-36 overflow-hidden relative">
          <img src={data.image} alt={data.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)" }} />
          <div className="absolute top-2.5 left-2.5">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide"
              style={{ background: `${accent}22`, border: `1px solid ${accent}55`, color: accent, backdropFilter: "blur(8px)" }}>
              <Zap className="w-2.5 h-2.5" /> Oferta especial
            </span>
          </div>
        </div>
      )}
      <div className="p-3.5 space-y-2.5">
        {!data.image && (
          <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase" style={{ color: accent }}>
            <Star className="w-3 h-3" /> Oferta especial
          </span>
        )}
        <p className="text-sm font-bold text-white leading-snug tracking-tight">{data.name}</p>
        {data.description && <p className="text-[11px] text-white/45 line-clamp-2 leading-relaxed">{data.description}</p>}
        <div className="flex items-end justify-between pt-0.5">
          <div>
            <p className="text-2xl font-black tracking-tight text-white"
              style={{ textShadow: `0 0 20px ${accent}60` }}>
              ${data.priceUsd.toFixed(2)}
            </p>
            {bs && <p className="text-[10px] text-white/30 font-medium">≈ Bs. {bs}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            {data.hasDelivery && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}>
                <Truck className="w-2.5 h-2.5" /> Delivery
              </span>
            )}
            {data.stock != null && data.stock <= 5 && data.stock > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}>
                ¡Solo {data.stock}!
              </span>
            )}
          </div>
        </div>
        <button className="w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] group-hover:brightness-110"
          style={{
            background: `linear-gradient(135deg, ${accent}cc, ${accent}88)`,
            boxShadow: `0 2px 12px ${accent}30, inset 0 1px 0 rgba(255,255,255,0.15)`,
          }}>
          Ver producto <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase Request Card
// ─────────────────────────────────────────────────────────────────────────────
function PurchaseRequestCard({ data, accent, isMe, onPay }: { data: PurchaseRequestData; accent: string; isMe: boolean; onPay: () => void; }) {
  const { data: bcv } = useBcvRate();
  const bs = bcv?.rate ? (data.priceUsd * bcv.rate).toLocaleString("es-VE", { maximumFractionDigits: 0 }) : null;
  return (
    <div className="rounded-2xl overflow-hidden max-w-[264px]"
      style={{
        background: "linear-gradient(160deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
      }}>
      {data.imageUrl && (
        <div className="h-28 overflow-hidden relative">
          <img src={data.imageUrl} alt="producto" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 55%)" }} />
        </div>
      )}
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <ShoppingCart className="w-3 h-3 flex-shrink-0" style={{ color: accent }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accent }}>Solicitud de compra</span>
        </div>
        <p className="text-sm font-bold text-white leading-snug tracking-tight">{data.productName}</p>
        {data.notes && <p className="text-[11px] text-white/45 line-clamp-2 leading-relaxed">{data.notes}</p>}
        <div className="flex items-end justify-between pt-0.5">
          <div>
            <p className="text-2xl font-black tracking-tight text-white"
              style={{ textShadow: `0 0 20px ${accent}60` }}>
              ${data.priceUsd.toFixed(2)}
            </p>
            {bs && <p className="text-[10px] text-white/30 font-medium">≈ Bs. {bs}</p>}
          </div>
          {data.hasDelivery && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}>
              <Truck className="w-2.5 h-2.5" /> Delivery
            </span>
          )}
        </div>
        {isMe ? (
          <button onClick={onPay}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] hover:brightness-110"
            style={{
              background: `linear-gradient(135deg, ${accent}cc, ${accent}88)`,
              boxShadow: `0 2px 12px ${accent}30, inset 0 1px 0 rgba(255,255,255,0.15)`,
            }}>
            <CreditCard className="w-3.5 h-3.5" /> Pagar ahora
          </button>
        ) : (
          <div className="w-full py-2 rounded-xl text-[11px] text-center font-semibold border"
            style={{ color: "rgba(255,255,255,0.3)", borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            Esperando pago del cliente
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Picker Modal
// ─────────────────────────────────────────────────────────────────────────────
function ProductPickerModal({ storeId, accent, onSend, onClose }: { storeId: number; accent: string; onSend: (p: StoreProduct) => void; onClose: () => void; }) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/store-messages/store-products/${storeId}`, { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : []).then(setProducts).catch(() => {}).finally(() => setLoading(false));
  }, [storeId]);
  return (
    <div className="fixed inset-0 z-[700] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-t-3xl sm:rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
        style={{ background: "rgba(6,12,28,0.98)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2"><Package className="w-4 h-4 text-primary" /><span className="font-bold text-sm text-white">Enviar oferta de producto</span></div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/[0.08] text-white/50 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            : products.length === 0 ? <div className="flex flex-col items-center justify-center py-12 gap-3 text-white/30"><ShoppingBag className="w-10 h-10 opacity-20" /><p className="text-sm">No tienes productos activos</p></div>
              : products.map(p => (
                <button key={p.id} onClick={() => { onSend(p); onClose(); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-white/[0.07] border border-white/[0.06] hover:border-primary/30 group">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/[0.05] flex-shrink-0">
                    {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 opacity-30" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-white truncate">{p.name}</p>
                    <p className="text-xs font-bold mt-0.5 text-primary">${p.priceUsd.toFixed(2)} USD</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.hasDelivery && <span className="text-[10px] text-blue-400 flex items-center gap-0.5"><Truck className="w-2.5 h-2.5" /> Delivery</span>}
                      {p.stock != null && <span className="text-[10px] text-white/30">Stock: {p.stock}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-primary flex-shrink-0" />
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase Request Modal
// ─────────────────────────────────────────────────────────────────────────────
function PurchaseRequestModal({ accent, onSend, onClose }: { accent: string; onSend: (d: PurchaseRequestData) => Promise<void>; onClose: () => void; }) {
  const [productName, setProductName] = useState(""); const [priceUsd, setPriceUsd] = useState(""); const [hasDelivery, setHasDelivery] = useState(false);
  const [notes, setNotes] = useState(""); const [imageUrl, setImageUrl] = useState<string | null>(null); const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false); const [sending, setSending] = useState(false); const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null); const { data: bcv } = useBcvRate();
  const bs = bcv?.rate && priceUsd && !isNaN(parseFloat(priceUsd)) ? (parseFloat(priceUsd) * bcv.rate).toLocaleString("es-VE", { maximumFractionDigits: 0 }) : null;

  const handleImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 18 * 1024 * 1024) { setError("Imagen Máx. 18 MB"); return; }
    setError(""); setUploading(true); setPreviewUrl(URL.createObjectURL(file));
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) });
      if (!urlRes.ok) throw new Error();
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      setImageUrl(mediaSrc(objectPath));
    } catch { setError("Error al subir imagen"); setPreviewUrl(null); } finally { setUploading(false); }
  };

  const handleSubmit = async () => {
    if (!productName.trim()) { setError("Escribe el nombre del producto"); return; }
    const p = parseFloat(priceUsd); if (!priceUsd || isNaN(p) || p <= 0) { setError("Precio inválido"); return; }
    setSending(true); setError("");
    try { await onSend({ productName: productName.trim(), imageUrl, priceUsd: p, hasDelivery, notes: notes.trim() }); onClose(); }
    catch (err: any) { setError(err.message ?? "Error al enviar"); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-t-3xl sm:rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
        style={{ background: "rgba(6,12,28,0.99)", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "92vh" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" style={{ color: accent }} /><span className="font-bold text-sm text-white">Solicitud de compra</span></div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/[0.08] text-white/50 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-white/60 mb-2">Foto del producto <span className="text-white/30">(opcional)</span></p>
            <div onClick={() => !uploading && fileRef.current?.click()} className="relative w-full h-36 rounded-xl overflow-hidden border-2 border-dashed cursor-pointer transition-all hover:border-white/30"
              style={{ borderColor: previewUrl ? `${accent}60` : "rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)" }}>
              {previewUrl ? (<><img src={previewUrl} alt="preview" className="w-full h-full object-cover" />{uploading && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}</>) : (<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30">{uploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Image className="w-7 h-7" />}<span className="text-xs">{uploading ? "Subiendo..." : "Toca para agregar foto"}</span></div>)}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImg} />
          </div>
          <div><label className="text-xs font-semibold text-white/60 block mb-1.5">Nombre del producto *</label><input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Ej: Audífonos Sony WH-1000XM4" maxLength={120} className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} /></div>
          <div><label className="text-xs font-semibold text-white/60 block mb-1.5">Precio acordado (USD) *</label><div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">$</span><input type="number" min="0.01" step="0.01" value={priceUsd} onChange={e => setPriceUsd(e.target.value)} placeholder="0.00" className="w-full pl-8 pr-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} /></div>{bs && <p className="text-[11px] text-white/40 mt-1.5 flex items-center gap-1"><Info className="w-3 h-3" />≈ Bs. {bs}</p>}</div>
          <div className="flex items-center justify-between p-3.5 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
            <div className="flex items-center gap-2.5"><Truck className="w-4 h-4 text-blue-400" /><div><p className="text-sm font-semibold text-white">Requiero delivery</p><p className="text-[11px] text-white/40">Coordinado con el vendedor</p></div></div>
            <button onClick={() => setHasDelivery(!hasDelivery)} className={`relative w-11 h-6 rounded-full transition-all ${hasDelivery ? "bg-blue-500" : "bg-white/20"}`}><span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: hasDelivery ? "22px" : "2px" }} /></button>
          </div>
          <div><label className="text-xs font-semibold text-white/60 block mb-1.5">Notas <span className="text-white/30">(opcional)</span></label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Color, talla, variante..." maxLength={300} rows={2} className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none resize-none" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }} /></div>
          {error && <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}><AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}</div>}
        </div>
        <div className="px-5 py-4 border-t border-white/[0.08] flex-shrink-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/60 border border-white/10 hover:bg-white/[0.06] transition-all">Cancelar</button>
          <button onClick={handleSubmit} disabled={sending || uploading || !productName.trim() || !priceUsd} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40" style={{ background: `linear-gradient(135deg,${accent},${accent}99)` }}>
            {sending ? <span className="flex items-center justify-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</span> : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT PDF (reusable for both client and owner)
// ─────────────────────────────────────────────────────────────────────────────
async function downloadRentalContract(r: any, currentUser?: { id: number; name: string } | null) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210; const margin = 18; const lineW = W - margin * 2;
  let y = 0;
  const now = new Date();
  const generated = format(now, "d 'de' MMMM yyyy 'a las' HH:mm:ss", { locale: es });
  const generatedIso = now.toISOString();
  const total = +(parseFloat(r.subtotal) + parseFloat(r.depositAmount)).toFixed(2);
  const DEPOSIT_MAP: Record<string, string> = { held: "En custodia", released: "Devuelto", retained: "Retenido", pending: "Pendiente" };

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235); doc.rect(0, 0, W, 30, "F");
  doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text("CONTRATO DE ARRENDAMIENTO", W / 2, 12, { align: "center" });
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("LinkServi · Plataforma de Servicios y Alquileres de Venezuela", W / 2, 19, { align: "center" });
  doc.setFontSize(9);
  doc.text(`Contrato N° ${String(r.id).padStart(6, "0")}  ·  Generado: ${generated}`, W / 2, 26, { align: "center" });
  y = 38;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const sectionTitle = (title: string) => {
    doc.setFillColor(241, 245, 249); doc.rect(margin, y, lineW, 7, "F");
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(37, 99, 235);
    doc.text(title.toUpperCase(), margin + 3, y + 5); y += 10;
  };
  const twoFields = (l1: string, v1: string, l2: string, v2: string) => {
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(120, 120, 120);
    doc.text(l1, margin, y); doc.text(l2, margin + lineW / 2, y);
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 20);
    doc.text(v1, margin, y + 5); doc.text(v2, margin + lineW / 2, y + 5);
    y += 11;
  };
  const clause = (num: number, title: string, body: string) => {
    if (y > 255) { doc.addPage(); y = 18; }
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(37, 99, 235);
    doc.text(`Cláusula ${num}. ${title}`, margin, y); y += 5;
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 50);
    doc.splitTextToSize(body, lineW).forEach((line: string) => { doc.text(line, margin, y); y += 4.5; });
    y += 3;
  };

  // ── Section I — Objeto ────────────────────────────────────────────────────
  sectionTitle("I. Objeto del Contrato");
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 40);
  doc.text("El presente contrato regula el arrendamiento del siguiente bien:", margin, y); y += 8;
  doc.setFillColor(248, 250, 252); doc.rect(margin, y, lineW, 10, "F");
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 20);
  doc.text(r.productName, margin + 4, y + 7); y += 16;

  // ── Section II — Partes ───────────────────────────────────────────────────
  sectionTitle("II. Partes Contratantes");
  twoFields("ARRENDADOR (Propietario)", r.ownerName, "ARRENDATARIO (Cliente)", r.clientName); y += 2;

  // ── Section III — Período ─────────────────────────────────────────────────
  sectionTitle("III. Período de Arrendamiento");
  twoFields("Fecha de inicio", r.startDate, "Fecha de devolución", r.endDate);
  twoFields("Duración (días)", `${r.days} día${r.days !== 1 ? "s" : ""}`, "Tarifa diaria", `$${parseFloat(r.dailyRate).toFixed(2)} USD`); y += 2;

  // ── Section IV — Financiero ───────────────────────────────────────────────
  sectionTitle("IV. Condiciones Financieras");
  twoFields("Subtotal de arrendamiento", `$${parseFloat(r.subtotal).toFixed(2)} USD`, "Comisión LinkServi (15%)", `$${parseFloat(r.commission).toFixed(2)} USD`);
  twoFields("Depósito de garantía", `$${parseFloat(r.depositAmount).toFixed(2)} USD`, "Estado del depósito", DEPOSIT_MAP[r.depositStatus] ?? r.depositStatus);

  doc.setFillColor(37, 99, 235); doc.rect(margin, y, lineW, 14, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 210, 255);
  doc.text("TOTAL A PAGAR POR EL ARRENDATARIO (Subtotal + Depósito)", margin + 4, y + 5);
  doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text(`$${total.toFixed(2)} USD`, margin + 4, y + 12); y += 20;

  // ── Section V — Cláusulas ─────────────────────────────────────────────────
  if (y > 230) { doc.addPage(); y = 18; }
  sectionTitle("V. Cláusulas Legales");
  clause(1, "Objeto", "El ARRENDADOR cede temporalmente al ARRENDATARIO el uso y goce del bien descrito en la Sección I, por el período y condiciones establecidos en este contrato.");
  clause(2, "Período y Devolución", `El arrendamiento tiene una duración de ${r.days} día${r.days !== 1 ? "s" : ""}, iniciando el ${r.startDate} y concluyendo el ${r.endDate}. El ARRENDATARIO se obliga a devolver el bien en la fecha acordada.`);
  clause(3, "Pago y Comisión", `El monto total asciende a $${parseFloat(r.subtotal).toFixed(2)} USD. LinkServi aplicará una comisión del 15% ($${parseFloat(r.commission).toFixed(2)} USD) sobre el subtotal en concepto de intermediación y soporte.`);
  clause(4, "Depósito de Garantía", `El ARRENDATARIO abona un depósito de $${parseFloat(r.depositAmount).toFixed(2)} USD, devuelto al finalizar el contrato previa verificación del estado del bien. Ante daños, LinkServi podrá retener el depósito.`);
  clause(5, "Cuidado del Bien", "El ARRENDATARIO se compromete a usar el bien para los fines acordados, con la debida diligencia. Queda prohibida la subarrendación sin autorización escrita.");
  clause(6, "Disputas", "Las disputas se gestionarán a través del panel de administración de LinkServi, cuya resolución será vinculante para ambas partes.");
  clause(7, "Jurisdicción", "Este contrato se rige por las leyes de la República Bolivariana de Venezuela, Código Civil vigente en materia de arrendamientos, con jurisdicción en el estado Monagas.");

  // ── Aceptación electrónica ────────────────────────────────────────────────
  if (y > 255) { doc.addPage(); y = 18; }
  y += 3;
  doc.setFillColor(254, 252, 232);
  doc.setDrawColor(217, 119, 6);
  doc.roundedRect(margin, y, lineW, 10, 2, 2, "FD");
  doc.setFontSize(8); doc.setFont("helvetica", "bolditalic"); doc.setTextColor(146, 64, 14);
  doc.text(
    "Al procesar esta transacción en la plataforma, ambas partes aceptan los términos y condiciones de este contrato electrónico.",
    margin + 3, y + 6.5,
    { maxWidth: lineW - 6 }
  );
  y += 16;

  // ── Firmas ────────────────────────────────────────────────────────────────
  if (y > 245) { doc.addPage(); y = 18; }
  y += 4;
  const half = lineW / 2 - 10;
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, margin + half, y);
  doc.line(margin + lineW / 2 + 10, y, W - margin, y);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
  doc.text("Firma del Arrendador", margin, y + 5); doc.text(r.ownerName, margin, y + 10);
  doc.text("Firma del Arrendatario", margin + lineW / 2 + 10, y + 5); doc.text(r.clientName, margin + lineW / 2 + 10, y + 10);
  y += 18;

  // ── Recepción vía Delivery ────────────────────────────────────────────────
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
  doc.setDrawColor(140, 140, 140);
  doc.text("Recepción conforme vía Delivery:", margin, y);
  doc.rect(margin + 67, y - 4, 7, 7);
  doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
  doc.text("(el motorizado o receptor debe marcar esta casilla al confirmar la entrega)", margin, y + 6);
  y += 16;

  // ── Sello de Firma Digital LinkServi ─────────────────────────────────────
  if (y > 255) { doc.addPage(); y = 18; }
  y += 4;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(37, 99, 235);
  doc.roundedRect(margin, y, lineW, 30, 3, 3, "FD");

  doc.setFillColor(37, 99, 235);
  doc.roundedRect(margin + 1, y + 1, lineW - 2, 8, 2, 2, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text("FIRMADO DIGITALMENTE A TRAVÉS DE LINKSERVI", W / 2, y + 6.5, { align: "center" });

  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(30, 64, 175);
  const signerName = currentUser?.name ?? "Usuario de la plataforma";
  const signerId   = currentUser?.id   ? `#${currentUser.id}` : "—";
  doc.text(`Usuario: ${signerName}  ·  ID: ${signerId}`, margin + 5, y + 16);
  doc.text(`Fecha y hora exacta: ${generated}`, margin + 5, y + 22);
  doc.setFontSize(7); doc.setTextColor(100, 130, 200);
  doc.text(`Timestamp ISO 8601: ${generatedIso}`, margin + 5, y + 27);
  y += 36;

  // ── Footer en cada página ─────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(160, 160, 160);
    doc.text(`LinkServi · Contrato N° ${String(r.id).padStart(6, "0")} · Página ${i} de ${pageCount}`, W / 2, 292, { align: "center" });
    doc.setDrawColor(220, 220, 220); doc.line(margin, 289, W - margin, 289);
  }
  // ── Save locally ──────────────────────────────────────────────────────────
  doc.save(`contrato_alquiler_linkservi_${String(r.id).padStart(6, "0")}.pdf`);

  // ── Upload copy to Object Storage for legal traceability ──────────────────
  // Non-blocking: runs after the local download starts.
  try {
    const pdfBlob = doc.output("blob");
    const fileName = `contrato_alquiler_${String(r.id).padStart(6, "0")}_${Date.now()}.pdf`;

    const urlRes = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ name: fileName, size: pdfBlob.size, contentType: "application/pdf" }),
    });
    if (urlRes.ok) {
      const { uploadURL, objectPath } = await urlRes.json();
      const uploaded = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: pdfBlob,
      });
      if (uploaded.ok) {
        await fetch(`/api/rentals/${r.id}/contract-url`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify({ contractUrl: mediaSrc(objectPath) }),
        });
      }
    }
  } catch {
    // Storage upload is best-effort; local download already succeeded.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export function StoreChatPage() {
  const [, params] = useRoute("/store-chat/:storeId");
  const [, params2] = useRoute("/store-chat/:storeId/buyer/:buyerId");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const storeId = parseInt(params?.storeId ?? params2?.storeId ?? "0");
  const buyerIdParam = params2?.buyerId ? parseInt(params2.buyerId) : undefined;

  // ── Rental URL params ────────────────────────────────────────────────────
  const searchStr = useSearch();
  const _rp = new URLSearchParams(searchStr);
  const rentalInfo = _rp.get("product") && _rp.get("start") && _rp.get("end")
    ? { productId: parseInt(_rp.get("product")!), productName: _rp.get("productName") ?? "Producto", start: _rp.get("start")!, end: _rp.get("end")! }
    : null;
  const rentalAutoSentRef = useRef(false);
  const [rentalRecord, setRentalRecord] = useState<any | null>(null);
  const [rentalLoading, setRentalLoading] = useState(true);

  const [messages, setMessages] = useState<StoreMessage[]>([]);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterWarning, setFilterWarning] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [pendingVideo, setPendingVideo] = useState<{ file: File; previewUrl: string } | null>(null);
  const [otherOnline, setOtherOnline] = useState<{ online: boolean; lastSeenMs: number | null }>({ online: false, lastSeenMs: null });
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [otherTyping, setOtherTyping] = useState<{ name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice
  const [recording, setRecording] = useState(false);
  const [voiceTimer, setVoiceTimer] = useState(0);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accent = store?.accentColor ?? "#06B6D4";
  const isCohost = !!(user && store && user.id === store.coHostId);
  const isClient = !!(user && store && user.id !== store.coHostId);
  const qs = buyerIdParam ? `?buyerId=${buyerIdParam}` : "";
  const bodyExtra = buyerIdParam ? { buyerId: buyerIdParam } : {};

  // ── Fetch store ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!storeId || !user) return;
    fetch(`/api/public/stores/${storeId}`, { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.id) setStore({ id: d.id, name: d.name, logoUrl: d.logoUrl, coHostId: d.coHostId, accentColor: d.accentColor }); })
      .catch(() => {});
  }, [storeId, user]);

  // ── Fetch messages ───────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!storeId || !user) return;
    try {
      const res = await fetch(`/api/store-messages/${storeId}${qs}`, { headers: getAuthHeader() });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch {}
  }, [storeId, user, qs]);


  // ── Fetch rental record for this conversation ────────────────────────────
  // Matching rules (strict to prevent cross-client leakage):
  //   1. If URL has ?product=X, filter by productId + both parties.
  //   2. Client view: clientId === me AND ownerId === store owner.
  //   3. Owner view: ownerId === me AND clientId === buyerIdParam (required).
  useEffect(() => {
    if (!user || !store) return;
    setRentalLoading(true);
    fetch("/api/rentals/mine", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const match = rows.find((r: any) => {
          const productMatch = rentalInfo?.productId
            ? r.productId === rentalInfo.productId
            : true;
          const clientSide = r.clientId === user.id && r.ownerId === store.coHostId;
          const ownerSide = r.ownerId === user.id && !!buyerIdParam && r.clientId === buyerIdParam;
          return productMatch && (clientSide || ownerSide);
        });
        if (match) setRentalRecord(match);
      })
      .catch(() => {})
      .finally(() => setRentalLoading(false));
  }, [user, store, buyerIdParam]);

  // ── Auto-send rental reservation message ─────────────────────────────────
  useEffect(() => {
    if (!rentalInfo || !store || loading || rentalAutoSentRef.current || !user) return;
    const isOwner = user.id === store.coHostId;
    if (isOwner) return;
    rentalAutoSentRef.current = true;
    const msg = `Hola, estoy interesado en alquilar "${rentalInfo.productName}" del ${rentalInfo.start} al ${rentalInfo.end}. ¿Está disponible para esas fechas?`;
    fetch(`/api/store-messages/${storeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ messageType: "text", content: msg }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.id) setMessages(prev => [...prev, { ...data, senderName: user?.name ?? "", senderAvatar: null }]);
      })
      .catch(() => {});
  }, [rentalInfo, store, loading, user, storeId]);

  // ── Delete chat (client only) ────────────────────────────────────────────
  const handleDeleteChat = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      confirmDeleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3500);
      return;
    }
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
    setConfirmDelete(false);
    try {
      await fetch(`/api/store-messages/${storeId}`, { method: "DELETE", headers: getAuthHeader() });
      setMessages([]);
    } catch {}
  };

  // ── Poll typing ──────────────────────────────────────────────────────────
  const pollTyping = useCallback(async () => {
    if (!storeId || !user || !store) return;
    try {
      const res = await fetch(`/api/store-messages/${storeId}/typing${qs}`, { headers: getAuthHeader() });
      if (!res.ok) return;
      const d: { typing: boolean; userName?: string } = await res.json();
      setOtherTyping(d.typing && d.userName ? { name: d.userName } : null);
    } catch {}
  }, [storeId, user, store, qs]);

  useEffect(() => {
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  useEffect(() => {
    if (!storeId || !user) return;
    const buyerId = buyerIdParam ?? user.id;
    const room = `store:${storeId}:${buyerId}`;
    const socket = getSocket();
    joinRoom(room);
    const handler = (msg: any) => {
      setMessages(prev => {
        if (prev.some((m: any) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    socket.on("new_message", handler);
    return () => { socket.off("new_message", handler); leaveRoom(room); };
  }, [storeId, user, buyerIdParam]);

  useEffect(() => {
    if (!store) return;
    typingIntervalRef.current = setInterval(pollTyping, 4000);
    return () => { if (typingIntervalRef.current) clearInterval(typingIntervalRef.current); };
  }, [pollTyping, store]);

  // ── Presence heartbeat (I am online) ─────────────────────────────────────
  const sendHeartbeat = useCallback(async () => {
    if (!storeId || !user) return;
    try { await fetch(`/api/store-messages/${storeId}/presence`, { method: "POST", headers: getAuthHeader() }); } catch {}
  }, [storeId, user]);

  // ── Poll other party's online status ─────────────────────────────────────
  const pollPresence = useCallback(async () => {
    if (!storeId || !user || !store) return;
    try {
      const res = await fetch(`/api/store-messages/${storeId}/presence${qs}`, { headers: getAuthHeader() });
      if (!res.ok) return;
      const d: { online: boolean; lastSeenMs: number | null } = await res.json();
      setOtherOnline(d);
    } catch {}
  }, [storeId, user, store, qs]);

  useEffect(() => {
    if (!store) return;
    sendHeartbeat();
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30_000);
    presenceIntervalRef.current = setInterval(pollPresence, 15_000);
    pollPresence();
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
    };
  }, [store, sendHeartbeat, pollPresence]);

  // Only auto-scroll to bottom when: first load OR user is already at bottom OR user sent their own message
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (atBottomRef.current || distFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    atBottomRef.current = distFromBottom < 120;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    atBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior });
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async (body: object) => {
    setSending(true);
    try {
      const res = await fetch(`/api/store-messages/${storeId}`, {
        method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ ...body, ...bodyExtra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.wasFiltered) setFilterWarning(true);
      setMessages(prev => [...prev, { ...data, senderName: user?.name ?? "", senderAvatar: null }]);
      scrollToBottom();
    } finally { setSending(false); }
  };

  // ── Typing notify ────────────────────────────────────────────────────────
  const notifyTyping = useCallback(async () => {
    if (!storeId || !user) return;
    try { await fetch(`/api/store-messages/${storeId}/typing`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify(bodyExtra) }); } catch {}
  }, [storeId, user]);

  const handleInputChange = (v: string) => {
    setInput(v);
    if (filterWarning) setFilterWarning(false);
    if (blockedWarning) setBlockedWarning(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    notifyTyping();
  };

  // ── Client-side contact-info detector (blocks before sending) ────────────
  const BLOCK_PATTERNS = [
    /(\+?58[\s.\-]?)?0?4[01256]\d[\s.\-]?\d{3}[\s.\-]?\d{3,4}/,
    /\b02\d[\s.\-]?\d{3}[\s.\-]?\d{4}\b/,
    /\b\d{9,}\b/,
    /\b\d{2,4}[\s.\-]\d{3,4}[\s.\-]\d{3,4}\b/,
    /@[a-zA-Z0-9._]{3,}/,
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
  ];
  const [blockedWarning, setBlockedWarning] = useState(false);

  const containsContactInfo = (text: string): boolean =>
    BLOCK_PATTERNS.some(r => { r.lastIndex = 0; return r.test(text); });

  // ── Send handler ─────────────────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || imgUploading || videoUploading) return;
    if (pendingVideo) { await sendPendingVideo(); if (input.trim()) await sendMessage({ messageType: "text", content: input.trim() }); setInput(""); setFilterWarning(false); setBlockedWarning(false); return; }
    if (pendingImage) { await uploadAndSendPendingImage(); if (input.trim()) await sendMessage({ messageType: "text", content: input.trim() }); setInput(""); setFilterWarning(false); setBlockedWarning(false); return; }
    if (!input.trim()) return;
    if (containsContactInfo(input.trim())) {
      setBlockedWarning(true);
      return;
    }
    const text = input.trim(); setInput(""); setFilterWarning(false); setBlockedWarning(false);
    await sendMessage({ messageType: "text", content: text });
  };

  // ── Quick reply ──────────────────────────────────────────────────────────
  const handleQuickReply = async (text: string) => {
    await sendMessage({ messageType: "text", content: text });
  };

  // ── Image ────────────────────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 18 * 1024 * 1024) { alert("Imagen Máx. 18 MB"); return; }
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
    if (imgInputRef.current) imgInputRef.current.value = "";
    inputRef.current?.focus();
  };

  const uploadAndSendPendingImage = async () => {
    if (!pendingImage) return;
    setImgUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify({ name: pendingImage.file.name, size: pendingImage.file.size, contentType: pendingImage.file.type }) });
      if (!urlRes.ok) throw new Error();
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": pendingImage.file.type }, body: pendingImage.file });
      await sendMessage({ messageType: "image", content: "", imageUrl: mediaSrc(objectPath) });
      setPendingImage(null);
    } catch { alert("Error al subir imagen"); } finally { setImgUploading(false); }
  };

  // ── Video ────────────────────────────────────────────────────────────────
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) { alert("El video no puede superar 80 MB"); return; }
    const previewUrl = URL.createObjectURL(file);
    setPendingVideo({ file, previewUrl });
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const sendPendingVideo = async () => {
    if (!pendingVideo) return;
    setVideoUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify({ name: pendingVideo.file.name, size: pendingVideo.file.size, contentType: pendingVideo.file.type }) });
      if (!urlRes.ok) throw new Error();
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": pendingVideo.file.type }, body: pendingVideo.file });
      await sendMessage({ messageType: "video", content: "", videoUrl: mediaSrc(objectPath) });
      URL.revokeObjectURL(pendingVideo.previewUrl);
      setPendingVideo(null);
    } catch { alert("Error al subir video"); } finally { setVideoUploading(false); }
  };

  // ── Voice ────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg" });
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
        if (blob.size < 1000) return;
        await uploadVoice(blob, mr.mimeType);
      };
      mr.start(); mediaRecorderRef.current = mr; setRecording(true); setVoiceTimer(0);
      voiceTimerRef.current = setInterval(() => setVoiceTimer(t => t + 1), 1000);
    } catch { alert("No se pudo acceder al micrófono"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    setRecording(false);
    if (voiceTimerRef.current) { clearInterval(voiceTimerRef.current); voiceTimerRef.current = null; }
    setVoiceTimer(0);
  };

  const uploadVoice = async (blob: Blob, mimeType: string) => {
    setVoiceUploading(true);
    try {
      const ext = mimeType.includes("webm") ? "webm" : "ogg"; const fileName = `voice_${Date.now()}.${ext}`;
      const urlRes = await fetch("/api/storage/uploads/request-url", { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeader() }, body: JSON.stringify({ name: fileName, size: blob.size, contentType: mimeType }) });
      if (!urlRes.ok) throw new Error();
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
      await sendMessage({ messageType: "voice", content: "", audioUrl: mediaSrc(objectPath) });
    } catch { alert("Error al enviar nota de voz"); } finally { setVoiceUploading(false); }
  };

  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-hidden flex" style={{ background: "#030a18" }}>
      <Sidebar />

      <main className="md:ml-64 flex-1 h-full flex flex-col min-h-0 overflow-hidden relative">
        {/* Subtle ambient background */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 80% 40% at 50% -10%, ${accent}10 0%, transparent 60%), radial-gradient(ellipse 60% 30% at 80% 100%, ${accent}08 0%, transparent 50%)`,
        }} />

        {/* ── Header ── */}
        <div className="relative z-10 flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ background: "rgba(3,10,24,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>

          <button onClick={() => navigate("/mensajes")}
            className="p-2 rounded-xl hover:bg-white/5 transition-all text-white/50 hover:text-white active:scale-95">
            <ArrowLeft className="w-4 h-4" />
          </button>

          {store ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {store.logoUrl ? (
                <div className="relative flex-shrink-0">
                  <img src={store.logoUrl} alt={store.name} className="w-10 h-10 rounded-xl object-cover"
                    style={{ boxShadow: `0 0 0 2px ${accent}55, 0 4px 12px ${accent}20` }} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#030a18]" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg,${accent},#7c3aed)`, boxShadow: `0 4px 16px ${accent}30` }}>
                  <span className="text-base font-black text-white">{store.name.charAt(0)}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm truncate leading-tight">{store.name}</p>
                {otherTyping ? (
                  <p className="text-[11px] flex items-center gap-1.5 font-medium" style={{ color: accent }}>
                    <TypingDots /> <span>está escribiendo</span>
                  </p>
                ) : otherOnline.online ? (
                  <p className="text-[11px] flex items-center gap-1.5 font-medium text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    En línea
                  </p>
                ) : otherOnline.lastSeenMs ? (
                  <p className="text-[11px] text-white/30 font-medium">
                    Últ. vez {formatDistanceToNow(new Date(otherOnline.lastSeenMs), { addSuffix: true, locale: es })}
                  </p>
                ) : (
                  <p className="text-[11px] text-white/25 font-medium">Desconectado</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-xl bg-white/5 animate-pulse flex-shrink-0" />
              <div className="space-y-1.5"><div className="h-3.5 w-28 rounded bg-white/5 animate-pulse" /><div className="h-2.5 w-16 rounded bg-white/5 animate-pulse" /></div>
            </div>
          )}

          {isClient && (
            <button
              onClick={handleDeleteChat}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold transition-all flex-shrink-0"
              style={confirmDelete
                ? { background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)" }}
              title={confirmDelete ? "Toca para confirmar" : "Borrar conversación"}
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">{confirmDelete ? "¿Borrar?" : "Borrar"}</span>
            </button>
          )}

          {rentalRecord && rentalRecord.status !== "cancelled" && (
            <button
              onClick={() => downloadRentalContract(rentalRecord, user)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold transition-all flex-shrink-0"
              style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.35)", color: "#a78bfa" }}
              title="Descargar contrato de alquiler PDF"
            >
              <FileDown className="w-3 h-3" />
              <span className="hidden sm:inline">Contrato</span>
            </button>
          )}

          <div className="flex items-center gap-1 text-[10px] text-white/25 border border-white/[0.06] rounded-full px-2.5 py-1.5 flex-shrink-0">
            <ShieldAlert className="w-3 h-3" />
            <span className="hidden sm:inline">Protegido</span>
          </div>
        </div>

        {/* Filter warning (post-send, backend filtered) */}
        {filterWarning && (
          <div className="relative z-10 mx-4 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium flex-shrink-0"
            style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24" }}>
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            Tu mensaje contenía datos de contacto que fueron bloqueados automáticamente.
          </div>
        )}

        {/* Blocked warning (pre-send, client-side block) */}
        {blockedWarning && (
          <div className="relative z-10 mx-4 mt-3 flex items-start gap-3 px-4 py-3 rounded-xl flex-shrink-0"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)" }}>
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#f87171" }} />
            <div>
              <p className="text-sm font-bold" style={{ color: "#f87171" }}>Mensaje bloqueado</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(248,113,113,0.80)" }}>
                Por tu seguridad, no está permitido compartir datos de contacto externos. Todas las transacciones deben realizarse dentro de LinkServi para contar con la garantía y el seguro de protección.
              </p>
            </div>
          </div>
        )}

        {/* Rental reservation info banner — shown when coming from rental flow OR when a rental record is linked */}
        {(rentalInfo || rentalRecord) && (
          <div className="relative z-10 mx-4 mt-3 flex items-start gap-3 px-4 py-3 rounded-xl flex-shrink-0"
            style={{ background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.30)" }}>
            <CalendarDays className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-violet-300">Solicitud de alquiler</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(196,181,253,0.70)" }}>
                {rentalRecord
                  ? `"${rentalRecord.productName}" · ${rentalRecord.startDate} → ${rentalRecord.endDate}`
                  : `"${rentalInfo!.productName}" · ${rentalInfo!.start} → ${rentalInfo!.end}`}
              </p>
              {rentalRecord && (
                <p className="text-[11px] mt-1 font-semibold" style={{ color: "rgba(167,139,250,0.70)" }}>
                  {rentalRecord.days} días · ${rentalRecord.subtotal?.toFixed(2)} USD · Depósito ${rentalRecord.depositAmount?.toFixed(2)}
                </p>
              )}
            </div>
            {rentalRecord && rentalRecord.status !== "cancelled" && (
              <button
                onClick={() => downloadRentalContract(rentalRecord, user)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0 transition-all hover:opacity-80"
                style={{ background: "rgba(139,92,246,0.20)", border: "1px solid rgba(139,92,246,0.45)", color: "#c4b5fd" }}
                title="Descargar contrato PDF"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
            )}
          </div>
        )}

        {/* ── Messages ── */}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-2 border-white/10 rounded-full animate-spin" style={{ borderTopColor: accent }} />
              <p className="text-xs text-white/30">Cargando conversación...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-6">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg,${accent}20,${accent}08)`, border: `1px solid ${accent}30`, boxShadow: `0 0 40px ${accent}15` }}>
                <MessageCircle className="w-9 h-9" style={{ color: accent }} />
              </div>
              <div>
                <p className="font-bold text-white/80 text-base">Inicia la conversación</p>
                <p className="text-sm text-white/35 mt-1.5 leading-relaxed max-w-xs">Pregunta sobre productos, precios, disponibilidad o delivery.</p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/25 border border-white/[0.06] rounded-full px-3 py-2">
                <ShieldAlert className="w-3 h-3" /> Los datos de contacto están protegidos
              </div>
            </div>
          ) : (
            <>
              {/* Security note */}
              <div className="flex justify-center mb-3">
                <span className="text-[10px] text-white/20 border border-white/[0.06] rounded-full px-3 py-1.5 flex items-center gap-1.5">
                  <ShieldAlert className="w-2.5 h-2.5" /> LinkServi bloquea datos de contacto automáticamente
                </span>
              </div>

              {messages.map((msg, i) => {
                const isMe = msg.senderId === user?.id;
                const prevMsg = i > 0 ? messages[i - 1] : null;
                const nextMsg = i < messages.length - 1 ? messages[i + 1] : null;

                const showDayDivider = !prevMsg || new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                const showAvatar = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId || showDayDivider);
                const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId;

                let parsedData: any = null;
                if ((msg.messageType === "product_offer" || msg.messageType === "purchase_request") && msg.productData) {
                  try { parsedData = typeof msg.productData === "string" ? JSON.parse(msg.productData) : msg.productData; } catch {}
                }

                return (
                  <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                    {/* Day divider */}
                    {showDayDivider && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-white/[0.06]" />
                        <span className="text-[10px] font-semibold text-white/25 px-3 py-1 rounded-full border border-white/[0.06]">{dayLabel(msg.createdAt)}</span>
                        <div className="flex-1 h-px bg-white/[0.06]" />
                      </div>
                    )}

                    <div className={`flex gap-2.5 ${isMe ? "justify-end" : "justify-start"} ${!isLastInGroup ? "mb-0.5" : "mb-2"}`}>
                      {/* Avatar */}
                      {!isMe && (
                        <div className="flex-shrink-0 self-end mb-1">
                          {showAvatar ? <Avatar name={msg.senderName} url={msg.senderAvatar} size={7} /> : <div className="w-7" />}
                        </div>
                      )}

                      <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[78%]`}>
                        {/* Sender name */}
                        {!isMe && showAvatar && (
                          <span className="text-[10px] font-semibold text-white/40 mb-1 ml-1">{msg.senderName}</span>
                        )}

                        {/* IMAGE */}
                        {msg.messageType === "image" && msg.imageUrl && (
                          <div>
                            <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
                              <div className="overflow-hidden rounded-2xl shadow-lg" style={{ maxWidth: 260 }}>
                                <img src={msg.imageUrl} alt="foto" className="max-h-64 object-cover hover:opacity-90 transition-opacity cursor-pointer w-full" />
                              </div>
                            </a>
                            <MsgFooter isMe={isMe} time={msg.createdAt} isRead={msg.isRead} />
                          </div>
                        )}

                        {/* VIDEO */}
                        {msg.messageType === "video" && msg.videoUrl && (
                          <div>
                            <div className="overflow-hidden rounded-2xl shadow-lg" style={{ maxWidth: 280, background: "#000" }}>
                              <video
                                src={msg.videoUrl}
                                controls
                                playsInline
                                preload="metadata"
                                className="w-full max-h-64 object-contain"
                                style={{ display: "block" }}
                              />
                            </div>
                            <MsgFooter isMe={isMe} time={msg.createdAt} isRead={msg.isRead} />
                          </div>
                        )}

                        {/* VOICE */}
                        {msg.messageType === "voice" && msg.audioUrl && (
                          <div>
                            <VoicePlayer url={msg.audioUrl} accent={accent} isMe={isMe} />
                            <MsgFooter isMe={isMe} time={msg.createdAt} isRead={msg.isRead} />
                          </div>
                        )}

                        {/* PRODUCT OFFER */}
                        {msg.messageType === "product_offer" && parsedData && (
                          <div>
                            <ProductOfferCard data={parsedData} accent={accent} onView={() => navigate(`/stores/${storeId}?product=${parsedData.id}`)} />
                            <MsgFooter isMe={isMe} time={msg.createdAt} isRead={msg.isRead} />
                          </div>
                        )}

                        {/* PURCHASE REQUEST */}
                        {msg.messageType === "purchase_request" && parsedData && (
                          <div>
                            <PurchaseRequestCard data={parsedData} accent={accent} isMe={isMe} onPay={() => navigate(`/stores/${storeId}`)} />
                            <MsgFooter isMe={isMe} time={msg.createdAt} isRead={msg.isRead} />
                          </div>
                        )}

                        {/* TEXT */}
                        {msg.messageType === "text" && (
                          <div>
                            <div className={`relative rounded-2xl px-4 py-2.5 shadow-sm ${isMe ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                              style={isMe
                                ? { background: `linear-gradient(135deg,${accent},${accent}cc)`, boxShadow: `0 4px 16px ${accent}25` }
                                : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }
                              }>
                              <p className="text-sm leading-relaxed break-words text-white">{msg.content}
                                {msg.wasFiltered && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1.5 align-middle"
                                    style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)" }}>
                                    <ShieldAlert className="w-2 h-2" /> filtrado
                                  </span>
                                )}
                              </p>
                            </div>
                            <MsgFooter isMe={isMe} time={msg.createdAt} isRead={msg.isRead} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            </>
          )}
          <div ref={bottomRef} className="h-1" />
        </div>

        {/* ── Input area ── */}
        <div className="relative z-10 flex-shrink-0"
          style={{ background: "rgba(3,10,24,0.95)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>

          {/* Quick replies (vendor only) */}
          {isCohost && (
            <div className="flex gap-2 px-4 pt-3 pb-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {QUICK_REPLIES.map(r => (
                <button key={r} onClick={() => handleQuickReply(r)}
                  className="flex-shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-all hover:border-white/30 hover:bg-white/[0.07] active:scale-95"
                  style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.04)" }}>
                  {r}
                </button>
              ))}
            </div>
          )}

          <div className="px-4 pt-3 pb-4 space-y-2">
            {/* Action chips */}
            <div className="flex gap-2 flex-wrap">
              {isCohost && (
                <button onClick={() => setShowProductPicker(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white/80 hover:bg-white/[0.07] transition-all active:scale-95">
                  <Package className="w-3.5 h-3.5 text-primary" /> Enviar producto
                </button>
              )}
              {isClient && !rentalInfo && !rentalRecord && !rentalLoading && (
                <button onClick={() => setShowPurchaseModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95"
                  style={{ borderColor: `${accent}45`, background: `${accent}12`, color: accent }}>
                  <ShoppingCart className="w-3.5 h-3.5" /> Solicitar compra
                </button>
              )}
            </div>

            {/* Pending image preview */}
            {pendingImage && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="relative flex-shrink-0">
                  <img src={pendingImage.previewUrl} alt="preview" className="w-14 h-14 rounded-xl object-cover" style={{ boxShadow: `0 4px 12px ${accent}20` }} />
                  {imgUploading && <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-white" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/80 truncate">{pendingImage.file.name}</p>
                  <p className="text-[11px] text-white/35 mt-0.5">{(pendingImage.file.size / 1024).toFixed(0)} KB · Pulsa Enviar</p>
                </div>
                {!imgUploading && (
                  <button onClick={() => setPendingImage(null)} className="w-7 h-7 rounded-xl flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.14] transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-white/50" />
                  </button>
                )}
              </div>
            )}

            {/* Pending video preview */}
            {pendingVideo && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-black">
                  <video src={pendingVideo.previewUrl} className="w-full h-full object-cover" muted />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Video className="w-4 h-4 text-white/80" />
                  </div>
                  {videoUploading && <div className="absolute inset-0 bg-black/70 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-white" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/80 truncate">{pendingVideo.file.name}</p>
                  <p className="text-[11px] text-white/35 mt-0.5">{(pendingVideo.file.size / (1024 * 1024)).toFixed(1)} MB · Pulsa Enviar</p>
                </div>
                {!videoUploading && (
                  <button onClick={() => { URL.revokeObjectURL(pendingVideo.previewUrl); setPendingVideo(null); }} className="w-7 h-7 rounded-xl flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.14] transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-white/50" />
                  </button>
                )}
              </div>
            )}

            {/* Recording bar */}
            {recording && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 text-sm font-bold tabular-nums">{fmtSec(voiceTimer)}</span>
                </div>
                <div className="flex-1 flex items-end gap-0.5 h-6">
                  {Array.from({ length: 20 }, (_, i) => (
                    <div key={i} className="flex-1 rounded-full bg-red-400/50 animate-pulse"
                      style={{ height: `${30 + Math.abs(Math.sin(i * 0.7 + Date.now() / 500)) * 70}%`, animationDelay: `${i * 0.05}s` }} />
                  ))}
                </div>
                <button onClick={stopRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all text-red-300 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20">
                  <MicOff className="w-3.5 h-3.5" /> Detener
                </button>
              </div>
            )}

            {/* Input row */}
            <form onSubmit={handleSend} className="flex items-center gap-2">
              {/* Image */}
              <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              {/* Video */}
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />

              <button type="button" onClick={() => imgInputRef.current?.click()} disabled={imgUploading || videoUploading || sending || recording || !!pendingVideo}
                className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition-all flex-shrink-0 disabled:opacity-30"
                title="Adjuntar foto">
                {imgUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
              </button>

              <button type="button" onClick={() => videoInputRef.current?.click()} disabled={imgUploading || videoUploading || sending || recording || !!pendingImage}
                className="w-10 h-10 rounded-xl flex items-center justify-center border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition-all flex-shrink-0 disabled:opacity-30"
                title="Adjuntar video">
                {videoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
              </button>

              {/* Mic */}
              <button type="button" onClick={recording ? stopRecording : startRecording} disabled={voiceUploading || sending || imgUploading}
                className="w-10 h-10 rounded-xl flex items-center justify-center border transition-all flex-shrink-0 disabled:opacity-30"
                style={recording
                  ? { background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.35)", color: "#f87171" }
                  : { background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                {voiceUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Text */}
              <input ref={inputRef} type="text" value={input} onChange={e => handleInputChange(e.target.value)} maxLength={1000}
                disabled={recording}
                placeholder={recording ? "Grabando nota de voz..." : (pendingImage || pendingVideo) ? "Añade un mensaje (opcional)..." : "Escribe tu mensaje..."}
                className="flex-1 px-4 py-2.5 rounded-2xl text-sm text-white placeholder:text-white/25 focus:outline-none disabled:opacity-40 transition-all"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: input.trim() || pendingImage || pendingVideo ? `1px solid ${accent}50` : "1px solid rgba(255,255,255,0.08)",
                  boxShadow: input.trim() || pendingImage ? `0 0 0 3px ${accent}10` : "none",
                }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
              />

              {/* Send */}
              <button type="submit" disabled={(!input.trim() && !pendingImage && !pendingVideo) || sending || recording || imgUploading || videoUploading}
                className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 flex-shrink-0"
                style={{ background: `linear-gradient(135deg,${accent},${accent}bb)`, boxShadow: (input.trim() || pendingImage || pendingVideo) ? `0 4px 16px ${accent}40` : "none" }}>
                {(sending || imgUploading || videoUploading)
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Send className="w-4 h-4 text-white" />
                }
              </button>
            </form>

            <p className="text-[10px] text-white/15 text-center">
              Tus datos personales están protegidos por LinkServi · No compartas teléfonos ni redes sociales
            </p>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showProductPicker && store && (
        <ProductPickerModal storeId={storeId} accent={accent}
          onSend={p => sendMessage({ messageType: "product_offer", content: "", productData: p })}
          onClose={() => setShowProductPicker(false)} />
      )}
      {showPurchaseModal && store && (
        <PurchaseRequestModal accent={accent}
          onSend={d => sendMessage({ messageType: "purchase_request", content: "", productData: d })}
          onClose={() => setShowPurchaseModal(false)} />
      )}
    </div>
  );
}
