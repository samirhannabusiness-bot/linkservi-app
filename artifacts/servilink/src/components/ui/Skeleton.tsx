import { cn } from "@/lib/utils";

// ── shadcn-style Skeleton (used by sidebar.tsx) ───────────────────────────────
// Light-theme variant: bg-primary/10. Kept here so we have one Skeleton file.
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  );
}

// ── Internal pulse block — dark-theme variant (bg-white/[0.06]) ───────────────
function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/[0.06]", className)} />;
}

// ── List-row skeleton (icon + two lines of text) ──────────────────────────────
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-5 py-3", className)}>
      <SkeletonBlock className="w-9 h-9 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <SkeletonBlock className="h-3.5 w-2/5" />
        <SkeletonBlock className="h-2.5 w-1/3" />
      </div>
    </div>
  );
}

// ── Card skeleton (matches glass rounded-2xl cards) ──────────────────────────
export function SkeletonCard({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("glass rounded-2xl p-4 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <SkeletonBlock className="w-12 h-12 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-3.5 w-1/2" />
          <SkeletonBlock className="h-2.5 w-1/3" />
        </div>
      </div>
      {lines > 2 && <SkeletonBlock className="h-2.5 w-3/4" />}
    </div>
  );
}

// ── Stats grid skeleton ────────────────────────────────────────────────────────
export function SkeletonStats({ cols = 4, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn(`grid gap-3`, className)} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="glass rounded-xl p-4 flex flex-col items-center gap-2">
          <SkeletonBlock className="w-5 h-5 rounded-full" />
          <SkeletonBlock className="h-6 w-12" />
          <SkeletonBlock className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

// ── Full-page error fallback ──────────────────────────────────────────────────
export function QueryError({
  message = "No se pudo cargar la información",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="glass rounded-2xl p-10 text-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-2xl">⚠️</div>
      <p className="text-sm font-medium text-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:bg-white/[0.10] transition-colors"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
