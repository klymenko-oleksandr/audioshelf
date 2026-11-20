'use client';

import {
  RiDeleteBinLine,
  RiDownload2Fill,
  RiErrorWarningLine,
  RiPlayListAddLine,
} from '@remixicon/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BottomSheet, SheetAction } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  BookCard,
  type BookCardBook,
  type BookCardDownload,
} from '@/features/catalogue/components/book-card';
import { PlayerBarView, type PlayerViewState } from '@/features/player/components/player-bar-view';
import { TEST_BOOK } from '@/features/player/data/test-book';
import { getPlayer, usePlayerState } from '@/features/player/player';
import { useDelayedLoading } from '@/hooks/use-delayed-loading';

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="border-border flex flex-col gap-3 border-t pt-5">
      <h2 className="text-h4">{title}</h2>
      <p className="text-muted-foreground max-w-prose">{note}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

function LoaderDemo() {
  const [loading, setLoading] = useState(false);
  const visible = useDelayedLoading(loading);
  const startedAt = useRef(0);
  const log = useRef<HTMLParagraphElement>(null);

  // Written straight to the DOM: this is a stopwatch readout, not app state.
  useEffect(() => {
    if (!log.current || startedAt.current === 0) return;
    const at = Math.round(performance.now() - startedAt.current);
    log.current.textContent += ` · skeleton ${visible ? 'shown' : 'hidden'} at ${at} ms`;
  }, [visible]);

  function load(ms: number) {
    startedAt.current = performance.now();
    if (log.current) log.current.textContent = `Loading for ${ms} ms`;
    setLoading(true);
    setTimeout(() => setLoading(false), ms);
  }

  return (
    <>
      <Button variant="outline" disabled={loading} onClick={() => load(200)}>
        Load 200 ms
      </Button>
      <Button variant="outline" disabled={loading} onClick={() => load(400)}>
        Load 400 ms
      </Button>
      <Button variant="outline" disabled={loading} onClick={() => load(2000)}>
        Load 2 s
      </Button>
      <div className="flex basis-full flex-col gap-2 pt-2">
        <div className="h-12 w-72">
          {visible ? (
            <Skeleton className="size-full" />
          ) : (
            <div className="border-border bg-card grid size-full place-items-center rounded-md border">
              Content
            </div>
          )}
        </div>
        <p ref={log} className="text-muted-foreground text-caption" data-testid="loader-log">
          Idle
        </p>
      </div>
    </>
  );
}

interface DemoBook extends BookCardBook {
  progressPct: number;
  liked: boolean;
  listenLater: boolean;
  download: BookCardDownload;
  note: string;
}

const DEMO_BOOKS: DemoBook[] = [
  ['kobzar', 'Кобзар', 'Тарас Шевченко', '6 h 40 m', 'UA', 0, false, 'none', 'Plain'],
  [
    'holmes',
    'The Adventures of Sherlock Holmes',
    'Arthur Conan Doyle',
    '10 h 24 m',
    'EN',
    46,
    false,
    'none',
    'In progress',
  ],
  ['forest-song', 'Лісова пісня', 'Леся Українка', '3 h 05 m', 'UA', 0, true, 'none', 'Liked'],
  [
    'frankenstein',
    'Frankenstein',
    'Mary Shelley',
    '8 h 38 m',
    'EN',
    0,
    false,
    'done',
    'Downloaded',
  ],
  ['dracula', 'Dracula', 'Bram Stoker', '15 h 30 m', 'EN', 0, true, 'downloading', 'Downloading'],
  [
    'treasure',
    'Treasure Island',
    'Robert Louis Stevenson',
    '7 h 10 m',
    'EN',
    78,
    true,
    'done',
    'Everything',
  ],
].map(([slug, title, author, durationLabel, language, progressPct, liked, dl, note]) => ({
  slug,
  title,
  author,
  authorSlug: String(author).toLowerCase().replaceAll(' ', '-'),
  durationLabel,
  language,
  progressPct,
  liked,
  listenLater: false,
  download: dl === 'downloading' ? { status: 'downloading', pct: 64 } : { status: dl },
  note,
})) as DemoBook[];

