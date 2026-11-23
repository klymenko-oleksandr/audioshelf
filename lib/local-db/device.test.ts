// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LocalDb } from './db';
import { getDeviceId } from './device';

const freshDb = () => new LocalDb(`test-${Math.random()}`);

describe('getDeviceId', () => {
  it('creates an id once and keeps returning it', async () => {
    const db = freshDb();
    const first = await getDeviceId(db);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getDeviceId(db)).toBe(first);
    db.close();
  });

  it('survives reopening the database', async () => {
    const name = `test-${Math.random()}`;
    const one = new LocalDb(name);
    const id = await getDeviceId(one);
    one.close();

    const two = new LocalDb(name);
    expect(await getDeviceId(two)).toBe(id);
    two.close();
  });

  it('gives parallel callers (two tabs starting together) the same id', async () => {
    const name = `test-${Math.random()}`;
    const a = new LocalDb(name);
    const b = new LocalDb(name);
    const ids = await Promise.all([getDeviceId(a), getDeviceId(b), getDeviceId(a)]);
    expect(new Set(ids).size).toBe(1);
    a.close();
    b.close();
  });
});
