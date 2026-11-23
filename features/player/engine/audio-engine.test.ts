// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chaptersFromTracks, STALL_TIMEOUT_MS, type PlayerBook } from '../core';
import { createMemoryProgressStore, type ProgressRecord } from '../storage/progress-store';
import {
  AudioEngine,
  DEFAULT_PLAYBACK,
  type PlaybackSettings,
  SAVE_INTERVAL_MS,
  SLEEP_TICK_MS,
} from './audio-engine';
import { FakeAudio } from './fake-audio';

function makeBook(id: string, durations: number[], ongoing = false): PlayerBook {
  const tracks = durations.map((duration, i) => ({
    id: `${id}-t${i + 1}`,
    url: `https://media.test/${id}/${i + 1}.mp3`,
    duration,
  }));
  return {
    id,
    slug: id,
    title: `Book ${id}`,
    author: 'Author',
    tracks,
    chapters: chaptersFromTracks(tracks, (i) => `Chapter ${i + 1}`),
    ongoing,
  };
}

// 3 tracks: 0–600, 600–1800, 1800–2100. Long enough that "finished" means the last 30 s.
const book = makeBook('a', [600, 1200, 300]);
const other = makeBook('b', [5000]);
const NOW = 1_800_000_000_000;
type AudioEngineOptionsResolve = ConstructorParameters<typeof AudioEngine>[0]['resolveBook'];

