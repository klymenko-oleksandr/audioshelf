// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { createTestDb } from '@/tests/test-db';
import { NEW_CHOICE, parseBookForm, type BookFormInput } from '../book-form/values';
import { getBookForEdit, getBookFormOptions, saveBook } from './book-form';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let t: TestDb;
let fiction: { id: string };
let poetry: { id: string };

/** Goes through the same parser as the form, so these tests also cover its output shape. */
function input(raw: Record<string, string>): BookFormInput {
  const parsed = parseBookForm(raw);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.value;
}

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

beforeEach(async () => {
  const { db } = t;
  await db.delete(schema.books);
  await db.delete(schema.authors);
  await db.delete(schema.narrators);
  await db.delete(schema.categories);
  [fiction, poetry] = (await db
    .insert(schema.categories)
    .values([
      { slug: 'fiction', nameUk: 'Художня', nameEn: 'Fiction', position: 2 },
      { slug: 'poetry', nameUk: 'Поезія', position: 1 },
    ])
    .returning({ id: schema.categories.id })) as [{ id: string }, { id: string }];
});

const bookRow = async (id: string) =>
  (await t.db.select().from(schema.books).where(eq(schema.books.id, id)))[0]!;
const count = async (
  table: typeof schema.books | typeof schema.authors | typeof schema.narrators,
) => (await t.db.select().from(table)).length;

async function create(raw: Record<string, string>) {
  const result = await saveBook(t.db, null, input(raw));
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}

describe('saveBook: creating a draft', () => {
  it('saves a draft from a title alone, with every optional field empty', async () => {
    const { id, slug } = await create({ title: 'Сіддхартха' });
    expect(slug).toBe('siddkhartkha');
    const book = await bookRow(id);
    expect(book).toMatchObject({
      title: 'Сіддхартха',
      status: 'draft',
      description: null,
      language: 'uk',
      ongoing: false,
      authorId: null,
      narratorId: null,
      categoryId: null,
      coverLargeKey: null,
      coverMediumKey: null,
      coverSmallKey: null,
      publishedAt: null,
    });
  });

  it('stores every field of a full form', async () => {
    const { id } = await create({
      title: 'The Hound of the Baskervilles',
      description: 'A spectral hound.',
      language: 'en',
      ongoing: 'on',
      category: fiction.id,
      author: NEW_CHOICE,
      newAuthorName: 'Arthur Conan Doyle',
      authorBio: 'Scottish writer.',
      narrator: NEW_CHOICE,
      newNarratorName: 'David Clarke',
    });
    const book = await bookRow(id);
    expect(book).toMatchObject({
      slug: 'the-hound-of-the-baskervilles',
      description: 'A spectral hound.',
      language: 'en',
      ongoing: true,
      categoryId: fiction.id,
    });
    const [author] = await t.db.select().from(schema.authors);
    const [narrator] = await t.db.select().from(schema.narrators);
    expect(author).toMatchObject({
      name: 'Arthur Conan Doyle',
      slug: 'arthur-conan-doyle',
      bio: 'Scottish writer.',
    });
    expect(narrator).toMatchObject({ name: 'David Clarke', slug: 'david-clarke' });
    expect(book.authorId).toBe(author!.id);
    expect(book.narratorId).toBe(narrator!.id);
  });

  it('keeps slugs unique: the same title three times gives -2 and -3', async () => {
    const slugs = [];
    for (let i = 0; i < 3; i++) slugs.push((await create({ title: 'Dracula' })).slug);
    expect(slugs).toEqual(['dracula', 'dracula-2', 'dracula-3']);
  });

  it('uses a fallback slug for a title with nothing to transliterate', async () => {
    expect((await create({ title: '日本語' })).slug).toBe('book');
    expect((await create({ title: '日本語' })).slug).toBe('book-2');
  });

  it('gives two authors whose names share a slug different slugs', async () => {
    await create({ title: 'A', author: NEW_CHOICE, newAuthorName: 'Іван Франко' });
    await create({ title: 'B', author: NEW_CHOICE, newAuthorName: 'Ivan Franko' });
    const slugs = (await t.db.select().from(schema.authors)).map((a) => a.slug).sort();
    expect(slugs).toEqual(['ivan-franko', 'ivan-franko-2']);
  });

  it('picks an existing author and narrator without creating new ones', async () => {
    const [author] = await t.db
      .insert(schema.authors)
      .values({ slug: 'lesia', name: 'Леся Українка' })
      .returning();
    const [narrator] = await t.db
      .insert(schema.narrators)
      .values({ slug: 'ostap', name: 'Остап' })
      .returning();
    const { id } = await create({
      title: 'Лісова пісня',
      author: author!.id,
      narrator: narrator!.id,
    });
    expect(await bookRow(id)).toMatchObject({ authorId: author!.id, narratorId: narrator!.id });
    expect(await count(schema.authors)).toBe(1);
    expect(await count(schema.narrators)).toBe(1);
  });
});

