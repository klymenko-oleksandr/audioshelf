'use client';

import {
  RiDeleteBinLine,
  RiDownload2Fill,
  RiDownload2Line,
  RiHeartFill,
  RiHeartLine,
  RiMore2Line,
  RiPlayFill,
  RiPlayListAddFill,
  RiPlayListAddLine,
  RiShareForwardLine,
  RiUser3Line,
} from '@remixicon/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type PointerEvent } from 'react';
import { BottomSheet, SheetAction } from '@/components/ui/bottom-sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { BookCover } from './book-cover';

export interface BookCardBook {
  slug: string;
  title: string;
  author: string;
  authorSlug: string;
  /** Square poster URL; a typographic cover is generated without it. */
  coverUrl?: string;
  /** Already formatted for the current language, e.g. "10 h 24 m". */
  durationLabel: string;
  /** Short language tag shown in the meta line, e.g. "UA". */
  language?: string;
}

export type BookCardDownload =
  { status: 'none' } | { status: 'downloading'; pct: number } | { status: 'done' };

export interface BookCardProps {
  book: BookCardBook;
  /** 0–100; shows the progress bar and "x% listened" when above 0. */
  progressPct?: number;
  liked?: boolean;
  listenLater?: boolean;
  download?: BookCardDownload;
  onPlay: () => void;
  onToggleLike: () => void;
  onToggleListenLater: () => void;
  /** Start a download, or remove one that exists or is in progress. */
  onToggleDownload: () => void;
  onShare: () => void;
  className?: string;
}

const LONG_PRESS_MS = 500;

/** Shown on hover, keyboard focus and while the menu is open; never on touch devices. */
const reveal =
  'opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 ' +
  'group-data-open/card:opacity-100 touch:hidden';
const badge = 'bg-background absolute grid place-items-center rounded-full shadow-sm';
const roundButton =
  'bg-background text-foreground grid size-8 place-items-center rounded-full shadow-sm';

/**
 * Book card for grids and rows (design system: BookCard; canvas: BookCard, BookCardStates,
 * MCardActions).
 *
 * Always visible: cover, title, author, progress, liked and downloaded badges.
 * Pointer devices: play, heart and a "…" menu appear on hover or keyboard focus.
 * Touch devices: a "…" button or a long press opens the actions sheet.
 * Like is not in the menu (the heart covers it); it is in the sheet, where there is no heart.
 */
