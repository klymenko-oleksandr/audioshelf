import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToastStore, type ToastDismissReason } from './store';

describe('toast store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows one toast and closes it after 5 s', () => {
    const store = createToastStore();
    const onDismiss = vi.fn<(reason: ToastDismissReason) => void>();
    store.show({ title: 'Added to Listen later', onDismiss });

    vi.advanceTimersByTime(4999);
    expect(store.getSnapshot()?.title).toBe('Added to Listen later');
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('timeout');
  });

  it('stays 8 s when it has an action', () => {
    const store = createToastStore();
    store.show({ title: 'Removed download', action: { label: 'Undo', onClick: () => {} } });

    vi.advanceTimersByTime(7999);
    expect(store.getSnapshot()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
  });

  it('keeps errors until they are dismissed', () => {
    const store = createToastStore();
    const onDismiss = vi.fn();
    store.show({ title: "Couldn't download", variant: 'error', onDismiss });

    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot()?.variant).toBe('error');

    store.dismiss();
    expect(store.getSnapshot()).toBeNull();
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('close');
  });

  it('replaces the current toast and tells it why', () => {
    const store = createToastStore();
    const first = vi.fn();
    store.show({ title: 'First', onDismiss: first });
    vi.advanceTimersByTime(3000);
    store.show({ title: 'Second' });

    expect(first).toHaveBeenCalledExactlyOnceWith('replaced');
    expect(store.getSnapshot()?.title).toBe('Second');

    // The second toast gets its own full 5 s, not the first one's leftover.
    vi.advanceTimersByTime(4999);
    expect(store.getSnapshot()?.title).toBe('Second');
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
  });

  it('pauses the timer while hovered and resumes with the time that was left', () => {
    const store = createToastStore();
    store.show({ title: 'Paused' });

    vi.advanceTimersByTime(3000);
    store.pause();
    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot()).not.toBeNull();

    store.resume();
    vi.advanceTimersByTime(1999);
    expect(store.getSnapshot()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
  });

  it('ignores repeated pause and resume calls', () => {
    const store = createToastStore();
    store.show({ title: 'Paused' });
    vi.advanceTimersByTime(1000);
    store.pause();
    store.pause();
    vi.advanceTimersByTime(10_000);
    store.resume();
    store.resume();
    vi.advanceTimersByTime(3999);
    expect(store.getSnapshot()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toBeNull();
  });

  it('runs the action and reports "action", so delayed deletes can be skipped', () => {
    const store = createToastStore();
    const undo = vi.fn();
    const onDismiss = vi.fn();
    store.show({ title: 'Removed download', action: { label: 'Undo', onClick: undo }, onDismiss });

    store.runAction();
    expect(undo).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('action');
    expect(store.getSnapshot()).toBeNull();

    vi.advanceTimersByTime(60_000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('keeps a follow-up toast shown by the action', () => {
    const store = createToastStore();
    store.show({
      title: 'Added to Listen later',
      action: { label: 'Undo', onClick: () => store.show({ title: 'Removed from Listen later' }) },
    });

    store.runAction();
    expect(store.getSnapshot()?.title).toBe('Removed from Listen later');
  });

  it('lets onDismiss show a follow-up toast', () => {
    const store = createToastStore();
    store.show({ title: 'First', onDismiss: () => store.show({ title: 'Follow-up' }) });
    vi.advanceTimersByTime(5000);
    expect(store.getSnapshot()?.title).toBe('Follow-up');
  });

  it('notifies subscribers on every change and stops after unsubscribe', () => {
    const store = createToastStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.show({ title: 'One' });
    store.dismiss();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.show({ title: 'Two' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('dismiss, pause, resume and runAction are safe with no toast', () => {
    const store = createToastStore();
    expect(() => {
      store.dismiss();
      store.pause();
      store.resume();
      store.runAction();
    }).not.toThrow();
  });
});
