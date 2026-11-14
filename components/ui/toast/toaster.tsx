'use client';

import { RiCloseLine } from '@remixicon/react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { toastStore, type Toast } from './store';

function ToastCard({ toast }: { toast: Toast }) {
  const t = useTranslations('toast');

  return (
    <div
      key={toast.id}
      data-variant={toast.variant}
      onPointerEnter={toastStore.pause}
      onPointerLeave={toastStore.resume}
      onFocus={toastStore.pause}
      onBlur={toastStore.resume}
      className="bg-menu text-menu-foreground border-menu-border animate-in fade-in slide-in-from-bottom-2 pointer-events-auto flex w-full items-center gap-3 rounded-lg border py-2.5 pr-2 pl-3.5 text-[13px] leading-[18px] shadow-lg backdrop-blur-md duration-150 md:w-auto md:max-w-[440px] md:min-w-80"
    >
      {toast.icon ? (
        <span
          aria-hidden
          className={cn(
            'flex shrink-0',
            toast.variant === 'error' ? 'text-menu-destructive' : 'text-menu-muted-foreground',
          )}
        >
          {toast.icon}
        </span>
      ) : null}
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="font-medium">{toast.title}</span>
        {toast.description ? (
          <span className="text-menu-muted-foreground text-[12px]">{toast.description}</span>
        ) : null}
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={toastStore.runAction}
          className="bg-menu-accent border-menu-border h-7 shrink-0 rounded-md border px-2.5 text-[12px] font-semibold pointer-coarse:h-11 pointer-coarse:min-w-11"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={t('close')}
        onClick={() => toastStore.dismiss('close')}
        className="text-menu-muted-foreground grid size-7 shrink-0 place-items-center rounded-md pointer-coarse:size-11"
      >
        <RiCloseLine size={16} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Renders the current toast. Desktop and tablet: bottom-left above the player bar.
 * Phone: full width above the mini-player.
 *
 * The two live regions are always in the DOM (screen readers only announce changes inside
 * regions that already exist): polite for ordinary toasts, assertive for errors.
 */
export function Toaster() {
  const toast = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    () => null, // nothing on the server
  );

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-[calc(var(--shell-player)+var(--shell-tabbar)+12px)] z-40 flex flex-col md:right-auto md:bottom-[calc(var(--shell-player)+16px)] md:left-[calc(var(--shell-nav)+16px)]">
      <div role="status" aria-live="polite">
        {toast && toast.variant !== 'error' ? <ToastCard key={toast.id} toast={toast} /> : null}
      </div>
      <div role="alert" aria-live="assertive">
        {toast && toast.variant === 'error' ? <ToastCard key={toast.id} toast={toast} /> : null}
      </div>
    </div>
  );
}
