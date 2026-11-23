import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTheme,
  readThemeMirror,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  themeAttribute,
  writeThemeMirror,
} from './theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

describe('resolveTheme', () => {
  it('follows the system only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('themeAttribute', () => {
  it('forces light or dark, and leaves "system" without an attribute', () => {
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute('system')).toBeNull();
  });
});

describe('applyTheme', () => {
  it('sets data-theme on <html> and removes it again for "system"', () => {
    const root = document.documentElement;
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.style.colorScheme).toBe('light');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(root.style.colorScheme).toBe('');
  });
});

describe('theme mirror (what the blocking script reads)', () => {
  it('stores and reads the preference', () => {
    writeThemeMirror('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemeMirror()).toBe('dark');
  });

  it('reads nothing valid as "system"', () => {
    expect(readThemeMirror()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readThemeMirror()).toBe('system');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(() => writeThemeMirror('dark', broken)).not.toThrow();
    expect(readThemeMirror(broken)).toBe('system');
  });
});

describe('THEME_INIT_SCRIPT (runs before first paint, so there is no flash)', () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it('puts a saved dark or light choice on <html>', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('leaves <html> alone for "system", for nothing saved and for junk', () => {
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    localStorage.setItem(THEME_STORAGE_KEY, '"><script>');
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('does not throw when storage is blocked', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      expect(run).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('uses the same key as the mirror', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });
});