function setup(saved: ProgressRecord[] = [], playback: Partial<PlaybackSettings> = {}) {
  const settings: PlaybackSettings = { ...DEFAULT_PLAYBACK, ...playback };
  const audio = new FakeAudio();
  const store = createMemoryProgressStore(saved);
  const onPlaybackStart = vi.fn();
  let clock = NOW;
  const engine = new AudioEngine({
    createAudio: () => audio,
    store,
    resolveBook: (id) => [book, other].find((b) => b.id === id),
    now: () => clock,
    onPlaybackStart,
    settings: () => settings,
  });
  return {
    settings,
    audio,
    store,
    engine,
    onPlaybackStart,
    tick: (ms: number) => {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
    status: () => engine.getState().status,
    position: () => engine.getState().position,
    saved: (id = book.id) => store.records.get(id),
  };
}

const record = (bookId: string, position: number, extra: Partial<ProgressRecord> = {}) => ({
  bookId,
  position,
  duration: 2100,
  speed: 1,
  finished: false,
  updatedAt: NOW - 60_000,
  ...extra,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('starting a book', () => {
  it('loads the first track, plays inside the same call and reaches playing', () => {
    const t = setup();
    t.engine.start(book);

    expect(t.status()).toBe('loading');
    expect(t.audio.loads).toEqual(['https://media.test/a/1.mp3']);
    expect(t.audio.playCalls).toBe(1); // synchronous: required for iOS user-gesture rules
    expect(t.onPlaybackStart).toHaveBeenCalledOnce();

    t.audio.becomeReady();
    expect(t.status()).toBe('playing');
    expect(t.engine.getState()).toMatchObject({ book, duration: 2100, chapterIndex: 0, speed: 1 });
  });

  it('resumes from the saved position, in the right track, at the saved speed', async () => {
    const t = setup([record('a', 1000, { speed: 1.5 })]);
    await t.engine.init();
    t.engine.close(); // drop the restored book; start it explicitly
    t.engine.start(book);

    expect(t.audio.loads).toEqual(['https://media.test/a/2.mp3']);
    t.audio.becomeReady();
    expect(t.audio.currentTime).toBe(400); // 1000 − 600
    expect(t.audio.playbackRate).toBe(1.5);
    expect(t.position()).toBe(1000);
    expect(t.engine.getState().chapterIndex).toBe(1);
  });

  it('starts a finished book from the beginning', async () => {
    const t = setup([record('a', 2090, { finished: true })]);
    await t.engine.init();
    t.engine.start(book);
    expect(t.position()).toBe(0);
    expect(t.audio.loads).toEqual(['https://media.test/a/1.mp3']);
  });

  it('plays from a chapter start when one is tapped, ignoring the saved position', async () => {
    const t = setup([record('a', 100)]);
    await t.engine.init();
    t.engine.start(book, book.chapters[2]!.start);
    expect(t.position()).toBe(1800);
    expect(t.audio.loads.at(-1)).toBe('https://media.test/a/3.mp3');
  });

  it('replaces the current book and saves where the first one was', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(123);

    t.engine.start(other);
    expect(t.saved('a')?.position).toBe(123);
    expect(t.engine.getState().book).toBe(other);
    expect(t.status()).toBe('loading');
    expect(t.position()).toBe(0);
  });
});

describe('playback', () => {
  function playing() {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    return t;
  }

  it('reports book time, not track time', () => {
    const t = playing();
    t.audio.advanceTo(42.5);
    expect(t.position()).toBe(42.5);
  });

  it('pauses and resumes without reloading', () => {
    const t = playing();
    t.audio.advanceTo(10);
    t.engine.pause();
    expect(t.status()).toBe('paused');
    expect(t.audio.paused).toBe(true);

    t.engine.play();
    expect(t.status()).toBe('playing');
    expect(t.audio.loads).toHaveLength(1);
    expect(t.audio.paused).toBe(false);
  });

  it('toggle switches between the two', () => {
    const t = playing();
    t.engine.toggle();
    expect(t.status()).toBe('paused');
    t.engine.toggle();
    expect(t.status()).toBe('playing');
  });

  it('continues into the next track when one ends', () => {
    const t = playing();
    t.audio.advanceTo(599);
    t.audio.finishTrack();

    expect(t.audio.loads).toEqual(['https://media.test/a/1.mp3', 'https://media.test/a/2.mp3']);
    expect(t.position()).toBe(600);
    expect(t.engine.getState().chapterIndex).toBe(1);
    expect(t.audio.paused).toBe(false);

    t.audio.becomeReady();
    t.audio.advanceTo(5);
    expect(t.position()).toBe(605);
    expect(t.status()).toBe('playing');
  });

  it('ignores the stray timeupdate at 0 that a source change fires', () => {
    const t = playing();
    t.engine.seek(1000);
    t.audio.emit('timeupdate'); // currentTime is 0 until metadata arrives
    expect(t.position()).toBe(1000);
  });

  it('finishes at the end of the last track', () => {
    const t = playing();
    t.engine.seek(2000);
    t.audio.becomeReady();
    t.audio.advanceTo(299);
    t.audio.finishTrack();

    expect(t.status()).toBe('finished');
    expect(t.position()).toBe(2100);
    expect(t.saved()).toMatchObject({ finished: true, position: 2100 });
  });

  it('Play on a finished book starts over', () => {
    const t = playing();
    t.engine.seek(2000);
    t.audio.becomeReady();
    t.audio.finishTrack();

    t.engine.play();
    expect(t.status()).toBe('loading');
    expect(t.position()).toBe(0);
    expect(t.audio.loads.at(-1)).toBe('https://media.test/a/1.mp3');
  });

  it('an ongoing book that reaches the end is not marked finished', () => {
    const ongoing = makeBook('c', [600], true);
    const t = setup();
    t.engine.start(ongoing);
    t.audio.becomeReady();
    t.audio.finishTrack();

    expect(t.status()).toBe('finished');
    expect(t.saved('c')).toMatchObject({ finished: false, position: 600 });
  });

  it('treats a pause from outside the app (phone call, OS) as a pause', () => {
    const t = playing();
    t.audio.advanceTo(77);
    t.audio.pauseExternally();
    expect(t.status()).toBe('paused');
    expect(t.saved()?.position).toBe(77);
  });
});

describe('seeking', () => {
  function playing() {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    return t;
  }

  it('moves inside the current track without reloading', () => {
    const t = playing();
    t.engine.seek(300);
    expect(t.audio.currentTime).toBe(300);
    expect(t.audio.loads).toHaveLength(1);
    expect(t.position()).toBe(300);
  });

  it('loads another track when the target is there, and keeps playing', () => {
    const t = playing();
    t.engine.seek(1900);
    expect(t.audio.loads.at(-1)).toBe('https://media.test/a/3.mp3');
    expect(t.audio.paused).toBe(false);
    t.audio.becomeReady();
    expect(t.audio.currentTime).toBe(100);
    expect(t.status()).toBe('playing');
  });

  it('stays paused when seeking while paused', () => {
    const t = playing();
    t.engine.pause();
    t.engine.seek(1900);
    expect(t.status()).toBe('paused');
    expect(t.audio.paused).toBe(true);
  });

  it('clamps to the book', () => {
    const t = playing();
    t.engine.seek(-50);
    expect(t.position()).toBe(0);
    t.engine.seek(99_999);
    expect(t.position()).toBe(2100);
  });

  it('skips 15 s back and 30 s forward by default', () => {
    const t = playing();
    t.engine.seek(100);
    t.engine.skipForward();
    expect(t.position()).toBe(130);
    t.engine.skipBack();
    expect(t.position()).toBe(115);
    t.engine.skipBack(60);
    expect(t.position()).toBe(55);
  });

  it('previous chapter restarts after 3 s, otherwise goes back one; next chapter jumps ahead', () => {
    const t = playing();
    t.engine.seek(700);
    t.engine.previousChapter();
    expect(t.position()).toBe(600);
    t.engine.previousChapter();
    expect(t.position()).toBe(0);

    t.engine.nextChapter();
    expect(t.position()).toBe(600);
    t.engine.nextChapter();
    expect(t.position()).toBe(1800);
    t.engine.nextChapter(); // last chapter: nothing happens
    expect(t.position()).toBe(1800);
  });

  it('seeking back after the end brings the book back, paused', () => {
    const t = playing();
    t.engine.seek(2000);
    t.audio.becomeReady();
    t.audio.finishTrack();
    t.engine.seek(1900);
    expect(t.status()).toBe('paused');
    expect(t.position()).toBe(1900);
  });
});

describe('speed', () => {
  it('applies to the element, is saved per book and survives a track change', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.engine.setSpeed(1.75);
    expect(t.audio.playbackRate).toBe(1.75);
    expect(t.saved()?.speed).toBe(1.75);

    t.audio.playbackRate = 1; // browsers reset it on load
    t.audio.finishTrack();
    t.audio.becomeReady();
    expect(t.audio.playbackRate).toBe(1.75);
  });

  it('keeps speed within 0.5–3', () => {
    const t = setup();
    t.engine.start(book);
    t.engine.setSpeed(10);
    expect(t.engine.getState().speed).toBe(3);
  });
});

describe('buffering and errors', () => {
  function playing() {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(50);
    return t;
  }

  it('goes to buffering on a stall and back when data arrives', () => {
    const t = playing();
    t.audio.stall();
    expect(t.status()).toBe('buffering');
    t.audio.recover();
    expect(t.status()).toBe('playing');
  });

  it('gives up after 15 s of buffering, keeps the position and stops the element', () => {
    const t = playing();
    t.audio.stall();
    t.tick(STALL_TIMEOUT_MS - 1);
    expect(t.status()).toBe('buffering');
    t.tick(1);
    expect(t.status()).toBe('error');
    expect(t.audio.paused).toBe(true);
    expect(t.position()).toBe(50);
    expect(t.saved()?.position).toBe(50);
  });

  it('gives up after 15 s of loading too', () => {
    const t = setup();
    t.engine.start(book);
    t.tick(STALL_TIMEOUT_MS);
    expect(t.status()).toBe('error');
  });

  it('does not time out once playback recovered', () => {
    const t = playing();
    t.audio.stall();
    t.tick(10_000);
    t.audio.recover();
    t.tick(60_000);
    expect(t.status()).toBe('playing');
  });

  it('goes to error on a media error and retries from the same position', () => {
    const t = playing();
    t.engine.seek(700);
    t.audio.becomeReady();
    t.audio.fail();
    expect(t.status()).toBe('error');

    t.engine.retry();
    expect(t.status()).toBe('loading');
    expect(t.audio.loads.at(-1)).toBe('https://media.test/a/2.mp3');
    t.audio.becomeReady();
    expect(t.audio.currentTime).toBe(100);
    expect(t.status()).toBe('playing');
  });

  it('Play in the error state retries', () => {
    const t = playing();
    t.audio.fail();
    t.engine.play();
    expect(t.status()).toBe('loading');
  });

  it('pausing while loading wins over a late "can play"', () => {
    const t = setup();
    t.engine.start(book);
    t.engine.pause();
    t.audio.becomeReady();
    expect(t.status()).toBe('paused');
    expect(t.audio.paused).toBe(true);
  });

  it('falls back to paused when the browser refuses to play without a gesture', async () => {
    const t = setup();
    t.audio.rejectPlayWith = 'NotAllowedError';
    t.engine.start(book);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.status()).toBe('paused');
  });

  it('ignores the AbortError of a play() superseded by a newer load', async () => {
    const t = setup();
    t.audio.rejectPlayWith = 'AbortError';
    t.engine.start(book);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.status()).toBe('loading');
  });

  it('treats any other play() failure as an error', async () => {
    const t = setup();
    t.audio.rejectPlayWith = 'NotSupportedError';
    t.engine.start(book);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.status()).toBe('error');
  });
});

