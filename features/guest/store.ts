import type { SettingsChannel } from '@/features/settings/channel';
import type { LocalDb } from '@/lib/local-db/db';
import { dismissNudge, parseNudgeState, recordAdd, type NudgeState } from './nudge';

/** `meta` rows (no schema change): the time the welcome was seen, and the nudge counter. */
const WELCOME_KEY = 'welcomeSeenAt';
const NUDGE_KEY = 'guestNudge';

export interface GuestSnapshot {
  /** Storage has been read (or has failed), so the rest can be trusted. */
  ready: boolean;
  /** The welcome was skipped or finished in this browser. */
  welcomeSeen: boolean;
  /** Saved places, likes, Listen later or History existed before this visit. */
  hasActivity: boolean;
  nudge: NudgeState;
}

export interface GuestRead {
  welcomeSeenAt: number | undefined;
  nudge: NudgeState;
  hasActivity: boolean;
}

/** Where the guest state lives. Dexie in the app, a fake in tests. */
export interface GuestRepo {
  load(): Promise<GuestRead>;
  /** Keeps the first time if there already is one; returns the stored time. */
  markWelcomeSeen(at: number): Promise<number>;
  /** One more like / Listen later add, counted atomically (two tabs lose nothing). */
  addAction(): Promise<NudgeState>;
  dismiss(at: number): Promise<NudgeState>;
}

export function createDexieGuestRepo(db: LocalDb): GuestRepo {
  async function readNudge(): Promise<NudgeState> {
    return parseNudgeState((await db.meta.get(NUDGE_KEY))?.value);
  }

  return {
    async load() {
      const [seen, nudge, progress, likes, later, history] = await Promise.all([
        db.meta.get(WELCOME_KEY),
        readNudge(),
        db.progress.count(),
        db.likes.count(),
        db.listenLater.count(),
        db.history.count(),
      ]);
      return {
        welcomeSeenAt: typeof seen?.value === 'number' ? seen.value : undefined,
        nudge,
        hasActivity: progress + likes + later + history > 0,
      };
    },

    markWelcomeSeen: (at) =>
      db.transaction('rw', db.meta, async () => {
        const found = await db.meta.get(WELCOME_KEY);
        if (typeof found?.value === 'number') return found.value;
        await db.meta.put({ key: WELCOME_KEY, value: at });
        return at;
      }),

    addAction: () =>
      db.transaction('rw', db.meta, async () => {
        const next = recordAdd(await readNudge());
        await db.meta.put({ key: NUDGE_KEY, value: next });
        return next;
      }),

    dismiss: (at) =>
      db.transaction('rw', db.meta, async () => {
        const next = dismissNudge(await readNudge(), at);
        await db.meta.put({ key: NUDGE_KEY, value: next });
        return next;
      }),
  };
}

export interface GuestStoreOptions {
  repo: GuestRepo;
  /** Tells other tabs about a change, and tells this one about theirs. */
  channel?: SettingsChannel;
  now?: () => number;
}

interface Dismissal {
  dismissedAt: number;
  actionsAtDismiss: number;
}

/**
 * What a guest has been told: the welcome screen and the sign-in nudge (Phase 5d). Framework-
 * free; React reads it through `subscribe` / `getSnapshot`. Same approach as the flags and
 * History stores:
 *
 * - A change shows at once and is written behind it, one write at a time and in order. If
 *   storage fails the value still holds for the session.
 * - Reads go through the same queue, so a read can never undo a write that is still waiting.
 * - After a write a ping tells the other tabs, which re-read Dexie: a dismissal in one tab
 *   hides the nudge in all of them, and a skipped welcome closes everywhere.
 * - The nudge counter is bumped inside one Dexie transaction, so two tabs add without loss.
 */
export class GuestStore {
  private snapshot: GuestSnapshot = {
    ready: false,
    welcomeSeen: false,
    hasActivity: false,
    nudge: { actions: 0 },
  };
  private loaded = false;
  private firstLoad: Promise<void> | null = null;
  private stored: GuestRead = {
    welcomeSeenAt: undefined,
    nudge: { actions: 0 },
    hasActivity: false,
  };

