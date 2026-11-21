import { expect, test, type Page } from '@playwright/test';
import { signInWithPasskey } from './fixtures/admin';
import { E2E_PREFIX, TARGETS_DEPLOYMENT, removeE2eRecords } from './fixtures/e2e-records';

// Creates records, so it never runs against a deployed site, and it cleans up after itself.
test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);

const LEAVE_MESSAGE = 'You have unsaved changes. Leave this page without saving?';
let counter = 0;
/** Titles are unique per test and per run, so tests never depend on each other. */
const title = (name: string) => `${E2E_PREFIX}${name} ${Date.now().toString(36)}${counter++}`;

async function signIn(page: Page) {
  await signInWithPasskey(page);
  await expect(page).toHaveURL(/\/admin\/books$/);
}

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const save = (page: Page) => page.getByRole('button', { name: /^Save (draft|changes)$/ });

async function createDraft(page: Page, bookTitle: string, extra?: (page: Page) => Promise<void>) {
  await page.goto('/admin/books/new');
  await field(page, 'Title').fill(bookTitle);
  await extra?.(page);
  await save(page).click();
  await expect(page).toHaveURL(/\/admin\/books\/[0-9a-f-]{36}\?created=1$/);
}

test.describe('add and edit book: signed out', () => {
  test('the add and edit pages send a visitor to the login and back', async ({ page }) => {
    await page.goto('/admin/books/new');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fbooks%2Fnew$/);

    await page.goto('/admin/books/3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fbooks%2F3f2b8c1e/);
  });
});

