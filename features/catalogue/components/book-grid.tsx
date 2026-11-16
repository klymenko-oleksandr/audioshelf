'use client';

import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/toast';
import { splitDuration } from '@/features/player/core';
import { useBookProgress } from '@/features/player/player';
import { playBook } from '@/features/player/play-book';
import type { BookSummary } from '../data/queries';
import { BookCard } from './book-card';

function GridCard({ book }: { book: BookSummary }) {
  const t = useTranslations();
  const progress = useBookProgress(book.id);
  const { hours, minutes } = splitDuration(book.durationSeconds);
  // Likes and Listen later arrive in Phase 5, downloads in Phase 7.
  const soon = () => toast({ title: t('book.comingSoon') });

  return (
    <BookCard
      book={{
        slug: book.slug,
        title: book.title,
        author: book.author?.name ?? '',
        authorSlug: book.author?.slug ?? '',
        coverUrl: book.coverUrl,
        durationLabel:
          hours > 0
            ? t('common.durationHm', { hours, minutes })
            : t('common.durationM', { minutes }),
        language: book.language === 'uk' ? 'UA' : book.language.toUpperCase(),
      }}
      progressPct={
        progress && !progress.finished && book.durationSeconds > 0
          ? (progress.position / book.durationSeconds) * 100
          : 0
      }
      onPlay={() => void playBook(book.id, { failed: t('book.playFailed') })}
      onToggleLike={soon}
      onToggleListenLater={soon}
      onToggleDownload={soon}
      onShare={soon}
    />
  );
}

/** A fluid grid of book cards (PRD: auto-fill columns, 140 px minimum). */
export function BookGrid({ books }: { books: readonly BookSummary[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-5 lg:gap-x-6">
      {books.map((book) => (
        <GridCard key={book.id} book={book} />
      ))}
    </div>
  );
}
