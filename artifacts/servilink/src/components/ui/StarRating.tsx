import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRating({ rating, max = 5, size = "sm" }: { rating: number; max?: number; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn(sz, i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-gray-300")}
        />
      ))}
    </div>
  );
}
