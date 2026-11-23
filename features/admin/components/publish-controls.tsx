'use client';

import { RiEyeOffLine, RiGlobalLine } from '@remixicon/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  publishBookAction,
  unpublishBookAction,
} from '@/app/(admin)/admin/(panel)/books/[id]/publish-actions';
import { Button } from '@/components/ui/button';
import { describeMissing, findMissing, type PublishCandidate } from '../publish/rules';

/**
 * Publish / Unpublish in the book header, with what is still missing next to the button. The
 * button reads the saved values (the server publishes what is saved) and the server checks the
 * same rules again, so this is a convenience, not the lock.
 */
export function PublishControls({
  bookId,
  status,
  candidate,
  dirty,
}: {
  bookId: string;
  status: 'draft' | 'scheduled' | 'published';
  /** The book as last saved plus its ready tracks. */
  candidate: PublishCandidate;
  /** The form has changes that are not saved yet. */
  dirty: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: (id: string) => ReturnType<typeof publishBookAction>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await action(bookId);
      if (result.ok) router.refresh();
      else setError(result.message);
    } catch {
      setError('Something went wrong. Nothing was changed. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'published') {
    return (
      <>
        {error && (
          <span role="alert" className="text-destructive max-w-[34ch] text-right text-xs">
            {error}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => run(unpublishBookAction)}
        >
          <RiEyeOffLine aria-hidden />
          {busy ? 'Unpublishing…' : 'Unpublish'}
        </Button>
      </>
    );
  }

  const missing = findMissing(candidate);
  const note =
    error ??
    (missing.length > 0 ? describeMissing(missing) : dirty ? 'Save your changes first.' : null);
  const blocked = missing.length > 0 || dirty;

  return (
    <>
      {note && (
        <span
          role={error ? 'alert' : 'status'}
          data-testid="publish-note"
          className={`max-w-[34ch] text-right text-xs leading-tight ${error ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {note}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={busy || blocked}
        onClick={() => run(publishBookAction)}
      >
        <RiGlobalLine aria-hidden />
        {busy ? 'Publishing…' : status === 'scheduled' ? 'Publish now' : 'Publish'}
      </Button>
    </>
  );
}