describe('saveBook: refusing bad references, all or nothing', () => {
  it('rejects a new author whose name already exists (ignoring case and spacing)', async () => {
    await create({ title: 'A', author: NEW_CHOICE, newAuthorName: 'Леся Українка' });
    const result = await saveBook(
      t.db,
      null,
      input({ title: 'B', author: NEW_CHOICE, newAuthorName: '  леся   УКРАЇНКА ' }),
    );
    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      errors: {
        newAuthorName: 'An author with this name already exists. Pick them from the list.',
      },
    });
    expect(await count(schema.books)).toBe(1);
    expect(await count(schema.authors)).toBe(1);
  });

  it('rejects a new narrator whose name already exists', async () => {
    await create({ title: 'A', narrator: NEW_CHOICE, newNarratorName: 'David Clarke' });
    const result = await saveBook(
      t.db,
      null,
      input({ title: 'B', narrator: NEW_CHOICE, newNarratorName: 'david clarke' }),
    );
    expect(result).toMatchObject({
      ok: false,
      errors: { newNarratorName: expect.stringContaining('already exists') },
    });
  });

  it('rejects an author, narrator or category that no longer exists', async () => {
    const gone = '11111111-1111-4111-8111-111111111111';
    const result = await saveBook(
      t.db,
      null,
      input({ title: 'A', author: gone, narrator: gone, category: gone }),
    );
    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      errors: {
        author: 'This author no longer exists. Pick another.',
        narrator: 'This narrator no longer exists. Pick another.',
        category: 'This category no longer exists. Pick another.',
      },
    });
  });

  it('saves nothing when one field is bad: no book and no half-created author', async () => {
    const result = await saveBook(
      t.db,
      null,
      input({
        title: 'A',
        author: NEW_CHOICE,
        newAuthorName: 'Fresh Author',
        category: '11111111-1111-4111-8111-111111111111',
      }),
    );
    expect(result.ok).toBe(false);
    expect(await count(schema.books)).toBe(0);
    expect(await count(schema.authors)).toBe(0);
  });
});

describe('saveBook: editing', () => {
  it('updates the fields but keeps the slug, so links and shared URLs keep working', async () => {
    const { id, slug } = await create({ title: 'Old title', category: fiction.id });
    const result = await saveBook(
      t.db,
      id,
      input({
        title: 'A completely new title',
        category: poetry.id,
        language: 'en',
        ongoing: 'on',
      }),
    );
    expect(result).toMatchObject({ ok: true, id, slug });
    expect(await bookRow(id)).toMatchObject({
      title: 'A completely new title',
      slug,
      categoryId: poetry.id,
      language: 'en',
      ongoing: true,
    });
  });

  it('clears author, narrator, category and description when they are emptied', async () => {
    const { id } = await create({
      title: 'T',
      description: 'Text',
      category: fiction.id,
      author: NEW_CHOICE,
      newAuthorName: 'Someone',
      narrator: NEW_CHOICE,
      newNarratorName: 'Reader',
    });
    await saveBook(t.db, id, input({ title: 'T' }));
    expect(await bookRow(id)).toMatchObject({
      description: null,
      categoryId: null,
      authorId: null,
      narratorId: null,
    });
    // Authors and narrators are shared records: unlinking never deletes them.
    expect(await count(schema.authors)).toBe(1);
    expect(await count(schema.narrators)).toBe(1);
  });

  it('does not touch the status or publish date of a published book', async () => {
    const publishedAt = new Date('2026-11-01T10:00:00Z');
    const [book] = await t.db
      .insert(schema.books)
      .values({ slug: 'live', title: 'Live', status: 'published', publishedAt })
      .returning();
    await saveBook(t.db, book!.id, input({ title: 'Live, renamed' }));
    const after = await bookRow(book!.id);
    expect(after.status).toBe('published');
    expect(after.publishedAt).toEqual(publishedAt);
  });

  it('updates the bio of the chosen author, and an empty bio clears it', async () => {
    const [author] = await t.db
      .insert(schema.authors)
      .values({ slug: 'a', name: 'A', bio: 'Old bio' })
      .returning();
    const { id } = await create({ title: 'T', author: author!.id, authorBio: 'New bio' });
    const read = async () =>
      (await t.db.select().from(schema.authors).where(eq(schema.authors.id, author!.id)))[0]!.bio;
    expect(await read()).toBe('New bio');
    await saveBook(t.db, id, input({ title: 'T', author: author!.id, authorBio: '' }));
    expect(await read()).toBeNull();
  });

  it('returns not_found for an unknown or soft-deleted book', async () => {
    const unknown = await saveBook(
      t.db,
      '22222222-2222-4222-8222-222222222222',
      input({ title: 'T' }),
    );
    expect(unknown).toEqual({ ok: false, reason: 'not_found' });

    const { id } = await create({ title: 'To delete' });
    await t.db.update(schema.books).set({ deletedAt: new Date() }).where(eq(schema.books.id, id));
    expect(await saveBook(t.db, id, input({ title: 'Edited' }))).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect((await bookRow(id)).title).toBe('To delete');
  });
});

