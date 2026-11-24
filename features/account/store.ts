import { accountFromUser, type Account, type AuthUser } from './account';

/** What the store needs from the auth service (Supabase in the app, a fake in tests). */
export interface AuthGateway {
  /** The signed-in user from the stored session, or `null`. */
  loadUser(): Promise<AuthUser | null>;
  /** Called when the session changes (sign-in, sign-out, a refresh, another tab). */
  onChange(callback: (user: AuthUser | null) => void): () => void;
  /** Starts the Google sign-in: the browser leaves the page. `error` is set when it could not start. */
  signInWithGoogle(next: string): Promise<{ error: unknown }>;
  signOut(): Promise<void>;
  /** Writes "welcome seen" on the account (user metadata). */
  markWelcomeSeen(at: number): Promise<void>;
}

export type AccountSnapshot =
  | { status: 'loading'; account: null; available: boolean }
  | { status: 'guest'; account: null; available: boolean }
  | { status: 'signedIn'; account: Account; available: true };

export type SignInResult = { ok: true } | { ok: false; reason: 'unavailable' | 'failed' };

function sameAccount(a: Account | null, b: Account | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.name === b.name &&
    a.avatarUrl === b.avatarUrl &&
    a.welcomeSeen === b.welcomeSeen
  );
}

/**
 * Who is listening: a guest or a signed-in account (Phase 6a). Framework-free, for
 * `useSyncExternalStore`. Without a gateway (sign-in not configured) everyone is a guest and
 * the app works as before. The snapshot keeps its identity until something really changes.
 */
export class AccountStore {
  private snapshot: AccountSnapshot;
  private readonly listeners = new Set<() => void>();
  private stop: (() => void) | undefined;
  private loading: Promise<void> | undefined;
  /** The account was already told about the welcome (so it is written once). */
  private welcomeTold = false;

  constructor(
    private readonly gateway: AuthGateway | null,
    private readonly now: () => number = Date.now,
  ) {
    this.snapshot = {
      status: gateway ? 'loading' : 'guest',
      account: null,
      available: gateway !== null,
    };
  }

  getSnapshot = (): AccountSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads the session once and then follows changes. Safe to call twice. */
  load(): Promise<void> {
    this.loading ??= this.start();
    return this.loading;
  }

  async signIn(next: string): Promise<SignInResult> {
    if (!this.gateway) return { ok: false, reason: 'unavailable' };
    try {
      const { error } = await this.gateway.signInWithGoogle(next);
      return error ? { ok: false, reason: 'failed' } : { ok: true };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

  async signOut(): Promise<void> {
    if (!this.gateway) return;
    try {
      await this.gateway.signOut();
    } catch (error) {
      console.warn('Sign-out did not reach the server.', error);
    }
    // Whatever the server said, this browser is a guest now.
    this.welcomeTold = false;
    this.set({ status: 'guest', account: null, available: true });
  }

  /** Tells the signed-in account that the welcome was seen. No-op for a guest; written once. */
  async markWelcomeSeen(): Promise<void> {
    const { account } = this.snapshot;
    if (!this.gateway || !account || this.welcomeTold) return;
    this.welcomeTold = true;
    try {
      await this.gateway.markWelcomeSeen(this.now());
    } catch (error) {
      this.welcomeTold = false;
      console.warn('Could not save "welcome seen" on the account.', error);
      return;
    }
    const current = this.snapshot.account;
    if (current && current.id === account.id) {
      this.set({ status: 'signedIn', account: { ...current, welcomeSeen: true }, available: true });
    }
  }

  dispose(): void {
    this.stop?.();
    this.stop = undefined;
    this.listeners.clear();
  }

  private async start(): Promise<void> {
    const gateway = this.gateway;
    if (!gateway) return;
    this.stop = gateway.onChange((user) => this.apply(user));
    try {
      this.apply(await gateway.loadUser());
    } catch (error) {
      console.warn('Could not read the session.', error);
      if (this.snapshot.status === 'loading') this.apply(null);
    }
  }

  private apply(user: AuthUser | null): void {
    const account = user ? accountFromUser(user) : null;
    const current = this.snapshot.account;
    if (account) {
      // A refreshed session carries the metadata from the server; keep a "seen" we just wrote.
      const merged =
        current?.id === account.id && current.welcomeSeen
          ? { ...account, welcomeSeen: true }
          : account;
      if (this.snapshot.status === 'signedIn' && sameAccount(current, merged)) return;
      this.set({ status: 'signedIn', account: merged, available: true });
      return;
    }
    if (this.snapshot.status === 'guest') return;
    if (current) this.welcomeTold = false;
    this.set({ status: 'guest', account: null, available: true });
  }

  private set(snapshot: AccountSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) listener();
  }
}
