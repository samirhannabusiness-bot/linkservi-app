import { useState } from "react";
import { Star, X, CheckCircle, Loader2 } from "lucide-react";
import { getAuthHeader } from "@/lib/api";

const TAG_OPTIONS = [
  { key: "puntual",       label: "Puntual",         emoji: "⏰" },
  { key: "respetuoso",    label: "Respetuoso",       emoji: "🤝" },
  { key: "pago_a_tiempo", label: "Pagó a tiempo",    emoji: "💳" },
  { key: "comunicativo",  label: "Comunicativo",     emoji: "💬" },
  { key: "amable",        label: "Amable",           emoji: "😊" },
] as const;

interface Props {
  bookingId: number;
  clientName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RateClientModal({ bookingId, clientName, onClose, onSuccess }: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const toggleTag = (key: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      setError("Selecciona una calificación antes de continuar");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch("/api/client-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ bookingId, rating, tags: [...selectedTags] }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "Error al enviar la calificación");
        return;
      }
      setDone(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1800);
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const STAR_LABELS = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];
  const activeRating = hovered || rating;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground text-base">¿Cómo fue tu cliente?</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <CheckCircle className="w-12 h-12 text-emerald-500" />
            <p className="font-semibold text-foreground">¡Calificación enviada!</p>
            <p className="text-sm text-muted-foreground">Gracias por tu aporte a la comunidad.</p>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Star selector */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="flex items-center gap-1"
                onMouseLeave={() => setHovered(0)}
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onMouseEnter={() => setHovered(s)}
                    onClick={() => { setRating(s); setError(""); }}
                    className="p-1 transition-transform hover:scale-110 active:scale-95"
                    aria-label={`${s} estrellas`}
                  >
                    <Star
                      className={`w-9 h-9 transition-colors ${
                        s <= activeRating
                          ? "text-amber-400 fill-amber-400"
                          : "text-muted-foreground/30 fill-none"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span className="text-sm font-medium text-muted-foreground h-4">
                {activeRating > 0 ? STAR_LABELS[activeRating] : "Toca para calificar"}
              </span>
            </div>

            {/* Tag selector */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Etiquetas (opcional)
              </p>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((t) => {
                  const active = selectedTags.has(t.key);
                  return (
                    <button
                      key={t.key}
                      onClick={() => toggleTag(t.key)}
                      className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border font-medium transition-all ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      <span>{t.emoji}</span>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Ahora no
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? "Enviando..." : "Enviar calificación"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
