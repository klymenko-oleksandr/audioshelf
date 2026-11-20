import { cn } from 'cn';
import type { ComponentProps } from 'react';

function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground h-9 w-full min-w-0 rounded-lg border px-3 text-sm shadow-xs transition-colors outline-none',
        'focus-visible:border-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
