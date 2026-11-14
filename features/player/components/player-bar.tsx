import { getTranslations } from 'next-intl/server';
import { PlayerBarView } from './player-bar-view';

/**
 * The fixed slot for the persistent player. It lives in the root layout, outside the routed
 * content, so it never unmounts on navigation.
 *
 *   < 768     floating card above the tab bar
 *   768–1023  72 px bar across the bottom
 *   ≥ 1024    80 px bar across the bottom
 *
 * Phase 2 connects PlayerBarView to the real player; until then it shows the idle state.
 */
export async function PlayerBar() {
  const t = await getTranslations('player');

  return (
    <section
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-(--shell-tabbar) z-30 px-2 pb-1 md:bottom-0 md:p-0"
    >
      <PlayerBarView state="idle" />
    </section>
  );
}
