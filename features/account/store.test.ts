import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from './account';
import { AccountStore, type AuthGateway } from './store';

const sasha: AuthUser = {
  id: 'u1',
  email: 'sasha@example.com',
  user_metadata: { full_name: 'Oleksandr Klymenko' },
};

function fakeGateway(initial: AuthUser | null = null) {
  let listener: ((user: AuthUser | null) => void) | undefined;
  const gateway: AuthGateway = {
    loadUser: vi.fn(async () => initial),
    onChange: vi.fn((callback) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    }),
    signInWithGoogle: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => {
      listener?.(null);
    }),
    markWelcomeSeen: vi.fn(async () => undefined),
  };
  return { gateway, emit: (user: AuthUser | null) => listener?.(user) };
}

describe('AccountStore', () => {
  it('starts loading, then is a guest when nobody is signed in', async () => {
    const { gateway } = fakeGateway(null);
    const store = new AccountStore(gateway);
    expect(store.getSnapshot()).toMatchObject({ status: 'loading', available: true });
    await store.load();
    expect(store.getSnapshot()).toMatchObject({ status: 'guest', account: null });
  });

  it('is signed in when a session exists', async () => {
    const store = new AccountStore(fakeGateway(sasha).gateway);
    await store.load();
    const snapshot = store.getSnapshot();
    expect(snapshot.status).toBe('signedIn');
    expect(snapshot.account).toMatchObject({ id: 'u1', name: 'Oleksandr Klymenko' });
  });

  it('follows sign-in and sign-out from elsewhere (another tab, a refreshed session)', async () => {
    const { gateway, emit } = fakeGateway(null);
    const store = new AccountStore(gateway);
    await store.load();
    emit(sasha);
    expect(store.getSnapshot().status).toBe('signedIn');
    emit(null);
    expect(store.getSnapshot().status).toBe('guest');
  });

  it('keeps the snapshot identity while nothing changed', async () => {
    const { gateway, emit } = fakeGateway(sasha);
    const store = new AccountStore(gateway);
    await store.load();
    const before = store.getSnapshot();
    emit({ ...sasha });
    expect(store.getSnapshot()).toBe(before);
  });

  it('tells subscribers about changes only', async () => {
    const { gateway, emit } = fakeGateway(null);
    const store = new AccountStore(gateway);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load();
    const calls = listener.mock.calls.length;
    emit(sasha);
    expect(listener.mock.calls.length).toBe(calls + 1);
  });

  it('is a plain guest and says sign-in is unavailable without a gateway', async () => {
    const store = new AccountStore(null);
    await store.load();
    expect(store.getSnapshot()).toEqual({ status: 'guest', account: null, available: false });
    expect(await store.signIn('/')).toEqual({ ok: false, reason: 'unavailable' });
    await expect(store.signOut()).resolves.toBeUndefined();
    await expect(store.markWelcomeSeen()).resolves.toBeUndefined();
  });

  it('a failed session read leaves a guest, not a stuck loading state', async () => {
    const { gateway } = fakeGateway(null);
    gateway.loadUser = vi.fn(async () => {
      throw new Error('offline');
    });
    const store = new AccountStore(gateway);
    await store.load();
    expect(store.getSnapshot().status).toBe('guest');
  });

  it('signIn passes next on and reports a refused start', async () => {
    const { gateway } = fakeGateway(null);
    const store = new AccountStore(gateway);
    await store.load();
    expect(await store.signIn('/library')).toEqual({ ok: true });
    expect(gateway.signInWithGoogle).toHaveBeenCalledWith('/library');

    gateway.signInWithGoogle = vi.fn(async () => ({ error: 'nope' }));
    expect(await store.signIn('/')).toEqual({ ok: false, reason: 'failed' });
    gateway.signInWithGoogle = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await store.signIn('/')).toEqual({ ok: false, reason: 'failed' });
  });

  it('signOut ends the session and returns to guest', async () => {
    const { gateway } = fakeGateway(sasha);
    const store = new AccountStore(gateway);
    await store.load();
    await store.signOut();
    expect(store.getSnapshot().status).toBe('guest');
  });

  it('a failing sign-out still leaves the listener signed out in the UI', async () => {
    const { gateway } = fakeGateway(sasha);
    gateway.signOut = vi.fn(async () => {
      throw new Error('network');
    });
    const store = new AccountStore(gateway);
    await store.load();
    await store.signOut();
    expect(store.getSnapshot().status).toBe('guest');
  });

  it('markWelcomeSeen tells the account once and shows at once', async () => {
    const { gateway } = fakeGateway(sasha);
    const store = new AccountStore(gateway, () => 1700000000000);
    await store.load();
    await store.markWelcomeSeen();
    await store.markWelcomeSeen();
    expect(gateway.markWelcomeSeen).toHaveBeenCalledTimes(1);
    expect(gateway.markWelcomeSeen).toHaveBeenCalledWith(1700000000000);
    expect(store.getSnapshot().account?.welcomeSeen).toBe(true);
  });

  it('markWelcomeSeen does nothing for a guest', async () => {
    const { gateway } = fakeGateway(null);
    const store = new AccountStore(gateway);
    await store.load();
    await store.markWelcomeSeen();
    expect(gateway.markWelcomeSeen).not.toHaveBeenCalled();
  });

  it('a failed markWelcomeSeen can be tried again later', async () => {
    const { gateway } = fakeGateway(sasha);
    gateway.markWelcomeSeen = vi
      .fn<AuthGateway['markWelcomeSeen']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const store = new AccountStore(gateway);
    await store.load();
    await store.markWelcomeSeen();
    await store.markWelcomeSeen();
    expect(gateway.markWelcomeSeen).toHaveBeenCalledTimes(2);
  });

  it('dispose stops listening', async () => {
    const { gateway, emit } = fakeGateway(null);
    const store = new AccountStore(gateway);
    await store.load();
    store.dispose();
    emit(sasha);
    expect(store.getSnapshot().status).toBe('guest');
  });
});