describe('saving the position', () => {
  it('saves every 5 s while playing, so a crash loses at most 5 s', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();

    t.audio.advanceTo(4);
    t.tick(SAVE_INTERVAL_MS - 1);
    expect(t.saved()?.position).toBe(0); // only the save made at start
    t.tick(1);
    expect(t.saved()?.position).toBe(4);

    t.audio.advanceTo(9);
    t.tick(SAVE_INTERVAL_MS);
    expect(t.saved()).toMatchObject({ position: 9, updatedAt: NOW + 2 * SAVE_INTERVAL_MS });
  });

  it('saves where the element really is, not where the last timeupdate left it', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(10);
    t.audio.currentTime = 10.2; // the clock moved on; no timeupdate yet

    t.engine.pause();
    expect(t.saved()?.position).toBe(10.2);
    expect(t.position()).toBe(10.2);
  });

  it('stops the periodic save while paused', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(10);
    t.engine.pause();
    const savedAt = t.saved()?.updatedAt;

    t.tick(60_000);
    expect(t.saved()?.updatedAt).toBe(savedAt);
  });

  it('saves on pause, seek, chapter change and flush', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();

    t.audio.advanceTo(11);
    t.engine.pause();
    expect(t.saved()?.position).toBe(11);

    t.engine.play();
    t.engine.seek(590);
    expect(t.saved()?.position).toBe(590);

    t.audio.advanceTo(599);
    t.audio.finishTrack(); // crosses into chapter 2
    expect(t.saved()?.position).toBe(600);

    t.audio.becomeReady();
    t.audio.advanceTo(3);
    t.engine.flush(); // tab hidden / page unload
    expect(t.saved()?.position).toBe(603);
  });

  it('marks the book finished inside the last 30 s', () => {
    const t = setup();
    t.engine.start(book, 2080);
    t.audio.becomeReady();
    t.engine.pause();
    expect(t.saved()).toMatchObject({ position: 2080, finished: true });
  });

  it('keeps playing when storage fails', async () => {
    const t = setup();
    t.store.put = () => Promise.reject(new Error('QuotaExceededError'));
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(20);
    t.engine.pause();
    await Promise.resolve();

    expect(t.status()).toBe('paused');
    expect(t.engine.getProgress('a')?.position).toBe(20); // still served from memory
  });
});

