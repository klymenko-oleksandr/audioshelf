'use server';

import type { CategoryActionResult } from '@/features/admin/categories/action-types';
import {
  createCategory,
  deleteCategory,
  listAdminCategories,
  renameCategory,
  type SaveCategoryResult,
} from '@/features/admin/categories/data';
import { categoryDeleteBlock, parseCategoryForm } from '@/features/admin/categories/values';
import { revalidateCatalogue } from '@/features/admin/revalidate';
import { getAdminSession } from '@/lib/auth/admin/guard';
import { getDb } from '@/lib/db';

// Server actions are public POST endpoints: every one checks the session itself.
const SESSION_ENDED: CategoryActionResult = {
  ok: false,
  message: 'Your admin session has ended. Sign in again, then try again.',
};
const GENERIC_MESSAGE = 'Something went wrong. Nothing was changed. Try again in a moment.';
const GENERIC: CategoryActionResult = { ok: false, message: GENERIC_MESSAGE };
const GONE: CategoryActionResult = {
  ok: false,
  message: 'This category no longer exists. Reload the page.',
};

type Raw = { nameUk: string; nameEn: string };

/** After a change: refresh what listeners see, then hand back the fresh list. */
async function changed(): Promise<CategoryActionResult> {
  revalidateCatalogue();
  return { ok: true, categories: await listAdminCategories(getDb()) };
}

async function save(
  run: (value: { nameUk: string; nameEn: string | null }) => Promise<SaveCategoryResult>,
  raw: Raw,
): Promise<CategoryActionResult> {
  const parsed = parseCategoryForm(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const result = await run(parsed.value);
  if (result.ok) return changed();
  return result.reason === 'not_found' ? GONE : { ok: false, errors: result.errors };
}

export async function createCategoryAction(raw: Raw): Promise<CategoryActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    return await save((value) => createCategory(getDb(), value), raw);
  } catch (error) {
    console.error('Creating a category failed', error);
    return GENERIC;
  }
}

/** Rename keeps the slug, so listener links stay valid. */
export async function renameCategoryAction(id: string, raw: Raw): Promise<CategoryActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    return await save((value) => renameCategory(getDb(), id, value), raw);
  } catch (error) {
    console.error('Renaming a category failed', error);
    return GENERIC;
  }
}

/** Only when no book uses it (deleted books included). */
export async function deleteCategoryAction(id: string): Promise<CategoryActionResult> {
  if (!(await getAdminSession())) return SESSION_ENDED;
  try {
    const result = await deleteCategory(getDb(), id);
    if (result.ok) return await changed();
    if (result.reason === 'not_found') return GONE;
    return { ok: false, message: categoryDeleteBlock(result) ?? GENERIC_MESSAGE };
  } catch (error) {
    console.error('Deleting a category failed', error);
    return GENERIC;
  }
}
