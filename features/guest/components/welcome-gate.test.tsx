import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAccountStore, TEST_USER } from '@/features/account/test-support';
import { resetAccountStoreForTests, setAccountStoreForTests } from '@/features/account/use-account';
import { getLocalDb, resetLocalDbForTests } from '@/lib/local-db/shared';
import en from '@/messages/en.json';
import { readWelcomeGate } from '../gate';
import { getGuestStore, resetGuestStoreForTests } from '../use-guest';
import { WELCOME_MIRROR_KEY } from '../welcome';
import { WelcomeGate } from './welcome-gate';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/i18n/actions', () => ({ setLocale: vi.fn() }));

const root = document.documentElement;

beforeEach(() => {
  // jsdom has no showModal; a modal dialog is an open one for these tests.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  localStorage.clear();
  delete root.dataset.welcome;
});

afterEach(async () => {
  resetAccountStoreForTests();
  resetGuestStoreForTests();
  resetLocalDbForTests();
  delete root.dataset.welcome;
  await indexedDB
    .databases()
    .then((dbs) => Promise.all(dbs.map((db) => indexedDB.deleteDatabase(db.name!))));
});

function renderGate() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WelcomeGate />
    </NextIntlClientProvider>,
  );
}

const welcome = () => screen.queryByRole('dialog', { name: /Stories that remember/ });
const seenInDexie = async () => (await getLocalDb().meta.get('welcomeSeenAt'))?.value !== undefined;

describe('WelcomeGate', () => {
  it('shows nothing on a deep link or a repeat visit (the page script set no attribute)', async () => {
    renderGate();
    await waitFor(() => expect(getGuestStore().getSnapshot().ready).toBe(true));
    expect(welcome()).not.toBeInTheDocument();
    expect(readWelcomeGate()).toBeUndefined();
  });

  it('shows the welcome on the first visit and hands the splash over', async () => {
    root.dataset.welcome = 'pending';
    renderGate();
    expect(
      await screen.findByRole('dialog', { name: /Stories that remember/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(readWelcomeGate()).toBe('open'));
  });

  it('Skip counts as seen: closes, is remembered in Dexie and in the page mirror', async () => {
    const user = userEvent.setup();
    root.dataset.welcome = 'pending';
    renderGate();
    await screen.findByRole('dialog');

    // The phone layout has its own Skip; either one ends it.
    await user.click(screen.getAllByRole('button', { name: 'Skip' })[0]!);
    expect(welcome()).not.toBeInTheDocument();
    expect(readWelcomeGate()).toBeUndefined();
    expect(localStorage.getItem(WELCOME_MIRROR_KEY)).toBe('1');
    await waitFor(async () => expect(await seenInDexie()).toBe(true));
  });

  it('finishing it ("Start listening") counts as seen too', async () => {
    const user = userEvent.setup();
    root.dataset.welcome = 'pending';
    renderGate();
    await user.click(await screen.findByRole('button', { name: /Start listening/ }));
    expect(welcome()).not.toBeInTheDocument();
    await waitFor(async () => expect(await seenInDexie()).toBe(true));
  });

  it('Escape skips it', async () => {
    root.dataset.welcome = 'pending';
    renderGate();
    const dialog = await screen.findByRole('dialog');
    act(() => void dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(welcome()).not.toBeInTheDocument();
  });

  it('the sign-in link keeps the home page and counts as seen', async () => {
    const user = userEvent.setup();
    root.dataset.welcome = 'pending';
    renderGate();
    const link = await screen.findByRole('link', { name: 'Sign in with Google' });
    expect(link).toHaveAttribute('href', '/signin?next=%2F');
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    await waitFor(async () => expect(await seenInDexie()).toBe(true));
  });

  it('is not shown when Dexie already says seen (the mirror was cleared on its own)', async () => {
    await getLocalDb().meta.put({ key: 'welcomeSeenAt', value: 123 });
    root.dataset.welcome = 'pending';
    renderGate();
    await waitFor(() => expect(readWelcomeGate()).toBeUndefined());
    expect(welcome()).not.toBeInTheDocument();
    expect(localStorage.getItem(WELCOME_MIRROR_KEY)).toBe('1');
  });

  it('is not shown to someone who already listened here before the welcome existed', async () => {
    await getLocalDb().progress.put({
      bookId: 'a',
      position: 60,
      duration: 600,
      speed: 1,
      finished: false,
      updatedAt: 1,
    });
    root.dataset.welcome = 'pending';
    renderGate();
    await waitFor(() => expect(readWelcomeGate()).toBeUndefined());
    expect(welcome()).not.toBeInTheDocument();
    await waitFor(async () => expect(await seenInDexie()).toBe(true));
  });

  it('closes when another tab skips it', async () => {
    root.dataset.welcome = 'pending';
    renderGate();
    await screen.findByRole('dialog');
    await act(async () => {
      await getLocalDb().meta.put({ key: 'welcomeSeenAt', value: 5 });
      await getGuestStore().load(); // what the ping from the other tab triggers
    });
    expect(welcome()).not.toBeInTheDocument();
  });

  describe('signed in: once per account', () => {
    it('does not welcome an account that has seen it on another device', async () => {
      setAccountStoreForTests(
        fakeAccountStore({ ...TEST_USER, user_metadata: { welcomeSeenAt: 123 } }).store,
      );
      root.dataset.welcome = 'pending';
      renderGate();
      await waitFor(() => expect(readWelcomeGate()).toBeUndefined());
      expect(welcome()).not.toBeInTheDocument();
      expect(localStorage.getItem(WELCOME_MIRROR_KEY)).toBe('1');
    });

    it('welcomes an account that has not, and tells the account when it is done', async () => {
      const user = userEvent.setup();
      const markWelcomeSeen = vi.fn(async () => undefined);
      setAccountStoreForTests(fakeAccountStore(TEST_USER, { markWelcomeSeen }).store);
      root.dataset.welcome = 'pending';
      renderGate();
      await screen.findByRole('dialog');
      await user.click(screen.getAllByRole('button', { name: 'Skip' })[0]!);
      expect(welcome()).not.toBeInTheDocument();
      await waitFor(() => expect(markWelcomeSeen).toHaveBeenCalledTimes(1));
    });

    it('waits for the account before deciding (no welcome flashing up for a returning account)', async () => {
      let release: (user: typeof TEST_USER | null) => void = () => undefined;
      const pending = new Promise<typeof TEST_USER | null>((resolve) => (release = resolve));
      setAccountStoreForTests(fakeAccountStore(null, { loadUser: () => pending }).store);
      root.dataset.welcome = 'pending';
      renderGate();
      await waitFor(() => expect(getGuestStore().getSnapshot().ready).toBe(true));
      expect(welcome()).not.toBeInTheDocument();
      expect(readWelcomeGate()).toBe('pending');
      await act(async () => release({ ...TEST_USER, user_metadata: { welcomeSeenAt: 1 } }));
      await waitFor(() => expect(readWelcomeGate()).toBeUndefined());
      expect(welcome()).not.toBeInTheDocument();
    });

    it('a guest who saw it and then signs in tells the account, so a new device skips it', async () => {
      const markWelcomeSeen = vi.fn(async () => undefined);
      localStorage.setItem(WELCOME_MIRROR_KEY, '1');
      setAccountStoreForTests(fakeAccountStore(TEST_USER, { markWelcomeSeen }).store);
      renderGate();
      await waitFor(() => expect(markWelcomeSeen).toHaveBeenCalledTimes(1));
    });
  });
});