describe('restoring on app open', () => {
  it('brings back the most recent unfinished book, paused, without touching the network', async () => {
    const t = setup([
      record('a', 1234, { updatedAt: NOW - 5000, speed: 1.25 }),
      record('b', 50, { updatedAt: NOW - 9000 }),
    ]);
    await t.engine.init();

    expect(t.engine.getState()).toMatchObject({
      status: 'paused',
      book,
      position: 1234,
      chapterIndex: 1,
      speed: 1.25,
    });
    expect(t.audio.loads).toEqual([]);
    expect(t.audio.playCalls).toBe(0);
  });

  describe('when the book has to be fetched', () => {
    const asyncEngine = (resolveBook: AudioEngineOptionsResolve, saved = [record('a', 1234)]) =>
      new AudioEngine({
        createAudio: () => new FakeAudio(),
        store: createMemoryProgressStore(saved),
        resolveBook,
        now: () => NOW,
      });

    it('restores once the book arrives; saved progress is usable meanwhile', async () => {
      let deliver!: (value: typeof book) => void;
      const engine = asyncEngine(() => new Promise((resolve) => (deliver = resolve)));
      const ready = engine.init();
      await vi.waitFor(() => expect(engine.getProgress('a')?.position).toBe(1234));
      expect(engine.getState().status).toBe('idle');

      deliver(book);
      await ready;
      expect(engine.getState()).toMatchObject({ status: 'paused', book, position: 1234 });
    });

    it('stays idle when the book is gone or the request fails, keeping the position', async () => {
      for (const resolveBook of [async () => undefined, async () => Promise.reject(new Error())]) {
        const engine = asyncEngine(resolveBook);
        await engine.init();
        expect(engine.getState().status).toBe('idle');
        expect(engine.getProgress('a')?.position).toBe(1234);
      }
    });

    it('does not replace a book the listener started while it was loading', async () => {
      let deliver!: (value: typeof book) => void;
      const engine = asyncEngine(() => new Promise((resolve) => (deliver = resolve)));
      const ready = engine.init();
      await vi.waitFor(() => expect(engine.getProgress('a')).toBeDefined());

      engine.start(other);
      deliver(book);
      await ready;
      expect(engine.getState().book).toBe(other);
    });
  });

  it('then plays from that position on the first Play, showing it as buffering', async () => {
    const t = setup([record('a', 1234)]);
    await t.engine.init();
    t.engine.play();

    expect(t.audio.loads).toEqual(['https://media.test/a/2.mp3']);
    expect(t.status()).toBe('buffering');
    t.audio.becomeReady();
    expect(t.audio.currentTime).toBe(634);
    expect(t.status()).toBe('playing');
  });

  it('lets the listener seek before the first Play', async () => {
    const t = setup([record('a', 1234)]);
    await t.engine.init();
    t.engine.skipBack();
    expect(t.position()).toBe(1219);
    expect(t.audio.loads).toEqual([]);

    t.engine.play();
    t.audio.becomeReady();
    expect(t.audio.currentTime).toBe(619);
  });

  it('skips finished books and books that no longer exist', async () => {
    const t = setup([
      record('a', 2095, { finished: true, updatedAt: NOW }),
      record('gone', 10, { updatedAt: NOW - 1 }),
    ]);
    await t.engine.init();
    expect(t.status()).toBe('idle');
    expect(t.engine.getAllProgress()).toHaveLength(2); // still available for cards
  });

  it('does not override a book the listener already started', async () => {
    const t = setup([record('a', 1234)]);
    const ready = t.engine.init();
    t.engine.start(other);
    await ready;
    expect(t.engine.getState().book).toBe(other);
  });

  it('stays idle with nothing saved or when storage cannot be read', async () => {
    const t = setup();
    await t.engine.init();
    expect(t.status()).toBe('idle');

    const broken = setup();
    broken.store.all = () => Promise.reject(new Error('blocked'));
    await broken.engine.init();
    expect(broken.status()).toBe('idle');
  });
});

