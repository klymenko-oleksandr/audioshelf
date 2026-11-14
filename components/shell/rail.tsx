import { RiSettings3Line } from '@remixicon/react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BrandMark } from './brand';
import { railItems } from './nav-items';
import { NavLink } from './nav-link';

const itemClass =
  'flex w-16 flex-col items-center gap-1 rounded-lg py-1.5 text-center text-[11px] leading-[14px] ' +
  'text-muted-foreground hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent ' +
  'aria-[current=page]:font-semibold aria-[current=page]:text-sidebar-accent-foreground';

/** Icon rail, 768–1023 px (canvas board: TabletHome). */
export async function Rail() {
  const t = await getTranslations();

  return (
    <nav
      aria-label={t('nav.mainLabel')}
      className="border-sidebar-border bg-sidebar fixed top-0 bottom-(--shell-player) left-0 hidden w-20 flex-col items-center gap-2 overflow-y-auto border-r py-4 md:flex lg:hidden"
    >
      <Link href="/" aria-label={t('app.name')} className="mb-3 rounded-md">
        <BrandMark size={36} />
      </Link>

      {railItems.map((item) => {
        const Icon = item.icon;
        const ActiveIcon = item.activeIcon;
        const label = t(`nav.short.${item.key}`);

        if (item.soon) {
          return (
            <span
              key={item.key}
              aria-disabled="true"
              title={t('nav.soon')}
              className="text-muted-foreground flex w-16 flex-col items-center gap-1 py-1.5 text-center text-[11px] leading-[14px] opacity-60"
            >
              <Icon size={20} aria-hidden />
              {label}
            </span>
          );
        }

        return (
          <NavLink
            key={item.key}
            href={item.href}
            className={itemClass}
            icon={<Icon size={20} aria-hidden />}
            activeIcon={<ActiveIcon size={20} aria-hidden className="text-brand" />}
          >
            {label}
          </NavLink>
        );
      })}

      <div className="grow" />

      <NavLink
        href="/settings"
        className="text-muted-foreground hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground grid size-11 place-items-center rounded-lg"
        icon={<RiSettings3Line size={20} aria-hidden />}
      >
        <span className="sr-only">{t('nav.settings')}</span>
      </NavLink>
    </nav>
  );
}
