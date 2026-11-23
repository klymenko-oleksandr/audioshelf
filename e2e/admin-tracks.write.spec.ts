import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { signInWithPasskey } from './fixtures/admin';
import { E2E_PREFIX, TARGETS_DEPLOYMENT, removeE2eRecords } from './fixtures/e2e-records';

// Creates records and "uploads" to a local stand-in for storage (scripts/e2e-r2.mjs), so it
// never runs against a deployed site, and it cleans up after itself.
test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);

const AUDIO = path.join(__dirname, 'fixtures', 'audio');
const THREE = path.join(AUDIO, 'three-seconds.mp3');
const TWO = path.join(AUDIO, 'two-seconds.mp3');
const WAV = path.join(AUDIO, 'not-audio.wav');

let counter = 0;
const title = (name: string) => `${E2E_PREFIX}${name} ${Date.now().toString(36)}${counter++}`;

const card = (page: Page) => page.getByRole('region', { name: 'Audio tracks' });
const parts = (page: Page) => card(page).getByRole('list', { name: 'Parts' }).getByRole('listitem');
const chapters = (page: Page) =>
  card(page).getByRole('list', { name: 'Chapters' }).getByRole('listitem');
async function signIn(page: Page) {
  await signInWithPasskey(page);
  await expect(page).toHaveURL(/\/admin\/books$/);
}

const picker = (page: Page) => page.getByLabel('Audio files', { exact: true });

async function openNewDraft(page: Page) {
  await signIn(page);
  await page.goto('/admin/books/new');
  await page.getByLabel('Title', { exact: true }).fill(title('Tracks'));
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page).toHaveURL(/\/admin\/books\/[0-9a-f-]{36}\?created=1$/);
  await expect(card(page)).toBeVisible();
}

