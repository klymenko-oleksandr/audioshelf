// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ToastInput } from '@/components/ui/toast';
import { flagToastKey, toggleWithToast } from './actions';
import type { FlagKind, ToggleResult } from './store';

const labels = {
  likeAdded: 'Added to Liked',
  likeRemoved: 'Removed from Liked',
  laterAdded: 'Added to Listen later',
  laterRemoved: 'Removed from Listen later',
  undo: 'Undo',
};

function fakeStore(on: boolean) {
  const undo = vi.fn(async () => true);
  const toggle = vi.fn(async (kind: FlagKind, bookId: string): Promise<ToggleResult> => ({
    kind,
    bookId,
    on,
    undo,
  }));
  return { store: { toggle }, toggle, undo };
}

describe('flagToastKey', () => {
  it('names the message for each flag and direction', () => {
    expect(flagToastKey('like', true)).toBe('likeAdded');
    expect(flagToastKey('like', false)).toBe('likeRemoved');
    expect(flagToastKey('listenLater', true)).toBe('laterAdded');
    expect(flagToastKey('listenLater', false)).toBe('laterRemoved');
  });
});

describe('toggleWithToast', () => {
  it('toggles the flag, then shows a toast with Undo', async () => {
    const { store, toggle } = fakeStore(true);
    const show = vi.fn<(input: ToastInput) => number>(() => 1);

    await toggleWithToast(store, 'like', 'book-1', labels, show);

    expect(toggle).toHaveBeenCalledWith('like', 'book-1');
    expect(show).toHaveBeenCalledTimes(1);
    const toast = show.mock.calls[0]![0];
    expect(toast.title).toBe('Added to Liked');
    expect(toast.action?.label).toBe('Undo');
    expect(toast.icon).toBeDefined();
  });

  it('says "Removed" for a removal, and also offers Undo', async () => {
    const { store } = fakeStore(false);
    const show = vi.fn<(input: ToastInput) => number>(() => 1);

    await toggleWithToast(store, 'listenLater', 'book-1', labels, show);

    const toast = show.mock.calls[0]![0];
    expect(toast.title).toBe('Removed from Listen later');
    expect(toast.action?.label).toBe('Undo');
  });

  it('Undo runs the toggle result’s undo and shows no second toast', async () => {
    const { store, undo } = fakeStore(true);
    const show = vi.fn<(input: ToastInput) => number>(() => 1);

    await toggleWithToast(store, 'like', 'book-1', labels, show);
    show.mock.calls[0]![0].action!.onClick();

    expect(undo).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
  });
});