function BookCardDemo() {
  const [books, setBooks] = useState(DEMO_BOOKS);
  const patch = (slug: string, change: (book: DemoBook) => Partial<DemoBook>) =>
    setBooks((all) => all.map((b) => (b.slug === slug ? { ...b, ...change(b) } : b)));

  return (
    <div className="grid basis-full grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-5 lg:gap-x-6">
      {books.map((book) => (
        <div key={book.slug} className="flex min-w-0 flex-col gap-2">
          <span className="text-muted-foreground text-caption uppercase">{book.note}</span>
          <BookCard
            book={book}
            progressPct={book.progressPct}
            liked={book.liked}
            listenLater={book.listenLater}
            download={book.download}
            onPlay={() => toast({ title: `Play: ${book.title}` })}
            onToggleLike={() => patch(book.slug, (b) => ({ liked: !b.liked }))}
            onToggleListenLater={() => {
              patch(book.slug, (b) => ({ listenLater: !b.listenLater }));
              toast({
                icon: <RiPlayListAddLine size={18} />,
                title: book.listenLater ? 'Removed from Listen later' : 'Added to Listen later',
                action: {
                  label: 'Undo',
                  onClick: () => patch(book.slug, (b) => ({ listenLater: !b.listenLater })),
                },
              });
            }}
            onToggleDownload={() =>
              patch(book.slug, (b) => ({
                download: b.download.status === 'none' ? { status: 'done' } : { status: 'none' },
              }))
            }
            onShare={() => toast({ title: 'Link copied' })}
          />
        </div>
      ))}
    </div>
  );
}

const PLAYER_STATES: PlayerViewState[] = [
  'idle',
  'loading',
  'playing',
  'paused',
  'buffering',
  'error',
  'finished',
];

function PlayerBarDemo() {
  const [state, setState] = useState<PlayerViewState>('playing');
  const [liked, setLiked] = useState(true);

  return (
    <>
      {PLAYER_STATES.map((s) => (
        <Button
          key={s}
          variant={s === state ? 'default' : 'outline'}
          size="sm"
          aria-pressed={s === state}
          onClick={() => setState(s)}
        >
          {s}
        </Button>
      ))}
      <div className="w-full min-w-0 pt-2" data-testid="player-demo">
        <PlayerBarView
          state={state}
          book={{ slug: 'holmes', title: 'The Adventures of Sherlock Holmes' }}
          chapterLabel="Ch. 6 · The Man with the Twisted Lip"
          chapterTitle="The Man with the Twisted Lip"
          bookProgressPct={state === 'finished' ? 100 : 46}
          positionText="2:51:14 of 10:24:00"
          elapsedLabel="27:14"
          remainingLabel="−25:26"
          positionLabel="Ch. 6 · 27:14 / 52:40"
          timeLeftLabel="25 min left"
          speedLabel="1.25×"
          liked={liked}
          onPlayPause={() => setState(state === 'playing' ? 'paused' : 'playing')}
          onRetry={() => setState('loading')}
          onPlayAgain={() => setState('playing')}
          onToggleLike={() => setLiked(!liked)}
          onSpeed={() => toast({ title: 'Speed' })}
          onSleepTimer={() => toast({ title: 'Sleep timer' })}
          onChapters={() => toast({ title: 'Chapters' })}
          onOpen={() => toast({ title: 'Open player' })}
          onSeek={(fraction) => toast({ title: `Seek to ${Math.round(fraction * 100)}%` })}
        />
      </div>
    </>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  const [speed, setSpeed] = useState('1×');

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <span className="text-muted-foreground" data-testid="sheet-value">
        Speed: {speed}
      </span>
      <BottomSheet open={open} onOpenChange={setOpen} title="Playback speed">
        {['0.75×', '1×', '1.25×', '1.5×'].map((value) => (
          <SheetAction
            key={value}
            icon={<span className="w-5 text-center">{value === speed ? '✓' : ''}</span>}
            onSelect={() => {
              setSpeed(value);
              setOpen(false);
            }}
          >
            {value}
          </SheetAction>
        ))}
      </BottomSheet>
    </>
  );
}

