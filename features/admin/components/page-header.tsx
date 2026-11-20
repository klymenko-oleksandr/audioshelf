import type { ReactNode } from 'react';

/** The 64 px bar at the top of every admin page: title, a quiet summary, actions on the right. */
export function PageHeader({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-border flex h-16 shrink-0 items-center gap-3 border-b px-8">
      <h1 className="font-heading text-xl font-semibold">{title}</h1>
      {summary && <span className="text-muted-foreground text-xs">{summary}</span>}
      <div className="grow" />
      {children}
    </header>
  );
}
