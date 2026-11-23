'use client';

import { cn } from '@/lib/utils';

/** An on/off switch. `label` names it for assistive tech; the visible text sits beside it. */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-muted-foreground/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform dark:bg-zinc-900',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}
