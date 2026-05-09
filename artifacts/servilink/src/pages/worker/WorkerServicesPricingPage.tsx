import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  DollarSign, Loader2, ListOrdered, X, CheckCircle2,
  GripVertical, Info,
} from "lucide-react";

interface WorkerService {
  id: number;
  workerId: number;
  name: string;
  description: string | null;
  basePrice: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function ServiceModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: WorkerService;
  onSave: (data: { name: string; description: string; basePrice: number }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [basePrice, setBasePrice] = useState(initial?.basePrice?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(basePrice);
    if (!name.trim()) { toast({ title: "El nombre es requerido", variant: "destructive" }); return; }
    if (isNaN(price) || price < 0) { toast({ title: "Ingresa un precio válido", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), basePrice: price });
      onClose();
    } catch (err: any) {
      toast({ title: err?.message ?? "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-foreground text-lg">
            {initial ? "Editar servicio" : "Nuevo servicio"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Nombre del servicio *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Instalación eléctrica básica"
              maxLength={80}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Descripción (opcional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe brevemente qué incluye este servicio..."
              rows={3}
              maxLength={300}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Precio base (USD) *</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="number"
                value={basePrice}
                onChange={e => setBasePrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" />
              El precio puede ajustarse por cotización en el chat
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {initial ? "Guardar cambios" : "Agregar servicio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────
function ServiceCard({
  service,
  onEdit,
  onDelete,
  onToggle,
}: {
  service: WorkerService;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className={`bg-card border rounded-xl p-4 transition-all ${service.isActive ? "border-border" : "border-border/40 opacity-60"}`}>
      <div className="flex items-start gap-3">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 mt-1 flex-shrink-0 cursor-grab" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-sm">{service.name}</p>
            {!service.isActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Oculto</span>
            )}
          </div>
          {service.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{service.description}</p>
          )}
          <div className="flex items-center gap-1 mt-2">
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {service.basePrice.toFixed(2)} USD
            </span>
            <span className="text-xs text-muted-foreground ml-1">precio base</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggle}
            title={service.isActive ? "Ocultar" : "Mostrar"}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {service.isActive
              ? <ToggleRight className="w-4 h-4 text-emerald-500" />
              : <ToggleLeft className="w-4 h-4" />
            }
          </button>
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function WorkerServicesPricingPage() {
  const { token } = useAuth();
  const [services, setServices] = useState<WorkerService[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkerService | undefined>();

  const authHeaders = { Authorization: `Bearer ${token}` };

  async function loadServices() {
    try {
      const data = await apiFetch("/api/my/services", { headers: authHeaders });
      setServices(data ?? []);
    } catch (err: any) {
      toast({ title: "Error al cargar servicios", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadServices(); }, []);

  async function handleCreate(data: { name: string; description: string; basePrice: number }) {
    await apiFetch("/api/my/services", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    toast({ title: "✅ Servicio agregado" });
    loadServices();
  }

  async function handleUpdate(id: number, data: { name: string; description: string; basePrice: number }) {
    await apiFetch(`/api/my/services/${id}`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    toast({ title: "✅ Servicio actualizado" });
    loadServices();
  }

  async function handleToggle(service: WorkerService) {
    await apiFetch(`/api/my/services/${service.id}`, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !service.isActive }),
    });
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, isActive: !s.isActive } : s));
  }

  async function handleDelete(id: number) {
    if (!window.confirm("¿Eliminar este servicio?")) return;
    await apiFetch(`/api/my/services/${id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    toast({ title: "Servicio eliminado" });
    setServices(prev => prev.filter(s => s.id !== id));
  }

  const activeCount = services.filter(s => s.isActive).length;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ListOrdered className="w-6 h-6 text-primary" />
              Servicios y precios
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define tu menú de servicios con precios base visibles en tu perfil.
            </p>
          </div>
          {services.length < 20 && (
            <button
              onClick={() => { setEditTarget(undefined); setShowModal(true); }}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          )}
        </div>

        {/* Info banner */}
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
            <p className="font-semibold">Precios referenciales</p>
            <p>Los clientes verán tus servicios y precios base en tu perfil. Pueden solicitar cotización personalizada vía chat.</p>
          </div>
        </div>

        {/* Stats */}
        {services.length > 0 && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span><span className="font-bold text-foreground">{services.length}</span> servicios totales</span>
            <span>·</span>
            <span><span className="font-bold text-emerald-500">{activeCount}</span> visibles en perfil</span>
          </div>
        )}

        {/* Services list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <DollarSign className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">Sin servicios aún</p>
            <p className="text-sm text-muted-foreground mb-4">
              Agrega tus primeros servicios para que los clientes vean qué ofreces y a qué precio.
            </p>
            <button
              onClick={() => { setEditTarget(undefined); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Agregar primer servicio
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {services.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                onEdit={() => { setEditTarget(service); setShowModal(true); }}
                onDelete={() => handleDelete(service.id)}
                onToggle={() => handleToggle(service)}
              />
            ))}
          </div>
        )}

        {services.length >= 20 && (
          <p className="text-xs text-center text-muted-foreground">Has alcanzado el límite de 20 servicios.</p>
        )}
      </div>

      {showModal && (
        <ServiceModal
          initial={editTarget}
          onSave={editTarget
            ? (data) => handleUpdate(editTarget.id, data)
            : handleCreate
          }
          onClose={() => setShowModal(false)}
        />
      )}
    </AppLayout>
  );
}
