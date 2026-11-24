import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import { AccountStore } from '../store';
import { fakeAccountStore, TEST_USER } from '../test-support';
import { resetAccountStoreForTests, setAccountStoreForTests } from '../use-account';
import { AccountCard } from './account-card';
import { AccountControl } from './account-control';
import { SigninView } from './signin-view';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const wrap = (ui: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => replace.mockClear());
afterEach(() => resetAccountStoreForTests());

describe('SigninView', () => {
  it('starts Google sign-in with the page to come back to', async () => {
    const signInWithGoogle = vi.fn(async () => ({ error: null }));
    setAccountStoreForTests(fakeAccountStore(null, { signInWithGoogle }).store);
    wrap(<SigninView next="/book/dracula" error={null} />);

    const button = await screen.findByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(signInWithGoogle).toHaveBeenCalledWith('/book/dracula');
    expect(await screen.findByRole('button', { name: 'Opening Google…' })).toBeDisabled();
  });

  it('shows an error and lets the listener try again when starting fails', async () => {
    const signInWithGoogle = vi.fn(async () => ({ error: new Error('nope') }));
    setAccountStoreForTests(fakeAccountStore(null, { signInWithGoogle }).store);
    wrap(<SigninView next="/" error={null} />);

    const button = await screen.findByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't sign you in");
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });

  it.each([
    ['cancelled', 'Sign-in was cancelled'],
    ['failed', "We couldn't sign you in"],
  ] as const)('shows the %s reason it was opened with', async (error, text) => {
    setAccountStoreForTests(fakeAccountStore(null).store);
    wrap(<SigninView next="/" error={error} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('is disabled with a note when sign-in is not set up, and still offers guest listening', async () => {
    setAccountStoreForTests(new AccountStore(null));
    wrap(<SigninView next="/library" error={null} />);
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Keep listening as a guest' })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  it('sends a signed-in listener on to where they were going', async () => {
    setAccountStoreForTests(fakeAccountStore(TEST_USER).store);
    wrap(<SigninView next="/library" error={null} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/library'));
  });

  it('closes to the same page as the guest link', async () => {
    setAccountStoreForTests(fakeAccountStore(null).store);
    wrap(<SigninView next="/settings" error={null} />);
    expect(await screen.findByRole('link', { name: 'Close' })).toHaveAttribute('href', '/settings');
  });
});

describe('AccountControl', () => {
  it('shows Sign in for a guest and the avatar for a signed-in listener', async () => {
    setAccountStoreForTests(fakeAccountStore(null).store);
    const { unmount } = wrap(<AccountControl />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
    unmount();
    resetAccountStoreForTests();

    setAccountStoreForTests(fakeAccountStore(TEST_USER).store);
    wrap(<AccountControl />);
    expect(await screen.findByRole('link', { name: 'Account and settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('does not offer sign-in when it is not set up', async () => {
    setAccountStoreForTests(new AccountStore(null));
    wrap(<AccountControl />);
    await act(async () => undefined);
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });
});

describe('AccountCard', () => {
  it('invites a guest to sign in and comes back to Settings', async () => {
    setAccountStoreForTests(fakeAccountStore(null).store);
    wrap(<AccountCard />);
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/signin?next=%2Fsettings',
    );
  });

  it('shows who is signed in and signs out', async () => {
    const signOut = vi.fn(async () => undefined);
    setAccountStoreForTests(fakeAccountStore(TEST_USER, { signOut }).store);
    wrap(<AccountCard />);
    expect(await screen.findByText('sasha@example.com')).toBeInTheDocument();
    expect(screen.getByText('Oleksandr Klymenko')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('renders nothing when sign-in is not set up', async () => {
    setAccountStoreForTests(new AccountStore(null));
    const { container } = wrap(<AccountCard />);
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });
});
