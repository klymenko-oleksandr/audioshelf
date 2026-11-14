import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PlayerBar } from '@/features/player/components/player-bar';
import { Rail } from './rail';
import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';
import { TopBar } from './top-bar';

/**
 * The app shell (PRD: Navigation and routing → Shell per viewport).
 *
 *   < 768 px     bottom tab bar, mini-player above it
 *   768–1023 px  icon rail on the left, compact player bar
 *   ≥ 1024 px    full sidebar, full player bar
 *
 * Navigation and player are fixed; the document itself scrolls, so the browser restores
 * scroll position on back/forward and phone browser chrome collapses as usual.
 * Sizes come from the --shell-* variables in globals.css.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const t = await getTranslations('shell');

  return (
    <>
      <a
        href="#content"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 text-[13px] font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('skipToContent')}
      </a>

      <Sidebar />
      <Rail />

      <div className="flex min-h-dvh flex-col pb-[calc(var(--shell-player)+var(--shell-tabbar)+8px)] pl-(--shell-nav) md:pb-(--shell-player)">
        <TopBar />
        <main id="content" tabIndex={-1} className="flex grow flex-col focus-visible:shadow-none">
          {children}
        </main>
      </div>

      <PlayerBar />
      <TabBar />
    </>
  );
}
