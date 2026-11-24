import type { AuthUser } from './account';
import { AccountStore, type AuthGateway } from './store';

export const TEST_USER: AuthUser = {
  id: 'u1',
  email: 'sasha@example.com',
  user_metadata: { full_name: 'Oleksandr Klymenko' },
};

/** An `AccountStore` over a fake auth service: `user` is who is signed in at the start. */
export function fakeAccountStore(user: AuthUser | null, overrides: Partial<AuthGateway> = {}) {
  const gateway: AuthGateway = {
    loadUser: async () => user,
    onChange: () => () => undefined,
    signInWithGoogle: async () => ({ error: null }),
    signOut: async () => undefined,
    markWelcomeSeen: async () => undefined,
    ...overrides,
  };
  return { store: new AccountStore(gateway), gateway };
}
