import { LocalDb } from './db';

let shared: LocalDb | null = null;

/** The one database connection of this tab. Browser only; never call it during SSR. */
export function getLocalDb(): LocalDb {
  shared ??= new LocalDb();
  return shared;
}

/** For tests: drop the cached connection. */
export function resetLocalDbForTests(): void {
  shared?.close();
  shared = null;
}
