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

export async function loadContinueBooks(
  ids: readonly string[],
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const missing = ids.filter((id) => !known.has(id));
  if (missing.length === 0) return;
  const response = await fetcher(`/api/catalogue/books?ids=${missing.join(',')}`);
  if (!response.ok) throw new Error(`Loading books failed: ${response.status}`);
  const { books } = (await response.json()) as { books: ContinueBook[] };
  for (const id of missing) known.set(id, null);
  for (const book of books) known.set(book.id, book);
}

/** For tests. */
export function forgetContinueBooks(): void {
  known.clear();
}
