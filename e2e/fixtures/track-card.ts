import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { signInWithPasskey } from './admin';
import { E2E_PREFIX } from './e2e-records';

/** Helpers for the specs that work with the Audio tracks card on the edit page. */

export const AUDIO = path.join(__dirname, 'audio');
export const THREE = path.join(AUDIO, 'three-seconds.mp3');
export const TWO = path.join(AUDIO, 'two-seconds.mp3');

/** Digits only, so a name made from it can never contain "reject", "slow" or "vanish". */
export const RUN = String(Date.now());

let counter = 0;
export const bookTitle = (name: string) => `${E2E_PREFIX}${name} ${RUN}${counter++}`;

export const card = (page: Page) => page.getByRole('region', { name: 'Audio tracks' });
export const parts = (page: Page) =>
  card(page).getByRole('list', { name: 'Parts' }).getByRole('listitem');
export const chapters = (page: Page) =>
  card(page).getByRole('list', { name: 'Chapters' }).getByRole('listitem');
export const picker = (page: Page) => page.getByLabel('Audio files', { exact: true });
export const ready = (item: ReturnType<typeof parts>) => item.getByText('Ready', { exact: true });

export async function signIn(page: Page) {
  await signInWithPasskey(page);
  await expect(page).toHaveURL(/\/admin\/books$/);
}

/** Signs in, saves a new draft with only a title, and returns its id and title. */
export async function openNewDraft(page: Page, name = 'Parts') {
  await signIn(page);
  await page.goto('/admin/books/new');
  const title = bookTitle(name);
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/\/admin\/books\/[0-9a-f-]{36}\?created=1$/);
  await expect(card(page)).toBeVisible();
  const id = /\/admin\/books\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  return { id, title };
}

/** A small MP3 under another name (the name becomes the part's title and ends up in its key). */
export const named = (name: string, source = THREE) => ({
  name,
  mimeType: 'audio/mpeg',
  buffer: fs.readFileSync(source),
});

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

/**
 * Fills what a book needs besides audio (a new author, a new narrator, the Fiction category)
 * and saves. Needs a ready part already on the page, or Publish stays blocked.
 */
export async function completeBook(page: Page) {
  await field(page, 'Author').selectOption({ label: '+ New author…' });
  await field(page, 'New author’s name').fill(`${E2E_PREFIX}Author ${RUN}${counter++}`);
  await field(page, 'Narrator (read by)').selectOption({ label: '+ New narrator…' });
  await field(page, 'New narrator’s name').fill(`${E2E_PREFIX}Narrator ${RUN}${counter++}`);
  await field(page, 'Category').selectOption({ label: 'Fiction' });
  await page.getByRole('button', { name: /^Save (draft|changes)$/ }).click();
  await expect(page.getByText(/^Saved at /)).toBeVisible();
}

export const publishButton = (page: Page) =>
  page.getByRole('button', { name: 'Publish', exact: true });
export const unpublishButton = (page: Page) =>
  page.getByRole('button', { name: 'Unpublish', exact: true });

/** The whole way to a live book, through the UI: fill, save, press Publish. */
export async function publishViaUi(page: Page) {
  await completeBook(page);
  await publishButton(page).click();
  await expect(unpublishButton(page)).toBeVisible();
}
