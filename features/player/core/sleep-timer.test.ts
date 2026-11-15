import { describe, expect, it } from 'vitest';
import {
  SLEEP_FADE_MS,
  sleepAtEndOfChapter,
  sleepExpired,
  sleepFadeVolume,
  sleepInMinutes,
  sleepRemainingMs,
} from './sleep-timer';

const NOW = 1_800_000_000_000;

describe('sleep timer — minutes', () => {
  it('ends the chosen number of minutes from now', () => {
    const timer = sleepInMinutes(15, NOW);
    expect(timer).toEqual({ kind: 'minutes', minutes: 15, endsAt: NOW + 15 * 60_000 });
    expect(sleepRemainingMs(timer, { now: NOW, position: 0, speed: 1 })).toBe(900_000);
    expect(sleepRemainingMs(timer, { now: NOW + 600_000, position: 0, speed: 2 })).toBe(300_000);
  });

  it('keeps the duration within 5–90 minutes', () => {
    expect(sleepInMinutes(1, NOW).minutes).toBe(5);
    expect(sleepInMinutes(500, NOW).minutes).toBe(90);
  });

  it('never goes negative once the time has passed', () => {
    const timer = sleepInMinutes(5, NOW);
    const remaining = sleepRemainingMs(timer, { now: NOW + 999_999, position: 0, speed: 1 });
    expect(remaining).toBe(0);
    expect(sleepExpired(remaining)).toBe(true);
  });
});

describe('sleep timer — end of chapter', () => {
  const timer = sleepAtEndOfChapter(1800);

  it('counts down the rest of the chapter', () => {
    expect(sleepRemainingMs(timer, { now: NOW, position: 1500, speed: 1 })).toBe(300_000);
  });

  it('accounts for playback speed: at 2× the chapter ends in half the time', () => {
    expect(sleepRemainingMs(timer, { now: NOW, position: 1500, speed: 2 })).toBe(150_000);
    expect(sleepRemainingMs(timer, { now: NOW, position: 1500, speed: 0.5 })).toBe(600_000);
  });

  it('expires when playback reaches or passes the chapter end', () => {
    expect(sleepRemainingMs(timer, { now: NOW, position: 1800, speed: 1 })).toBe(0);
    expect(sleepRemainingMs(timer, { now: NOW, position: 1900, speed: 1 })).toBe(0);
  });

  it('falls back to normal speed for a nonsensical speed', () => {
    expect(sleepRemainingMs(timer, { now: NOW, position: 1790, speed: 0 })).toBe(10_000);
  });
});

describe('sleep timer — 10 s fade-out', () => {
  it('stays at full volume until the last 10 s', () => {
    expect(sleepFadeVolume(60_000)).toBe(1);
    expect(sleepFadeVolume(SLEEP_FADE_MS)).toBe(1);
  });

  it('fades linearly to silence', () => {
    expect(sleepFadeVolume(7_500)).toBe(0.75);
    expect(sleepFadeVolume(5_000)).toBe(0.5);
    expect(sleepFadeVolume(1_000)).toBe(0.1);
    expect(sleepFadeVolume(0)).toBe(0);
    expect(sleepFadeVolume(-50)).toBe(0);
  });

  it('is not expired while any time is left', () => {
    expect(sleepExpired(1)).toBe(false);
    expect(sleepExpired(0)).toBe(true);
  });
});