describe('sleep timer', () => {
  function playing() {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(100);
    return t;
  }
  const sleep = (t: ReturnType<typeof setup>) => t.engine.getState().sleep;

  it('pauses after the chosen minutes and then clears itself', () => {
    const t = playing();
    t.engine.setSleepTimer(5);
    expect(sleep(t)).toMatchObject({
      timer: { kind: 'minutes', minutes: 5 },
      remainingMs: 300_000,
    });

    t.tick(299_000);
    expect(t.status()).toBe('playing');
    t.tick(1000);
    expect(t.status()).toBe('paused');
    expect(sleep(t)).toBeNull();
    expect(t.audio.volume).toBe(1); // ready for the next Play
  });

  it('counts down in whole seconds for the display', () => {
    const t = playing();
    t.engine.setSleepTimer(5);
    t.tick(1000);
    expect(sleep(t)?.remainingMs).toBe(299_000);
    t.tick(61_000);
    expect(sleep(t)?.remainingMs).toBe(238_000);
  });

  it('fades the volume out over the last 10 s', () => {
    const t = playing();
    t.engine.setSleepTimer(5);
    t.tick(289_000);
    expect(t.audio.volume).toBe(1);
    t.tick(1000 + SLEEP_TICK_MS); // 9.75 s left
    expect(t.audio.volume).toBeCloseTo(0.975, 3);
    t.tick(4750); // 5 s left
    expect(t.audio.volume).toBeCloseTo(0.5, 3);
    t.tick(4000); // 1 s left
    expect(t.audio.volume).toBeCloseTo(0.1, 3);
  });

  it('"end of chapter" stops at the chapter boundary, wherever the clock is', () => {
    const t = playing(); // chapter 1 ends at 600
    t.engine.setSleepTimer('chapter');
    expect(sleep(t)).toMatchObject({ timer: { kind: 'endOfChapter', chapterEnd: 600 } });
    expect(sleep(t)?.remainingMs).toBe(500_000);

    t.audio.advanceTo(595);
    t.tick(SLEEP_TICK_MS);
    expect(t.status()).toBe('playing');
    expect(t.audio.volume).toBeCloseTo(0.5, 3); // 5 s of audio left

    t.audio.advanceTo(599.9);
    t.audio.finishTrack(); // rolls into chapter 2 before the next tick
    t.tick(SLEEP_TICK_MS);
    expect(t.status()).toBe('paused');
    expect(t.position()).toBe(600);
    expect(sleep(t)).toBeNull();
  });

  it('"end of chapter" accounts for playback speed', () => {
    const t = playing();
    t.engine.setSpeed(2);
    t.engine.setSleepTimer('chapter');
    expect(sleep(t)?.remainingMs).toBe(250_000);
  });

  it('is cancelled by a manual pause or play, and the volume comes back', () => {
    const t = playing();
    t.engine.setSleepTimer(5);
    t.tick(295_000); // inside the fade
    expect(t.audio.volume).toBeLessThan(1);

    t.engine.pause();
    expect(sleep(t)).toBeNull();
    expect(t.audio.volume).toBe(1);

    t.engine.play();
    t.engine.setSleepTimer(5);
    t.engine.toggle();
    expect(sleep(t)).toBeNull();

    t.tick(600_000);
    expect(t.status()).toBe('paused'); // nothing fires later
  });

  it('can be replaced and turned off', () => {
    const t = playing();
    t.engine.setSleepTimer(5);
    t.engine.setSleepTimer(30);
    expect(sleep(t)?.remainingMs).toBe(1_800_000);
    t.tick(300_000);
    expect(t.status()).toBe('playing'); // the first timer is gone

    t.engine.setSleepTimer(null);
    expect(sleep(t)).toBeNull();
    t.tick(3_600_000);
    expect(t.status()).toBe('playing');
  });

  it('does not survive starting another book or closing the player', () => {
    const t = playing();
    t.engine.setSleepTimer(5);
    t.engine.start(other);
    expect(sleep(t)).toBeNull();

    t.engine.setSleepTimer(5);
    t.engine.close();
    expect(sleep(t)).toBeNull();
  });

  it('needs a book', () => {
    const t = setup();
    t.engine.setSleepTimer(5);
    expect(sleep(t)).toBeNull();
  });
});

