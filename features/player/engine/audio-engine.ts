import {
  buildTimeline,
  chapterIndexAt,
  DEFAULT_SKIP_BACK_S,
  DEFAULT_SKIP_FORWARD_S,
  DEFAULT_SPEED,
  hasStallTimeout,
  isAdvancing,
  isFinished,
  locate,
  nextChapterTarget,
  normalizeSpeed,
  previousChapterTarget,
  resumePosition,
  sleepAtEndOfChapter,
  sleepExpired,
  sleepFadeVolume,
  sleepInMinutes,
  sleepRemainingMs,
  skipTarget,
  STALL_TIMEOUT_MS,
  toBookTime,
  transition,
  wantsToPlay,
  type PlayerBook,
  type PlayerEvent,
  type PlayerStatus,
  type SleepTimer,
  type Timeline,
} from '../core';
import type { ProgressRecord, ProgressStore } from '../storage/progress-store';

/** The part of HTMLAudioElement the engine uses — small enough to fake in tests. */
export interface AudioLike {
  src: string;
  currentTime: number;
  playbackRate: number;
  volume: number;
  preload: string;
  readonly paused: boolean;
  readonly ended: boolean;
  /** HTMLMediaElement.HAVE_METADATA is 1. */
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface PlayerState {
  status: PlayerStatus;
  book: PlayerBook | null;
  /** Book time in seconds. */
  position: number;
  duration: number;
  chapterIndex: number;
  speed: number;
  /** The running sleep timer and the wall-clock time left on it, or `null`. */
  sleep: { timer: SleepTimer; remainingMs: number } | null;
}

export interface AudioEngineOptions {
  createAudio: () => AudioLike;
  store: ProgressStore;
  /** Finds a book by id, to restore the last one on app open. */
  resolveBook: (bookId: string) => PlayerBook | undefined | Promise<PlayerBook | undefined>;
  now?: () => number;
  /** Called whenever this engine starts producing sound (for the one-tab rule). */
  onPlaybackStart?: () => void;
}

export const SAVE_INTERVAL_MS = 5000;
/** How often the sleep timer is checked; fine enough for a smooth 10 s fade. */
export const SLEEP_TICK_MS = 250;

export const IDLE_STATE: PlayerState = {
  status: 'idle',
  book: null,
  position: 0,
  duration: 0,
  chapterIndex: -1,
  speed: DEFAULT_SPEED,
  sleep: null,
};

/**
 * Drives one audio element from the player state machine (PRD: Player).
 *
 * - One book at a time; starting another replaces it.
 * - Position is book time. Tracks are loaded one after another behind the scenes.
 * - Position is saved every 5 s while playing and on pause, seek, chapter change and
 *   `flush()` (tab hidden, page unload). Saved positions are cached in memory so that Play
 *   can call `audio.play()` synchronously inside the click — iOS requires that.
 *
 * Framework-free. React reads it through `subscribe` / `getState`.
 */
export class AudioEngine {
  private state: PlayerState = IDLE_STATE;
  private readonly listeners = new Set<() => void>();
  private readonly options: Required<Pick<AudioEngineOptions, 'now'>> & AudioEngineOptions;
  private readonly progress = new Map<string, ProgressRecord>();

  private audio: AudioLike | null = null;
  private timeline: Timeline = buildTimeline([]);
  private trackIndex = -1;
  /** Offset to apply once the new track's metadata is known. */
  private pendingOffset: number | null = null;
  /** True while we swap `src`: the element's own pause/emptied events are ours, not the user's. */
  private switching = false;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private ready: Promise<void> | null = null;
  private progressVersion = 0;
  private sleepTicker: ReturnType<typeof setInterval> | null = null;

  constructor(options: AudioEngineOptions) {
    this.options = { now: Date.now, ...options };
  }

  // ── Reading ──────────────────────────────────────────────────────────────────

  getState = (): PlayerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Saved progress for a book (from the in-memory cache). */
  getProgress = (bookId: string): ProgressRecord | undefined => this.progress.get(bookId);

