import {
  RiBarChart2Line,
  RiBookOpenFill,
  RiBookOpenLine,
  RiCompass3Fill,
  RiCompass3Line,
  RiDownload2Fill,
  RiDownload2Line,
  RiHome5Fill,
  RiHome5Line,
  RiUser3Fill,
  RiUser3Line,
  type RemixiconComponentType,
} from '@remixicon/react';

export type NavKey = 'home' | 'explore' | 'library' | 'downloads' | 'stats' | 'you';

export interface NavItem {
  key: NavKey;
  href: string;
  icon: RemixiconComponentType;
  /** Fill variant marks the active state only (design system rule). */
  activeIcon: RemixiconComponentType;
  /** Not built yet: shown with a "Soon" badge and not focusable as a link. */
  soon?: boolean;
}

const home: NavItem = { key: 'home', href: '/', icon: RiHome5Line, activeIcon: RiHome5Fill };
const explore: NavItem = {
  key: 'explore',
  href: '/explore',
  icon: RiCompass3Line,
  activeIcon: RiCompass3Fill,
};
const library: NavItem = {
  key: 'library',
  href: '/library',
  icon: RiBookOpenLine,
  activeIcon: RiBookOpenFill,
};
const downloads: NavItem = {
  key: 'downloads',
  href: '/downloads',
  icon: RiDownload2Line,
  activeIcon: RiDownload2Fill,
};
const stats: NavItem = {
  key: 'stats',
  href: '/stats',
  icon: RiBarChart2Line,
  activeIcon: RiBarChart2Line,
  soon: true,
};
const you: NavItem = { key: 'you', href: '/settings', icon: RiUser3Line, activeIcon: RiUser3Fill };

/** Sidebar (≥ 1024 px): two groups. */
export const sidebarMain: NavItem[] = [home, explore];
export const sidebarLibrary: NavItem[] = [library, downloads, stats];

/** Icon rail (768–1023 px): one column. */
export const railItems: NavItem[] = [home, explore, library, downloads, stats];

/** Bottom tab bar (< 768 px): four tabs. */
export const tabItems: NavItem[] = [home, explore, library, you];
