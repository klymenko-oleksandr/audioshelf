import { expect, test } from '@playwright/test';
import { TARGETS_DEPLOYMENT, removeE2eRecords, withE2eSql } from './fixtures/e2e-records';
import {
  THREE,
  completeBook,
  openNewDraft,
  parts,
  picker,
  publishButton,
  publishViaUi,
  ready,
  unpublishButton,
} from './fixtures/track-card';

test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);

const note = (page: import('@playwright/test').Page) => page.getByTestId('publish-note');
const bookRow = (id: string) =>
  withE2eSql(async (sql) => (await sql`select * from books where id = ${id}`)[0]!);

test.describe('publish and unpublish', () => {
  test('Publish stays blocked, and says what is missing, until the book is complete', async ({
    page,
  }) => {
    await openNewDraft(page, 'Publish rules');
    await expect(publishButton(page)).toBeDisabled();
    await expect(note(page)).toHaveText('Missing: author, category, narrator, a ready audio track');

    await picker(page).setInputFiles(THREE);
    await expect(ready(parts(page).first())).toBeVisible();
    await expect(note(page)).toHaveText('Missing: author, category, narrator');
    await expect(publishButton(page)).toBeDisabled();

    await completeBook(page);
    await expect(note(page)).toHaveCount(0);
    await expect(publishButton(page)).toBeEnabled();
  });

  test('typed but unsaved changes block Publish until they are saved', async ({ page }) => {
    await openNewDraft(page, 'Unsaved publish');
    await picker(page).setInputFiles(THREE);
    await expect(ready(parts(page).first())).toBeVisible();
    await completeBook(page);
    // Reload so the pickers show the saved author and narrator, not "+ New…" again.
    await page.reload();

    await page.getByLabel('Description', { exact: true }).fill('A change not saved yet');
    await expect(publishButton(page)).toBeDisabled();
    await expect(note(page)).toHaveText('Save your changes first.');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(publishButton(page)).toBeEnabled();
  });

  test('publishing makes the book visible to listeners; unpublishing hides it and keeps the first date', async ({
    page,
  }) => {
    const { id } = await openNewDraft(page, 'Goes live');
    await picker(page).setInputFiles(THREE);
    await expect(ready(parts(page).first())).toBeVisible();

    const slug = (await bookRow(id)).slug as string;
    expect((await page.request.get(`/book/${slug}`)).status()).toBe(404);

    await publishViaUi(page);
    const live = await bookRow(id);
    expect(live.status).toBe('published');
    expect(live.published_at).not.toBeNull();
    expect((await page.request.get(`/book/${slug}`)).status()).toBe(200);
    await expect(page.getByRole('link', { name: 'View in app' })).toBeVisible();

    await unpublishButton(page).click();
    await expect(publishButton(page)).toBeVisible();
    const draft = await bookRow(id);
    expect(draft.status).toBe('draft');
    expect(draft.published_at).toEqual(live.published_at);
    expect((await page.request.get(`/book/${slug}`)).status()).toBe(404);

    // Publishing again keeps the date of the first time.
    await publishButton(page).click();
    await expect(unpublishButton(page)).toBeVisible();
    expect((await bookRow(id)).published_at).toEqual(live.published_at);
  });

  test('the server refuses an incomplete book even when the button is forced on', async ({
    page,
  }) => {
    const { id } = await openNewDraft(page, 'Forced');
    await expect(publishButton(page)).toBeDisabled();
    await publishButton(page).evaluate((el: HTMLButtonElement) => {
      el.disabled = false;
    });
    await publishButton(page).click();
    await expect(note(page)).toHaveText('Missing: author, category, narrator, a ready audio track');
    expect((await bookRow(id)).status).toBe('draft');
  });

  test('a published book cannot lose its author, narrator or category', async ({ page }) => {
    const { id } = await openNewDraft(page, 'Keeps rules');
    await picker(page).setInputFiles(THREE);
    await expect(ready(parts(page).first())).toBeVisible();
    await publishViaUi(page);
    await page.reload();

    await page.getByLabel('Author', { exact: true }).selectOption({ label: 'No author yet' });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('A published book needs an author.')).toBeVisible();
    expect((await bookRow(id)).author_id).not.toBeNull();
  });
});
