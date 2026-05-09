import { useState } from "react";
import { Star, X } from "lucide-react";
import { getAuthHeader } from "@/lib/api";

interface ReviewModalProps {
  booking: { id: number; workerId: number; workerName: string; categoryName: string };
  onClose: () => void;
  onSuccess: () => void;
}

async function submitReview(bookingId: number, workerId: number, rating: number, comment: string) {
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ bookingId, workerId, rating, comment }),
  });
  if (!res.ok) throw new Error("Error al enviar reseña");
  return res.json();
}

export function ReviewModal({ booking, onClose, onSuccess }: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const RATING_LABELS = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];

  const handleSubmit = async () => {
    if (!rating) { setError("Selecciona una calificación"); return; }
    setSubmitting(true);
    try {
      await submitReview(booking.id, booking.workerId, rating, comment);
      onSuccess();
      onClose();
    } catch (e) {
      setError("No se pudo enviar la reseña. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground">Calificar servicio</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{booking.workerName} · {booking.categoryName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground mb-3">¿Cómo fue tu experiencia?</p>
            <div className="flex items-center justify-center gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-9 h-9 transition-colors ${star <= (hovered || rating) ? "fill-amber-400 text-amber-400" : "text-muted"}`}
                  />
                </button>
              ))}
            </div>
            {(hovered || rating) > 0 && (
              <p className="text-sm font-medium text-amber-600">{RATING_LABELS[hovered || rating]}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Comentario (opcional)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Cuéntanos sobre tu experiencia con este profesional..."
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-muted transition-colors">
            Omitir
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-amber-400 text-slate-900 text-sm font-semibold hover:bg-amber-300 transition-colors disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Publicar reseña"}
          </button>
        </div>
      </div>
    </div>
  );
}
