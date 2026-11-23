'use client';

import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/toast';
import { useBookFlags } from '@/features/library/flags/use-library-flags';
import { useDurationLabel } from '@/features/player/components/use-duration-label';
import { useBookProgress } from '@/features/player/player';
import { playBook } from '@/features/player/play-book';
import { useShare } from '@/features/share/share';
import type { BookSummary } from '../data/queries';
import { BookCard } from './book-card';

/** Short language tag for the card's meta line: Ukrainian reads "UA" (not the code "uk"). */
export const languageTag = (language: string) =>
  language === 'uk' ? 'UA' : language.toUpperCase();

/**
 * A catalogue book as a card, wired to the player, to this device's saved progress and to its
 * likes and Listen later.
 */
export function CatalogueCard({ book, className }: { book: BookSummary; className?: string }) {
  const t = useTranslations('book');
  const durationLabel = useDurationLabel();
  const progress = useBookProgress(book.id);
  const flags = useBookFlags(book.id);
  // Downloads arrive in Phase 7.
  const soon = () => toast({ title: t('comingSoon') });
  const share = useShare();

  return (
    <BookCard
      className={className}
      book={{
        slug: book.slug,
        title: book.title,
        author: book.author?.name ?? '',
        authorSlug: book.author?.slug ?? '',
        coverUrl: book.coverUrl,
        durationLabel: durationLabel(book.durationSeconds),
        language: languageTag(book.language),
        ongoing: book.ongoing,
      }}
      progressPct={
        progress && !progress.finished && book.durationSeconds > 0
          ? (progress.position / book.durationSeconds) * 100
          : 0
      }
      onPlay={() => void playBook(book.id, { failed: t('playFailed') })}
      liked={flags.liked}
      listenLater={flags.listenLater}
      onToggleLike={flags.toggleLike}
      onToggleListenLater={flags.toggleListenLater}
      onToggleDownload={soon}
      onShare={() => share({ title: book.title, path: `/book/${book.slug}` })}
    />
  );
}
