import { describe, expect, it } from 'vitest';
import { canReorder, checkAppendOnly } from './append-only';

const t = (id: string, position: number, status: string) => ({ id, position, status });

describe('canReorder', () => {
  it('is allowed on a draft only', () => {
    expect(canReorder('draft')).toBe(true);
    expect(canReorder('published')).toBe(false);
    expect(canReorder('scheduled')).toBe(false);
  });
});

describe('checkAppendOnly', () => {
  const ready = [t('a', 1, 'ready'), t('b', 2, 'ready')];

  it('never blocks a draft: a part may be retried or completed anywhere in it', () => {
    const tracks = [t('f', 1, 'failed'), t('b', 2, 'ready')];
    expect(checkAppendOnly('draft', tracks, 'f')).toEqual({ ok: true });
  });

  it('allows a new part after every ready part of a published or scheduled book', () => {
    for (const status of ['published', 'scheduled'] as const) {
      expect(checkAppendOnly(status, [...ready, t('n', 3, 'uploading')], 'n')).toEqual({
        ok: true,
      });
    }
  });

  it('allows it when the parts before it are not ready (failed or uploading parts do not count)', () => {
    const tracks = [t('a', 1, 'ready'), t('f', 2, 'failed'), t('n', 3, 'uploading')];
    expect(checkAppendOnly('published', tracks, 'n')).toEqual({ ok: true });
  });

  it('blocks a part that would land before a part that is already ready, and says what to do', () => {
    const tracks = [t('a', 1, 'ready'), t('f', 2, 'failed'), t('c', 3, 'ready')];
    const result = checkAppendOnly('published', tracks, 'f');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/end of a published book/i);
      expect(result.message).toMatch(/remove/i);
    }
    expect(checkAppendOnly('scheduled', tracks, 'f').ok).toBe(false);
  });

  it('does not count the part itself, and an unknown part is not blocked', () => {
    expect(checkAppendOnly('published', [t('a', 1, 'ready')], 'a')).toEqual({ ok: true });
    expect(checkAppendOnly('published', ready, 'missing')).toEqual({ ok: true });
  });

  it('looks at the order the parts are in, not at the order of the list it was given', () => {
    const tracks = [t('c', 3, 'ready'), t('f', 2, 'failed'), t('a', 1, 'ready')];
    expect(checkAppendOnly('published', tracks, 'f').ok).toBe(false);
  });
});