describe('playChapter', () => {
  it('jumps to the chapter start and starts playing if it was paused', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.engine.pause();

    t.engine.playChapter(2);
    expect(t.position()).toBe(1800);
    expect(t.engine.getState().chapterIndex).toBe(2);
    expect(t.audio.paused).toBe(false);

    t.engine.playChapter(99); // no such chapter
    expect(t.position()).toBe(1800);
  });
});

describe('closing and subscriptions', () => {
  it('close saves, stops and returns to idle', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(33);
    t.engine.close();

    expect(t.status()).toBe('idle');
    expect(t.engine.getState().book).toBeNull();
    expect(t.audio.paused).toBe(true);
    expect(t.saved()?.position).toBe(33);
  });

  it('notifies subscribers of changes and bumps the progress version on save', () => {
    const t = setup();
    const listener = vi.fn();
    const unsubscribe = t.engine.subscribe(listener);
    const version = t.engine.getProgressVersion();

    t.engine.start(book);
    expect(listener).toHaveBeenCalled();
    expect(t.engine.getProgressVersion()).toBeGreaterThan(version);

    unsubscribe();
    listener.mockClear();
    t.engine.pause();
    expect(listener).not.toHaveBeenCalled();
  });

  it('actions without a book do nothing', () => {
    const t = setup();
    expect(() => {
      t.engine.play();
      t.engine.pause();
      t.engine.toggle();
      t.engine.seek(10);
      t.engine.skipBack();
      t.engine.nextChapter();
      t.engine.previousChapter();
      t.engine.retry();
      t.engine.close();
      t.engine.flush();
    }).not.toThrow();
    expect(t.status()).toBe('idle');
    expect(t.audio.loads).toEqual([]);
  });
});

describe('settings: skip intervals and default speed', () => {
  function playing(playback: Partial<PlaybackSettings> = {}) {
    const t = setup([], playback);
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(300);
    return t;
  }

  it('skips by the configured intervals', () => {
    const t = playing({ skipBackSeconds: 10, skipForwardSeconds: 60 });
    t.engine.skipForward();
    expect(t.position()).toBe(360);
    t.engine.skipBack();
    expect(t.position()).toBe(350);
  });

  it('uses 15 s back and 30 s forward by default', () => {
    const t = playing();
    t.engine.skipBack();
    expect(t.position()).toBe(285);
    t.engine.skipForward();
    expect(t.position()).toBe(315);
  });

  it('an interval given by the caller (lock screen) wins over the setting', () => {
    const t = playing({ skipBackSeconds: 30 });
    t.engine.skipBack(5);
    expect(t.position()).toBe(295);
  });

  it('picks up a changed setting on the next skip, with no restart', () => {
    const t = playing();
    t.settings.skipForwardSeconds = 15;
    t.engine.skipForward();
    expect(t.position()).toBe(315);
  });

  it('starts a book with no saved speed at the default speed', () => {
    const t = setup([], { defaultSpeed: 1.5 });
    t.engine.start(book);
    t.audio.becomeReady();
    expect(t.engine.getState().speed).toBe(1.5);
    expect(t.audio.playbackRate).toBe(1.5);
  });

  it('keeps the speed saved for a book over the default', async () => {
    const t = setup([record('a', 100, { speed: 0.75 })], { defaultSpeed: 2 });
    await t.engine.init();
    t.engine.start(book);
    expect(t.engine.getState().speed).toBe(0.75);
  });

  it('does not change the speed of a book that is already playing', () => {
    const t = playing();
    t.settings.defaultSpeed = 2;
    expect(t.engine.getState().speed).toBe(1);
  });
});

