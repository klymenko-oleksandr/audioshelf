import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { CategoryTiles } from '@/features/catalogue/components/category-nav';
import { listCategories, searchCatalogue } from '@/features/catalogue/data';
import { RecentSearches } from '@/features/search/components/recent-searches';
import { SearchField } from '@/features/search/components/search-field';
import { SearchResultsView } from '@/features/search/components/search-results';
import { parseQuery, parseSearchTab } from '@/features/search/tabs';

type Props = { searchParams: Promise<{ q?: string | string[]; tab?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.search');
  // The query is not in the title: it is the listener's own text, and a search page is not
  // something to index or share as a "page" (the link still works).
  return { title: t('title'), robots: { index: false } };
}

/** Nothing typed yet: recent searches, then the categories. */
async function SearchStart() {
  const [t, tn, locale, categories] = await Promise.all([
    getTranslations('search'),
    getTranslations('catalogue'),
    getLocale(),
    listCategories(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-[14px] md:text-[13px]">{t('startHint')}</p>
      <RecentSearches />
      {categories.length > 0 ? (
        <section aria-labelledby="search-categories" className="flex flex-col gap-2.5 md:gap-4">
          <h2
            id="search-categories"
            className="font-heading text-[18px] leading-6 font-semibold md:text-[20px] md:leading-7"
          >
            {t('browseCategories')}
          </h2>
          <CategoryTiles
            categories={categories}
            locale={locale}
            countLabel={(count) => tn('bookCount', { count })}
            className="md:grid-cols-4 md:gap-3"
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * Search (canvas: Search, SearchEmpty, MSearchResults, MSearchEmpty). The query is in the URL;
 * the field in the top bar (tablet and desktop) or in the page (phones) keeps it in step.
 */
export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const [t, tp] = await Promise.all([getTranslations('search'), getTranslations('pages.search')]);
  const query = parseQuery(params.q);
  const results = query ? await searchCatalogue(query) : null;

  return (
    <div className="flex flex-col gap-4 px-4 pt-3 pb-6 md:gap-0 md:px-6 md:pt-7 md:pb-10 lg:px-8">
      <SearchField variant="page" placeholder={t('placeholder')} className="md:hidden" />
      <div className="md:pt-0">
        {results ? (
          <SearchResultsView query={query} tab={parseSearchTab(params.tab)} results={results} />
        ) : (
          <>
            <h1 className="font-heading mb-3 text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
              {tp('title')}
            </h1>
            <SearchStart />
          </>
        )}
      </div>
    </div>
  );
}
