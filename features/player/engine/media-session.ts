import { COVER_IMAGES_ENABLED } from '@/features/catalogue/cover-images';
import { DEFAULT_SKIP_BACK_S, DEFAULT_SKIP_FORWARD_S } from '../core';
import type { AudioEngine, PlayerState } from './audio-engine';

/**
 * Lock-screen and headset controls (PRD: Player → Platform integration):
 * title, author, cover, play/pause, skip, chapter jumps and seek.
 * Returns a function that detaches everything.
 */
export function attachMediaSession(engine: AudioEngine): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return () => {};
  const session = navigator.mediaSession;

  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => engine.play()],
    ['pause', () => engine.pause()],
    ['seekbackward', (d) => engine.skipBack(d.seekOffset ?? DEFAULT_SKIP_BACK_S)],
    ['seekforward', (d) => engine.skipForward(d.seekOffset ?? DEFAULT_SKIP_FORWARD_S)],
    ['previoustrack', () => engine.previousChapter()],
    ['nexttrack', () => engine.nextChapter()],
    [
      'seekto',
      (d) => {
        // The OS scrubber works on the whole book, like the player bar.
        if (typeof d.seekTime === 'number') engine.seek(d.seekTime);
      },
    ],
  ];
  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // This browser does not support the action; the others still work.
    }
  }

  let shownKey = '';
  const update = () => {
    const state: PlayerState = engine.getState();
    const { book, chapterIndex, status } = state;

    if (!book) {
      if (shownKey !== '') {
        session.metadata = null;
        session.playbackState = 'none';
        shownKey = '';
      }
      return;
    }

    const key = `${book.id}:${chapterIndex}`;
    if (key !== shownKey) {
      shownKey = key;
      session.metadata = new MediaMetadata({
        title: book.chapters[chapterIndex]?.title ?? book.title,
        artist: book.author,
        album: book.title,
        artwork: artworkFor(book),
      });
    }

    session.playbackState =
      status === 'playing' || status === 'buffering' || status === 'loading' ? 'playing' : 'paused';

    try {
      session.setPositionState({
        duration: state.duration,
        position: Math.min(state.position, state.duration),
        playbackRate: state.speed,
      });
    } catch {
      // Rejected while the duration is not known yet; the next update fixes it.
    }
  };

  update();
  const unsubscribe = engine.subscribe(update);
  return () => {
    unsubscribe();
    for (const [action] of handlers) {
      try {
        session.setActionHandler(action, null);
      } catch {
        // Unsupported action: nothing to remove.
      }
    }
  };
}

/**
 * Lock-screen artwork: the uploaded cover when cover images are on, otherwise the generated
 * typographic cover from the server (the same one the app draws), so the lock screen matches.
 */
function artworkFor(book: { slug: string; coverUrl?: string }): MediaImage[] {
  if (COVER_IMAGES_ENABLED && book.coverUrl) return [{ src: book.coverUrl }];
  return [
    { src: `/api/cover/${encodeURIComponent(book.slug)}`, sizes: '512x512', type: 'image/png' },
  ];
}