describe('settings: auto-rewind on resume', () => {
  const MIN = 60_000;

  function paused(playback: Partial<PlaybackSettings> = {}) {
    const t = setup([], playback);
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(100);
    t.engine.pause();
    return t;
  }

  it('resumes 10 s earlier after a pause of 5 minutes', () => {
    const t = paused();
    t.tick(5 * MIN);
    t.engine.play();
    expect(t.position()).toBe(90);
    expect(t.audio.currentTime).toBe(90);
    expect(t.status()).toBe('playing');
  });

  it('does not rewind after a shorter pause', () => {
    const t = paused();
    t.tick(5 * MIN - 1000);
    t.engine.play();
    expect(t.position()).toBe(100);
  });

  it('does not rewind when the setting is off', () => {
    const t = paused({ autoRewind: false });
    t.tick(60 * MIN);
    t.engine.play();
    expect(t.position()).toBe(100);
  });

  it('rewinds again after a second long pause', () => {
    const t = paused();
    t.tick(10 * MIN);
    t.engine.play();
    t.audio.advanceTo(200);
    t.engine.pause();
    t.tick(10 * MIN);
    t.engine.play();
    expect(t.position()).toBe(190);
  });

  it('can cross into the previous file', () => {
    const t = setup();
    t.engine.start(book, 605); // chapter 2 starts at 600
    t.audio.becomeReady();
    t.engine.pause();
    t.tick(10 * MIN);
    t.engine.play();
    expect(t.position()).toBe(595);
    expect(t.audio.loads.at(-1)).toBe('https://media.test/a/1.mp3');
  });

  it('a seek while paused cancels it: the listener chose that spot', () => {
    const t = paused();
    t.tick(10 * MIN);
    t.engine.seek(500);
    t.engine.play();
    expect(t.position()).toBe(500);
  });

  it('records when playback paused, and nothing while it plays', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.tick(SAVE_INTERVAL_MS);
    expect(t.saved()?.pausedAt).toBeUndefined();

    t.engine.pause();
    expect(t.saved()?.pausedAt).toBe(NOW + SAVE_INTERVAL_MS);
    t.tick(SAVE_INTERVAL_MS);
    t.engine.flush(); // the tab is hidden while paused: the pause time must not move
    expect(t.saved()?.pausedAt).toBe(NOW + SAVE_INTERVAL_MS);

    t.engine.play();
    t.tick(SAVE_INTERVAL_MS);
    expect(t.saved()?.pausedAt).toBeUndefined();
  });

  it('works after a reload, using the pause time that was saved', async () => {
    const t = setup([record('a', 1000, { pausedAt: NOW - 10 * MIN, updatedAt: NOW - 1000 })]);
    await t.engine.init();
    t.engine.play();
    expect(t.position()).toBe(990);
    t.audio.becomeReady();
    expect(t.audio.currentTime).toBe(390); // 990 − 600, in the second file
  });

  it('after a reload with no pause time (v1 data, a crash), falls back to when it was last saved', async () => {
    const old = setup([record('a', 1000, { updatedAt: NOW - 3_600_000 })]);
    await old.engine.init();
    old.engine.play();
    expect(old.position()).toBe(990);

    const recent = setup([record('a', 1000, { updatedAt: NOW - 30_000 })]);
    await recent.engine.init();
    recent.engine.play();
    expect(recent.position()).toBe(1000);
  });

  it('applies when a card or book page resumes the book', async () => {
    const t = setup([record('a', 1000, { pausedAt: NOW - 10 * MIN })]);
    await t.engine.init();
    t.engine.start(book);
    expect(t.position()).toBe(990);
  });

  it('does not apply when the listener taps a chapter', async () => {
    const t = setup([record('a', 1000, { pausedAt: NOW - 10 * MIN })]);
    await t.engine.init();
    t.engine.start(book, 600);
    expect(t.position()).toBe(600);
  });

  it('starting another book counts as pausing the first, so it rewinds when resumed', () => {
    const t = setup();
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(100);
    t.engine.start(other);
    expect(t.saved('a')?.pausedAt).toBe(NOW);

    t.tick(10 * MIN);
    t.engine.start(book);
    expect(t.position()).toBe(90);
  });

  it('never rewinds a book that was finished and starts again from 0', async () => {
    const t = setup([record('a', 2090, { finished: true, pausedAt: NOW - 60 * MIN })]);
    await t.engine.init();
    t.engine.start(book);
    expect(t.position()).toBe(0);
  });
});

