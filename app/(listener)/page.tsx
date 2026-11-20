import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { BookRow, HomeSection } from '@/features/catalogue/components/book-row';
import { CategoryChips } from '@/features/catalogue/components/category-nav';
import { ContinueListening } from '@/features/catalogue/components/continue-listening';
import { HomeRowsSkeleton } from '@/features/catalogue/components/home-skeleton';
import { listCategories, listCategoryRows, listNewReleases } from '@/features/catalogue/data';
import { categoryName } from '@/features/catalogue/names';

/** The catalogue rows: New releases, then one row per category that has books. */
async function CatalogueRows() {
  const [t, locale, fresh, categories] = await Promise.all([
    getTranslations('pages.home'),
    getLocale(),
    listNewReleases(12),
    listCategoryRows(12),
  ]);

  if (fresh.length === 0) return <p className="text-muted-foreground">{t('empty')}</p>;

  return (
    <>
      <HomeSection
        id="new-releases"
        title={t('newReleases')}
        link={{ href: '/explore', label: t('explore') }}
      >
        <BookRow books={fresh} />
      </HomeSection>
      {categories.map((category) => (
        <HomeSection
          key={category.slug}
          id={`category-${category.slug}`}
          title={categoryName(category, locale)}
          link={{ href: `/category/${category.slug}`, label: t('seeAll') }}
        >
          <BookRow books={category.books} />
        </HomeSection>
      ))}
    </>
  );
}

/** Category chips under the title: "All" is filled, as on the canvas, and opens Explore. */
async function HomeChips() {
  const [t, locale, categories] = await Promise.all([
    getTranslations('catalogue'),
    getLocale(),
    listCategories(),
  ]);
  return (
    <CategoryChips
      categories={categories}
      locale={locale}
      selected="all"
      label={t('categories')}
      allLabel={t('all')}
    />
  );
}

/** Home (canvas: Main, MHome; loading: HomeLoading, MHomeLoading). */
export default async function HomePage() {
  const t = await getTranslations();

  return (
    <div className="flex flex-col gap-6 px-4 pt-2 pb-6 md:gap-8 md:px-6 md:pt-5 md:pb-10 lg:px-8 lg:pt-7">
      <div className="flex flex-col gap-3 md:gap-4">
        <h1 className="font-heading text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
          {t('pages.home.title')}
        </h1>
        {/* Holds the chips' height while they load, so the rows below do not jump. */}
        <Suspense fallback={<div className="h-8" />}>
          <HomeChips />
        </Suspense>
      </div>
      <ContinueListening />
      <Suspense fallback={<HomeRowsSkeleton label={t('common.loading')} />}>
        <CatalogueRows />
      </Suspense>
    </div>
  );
}
