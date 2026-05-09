import React, { useState } from "react";
import { X, Download, FileText, Calendar, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getRequestOptions } from "@/lib/api";

type Range = "today" | "yesterday" | "this_week" | "this_month" | "custom";

interface Props {
  onClose: () => void;
}

const RANGES: { value: Range; label: string; icon: string }[] = [
  { value: "today",      label: "Hoy",           icon: "⬤" },
  { value: "yesterday",  label: "Ayer",           icon: "◎" },
  { value: "this_week",  label: "Esta semana",    icon: "◈" },
  { value: "this_month", label: "Este mes",       icon: "◆" },
  { value: "custom",     label: "Personalizado",  icon: "⊞" },
];

export function ExportReportModal({ onClose }: Props) {
  const opts = getRequestOptions() as RequestInit;

  const [range, setRange]     = useState<Range>("this_month");
  const [fromDate, setFrom]   = useState("");
  const [toDate, setTo]       = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      let url = `/api/admin/reports/pdf?range=${range}`;
      if (range === "custom") {
        if (!fromDate || !toDate) {
          setError("Debes seleccionar fecha de inicio y fin.");
          setLoading(false);
          return;
        }
        url += `&from=${fromDate}&to=${toDate}`;
      }

      const res = await fetch(url, { ...opts, method: "GET" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Error ${res.status}`);
      }

      // Extract filename from header
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+?)"/);
      const filename = match?.[1] ?? "reporte.pdf";

      // Trigger download
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);

      setSuccess(true);
      setTimeout(() => { setSuccess(false); onClose(); }, 2200);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo generar el reporte.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 460,
          background: "linear-gradient(160deg, rgba(15,23,42,0.98) 0%, rgba(8,14,30,0.99) 100%)",
          border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.12) inset",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40, height: 40, borderRadius: 12,
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <FileText className="w-5 h-5" style={{ color: "#a5b4fc" }} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Exportar reporte</h2>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>PDF de operaciones · nivel corporativo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10, padding: 6, cursor: "pointer",
            }}
          >
            <X className="w-4 h-4" style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>

        {/* Range selector */}
        <p className="text-xs font-semibold mb-3" style={{ color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Rango del reporte
        </p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {RANGES.filter(r => r.value !== "custom").map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              style={{
                padding: "11px 14px",
                borderRadius: 12,
                border: `1px solid ${range === r.value ? "rgba(99,102,241,0.55)" : "rgba(255,255,255,0.08)"}`,
                background: range === r.value ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                color: range === r.value ? "#a5b4fc" : "rgba(255,255,255,0.5)",
                fontSize: 13, fontWeight: 600,
                cursor: "pointer", textAlign: "left" as const,
                transition: "all 0.15s",
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => setRange("custom")}
            className="col-span-2"
            style={{
              padding: "11px 14px",
              borderRadius: 12,
              border: `1px solid ${range === "custom" ? "rgba(99,102,241,0.55)" : "rgba(255,255,255,0.08)"}`,
              background: range === "custom" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
              color: range === "custom" ? "#a5b4fc" : "rgba(255,255,255,0.5)",
              fontSize: 13, fontWeight: 600,
              cursor: "pointer", textAlign: "left" as const,
              display: "flex", alignItems: "center", gap: 8,
              transition: "all 0.15s",
            }}
          >
            <Calendar className="w-4 h-4" />
            Personalizado
          </button>
        </div>

        {/* Custom date pickers */}
        {range === "custom" && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: "Desde", value: fromDate, set: setFrom },
              { label: "Hasta", value: toDate,   set: setTo   },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <p className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
                <input
                  type="date"
                  value={value}
                  onChange={e => set(e.target.value)}
                  style={{
                    width: "100%", padding: "9px 12px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10, color: "#fff", fontSize: 13,
                    outline: "none",
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* What's included */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "12px 14px", marginBottom: 20,
          }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>El reporte incluirá:</p>
          {[
            "Resumen general de ingresos y comisiones",
            "Ingresos por canal (servicios · tienda · alquileres)",
            "Actividad de la plataforma",
            "Tabla de transacciones del período",
            "Alertas activas (disputas · retiros · KYC)",
            "Top profesionales y productos",
          ].map(item => (
            <p key={item} className="text-xs flex items-center gap-2 mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              <span style={{ color: "#34d399", fontSize: 10 }}>✓</span>
              {item}
            </p>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#f87171" }} />
            <p className="text-xs" style={{ color: "#fca5a5" }}>{error}</p>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleExport}
          disabled={loading || success}
          style={{
            width: "100%", padding: "13px 20px",
            borderRadius: 14,
            background: success
              ? "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(5,150,105,0.2))"
              : "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(79,70,229,0.95))",
            border: `1px solid ${success ? "rgba(16,185,129,0.5)" : "rgba(99,102,241,0.6)"}`,
            color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: loading || success ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: loading ? 0.8 : 1,
            transition: "all 0.2s",
            boxShadow: success ? "none" : "0 4px 24px rgba(99,102,241,0.3)",
          }}
        >
          {success ? (
            <><CheckCircle2 className="w-4 h-4" /> Descargando…</>
          ) : loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generando PDF…</>
          ) : (
            <><Download className="w-4 h-4" /> Exportar reporte PDF</>
          )}
        </button>

        <p className="text-center text-[11px] mt-3" style={{ color: "rgba(255,255,255,0.25)" }}>
          Descarga automática · Tu rol determina el contenido del reporte
        </p>
      </div>
    </div>
  );
}