  /** Adds written to storage? Not yet: counted on top of what storage holds. */
  private pendingAdds = 0;
  /** Adds whose save failed: counted for this session only. */
  private retainedAdds = 0;
  private welcomeUnsaved = false;
  private dismissal: Dismissal | undefined;

  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly stopListening: (() => void) | undefined;

  constructor(private readonly options: GuestStoreOptions) {
    this.stopListening = options.channel?.subscribe(() => void this.load());
  }

  getSnapshot = (): GuestSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Read storage (queued behind pending writes). A failure leaves the current values. */
  load(): Promise<void> {
    const read = this.queue.then(async () => {
      try {
        this.stored = await this.options.repo.load();
      } catch (error) {
        console.warn('Guest storage is unavailable; keeping it in memory.', error);
      }
      this.loaded = true;
      this.rebuild();
    });
    this.queue = read;
    return read;
  }

  /** The welcome was skipped or finished. Shows at once; the first time stays on record. */
  markWelcomeSeen(): Promise<void> {
    this.welcomeUnsaved = true;
    this.rebuild();
    return this.enqueue(async () => {
      const at = (this.options.now ?? Date.now)();
      const saved = await this.options.repo.markWelcomeSeen(at);
      this.stored = { ...this.stored, welcomeSeenAt: saved };
      this.welcomeUnsaved = false;
    });
  }

  /** One more like or Listen later add (undo, removal and unlike never call this). */
  recordAdd(): Promise<void> {
    this.pendingAdds += 1;
    this.rebuild();
    return this.enqueue(
      async () => {
        const next = await this.options.repo.addAction();
        this.stored = { ...this.stored, nudge: next };
        this.pendingAdds -= 1;
      },
      () => {
        this.pendingAdds -= 1;
        this.retainedAdds += 1;
      },
    );
  }

  /** "Not now" / the close button / following the sign-in link. Snoozes the nudge. */
  dismissNudge(): Promise<void> {
    const at = (this.options.now ?? Date.now)();
    this.dismissal = { dismissedAt: at, actionsAtDismiss: this.snapshot.nudge.actions };
    this.rebuild();
    return this.enqueue(async () => {
      const next = await this.options.repo.dismiss(at);
      this.stored = { ...this.stored, nudge: next };
      this.dismissal = undefined;
    });
  }

  dispose(): void {
    this.stopListening?.();
    this.options.channel?.close();
    this.listeners.clear();
  }

  /** Never rejects: a failed save is logged and the value stays for the session. */
  private enqueue(write: () => Promise<void>, onFail?: () => void): Promise<void> {
    const run = this.queue.then(async () => {
      let saved = true;
      try {
        await write();
      } catch (error) {
        saved = false;
        console.warn('Could not save the change.', error);
        onFail?.();
      }
      this.rebuild();
      if (saved) this.options.channel?.post();
    });
    this.queue = run;
    return run;
  }

  /** Stored values with the unsaved changes laid over them. Notifies only on a real change. */
  private rebuild(): void {
    const { nudge } = this.stored;
    const actions = nudge.actions + this.pendingAdds + this.retainedAdds;
    const dismissal =
      this.dismissal ??
      (nudge.dismissedAt === undefined
        ? undefined
        : {
            dismissedAt: nudge.dismissedAt,
            actionsAtDismiss: nudge.actionsAtDismiss ?? nudge.actions,
          });

    const next: GuestSnapshot = {
      ready: this.loaded,
      welcomeSeen: this.welcomeUnsaved || this.stored.welcomeSeenAt !== undefined,
      hasActivity: this.stored.hasActivity,
      nudge: dismissal ? { actions, ...dismissal } : { actions },
    };

    const current = this.snapshot;
    if (
      current.ready === next.ready &&
      current.welcomeSeen === next.welcomeSeen &&
      current.hasActivity === next.hasActivity &&
      current.nudge.actions === next.nudge.actions &&
      current.nudge.dismissedAt === next.nudge.dismissedAt &&
      current.nudge.actionsAtDismiss === next.nudge.actionsAtDismiss
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
