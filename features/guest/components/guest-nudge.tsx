'use client';

import { RiCloseLine, RiGoogleFill, RiHeartFill } from '@remixicon/react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { toastStore } from '@/components/ui/toast/store';
import { useLibraryFlags } from '@/features/library/flags/use-library-flags';
import { useNowPlayingOpen } from '@/features/player/ui/player-ui';
import { readWelcomeGate, WELCOME_RESOLVED_EVENT } from '../gate';
import { nudgeDue, nudgeVisible, signinHref } from '../nudge';
import { getGuestStore, useGuest } from '../use-guest';

/** A toast is on screen. Toasts are one at a time, and the nudge must never stack on one. */
function useToastVisible(): boolean {
  return useSyncExternalStore(
    toastStore.subscribe,
    () => toastStore.getSnapshot() !== null,
    () => false,
  );
}

function useWelcomeOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener(WELCOME_RESOLVED_EVENT, listener);
      return () => window.removeEventListener(WELCOME_RESOLVED_EVENT, listener);
    },
    () => readWelcomeGate() !== undefined,
    () => false,
  );
}

/**
 * The guest sign-in nudge (boards GuestNudge, MGuestNudge): a dismissible card above the
 * player after the 3rd like or Listen later, snoozed for 7 days or 10 more adds. The rules
 * live in `nudge.ts`; this only gathers the inputs.
 *
 * It says plainly that the books live only in this browser and that clearing site data
 * loses them (PRD: Guest identity). It waits while a toast (Undo) is showing, while the
 * full-screen player or the welcome screen is open, and on the sign-in page itself.
 */
export function GuestNudge() {
  const t = useTranslations('guest.nudge');
  const guest = useGuest();
  const flags = useLibraryFlags();
  const playerOpen = useNowPlayingOpen();
  const toastVisible = useToastVisible();
  const welcomeOpen = useWelcomeOpen();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // Fixed for this page view: a snooze ending while the page is open is not worth a timer.
  const [now] = useState(() => Date.now());

  const visible = nudgeVisible({
    due: nudgeDue(guest.nudge, now),
    ready: guest.ready,
    guest: true, // no accounts before Phase 6
    playerOpen,
    toastVisible,
    welcomeOpen,
    pathname,
  });
  if (!visible) return null;

  const liked = flags.ready ? flags.likedIds.length : 0;
  const later = flags.ready ? flags.listenLaterIds.length : 0;
  const message =
    liked > 0 && later > 0
      ? t('both', { liked, later })
      : liked > 0
        ? t('likedOnly', { liked })
        : later > 0
          ? t('laterOnly', { later })
          : t('none');

  const snooze = () => void getGuestStore().dismissNudge();

  return (
    <section
      role="dialog"
      aria-labelledby="guest-nudge-title"
      aria-describedby="guest-nudge-body"
      onKeyDown={(event) => {
        if (event.key === 'Escape') snooze();
      }}
      className="bg-popover text-popover-foreground border-border animate-in fade-in slide-in-from-bottom-2 fixed inset-x-2 bottom-[calc(var(--shell-player)+var(--shell-tabbar)+8px)] z-40 flex flex-col gap-3.5 rounded-xl border p-4.5 shadow-lg duration-150 md:inset-x-auto md:right-6 md:bottom-[calc(var(--shell-player)+16px)] md:w-95"
    >
      <div className="flex items-start gap-3">
        <span className="bg-accent text-brand grid size-10 shrink-0 place-items-center rounded-lg">
          <RiHeartFill size={20} aria-hidden />
        </span>
        <div className="flex grow flex-col gap-1">
          <h2
            id="guest-nudge-title"
            className="font-heading text-[17px] leading-[22px] font-semibold"
          >
            {t('title')}
          </h2>
          <div id="guest-nudge-body" className="text-muted-foreground text-[13px] leading-5">
            <p>{message}</p>
            <p className="mt-1">{t('warning')}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={t('close')}
          onClick={snooze}
          className="text-muted-foreground -mt-1.5 -mr-1.5 grid size-8 shrink-0 place-items-center rounded-md pointer-coarse:size-11"
        >
          <RiCloseLine size={18} aria-hidden />
        </button>
      </div>
      <div className="flex gap-2">
        <Link
          href={signinHref(pathname, search)}
          onClick={snooze}
          className="border-input bg-background inline-flex h-10 grow items-center justify-center gap-2 rounded-md border text-[13px] font-medium shadow-xs pointer-coarse:h-11"
        >
          <RiGoogleFill size={16} aria-hidden />
          {t('cta')}
        </Link>
        <button
          type="button"
          onClick={snooze}
          className="text-muted-foreground h-10 rounded-md px-3.5 text-[13px] font-medium pointer-coarse:h-11"
        >
          {t('notNow')}
        </button>
      </div>
    </section>
  );
}
