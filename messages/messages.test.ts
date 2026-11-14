import { describe, expect, it } from 'vitest';
import en from './en.json';
import uk from './uk.json';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message files', () => {
  it('uk and en define exactly the same keys', () => {
    expect(keyPaths(uk).sort()).toEqual(keyPaths(en).sort());
  });
});
