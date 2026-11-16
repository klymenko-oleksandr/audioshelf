import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { BookGrid, BookGridSkeleton, ListToolbar } from '@/features/catalogue/components/book-grid';
import { CategoryChips, CategoryTiles } from '@/features/catalogue/components/category-nav';
import { listAllBooks, listCategories } from '@/features/catalogue/data';
import { parseBookSort, sortBooks, type BookSort } from '@/features/catalogue/sort';

type Props = { searchParams: Promise<{ sort?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pages.explore');
  return { title: t('title') };
}

/** Categories, then every book. Chips from tablets up, tiles on phones (canvas: MExplore). */
async function ExploreContent({ sort }: { sort: BookSort }) {
  const [t, locale, categories, books] = await Promise.all([
    getTranslations(),
    getLocale(),
    listCategories(),
    listAllBooks(),
  ]);

  if (books.length === 0) {
    return <p className="text-muted-foreground">{t('pages.home.empty')}</p>;
  }

  return (
    <>
      <CategoryChips
        className="hidden md:block"
        categories={categories}
        locale={locale}
        selected="all"
        current
        label={t('catalogue.categories')}
        allLabel={t('catalogue.all')}
      />
      {categories.length > 0 ? (
        <section aria-labelledby="explore-categories" className="flex flex-col gap-2.5 md:hidden">
          <h2 id="explore-categories" className="font-heading text-[18px] leading-6 font-semibold">
            {t('catalogue.categories')}
          </h2>
          <CategoryTiles
            categories={categories}
            locale={locale}
            countLabel={(count) => t('catalogue.bookCount', { count })}
          />
        </section>
      ) : null}
      <section aria-labelledby="explore-books" className="flex flex-col gap-4 md:gap-6">
        <h2
          id="explore-books"
          className="font-heading text-[18px] leading-6 font-semibold md:sr-only"
        >
          {t('catalogue.allBooks')}
        </h2>
        <ListToolbar countLabel={t('catalogue.bookCount', { count: books.length })} sort={sort} />
        <BookGrid books={sortBooks(books, sort)} />
      </section>
    </>
  );
}

/** Explore (canvas: Category for tablet and desktop, MExplore for phones). */
export default async function ExplorePage({ searchParams }: Props) {
  const [t, { sort }] = await Promise.all([getTranslations(), searchParams]);

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-6 md:gap-6 md:px-6 md:pt-5 md:pb-10 lg:px-8 lg:pt-7">
      <h1 className="font-heading text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
        {t('pages.explore.title')}
      </h1>
      <Suspense fallback={<BookGridSkeleton label={t('common.loading')} />}>
        <ExploreContent sort={parseBookSort(sort)} />
      </Suspense>
    </div>
  );
}
