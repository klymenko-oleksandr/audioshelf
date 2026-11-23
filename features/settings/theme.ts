import { THEMES, type ThemePreference } from './definitions';

/**
 * Theme handling. The CSS already follows the system through `light-dark()` and forces a
 * theme when `<html data-theme="light|dark">` is set (see `app/globals.css`). "System" is
 * therefore the attribute being absent.
 *
 * IndexedDB cannot be read before the first paint, so the choice is also mirrored in
 * localStorage, and a tiny blocking script in `<head>` reads that mirror. Dexie stays the
 * source of truth; `ThemeSync` keeps the mirror in line with it.
 */

export const THEME_STORAGE_KEY = 'audioshelf:theme';

/** What the page uses: the system theme only decides when the preference is "system". */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

/** The `data-theme` value for a preference, or `null` for "system" (no attribute). */
export function themeAttribute(preference: ThemePreference): 'light' | 'dark' | null {
  return preference === 'system' ? null : preference;
}

export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  const value = themeAttribute(preference);
  if (value === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', value);
  // The splash paints before the stylesheet and reads color-scheme, so set it inline too.
  root.style.colorScheme = value ?? '';
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined; // blocked (some privacy modes)
  }
}

export function writeThemeMirror(preference: ThemePreference, storage = browserStorage()): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage is full or blocked: the theme still works for this visit.
  }
}

export function readThemeMirror(storage = browserStorage()): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return THEMES.find((theme) => theme === value) ?? 'system';
  } catch {
    return 'system';
  }
}

/**
 * Runs in `<head>` before the first paint. Plain ES5 on purpose; it must never throw.
 * Only "light" and "dark" are applied, anything else leaves the system theme in charge.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t}}catch(e){}})()`;
