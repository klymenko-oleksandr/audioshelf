// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const clients: { end: ReturnType<typeof vi.fn> }[] = [];
let lastOptions: Record<string, unknown> = {};
vi.mock('postgres', () => ({
  default: vi.fn((_url: string, options: Record<string, unknown>) => {
    lastOptions = options;
    const client = { end: vi.fn(() => Promise.resolve()) };
    clients.push(client);
    return client;
  }),
}));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: vi.fn(() => ({})) }));

async function freshModule() {
  vi.resetModules();
  (globalThis as { __audioshelfDb?: unknown }).__audioshelfDb = undefined;
  return import('./index');
}

describe('getDb', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T00:00:00Z'));
    process.env.DATABASE_URL = 'postgres://u:p@localhost:6543/db';
    clients.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('reuses the connection while it is in use', async () => {
    const { getDb } = await freshModule();
    const first = getDb();
    vi.advanceTimersByTime(4_000);
    expect(getDb()).toBe(first);
    expect(clients).toHaveLength(1);
  });

  it('replaces a connection nobody asked for in a while, and lets running queries finish instead of cutting them off', async () => {
    const { getDb } = await freshModule();
    getDb();
    vi.advanceTimersByTime(6_000);
    getDb();
    expect(clients).toHaveLength(2);
    // No timeout argument: `end({ timeout })` kills queries still running after that long,
    // which broke a page whose queries were queued behind each other (22 Nov).
    expect(clients[0]!.end).toHaveBeenCalledWith();
  });

  it('counts a query as use, so a slow page never loses its connection halfway', async () => {
    const { getDb } = await freshModule();
    getDb();
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(4_000);
      (lastOptions.debug as () => void)(); // the driver reports each query it sends
    }
    getDb();
    expect(clients).toHaveLength(1);
  });
});
