import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from './config';

describe('readSupabaseConfig', () => {
  it('accepts a project URL and a key', () => {
    expect(readSupabaseConfig('https://abc.supabase.co/', ' sb_publishable_x ')).toEqual({
      url: 'https://abc.supabase.co',
      publishableKey: 'sb_publishable_x',
    });
  });

  it('is off when something is missing or malformed', () => {
    expect(readSupabaseConfig(undefined, 'k')).toBeNull();
    expect(readSupabaseConfig('https://abc.supabase.co', undefined)).toBeNull();
    expect(readSupabaseConfig('https://abc.supabase.co', '  ')).toBeNull();
    expect(readSupabaseConfig('not a url', 'k')).toBeNull();
    expect(readSupabaseConfig('http://abc.supabase.co', 'k')).toBeNull();
    expect(readSupabaseConfig('', 'k')).toBeNull();
  });

  it('allows plain http for a local Supabase', () => {
    expect(readSupabaseConfig('http://localhost:54321', 'k')?.url).toBe('http://localhost:54321');
  });
});