test.describe('add and edit book', () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test('a draft saves with only a title and opens on its edit page', async ({ page }) => {
    const bookTitle = title('Only a title');
    await page.goto('/admin/books');
    await page.getByRole('link', { name: 'New book' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'New book' })).toBeVisible();
    await expect(page.getByText('Not saved yet')).toBeVisible();

    await field(page, 'Title').fill(bookTitle);
    await save(page).click();

    await expect(page).toHaveURL(/\/admin\/books\/[0-9a-f-]{36}\?created=1$/);
    await expect(page.getByRole('heading', { level: 1, name: bookTitle })).toBeVisible();
    await expect(page.getByText('Draft created')).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    // The optional fields stay empty.
    await expect(field(page, 'Author')).toHaveValue('');
    await expect(field(page, 'Category')).toHaveValue('');
    await expect(field(page, 'Language')).toHaveValue('uk');

    // It is on the books list as a draft, and its row opens the edit page.
    await page.goto('/admin/books?tab=draft');
    const row = page.getByRole('row').filter({ hasText: bookTitle });
    await expect(row.getByText('Draft', { exact: true })).toBeVisible();
    await expect(row.getByText('No author')).toBeVisible();
    await page.getByRole('link', { name: bookTitle }).click();
    await expect(page.getByRole('heading', { level: 1, name: bookTitle })).toBeVisible();
  });

  test('a draft is not visible to listeners', async ({ page }) => {
    const bookTitle = title('Hidden draft');
    await createDraft(page, bookTitle);
    const slug = (await page.getByText(/Web address \/book\//).textContent())!.match(
      /\/book\/([a-z0-9-]+)/,
    )![1];
    const response = await page.goto(`/book/${slug}`);
    expect(response?.status()).toBe(404);
  });

  test('saves every field, creating the author with a bio and the narrator on the way', async ({
    page,
  }) => {
    const bookTitle = title('Full form');
    const author = `${E2E_PREFIX}Author ${counter++}`;
    const narrator = `${E2E_PREFIX}Narrator ${counter++}`;
    await createDraft(page, bookTitle, async (p) => {
      await field(p, 'Author').selectOption({ label: '+ New author…' });
      await field(p, 'New author’s name').fill(author);
      await field(p, 'Author bio').fill('Wrote the test.');
      await field(p, 'Narrator (read by)').selectOption({ label: '+ New narrator…' });
      await field(p, 'New narrator’s name').fill(narrator);
      await field(p, 'Category').selectOption({ label: 'Fiction' });
      await field(p, 'Language').selectOption({ label: 'English' });
      await field(p, 'Description').fill('A test description.');
      await p.getByLabel('Ongoing').check();
    });

    // After the redirect, the saved values are in the form.
    await expect(field(page, 'Author')).toHaveText(new RegExp(author));
    await expect(field(page, 'Author').locator('option:checked')).toHaveText(author);
    await expect(field(page, 'Author bio')).toHaveValue('Wrote the test.');
    await expect(field(page, 'Narrator (read by)').locator('option:checked')).toHaveText(narrator);
    await expect(field(page, 'Category').locator('option:checked')).toHaveText('Fiction');
    await expect(field(page, 'Language')).toHaveValue('en');
    await expect(field(page, 'Description')).toHaveValue('A test description.');
    await expect(page.getByLabel('Ongoing')).toBeChecked();

    // The list shows author, narrator and category.
    await page.goto('/admin/books');
    const row = page.getByRole('row').filter({ hasText: bookTitle });
    await expect(row.getByText(`${author} · read by ${narrator}`)).toBeVisible();
    await expect(row.getByText('Fiction')).toBeVisible();
  });

  test('a saved author can be picked again for another book, and their bio can be edited', async ({
    page,
  }) => {
    const author = `${E2E_PREFIX}Shared author ${counter++}`;
    await createDraft(page, title('First'), async (p) => {
      await field(p, 'Author').selectOption({ label: '+ New author…' });
      await field(p, 'New author’s name').fill(author);
      await field(p, 'Author bio').fill('First bio.');
    });

    await page.goto('/admin/books/new');
    await field(page, 'Title').fill(title('Second'));
    await field(page, 'Author').selectOption({ label: author });
    await expect(field(page, 'Author bio')).toHaveValue('First bio.');
    await field(page, 'Author bio').fill('Better bio.');
    await save(page).click();
    await expect(page).toHaveURL(/created=1$/);
    await expect(field(page, 'Author bio')).toHaveValue('Better bio.');

    // The author is one record: another book sees the new bio.
    await page.goto('/admin/books/new');
    await field(page, 'Author').selectOption({ label: author });
    await expect(field(page, 'Author bio')).toHaveValue('Better bio.');
  });

  test('shows a clear error under each field that needs attention, and keeps what was typed', async ({
    page,
  }) => {
    await page.goto('/admin/books/new');
    await save(page).click();
    await expect(page).toHaveURL(/\/admin\/books\/new$/);
    await expect(page.getByText('Enter a title.')).toBeVisible();
    await expect(field(page, 'Title')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'Title')).toBeFocused();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Some fields need attention' }),
    ).toBeVisible();

    // Several at once, each in its own place; nothing typed is lost.
    await field(page, 'Title').fill('x'.repeat(201));
    await field(page, 'Author').selectOption({ label: '+ New author…' });
    await field(page, 'Description').fill('d'.repeat(1001));
    await expect(page.getByText('1,001 / 1,000')).toBeVisible();
    await save(page).click();
    await expect(page.getByText('Keep the title to 200 characters or fewer.')).toBeVisible();
    await expect(page.getByText('Enter the author’s name.')).toBeVisible();
    await expect(
      page.getByText('Keep the description to 1,000 characters or fewer.'),
    ).toBeVisible();
    await expect(field(page, 'Title')).toHaveValue('x'.repeat(201));
    await expect(field(page, 'Description')).toHaveValue('d'.repeat(1001));

    // An error goes away as soon as its field is touched.
    await field(page, 'New author’s name').fill(`${E2E_PREFIX}Someone`);
    await expect(page.getByText('Enter the author’s name.')).toHaveCount(0);
    await expect(page.getByText('Keep the title to 200 characters or fewer.')).toBeVisible();
  });

  test('refuses a new author or narrator whose name already exists', async ({ page }) => {
    const author = `${E2E_PREFIX}Twice ${counter++}`;
    await createDraft(page, title('Has author'), async (p) => {
      await field(p, 'Author').selectOption({ label: '+ New author…' });
      await field(p, 'New author’s name').fill(author);
    });

    await page.goto('/admin/books/new');
    const second = title('Second');
    await field(page, 'Title').fill(second);
    await field(page, 'Author').selectOption({ label: '+ New author…' });
    await field(page, 'New author’s name').fill(`  ${author.toUpperCase()}  `);
    await save(page).click();
    await expect(
      page.getByText('An author with this name already exists. Pick them from the list.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/books\/new$/);

    // Nothing was saved: the book is not on the list.
    await page.goto('/admin/books?q=' + encodeURIComponent(second));
    await expect(page.getByRole('heading', { name: 'No books match' })).toBeVisible();
  });

  test('two books with the same title get different web addresses', async ({ page }) => {
    const same = title('Same title');
    await createDraft(page, same);
    const first = await page.getByText(/Web address \/book\//).textContent();

    await page.goto('/admin/books/new');
    await field(page, 'Title').fill(same);
    await expect(
      page.getByText(/Web address \/book\/[a-z0-9-]+ \(a number is added/),
    ).toBeVisible();
    await save(page).click();
    await expect(page).toHaveURL(/created=1$/);
    const second = await page.getByText(/Web address \/book\//).textContent();

    const slug = (text: string | null) => text!.match(/\/book\/([a-z0-9-]+)/)![1]!;
    expect(slug(second)).not.toBe(slug(first));
    expect(slug(second)).toBe(`${slug(first)}-2`);
  });

  test('editing keeps the web address, and the cover preview follows the title', async ({
    page,
  }) => {
    const original = title('Before');
    await createDraft(page, original);
    const address = await page.getByText(/Web address \/book\//).textContent();

    const preview = page.getByTestId('cover-preview');
    await expect(preview).toContainText(original);
    // No uploaded image: the designed cover is shown.
    await expect(preview.locator('img')).toHaveCount(0);

    const renamed = title('After');
    await field(page, 'Title').fill(renamed);
    await expect(preview).toContainText(renamed);
    await save(page).click();
    await expect(page.getByText(/^Saved at \d\d:\d\d$/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
    await expect(page.getByText(/Web address \/book\//)).toHaveText(address!);
  });

  test('unsaved changes are protected until they are saved', async ({ page }) => {
    await createDraft(page, title('Guarded'));
    await expect(page.getByText('Unsaved changes')).toHaveCount(0);

    await field(page, 'Description').fill('Not saved yet');
    await expect(page.getByText('Unsaved changes')).toBeVisible();

    // Staying: the dialog is dismissed and the page, with its text, remains.
    const dialogs: string[] = [];
    page.once('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await page.getByRole('link', { name: 'Books', exact: true }).first().click();
    await expect.poll(() => dialogs).toEqual([LEAVE_MESSAGE]);
    await expect(page).toHaveURL(/\/admin\/books\/[0-9a-f-]{36}/);
    await expect(field(page, 'Description')).toHaveValue('Not saved yet');

    // Typing the old text back removes the warning.
    await field(page, 'Description').fill('');
    await expect(page.getByText('Unsaved changes')).toHaveCount(0);

    // Saved: no dialog, the link just works.
    await field(page, 'Description').fill('Now saved');
    await save(page).click();
    await expect(page.getByText(/^Saved at/)).toBeVisible();
    await expect(page.getByText('Unsaved changes')).toHaveCount(0);
    page.on('dialog', () => {
      throw new Error('No dialog expected after saving');
    });
    await page.getByRole('link', { name: 'Books', exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/books$/);
  });

  test('leaving after saying yes to the warning goes where the link points', async ({ page }) => {
    await createDraft(page, title('Leave'));
    await field(page, 'Description').fill('Throw this away');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('link', { name: 'Books', exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/books$/);
  });

  test('a book that does not exist is the panel’s not-found page', async ({ page }) => {
    const response = await page.goto('/admin/books/3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('There is no such page in the admin panel.')).toBeVisible();
    const malformed = await page.goto('/admin/books/not-an-id');
    expect(malformed?.status()).toBe(404);
  });

  test('the form pages are private and not indexable', async ({ page }) => {
    const response = await page.goto('/admin/books/new');
    expect(response?.headers()['cache-control']).toBe('private, no-store, max-age=0');
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive');
  });
});
