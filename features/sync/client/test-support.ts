/**
 * For tests: a sync server in memory. It reads pushes with the real parser and merges them with
 * the real `planMerge`; only the database and the session are faked.
 */
import { emptyState, flagKey, planMerge } from '../merge';
import { parsePushBody } from '../request';
import type { PullResponse } from './apply';
import type { PushBody } from './wire';

export const SERVER_NOW = 1_800_000_000_000;

type Kind = 'progress' | 'flags' | 'history' | 'settings';

export function fakeSyncServer(options: { now?: () => number; pageSize?: number } = {}) {
  const now = options.now ?? (() => SERVER_NOW);
  const accounts = new Map<string, ReturnType<typeof account>>();
  function account() {
    return { state: emptyState(), seqs: new Map<string, number>() };
  }
  let seq = 0;
  const of = (user: string) => {
    const found = accounts.get(user) ?? account();
    accounts.set(user, found);
    return found;
  };

  const server = {
    /** Whose session cookie the next request carries. `null`: none (401). */
    user: null as string | null,
    /** Books the database does not have. */
    unknownBooks: new Set<string>(),
    /** The next answers to give instead (a status, or `'offline'`). */
    failures: [] as (number | 'offline')[],
    pushes: [] as PushBody[],
    pulls: [] as { user: string; since: number }[],
    requests: 0,
    /** Runs while a request is "on the wire". */
    during: undefined as undefined | ((url: string) => void | Promise<void>),
    state: (user: string) => of(user).state,

    push(user: string, body: PushBody) {
      const parsed = parsePushBody(JSON.parse(JSON.stringify(body)));
      if (!parsed.ok) {
        return { status: 422, body: { ok: false, errors: parsed.errors } };
      }
      const { changes, deviceId, clientNow, merge } = parsed.value;
      const dropped: object[] = [];
      const keep = <T extends { bookId: string }>(items: T[], kind: string) =>
        items.filter((item) => {
          if (!server.unknownBooks.has(item.bookId)) return true;
          dropped.push({ kind, bookId: item.bookId, reason: 'unknown_book' });
          return false;
        });
      const target = of(user);
      const plan = planMerge(
        target.state,
        {
          progress: keep(changes.progress, 'progress'),
          flags: keep(changes.flags, 'flag'),
          history: keep(changes.history, 'history'),
          settings: changes.settings,
        },
        { deviceId, clientNow, serverNow: now(), merge },
      );
      const write = <T>(kind: Kind, key: string, map: Map<string, T>, row: T) => {
        map.set(key, row);
        target.seqs.set(`${kind}:${key}`, ++seq);
      };
      for (const { after } of plan.progress) {
        write('progress', after.bookId, target.state.progress, after);
      }
      for (const { after } of plan.flags) {
        write('flags', flagKey(after.bookId, after.kind), target.state.flags, after);
      }
      for (const { after } of plan.history) {
        write('history', after.bookId, target.state.history, after);
      }
      for (const { after } of plan.settings) {
        write('settings', after.key, target.state.settings, after);
      }
      return {
        status: 200,
        body: { ok: true, serverNow: now(), cursor: seq, applied: {}, dropped },
      };
    },

    pull(user: string, since: number): PullResponse {
      const target = of(user);
      const rows = [...target.seqs].filter(([, n]) => n > since).sort((a, b) => a[1] - b[1]);
      const page = rows.slice(0, options.pageSize ?? 1000);
      const out = {
        cursor: page.at(-1)?.[1] ?? since,
        serverNow: now(),
        hasMore: rows.length > page.length,
        progress: [],
        flags: [],
        history: [],
        settings: [],
      } as PullResponse;
      for (const [name, n] of page) {
        const kind = name.slice(0, name.indexOf(':')) as Kind;
        const row = (target.state[kind] as Map<string, object>).get(name.slice(kind.length + 1))!;
        (out[kind] as object[]).push({ ...row, seq: n });
      }
      return out;
    },

    async fetch(url: string, init: RequestInit): Promise<Response> {
      server.requests += 1;
      await server.during?.(url);
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const failure = server.failures.shift();
      if (failure === 'offline') throw new TypeError('Failed to fetch');
      if (failure !== undefined) return new Response('{}', { status: failure });
      const user = server.user;
      if (!user) return new Response('{}', { status: 401 });
      if (init.method === 'POST') {
        const body = JSON.parse(init.body as string) as PushBody;
        server.pushes.push(body);
        const result = server.push(user, body);
        return new Response(JSON.stringify(result.body), { status: result.status });
      }
      const since = Number(new URL(url, 'http://test').searchParams.get('since'));
      server.pulls.push({ user, since });
      return new Response(JSON.stringify(server.pull(user, since)), { status: 200 });
    },
  };
  return server;
}

export type FakeSyncServer = ReturnType<typeof fakeSyncServer>;
