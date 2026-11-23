import { expect, test } from '@playwright/test';
import { TARGETS_DEPLOYMENT, removeE2eRecords, withE2eSql } from './fixtures/e2e-records';
import {
  THREE,
  openNewDraft,
  parts,
  picker,
  publishViaUi,
  ready,
  unpublishButton,
} from './fixtures/track-card';

test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);

const bookRow = (id: string) =>
  withE2eSql(async (sql) => (await sql`select * from books where id = ${id}`)[0]!);

async function livePublishedBook(page: import('@playwright/test').Page, name: string) {
  const draft = await openNewDraft(page, name);
  await picker(page).setInputFiles(THREE);
  await expect(ready(parts(page).first())).toBeVisible();
  await publishViaUi(page);
  return { ...draft, slug: (await bookRow(draft.id)).slug as string };
}

test.describe('delete a book', () => {
  test('needs the typed title, then hides the book everywhere but keeps it in the database', async ({
    page,
  }) => {
    const { id, title, slug } = await livePublishedBook(page, 'Doomed');
    expect((await page.request.get(`/book/${slug}`)).status()).toBe(200);

    await page.getByRole('button', { name: 'Delete book…' }).click();
    const dialog = page.getByRole('dialog', { name: `Delete “${title}”?` });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Delete book' });
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel(/Type .* to confirm/).fill(title.slice(0, -1));
    await expect(confirm).toBeDisabled();
    // Enter in the box must neither delete early nor save the book form behind the dialog.
    await dialog.getByLabel(/Type .* to confirm/).press('Enter');
    await expect(dialog).toBeVisible();
    expect((await bookRow(id)).deleted_at).toBeNull();

    await dialog.getByLabel(/Type .* to confirm/).fill(title.toLowerCase());
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/admin\/books$/);
    await expect(page.getByRole('status').filter({ hasText: 'was deleted' })).toContainText(title);
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(0);

    // Gone for listeners and search.
    expect((await page.request.get(`/book/${slug}`)).status()).toBe(404);
    const search = await page.request.get(`/search?q=${encodeURIComponent(title)}`);
    // The page echoes the query in its search box, so look for the book's link, not its title.
    expect(await search.text()).not.toContain(`/book/${slug}`);
    // The edit page no longer opens.
    expect((await page.request.get(`/admin/books/${id}`)).status()).toBe(404);

    // Still in the database, with its audio.
    const row = await bookRow(id);
    expect(row.deleted_at).not.toBeNull();
    expect(row.status).toBe('published');
    const [tracks] = await withE2eSql(
      (sql) => sql`select count(*) as n from tracks where book_id = ${id}`,
    );
    expect(Number(tracks!.n)).toBe(1);
  });

  test('Cancel closes the dialog and deletes nothing', async ({ page }) => {
    const { id } = await openNewDraft(page, 'Spared');
    await page.getByRole('button', { name: 'Delete book…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect((await bookRow(id)).deleted_at).toBeNull();
  });

  test('a published book offers "Unpublish instead"', async ({ page }) => {
    const { id } = await livePublishedBook(page, 'Hide only');
    await page.getByRole('button', { name: 'Delete book…' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Unpublish instead' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
    await expect(unpublishButton(page)).toHaveCount(0);
    const row = await bookRow(id);
    expect(row.status).toBe('draft');
    expect(row.deleted_at).toBeNull();
  });

  test('a draft has no "Unpublish instead"', async ({ page }) => {
    await openNewDraft(page, 'Plain draft');
    await page.getByRole('button', { name: 'Delete book…' }).click();
    await expect(page.getByRole('button', { name: 'Unpublish instead' })).toHaveCount(0);
  });
});
