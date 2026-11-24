import { RiSettings3Line } from '@remixicon/react';
import { getTranslations } from 'next-intl/server';
import { SidebarAccount } from '@/features/account/components/sidebar-account';
import { BrandLink } from './brand';
import { sidebarLibrary, sidebarMain, type NavItem } from './nav-items';
import { NavLink } from './nav-link';

const itemClass =
  'flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] text-sidebar-foreground ' +
  'hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent ' +
  'aria-[current=page]:font-semibold aria-[current=page]:text-sidebar-accent-foreground';

async function SidebarItem({ item }: { item: NavItem }) {
  const t = await getTranslations('nav');
  const Icon = item.icon;
  const ActiveIcon = item.activeIcon;

  if (item.soon) {
    return (
      <span
        aria-disabled="true"
        className="text-muted-foreground flex h-9 items-center gap-3 px-2.5 text-[13px] whitespace-nowrap"
      >
        <Icon size={18} aria-hidden />
        <span className="min-w-0 grow truncate">{t(item.key)}</span>
        <span className="border-border text-caption -mr-1 shrink-0 rounded-md border px-1">
          {t('soon')}
        </span>
      </span>
    );
  }

  return (
    <NavLink
      href={item.href}
      also={item.also}
      className={itemClass}
      icon={<Icon size={18} aria-hidden className="text-muted-foreground" />}
      activeIcon={<ActiveIcon size={18} aria-hidden className="text-brand" />}
    >
      <span className="grow">{t(item.key)}</span>
    </NavLink>
  );
}

/** Full sidebar, 1024 px and up (canvas board: Sidebar). */
export async function Sidebar() {
  const t = await getTranslations();

  return (
    <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground fixed top-0 bottom-(--shell-player) left-0 hidden w-60 flex-col gap-6 overflow-y-auto border-r px-3 py-5 lg:flex">
      <div className="flex h-8 items-center px-2">
        <BrandLink name={t('app.name')} />
      </div>

      <nav aria-label={t('nav.mainLabel')} className="flex flex-col gap-0.5">
        {sidebarMain.map((item) => (
          <SidebarItem key={item.key} item={item} />
        ))}
      </nav>

      <nav aria-label={t('nav.libraryLabel')} className="flex flex-col gap-0.5">
        <div className="text-muted-foreground px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.06em] uppercase">
          {t('nav.libraryLabel')}
        </div>
        {sidebarLibrary.map((item) => (
          <SidebarItem key={item.key} item={item} />
        ))}
      </nav>

      <div className="grow" />

      <SidebarAccount />

      <NavLink
        href="/settings"
        className="text-sidebar-foreground hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] aria-[current=page]:font-semibold"
        icon={<RiSettings3Line size={18} aria-hidden className="text-muted-foreground" />}
      >
        {t('nav.settings')}
      </NavLink>
    </aside>
  );
}
