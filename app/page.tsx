import { getTranslations } from 'next-intl/server';
import { StaticBookGrid } from '@/features/catalogue/components/static-book-grid';
import { STATIC_BOOKS } from '@/features/player/data/static-books';

export default async function HomePage() {
  const t = await getTranslations('pages');

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7">
      <h1 className="font-heading text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
        {t('home.title')}
      </h1>
      {/* Temporary: the static books, until the catalogue lands in Phase 3. */}
      <StaticBookGrid books={STATIC_BOOKS} />
    </div>
  );
}
