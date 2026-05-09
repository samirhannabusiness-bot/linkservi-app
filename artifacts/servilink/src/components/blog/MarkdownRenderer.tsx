import { Link } from "wouter";
import { ArrowRight, MapPin, Star, CheckCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";

type Block =
  | { kind: "h1" | "h2" | "h3" | "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "img"; alt: string; src: string }
  | { kind: "cta"; href: string; text: string; variant: string; subtitle?: string }
  | { kind: "blockquote"; text: string }
  | { kind: "hr" }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "workers"; title: string };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Workers dynamic block
    const workersMatch = line.match(/^:::workers(?:\s+(.+?))?:::$/);
    if (workersMatch) {
      const params: Record<string, string> = {};
      if (workersMatch[1]) {
        const parts = workersMatch[1].split(/\s+(?=\w+=)/);
        for (const p of parts) {
          const eq = p.indexOf("=");
          if (eq > 0) params[p.slice(0, eq)] = p.slice(eq + 1);
        }
      }
      blocks.push({ kind: "workers", title: params.title || "Profesionales disponibles ahora" });
      i++; continue;
    }

    // CTA block
    const ctaMatch = line.match(/^:::cta\s+(.+?):::$/);
    if (ctaMatch) {
      const parts = ctaMatch[1].split(/\s+(?=\w+=)/);
      const obj: Record<string, string> = {};
      for (const p of parts) {
        const eq = p.indexOf("=");
        if (eq > 0) obj[p.slice(0, eq)] = p.slice(eq + 1);
      }
      blocks.push({ kind: "cta", href: obj.href || "/", text: obj.text || "Más info", variant: obj.variant || "primary", subtitle: obj.subtitle });
      i++; continue;
    }

    // Headings
    if (line.startsWith("# "))  { blocks.push({ kind: "h1", text: line.slice(2) }); i++; continue; }
    if (line.startsWith("## ")) { blocks.push({ kind: "h2", text: line.slice(3) }); i++; continue; }
    if (line.startsWith("### ")) { blocks.push({ kind: "h3", text: line.slice(4) }); i++; continue; }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ kind: "hr" }); i++; continue;
    }

    // Blockquote
    if (line.startsWith("> ")) { blocks.push({ kind: "blockquote", text: line.slice(2) }); i++; continue; }

    // Image
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) { blocks.push({ kind: "img", alt: imgMatch[1], src: imgMatch[2] }); i++; continue; }

    // Table — detect pipe rows
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const parseRow = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const [headerRow, , ...dataRows] = tableLines;
      const headers = parseRow(headerRow);
      const rows = dataRows.map(parseRow);
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items }); continue;
    }

    // Unordered list
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2)); i++;
      }
      blocks.push({ kind: "ul", items }); continue;
    }

    // Paragraph: collect until blank/structural line
    const buf: string[] = [line]; i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("- ") &&
      !/^\d+\.\s/.test(lines[i]) &&
      !lines[i].startsWith(":::") &&
      !lines[i].startsWith(">") &&
      !lines[i].includes("|") &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]); i++;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const tok = m[0];
    if (tok.startsWith("[")) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        const href = lm[2];
        if (href.startsWith("/")) {
          parts.push(<Link key={key++} href={href} style={{ color: "#38bdf8", textDecoration: "underline" }}>{lm[1]}</Link>);
        } else {
          parts.push(<a key={key++} href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#38bdf8", textDecoration: "underline" }}>{lm[1]}</a>);
        }
      }
    } else if (tok.startsWith("**")) {
      parts.push(<strong key={key++} style={{ color: "rgba(255,255,255,0.97)", fontWeight: 700 }}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith("`")) {
      parts.push(<code key={key++} style={{ background: "rgba(255,255,255,0.08)", color: "#7dd3fc", padding: "2px 7px", borderRadius: 5, fontSize: "0.875em" }}>{tok.slice(1, -1)}</code>);
    }
    lastIdx = m.index + tok.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

// ─── Ultra-premium table ────────────────────────────────────────────────────
function PremiumTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div style={{
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.07)",
      boxShadow: "0 4px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.04) inset",
      margin: "2rem 0",
    }}>
      <table style={{
        width: "100%",
        minWidth: 420,
        borderCollapse: "collapse",
        fontSize: "0.94rem",
        lineHeight: 1.55,
      }}>
        <thead>
          <tr style={{
            background: "linear-gradient(180deg, rgba(56,189,248,0.12) 0%, rgba(56,189,248,0.06) 100%)",
            borderBottom: "1px solid rgba(56,189,248,0.18)",
          }}>
            {headers.map((h, ci) => (
              <th key={ci} style={{
                padding: "14px 20px",
                textAlign: ci === 0 ? "left" : "right",
                fontWeight: 700,
                fontSize: "0.78rem",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "#7dd3fc",
                whiteSpace: "nowrap",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{
              background: ri % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.0)",
              borderBottom: ri < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
              transition: "background 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(56,189,248,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.0)")}
            >
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: "13px 20px",
                  textAlign: ci === 0 ? "left" : "right",
                  color: ci === 0 ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.7)",
                  fontWeight: ci === 0 ? 500 : 400,
                  whiteSpace: ci === 0 ? "normal" : "nowrap",
                }}>
                  {renderInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Dynamic Workers Block ───────────────────────────────────────────────────
interface WorkerCard {
  id: number;
  name: string;
  avatarUrl: string | null;
  categoryName: string | null;
  city: string | null;
  rating: number | null;
  reviewCount: number;
  isVerified: boolean;
}

function WorkersBlock({ title }: { title: string }) {
  const [workers, setWorkers] = useState<WorkerCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workers?limit=3&available=true")
      .then(r => r.json())
      .then((data: WorkerCard[]) => {
        setWorkers(Array.isArray(data) ? data.slice(0, 3) : []);
      })
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{
      margin: "2.5rem 0",
      borderRadius: 20,
      border: "1px solid rgba(56,189,248,0.2)",
      background: "linear-gradient(135deg, rgba(56,189,248,0.07), rgba(56,189,248,0.02))",
      padding: "24px",
      boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#38bdf8", fontWeight: 700, marginBottom: 4 }}>En Línea Ahora</p>
          <h3 style={{ color: "white", fontWeight: 800, fontSize: "1.15rem", margin: 0 }}>{title}</h3>
        </div>
        <Link href="/workers" style={{
          padding: "8px 16px",
          borderRadius: 10,
          background: "rgba(56,189,248,0.12)",
          border: "1px solid rgba(56,189,248,0.25)",
          color: "#38bdf8",
          fontSize: "0.8rem",
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}>
          Ver todos →
        </Link>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map(k => (
            <div key={k} style={{ height: 72, borderRadius: 14, background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      ) : workers.length === 0 ? (
        <Link href="/workers" style={{ textDecoration: "none" }}>
          <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>
            Ver profesionales disponibles →
          </div>
        </Link>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {workers.map(w => (
            <Link key={w.id} href={`/workers/${w.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(56,189,248,0.08)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(56,189,248,0.25)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)"; }}
              >
                {w.avatarUrl ? (
                  <img src={w.avatarUrl} alt={w.name} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#38bdf8,#2563eb)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "white", fontSize: "1.1rem", flexShrink: 0 }}>
                    {w.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, color: "white", fontSize: "0.95rem" }}>{w.name}</span>
                    {w.isVerified && <CheckCircle style={{ width: 14, height: 14, color: "#38bdf8", flexShrink: 0 }} />}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                    {w.categoryName && <span style={{ fontSize: "0.78rem", color: "#7dd3fc", fontWeight: 600 }}>{w.categoryName}</span>}
                    {w.city && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "0.75rem", color: "rgba(255,255,255,0.45)" }}>
                        <MapPin style={{ width: 11, height: 11 }} />{w.city}
                      </span>
                    )}
                    {w.rating && w.reviewCount > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "0.75rem", color: "#fbbf24" }}>
                        <Star style={{ width: 11, height: 11, fill: "#fbbf24" }} />{w.rating.toFixed(1)} ({w.reviewCount})
                      </span>
                    )}
                  </div>
                </div>
                <div style={{
                  flexShrink: 0,
                  padding: "7px 14px",
                  borderRadius: 9,
                  background: "#38bdf8",
                  color: "#040c1a",
                  fontSize: "0.78rem",
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}>
                  Contratar
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CTA Block ─────────────────────────────────────────────────────────────
function CTABlock({ href, text, variant, subtitle }: { href: string; text: string; variant: string; subtitle?: string }) {
  const isPrimary = variant === "primary";
  const inner = (
    <div style={{
      borderRadius: 18,
      padding: "20px 24px",
      margin: "2rem 0",
      background: isPrimary
        ? "linear-gradient(135deg, rgba(56,189,248,0.14), rgba(56,189,248,0.05))"
        : "rgba(255,255,255,0.04)",
      border: isPrimary
        ? "1px solid rgba(56,189,248,0.28)"
        : "1px solid rgba(255,255,255,0.09)",
      boxShadow: isPrimary ? "0 8px 32px rgba(56,189,248,0.12)" : "none",
      cursor: "pointer",
      transition: "transform 0.15s, box-shadow 0.15s",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLElement).style.boxShadow = isPrimary ? "0 12px 40px rgba(56,189,248,0.2)" : "0 4px 20px rgba(0,0,0,0.3)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = isPrimary ? "0 8px 32px rgba(56,189,248,0.12)" : "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {subtitle && <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontWeight: 600, color: "#7dd3fc" }}>{subtitle}</p>}
          <p style={{ fontWeight: 700, fontSize: "1.05rem", lineHeight: 1.35, color: "white", margin: 0 }}>{text}</p>
        </div>
        <div style={{
          flexShrink: 0,
          padding: "10px 18px",
          borderRadius: 12,
          fontWeight: 700,
          fontSize: "0.875rem",
          display: "flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
          background: isPrimary ? "#38bdf8" : "rgba(255,255,255,0.1)",
          color: isPrimary ? "#040c1a" : "white",
          boxShadow: isPrimary ? "0 4px 20px rgba(56,189,248,0.35)" : "none",
        }}>
          Ir <ArrowRight style={{ width: 15, height: 15 }} />
        </div>
      </div>
    </div>
  );
  return href.startsWith("/")
    ? <Link href={href}>{inner}</Link>
    : <a href={href} target="_blank" rel="noopener noreferrer">{inner}</a>;
}

// ─── Main renderer ──────────────────────────────────────────────────────────
export function MarkdownRenderer({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <article className="space-y-6" style={{ color: "rgba(255,255,255,0.85)" }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h1":
            return <h1 key={i} style={{ color: "white", fontSize: "clamp(1.75rem,4vw,2.5rem)", fontWeight: 800, letterSpacing: "-0.02em", marginTop: "2rem", marginBottom: "0.5rem", lineHeight: 1.18 }}>{renderInline(b.text)}</h1>;
          case "h2":
            return <h2 key={i} style={{ color: "white", fontSize: "clamp(1.35rem,3vw,1.875rem)", fontWeight: 700, letterSpacing: "-0.015em", marginTop: "2.5rem", marginBottom: "0.5rem", lineHeight: 1.25 }}>{renderInline(b.text)}</h2>;
          case "h3":
            return <h3 key={i} style={{ color: "rgba(255,255,255,0.95)", fontSize: "clamp(1.1rem,2.5vw,1.375rem)", fontWeight: 700, marginTop: "2rem", marginBottom: "0.25rem", lineHeight: 1.3 }}>{renderInline(b.text)}</h3>;
          case "p":
            return <p key={i} style={{ fontSize: "1.05rem", lineHeight: 1.78, color: "rgba(255,255,255,0.82)" }}>{renderInline(b.text)}</p>;
          case "ul":
            return (
              <ul key={i} style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {b.items.map((it, j) => (
                  <li key={j} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: "1.05rem", lineHeight: 1.65 }}>
                    <span style={{ flexShrink: 0, marginTop: 9, width: 6, height: 6, borderRadius: "50%", background: "#38bdf8", display: "inline-block" }} />
                    <span>{renderInline(it)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10, counterReset: "ol-counter" }}>
                {b.items.map((it, j) => (
                  <li key={j} style={{ display: "flex", gap: 14, alignItems: "flex-start", fontSize: "1.05rem", lineHeight: 1.65 }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", fontWeight: 700, color: "#38bdf8", marginTop: 1 }}>{j + 1}</span>
                    <span>{renderInline(it)}</span>
                  </li>
                ))}
              </ol>
            );
          case "img":
            return (
              <figure key={i} style={{ margin: "2rem 0" }}>
                <img src={b.src} alt={b.alt} loading="lazy" style={{ width: "100%", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)" }} />
                {b.alt && <figcaption style={{ fontSize: "0.78rem", marginTop: 8, textAlign: "center", color: "rgba(255,255,255,0.38)" }}>{b.alt}</figcaption>}
              </figure>
            );
          case "blockquote":
            return (
              <blockquote key={i} style={{ borderLeft: "3px solid #38bdf8", paddingLeft: 20, fontStyle: "italic", fontSize: "1.05rem", lineHeight: 1.65, color: "rgba(255,255,255,0.72)", background: "rgba(56,189,248,0.05)", borderRadius: "0 10px 10px 0", padding: "14px 20px", margin: "1rem 0" }}>
                {renderInline(b.text)}
              </blockquote>
            );
          case "hr":
            return <hr key={i} style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "2rem 0" }} />;
          case "table":
            return <PremiumTable key={i} headers={b.headers} rows={b.rows} />;
          case "cta":
            return <CTABlock key={i} {...b} />;
          case "workers":
            return <WorkersBlock key={i} title={b.title} />;
        }
      })}
    </article>
  );
}
