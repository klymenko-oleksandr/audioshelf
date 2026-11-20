import { and, asc, eq, isNull, like } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { insertWithUniqueSlug, slugBase } from '../book-form/unique-slug';
import {
  isUuid,
  type BookFormInput,
  type BookLanguage,
  type FieldErrors,
} from '../book-form/values';
import type { AdminDb } from './books';

const { books, authors, narrators, categories } = schema;

const collator = new Intl.Collator('uk');

export interface BookFormOptions {
  /** Authors carry their bio so choosing one can fill the bio field. */
  authors: { id: string; name: string; bio: string }[];
  narrators: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

/** What the pickers offer. Small tables, read whole; sorted in code so the order is Ukrainian. */
export async function getBookFormOptions(db: AdminDb): Promise<BookFormOptions> {
  const [authorRows, narratorRows, categoryRows] = await Promise.all([
    db.select({ id: authors.id, name: authors.name, bio: authors.bio }).from(authors),
    db.select({ id: narrators.id, name: narrators.name }).from(narrators),
    db
      .select({ id: categories.id, nameUk: categories.nameUk, nameEn: categories.nameEn })
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.slug)),
  ]);
  const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name);
  return {
    authors: authorRows.map((a) => ({ id: a.id, name: a.name, bio: a.bio ?? '' })).sort(byName),
    narrators: [...narratorRows].sort(byName),
    categories: categoryRows.map((c) => ({ id: c.id, name: c.nameEn ?? c.nameUk })),
  };
}

export interface BookEditData {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  language: BookLanguage;
  ongoing: boolean;
  status: schema.Book['status'];
  authorId: string | null;
  narratorId: string | null;
  categoryId: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

/** A book for the edit form, or null when it does not exist, is deleted, or the id is malformed. */
export async function getBookForEdit(db: AdminDb, id: string): Promise<BookEditData | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({
      id: books.id,
      slug: books.slug,
      title: books.title,
      description: books.description,
      language: books.language,
      ongoing: books.ongoing,
      status: books.status,
      authorId: books.authorId,
      narratorId: books.narratorId,
      categoryId: books.categoryId,
      publishedAt: books.publishedAt,
      updatedAt: books.updatedAt,
    })
    .from(books)
    .where(and(eq(books.id, id.toLowerCase()), isNull(books.deletedAt)))
    .limit(1);
  return row ? { ...row, language: row.language === 'en' ? 'en' : 'uk' } : null;
}

export type SaveBookResult =
  | { ok: true; id: string; slug: string; updatedAt: Date }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid'; errors: FieldErrors };

/** Names are compared without case and extra spacing, so "леся  УКРАЇНКА" is "Леся Українка". */
const nameKey = (name: string) =>
  name.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('uk');

type Tx = Parameters<Parameters<AdminDb['transaction']>[0]>[0];

async function takenSlugs(tx: Tx, column: PgColumn, base: string): Promise<ReadonlySet<string>> {
  const rows = await tx
    .select({ slug: column })
    .from(column.table as typeof books)
    .where(like(column, `${base}%`));
  return new Set(rows.map((r) => String(r.slug)));
}

/**
 * Creates (`bookId` null) or updates a book from the validated form, all or nothing: authors
 * and narrators made on the way are rolled back when anything else is refused.
 *
 * - A new book is always a draft; editing never changes the status or the publish date
 *   (publishing is 4d).
 * - The slug is made from the title when the book is created and never changes afterwards, so
 *   links and share previews keep working after a rename.
 * - A new author or narrator whose name already exists is refused instead of silently reused.
 * - Choosing an existing author also saves the bio from the form on that author.
 * - Covers are not touched here (the app shows the designed covers; images come later).
 */
