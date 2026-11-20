import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { BookGrid, ListToolbar } from '@/features/catalogue/components/book-grid';
import { CategoryChips } from '@/features/catalogue/components/category-nav';
import { getCategoryBySlug, listCategories } from '@/features/catalogue/data';
import { categoryName } from '@/features/catalogue/names';
import { parseBookSort, sortBooks } from '@/features/catalogue/sort';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [category, locale] = await Promise.all([
    getCategoryBySlug((await params).slug),
    getLocale(),
  ]);
  return category ? { title: categoryName(category, locale) } : {};
}

/** One category's books (canvas: Category, MCategory). */
export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { sort: sortParam }] = await Promise.all([params, searchParams]);
  const [category, categories, locale, t] = await Promise.all([
    getCategoryBySlug(slug),
    listCategories(),
    getLocale(),
    getTranslations('catalogue'),
  ]);
  if (!category) notFound();
  const sort = parseBookSort(sortParam);

  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-6 md:gap-6 md:px-6 md:pt-5 md:pb-10 lg:px-8 lg:pt-7">
      <div className="flex flex-col gap-3 md:gap-4">
        <h1 className="font-heading text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
          {categoryName(category, locale)}
        </h1>
        <CategoryChips
          categories={categories}
          locale={locale}
          selected={category.slug}
          current
          label={t('categories')}
          allLabel={t('all')}
        />
      </div>
      {category.books.length > 0 ? (
        <>
          <ListToolbar countLabel={t('bookCount', { count: category.books.length })} sort={sort} />
          <BookGrid books={sortBooks(category.books, sort)} />
        </>
      ) : (
        <p className="text-muted-foreground">{t('emptyCategory')}</p>
      )}
    </div>
  );
}
