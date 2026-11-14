import { RiPlayFill } from '@remixicon/react';
import { getTranslations } from 'next-intl/server';

/**
 * Placeholder for the persistent player (Phase 2 replaces the inside).
 * It lives in the root layout, outside the routed content, so it never unmounts on navigation.
 *
 * Geometry per breakpoint (canvas: MobileDock, TabletHome, PlayerBar):
 *   < 768     floating 60 px card above the tab bar
 *   768–1023  72 px bar across the bottom
 *   ≥ 1024    80 px bar across the bottom
 */
export async function PlayerBar() {
  const t = await getTranslations('player');

  return (
    <section
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-(--shell-tabbar) z-30 px-2 pb-1 md:bottom-0 md:p-0"
    >
      <div className="border-border bg-card flex h-15 items-center gap-2.5 rounded-lg border pr-1 pl-2 shadow-lg md:h-(--shell-player) md:gap-3 md:rounded-none md:border-x-0 md:border-b-0 md:px-4 md:shadow-none">
        <span
          className="bg-muted size-10 shrink-0 rounded-sm md:size-12 md:rounded-md"
          aria-hidden
        />
        <span className="flex min-w-0 grow flex-col">
          <span className="truncate text-[13px] font-medium">{t('idleTitle')}</span>
          <span className="text-muted-foreground truncate text-[11px]">{t('idleHint')}</span>
        </span>
        <button
          type="button"
          disabled
          aria-label={t('play')}
          className="md:bg-primary md:text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50 md:size-12"
        >
          <RiPlayFill size={24} aria-hidden />
        </button>
      </div>
    </section>
  );
}