  getAllProgress = (): ProgressRecord[] => [...this.progress.values()];

  /** Changes whenever saved progress changes; lets React re-read it cheaply. */
  getProgressVersion = (): number => this.progressVersion;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Loads saved progress and brings the most recent unfinished book back, paused.
   * Safe to call more than once; resolves when the cache is warm.
   */
  init(): Promise<void> {
    this.ready ??= this.options.store
      .all()
      .catch(() => [] as ProgressRecord[])
      .then(async (records) => {
        for (const record of records) {
          // Anything saved since init() started is newer than what the store returned.
          if (!this.progress.has(record.bookId)) this.progress.set(record.bookId, record);
        }
        this.progressVersion++;
        if (this.state.status !== 'idle') return;

        const last = records
          .filter((record) => !record.finished)
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        // Offline or a server error: come up idle rather than fail; the position stays saved.
        const book = last
          ? await Promise.resolve()
              .then(() => {
                this.emit(); // saved progress is usable while the book is being fetched
                return this.options.resolveBook(last.bookId);
              })
              .catch(() => undefined)
          : undefined;
        // The listener may have started something while the book was loading.
        if (this.state.status !== 'idle') return;
        if (!last || !book) {
          this.emit();
          return;
        }
        this.timeline = buildTimeline(book.tracks);
        this.trackIndex = -1;
        const position = resumePosition(last.position, this.timeline.duration);
        this.setState({
          status: transition('idle', 'RESTORE'),
          book,
          position,
          duration: this.timeline.duration,
          chapterIndex: chapterIndexAt(book.chapters, position),
          speed: normalizeSpeed(last.speed),
          sleep: null,
        });
      });
    return this.ready;
  }

  /** Save now. Call when the tab is hidden or the page is going away. */
  flush(): void {
    this.save();
  }

