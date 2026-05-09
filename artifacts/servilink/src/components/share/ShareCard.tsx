import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";

type Props = {
  url: string;
  title: string;
  text: string;
};

export function ShareCard({ url, title, text }: Props) {
  const [copied, setCopied] = useState(false);

  const message = `${title}\n\n${text}\n\n${url}`;

  async function nativeShare() {
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* cancelled */
    }
  }
  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

  return (
    <section className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "rgba(255,255,255,0.9)" }}>
          <Share2 className="w-4 h-4" /> Compartir
        </h3>
        <button onClick={nativeShare} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(56,189,248,0.15)", color: "#7dd3fc" }}>
          Compartir nativo
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <a href={wa} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-semibold" style={{ background: "rgba(37,211,102,0.12)", color: "#25d366" }}>
          <span className="text-lg">💬</span> WhatsApp
        </a>
        <a href={tw} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-semibold" style={{ background: "rgba(29,161,242,0.12)", color: "#1da1f2" }}>
          <span className="text-lg">𝕏</span> Twitter
        </a>
        <a href={fb} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-semibold" style={{ background: "rgba(24,119,242,0.12)", color: "#1877f2" }}>
          <span className="text-lg">f</span> Facebook
        </a>
        <a href={tg} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-semibold" style={{ background: "rgba(0,136,204,0.12)", color: "#0088cc" }}>
          <span className="text-lg">✈️</span> Telegram
        </a>
      </div>
      <button onClick={copy} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}>
        {copied ? (
          <>
            <Check className="w-4 h-4" style={{ color: "#34d399" }} /> Copiado
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" /> Copiar enlace
          </>
        )}
      </button>
    </section>
  );
}