export function BookCard({
  book,
  progressPct = 0,
  liked = false,
  listenLater = false,
  download = { status: 'none' },
  onPlay,
  onToggleLike,
  onToggleListenLater,
  onToggleDownload,
  onShare,
  className,
}: BookCardProps) {
  const t = useTranslations('bookCard');
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const bookHref = `/book/${book.slug}`;
  const authorHref = `/author/${book.authorSlug}`;
  const started = progressPct > 0;
  const hasDownload = download.status !== 'none';

  const playLabel = t(started ? 'resume' : 'play', { title: book.title });
  const laterLabel = t(listenLater ? 'removeListenLater' : 'addListenLater');
  const downloadLabel = t(hasDownload ? 'removeDownload' : 'download');
  const LaterIcon = listenLater ? RiPlayListAddFill : RiPlayListAddLine;
  const DownloadIcon = hasDownload ? RiDeleteBinLine : RiDownload2Line;

  function cancelLongPress() {
    if (longPress.current !== null) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  }
  function startLongPress(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    suppressClick.current = false;
    longPress.current = setTimeout(() => {
      suppressClick.current = true; // the finger lifting must not follow the link
      setSheetOpen(true);
    }, LONG_PRESS_MS);
  }

  /** Runs a sheet action after closing the sheet. */
  const fromSheet = (action: () => void) => () => {
    setSheetOpen(false);
    action();
  };

  return (
    <article
      data-open={menuOpen || undefined}
      className={cn('group/card relative flex min-w-0 flex-col gap-2.5', className)}
    >
      <div className="outline-foreground relative rounded-lg outline-offset-3 has-[a:focus-visible]:outline-2">
        <Link
          href={bookHref}
          aria-label={`${book.title}, ${book.author}`}
          draggable={false}
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onContextMenu={(event) => {
            if (suppressClick.current) event.preventDefault();
          }}
          onClick={(event) => {
            if (suppressClick.current) {
              event.preventDefault();
              suppressClick.current = false;
            }
          }}
          className="block rounded-lg [-webkit-touch-callout:none] focus-visible:shadow-none"
        >
          <BookCover
            title={book.title}
            author={book.author}
            src={book.coverUrl}
            seed={book.slug}
            reserveBottom={hasDownload}
            className="rounded-lg"
          />
        </Link>

        {started ? (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-lg bg-black/35"
          >
            <span className="bg-primary block h-full" style={{ width: `${progressPct}%` }} />
          </span>
        ) : null}

        {liked ? (
          <span
            title={t('liked')}
            className={cn(
              badge,
              'text-brand top-2 right-2 size-6.5 transition-opacity',
              'touch:opacity-100! group-focus-within/card:opacity-0 group-hover/card:opacity-0 group-data-open/card:opacity-0',
            )}
          >
            <RiHeartFill size={14} aria-hidden />
            <span className="sr-only">{t('liked')}</span>
          </span>
        ) : null}

        {download.status === 'done' ? (
          <span
            title={t('downloaded')}
            className={cn(badge, 'text-brand bottom-3 left-2 size-6.5')}
          >
            <RiDownload2Fill size={14} aria-hidden />
            <span className="sr-only">{t('downloaded')}</span>
          </span>
        ) : null}
        {download.status === 'downloading' ? (
          <span
            title={t('downloading')}
            className="bg-background absolute bottom-3 left-2 inline-flex h-6.5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold tabular-nums shadow-sm"
          >
            <Spinner className="size-2.5 border-[1.5px]" />
            <span className="sr-only">{t('downloading')}</span>
            {Math.round(download.pct)}%
          </span>
        ) : null}

        <span
          aria-hidden
          className={cn(reveal, 'pointer-events-none absolute inset-0 rounded-lg bg-black/30')}
        />

        <div className={cn(reveal, 'absolute top-2 right-2 flex gap-1.5')}>
          <button
            type="button"
            aria-label={t(liked ? 'unlike' : 'like')}
            aria-pressed={liked}
            onClick={onToggleLike}
            className={cn(roundButton, liked && 'text-brand')}
          >
            {liked ? <RiHeartFill size={16} aria-hidden /> : <RiHeartLine size={16} aria-hidden />}
          </button>

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger aria-label={t('more')} className={roundButton}>
              <RiMore2Line size={16} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-auto min-w-50">
              <DropdownMenuItem onClick={onPlay}>
                <RiPlayFill aria-hidden />
                {t(started ? 'resumeShort' : 'playShort')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleListenLater}>
                <LaterIcon aria-hidden />
                {laterLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleDownload}>
                <DownloadIcon aria-hidden />
                {downloadLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(authorHref)}>
                <RiUser3Line aria-hidden />
                {t('goToAuthor')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShare}>
                <RiShareForwardLine aria-hidden />
                {t('share')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <button
          type="button"
          aria-label={playLabel}
          onClick={onPlay}
          className={cn(
            reveal,
            'bg-primary text-primary-foreground absolute right-2 bottom-3 grid size-11 place-items-center rounded-full shadow-lg',
          )}
        >
          <RiPlayFill size={20} aria-hidden />
        </button>
      </div>

      <div className="flex min-w-0 items-start gap-1">
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <Link
            href={bookHref}
            tabIndex={-1}
            className="line-clamp-2 rounded-sm text-[13px] leading-[18px] font-medium"
          >
            {book.title}
          </Link>
          <span className="text-muted-foreground truncate text-[12px] leading-4">
            {book.author}
          </span>
          <span className="text-muted-foreground truncate text-[11px] leading-4">
            {started
              ? t('listened', { pct: Math.round(progressPct), duration: book.durationLabel })
              : [book.durationLabel, book.language].filter(Boolean).join(' · ')}
          </span>
        </div>

        <button
          type="button"
          aria-label={t('more')}
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className="text-muted-foreground touch:grid relative -mt-1.5 -mr-2 hidden size-8 shrink-0 place-items-center rounded-full before:absolute before:-inset-1.5"
        >
          <RiMore2Line size={18} aria-hidden />
        </button>
      </div>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={t('actions')}
        header={
          <div className="border-border flex items-center gap-3 border-b pt-2 pb-3">
            <div className="size-14 shrink-0 rounded-md">
              <BookCover title={book.title} src={book.coverUrl} seed={book.slug} />
            </div>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] leading-5 font-semibold">{book.title}</span>
              <span className="text-muted-foreground text-[12px]">
                {book.author} · {book.durationLabel}
              </span>
            </span>
          </div>
        }
      >
        <SheetAction icon={<RiPlayFill size={20} />} onSelect={fromSheet(onPlay)}>
          {t(started ? 'resumeShort' : 'playShort')}
        </SheetAction>
        <SheetAction
          icon={
            liked ? <RiHeartFill size={20} className="text-brand" /> : <RiHeartLine size={20} />
          }
          onSelect={fromSheet(onToggleLike)}
        >
          {t(liked ? 'unlike' : 'like')}
        </SheetAction>
        <SheetAction icon={<LaterIcon size={20} />} onSelect={fromSheet(onToggleListenLater)}>
          {laterLabel}
        </SheetAction>
        <SheetAction icon={<DownloadIcon size={20} />} onSelect={fromSheet(onToggleDownload)}>
          {downloadLabel}
        </SheetAction>
        {/* replace(): swaps the sheet's history entry for the author page (see useCloseOnBack). */}
        <SheetAction icon={<RiUser3Line size={20} />} onSelect={() => router.replace(authorHref)}>
          {t('goToAuthor')}
        </SheetAction>
        <SheetAction icon={<RiShareForwardLine size={20} />} onSelect={fromSheet(onShare)}>
          {t('share')}
        </SheetAction>
      </BottomSheet>
    </article>
  );
}