describe('saveBook: a live book keeps the publish rules', () => {
  const full = (extra: Record<string, string> = {}) => ({
    title: 'Live',
    author: NEW_CHOICE,
    newAuthorName: 'A. Writer',
    narrator: NEW_CHOICE,
    newNarratorName: 'N. Reader',
    category: fiction.id,
    ...extra,
  });

  async function live(status: 'published' | 'scheduled' = 'published') {
    const { id } = await create(full());
    await t.db.update(schema.books).set({ status }).where(eq(schema.books.id, id));
    return id;
  }

  it('refuses to remove the author, narrator or category from a published book', async () => {
    const id = await live();
    const result = await saveBook(t.db, id, input({ title: 'Live' }));
    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      errors: {
        author: 'A published book needs an author.',
        narrator: 'A published book needs a narrator.',
        category: 'A published book needs a category.',
      },
    });
    const book = await bookRow(id);
    expect(book.authorId).not.toBeNull();
    expect(book.narratorId).not.toBeNull();
    expect(book.categoryId).not.toBeNull();
  });

  it('applies to a scheduled book too', async () => {
    const id = await live('scheduled');
    expect(await saveBook(t.db, id, input({ title: 'Live' }))).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });

  it('lets a published book change its author, narrator and category', async () => {
    const id = await live();
    const { narratorId } = await bookRow(id);
    const result = await saveBook(
      t.db,
      id,
      input(
        full({
          newAuthorName: 'Someone Else',
          narrator: narratorId!,
          category: poetry.id,
        }),
      ),
    );
    expect(result).toMatchObject({ ok: true });
    expect((await bookRow(id)).categoryId).toBe(poetry.id);
  });

  it('still saves an incomplete draft', async () => {
    const { id } = await create({ title: 'Draft' });
    expect(await saveBook(t.db, id, input({ title: 'Draft 2' }))).toMatchObject({ ok: true });
  });
});

describe('saveBook: under an exact slug (the import)', () => {
  it('creates the book with exactly that slug, not one made from the title', async () => {
    const result = await saveBook(t.db, null, input({ title: 'Сіддхартха' }), {
      slug: 'hesse-siddhartha',
    });
    expect(result).toMatchObject({ ok: true, slug: 'hesse-siddhartha' });
    expect(await count(schema.books)).toBe(1);
  });

  it('answers slug_taken instead of adding -2, and rolls back the author made on the way', async () => {
    await t.db.insert(schema.books).values({ slug: 'hesse-siddhartha', title: 'Other' });
    const result = await saveBook(
      t.db,
      null,
      input({ title: 'Сіддхартха', author: NEW_CHOICE, newAuthorName: 'Герман Гессе' }),
      { slug: 'hesse-siddhartha' },
    );
    expect(result).toEqual({ ok: false, reason: 'slug_taken' });
    expect(await count(schema.books)).toBe(1);
    expect(await count(schema.authors)).toBe(0);
  });

  it('still reports field errors the usual way', async () => {
    const result = await saveBook(
      t.db,
      null,
      { ...input({ title: 'T' }), categoryId: '00000000-0000-4000-8000-000000000000' },
      { slug: 'a-slug' },
    );
    expect(result).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await count(schema.books)).toBe(0);
  });
});

describe('getBookForEdit', () => {
  it('returns the fields the form needs', async () => {
    const { id, slug } = await create({
      title: 'T',
      description: 'D',
      language: 'en',
      category: poetry.id,
      author: NEW_CHOICE,
      newAuthorName: 'Someone',
    });
    expect(await getBookForEdit(t.db, id)).toMatchObject({
      id,
      slug,
      title: 'T',
      description: 'D',
      language: 'en',
      ongoing: false,
      status: 'draft',
      categoryId: poetry.id,
      narratorId: null,
    });
  });

  it('is null for a missing, deleted or malformed id', async () => {
    const { id } = await create({ title: 'T' });
    await t.db.update(schema.books).set({ deletedAt: new Date() }).where(eq(schema.books.id, id));
    expect(await getBookForEdit(t.db, id)).toBeNull();
    expect(await getBookForEdit(t.db, '33333333-3333-4333-8333-333333333333')).toBeNull();
    expect(await getBookForEdit(t.db, 'not-a-uuid')).toBeNull();
  });
});

describe('getBookFormOptions', () => {
  it('lists authors and narrators A–Z with Ukrainian rules, categories in their set order', async () => {
    await t.db.insert(schema.authors).values([
      { slug: 'z', name: 'Шевченко' },
      { slug: 'a', name: 'Андрущенко', bio: 'Bio' },
      { slug: 'i', name: 'Іваненко' },
    ]);
    await t.db.insert(schema.narrators).values({ slug: 'n', name: 'Narrator' });
    const options = await getBookFormOptions(t.db);
    expect(options.authors.map((a) => a.name)).toEqual(['Андрущенко', 'Іваненко', 'Шевченко']);
    expect(options.authors[0]).toMatchObject({ bio: 'Bio' });
    expect(options.authors[1]).toMatchObject({ bio: '' });
    expect(options.narrators.map((n) => n.name)).toEqual(['Narrator']);
    // English name when there is one, Ukrainian otherwise; ordered by position.
    expect(options.categories.map((c) => c.name)).toEqual(['Поезія', 'Fiction']);
  });
});
