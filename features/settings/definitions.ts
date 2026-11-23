import { MAX_SPEED, MIN_SPEED, normalizeSpeed } from '@/features/player/core/rules';

/**
 * The settings that exist in 5a, with their allowed values and defaults (PRD: Settings;
 * canvas: Settings, MSettingsPlayback, MSettingsAppearance). Stored values are validated on
 * the way in and on the way out, so a bad row (an older or newer app version, a hand-edited
 * database) can never break the player: it just falls back to the default.
 *
 * Language is not here — it stays the existing cookie (ADR 6). Downloads settings (Wi-Fi
 * only, auto-remove) get their keys in Phase 7, when their meaning is decided.
 */

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEMES)[number];

export const SKIP_BACK_OPTIONS = [10, 15, 30] as const;
export const SKIP_FORWARD_OPTIONS = [15, 30, 60] as const;
/** The default-speed choices on the Settings board; any speed from 0.5× to 3× is valid. */
export const DEFAULT_SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const;

export interface Settings {
  theme: ThemePreference;
  /** Speed for books that have no saved speed of their own. */
  defaultSpeed: number;
  skipBackSeconds: number;
  skipForwardSeconds: number;
  /** After a pause of 5 minutes or more, resume 10 s earlier. */
  autoRewind: boolean;
  /** Off: playback stops at the end of every chapter. */
  continueToNextChapter: boolean;
}

export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  theme: 'system',
  defaultSpeed: 1,
  skipBackSeconds: 15,
  skipForwardSeconds: 30,
  autoRewind: true,
  continueToNextChapter: true,
});

const oneOf =
  <T extends string | number>(allowed: readonly T[]) =>
  (value: unknown): T | undefined =>
    allowed.find((candidate) => candidate === value);

const bool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const speed = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= MIN_SPEED && value <= MAX_SPEED
    ? normalizeSpeed(value)
    : undefined;

const parsers: { [K in SettingKey]: (value: unknown) => Settings[K] | undefined } = {
  theme: oneOf(THEMES),
  defaultSpeed: speed,
  skipBackSeconds: oneOf(SKIP_BACK_OPTIONS),
  skipForwardSeconds: oneOf(SKIP_FORWARD_OPTIONS),
  autoRewind: bool,
  continueToNextChapter: bool,
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(parsers, key);
}

/** The value if it is valid for the key, otherwise `undefined`. */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): Settings[K] | undefined {
  return parsers[key](raw);
}

/** Defaults overlaid with every saved row that is a known key with a valid value. */
export function resolveSettings(rows: readonly { key: string; value: unknown }[]): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (!isSettingKey(key)) continue;
    const parsed = parseSetting(key, value);
    if (parsed !== undefined) (settings as unknown as Record<string, unknown>)[key] = parsed;
  }
  return settings;
}
