import { useState } from "react";
import { X, Briefcase, ChevronRight, Loader2 } from "lucide-react";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { useListCategories } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  onSuccess: () => void;
  onClose: () => void;
}

export function WorkerActivationModal({ onSuccess, onClose }: Props) {
  const { data: categories = [] } = useListCategories();
  const qc = useQueryClient();

  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("10");
  const [servicePrice, setServicePrice] = useState("50");
  const [skills, setSkills] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) { setError("Selecciona una categoría"); return; }
    setLoading(true);
    setError("");
    try {
      await apiFetch("/api/profile/activate-worker-mode", {
        method: "POST",
        headers: { ...getAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(categoryId),
          description,
          basePrice: Number(basePrice),
          servicePrice: Number(servicePrice),
          skills: skills.split(",").map(s => s.trim()).filter(Boolean),
        }),
      });
      // Invalidate /me so the new secondaryRole is fetched
      await qc.invalidateQueries({ queryKey: ["getMe"] });
      onSuccess();
    } catch (err: any) {
      setError(err?.data?.error ?? "Ocurrió un error. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-md glass rounded-3xl p-6 relative" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/60 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-400/15 flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Activar modo Profesional</h2>
            <p className="text-xs text-muted-foreground">Crea tu perfil profesional para ofrecer servicios</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Categoría de servicio *
            </label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50"
              style={{
                backgroundColor: "#0f172a",
                color: "#ffffff",
                borderColor: "rgba(255,255,255,0.12)",
              }}
              required
            >
              <option value="" style={{ backgroundColor: "#0f172a", color: "#ffffff" }}>
                Selecciona una categoría
              </option>
              {(categories as any[]).map((cat: any) => (
                <option
                  key={cat.id}
                  value={cat.id}
                  style={{ backgroundColor: "#0f172a", color: "#ffffff" }}
                >
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Descripción profesional
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Cuéntanos sobre tu experiencia y lo que ofreces..."
              rows={3}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-white/25 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Precio base (USD)
              </label>
              <input
                type="number"
                min="1"
                value={basePrice}
                onChange={e => setBasePrice(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                Precio servicio (USD)
              </label>
              <input
                type="number"
                min="1"
                value={servicePrice}
                onChange={e => setServicePrice(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
              Habilidades (separadas por coma)
            </label>
            <input
              type="text"
              value={skills}
              onChange={e => setSkills(e.target.value)}
              placeholder="Ej: Plomería, Soldadura, Instalaciones"
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-white/25 focus:outline-none focus:border-primary/50"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-gradient py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            {loading ? "Activando..." : "Activar modo Profesional"}
          </button>
        </form>
      </div>
    </div>
  );
}