describe('settings: play next chapter', () => {
  // One file, two chapters: the boundary is in the middle of a file.
  const chaptered: PlayerBook = {
    ...makeBook('m', [1200]),
    chapters: [
      { id: 'm1', title: 'One', start: 0, end: 600 },
      { id: 'm2', title: 'Two', start: 600, end: 1200 },
    ],
  };
  const stopping = { continueToNextChapter: false };

  it('stops on the chapter boundary, inside a file', () => {
    const t = setup([], stopping);
    t.engine.start(chaptered);
    t.audio.becomeReady();
    t.audio.advanceTo(599.5);
    expect(t.status()).toBe('playing');

    t.audio.advanceTo(599.8);
    expect(t.status()).toBe('paused');
    expect(t.position()).toBe(600);
    expect(t.audio.currentTime).toBe(600);
    expect(t.audio.paused).toBe(true);
    expect(t.engine.getState().chapterIndex).toBe(1);
  });

  it('play continues with the next chapter, with no rewind however long the wait', () => {
    const t = setup([], stopping);
    t.engine.start(chaptered);
    t.audio.becomeReady();
    t.audio.advanceTo(599.8);
    t.tick(60 * 60_000);

    t.engine.play();
    expect(t.status()).toBe('playing');
    expect(t.position()).toBe(600);
  });

  it('stops where a file ends at a chapter end, without starting the next file', () => {
    const t = setup([], stopping);
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(590);
    t.audio.finishTrack();

    expect(t.status()).toBe('paused');
    expect(t.position()).toBe(600);
    expect(t.audio.loads.at(-1)).toBe('https://media.test/a/2.mp3'); // ready for Play
    expect(t.audio.playCalls).toBe(1);

    t.engine.play();
    expect(t.audio.playCalls).toBe(2);
    expect(t.audio.paused).toBe(false);
  });

  it('stops just before a file ends too, and lands in the next file', () => {
    const t = setup([], stopping);
    t.engine.start(book);
    t.audio.becomeReady();
    t.audio.advanceTo(599.9);
    expect(t.status()).toBe('paused');
    expect(t.position()).toBe(600);
    expect(t.audio.loads.at(-1)).toBe('https://media.test/a/2.mp3');
  });

  it('keeps going when the setting is on (the default)', () => {
    const t = setup();
    t.engine.start(chaptered);
    t.audio.becomeReady();
    t.audio.advanceTo(599.9);
    expect(t.status()).toBe('playing');
  });

  it('only stops at natural chapter ends, not when the listener seeks across one', () => {
    const t = setup([], stopping);
    t.engine.start(chaptered);
    t.audio.becomeReady();
    t.engine.seek(700);
    expect(t.status()).toBe('playing');
    t.engine.nextChapter();
    expect(t.status()).toBe('playing');
  });

  it('still ends the book normally at the end of the last chapter', () => {
    const t = setup([], stopping);
    t.engine.start(book, 1900);
    t.audio.becomeReady();
    t.audio.advanceTo(299.9); // inside the last file, 0.1 s before the end of the book
    expect(t.status()).toBe('playing');
    t.audio.finishTrack();
    expect(t.status()).toBe('finished');
  });

  it('counts the quarter second in real time at higher speeds', async () => {
    const t = setup([record('m', 0, { speed: 2 })], stopping);
    await t.engine.init();
    t.engine.start(chaptered);
    t.audio.becomeReady();
    t.audio.advanceTo(599.4); // 0.6 s of book = 0.3 s real: not yet
    expect(t.status()).toBe('playing');
    t.audio.advanceTo(599.6); // 0.4 s of book = 0.2 s real
    expect(t.status()).toBe('paused');
  });
});
