// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { parseBooksQuery } from '../list-state';
import { getAdminBooks } from './books';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;
const ids: Record<string, string> = {};

const query = (raw: Record<string, string> = {}) => parseBooksQuery(raw);
const titles = async (raw: Record<string, string> = {}) =>
  (await getAdminBooks(t.db, query(raw))).rows.map((r) => r.title);

beforeAll(async () => {
  t = await createTestDb();
  const { db } = t;
  const [fiction, poetry] = await db
    .insert(schema.categories)
    .values([
      { slug: 'fiction', nameUk: 'Художня', nameEn: 'Fiction', position: 1 },
      { slug: 'poetry', nameUk: 'Поезія', position: 2 },
    ])
    .returning();
  const [author] = await db
    .insert(schema.authors)
    .values({ slug: 'a', name: 'Леся Українка' })
    .returning();
  const [narrator] = await db
    .insert(schema.narrators)
    .values({ slug: 'n', name: 'Остап Читець' })
    .returning();

  const add = async (
    slug: string,
    title: string,
    values: Partial<typeof schema.books.$inferInsert>,
    trackStatuses: Array<'ready' | 'failed' | 'uploading'> = ['ready'],
  ) => {
    const [book] = await db
      .insert(schema.books)
      .values({
        slug,
        title,
        authorId: author!.id,
        categoryId: fiction!.id,
        coverLargeKey: 'books/x/cover/a-1000.webp',
        durationSeconds: 3600,
        ...values,
      })
      .returning();
    ids[slug] = book!.id;
    for (const [i, status] of trackStatuses.entries()) {
      await db.insert(schema.tracks).values({
        bookId: book!.id,
        position: i + 1,
        r2Key: `books/${slug}/audio/${i + 1}.mp3`,
        status,
        durationSeconds: 1800,
      });
    }
  };

  await add('alpha', 'Алфавіт', {
    status: 'published',
    publishedAt: new Date('2026-06-01T00:00:00Z'),
    narratorId: narrator!.id,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
  });
  await add('beta', 'Бета', {
    status: 'published',
    publishedAt: new Date('2026-07-01T00:00:00Z'),
    categoryId: poetry!.id,
    updatedAt: new Date('2026-11-03T00:00:00Z'),
  });
  // Published but without a cover: needs attention.
  await add('gamma', 'Гамма', {
    status: 'published',
    coverLargeKey: null,
    updatedAt: new Date('2026-11-02T00:00:00Z'),
  });
  // A draft with a failed track: needs attention.
  await add('delta', 'Дельта', { status: 'draft', updatedAt: new Date('2026-11-04T00:00:00Z') }, [
    'ready',
    'failed',
  ]);
  // An unfinished draft: fine.
  await add(
    'epsilon',
    'Епсилон',
    {
      status: 'draft',
      authorId: null,
      categoryId: null,
      coverLargeKey: null,
      durationSeconds: 0,
      updatedAt: new Date('2026-11-05T00:00:00Z'),
    },
    [],
  );
  await add('zeta', 'Дзета', {
    status: 'scheduled',
    publishAt: new Date('2026-12-01T09:00:00Z'),
    updatedAt: new Date('2026-11-06T00:00:00Z'),
  });
  await add('eta', 'Ета', {
    status: 'scheduled',
    publishAt: new Date('2026-11-25T09:00:00Z'),
    updatedAt: new Date('2026-11-07T00:00:00Z'),
  });
  // Soft-deleted: never listed or counted.
  await add('theta', 'Тета', {
    status: 'published',
    deletedAt: new Date('2026-11-08T00:00:00Z'),
  });
});

afterAll(async () => {
  await t.close();
});

describe('getAdminBooks', () => {
  it('lists every live book, most recently updated first, without deleted ones', async () => {
    expect(await titles()).toEqual([
      'Ета',
      'Дзета',
      'Епсилон',
      'Дельта',
      'Бета',
      'Гамма',
      'Алфавіт',
    ]);
  });

  it('counts the tabs', async () => {
    const { counts } = await getAdminBooks(t.db, query());
    expect(counts).toEqual({ all: 7, published: 3, scheduled: 2, draft: 2, attention: 2 });
  });

  it('filters by tab', async () => {
    expect(await titles({ tab: 'published' })).toEqual(['Бета', 'Гамма', 'Алфавіт']);
    expect(await titles({ tab: 'scheduled' })).toEqual(['Ета', 'Дзета']);
    expect(await titles({ tab: 'draft' })).toEqual(['Епсилон', 'Дельта']);
    expect(await titles({ tab: 'attention' })).toEqual(['Дельта', 'Гамма']);
  });

  it('explains why a book needs attention', async () => {
    const { rows } = await getAdminBooks(t.db, query({ tab: 'attention' }));
    expect(rows.map((r) => [r.title, r.attention])).toEqual([
      ['Дельта', [{ kind: 'failed-track', positions: [2] }]],
      ['Гамма', [{ kind: 'missing', field: 'cover' }]],
    ]);
  });

  it('searches title, author and narrator, ignoring case and accents', async () => {
    expect(await titles({ q: 'АЛФАВІТ' })).toEqual(['Алфавіт']);
    expect(await titles({ q: 'леся' })).toHaveLength(6); // every book with that author
    expect(await titles({ q: 'остап' })).toEqual(['Алфавіт']);
    expect(await titles({ q: 'немає такої' })).toEqual([]);
  });

  it('filters by category', async () => {
    expect(await titles({ category: 'poetry' })).toEqual(['Бета']);
  });

  it('shows the tab counts for the current search and category', async () => {
    const { counts } = await getAdminBooks(t.db, query({ category: 'fiction' }));
    expect(counts).toEqual({ all: 5, published: 2, scheduled: 2, draft: 1, attention: 2 });
  });

  it('sorts by title with Ukrainian rules', async () => {
    expect(await titles({ sort: 'title' })).toEqual([
      'Алфавіт',
      'Бета',
      'Гамма',
      'Дельта',
      'Дзета',
      'Епсилон',
      'Ета',
    ]);
  });

  it('sums the figures at the top, ignoring search and tab', async () => {
    const { totals } = await getAdminBooks(t.db, query({ tab: 'draft', q: 'бета' }));
    expect(totals).toMatchObject({
      books: 7,
      published: 3,
      scheduled: 2,
      drafts: 2,
      attention: 2,
      nextScheduledAt: new Date('2026-11-25T09:00:00Z'),
    });
    // 6 books of 3600 s (the unfinished draft has none).
    expect(totals.seconds).toBe(6 * 3600);
  });

  it('offers every category for the filter, in order, in English where there is a name', async () => {
    const { categories } = await getAdminBooks(t.db, query());
    expect(categories).toEqual([
      { slug: 'fiction', name: 'Fiction' },
      { slug: 'poetry', name: 'Поезія' },
    ]);
  });

  it('describes a row with its people, category, tracks and dates', async () => {
    const { rows } = await getAdminBooks(t.db, query({ q: 'алфавіт' }));
    expect(rows[0]).toMatchObject({
      id: ids.alpha,
      slug: 'alpha',
      status: 'published',
      author: 'Леся Українка',
      narrator: 'Остап Читець',
      categoryName: 'Fiction',
      trackCount: 1,
      durationSeconds: 3600,
      publishedAt: new Date('2026-06-01T00:00:00Z'),
      attention: [],
    });
  });
});
