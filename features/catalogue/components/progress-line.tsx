import { cn } from '@/lib/utils';

/** Thin progress line (canvas: 4 px in headers and cards, 3 px inside a chapter row). */
export function ProgressLine({ pct, className }: { pct: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('bg-muted block h-1 w-full overflow-hidden rounded-full', className)}
    >
      <span
        className="bg-primary block h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </span>
  );
}
