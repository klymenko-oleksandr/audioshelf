import { expect, test } from '@playwright/test';
import { TARGETS_DEPLOYMENT, removeE2eRecords, withE2eSql } from './fixtures/e2e-records';
import {
  THREE,
  TWO,
  card,
  chapters,
  openNewDraft,
  parts,
  picker,
  ready,
} from './fixtures/track-card';

test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);

test.describe('reordering the parts of a draft', () => {
  test('moving a part rebuilds the chapters, keeps a custom chapter title with its part and keeps the book length', async ({
    page,
  }) => {
    const { id } = await openNewDraft(page);
    await picker(page).setInputFiles([THREE, TWO]);
    await expect(ready(parts(page).nth(1))).toBeVisible();
    await expect(chapters(page)).toHaveCount(2);

    // Name the chapter of the first part; it must stay with that part.
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes(`/admin/books/${id}`),
    );
    const chapterTitle = chapters(page).first().getByLabel('Title of chapter 1');
    await chapterTitle.fill('Opening');
    await chapterTitle.press('Enter');
    await saved;

    // The ends cannot move further.
    await expect(parts(page).nth(0).getByRole('button', { name: 'Move part 1 up' })).toBeDisabled();
    await expect(
      parts(page).nth(1).getByRole('button', { name: 'Move part 2 down' }),
    ).toBeDisabled();

    await parts(page).nth(0).getByRole('button', { name: 'Move part 1 down' }).click();

    await expect(parts(page).nth(0).getByLabel('Title of part 1')).toHaveValue('two-seconds');
    await expect(parts(page).nth(1).getByLabel('Title of part 2')).toHaveValue('three-seconds');
    await expect(chapters(page).nth(0)).toContainText('0:00–0:02');
    await expect(chapters(page).nth(0).getByLabel('Title of chapter 1')).toHaveValue('two-seconds');
    await expect(chapters(page).nth(1)).toContainText('0:02–0:05');
    await expect(chapters(page).nth(1).getByLabel('Title of chapter 2')).toHaveValue('Opening');

    // It was saved, not just shown.
    await page.reload();
    await expect(parts(page).nth(0).getByLabel('Title of part 1')).toHaveValue('two-seconds');
    await expect(chapters(page).nth(1).getByLabel('Title of chapter 2')).toHaveValue('Opening');
    await expect(chapters(page).nth(1)).toContainText('0:02–0:05');

    const [book] = await withE2eSql(
      (sql) => sql`select duration_seconds from books where id = ${id}`,
    );
    expect(Number(book!.duration_seconds)).toBe(5);
  });

  test('moving a part back restores the original order and chapters', async ({ page }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles([THREE, TWO]);
    await expect(ready(parts(page).nth(1))).toBeVisible();

    await parts(page).nth(1).getByRole('button', { name: 'Move part 2 up' }).click();
    await expect(parts(page).nth(0).getByLabel('Title of part 1')).toHaveValue('two-seconds');
    await parts(page).nth(1).getByRole('button', { name: 'Move part 2 up' }).click();
    await expect(parts(page).nth(0).getByLabel('Title of part 1')).toHaveValue('three-seconds');
    await expect(chapters(page).nth(0)).toContainText('0:00–0:03');
    await expect(chapters(page).nth(1)).toContainText('0:03–0:05');
  });

  test('a single part has nothing to reorder', async ({ page }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles(THREE);
    await expect(ready(parts(page).first())).toBeVisible();
    await expect(card(page).getByRole('button', { name: /Move part/ })).toHaveCount(0);
  });
});
