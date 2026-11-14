'use client';

import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name; shown as the heading unless `header` replaces it. */
  title: string;
  description?: string;
  /** Custom header (e.g. a book summary). The title is then kept for screen readers only. */
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Phone bottom sheet (canvas: MCardActions, MSpeedSheet, MSleepSheet, MChapters).
 * Closes on tap outside, Esc and the browser Back button.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  header,
  children,
  className,
}: BottomSheetProps) {
  useCloseOnBack(open, () => onOpenChange(false));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          'max-h-[85dvh] gap-2 overflow-y-auto rounded-t-[20px] border-t-0 px-5 pt-2 pb-[calc(28px+env(safe-area-inset-bottom,0px))] text-[15px]',
          className,
        )}
      >
        <span aria-hidden className="bg-border h-1 w-10 shrink-0 self-center rounded-full" />
        {header ? (
          <>
            <SheetTitle className="sr-only">{title}</SheetTitle>
            {header}
          </>
        ) : (
          <SheetTitle className="text-h4 pt-2">{title}</SheetTitle>
        )}
        {description ? <SheetDescription>{description}</SheetDescription> : null}
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** One full-width row in a sheet: 52 px tall, icon then label. */
export function SheetAction({
  icon,
  children,
  onSelect,
}: {
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="border-border flex min-h-13 items-center gap-3.5 border-b px-1 text-left text-[15px] last:border-b-0"
    >
      <span aria-hidden className="flex shrink-0">
        {icon}
      </span>
      {children}
    </button>
  );
}
