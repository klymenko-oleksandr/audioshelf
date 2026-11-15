import { cn } from '@/lib/utils';

/** Ring spinner in the current text colour. Size it with `size-*`. Stops under reduced motion. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none',
        className,
      )}
    />
  );
}
