import { getTranslations } from 'next-intl/server';
import { BookGrid } from '@/features/catalogue/components/book-grid';
import { listNewReleases } from '@/features/catalogue/data';

export default async function HomePage() {
  const t = await getTranslations('pages');
  const books = await listNewReleases();

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7">
      <h1 className="font-heading text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
        {t('home.title')}
      </h1>
      {books.length > 0 ? (
        <section aria-labelledby="new-releases" className="flex flex-col gap-3">
          <h2 id="new-releases" className="text-h4">
            {t('home.newReleases')}
          </h2>
          <BookGrid books={books} />
        </section>
      ) : (
        <p className="text-muted-foreground">{t('home.empty')}</p>
      )}
    </div>
  );
}
