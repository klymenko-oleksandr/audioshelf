import { RiArrowLeftLine } from '@remixicon/react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Stands in for screens built in later steps of Phase 4, so the list's links lead somewhere. */
export function ComingNext({ children }: { children: ReactNode }) {
  return (
    <div className="grid grow place-items-center p-8">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <p className="text-muted-foreground text-sm">{children}</p>
        <Link
          href="/admin/books"
          className="text-brand flex items-center gap-1.5 text-[13px] font-medium"
        >
          <RiArrowLeftLine size={16} aria-hidden />
          Back to books
        </Link>
      </div>
    </div>
  );
}
