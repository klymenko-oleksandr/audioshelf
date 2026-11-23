import { expect, test, type Page } from '@playwright/test';
import { signInWithPasskey } from './fixtures/admin';
import {
  E2E_PREFIX,
  TARGETS_DEPLOYMENT,
  removeE2eRecords,
  withE2eSql,
} from './fixtures/e2e-records';

test.skip(TARGETS_DEPLOYMENT, 'writes to the database: only against the throwaway e2e database');
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1024 } });
test.beforeAll(removeE2eRecords);
test.afterAll(removeE2eRecords);

const RUN = Date.now().toString(36);
let counter = 0;
const uniqueName = (name: string) => `${E2E_PREFIX}${name} ${RUN}${counter++}`;

const row = (page: Page, name: string) =>
  page.getByTestId('category-row').filter({ hasText: name });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

async function create(page: Page, nameUk: string, nameEn = '') {
  await page.getByRole('button', { name: 'New category' }).click();
  await field(page, 'Name in Ukrainian').fill(nameUk);
  if (nameEn) await field(page, 'Name in English').fill(nameEn);
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(row(page, nameUk)).toBeVisible();
}

test.describe('categories', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithPasskey(page);
    await expect(page).toHaveURL(/\/admin\/books$/);
    await page.getByRole('link', { name: 'Categories' }).click();
    await expect(page).toHaveURL(/\/admin\/categories$/);
  });

  test('the sidebar item is a real link and the seeded category is listed', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Categories' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Categories' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(row(page, 'Fiction')).toBeVisible();
  });

  test('create: appears in the list, survives a reload and is offered in the book form', async ({
    page,
  }) => {
    const name = uniqueName('Новела');
    await create(page, name, `${name} EN`);
    await expect(row(page, name)).toContainText(`${name} EN`);

    await page.reload();
    await expect(row(page, name)).toBeVisible();

    await page.goto('/admin/books/new');
    await expect(
      page.getByLabel('Category', { exact: true }).locator('option', { hasText: `${name} EN` }),
    ).toHaveCount(1);
  });

  test('the Ukrainian name is required and a duplicate is refused', async ({ page }) => {
    const name = uniqueName('Дубль');
    await create(page, name);

    await page.getByRole('button', { name: 'New category' }).click();
    await page.getByRole('button', { name: 'Create category' }).click();
    await expect(page.getByText('Enter the name in Ukrainian.')).toBeVisible();

    await field(page, 'Name in Ukrainian').fill(name.toLowerCase());
    await page.getByRole('button', { name: 'Create category' }).click();
    await expect(page.getByText('A category with this name already exists.')).toBeVisible();
    await expect(row(page, name)).toHaveCount(1);
  });

  test('rename changes the names and keeps the web address', async ({ page }) => {
    const name = uniqueName('Стара');
    await create(page, name);
    const slug = (await row(page, name).innerText()).match(/\/([a-z0-9-]+)/)![1]!;

    await row(page, name)
      .getByRole('button', { name: /^Edit / })
      .click();
    const renamed = uniqueName('Нова');
    await field(page, 'Name in Ukrainian').fill(renamed);
    await field(page, 'Name in English').fill('Renamed');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(row(page, renamed)).toContainText('Renamed');
    await expect(row(page, renamed)).toContainText(`/${slug}`);
    await expect(row(page, name)).toHaveCount(0);
  });

  test('an unused category can be deleted after a confirmation', async ({ page }) => {
    const name = uniqueName('Зайва');
    await create(page, name);
    await row(page, name)
      .getByRole('button', { name: /^Edit / })
      .click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(row(page, name)).toHaveCount(0);

    await page.reload();
    await expect(row(page, name)).toHaveCount(0);
  });

  test('a category that books use cannot be deleted, deleted books included', async ({ page }) => {
    const name = uniqueName('Зайнята');
    await create(page, name);
    await withE2eSql(
      (sql) => sql`
        insert into books (slug, title, category_id)
        select ${`e2e-in-use-${RUN}${counter++}`}, ${uniqueName('Book in category')}, id
        from categories where name_uk = ${name}`,
    );

    await page.reload();
    await expect(row(page, name)).toContainText('1');
    await row(page, name)
      .getByRole('button', { name: /^Edit / })
      .click();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    await expect(page.getByTestId('delete-block')).toContainText(
      'Used by 1 book. Move it to another category first.',
    );

    // Soft-deleting the book does not free the category: the book can still come back.
    await withE2eSql(
      (sql) =>
        sql`update books set deleted_at = now() where category_id = (select id from categories where name_uk = ${name})`,
    );
    await page.reload();
    await row(page, name)
      .getByRole('button', { name: /^Edit / })
      .click();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    await expect(page.getByTestId('delete-block')).toContainText('1 deleted book');
  });
});
