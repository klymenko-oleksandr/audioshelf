import { RiGoogleFill, RiSearchLine } from '@remixicon/react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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

      {/* A plain GET form: works before hydration and keeps the query in the URL (PRD). */}
      <form
        action="/search"
        role="search"
        className="border-input text-muted-foreground focus-within:shadow-focus hidden h-10 grow items-center gap-2 rounded-lg border px-3 shadow-xs md:flex lg:h-8 lg:max-w-120 lg:rounded-md lg:px-2.5"
      >
        <RiSearchLine aria-hidden className="size-[18px] shrink-0 lg:size-4" />
        <input
          type="search"
          name="q"
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
          className="text-foreground placeholder:text-muted-foreground min-w-0 grow bg-transparent text-[16px] outline-none focus-visible:shadow-none lg:text-[13px]"
        />
      </form>

      <div className="hidden grow lg:block" />

      <Link
        href="/signin"
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium shadow-xs"
      >
        <RiGoogleFill size={16} aria-hidden className="hidden md:block" />
        {t('auth.signIn')}
      </Link>
    </header>
  );
}
