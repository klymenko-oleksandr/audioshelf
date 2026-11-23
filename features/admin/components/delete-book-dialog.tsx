'use client';

import { RiDeleteBinLine, RiErrorWarningLine } from '@remixicon/react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import {
  deleteBookAction,
  unpublishBookAction,
} from '@/app/(admin)/admin/(panel)/books/[id]/publish-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmationMatches } from '../delete-book/confirmation';

/**
 * Delete a book behind a typed title (canvas: AdminDelete). It is a soft delete: listeners and
 * search stop seeing the book, the data stays in the database. A native `<dialog>` gives focus
 * trapping and Escape for free. It sits outside the book form, so Enter here can never save it.
 */
export function DeleteBookDialog({
  open,
  onClose,
  bookId,
  title,
  published,
}: {
  open: boolean;
  onClose: () => void;
  bookId: string;
  title: string;
  published: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-book-title"
      onClose={onClose}
      className="border-border bg-card text-card-foreground m-auto w-[480px] max-w-[calc(100vw-2rem)] rounded-xl border p-0 shadow-lg backdrop:bg-black/40"
    >
      {open && <Body bookId={bookId} title={title} published={published} onClose={onClose} />}
    </dialog>
  );
}

function Body({
  bookId,
  title,
  published,
  onClose,
}: {
  bookId: string;
  title: string;
  published: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirmationMatches(typed, title);

  async function confirm() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteBookAction(bookId, typed);
      if (result.ok) {
        router.push(`/admin/books?deleted=${encodeURIComponent(title)}`);
        return;
      }
      setError(result.message);
    } catch {
      setError('Something went wrong. Nothing was changed. Try again in a moment.');
    }
    setBusy(false);
  }

  async function unpublishInstead() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await unpublishBookAction(bookId);
      if (result.ok) {
        onClose();
        router.refresh();
      } else setError(result.message);
    } catch {
      setError('Something went wrong. Nothing was changed. Try again in a moment.');
    }
    setBusy(false);
  }

  return (
    <div
      className="flex flex-col gap-4 p-6"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          void confirm();
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="delete-book-title" className="font-heading text-lg font-semibold">
          Delete “{title}”?
        </h2>
        <p className="text-muted-foreground text-[13px]">
          Listeners will no longer see this book, and it disappears from search. Its tracks,
          chapters and files stay in the database, so it can be restored there.
        </p>
      </div>

      {published && (
        <p className="bg-muted flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[13px]">
          <span>Want to hide it for now? Unpublishing keeps everything and can be reversed.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={unpublishInstead}
          >
            Unpublish instead
          </Button>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-[13px] font-medium">
          Type <span className="font-semibold">{title}</span> to confirm
        </label>
        <Input
          id={inputId}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(null);
          }}
          autoComplete="off"
          autoFocus
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <span role="alert" className="text-destructive flex items-start gap-1.5 text-xs">
            <RiErrorWarningLine size={14} aria-hidden className="mt-px shrink-0" />
            {error}
          </span>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={!matches || busy} onClick={confirm}>
          <RiDeleteBinLine aria-hidden />
          {busy ? 'Deleting…' : 'Delete book'}
        </Button>
      </div>
    </div>
  );
}
