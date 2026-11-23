import type { ContinueBook } from './queries';

/**
 * Card data for books this device has progress for ("Continue listening"), fetched from
 * the server by id. Kept in memory for the life of the tab, so coming back to Home does not
 * ask again. Books that are no longer live are simply absent from the answer.
 */
const known = new Map<string, ContinueBook | null>();

export function knownContinueBooks(ids: readonly string[]): Map<string, ContinueBook> | undefined {
  const found = new Map<string, ContinueBook>();
  for (const id of ids) {
    const book = known.get(id);
    if (book === undefined) return undefined; // at least one was never asked for
    if (book) found.set(id, book);
  }
  return found;
}

/** Matches `MAX_BOOK_IDS` on the server (the route cuts anything past it). */
export const BOOK_IDS_PER_REQUEST = 100;

export async function loadContinueBooks(
  ids: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const missing = [...new Set(ids.filter((id) => !known.has(id)))];
  if (missing.length === 0) return;

  const chunks: string[][] = [];
  for (let start = 0; start < missing.length; start += BOOK_IDS_PER_REQUEST) {
    chunks.push(missing.slice(start, start + BOOK_IDS_PER_REQUEST));
  }
  // Ask for everything first and remember only when every chunk answered: a failure leaves
  // nothing half-known, so a retry asks again.
  const answers = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await fetcher(`/api/catalogue/books?ids=${chunk.join(',')}`);
      if (!response.ok) throw new Error(`Loading books failed: ${response.status}`);
      return ((await response.json()) as { books: ContinueBook[] }).books;
    }),
  );
  for (const id of missing) known.set(id, null);
  for (const books of answers) for (const book of books) known.set(book.id, book);
}

/** For tests. */
export function forgetContinueBooks(): void {
  known.clear();
}
