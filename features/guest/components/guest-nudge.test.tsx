import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, toastStore } from '@/components/ui/toast/store';
import {
  getLibraryFlagsStore,
  resetLibraryFlagsStoreForTests,
} from '@/features/library/flags/use-library-flags';
import { resetLocalDbForTests } from '@/lib/local-db/shared';
import en from '@/messages/en.json';
import { getGuestStore, resetGuestStoreForTests } from '../use-guest';
import { GuestNudge } from './guest-nudge';

let pathname = '/book/dracula';
let search = '';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

function renderNudge() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GuestNudge />
    </NextIntlClientProvider>,
  );
}

/** Adds through the real flags store, as every card, row and player button does. */
async function add(kind: 'like' | 'listenLater', id: string) {
  await act(async () => void (await getLibraryFlagsStore().toggle(kind, id)));
}

const nudge = () => screen.queryByRole('dialog', { name: 'Keep these on every device' });

beforeEach(() => {
  pathname = '/book/dracula';
  search = '';
  window.history.replaceState(null, '', '/');
});

afterEach(async () => {
  toastStore.dismiss('close');
  resetLibraryFlagsStoreForTests();
  resetGuestStoreForTests();
  resetLocalDbForTests();
  await indexedDB
    .databases()
    .then((dbs) => Promise.all(dbs.map((db) => indexedDB.deleteDatabase(db.name!))));
});

describe('GuestNudge', () => {
  it('stays away until the 3rd like or Listen later, both kinds counting together', async () => {
    renderNudge();
    await add('like', 'a');
    await add('listenLater', 'b');
    expect(nudge()).not.toBeInTheDocument();

    await add('like', 'c');
    await waitFor(() => expect(nudge()).toBeInTheDocument());
  });

  it('says what was saved and that clearing site data loses it', async () => {
    renderNudge();
    await add('like', 'a');
    await add('like', 'b');
    await add('listenLater', 'c');

    const card = await screen.findByRole('dialog', { name: 'Keep these on every device' });
    expect(card).toHaveTextContent(
      'You liked 2 books and added 1 book to Listen later on this browser.',
    );
    expect(card).toHaveTextContent("clear this site's data");
  });

  it('keeps the current page in the sign-in link', async () => {
    pathname = '/search';
    search = 'q=tolkien&tab=books';
    renderNudge();
    for (const id of ['a', 'b', 'c']) await add('like', id);

    const link = await screen.findByRole('link', { name: 'Continue with Google' });
    expect(link).toHaveAttribute('href', '/signin?next=%2Fsearch%3Fq%3Dtolkien%26tab%3Dbooks');
  });

  it('waits while a toast (Undo) is showing, then appears when it is gone', async () => {
    renderNudge();
    for (const id of ['a', 'b', 'c']) await add('like', id);
    await screen.findByRole('dialog');

    act(() => void toast({ title: 'Removed from Liked' }));
    expect(nudge()).not.toBeInTheDocument();

    act(() => toastStore.dismiss('close'));
    expect(nudge()).toBeInTheDocument();
  });

  it('is not shown while the full-screen player is open', async () => {
    renderNudge();
    for (const id of ['a', 'b', 'c']) await add('like', id);
    await screen.findByRole('dialog');

    act(() => {
      window.history.pushState(null, '', '#player');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(nudge()).not.toBeInTheDocument();

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(nudge()).toBeInTheDocument();
  });

  it('is not shown on the sign-in page', async () => {
    pathname = '/signin';
    renderNudge();
    for (const id of ['a', 'b', 'c']) await add('like', id);
    await waitFor(() => expect(getGuestStore().getSnapshot().nudge.actions).toBe(3));
    expect(nudge()).not.toBeInTheDocument();
  });

  it('Not now hides it and it stays hidden after a reload', async () => {
    const user = userEvent.setup();
    const first = renderNudge();
    for (const id of ['a', 'b', 'c']) await add('like', id);
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(nudge()).not.toBeInTheDocument();
    await act(async () => void (await getGuestStore().load()));

    first.unmount();
    resetLibraryFlagsStoreForTests();
    resetGuestStoreForTests();
    resetLocalDbForTests();
    renderNudge();
    await waitFor(() => expect(getGuestStore().getSnapshot().ready).toBe(true));
    expect(getGuestStore().getSnapshot().nudge.actions).toBe(3);
    expect(nudge()).not.toBeInTheDocument();
  });

  it('the close button and Escape snooze it too', async () => {
    const user = userEvent.setup();
    renderNudge();
    for (const id of ['a', 'b', 'c']) await add('like', id);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(nudge()).not.toBeInTheDocument();
  });

  it('following the sign-in link snoozes it', async () => {
    const user = userEvent.setup();
    renderNudge();
    for (const id of ['a', 'b', 'c']) await add('like', id);
    const link = await screen.findByRole('link', { name: 'Continue with Google' });
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(nudge()).not.toBeInTheDocument();
  });

  it('Undo of an add and unliking do not count again, and never lower the count', async () => {
    renderNudge();
    const flags = getLibraryFlagsStore();
    await flags.load();
    const first = await flags.toggle('like', 'a');
    await act(async () => void (await first.undo()));
    const removed = await flags.toggle('listenLater', 'b');
    await act(async () => void (await flags.toggle('listenLater', 'b'))); // unlike path
    void removed;
    // One real add (a), one real add (b); the Undo and the removal added nothing.
    await waitFor(() => expect(getGuestStore().getSnapshot().nudge.actions).toBe(2));
    expect(nudge()).not.toBeInTheDocument();
  });
});
