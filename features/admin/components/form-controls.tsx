import { RiErrorWarningLine } from '@remixicon/react';
import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';

/** A labelled control with its hint and error. The error is announced and tied to the control. */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-[13px] leading-none font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <span
          id={`${id}-error`}
          role="alert"
          className="text-destructive flex items-start gap-1.5 text-xs"
        >
          <RiErrorWarningLine size={14} aria-hidden className="mt-px shrink-0" />
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="text-muted-foreground text-xs">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

/** `aria` props that tie a control to the error or hint under it. */
export function describe(id: string, error: string | undefined, hasHint = false) {
  return {
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  };
}

const CONTROL =
  'border-input bg-background text-foreground w-full min-w-0 rounded-lg border text-sm shadow-xs transition-colors outline-none focus-visible:border-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3 disabled:pointer-events-none disabled:opacity-50';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(CONTROL, 'h-9 px-2.5', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'resize-y px-3 py-2 leading-5', className)} {...props} />;
}

/** A checkbox with a title and a line of explanation, as the board's switches. */
export function CheckboxRow({
  id,
  label,
  hint,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'id'> & { id: string; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="accent-primary mt-0.5 size-4 shrink-0 cursor-pointer"
        {...props}
      />
      <label htmlFor={id} className="flex cursor-pointer flex-col gap-0.5 text-[13px] font-medium">
        {label}
        <span className="text-muted-foreground text-xs font-normal">{hint}</span>
      </label>
    </div>
  );
}
