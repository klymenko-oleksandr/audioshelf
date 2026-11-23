import { expect, test, type Page } from '@playwright/test';
import { TARGETS_DEPLOYMENT, removeE2eRecords, withE2eSql } from './fixtures/e2e-records';
import {
  RUN,
  THREE,
  TWO,
  card,
  chapters,
  named,
  openNewDraft,
  parts,
  picker,
  ready,
} from './fixtures/track-card';

test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);

// There is no publish button until 4d, so the test publishes the draft in the database.
const publish = (id: string) =>
  withE2eSql(
    (sql) => sql`update books set status = 'published', published_at = now() where id = ${id}`,
  );

const chapterRows = (id: string) =>
  withE2eSql(
    (sql) =>
      sql`select id, position, title, start_seconds, end_seconds from chapters where book_id = ${id} order by position`,
  );

const trackPositions = (id: string) =>
  withE2eSql(async (sql) =>
    (await sql`select position from tracks where book_id = ${id} order by position`).map((r) =>
      Number(r.position),
    ),
  );

/** What a listener's player gets: cached until the admin saves, so it proves the revalidation. */
const playerBook = async (page: Page, id: string) => {
  const response = await page.request.get(`/api/player/books/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { tracks: unknown[]; chapters: { title: string }[] };
};

test.describe('adding parts to a published book', () => {
  test('a new part goes on the end; existing parts and chapters stay exactly as they were; listeners get it', async ({
    page,
  }) => {
    const { id } = await openNewDraft(page);
    await picker(page).setInputFiles([THREE, TWO]);
    await expect(ready(parts(page).nth(1))).toBeVisible();

    // Give the first chapter a custom title, then publish.
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes(`/admin/books/${id}`),
    );
    const chapterTitle = chapters(page).first().getByLabel('Title of chapter 1');
    await chapterTitle.fill('Opening');
    await chapterTitle.press('Enter');
    await saved;
    await publish(id);

    const before = await chapterRows(id);
    const listening = await playerBook(page, id); // fills the listeners' cache
    expect(listening.tracks).toHaveLength(2);
    expect(listening.chapters).toHaveLength(2);

    await page.reload();
    // Published: no reordering, no removing a ready part, and the card says how adding works.
    await expect(card(page)).toContainText('New parts are added at the end');
    await expect(card(page).getByRole('button', { name: /Move part/ })).toHaveCount(0);
    await expect(card(page).getByRole('button', { name: /Remove part/ })).toHaveCount(0);

    await picker(page).setInputFiles(THREE);

    await expect(parts(page)).toHaveCount(3);
    await expect(ready(parts(page).nth(2))).toBeVisible();
    await expect(parts(page).nth(2).getByLabel('Title of part 3')).toHaveValue('three-seconds');
    await expect(chapters(page)).toHaveCount(3);
    await expect(chapters(page).nth(2)).toContainText('0:05–0:08');

    // The first two chapters are the same rows: same ids, titles, positions and ranges.
    const after = await chapterRows(id);
    expect(after).toHaveLength(3);
    expect(after.slice(0, 2)).toEqual(before);
    expect(after[0]!.title).toBe('Opening');
    expect(await trackPositions(id)).toEqual([1, 2, 3]);

    // Listeners get the third part straight away (that every save revalidates the catalogue is
    // proved in track-actions.test.ts; here the cache was filled before the upload started).
    const updated = await playerBook(page, id);
    expect(updated.tracks).toHaveLength(3);
    expect(updated.chapters).toHaveLength(3);

    const [book] = await withE2eSql(
      (sql) => sql`select duration_seconds, status from books where id = ${id}`,
    );
    expect(Number(book!.duration_seconds)).toBe(8);
    expect(book!.status).toBe('published');
  });

  test('after a failed part the rest of the batch waits, so the parts stay in the order chosen', async ({
    page,
  }) => {
    const { id } = await openNewDraft(page);
    await picker(page).setInputFiles(THREE);
    await expect(ready(parts(page).first())).toBeVisible();
    await publish(id);
    await page.reload();

    // The first file is refused by storage; the second must not be added behind it.
    await picker(page).setInputFiles([named(`reject-${RUN}.mp3`), named(`after-${RUN}.mp3`, TWO)]);

    await expect(parts(page)).toHaveCount(2);
    await expect(parts(page).nth(1).getByText('Failed', { exact: true })).toBeVisible();
    await expect(card(page).getByRole('alert')).toContainText('1 more file was not added');
    await expect(parts(page).nth(1).getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(await trackPositions(id)).toEqual([1, 2]);
  });

  test('a failed part with a ready part after it cannot be retried in place, only removed', async ({
    page,
  }) => {
    const { id } = await openNewDraft(page);
    // On a draft the batch carries on after the failure: part 1 fails, part 2 becomes ready.
    await picker(page).setInputFiles([named(`reject-${RUN}.mp3`), named(`two-${RUN}.mp3`, TWO)]);
    await expect(parts(page).nth(0).getByText('Failed', { exact: true })).toBeVisible();
    await expect(ready(parts(page).nth(1))).toBeVisible();
    await publish(id);
    await page.reload();

    const failed = parts(page).nth(0);
    await expect(failed).toContainText('end of a published book');
    await expect(failed.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await expect(failed.getByRole('button', { name: 'Remove part 1' })).toBeVisible();

    await failed.getByRole('button', { name: 'Remove part 1' }).click();
    await expect(parts(page)).toHaveCount(1);
    await expect(chapters(page)).toHaveCount(1);
    await expect(chapters(page).first()).toContainText('0:00–0:02');
  });
});
