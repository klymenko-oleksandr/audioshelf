'use client';

import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/toast';
import { buildTimeline, splitDuration, type PlayerBook } from '@/features/player/core';
import { getPlayer, useBookProgress } from '@/features/player/player';
import { BookCard } from './book-card';

function StaticBookCard({ book }: { book: PlayerBook }) {
  const t = useTranslations();
  const progress = useBookProgress(book.id);
  const duration = buildTimeline(book.tracks).duration;
  const { hours, minutes } = splitDuration(duration);
  const soon = () => toast({ title: t('book.comingSoon') });

  return (
    <BookCard
      book={{
        slug: book.slug,
        title: book.title,
        author: book.author,
        authorSlug: book.slug,
        coverUrl: book.coverUrl,
        durationLabel:
          hours > 0
            ? t('common.durationHm', { hours, minutes })
            : t('common.durationM', { minutes }),
        language: 'UA',
      }}
      progressPct={
        progress && !progress.finished && duration > 0 ? (progress.position / duration) * 100 : 0
      }
      onPlay={() => getPlayer().start(book)}
      onToggleLike={soon}
      onToggleListenLater={soon}
      onToggleDownload={soon}
      onShare={soon}
    />
  );
}

/**
 * TEMPORARY (Phase 2): the static books as a grid, so there is something to play.
 * Phase 3 replaces it with the real Home rows; likes, Listen later and downloads become
 * real in Phases 5 and 7 — until then those actions only say so.
 */
export function StaticBookGrid({ books }: { books: readonly PlayerBook[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-5 lg:gap-x-6">
      {books.map((book) => (
        <StaticBookCard key={book.id} book={book} />
      ))}
    </div>
  );
}
