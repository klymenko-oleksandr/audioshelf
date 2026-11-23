'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Shown once after a book is deleted; the `?deleted=` part of the address is dropped at once. */
export function DeletedNotice({ title }: { title: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    window.history.replaceState(null, '', '/admin/books');
  }, []);
  if (!shown) return null;
  return (
    <div
      role="status"
      className="bg-muted flex items-center gap-3 rounded-lg px-4 py-2.5 text-[13px]"
    >
      <span>“{title}” was deleted. Listeners no longer see it; it is kept in the database.</span>
      <div className="grow" />
      <Button type="button" variant="ghost" size="sm" onClick={() => setShown(false)}>
        Dismiss
      </Button>
    </div>
  );
}
