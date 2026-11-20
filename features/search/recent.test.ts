import { beforeEach, describe, expect, it } from 'vitest';
import { addRecent, clearRecent, MAX_RECENT, pushRecent, readRecent } from './recent';

describe('pushRecent', () => {
  it('puts the newest query first', () => {
    expect(pushRecent(['holmes'], 'shevchenko')).toEqual(['shevchenko', 'holmes']);
  });

  it('moves a repeat to the front, whatever its case or spacing', () => {
    expect(pushRecent(['a book', 'holmes'], '  HOLMES ')).toEqual(['HOLMES', 'a book']);
    expect(pushRecent(['holmes'], 'sherlock   holmes')).toEqual(['sherlock holmes', 'holmes']);
  });

  it('replaces an earlier entry that is the start of the new one', () => {
    expect(pushRecent(['hol', 'kobzar'], 'holmes')).toEqual(['holmes', 'kobzar']);
    // But not the other way round: a shorter query after a longer one is a new search.
    expect(pushRecent(['holmes'], 'hol')).toEqual(['hol', 'holmes']);
  });

  it('ignores blank queries', () => {
    expect(pushRecent(['holmes'], '   ')).toEqual(['holmes']);
  });

  it('keeps the last eight', () => {
    const list = Array.from({ length: 12 }, (_, i) => `q${i}`).reduce(
      (acc, q) => pushRecent(acc, q),
      [] as string[],
    );
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe('q11');
  });
});

describe('stored list', () => {
  beforeEach(() => localStorage.clear());

  it('survives between reads and clears', () => {
    expect(readRecent()).toEqual([]);
    addRecent('holmes');
    addRecent('kobzar');
    expect(readRecent()).toEqual(['kobzar', 'holmes']);
    expect(readRecent()).toBe(readRecent());
    clearRecent();
    expect(readRecent()).toEqual([]);
  });

  it('shrugs off damaged storage', () => {
    localStorage.setItem('audioshelf.recent-searches', '{not json');
    expect(readRecent()).toEqual([]);
    localStorage.setItem('audioshelf.recent-searches', '[1, "ok", null]');
    expect(readRecent()).toEqual(['ok']);
  });
});
