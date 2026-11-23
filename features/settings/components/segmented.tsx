'use client';

import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
}

/** A single-choice group of buttons (radio semantics), styled like the language switcher. */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-muted inline-flex w-fit flex-wrap rounded-lg p-[3px]"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium tabular-nums transition-colors disabled:opacity-60',
            'aria-checked:bg-zinc-900 aria-checked:text-white dark:aria-checked:bg-zinc-100 dark:aria-checked:text-zinc-900',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
