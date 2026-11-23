import { RiHeartFill, RiHeartLine, RiPlayListAddLine } from '@remixicon/react';
import { toast, type ToastInput } from '@/components/ui/toast';
import type { FlagKind, LibraryFlagsStore } from './store';

export type FlagToastKey = 'likeAdded' | 'likeRemoved' | 'laterAdded' | 'laterRemoved';

/** The toast texts, already in the interface language (`messages` → `flags`). */
export type FlagToastLabels = Record<FlagToastKey | 'undo', string>;

export function flagToastKey(kind: FlagKind, on: boolean): FlagToastKey {
  if (kind === 'like') return on ? 'likeAdded' : 'likeRemoved';
  return on ? 'laterAdded' : 'laterRemoved';
}

function toastIcon(kind: FlagKind, on: boolean) {
  if (kind === 'listenLater') return <RiPlayListAddLine size={18} />;
  return on ? <RiHeartFill size={18} /> : <RiHeartLine size={18} />;
}

/**
 * Flip a flag and tell the listener, with Undo (PRD: toast on add/remove, 8 s with an
 * action). The heart or button changes at once; the toast follows as soon as the write is
 * done. Undo gives no toast of its own: the control simply changes back.
 */
export async function toggleWithToast(
  store: Pick<LibraryFlagsStore, 'toggle'>,
  kind: FlagKind,
  bookId: string,
  labels: FlagToastLabels,
  show: (input: ToastInput) => number = toast,
): Promise<void> {
  const result = await store.toggle(kind, bookId);
  show({
    title: labels[flagToastKey(kind, result.on)],
    icon: toastIcon(kind, result.on),
    action: { label: labels.undo, onClick: () => void result.undo() },
  });
}