  dispose(): void {
    this.clearTimers();
    this.detachAudio();
    this.listeners.clear();
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  /**
   * Start a book: resume from the saved position (or the beginning if it was finished),
   * or from `position` when given (tapping a chapter).
   */
  start(book: PlayerBook, position?: number): void {
    if (this.state.book && this.state.book.id !== book.id) this.save();
    this.clearSleep();

    const saved = this.progress.get(book.id);
    this.timeline = buildTimeline(book.tracks);
    const duration = this.timeline.duration;
    const startAt =
      position !== undefined
        ? skipTarget(position, 0, duration)
        : resumePosition(saved?.position, duration);

    this.setState({
      status: transition(this.state.status, 'START'),
      book,
      position: startAt,
      duration,
      chapterIndex: chapterIndexAt(book.chapters, startAt),
      speed: normalizeSpeed(saved?.speed ?? DEFAULT_SPEED),
      sleep: null,
    });
    this.loadAt(startAt, true);
    this.save();
  }

  /** Play, pressed by the listener. Like any manual play or pause, it cancels the sleep timer. */
  play(): void {
    const { status, book } = this.state;
    if (!book) return;
    this.clearSleep();

    if (status === 'paused') {
      this.dispatch('PLAY');
      if (this.trackIndex === -1) this.loadAt(this.state.position, true);
      else this.playAudio();
    } else if (status === 'finished') {
      this.dispatch('PLAY');
      this.setPosition(0);
      this.loadAt(0, true);
    } else if (status === 'error') {
      this.retry();
    }
  }

  /** Pause, pressed by the listener (or another tab taking over). Cancels the sleep timer. */
  pause(): void {
    this.clearSleep();
    this.pausePlayback();
  }

  private pausePlayback(): void {
    if (!wantsToPlay(this.state.status)) return;
    this.dispatch('PAUSE');
    this.audio?.pause();
    this.save();
  }

  toggle(): void {
    if (wantsToPlay(this.state.status)) this.pause();
    else this.play();
  }

  retry(): void {
    if (this.state.status !== 'error') return;
    this.dispatch('RETRY');
    this.loadAt(this.state.position, true);
  }

  /** Jump to a book time. Keeps playing if it was playing, stays paused if it was paused. */
  seek(bookTime: number): void {
    const { book, status } = this.state;
    if (!book || status === 'idle') return;

    const target = skipTarget(bookTime, 0, this.state.duration);
    if (status === 'finished') this.dispatch('SEEK');
    this.setPosition(target);

    const { trackIndex, offset } = locate(this.timeline, target);
    if (trackIndex === this.trackIndex && this.audio) {
      if (this.audio.readyState >= 1 && this.pendingOffset === null)
        this.audio.currentTime = offset;
      else this.pendingOffset = offset;
    } else if (this.trackIndex !== -1 || wantsToPlay(this.state.status)) {
      this.loadAt(target, wantsToPlay(this.state.status));
    }
    this.save();
  }

  skipBack(seconds = DEFAULT_SKIP_BACK_S): void {
    this.seek(skipTarget(this.state.position, -seconds, this.state.duration));
  }

  skipForward(seconds = DEFAULT_SKIP_FORWARD_S): void {
    this.seek(skipTarget(this.state.position, seconds, this.state.duration));
  }

  previousChapter(): void {
    if (!this.state.book) return;
    this.seek(previousChapterTarget(this.state.book.chapters, this.state.position));
  }

  nextChapter(): void {
    if (!this.state.book) return;
    const target = nextChapterTarget(this.state.book.chapters, this.state.position);
    if (target !== null) this.seek(target);
  }

  /** Play from the start of a chapter of the current book. */
  playChapter(index: number): void {
    const chapter = this.state.book?.chapters[index];
    if (!chapter) return;
    this.seek(chapter.start);
    if (!wantsToPlay(this.state.status)) this.play();
  }

  /**
   * Sleep timer: a number of minutes, the end of the current chapter, or `null` to turn it
   * off. The volume fades over the last 10 s, then playback pauses.
   */
  setSleepTimer(option: number | 'chapter' | null): void {
    this.clearSleep();
    const { book, chapterIndex } = this.state;
    if (option === null || !book) return;

    const chapter = book.chapters[chapterIndex];
    const timer =
      option === 'chapter'
        ? chapter && sleepAtEndOfChapter(chapter.end)
        : sleepInMinutes(option, this.options.now());
    if (!timer) return;

    this.setState({ ...this.state, sleep: { timer, remainingMs: this.sleepRemaining(timer) } });
    this.sleepTicker = setInterval(() => this.tickSleep(), SLEEP_TICK_MS);
  }

  setSpeed(speed: number): void {
    const normalized = normalizeSpeed(speed);
    if (this.audio) this.audio.playbackRate = normalized;
    this.setState({ ...this.state, speed: normalized });
    this.save();
  }

  /** Unload the current book (it was removed, or the listener closed the player). */
  close(): void {
    if (this.state.status === 'idle') return;
    this.clearSleep();
    this.save();
    this.switching = true;
    this.audio?.pause();
    this.switching = false;
    this.trackIndex = -1;
    this.pendingOffset = null;
    this.setState({ ...IDLE_STATE, status: transition(this.state.status, 'CLOSE') });
  }

  // ── Audio element ────────────────────────────────────────────────────────────

  private readonly handlers: Record<string, () => void> = {
    loadedmetadata: () => this.applyPendingOffset(),
    playing: () => {
      this.applyPendingOffset();
      if (this.state.status === 'loading') this.dispatch('CAN_PLAY');
      else if (this.state.status === 'buffering') this.dispatch('DATA');
    },
    waiting: () => {
      if (this.state.status === 'playing') this.dispatch('STALLED');
    },
    pause: () => {
      // Paused from outside the app: a phone call, the OS, another app taking audio focus.
      const audio = this.audio;
      if (this.switching || !audio || audio.ended) return;
      if (wantsToPlay(this.state.status)) {
        this.dispatch('PAUSE');
        this.save();
      }
    },
    timeupdate: () => {
      const audio = this.audio;
      if (!audio || this.switching || this.pendingOffset !== null || this.trackIndex === -1) return;
      if (this.state.status === 'idle' || this.state.status === 'finished') return;
      this.setPosition(toBookTime(this.timeline, this.trackIndex, audio.currentTime));
    },
    ended: () => this.onTrackEnded(),
    error: () => {
      if (this.switching || this.state.status === 'idle') return;
      this.dispatch('FAILED');
      this.save();
    },
  };

  private ensureAudio(): AudioLike {
    if (!this.audio) {
      const audio = this.options.createAudio();
      audio.preload = 'auto';
      for (const [type, handler] of Object.entries(this.handlers)) {
        audio.addEventListener(type, handler);
      }
      this.audio = audio;
    }
    return this.audio;
  }

  private detachAudio(): void {
    if (!this.audio) return;
    for (const [type, handler] of Object.entries(this.handlers)) {
      this.audio.removeEventListener(type, handler);
    }
    this.switching = true;
    this.audio.pause();
    this.audio = null;
  }

  /** Point the element at the track that contains `bookTime` and optionally start it. */
  private loadAt(bookTime: number, autoplay: boolean): void {
    const book = this.state.book;
    if (!book) return;
    const { trackIndex, offset } = locate(this.timeline, bookTime);
    const track = book.tracks[trackIndex];
    if (!track) return;

    const audio = this.ensureAudio();
    this.switching = true;
    this.trackIndex = trackIndex;
    this.pendingOffset = offset;
    audio.src = track.url;
    audio.load();
    audio.playbackRate = this.state.speed;
    this.switching = false;
    if (autoplay) this.playAudio();
  }

  private playAudio(): void {
    const audio = this.ensureAudio();
    audio.playbackRate = this.state.speed;
    this.options.onPlaybackStart?.();
    // Resuming with nothing buffered (e.g. the restored book's first Play): show it as
    // buffering right away, so the 15 s timeout covers it. HAVE_FUTURE_DATA is 3.
    if (this.state.status === 'playing' && audio.readyState < 3) this.dispatch('STALLED');
    audio.play().catch((error: unknown) => {
      const name = (error as { name?: string } | null)?.name;
      // AbortError: a newer load() or pause() superseded this play() — expected.
      if (name === 'AbortError') return;
      // NotAllowedError: the browser refused to start without a user gesture.
      if (name === 'NotAllowedError') {
        if (wantsToPlay(this.state.status)) this.dispatch('PAUSE');
        return;
      }
      if (wantsToPlay(this.state.status)) this.dispatch('FAILED');
    });
  }

  private applyPendingOffset(): void {
    if (this.pendingOffset === null || !this.audio) return;
    const offset = this.pendingOffset;
    this.pendingOffset = null;
    if (Math.abs(this.audio.currentTime - offset) > 0.01) this.audio.currentTime = offset;
    this.audio.playbackRate = this.state.speed;
  }

  private onTrackEnded(): void {
    const { book, status } = this.state;
    if (!book || this.switching || status === 'idle') return;

    const next = this.trackIndex + 1;
    if (next < book.tracks.length) {
      // Keep going into the next file; the listener hears one continuous book.
      const start = this.timeline.starts[next]!;
      this.setPosition(start);
      this.loadAt(start, wantsToPlay(status));
      return;
    }
    this.setPosition(this.state.duration);
    this.dispatch('ENDED');
    this.save();
  }

  // ── State ────────────────────────────────────────────────────────────────────

  private dispatch(event: PlayerEvent): void {
    const next = transition(this.state.status, event);
    if (next === this.state.status) return;
    this.setState({ ...this.state, status: next });
  }

  private setPosition(position: number): void {
    const book = this.state.book;
    if (!book) return;
    const chapterIndex = chapterIndexAt(book.chapters, position);
    const chapterChanged = chapterIndex !== this.state.chapterIndex;
    this.setState({ ...this.state, position, chapterIndex });
    // The position was just set on purpose; do not overwrite it from the element's clock,
    // which may still be on the previous track or the pre-seek time.
    if (chapterChanged && isAdvancing(this.state.status)) this.save(false);
  }

  private setState(next: PlayerState): void {
    const previous = this.state;
    this.state = next;
    if (previous.status !== next.status) this.onStatusChange(next.status);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private onStatusChange(status: PlayerStatus): void {
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
    if (hasStallTimeout(status)) {
      this.stallTimer = setTimeout(() => {
        this.stallTimer = null;
        this.dispatch('TIMEOUT');
        this.switching = true;
        this.audio?.pause();
        this.switching = false;
        this.save();
      }, STALL_TIMEOUT_MS);
    }

    if (isAdvancing(status)) {
      this.saveTimer ??= setInterval(() => this.save(), SAVE_INTERVAL_MS);
    } else if (this.saveTimer !== null) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  // ── Sleep timer ──────────────────────────────────────────────────────────────

  private sleepRemaining(timer: SleepTimer): number {
    this.syncPosition();
    return sleepRemainingMs(timer, {
      now: this.options.now(),
      position: this.state.position,
      speed: this.state.speed,
    });
  }

  private tickSleep(): void {
    const sleep = this.state.sleep;
    if (!sleep) return;

    const remainingMs = this.sleepRemaining(sleep.timer);
    if (this.audio) this.audio.volume = sleepFadeVolume(remainingMs);

    if (sleepExpired(remainingMs)) {
      const { timer } = sleep;
      this.clearSleep();
      this.pausePlayback();
      // Land exactly on the chapter boundary, so Play continues with the next chapter.
      if (timer.kind === 'endOfChapter' && this.state.position !== timer.chapterEnd) {
        this.seek(timer.chapterEnd);
      }
      return;
    }
    // Re-render once a second, not four times: the display shows whole seconds.
    if (Math.ceil(remainingMs / 1000) !== Math.ceil(sleep.remainingMs / 1000)) {
      this.setState({ ...this.state, sleep: { ...sleep, remainingMs } });
    }
  }

  private clearSleep(): void {
    if (this.sleepTicker !== null) {
      clearInterval(this.sleepTicker);
      this.sleepTicker = null;
    }
    if (this.audio) this.audio.volume = 1;
    if (this.state.sleep) this.setState({ ...this.state, sleep: null });
  }

  private clearTimers(): void {
    if (this.sleepTicker !== null) clearInterval(this.sleepTicker);
    this.sleepTicker = null;
    if (this.stallTimer !== null) clearTimeout(this.stallTimer);
    if (this.saveTimer !== null) clearInterval(this.saveTimer);
    this.stallTimer = null;
    this.saveTimer = null;
  }

  /**
   * The element's clock runs ahead of its `timeupdate` events (they fire about four times a
   * second), so read it directly before saving.
   */
  private syncPosition(): void {
    const { book, status } = this.state;
    const audio = this.audio;
    if (!book || !audio || this.trackIndex === -1 || this.pendingOffset !== null) return;
    if (status === 'idle' || status === 'finished' || status === 'loading') return;
    const position = toBookTime(this.timeline, this.trackIndex, audio.currentTime);
    if (position === this.state.position) return;
    this.state = {
      ...this.state,
      position,
      chapterIndex: chapterIndexAt(book.chapters, position),
    };
  }

  private save(sync = true): void {
    if (sync) this.syncPosition();
    const { book, position, duration, speed, status } = this.state;
    if (!book || status === 'idle') return;
    const record: ProgressRecord = {
      bookId: book.id,
      position,
      duration,
      speed,
      // Ongoing books are never "finished": more parts are coming.
      finished: !book.ongoing && (status === 'finished' || isFinished(position, duration)),
      updatedAt: this.options.now(),
    };
    this.progress.set(book.id, record);
    this.progressVersion++;
    this.emit();
    void this.options.store.put(record).catch(() => {
      // Storage failures must never interrupt playback; the in-memory copy still serves this session.
    });
  }
}
