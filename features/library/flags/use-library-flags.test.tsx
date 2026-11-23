import { useEffect } from 'react';
import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { toastStore } from '@/components/ui/toast/store';
import { resetLocalDbForTests } from '@/lib/local-db/shared';
import en from '@/messages/en.json';
import { resetLibraryFlagsStoreForTests, useBookFlags } from './use-library-flags';

const renders = { count: 0 };

function Probe({ id }: { id: string }) {
  const flags = useBookFlags(id);
  useEffect(() => {
    renders.count += 1;
  });
  return (
    <div>
      <span data-testid={`state-${id}`}>
        {flags.ready ? 'ready' : 'loading'} {flags.liked ? 'liked' : 'not liked'}{' '}
        {flags.listenLater ? 'queued' : 'not queued'}
      </span>
      <button onClick={flags.toggleLike}>like {id}</button>
      <button onClick={flags.toggleListenLater}>later {id}</button>
    </div>
  );
}

function renderProbes(...ids: string[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ids.map((id) => (
        <Probe key={id} id={id} />
      ))}
    </NextIntlClientProvider>,
  );
}

afterEach(async () => {
  toastStore.dismiss('close');
  resetLibraryFlagsStoreForTests();
  resetLocalDbForTests();
  await indexedDB
    .databases()
    .then((dbs) => Promise.all(dbs.map((db) => indexedDB.deleteDatabase(db.name!))));
});

describe('useBookFlags', () => {
  it('becomes ready after storage is read, with nothing liked', async () => {
    renderProbes('a');
    await waitFor(() => expect(screen.getByTestId('state-a')).toHaveTextContent('ready not liked'));
  });

  it('a tap shows the heart at once and a toast with Undo follows', async () => {
    const user = userEvent.setup();
    renderProbes('a');
    await waitFor(() => expect(screen.getByTestId('state-a')).toHaveTextContent('ready'));

    await user.click(screen.getByRole('button', { name: 'like a' }));
    expect(screen.getByTestId('state-a')).toHaveTextContent('liked');

    await waitFor(() => expect(toastStore.getSnapshot()?.title).toBe('Added to Liked'));
    expect(toastStore.getSnapshot()?.action?.label).toBe('Undo');
  });

  it('Undo from the toast puts the control back', async () => {
    const user = userEvent.setup();
    renderProbes('a');
    await waitFor(() => expect(screen.getByTestId('state-a')).toHaveTextContent('ready'));

    await user.click(screen.getByRole('button', { name: 'later a' }));
    await waitFor(() => expect(toastStore.getSnapshot()?.title).toBe('Added to Listen later'));
    await act(async () => toastStore.runAction());

    await waitFor(() => expect(screen.getByTestId('state-a')).toHaveTextContent('not queued'));
  });

  it('a book re-renders only when its own flags change', async () => {
    const user = userEvent.setup();
    renderProbes('a', 'b');
    await waitFor(() => expect(screen.getByTestId('state-a')).toHaveTextContent('ready'));
    await waitFor(() => expect(screen.getByTestId('state-b')).toHaveTextContent('ready'));

    const before = renders.count;
    await user.click(screen.getByRole('button', { name: 'like a' }));
    await waitFor(() => expect(screen.getByTestId('state-a')).toHaveTextContent('liked'));
    // One render for "a" (and its click), none for "b".
    expect(renders.count - before).toBeLessThanOrEqual(2);
    expect(screen.getByTestId('state-b')).toHaveTextContent('not liked');
  });
});
