import type { AdminBooksTotals } from '../data/books';
import { formatScheduled } from '../format';

/** The four cards above the list (canvas: AdminBooks). Listens and completion arrive with play counts. */
export function BooksKpis({ totals }: { totals: AdminBooksTotals }) {
  const cards = [
    { label: 'Published', value: totals.published, note: `of ${totals.books} books` },
    { label: 'Drafts', value: totals.drafts, note: 'Not visible to listeners' },
    {
      label: 'Scheduled',
      value: totals.scheduled,
      note: totals.nextScheduledAt
        ? `Next: ${formatScheduled(totals.nextScheduledAt)}`
        : 'Nothing scheduled',
    },
    { label: 'Needs attention', value: totals.attention, note: 'Missing fields or failed tracks' },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-card border-border flex flex-col gap-1 rounded-xl border px-[18px] py-4 shadow-sm"
        >
          <span className="text-muted-foreground text-xs">{card.label}</span>
          <span className="font-heading text-[26px] leading-[30px] font-semibold tracking-[-0.02em] tabular-nums">
            {card.value}
          </span>
          <span className="text-muted-foreground text-[11px]">{card.note}</span>
        </div>
      ))}
    </div>
  );
}
