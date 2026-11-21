import { RiCalendarScheduleLine, RiErrorWarningLine } from '@remixicon/react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { BookCover } from '@/features/catalogue/components/book-cover';
import type { AdminBookRow } from '../data/books';
import { buildBooksHref } from '../list-state';
import { statusNote } from '../format';

const COLUMNS =
  'grid grid-cols-[44px_minmax(0,1fr)_120px_200px_64px_92px_110px_56px] items-center gap-4';
const HEADING = 'text-muted-foreground text-[11px] font-medium tracking-[0.04em] uppercase';

function StatusBadge({ book }: { book: AdminBookRow }) {
  if (book.attention.length > 0) {
    return (
      <Badge variant="destructive">
        <RiErrorWarningLine aria-hidden />
        Needs attention
      </Badge>
    );
  }
  switch (book.status) {
    case 'published':
      return <Badge variant="secondary">Published</Badge>;
    case 'scheduled':
      return (
        <Badge>
          <RiCalendarScheduleLine aria-hidden />
          Scheduled
        </Badge>
      );
    case 'draft':
      return <Badge variant="outline">Draft</Badge>;
  }
}

/**
 * The books table (canvas: AdminBooks). Listens, completion and rating are shown as "—" until
 * play counts and ratings exist (Phase 6 and v1.1). Selection and row actions arrive with
 * bulk actions; a row opens the book.
 */
export function BooksTable({ rows, now }: { rows: AdminBookRow[]; now: Date }) {
  return (
    <div className="bg-card border-border overflow-x-auto rounded-xl border shadow-sm">
      <div role="table" aria-label="Books" className="min-w-[960px]">
        <div role="row" className={`${COLUMNS} bg-muted border-border border-b px-4 py-2.5`}>
          {/* The cover column has no visible heading; sr-only text alone would drop it out of the grid. */}
          <span role="columnheader">
            <span className="sr-only">Cover</span>
          </span>
          <span role="columnheader" className={HEADING}>
            Book
          </span>
          <span role="columnheader" className={HEADING}>
            Category
          </span>
          <span role="columnheader" className={HEADING}>
            Status
          </span>
          <span role="columnheader" className={`${HEADING} text-right`}>
            Tracks
          </span>
          <span role="columnheader" className={`${HEADING} text-right`}>
            Listens 30 d
          </span>
          <span role="columnheader" className={HEADING}>
            Completion
          </span>
          <span role="columnheader" className={`${HEADING} text-right`}>
            Rating
          </span>
        </div>

        {rows.map((book) => (
          <div
            key={book.id}
            role="row"
            className={`${COLUMNS} border-border hover:bg-muted/40 relative border-b px-4 py-2.5 last:border-b-0`}
          >
            <div role="cell" className="size-11 overflow-hidden rounded-sm">
              <BookCover title={book.title} seed={book.slug} />
            </div>
            <div role="cell" className="flex min-w-0 flex-col gap-0.5">
              <Link
                prefetch={false}
                href={`/admin/books/${book.id}`}
                className="truncate text-[13px] font-medium after:absolute after:inset-0 hover:underline"
              >
                {book.title}
              </Link>
              <span className="text-muted-foreground truncate text-xs">
                {book.author ?? 'No author'}
                {book.narrator ? ` · read by ${book.narrator}` : ''}
              </span>
            </div>
            <span role="cell" className="truncate text-xs">
              {book.categoryName ?? '—'}
            </span>
            <div role="cell" className="flex flex-col items-start gap-[3px]">
              <StatusBadge book={book} />
              <span className="text-muted-foreground text-[11px]">{statusNote(book, now)}</span>
            </div>
            <span role="cell" className="text-right text-xs tabular-nums">
              {book.trackCount}
            </span>
            <span role="cell" className="text-muted-foreground text-right text-xs">
              —
            </span>
            <span role="cell" className="text-muted-foreground text-xs">
              —
            </span>
            <span role="cell" className="text-muted-foreground text-right text-xs">
              —
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BooksEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="bg-card border-border flex flex-col items-center gap-3 rounded-xl border px-6 py-16 text-center shadow-sm">
      <h2 className="font-heading text-base font-semibold">
        {filtered ? 'No books match' : 'No books yet'}
      </h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        {filtered ? 'Try another search, tab or category.' : 'Add the first book to see it here.'}
      </p>
      {filtered ? (
        <Link
          prefetch={false}
          href={buildBooksHref({ tab: 'all', q: '', category: '', sort: 'updated' })}
          className={buttonVariants({ variant: 'outline' })}
        >
          Clear filters
        </Link>
      ) : (
        <Link prefetch={false} href="/admin/books/new" className={buttonVariants()}>
          New book
        </Link>
      )}
    </div>
  );
}
