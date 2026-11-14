import { getTranslations } from 'next-intl/server';
import { tabItems } from './nav-items';
import { NavLink } from './nav-link';

const iconWrap =
  'grid h-6 w-12 place-items-center rounded-full transition-colors group-focus-visible:shadow-focus ' +
  'group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-foreground';

/** Bottom tab bar, under 768 px (design system: TabBar; canvas board: MobileDock). */
export async function TabBar() {
  const t = await getTranslations('nav');

  return (
    <nav
      aria-label={t('mainLabel')}
      className="border-border bg-background fixed inset-x-0 bottom-0 z-30 flex h-(--shell-tabbar) border-t pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      {tabItems.map((item) => {
        const Icon = item.icon;
        const ActiveIcon = item.activeIcon;
        return (
          <NavLink
            key={item.key}
            href={item.href}
            className="group text-caption text-muted-foreground aria-[current=page]:text-foreground flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 focus-visible:shadow-none"
            icon={
              <span className={iconWrap}>
                <Icon size={20} aria-hidden />
              </span>
            }
            activeIcon={
              <span className={iconWrap}>
                <ActiveIcon size={20} aria-hidden />
              </span>
            }
          >
            {t(`short.${item.key}`)}
          </NavLink>
        );
      })}
    </nav>
  );
}
