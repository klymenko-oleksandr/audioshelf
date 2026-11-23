export const NAME_MAX = 80;

export type CategoryField = 'nameUk' | 'nameEn';
export type CategoryErrors = Partial<Record<CategoryField, string>>;

export interface CategoryInput {
  nameUk: string;
  /** Optional: listeners in English see the Ukrainian name when it is empty. */
  nameEn: string | null;
}

export type ParseCategoryResult =
  { ok: true; value: CategoryInput } | { ok: false; errors: CategoryErrors };

const tidy = (text: string | undefined) =>
  (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

/** What a category save accepts: `name_uk` required, `name_en` optional (canvas: AdminCategories). */
export function parseCategoryForm(raw: { nameUk?: string; nameEn?: string }): ParseCategoryResult {
  const nameUk = tidy(raw.nameUk);
  const nameEn = tidy(raw.nameEn);
  const errors: CategoryErrors = {};
  if (nameUk === '') errors.nameUk = 'Enter the name in Ukrainian.';
  else if (nameUk.length > NAME_MAX) errors.nameUk = `Keep it to ${NAME_MAX} characters or fewer.`;
  if (nameEn.length > NAME_MAX) errors.nameEn = `Keep it to ${NAME_MAX} characters or fewer.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { nameUk, nameEn: nameEn === '' ? null : nameEn } };
}

const books = (n: number) => `${n} ${n === 1 ? 'book' : 'books'}`;
const deleted = (n: number) => `${n} deleted ${n === 1 ? 'book' : 'books'}`;

/**
 * Why a category cannot be deleted, or null when it can. A deleted book still points at its
 * category (it can be restored), so it counts as using it.
 */
export function categoryDeleteBlock(use: {
  liveBooks: number;
  deletedBooks: number;
}): string | null {
  const { liveBooks, deletedBooks } = use;
  if (liveBooks === 0 && deletedBooks === 0) return null;
  if (liveBooks === 0) return `Used by ${deleted(deletedBooks)} that can still be restored.`;
  const used =
    deletedBooks > 0 ? `${books(liveBooks)} and ${deleted(deletedBooks)}` : books(liveBooks);
  return `Used by ${used}. Move ${liveBooks === 1 && deletedBooks === 0 ? 'it' : 'them'} to another category first.`;
}
