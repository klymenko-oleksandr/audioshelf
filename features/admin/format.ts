import type { AdminBookRow } from './data/books';

/** The admin works in Kyiv time (PRD: Scheduling). */
const TIME_ZONE = 'Europe/Kyiv';

export function formatHours(seconds: number): string {
  return `${Math.round(seconds / 3600).toLocaleString('en-US')} h`;
}

export function formatTrackDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

function parts(date: Date, options: Intl.DateTimeFormatOptions) {
  const map: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    ...options,
  }).formatToParts(date)) {
    map[p.type] = p.value;
  }
  return map;
}

/** "Tue 29 Sep, 09:00" */
export function formatScheduled(date: Date): string {
  const p = parts(date, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** "12 Aug", or "12 Aug 2025" for another year. */
function formatDay(date: Date, now: Date): string {
  const p = parts(date, { day: 'numeric', month: 'short', year: 'numeric' });
  const sameYear = p.year === parts(now, { year: 'numeric' }).year;
  return sameYear ? `${p.day} ${p.month}` : `${p.day} ${p.month} ${p.year}`;
}

function formatAgo(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return formatDay(date, now);
}

const STATUS_LABEL = { published: 'Published', scheduled: 'Scheduled', draft: 'Draft' } as const;

/** The small grey line under a book's status in the list. */
export function statusNote(book: AdminBookRow, now: Date = new Date()): string {
  if (book.attentionNote) return `${STATUS_LABEL[book.status]} · ${book.attentionNote}`;
  switch (book.status) {
    case 'published':
      return book.publishedAt ? `Since ${formatDay(book.publishedAt, now)}` : '';
    case 'scheduled':
      return book.publishAt ? formatScheduled(book.publishAt) : 'No date set';
    case 'draft':
      return `Edited ${formatAgo(book.updatedAt, now)}`;
  }
}
