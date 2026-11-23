import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  isSettingKey,
  parseSetting,
  resolveSettings,
  SKIP_BACK_OPTIONS,
  SKIP_FORWARD_OPTIONS,
} from './definitions';

describe('defaults', () => {
  it('match the agreed values', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'system',
      defaultSpeed: 1,
      skipBackSeconds: 15,
      skipForwardSeconds: 30,
      autoRewind: true,
      continueToNextChapter: true,
    });
  });

  it('are themselves valid values', () => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      expect(parseSetting(key as keyof typeof DEFAULT_SETTINGS, value)).toBe(value);
    }
  });

  it('offer the skip intervals from the Settings board', () => {
    expect(SKIP_BACK_OPTIONS).toEqual([10, 15, 30]);
    expect(SKIP_FORWARD_OPTIONS).toEqual([15, 30, 60]);
  });
});

describe('parseSetting', () => {
  it('accepts the three themes only', () => {
    for (const theme of ['system', 'light', 'dark'])
      expect(parseSetting('theme', theme)).toBe(theme);
    for (const bad of ['Dark', 'auto', '', 1, null, undefined, {}]) {
      expect(parseSetting('theme', bad)).toBeUndefined();
    }
  });

  it('accepts a default speed from 0.5× to 3× and snaps it to the 0.05 grid', () => {
    expect(parseSetting('defaultSpeed', 1.25)).toBe(1.25);
    expect(parseSetting('defaultSpeed', 0.5)).toBe(0.5);
    expect(parseSetting('defaultSpeed', 3)).toBe(3);
    expect(parseSetting('defaultSpeed', 1.23)).toBe(1.25);
  });

  it('rejects speeds out of range and things that are not numbers', () => {
    for (const bad of [0.4, 3.2, 0, -1, NaN, Infinity, '1.5', null, undefined, true]) {
      expect(parseSetting('defaultSpeed', bad)).toBeUndefined();
    }
  });

  it('accepts only the offered skip intervals', () => {
    for (const s of SKIP_BACK_OPTIONS) expect(parseSetting('skipBackSeconds', s)).toBe(s);
    for (const s of SKIP_FORWARD_OPTIONS) expect(parseSetting('skipForwardSeconds', s)).toBe(s);
    for (const bad of [0, 5, 20, 45, 60, '15', null]) {
      expect(parseSetting('skipBackSeconds', bad)).toBeUndefined();
    }
    for (const bad of [10, 45, 90, '30', null]) {
      expect(parseSetting('skipForwardSeconds', bad)).toBeUndefined();
    }
  });

  it('accepts real booleans only', () => {
    for (const key of ['autoRewind', 'continueToNextChapter'] as const) {
      expect(parseSetting(key, true)).toBe(true);
      expect(parseSetting(key, false)).toBe(false);
      for (const bad of ['true', 1, 0, null, undefined]) {
        expect(parseSetting(key, bad)).toBeUndefined();
      }
    }
  });
});

describe('isSettingKey', () => {
  it('knows the keys and nothing else', () => {
    expect(isSettingKey('theme')).toBe(true);
    expect(isSettingKey('downloadsWifiOnly')).toBe(false);
    expect(isSettingKey('toString')).toBe(false);
    expect(isSettingKey('__proto__')).toBe(false);
  });
});

describe('resolveSettings', () => {
  it('returns the defaults when nothing was saved', () => {
    expect(resolveSettings([])).toEqual(DEFAULT_SETTINGS);
  });

  it('applies saved values over the defaults', () => {
    const settings = resolveSettings([
      { key: 'theme', value: 'dark' },
      { key: 'skipBackSeconds', value: 30 },
      { key: 'autoRewind', value: false },
    ]);
    expect(settings).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      skipBackSeconds: 30,
      autoRewind: false,
    });
  });

  it('falls back to the default for one bad value and keeps the good ones', () => {
    const settings = resolveSettings([
      { key: 'theme', value: 'sepia' },
      { key: 'skipForwardSeconds', value: 60 },
    ]);
    expect(settings.theme).toBe('system');
    expect(settings.skipForwardSeconds).toBe(60);
  });

  it('ignores keys it does not know (a newer version may have written them)', () => {
    const settings = resolveSettings([
      { key: 'downloadsWifiOnly', value: true },
      { key: '__proto__', value: { polluted: true } },
    ]);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
