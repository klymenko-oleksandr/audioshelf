import type { ReactNode } from 'react';

/** Temporary body for routes whose real screens arrive in later phases. */
export function PagePlaceholder({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-2 pb-6 md:px-6 md:pt-5 lg:px-8 lg:pt-7">
      <h1 className="font-heading text-[26px] leading-8 font-semibold tracking-[-0.02em] md:text-[30px] md:leading-9 md:tracking-[-0.025em]">
        {title}
      </h1>
      <p className="text-muted-foreground max-w-prose">{note}</p>
      {children}
    </div>
  );
}
