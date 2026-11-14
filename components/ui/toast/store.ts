import type { ReactNode } from 'react';

/**
 * Toast rules from the PRD:
 *  - one at a time; a new toast replaces the current one
 *  - 5 s, or 8 s when it has an action (Undo); errors stay until dismissed
 *  - the timer pauses while the toast is hovered or focused
 *
 * Framework-free so the rules can be unit-tested; <Toaster /> renders the current toast.
 */

export const TOAST_DURATION_MS = 5000;
export const TOAST_ACTION_DURATION_MS = 8000;

export type ToastVariant = 'default' | 'error';

/** Why a toast went away. "action" means the user pressed its button (e.g. Undo). */
export type ToastDismissReason = 'timeout' | 'close' | 'action' | 'replaced';

export interface ToastInput {
  title: string;
  description?: string;
  icon?: ReactNode;
  variant?: ToastVariant;
  action?: { label: string; onClick: () => void };
  /**
   * Called once when the toast goes away. Delayed work (deleting a removed download)
   * belongs here: run it for every reason except "action".
   */
  onDismiss?: (reason: ToastDismissReason) => void;
}

export interface Toast extends ToastInput {
  id: number;
  variant: ToastVariant;
}

type Listener = () => void;

export function createToastStore() {
  let current: Toast | null = null;
  let nextId = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let remaining = 0;
  let startedAt = 0;
  let paused = false;
  const listeners = new Set<Listener>();

  const emit = () => listeners.forEach((listener) => listener());

  function stopTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (!current || current.variant === 'error' || paused) return;
    startedAt = Date.now();
    timer = setTimeout(() => dismiss('timeout'), remaining);
  }

  function dismiss(reason: ToastDismissReason = 'close') {
    if (!current) return;
    const closing = current;
    stopTimer();
    current = null;
    paused = false;
    emit();
    closing.onDismiss?.(reason);
  }

  function show(input: ToastInput): number {
    if (current) dismiss('replaced');
    current = { ...input, id: nextId++, variant: input.variant ?? 'default' };
    remaining = input.action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS;
    paused = false;
    startTimer();
    emit();
    return current.id;
  }

  return {
    show,
    dismiss,
    /** Closes the toast with reason "action", then runs its action. */
    runAction() {
      if (!current?.action) return;
      const { onClick } = current.action;
      // Close first: the action may show a follow-up toast, which must not be the one dismissed.
      dismiss('action');
      onClick();
    },
    pause() {
      if (!current || paused) return;
      paused = true;
      if (timer !== null) {
        remaining = Math.max(0, remaining - (Date.now() - startedAt));
        stopTimer();
      }
    },
    resume() {
      if (!current || !paused) return;
      paused = false;
      startTimer();
    },
    getSnapshot: () => current,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type ToastStore = ReturnType<typeof createToastStore>;

/** The app-wide store. */
export const toastStore = createToastStore();

/** Show a toast from anywhere in client code. */
export function toast(input: ToastInput): number {
  return toastStore.show(input);
}
