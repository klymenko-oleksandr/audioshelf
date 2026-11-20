/**
 * Recent searches: the last few queries a listener ran, kept on this device only (PRD).
 * The list is plain text in localStorage; reading and writing never throw, because storage
 * can be unavailable (private mode, quota) and search must work without it.
 */
export const MAX_RECENT = 8;
const KEY = 'audioshelf.recent-searches';
const CHANGED = 'audioshelf:recent-searches';

/**
 * `query` goes to the front of `list`. A repeat moves up instead of doubling, and an earlier
 * entry that is the start of this one is replaced: typing "hol", pausing, then "holmes" leaves
 * one entry. Blank queries change nothing.
 */
export function pushRecent(list: readonly string[], query: string, max = MAX_RECENT): string[] {
  const clean = query.trim().replace(/\s+/g, ' ');
  if (!clean) return [...list];
  const key = clean.toLocaleLowerCase();
  const kept = list.filter((entry) => {
    const other = entry.toLocaleLowerCase();
    return other !== key && !key.startsWith(other);
  });
  return [clean, ...kept].slice(0, max);
}

const parse = (raw: string | null): string[] => {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
};

const store = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

let cache: { raw: string | null; list: string[] } = { raw: null, list: [] };

/** The saved list. The same array comes back until the stored text changes. */
export function readRecent(): string[] {
  const raw = store()?.getItem(KEY) ?? null;
  if (raw !== cache.raw) cache = { raw, list: parse(raw) };
  return cache.list;
}

function write(list: string[]) {
  try {
    if (list.length === 0) store()?.removeItem(KEY);
    else store()?.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage is full or blocked: the list simply isn't kept.
  }
  window.dispatchEvent(new Event(CHANGED));
}

export const addRecent = (query: string) => write(pushRecent(readRecent(), query));
export const clearRecent = () => write([]);

/** For `useSyncExternalStore`: fires when this tab or another one changes the list. */
export function subscribeRecent(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) onChange();
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
