import { RiSearchLine } from '@remixicon/react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { AccountControl } from '@/features/account/components/account-control';
import { SearchField } from '@/features/search/components/search-field';
import { BrandLink } from './brand';

/**
 * Sticky header. Phone: brand, search shortcut, sign-in (canvas: MHome).
 * Tablet and desktop: search field and sign-in (canvas: TabletHome, Main).
 */
export async function TopBar() {
  const t = await getTranslations();

  return (
    <header className="border-border bg-background sticky top-0 z-20 flex h-(--shell-header) items-center gap-2.5 px-4 md:gap-4 md:border-b md:px-6 lg:px-8">
      <div className="grow md:hidden">
        <BrandLink name={t('app.name')} compact />
      </div>

      <Link
        href="/search"
        aria-label={t('search.label')}
        className="grid size-11 place-items-center rounded-full md:hidden"
      >
        <RiSearchLine size={20} aria-hidden />
      </Link>

      {/* A plain GET form until the page is interactive, then results follow the typing. */}
      <Suspense fallback={null}>
        <SearchField
          variant="bar"
          placeholder={t('search.placeholder')}
          className="hidden md:flex lg:max-w-120"
        />
      </Suspense>

      <div className="hidden grow lg:block" />

      <AccountControl />
    </header>
  );
}