export async function saveBook(
  db: AdminDb,
  bookId: string | null,
  input: BookFormInput,
): Promise<SaveBookResult> {
  return db.transaction(async (tx): Promise<SaveBookResult> => {
    if (bookId !== null) {
      if (!isUuid(bookId)) return { ok: false, reason: 'not_found' };
      // Lock the row so a second save of the same book waits instead of interleaving.
      const [existing] = await tx
        .select({ id: books.id })
        .from(books)
        .where(and(eq(books.id, bookId.toLowerCase()), isNull(books.deletedAt)))
        .for('update');
      if (!existing) return { ok: false, reason: 'not_found' };
    }

    // 1. Check every reference before writing anything.
    const errors: FieldErrors = {};

    let authorId: string | null = null;
    let authorBioChange: { id: string; bio: string | null } | null = null;
    if (input.author.kind === 'existing') {
      const [row] = await tx
        .select({ id: authors.id, bio: authors.bio })
        .from(authors)
        .where(eq(authors.id, input.author.id));
      if (!row) errors.author = 'This author no longer exists. Pick another.';
      else {
        authorId = row.id;
        if ((row.bio ?? null) !== input.authorBio) {
          authorBioChange = { id: row.id, bio: input.authorBio };
        }
      }
    } else if (input.author.kind === 'new') {
      const key = nameKey(input.author.name);
      const names = await tx.select({ name: authors.name }).from(authors);
      if (names.some((a) => nameKey(a.name) === key)) {
        errors.newAuthorName = 'An author with this name already exists. Pick them from the list.';
      }
    }

    let narratorId: string | null = null;
    if (input.narrator.kind === 'existing') {
      const [row] = await tx
        .select({ id: narrators.id })
        .from(narrators)
        .where(eq(narrators.id, input.narrator.id));
      if (!row) errors.narrator = 'This narrator no longer exists. Pick another.';
      else narratorId = row.id;
    } else if (input.narrator.kind === 'new') {
      const key = nameKey(input.narrator.name);
      const names = await tx.select({ name: narrators.name }).from(narrators);
      if (names.some((n) => nameKey(n.name) === key)) {
        errors.newNarratorName =
          'A narrator with this name already exists. Pick them from the list.';
      }
    }

    if (input.categoryId !== null) {
      const [row] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, input.categoryId));
      if (!row) errors.category = 'This category no longer exists. Pick another.';
    }

    if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

    // 2. Write.
    if (input.author.kind === 'new') {
      const name = input.author.name;
      const created = await insertWithUniqueSlug(
        slugBase(name, 'author'),
        (base) => takenSlugs(tx, authors.slug, base),
        async (slug) =>
          (
            await tx
              .insert(authors)
              .values({ slug, name, bio: input.authorBio })
              .onConflictDoNothing({ target: authors.slug })
              .returning({ id: authors.id })
          )[0],
      );
      authorId = created.id;
    }
    if (authorBioChange) {
      await tx
        .update(authors)
        .set({ bio: authorBioChange.bio })
        .where(eq(authors.id, authorBioChange.id));
    }
    if (input.narrator.kind === 'new') {
      const name = input.narrator.name;
      const created = await insertWithUniqueSlug(
        slugBase(name, 'narrator'),
        (base) => takenSlugs(tx, narrators.slug, base),
        async (slug) =>
          (
            await tx
              .insert(narrators)
              .values({ slug, name })
              .onConflictDoNothing({ target: narrators.slug })
              .returning({ id: narrators.id })
          )[0],
      );
      narratorId = created.id;
    }

    const fields = {
      title: input.title,
      description: input.description,
      language: input.language,
      ongoing: input.ongoing,
      authorId,
      narratorId,
      categoryId: input.categoryId,
    };

    if (bookId === null) {
      const created = await insertWithUniqueSlug(
        slugBase(input.title, 'book'),
        (base) => takenSlugs(tx, books.slug, base),
        async (slug) =>
          (
            await tx
              .insert(books)
              .values({ ...fields, slug })
              .onConflictDoNothing({ target: books.slug })
              .returning({ id: books.id, slug: books.slug, updatedAt: books.updatedAt })
          )[0],
      );
      return { ok: true, ...created };
    }

    const [updated] = await tx
      .update(books)
      .set(fields)
      .where(eq(books.id, bookId.toLowerCase()))
      .returning({ id: books.id, slug: books.slug, updatedAt: books.updatedAt });
    return { ok: true, ...updated! };
  });
}
