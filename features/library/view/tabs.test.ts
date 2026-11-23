import { describe, expect, it } from 'vitest';
import type { BookSummary } from '@/features/catalogue/data/queries';
import type { HistoryRecord } from '@/lib/local-db/types';
import {
  buildLibraryView,
  DEFAULT_LIBRARY_TAB,
  defaultSort,
  libraryHref,
  parseLibrarySort,
  parseLibraryTab,
} from './tabs';

const book = (id: string, title: string, author: string | null): BookSummary => ({
  id,
  slug: id,
  title,
  author: author ? { slug: author, name: author } : null,
  durationSeconds: 100,
  language: 'uk',
  ongoing: false,
});

const catalogue = new Map(
  [
    book('a', 'Тіні забутих предків', 'Коцюбинський'),
    book('b', 'Intermezzo', 'Коцюбинський'),
    book('c', 'Захар Беркут', 'Франко'),
    book('d', 'Лісова пісня', null),
  ].map((b) => [b.id, b]),
);

const entry = (bookId: string, lastPlayedAt: number, finishedAt?: number): HistoryRecord => ({
  bookId,
  startedAt: lastPlayedAt,
  lastPlayedAt,
  ...(finishedAt === undefined ? {} : { finishedAt }),
  updatedAt: lastPlayedAt,
  deviceId: 'd',
});

const view = (input: Partial<Parameters<typeof buildLibraryView>[0]> = {}) =>
  buildLibraryView({
    likedAt: new Map(),
    listenLaterAt: new Map(),
    history: [],
    books: catalogue,
    sorts: { liked: 'added', listenLater: 'added', history: 'played' },
    ...input,
  });

const titles = (entries: { book: BookSummary }[]) => entries.map((e) => e.book.id);

describe('buildLibraryView — what each tab shows and counts', () => {
  it('counts only books the catalogue returned', () => {
    const result = view({
      likedAt: new Map([
        ['a', 1],
        ['gone', 2],
      ]),
      listenLaterAt: new Map([['unpublished', 3]]),
      history: [entry('c', 5), entry('deleted', 6)],
    });
    expect(result.liked).toHaveLength(1);
    expect(result.listenLater).toHaveLength(0);
    expect(result.history).toHaveLength(1);
    expect(titles(result.liked)).toEqual(['a']);
  });

  it('an empty library is three empty tabs', () => {
    const result = view();
    expect([result.liked, result.listenLater, result.history].map((tab) => tab.length)).toEqual([
      0, 0, 0,
    ]);
  });

  it('one book can be in several tabs', () => {
    const result = view({
      likedAt: new Map([['a', 1]]),
      listenLaterAt: new Map([['a', 2]]),
      history: [entry('a', 3)],
    });
    expect([result.liked, result.listenLater, result.history].map(titles)).toEqual([
      ['a'],
      ['a'],
      ['a'],
    ]);
  });

  it('History marks a finished book and keeps when it was played', () => {
    const [first, second] = view({ history: [entry('a', 9, 8), entry('b', 5)] }).history;
    expect(first).toMatchObject({ finished: true, at: 9 });
    expect(second).toMatchObject({ finished: false, at: 5 });
  });
});

describe('buildLibraryView — sorts', () => {
  const likedAt = new Map([
    ['a', 10],
    ['b', 30],
    ['c', 20],
    ['d', 5],
  ]);

  it('Recently added: newest first', () => {
    expect(titles(view({ likedAt }).liked)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('Title: Ukrainian alphabet, Cyrillic before Latin', () => {
    const sorted = view({
      likedAt,
      sorts: { liked: 'title', listenLater: 'added', history: 'played' },
    });
    // Захар, Лісова, Тіні — then Intermezzo
    expect(titles(sorted.liked)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('Author: by name, books without an author last, ties by newest', () => {
    const sorted = view({
      likedAt,
      sorts: { liked: 'author', listenLater: 'added', history: 'played' },
    });
    // Коцюбинський (b newer than a), Франко, no author
    expect(titles(sorted.liked)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('Recently played: most recent first', () => {
    const history = [entry('a', 1), entry('b', 3), entry('c', 2)];
    expect(titles(view({ history }).history)).toEqual(['b', 'c', 'a']);
  });

  it('a sort in one tab does not change another', () => {
    const result = view({
      likedAt,
      listenLaterAt: likedAt,
      sorts: { liked: 'title', listenLater: 'added', history: 'played' },
    });
    expect(titles(result.liked)).not.toEqual(titles(result.listenLater));
  });
});

describe('tab and sort in the URL', () => {
  it('reads a tab, falling back to the default', () => {
    expect(parseLibraryTab('liked')).toBe('liked');
    expect(parseLibraryTab('listenLater')).toBe('listenLater');
    expect(parseLibraryTab(['history', 'liked'])).toBe('history');
    expect(parseLibraryTab('nope')).toBe(DEFAULT_LIBRARY_TAB);
    expect(parseLibraryTab(undefined)).toBe(DEFAULT_LIBRARY_TAB);
  });

  it('only accepts sorts the tab offers', () => {
    expect(parseLibrarySort('history', 'played')).toBe('played');
    expect(parseLibrarySort('history', 'added')).toBe('played');
    expect(parseLibrarySort('liked', 'played')).toBe('added');
    expect(parseLibrarySort('liked', 'author')).toBe('author');
    expect(parseLibrarySort('liked', undefined)).toBe('added');
    expect(defaultSort('history')).toBe('played');
    expect(defaultSort('listenLater')).toBe('added');
  });

  it('builds links that leave defaults out', () => {
    expect(libraryHref(DEFAULT_LIBRARY_TAB, defaultSort(DEFAULT_LIBRARY_TAB))).toBe('/library');
    expect(libraryHref('liked', 'added')).toBe('/library?tab=liked');
    expect(libraryHref('liked', 'title')).toBe('/library?tab=liked&sort=title');
    expect(libraryHref(DEFAULT_LIBRARY_TAB, 'title')).toBe('/library?sort=title');
  });
});
