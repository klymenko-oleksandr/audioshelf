/**
 * The sync client (Phase 6c; PRD: Progress sync). Framework-free; everything it touches is
 * passed in, like `AccountStore` and its gateway.
 *
 * - It works only for a signed-in listener. A guest has no outbox rows and no requests.
 * - One thing at a time: sign-in and sign-out handling, pushes and pulls share one queue, so
 *   a page is never applied while the tables change hands.
 * - Push: every 30 s while playing; at once on pause, chapter change, any other change,
 *   reconnect and sign-out; `sendBeacon` when the tab is hidden. An outbox row leaves only
 *   after a 200, and only if it has not changed since it was sent.
 * - Pull: after a push, on sign-in, app open, tab focus and reconnect.
 */
import type { LocalDb } from '@/lib/local-db/db';
import { getDeviceId } from '@/lib/local-db/device';
import type { OutboxRecord } from '@/lib/local-db/types';
import { clockOffset } from '../merge';
import { applyPage, readCursor, type ChangedKind, type PullResponse } from './apply';
import { adopt, release } from './identity';
import { onQueued, readOwner } from './outbox';
import { toBatches, type PushBatch, type PushBody } from './wire';

export const PUSH_URL = '/api/sync/push';
export const PULL_URL = '/api/sync/pull';

export const PLAYING_INTERVAL_MS = 30_000;
/** Long enough for the write behind a pause or a tap to land, and to send a burst as one. */
export const SOON_MS = 300;
export const RETRY_FIRST_MS = 2_000;
export const RETRY_MAX_MS = 5 * 60_000;
export const REQUEST_TIMEOUT_MS = 20_000;
export const SIGN_OUT_FLUSH_MS = 5_000;
/** `sendBeacon` refuses more than 64 KiB; this leaves room for the rest of the body. */
export const BEACON_BYTES = 60_000;
/** A server that always answers "more" must not keep the tab pulling for ever. */
const MAX_PAGES = 1_000;

/** `unknown`: not read yet, or could not be read. Nothing is done and nothing is removed. */
export type SyncAccountState =
  { status: 'unknown' } | { status: 'signedOut' } | { status: 'signedIn'; id: string };

export interface SyncAccount {
  getState(): SyncAccountState;
  subscribe(listener: () => void): () => void;
}

export interface SyncPlayer {
  /** Save the current place now. */
  flush(): Promise<void>;
  /** Saved places changed underneath: read them again, leaving the loaded book alone. */
  refresh(): Promise<void>;
  /** The tables are changing hands: unload without saving. */
  reset(): void;
  getState(): { playing: boolean; bookId: string | null; chapterIndex: number };
  subscribe(listener: () => void): () => void;
}

export interface SyncClientDeps {
  db: LocalDb;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** `navigator.sendBeacon` with a JSON body. `false` when the browser will not take it. */
  beacon: (url: string, body: string) => boolean;
  now: () => number;
  account: SyncAccount;
  player: SyncPlayer;
  deviceName: string;
  /** Rows changed underneath the stores (a pull, a sign-in or a sign-out). */
  onChanged: (kinds: ReadonlySet<ChangedKind>) => void | Promise<void>;
  /** The account this tab shows, for the guard in the progress store. */
  setTabOwner: (owner: string | null) => void;
}

type PushOutcome = 'done' | 'idle' | 'retry' | 'rejected' | 'unauthorized';

const EVERYTHING: ReadonlySet<ChangedKind> = new Set(['progress', 'flags', 'history', 'settings']);

export class SyncClient {
  private queue: Promise<unknown> = Promise.resolve();
  private tabOwner: string | null = null;
  private soonTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private playingTimer: ReturnType<typeof setInterval> | undefined;
  private failures = 0;
  private pullWaiting: Promise<void> | undefined;
  private requests = new Set<AbortController>();
  private stops: (() => void)[] = [];
  /** Counts `dispose()` calls, so a start that was overtaken does not subscribe. */
  private disposals = 0;
  private lastPlayer: ReturnType<SyncPlayer['getState']> | undefined;

  constructor(private readonly deps: SyncClientDeps) {}

  /** App open. Resolves when the account has been looked at once and synced. */
  async start(): Promise<void> {
    const { db, account, player } = this.deps;
    const disposals = this.disposals;
    await this.run(async () => this.showOwner(await readOwner(db)));
    if (disposals !== this.disposals) return;
    this.stops.push(
      onQueued(db, (kind) => {
        // While playing, the position goes out on the timer.
        if (kind !== 'progress' || !player.getState().playing) this.flushSoon();
      }),
      account.subscribe(() => void this.accountChanged()),
      player.subscribe(() => this.playerChanged()),
    );
    this.playerChanged();
    await this.accountChanged();
  }

