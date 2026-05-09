import { useState } from "react";
import { Heart } from "lucide-react";
import { getAuthHeader } from "@/lib/api";

interface Props {
  workerId: number;
  initialFavorited?: boolean;
  size?: "sm" | "md";
  className?: string;
  onToggle?: (favorited: boolean) => void;
}

export function FavoriteButton({ workerId, initialFavorited = false, size = "md", className = "", onToggle }: Props) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [loading, setLoading] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/favorites/${workerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFavorited(data.favorited);
      onToggle?.(data.favorited);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const sizeClass = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const iconClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={favorited ? "Quitar de favoritos" : "Guardar en favoritos"}
      className={`${sizeClass} rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${favorited ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700" : "bg-white/80 dark:bg-zinc-800/80 border border-border hover:border-red-200 dark:hover:border-red-700"} backdrop-blur-sm ${className}`}
    >
      <Heart
        className={`${iconClass} transition-all ${favorited ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-red-400"} ${loading ? "animate-pulse" : ""}`}
      />
    </button>
  );
}