test.describe('audio tracks', () => {
  test('a new book asks to save the draft first', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/books/new');
    await expect(card(page).getByText('Save the draft first')).toBeVisible();
    await expect(card(page).getByRole('button', { name: 'Add audio files' })).toHaveCount(0);
  });

  test('a file uploads, becomes a ready part with a chapter, and keeps its place after a reload', async ({
    page,
  }) => {
    await openNewDraft(page);
    await expect(card(page).getByText('No audio yet')).toBeVisible();

    await picker(page).setInputFiles(THREE);

    const part = parts(page).first();
    await expect(part.getByText('Ready', { exact: true })).toBeVisible();
    await expect(part.getByLabel('Title of part 1')).toHaveValue('three-seconds');
    await expect(part).toContainText('three-seconds.mp3');
    await expect(part).toContainText('0:03');
    await expect(chapters(page)).toHaveCount(1);
    await expect(chapters(page).first()).toContainText('0:00–0:03');

    await page.reload();
    await expect(parts(page)).toHaveCount(1);
    await expect(parts(page).first().getByText('Ready', { exact: true })).toBeVisible();
  });

  test('several files upload one after another, in the order chosen, with chapters following', async ({
    page,
  }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles([THREE, TWO]);

    await expect(parts(page)).toHaveCount(2);
    await expect(parts(page).nth(0).getByText('Ready', { exact: true })).toBeVisible();
    await expect(parts(page).nth(1).getByText('Ready', { exact: true })).toBeVisible();
    await expect(parts(page).nth(0).getByLabel('Title of part 1')).toHaveValue('three-seconds');
    await expect(parts(page).nth(1).getByLabel('Title of part 2')).toHaveValue('two-seconds');
    await expect(chapters(page).nth(0)).toContainText('0:00–0:03');
    await expect(chapters(page).nth(1)).toContainText('0:03–0:05');
  });

  test('a file that is not MP3 or M4A is refused with the reason, and no part is added', async ({
    page,
  }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles(WAV);

    const refused = card(page).getByRole('list', { name: 'Files that were not added' });
    await expect(refused).toContainText('not-audio.wav');
    await expect(refused).toContainText('Only MP3 and M4A files can be uploaded');
    await expect(parts(page)).toHaveCount(0);
  });

  test('a part and a chapter can be renamed, and Enter does not save the whole book', async ({
    page,
  }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles(THREE);
    await expect(parts(page).first().getByText('Ready', { exact: true })).toBeVisible();

    const partTitle = parts(page).first().getByLabel('Title of part 1');
    await partTitle.fill('Chapter one, the part');
    await partTitle.press('Enter');
    await expect(page.getByText(/Saved at/)).toHaveCount(0);

    const chapterTitle = chapters(page).first().getByLabel('Title of chapter 1');
    await chapterTitle.fill('Opening');
    await chapterTitle.press('Enter');

    // Part and chapter are independent: renaming one does not rename the other.
    await page.reload();
    await expect(parts(page).first().getByLabel('Title of part 1')).toHaveValue(
      'Chapter one, the part',
    );
    await expect(chapters(page).first().getByLabel('Title of chapter 1')).toHaveValue('Opening');
  });

  test('a rejected upload shows as failed, and a retry with the file makes it ready', async ({
    page,
  }) => {
    await openNewDraft(page);
    // The stand-in storage answers 500 to any file whose name contains "reject".
    await picker(page).setInputFiles({
      name: 'reject-me.mp3',
      mimeType: 'audio/mpeg',
      buffer: (await import('node:fs')).readFileSync(THREE),
    });

    const part = parts(page).first();
    await expect(part.getByText('Failed', { exact: true })).toBeVisible();
    await expect(part).toContainText('Storage refused the file');
    await expect(chapters(page)).toHaveCount(0);

    // The title is part of the storage address, so give it another one before trying again.
    const partTitle = part.getByLabel('Title of part 1');
    await partTitle.fill('Fixed');
    await partTitle.press('Enter');
    await expect(part.getByLabel('Title of part 1')).toHaveValue('Fixed');

    const chooser = page.waitForEvent('filechooser');
    await part.getByRole('button', { name: 'Retry' }).click();
    await (await chooser).setFiles(THREE);

    await expect(parts(page)).toHaveCount(1);
    await expect(parts(page).first().getByText('Ready', { exact: true })).toBeVisible();
    await expect(chapters(page)).toHaveCount(1);
  });

  test('a file that never reached storage is caught by the server check', async ({ page }) => {
    await openNewDraft(page);
    // The stand-in storage says "uploaded" but keeps nothing for names containing "vanish".
    await picker(page).setInputFiles({
      name: 'vanish-me.mp3',
      mimeType: 'audio/mpeg',
      buffer: (await import('node:fs')).readFileSync(THREE),
    });

    const part = parts(page).first();
    await expect(part.getByText('Failed', { exact: true })).toBeVisible();
    await expect(part.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(chapters(page)).toHaveCount(0);
  });

  test('removing a ready part on a draft asks first, then takes its chapter with it', async ({
    page,
  }) => {
    await openNewDraft(page);
    await picker(page).setInputFiles([THREE, TWO]);
    await expect(parts(page).nth(1).getByText('Ready', { exact: true })).toBeVisible();

    await parts(page).nth(0).getByRole('button', { name: 'Remove part 1' }).click();
    const confirm = card(page).getByRole('group', { name: 'Confirm removing this part' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Keep it' }).click();
    await expect(parts(page)).toHaveCount(2);

    await parts(page).nth(0).getByRole('button', { name: 'Remove part 1' }).click();
    await confirm.getByRole('button', { name: 'Yes, remove' }).click();

    await expect(parts(page)).toHaveCount(1);
    await expect(parts(page).first().getByLabel('Title of part 1')).toHaveValue('two-seconds');
    // The remaining part moved to the start of the book.
    await expect(chapters(page)).toHaveCount(1);
    await expect(chapters(page).first()).toContainText('0:00–0:02');
  });
});
