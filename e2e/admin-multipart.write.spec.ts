import { expect, test } from '@playwright/test';
import { createBigMp3 } from './fixtures/big-audio';
import { TARGETS_DEPLOYMENT, r2State, removeE2eRecords } from './fixtures/e2e-records';
import { RUN, card, chapters, openNewDraft, parts, picker, ready } from './fixtures/track-card';

// A file over 100 MB is sent to storage in parts. Storage is the local stand-in
// (scripts/e2e-r2.mjs), which, like R2, joins parts only when every part number and ETag matches
// and every part but the last is at least 5 MiB. Never runs against a deployed site.
test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);

const OK = `big-ok-${RUN}`;
const REJECT = `big-reject-${RUN}`;
const SLOW = `big-slow-${RUN}`;
const big = createBigMp3([`${OK}.mp3`, `${REJECT}.mp3`, `${SLOW}.mp3`]);
test.afterAll(() => big.remove());
test.setTimeout(120_000);

test.describe('multipart upload', () => {
  test('a file over 100 MB is sent in parts, joined, and becomes a ready part with a chapter', async ({
    page,
  }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles(big.paths[0]!);

    const part = parts(page).first();
    await expect(ready(part)).toBeVisible({ timeout: 90_000 });
    await expect(part).toContainText(`${OK}.mp3`);
    await expect(part).toContainText('101.0 MB');
    await expect(chapters(page)).toHaveCount(1);

    // 101 MiB in 16 MiB parts is 7 parts, joined once, nothing left open or aborted.
    expect(await r2State(OK)).toMatchObject({ open: 0, completed: 1, aborted: 0, partPuts: 7 });
    expect((await r2State(OK)).objects).toHaveLength(1);

    await page.reload();
    await expect(parts(page)).toHaveCount(1);
    await expect(ready(parts(page).first())).toBeVisible();
  });

  test('a part that storage keeps refusing fails the upload and aborts it in storage', async ({
    page,
  }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles(big.paths[1]!);

    const part = parts(page).first();
    await expect(part.getByText('Failed', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(part).toContainText('Storage refused the file (status 500).');
    await expect(chapters(page)).toHaveCount(0);

    const state = await r2State(REJECT);
    expect(state).toMatchObject({ open: 0, completed: 0, aborted: 1 });
    expect(state.partPuts).toBeGreaterThanOrEqual(3); // the refused part was tried 3 times
    expect(state.objects).toEqual([]);
  });

  test('cancelling a big upload stops it, aborts it in storage and marks the part failed', async ({
    page,
  }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles(big.paths[2]!);

    const part = parts(page).first();
    await part.getByRole('button', { name: 'Cancel' }).click();

    await expect(part.getByText('Failed', { exact: true })).toBeVisible();
    await expect(part).toContainText('Upload cancelled.');
    await expect(card(page).getByRole('alert')).toContainText('upload cancelled');
    await expect(chapters(page)).toHaveCount(0);

    expect(await r2State(SLOW)).toMatchObject({ open: 0, completed: 0, aborted: 1 });
    expect((await r2State(SLOW)).objects).toEqual([]);
  });
});
