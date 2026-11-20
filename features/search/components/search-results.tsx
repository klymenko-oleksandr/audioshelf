import { RiSearchLine } from '@remixicon/react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { BookCover } from '@/features/catalogue/components/book-cover';
import { CategoryTiles } from '@/features/catalogue/components/category-nav';
import { listBooksByIds, listCategories } from '@/features/catalogue/data';
import type { SearchBook, SearchPerson, SearchResults } from '@/features/catalogue/data';
import { initials } from '@/features/catalogue/names';
import { splitDuration } from '@/features/player/core';
import { searchHref, SEARCH_TABS, type SearchTab } from '../tabs';
import { RecordSearch, RowLikeButton, TopResult } from './search-results-client';

type Translate = Awaited<ReturnType<typeof getTranslations>>;

function durationText(seconds: number, tc: Translate) {
  const { hours, minutes } = splitDuration(seconds);
  return hours > 0 ? tc('durationHm', { hours, minutes }) : tc('durationM', { minutes });
}

const sectionTitle =
  'font-heading text-[18px] leading-6 font-semibold md:text-[20px] md:leading-7 md:tracking-[-0.01em]';

/** Tabs as links: the page is rendered on the server for each, and the tab is in the URL. */
function Tabs({
  query,
  tab,
  counts,
  label,
  labels,
}: {
  query: string;
  tab: SearchTab;
  counts: Record<Exclude<SearchTab, 'all'>, number>;
  label: string;
  labels: Record<SearchTab, string>;
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="bg-muted text-muted-foreground inline-flex h-9 items-center gap-0.5 rounded-lg p-[3px] md:h-8">
        {SEARCH_TABS.filter((id) => id === 'all' || counts[id] > 0 || id === tab).map((id) => (
          <li key={id} className="h-full">
            <Link
              href={searchHref(query, id)}
              replace
              aria-current={id === tab ? 'page' : undefined}
              className={cn(
                'inline-flex h-full items-center rounded-md px-3 text-[13px] font-medium whitespace-nowrap',
                id === tab ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground',
              )}
            >
              {labels[id]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BookRow({
  book,
  durationLabel,
  readBy,
}: {
  book: SearchBook;
  durationLabel: string;
  readBy: string;
}) {
  return (
    <li className="border-border outline-foreground md:hover:bg-accent relative grid grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-3 border-b py-2 has-[a:focus-visible]:outline-2 md:grid-cols-[56px_minmax(0,1fr)_auto_32px] md:gap-4 md:rounded-lg md:border-b-0 md:p-2">
      <div className="size-13 rounded-md md:size-14">
        <BookCover title={book.title} seed={book.slug} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/book/${book.slug}`}
          className="line-clamp-2 text-[13px] leading-[18px] font-semibold after:absolute after:inset-0 focus-visible:shadow-none md:truncate md:font-medium"
        >
          {book.title}
        </Link>
        <span className="text-muted-foreground truncate text-[11px] md:text-[12px]">
          {[book.author?.name, readBy].filter(Boolean).join(' · ')}
          <span className="md:hidden">{` · ${durationLabel}`}</span>
        </span>
      </div>
      <span className="text-muted-foreground hidden text-right text-[12px] tabular-nums md:block">
        {durationLabel}
      </span>
      <span className="relative">
        <RowLikeButton />
      </span>
    </li>
  );
}

function PersonRow({
  person,
  kind,
  href,
  meta,
}: {
  person: SearchPerson;
  kind: 'author' | 'narrator';
  href: string;
  meta: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="md:hover:bg-accent flex min-h-14 items-center gap-3 rounded-lg py-1 md:px-2"
      >
        <span
          aria-hidden
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-medium',
            kind === 'author' ? 'bg-secondary' : 'bg-muted',
          )}
        >
          {initials(person.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-medium md:text-[13px]">{person.name}</span>
          <span className="text-muted-foreground text-[12px]">{meta}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Search results (canvas: Search, SearchEmpty, MSearchResults, MSearchEmpty).
 * Wide screens, All tab: the top result and authors on the left, books and categories on the
 * right. Narrow screens stack: top result, books, authors. The other tabs list one kind.
 */
export async function SearchResultsView({
  query,
  tab,
  results,
}: {
  query: string;
  tab: SearchTab;
  results: SearchResults;
}) {
  const [t, tc, tn, locale] = await Promise.all([
    getTranslations('search'),
    getTranslations('common'),
    getTranslations('catalogue'),
    getLocale(),
  ]);
  const { books, authors, narrators } = results;
  const counts = { books: books.length, authors: authors.length, narrators: narrators.length };
  const total = books.length + authors.length + narrators.length;
  const categories = await listCategories();

  const tiles = categories.length > 0 && (
    <CategoryTiles
      categories={categories}
      locale={locale}
      countLabel={(count) => tn('bookCount', { count })}
      className="md:grid-cols-4 md:gap-3"
    />
  );

  if (total === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="md:bg-card md:border-border flex flex-col items-center gap-3.5 px-2 py-8 text-center md:rounded-xl md:border md:px-6 md:py-10 md:shadow-sm">
          <span className="bg-secondary grid size-16 place-items-center rounded-full">
            <RiSearchLine size={28} aria-hidden />
          </span>
          <h1 className="font-heading max-w-full text-[22px] leading-7 font-semibold text-balance break-words">
            {t('emptyTitle', { query })}
          </h1>
          <p className="text-muted-foreground max-w-105 text-[14px] leading-[21px] md:text-[13px] md:leading-5">
            {t('emptyHint')}
          </p>
        </div>
        {tiles ? (
          <section aria-labelledby="search-categories" className="flex flex-col gap-2.5 md:gap-4">
            <h2 id="search-categories" className={sectionTitle}>
              <span className="md:hidden">{t('tryCategory')}</span>
              <span className="hidden md:inline">{t('browseCategories')}</span>
            </h2>
            {tiles}
          </section>
        ) : null}
      </div>
    );
  }

  const top = books[0];
  // Which chapter the listener is in needs the chapter starts, which a search row doesn't carry.
  const [topWithChapters] = top ? await listBooksByIds([top.id]) : [];
  const showBooks = (tab === 'all' || tab === 'books') && books.length > 0;
  const showAuthors = (tab === 'all' || tab === 'authors') && authors.length > 0;
  const showNarrators = (tab === 'all' || tab === 'narrators') && narrators.length > 0;
  const wide = tab === 'all';

  const authorList = (
    <ul className="flex flex-col">
      {authors.map((person) => (
        <PersonRow
          key={person.slug}
          person={person}
          kind="author"
          href={`/author/${person.slug}`}
          meta={t('authorMeta', { books: tn('bookCount', { count: person.bookCount }) })}
        />
      ))}
    </ul>
  );

  return (
    <RecordSearch query={query}>
      <div className="flex flex-col gap-5 md:gap-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
          <h1 className="font-heading text-[22px] leading-7 font-semibold tracking-[-0.02em] break-words md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
            {t('resultsFor', { query })}
          </h1>
          <Tabs
            query={query}
            tab={tab}
            counts={counts}
            label={t('tabs.label')}
            labels={{
              all: t('tabs.all'),
              books: t('tabs.books', { count: counts.books }),
              authors: t('tabs.authors', { count: counts.authors }),
              narrators: t('tabs.narrators', { count: counts.narrators }),
            }}
          />
        </div>

        <div
          className={cn(
            'grid gap-5 md:gap-8',
            wide && 'lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr_auto]',
          )}
        >
          {wide && top ? (
            <section
              aria-labelledby="search-top"
              className="flex flex-col gap-2 md:gap-4 lg:col-start-1 lg:row-start-1"
            >
              <h2 id="search-top" className={cn(sectionTitle, 'hidden md:block')}>
                {t('topResult')}
              </h2>
              <TopResult book={top} chapterStarts={topWithChapters?.chapterStarts ?? []} />
            </section>
          ) : null}

          {showBooks ? (
            <section
              aria-labelledby="search-books"
              className={cn(
                'flex flex-col gap-1',
                wide && 'lg:col-start-2 lg:row-span-2 lg:row-start-1',
              )}
            >
              <h2 id="search-books" className={cn(sectionTitle, 'mb-1 md:mb-2')}>
                {t('books')}
              </h2>
              <ul className="flex flex-col md:gap-1">
                {books.map((book) => (
                  <BookRow
                    key={book.id}
                    book={book}
                    durationLabel={durationText(book.durationSeconds, tc)}
                    readBy={book.narrator ? t('readBy', { name: book.narrator.name }) : ''}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {showAuthors ? (
            <section
              aria-labelledby="search-authors"
              className={cn(
                'flex flex-col gap-1 md:gap-3',
                wide && 'lg:col-start-1 lg:row-start-2 lg:self-start',
              )}
            >
              <h2 id="search-authors" className={sectionTitle}>
                {t('authors', { count: authors.length })}
              </h2>
              {authorList}
            </section>
          ) : null}

          {showNarrators ? (
            <section
              aria-labelledby="search-narrators"
              className={cn(
                'flex flex-col gap-1 md:gap-3',
                wide && 'lg:col-start-1 lg:row-start-3 lg:self-start',
              )}
            >
              <h2 id="search-narrators" className={sectionTitle}>
                {t('narrators', { count: narrators.length })}
              </h2>
              <ul className="flex flex-col">
                {narrators.map((person) => (
                  // There are no narrator pages: a narrator opens a search for their name.
                  <PersonRow
                    key={person.slug}
                    person={person}
                    kind="narrator"
                    href={searchHref(person.name)}
                    meta={t('narratorMeta', {
                      books: tn('bookCount', { count: person.bookCount }),
                    })}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {wide && tiles ? (
            <section
              aria-labelledby="search-categories"
              className="hidden flex-col gap-4 pt-2 lg:col-start-2 lg:row-start-3 lg:flex"
            >
              <h2 id="search-categories" className={sectionTitle}>
                {t('browseCategories')}
              </h2>
              {tiles}
            </section>
          ) : null}
        </div>
      </div>
    </RecordSearch>
  );
}
