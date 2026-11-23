import { expect, type Page } from '@playwright/test';

type Table = 'likes' | 'listenLater';

/** How many rows a table of the browser database holds (0 while it does not exist yet). */
export function savedCount(page: Page, table: Table): Promise<number> {
  return page.evaluate(
    ([name]) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('audioshelf');
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(name)) {
            db.close();
            resolve(0);
            return;
          }
          const request = db.transaction(name).objectStore(name).count();
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => {
            db.close();
            resolve(0);
          };
        };
      }),
    [table] as const,
  );
}

/** Waits until the table holds at least `rows` rows, so a navigation right after a click cannot
 *  cut the write off. */
export async function waitForSaved(page: Page, table: Table, rows: number) {
  await expect
    .poll(() => savedCount(page, table), { message: `${table} saved in the browser` })
    .toBeGreaterThanOrEqual(rows);
}
