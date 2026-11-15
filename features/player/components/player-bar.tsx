import { getTranslations } from 'next-intl/server';
import { PlayerBarLive } from './player-bar-live';
import { PlayerOverlays } from './player-overlays';

/**
 * The fixed slot for the persistent player. It lives in the root layout, outside the routed
 * content, so it never unmounts on navigation.
 *
 *   < 768     floating card above the tab bar
 *   768–1023  72 px bar across the bottom
 *   ≥ 1024    80 px bar across the bottom
 *
 * PlayerBarLive connects the presentational PlayerBarView to the player engine.
 */
export async function PlayerBar() {
  const t = await getTranslations('player');

  return (
    <section
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-(--shell-tabbar) z-30 px-2 pb-1 md:bottom-0 md:p-0"
    >
      <PlayerBarLive />
      <PlayerOverlays />
    </section>
  );
}
