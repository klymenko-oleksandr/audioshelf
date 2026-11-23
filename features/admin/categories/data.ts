import { asc, eq, like, max, sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { insertWithUniqueSlug, slugBase } from '../book-form/unique-slug';
import { isUuid } from '../book-form/values';
import type { AdminDb } from '../data/books';
import type { CategoryErrors, CategoryInput } from './values';

const { books, categories } = schema;

type Tx = Parameters<Parameters<AdminDb['transaction']>[0]>[0];

export interface AdminCategory {
  id: string;
  slug: string;
  nameUk: string;
  nameEn: string | null;
  position: number;
  /** Books listeners can see or that are drafts: everything not deleted. */
  liveBooks: number;
  /** Soft-deleted books still point at the category, so they count as using it. */
  deletedBooks: number;
  updatedAt: Date;
}

const collator = new Intl.Collator('uk');

/** Every category with its book counts, in the order listeners see them. */
export async function listAdminCategories(db: AdminDb): Promise<AdminCategory[]> {
  const [rows, counts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.position), asc(categories.slug)),
    db
      .select({
        categoryId: books.categoryId,
        live: sql<number>`count(*) filter (where ${books.deletedAt} is null)`.mapWith(Number),
        deleted: sql<number>`count(*) filter (where ${books.deletedAt} is not null)`.mapWith(
          Number,
        ),
      })
      .from(books)
      .groupBy(books.categoryId),
  ]);
  const byId = new Map(counts.map((c) => [c.categoryId, c]));
  return rows
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      nameUk: c.nameUk,
      nameEn: c.nameEn,
      position: c.position,
      liveBooks: byId.get(c.id)?.live ?? 0,
      deletedBooks: byId.get(c.id)?.deleted ?? 0,
      updatedAt: c.updatedAt,
    }))
    .sort((a, b) => a.position - b.position || collator.compare(a.slug, b.slug));
}

/** Names are compared without case and extra spacing. */
const nameKey = (name: string) =>
  name.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('uk');

const TAKEN = 'A category with this name already exists.';

/** Name clashes with any category except `exceptId`. */
async function nameErrors(
  tx: Tx,
  input: CategoryInput,
  exceptId: string | null,
): Promise<CategoryErrors> {
  const others = (await tx.select().from(categories)).filter((c) => c.id !== exceptId);
  const errors: CategoryErrors = {};
  if (others.some((c) => nameKey(c.nameUk) === nameKey(input.nameUk))) errors.nameUk = TAKEN;
  if (
    input.nameEn !== null &&
    others.some((c) => c.nameEn !== null && nameKey(c.nameEn) === nameKey(input.nameEn!))
  ) {
    errors.nameEn = TAKEN;
  }
  return errors;
}

export type SaveCategoryResult =
  | { ok: true; category: schema.Category }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid'; errors: CategoryErrors };

/**
 * A new category goes to the end. Its slug comes from the Ukrainian name, is unique, and never
 * changes afterwards (listener links `/category/:slug` keep working after a rename).
 */
export async function createCategory(
  db: AdminDb,
  input: CategoryInput,
): Promise<SaveCategoryResult> {
  return db.transaction(async (tx): Promise<SaveCategoryResult> => {
    const errors = await nameErrors(tx, input, null);
    if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

    const [{ top } = { top: null }] = await tx
      .select({ top: max(categories.position) })
      .from(categories);
    const position = (top ?? 0) + 1;
    const category = await insertWithUniqueSlug(
      slugBase(input.nameUk, 'category'),
      async (base) =>
        new Set(
          (
            await tx
              .select({ slug: categories.slug })
              .from(categories)
              .where(like(categories.slug, `${base}%`))
          ).map((r) => r.slug),
        ),
      async (slug) =>
        (
          await tx
            .insert(categories)
            .values({ slug, nameUk: input.nameUk, nameEn: input.nameEn, position })
            .onConflictDoNothing({ target: categories.slug })
            .returning()
        )[0],
    );
    return { ok: true, category };
  });
}

export async function renameCategory(
  db: AdminDb,
  id: string,
  input: CategoryInput,
): Promise<SaveCategoryResult> {
  if (!isUuid(id)) return { ok: false, reason: 'not_found' };
  return db.transaction(async (tx): Promise<SaveCategoryResult> => {
    const [existing] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id.toLowerCase()))
      .for('update');
    if (!existing) return { ok: false, reason: 'not_found' };

    const errors = await nameErrors(tx, input, existing.id);
    if (Object.keys(errors).length > 0) return { ok: false, reason: 'invalid', errors };

    const [category] = await tx
      .update(categories)
      .set({ nameUk: input.nameUk, nameEn: input.nameEn })
      .where(eq(categories.id, existing.id))
      .returning();
    return { ok: true, category: category! };
  });
}

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'in_use'; liveBooks: number; deletedBooks: number };

/**
 * Deletes a category only when no book uses it, deleted books included (they can be restored,
 * and `books.category_id` is `on delete restrict`, so the database refuses it as well).
 */
export async function deleteCategory(db: AdminDb, id: string): Promise<DeleteCategoryResult> {
  if (!isUuid(id)) return { ok: false, reason: 'not_found' };
  return db.transaction(async (tx): Promise<DeleteCategoryResult> => {
    const [existing] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id.toLowerCase()))
      .for('update');
    if (!existing) return { ok: false, reason: 'not_found' };

    const [use] = await tx
      .select({
        live: sql<number>`count(*) filter (where ${books.deletedAt} is null)`.mapWith(Number),
        deleted: sql<number>`count(*) filter (where ${books.deletedAt} is not null)`.mapWith(
          Number,
        ),
      })
      .from(books)
      .where(eq(books.categoryId, existing.id));
    if (use && use.live + use.deleted > 0) {
      return { ok: false, reason: 'in_use', liveBooks: use.live, deletedBooks: use.deleted };
    }
    await tx.delete(categories).where(eq(categories.id, existing.id));
    return { ok: true };
  });
}
