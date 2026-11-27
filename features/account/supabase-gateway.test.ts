// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseGateway } from './supabase-gateway';

function client(session: unknown, error: unknown = null) {
  let emit: (event: string, session: unknown) => void = () => {};
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session }, error }),
      onAuthStateChange: (callback: typeof emit) => {
        emit = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  } as unknown as SupabaseClient;
  return {
    gateway: createSupabaseGateway(supabase, () => 'http://test'),
    emit: (event: string, next: unknown) => emit(event, next),
  };
}

describe('the Supabase gateway and an unreadable session', () => {
  it('throws instead of saying nobody is signed in', async () => {
    const { gateway } = client(null, new Error('fetch failed'));
    await expect(gateway.loadUser()).rejects.toThrow('fetch failed');
  });

  it('ignores the first event, which says "nobody" in that case too', () => {
    const { gateway, emit } = client(null);
    const callback = vi.fn();
    gateway.onChange(callback);
    emit('INITIAL_SESSION', null);
    expect(callback).not.toHaveBeenCalled();
    emit('SIGNED_OUT', null);
    expect(callback).toHaveBeenCalledWith(null);
  });
});