  dispose(): void {
    this.disposals += 1;
    for (const stop of this.stops.splice(0)) stop();
    clearTimeout(this.soonTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.playingTimer);
    this.playingTimer = undefined;
    for (const request of this.requests) request.abort();
  }

  /** Back online, or the sign-in state may have changed in another tab. */
  async reconnected(): Promise<void> {
    this.resetBackoff();
    await this.sync();
  }

  /** The tab is in front again. */
  focused(): Promise<void> {
    return this.sync();
  }

  /** Push what is waiting, then pull. A server that cannot be reached is not asked twice. */
  async sync(): Promise<void> {
    if ((await this.flush()) !== 'retry') await this.pull();
  }

  /** Called while the session is still valid. Gives up after a few seconds. */
  async beforeSignOut(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), SIGN_OUT_FLUSH_MS);
    });
    const flushed = (async () => {
      await this.deps.player.flush().catch(() => {});
      await this.flush();
    })();
    const result = await Promise.race([flushed, timeout]);
    clearTimeout(timer);
    // Whatever is still on its way must not hold up the sign-out.
    if (result === 'timeout') for (const request of this.requests) request.abort();
  }

  /**
   * The tab is being hidden or closed: no response can be waited for, so the rows stay in the
   * outbox and go again later (the server ignores what it already has).
   */
  async hidden(): Promise<void> {
    await this.deps.player.flush().catch(() => {});
    // Not queued: a request in progress must not delay this past the life of the page.
    const owner = this.signedInOwner();
    if (!owner || (await readOwner(this.deps.db)) !== owner) return;
    const entries = await this.waiting(owner);
    const [batch] = toBatches(entries.sort(positionsFirst), { bytes: BEACON_BYTES });
    if (!batch) return;
    const body = await this.pushBody(batch);
    this.deps.beacon(PUSH_URL, JSON.stringify(body));
  }

  /** Send everything waiting. */
  flush(): Promise<PushOutcome> {
    clearTimeout(this.soonTimer);
    this.soonTimer = undefined;
    return this.run(async () => {
      const outcome = await this.push().catch((error): PushOutcome => {
        console.warn('Could not sync the changes.', error);
        return 'retry';
      });
      if (outcome === 'done' || outcome === 'idle') this.resetBackoff();
      else if (outcome !== 'unauthorized') this.backOff();
      return outcome;
    });
  }

  /** Read what changed on the server. Calls made while one waits to run share it. */
  pull(): Promise<void> {
    this.pullWaiting ??= this.run(async () => {
      this.pullWaiting = undefined;
      await this.pullPages().catch((error) => console.warn('Could not read changes.', error));
    });
    return this.pullWaiting;
  }

  // ── Inside the queue ─────────────────────────────────────────────────────────

  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  private signedInOwner(): string | null {
    const state = this.deps.account.getState();
    return state.status === 'signedIn' ? state.id : null;
  }

  private showOwner(owner: string | null) {
    this.tabOwner = owner;
    this.deps.setTabOwner(owner);
  }

  private async accountChanged(): Promise<void> {
    const signedIn = await this.run(async () => {
      const { db, account, player, onChanged } = this.deps;
      const state = account.getState();
      if (state.status === 'unknown') return false;
      const next = state.status === 'signedIn' ? state.id : null;
      const stored = await readOwner(db);
      const shown = this.tabOwner;
      if (stored === next && shown === next) return next !== null;

      // Leaving an account: this tab lets go of its data before the tables are cleared, and
      // its writes are refused until it has.
      if ([stored, shown].some((owner) => owner !== null && owner !== next)) {
        clearTimeout(this.soonTimer);
        this.soonTimer = undefined;
        this.resetBackoff();
        player.reset();
        if (stored !== null && stored !== next) await release(db);
        if (next === null) this.showOwner(null);
      } else if (next !== null) {
        // Joining: the position being played has to be in the tables before they are queued.
        await player.flush().catch(() => {});
      }
      if (next !== null) {
        // The tab says whose it is only once the tables say so too: until then a save is a
        // guest's (or, after a switch, there is nothing loaded to save).
        if (shown !== null && shown !== next) this.showOwner(null);
        await adopt(db, next);
        this.showOwner(next);
      }
      await player.refresh();
      await onChanged(EVERYTHING);
      return next !== null;
    }).catch((error) => {
      console.warn('Could not switch the synced account.', error);
      return false;
    });
    if (signedIn) await this.sync();
  }

  private async waiting(owner: string): Promise<OutboxRecord[]> {
    return this.deps.db.outbox.where('owner').equals(owner).toArray();
  }

  private async pushBody(batch: PushBatch): Promise<PushBody> {
    return {
      deviceId: await getDeviceId(this.deps.db),
      deviceName: this.deps.deviceName,
      clientNow: Math.round(this.deps.now()),
      ...(batch.merge ? { merge: true } : {}),
      changes: batch.changes,
    };
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    this.requests.add(controller);
    try {
      return await this.deps.fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      this.requests.delete(controller);
    }
  }

  private async push(): Promise<PushOutcome> {
    const { db } = this.deps;
    const owner = this.signedInOwner();
    if (!owner || (await readOwner(db)) !== owner) return 'idle';
    const batches = toBatches(await this.waiting(owner));
    if (batches.length === 0) return 'idle';

    for (const batch of batches) {
      if (this.signedInOwner() !== owner) return 'idle';
      const response = await this.request(PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(await this.pushBody(batch)),
      });
      if (response.status === 401) return 'unauthorized';
      if (response.status !== 200) {
        if (response.status >= 400 && response.status < 500) {
          console.error(`The server refused a sync push (${response.status}).`);
          return 'rejected';
        }
        return 'retry';
      }
      // The session cookie decides whose account the server wrote to. If it changed while the
      // request was out, keep the rows: sending them again is harmless.
      if (this.signedInOwner() !== owner) return 'idle';
      // Items the server dropped (a deleted book, a setting it does not allow) can never be
      // accepted, so they leave with the rest of the batch.
      await db.transaction('rw', db.outbox, async () => {
        for (const sent of batch.entries) {
          const current = await db.outbox.get([owner, sent.key]);
          if (current?.version === sent.version) await db.outbox.delete([owner, sent.key]);
        }
      });
    }
    return 'done';
  }

  private async pullPages(): Promise<void> {
    const { db, now, onChanged, player } = this.deps;
    const owner = this.signedInOwner();
    if (!owner || (await readOwner(db)) !== owner) return;
    // The merge has to reach the server first; its result is what the first pull brings back.
    if ((await this.waiting(owner)).some((entry) => entry.merge)) return;
    const deviceId = await getDeviceId(db);
    const changed = new Set<ChangedKind>();
    try {
      for (let pages = 0; pages < MAX_PAGES; pages++) {
        const { since } = await readCursor(db, owner);
        const requestedAt = now();
        const query = new URLSearchParams({ since: String(since), deviceId });
        const response = await this.request(`${PULL_URL}?${query}`, { method: 'GET' });
        if (response.status !== 200) return;
        const page = (await response.json()) as PullResponse;
        if (this.signedInOwner() !== owner) return;
        // The server's clock against ours, taking the middle of the round trip.
        const offsetMs = Math.round(clockOffset(page.serverNow, (requestedAt + now()) / 2));
        const applied = await applyPage(db, page, { owner, deviceId, offsetMs, requestedAt });
        if (!applied) return;
        for (const kind of applied) changed.add(kind);
        if (!page.hasMore || page.cursor <= since) return;
      }
    } finally {
      if (changed.size > 0) {
        if (changed.has('progress')) await player.refresh();
        await onChanged(changed);
      }
    }
  }

  // ── When to push ─────────────────────────────────────────────────────────────

  private flushSoon(): void {
    // While backing off, the retry timer takes the new change along.
    if (this.retryTimer !== undefined || this.soonTimer !== undefined) return;
    if (!this.signedInOwner()) return;
    this.soonTimer = setTimeout(() => void this.flush(), SOON_MS);
  }

  private backOff(): void {
    clearTimeout(this.retryTimer);
    const delay = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS * 2 ** this.failures);
    this.failures += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      // A pull may have been waiting for the merge push to get through.
      void this.sync();
    }, delay);
  }

  private resetBackoff(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.failures = 0;
  }

  private playerChanged(): void {
    const next = this.deps.player.getState();
    const last = this.lastPlayer;
    this.lastPlayer = next;
    if (next.playing && this.playingTimer === undefined) {
      this.playingTimer = setInterval(() => {
        if (this.retryTimer === undefined) void this.flush();
      }, PLAYING_INTERVAL_MS);
    } else if (!next.playing && this.playingTimer !== undefined) {
      clearInterval(this.playingTimer);
      this.playingTimer = undefined;
    }
    if (!last) return;
    const paused = last.playing && !next.playing;
    const movedOn = last.bookId === next.bookId && last.chapterIndex !== next.chapterIndex;
    if (paused || movedOn) this.flushSoon();
  }
}

const positionsFirst = (a: OutboxRecord, b: OutboxRecord) =>
  Number(b.kind === 'progress') - Number(a.kind === 'progress') ||
  b.item.updatedAt - a.item.updatedAt;
