import { describe, expect, it } from 'vitest';
import { insertWithUniqueSlug, pickUniqueSlug, slugBase } from './unique-slug';

describe('slugBase', () => {
  it('transliterates Ukrainian titles with lib/slug', () => {
    expect(slugBase('Братство персня', 'book')).toBe('bratstvo-persnia');
  });

  it('falls back when the title has no Latin or Cyrillic letters or digits', () => {
    expect(slugBase('日本語の本', 'book')).toBe('book');
    expect(slugBase('!!!', 'author')).toBe('author');
  });

  it('leaves room for a "-NN" suffix under the 60-character slug limit', () => {
    const base = slugBase('word '.repeat(30), 'book');
    expect(base.length).toBeLessThanOrEqual(56);
    expect(base).not.toMatch(/-$/);
  });
});

describe('pickUniqueSlug', () => {
  it('uses the base when it is free', () => {
    expect(pickUniqueSlug('dracula', new Set(['other']))).toBe('dracula');
  });

  it('adds -2, then -3, and so on', () => {
    expect(pickUniqueSlug('dracula', new Set(['dracula']))).toBe('dracula-2');
    expect(pickUniqueSlug('dracula', new Set(['dracula', 'dracula-2']))).toBe('dracula-3');
  });

  it('fills the first gap', () => {
    expect(pickUniqueSlug('dracula', new Set(['dracula', 'dracula-3']))).toBe('dracula-2');
  });

  it('does not treat a longer slug that merely starts with the base as taken', () => {
    expect(pickUniqueSlug('dracula', new Set(['dracula-returns']))).toBe('dracula');
  });
});

describe('insertWithUniqueSlug', () => {
  it('inserts with the free slug on the first try', async () => {
    const tried: string[] = [];
    const row = await insertWithUniqueSlug(
      'dracula',
      async () => new Set(),
      async (slug) => {
        tried.push(slug);
        return { slug };
      },
    );
    expect(row).toEqual({ slug: 'dracula' });
    expect(tried).toEqual(['dracula']);
  });

  it('reloads the taken slugs and tries the next one when someone else took the slug in between', async () => {
    const database = new Set<string>();
    let loads = 0;
    const row = await insertWithUniqueSlug(
      'dracula',
      async () => {
        loads += 1;
        // The first read is stale: it does not yet see the slug another save is about to take.
        return loads === 1 ? new Set<string>() : new Set(database);
      },
      async (slug) => {
        if (slug === 'dracula') {
          database.add('dracula');
          return undefined; // the insert hit the unique index and did nothing
        }
        database.add(slug);
        return { slug };
      },
    );
    expect(row).toEqual({ slug: 'dracula-2' });
    expect(loads).toBe(2);
  });

  it('gives up with a clear error after repeated collisions', async () => {
    await expect(
      insertWithUniqueSlug(
        'dracula',
        async () => new Set(),
        async () => undefined,
        3,
      ),
    ).rejects.toThrow(/unique slug/i);
  });
});
