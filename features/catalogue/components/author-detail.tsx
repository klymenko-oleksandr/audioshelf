import { getTranslations } from 'next-intl/server';
import { splitDuration } from '@/features/player/core';
import type { AuthorDetail as Author } from '../data/queries';
import { initials } from '../names';
import { sortBooks, type BookSort } from '../sort';
import { AuthorShare } from './author-share';
import { BookGrid } from './book-grid';
import { SortMenu } from './sort-menu';

/** The author page (canvas: Author, MAuthor): who they are, their books, who reads them. */
export async function AuthorDetail({ author, sort }: { author: Author; sort: BookSort }) {
  const [t, tc] = await Promise.all([getTranslations('catalogue'), getTranslations('common')]);
  const { hours, minutes } = splitDuration(author.durationSeconds);
  const duration = hours > 0 ? tc('durationHm', { hours, minutes }) : tc('durationM', { minutes });

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-6 md:gap-7 md:px-6 md:pt-5 md:pb-10 lg:px-8 lg:pt-7">
      <section className="flex flex-col items-center gap-3 md:flex-row md:gap-7">
        <span
          aria-hidden
          className="bg-secondary font-heading grid size-22 shrink-0 place-items-center rounded-full text-[30px] font-semibold md:size-34 md:text-[44px] md:tracking-[-0.02em]"
        >
          {initials(author.name)}
        </span>
        <div className="flex max-w-180 flex-col items-center gap-2 text-center md:items-start md:text-left">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.06em] uppercase">
            {t('author.kind')}
          </span>
          <h1 className="font-heading text-[26px] leading-[30px] font-bold tracking-[-0.02em] text-balance md:text-[40px] md:leading-11 md:tracking-[-0.03em]">
            {author.name}
          </h1>
          <p className="text-muted-foreground text-[12px] md:text-[13px]">
            {t('author.meta', {
              books: t('bookCount', { count: author.books.length }),
              duration,
            })}
          </p>
          {author.bio ? (
            <p className="text-muted-foreground text-left text-[14px] leading-[21px] whitespace-pre-line md:text-[13px]">
              {author.bio}
            </p>
          ) : null}
          <AuthorShare name={author.name} slug={author.slug} />
        </div>
      </section>

      <section aria-labelledby="author-books" className="flex flex-col gap-3 md:gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="author-books"
            className="font-heading md:text-h4 text-[18px] leading-6 font-semibold"
          >
            {t('author.books', { count: author.books.length })}
          </h2>
          <SortMenu sort={sort} />
        </div>
        <BookGrid books={sortBooks(author.books, sort)} />
      </section>

      {author.narrators.length > 0 ? (
        <section aria-labelledby="author-narrators" className="flex flex-col gap-3">
          <h2
            id="author-narrators"
            className="font-heading md:text-h4 text-[18px] leading-6 font-semibold"
          >
            {t('author.readBy')}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {author.narrators.map((narrator) => (
              <li
                key={narrator.slug}
                className="border-border flex items-center gap-2.5 rounded-full border py-2 pr-3.5 pl-2"
              >
                <span
                  aria-hidden
                  className="bg-muted grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-medium"
                >
                  {initials(narrator.name)}
                </span>
                <span className="flex flex-col">
                  <span className="text-[13px] font-medium">{narrator.name}</span>
                  <span className="text-muted-foreground text-[11px]">
                    {t('bookCount', { count: narrator.bookCount })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