function LivePlayerDemo() {
  const state = usePlayerState();
  const mine = state.book?.id === TEST_BOOK.id;

  return (
    <>
      <Button variant="outline" onClick={() => getPlayer().start(TEST_BOOK)}>
        Play test book
      </Button>
      <Button variant="outline" onClick={() => getPlayer().start(TEST_BOOK, 5)}>
        Play from 0:05
      </Button>
      <Button variant="outline" onClick={() => getPlayer().close()}>
        Close player
      </Button>
      <p className="text-muted-foreground basis-full tabular-nums" data-testid="live-player">
        {mine
          ? `status ${state.status} · position ${state.position.toFixed(1)} s · chapter ${state.chapterIndex + 1} · speed ${state.speed} · sleep ${state.sleep ? `${Math.ceil(state.sleep.remainingMs / 1000)} s` : 'off'}`
          : `status ${state.status}`}
      </p>
    </>
  );
}

function Bomb(): ReactNode {
  throw new Error('Showcase: thrown on purpose to demonstrate the error boundary');
}

export function Showcase() {
  const [explode, setExplode] = useState(false);
  if (explode) return <Bomb />;

  return (
    <div className="flex flex-col gap-6 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-h2">UI showcase</h1>
        <p className="text-muted-foreground max-w-prose">
          Shared behaviours from the PRD, for review. Not linked from the app and hidden in
          production.
        </p>
      </div>

      <Section
        title="Book card"
        note="Badges are always visible. With a mouse: hover or tab to a card for play, heart and the menu. On touch: the … button or a long press opens the actions sheet."
      >
        <BookCardDemo />
      </Section>

      <Section
        title="Live player"
        note="The real player on three short generated tones (6 s, 6 s, 4 s): it drives the bar at the bottom of the screen. Open the full-screen player from the bar (the URL gets #player, Back closes it); speed, sleep timer and chapters open as sheets. Shortcuts: Space, ←/→, Shift+←/→. Reload while it plays — it comes back paused at the saved position."
      >
        <LivePlayerDemo />
      </Section>

      <Section
        title="Player bar"
        note="Every state from the PRD state machine. The layout follows the width of the bar: resize the window to see the phone card, the tablet bar and the full desktop bar."
      >
        <PlayerBarDemo />
      </Section>

      <Section
        title="Bottom sheet"
        note="Closes on tap outside, Esc and the browser Back button, without leaving the page."
      >
        <SheetDemo />
      </Section>

      <Section
        title="Toasts"
        note="One at a time; a new one replaces the current. 5 s, or 8 s with an action; hover or focus pauses the timer. Errors stay until dismissed."
      >
        <Button
          variant="outline"
          onClick={() =>
            toast({
              icon: <RiPlayListAddLine size={18} />,
              title: 'Added to Listen later',
              action: {
                label: 'Undo',
                onClick: () => toast({ title: 'Removed from Listen later' }),
              },
            })
          }
        >
          With Undo
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast({
              icon: <RiDeleteBinLine size={18} />,
              title: 'Removed download',
              description: 'Frees 412 MB on this device',
              action: { label: 'Undo', onClick: () => {} },
              onDismiss: (reason) => {
                if (reason !== 'action') console.info(`Delayed delete runs now (${reason})`);
              },
            })
          }
        >
          With description
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast({ icon: <RiDownload2Fill size={18} />, title: 'Dracula is ready offline' })
          }
        >
          Plain
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast({
              variant: 'error',
              icon: <RiErrorWarningLine size={18} />,
              title: "Couldn't download Dracula",
              description: 'Not enough space on this device',
              action: { label: 'Retry', onClick: () => {} },
            })
          }
        >
          Error
        </Button>
      </Section>

      <Section
        title="Loader timing"
        note="Nothing for the first 300 ms, then at least 600 ms on screen. 200 ms shows no skeleton; 400 ms shows it from 300 to 900 ms."
      >
        <LoaderDemo />
      </Section>

      <Section
        title="Error boundary"
        note="A page that fails shows an inline error with Try again. The shell and the player stay."
      >
        <Button variant="outline" onClick={() => setExplode(true)}>
          Break this page
        </Button>
      </Section>

      <Section
        title="Splash"
        note="Shown on cold start until the app is ready, then fades out over 150 ms. Hold it to see the 3 s and 15 s messages."
      >
        {/* A full page load on purpose: the splash only exists on cold start. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/dev/ui?splash=hold" className="text-brand underline underline-offset-4">
          Open with the splash held
        </a>
      </Section>
    </div>
  );
}
