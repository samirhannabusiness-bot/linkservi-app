import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Edit3, Trash2, Eye, EyeOff, ExternalLink, Save, X } from "lucide-react";

type Article = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  coverImageUrl: string | null;
  coverAlt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  category: string;
  tags: string[];
  vertical: string;
  authorName: string;
  isPublished: boolean;
  publishedAt: string | null;
  readMinutes: number;
  views: number;
  updatedAt: string;
};

const VERTICALS = ["servicios", "tienda", "empleo"];

export function AdminBlogPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Article> | null>(null);

  const { data, isLoading } = useQuery<{ items: Article[] }>({
    queryKey: ["admin-blog"],
    queryFn: async () => (await fetch("/api/admin/blog/articles", { credentials: "include" })).json(),
  });

  const saveMut = useMutation({
    mutationFn: async (article: Partial<Article>) => {
      const isNew = !article.id;
      const url = isNew ? "/api/admin/blog/articles" : `/api/admin/blog/articles/${article.id}`;
      const r = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(article),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Error");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-blog"] });
      setEditing(null);
    },
  });

  const delMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/blog/articles/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("error");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-blog"] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="min-h-screen" style={{ background: "#040c1a", color: "white" }}>
      <header className="sticky top-0 z-30 border-b" style={{ background: "rgba(4,12,26,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="p-2 -ml-2 rounded-lg hover:bg-white/5"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-base font-bold flex-1">Blog · Administración</h1>
          <button
            onClick={() => setEditing({ vertical: "servicios", category: "general", isPublished: false, tags: [] })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: "#38bdf8" }}
          >
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {isLoading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Cargando…</p>}
        {!isLoading && items.length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-base mb-3" style={{ color: "rgba(255,255,255,0.7)" }}>No hay artículos todavía.</p>
            <button onClick={() => setEditing({ vertical: "servicios", category: "general", isPublished: false, tags: [] })} className="px-5 py-2.5 rounded-xl font-semibold" style={{ background: "#38bdf8" }}>Crear el primero</button>
          </div>
        )}
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {a.coverImageUrl && <img src={a.coverImageUrl} alt="" className="w-full md:w-32 h-24 md:h-20 rounded-xl object-cover" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {a.isPublished ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#34d399" }}>PUBLICADO</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>BORRADOR</span>
                  )}
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "#7dd3fc" }}>{a.vertical}</span>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{a.views} views</span>
                </div>
                <h3 className="font-bold truncate">{a.title}</h3>
                <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.5)" }}>/blog/{a.slug}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {a.isPublished && (
                  <a href={`/blog/${a.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} title="Ver">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button onClick={() => setEditing(a)} className="p-2 rounded-lg" style={{ background: "rgba(56,189,248,0.15)", color: "#38bdf8" }}>
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { if (confirm(`¿Eliminar "${a.title}"?`)) delMut.mutate(a.id); }}
                  className="p-2 rounded-lg"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {editing && (
        <ArticleEditor
          article={editing}
          onClose={() => setEditing(null)}
          onSave={(a) => saveMut.mutate(a)}
          saving={saveMut.isPending}
          error={saveMut.error?.message}
        />
      )}
    </div>
  );
}

function ArticleEditor({ article, onClose, onSave, saving, error }: {
  article: Partial<Article>;
  onClose: () => void;
  onSave: (a: Partial<Article>) => void;
  saving: boolean;
  error?: string;
}) {
  const [a, setA] = useState<Partial<Article>>(article);

  function update<K extends keyof Article>(k: K, v: Article[K]) {
    setA((p) => ({ ...p, [k]: v }));
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: "rgba(4,12,26,0.97)" }}>
      <div className="sticky top-0 border-b z-10 flex items-center gap-3 px-4 py-3" style={{ background: "rgba(4,12,26,0.95)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.08)" }}>
        <button onClick={onClose} className="p-2 -ml-2 rounded-lg hover:bg-white/5"><X className="w-5 h-5" /></button>
        <h2 className="text-base font-bold flex-1">{a.id ? "Editar artículo" : "Nuevo artículo"}</h2>
        <button onClick={() => onSave(a)} disabled={saving || !a.title} className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold disabled:opacity-50" style={{ background: "#38bdf8" }}>
          <Save className="w-4 h-4" /> {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {error && <div className="rounded-xl p-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#fca5a5" }}>{error}</div>}

        <Field label="Título *">
          <input value={a.title || ""} onChange={(e) => update("title", e.target.value)} className="w-full px-4 py-3 rounded-xl text-lg font-bold" style={fieldStyle} placeholder="Cómo elegir un buen plomero en Caracas" />
        </Field>

        <Field label="Resumen / Lead paragraph (aparece destacado)">
          <textarea value={a.excerpt || ""} onChange={(e) => update("excerpt", e.target.value)} rows={2} className="w-full px-4 py-3 rounded-xl resize-none" style={fieldStyle} placeholder="2-3 frases que enganchen al lector" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vertical">
            <select value={a.vertical || "servicios"} onChange={(e) => update("vertical", e.target.value)} className="w-full px-4 py-3 rounded-xl" style={fieldStyle}>
              {VERTICALS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Categoría">
            <input value={a.category || ""} onChange={(e) => update("category", e.target.value)} className="w-full px-4 py-3 rounded-xl" style={fieldStyle} placeholder="how-to, guia, reseña…" />
          </Field>
        </div>

        <Field label="URL de imagen de portada">
          <input value={a.coverImageUrl || ""} onChange={(e) => update("coverImageUrl", e.target.value)} className="w-full px-4 py-3 rounded-xl" style={fieldStyle} placeholder="https://…" />
        </Field>
        <Field label="Alt de la imagen (SEO)">
          <input value={a.coverAlt || ""} onChange={(e) => update("coverAlt", e.target.value)} className="w-full px-4 py-3 rounded-xl" style={fieldStyle} placeholder="Plomero reparando una llave en Caracas" />
        </Field>

        <Field label="Contenido (Markdown + CTAs)">
          <textarea
            value={a.contentMd || ""}
            onChange={(e) => update("contentMd", e.target.value)}
            rows={20}
            className="w-full px-4 py-3 rounded-xl font-mono text-sm"
            style={fieldStyle}
            placeholder={`## Encabezado

Texto **en negrita** o *cursiva*. Enlaza a [otra página](/servicios/plomeros).

- Lista item 1
- Lista item 2

:::cta href=/servicios/plomeros text=Contratar plomero ahora variant=primary subtitle=AHORA EN TU ZONA:::

> Cita destacada aquí.

![Alt de imagen](https://...)`}
          />
          <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            Sintaxis CTA: <code style={{ color: "#7dd3fc" }}>:::cta href=/ruta text=Texto variant=primary subtitle=...:::</code>
          </p>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Meta title (SEO)">
            <input value={a.metaTitle || ""} onChange={(e) => update("metaTitle", e.target.value)} className="w-full px-4 py-3 rounded-xl" style={fieldStyle} placeholder="(opcional, usa el título)" />
          </Field>
          <Field label="Meta description (SEO)">
            <input value={a.metaDescription || ""} onChange={(e) => update("metaDescription", e.target.value)} className="w-full px-4 py-3 rounded-xl" style={fieldStyle} placeholder="(opcional, usa el resumen)" />
          </Field>
        </div>

        <Field label="Tags (separados por coma)">
          <input value={(a.tags || []).join(", ")} onChange={(e) => update("tags", e.target.value.split(",").map((s) => s.trim()).filter(Boolean) as string[])} className="w-full px-4 py-3 rounded-xl" style={fieldStyle} placeholder="plomería, caracas, reparación" />
        </Field>

        <label className="flex items-center gap-3 p-4 rounded-xl cursor-pointer" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input type="checkbox" checked={!!a.isPublished} onChange={(e) => update("isPublished", e.target.checked)} className="w-5 h-5" />
          <div className="flex-1">
            <p className="font-semibold flex items-center gap-2">
              {a.isPublished ? <Eye className="w-4 h-4" style={{ color: "#34d399" }} /> : <EyeOff className="w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />}
              Publicar
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Visible para todos y enviado a buscadores</p>
          </div>
        </label>
      </div>
    </div>
  );
}

const fieldStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "white",
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>{label}</label>
      {children}
    </div>
  );
}
