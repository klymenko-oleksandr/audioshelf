import type { ReactNode } from 'react';

/** One labelled setting: text on the left, the control on the right (stacked on narrow screens). */
export function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Card({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card border-border flex flex-col rounded-xl border px-4 py-3 md:px-5">
      <div className="flex items-center gap-2 pt-1">
        <h2 className="text-label">{title}</h2>
        {badge}
      </div>
      <div className="divide-border divide-y">{children}</div>
    </section>
  );
}
