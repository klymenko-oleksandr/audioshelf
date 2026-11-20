'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid grow place-items-center p-8">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <h1 className="font-heading text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          The page could not be loaded. Nothing was changed.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
