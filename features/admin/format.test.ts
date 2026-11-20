import { describe, expect, it } from 'vitest';
import type { AdminBookRow } from './data/books';
import { formatHours, formatScheduled, formatTrackDuration, statusNote } from './format';

const NOW = new Date('2026-11-20T12:00:00Z');

describe('formatHours', () => {
  it('rounds to whole hours with thousands separators', () => {
    expect(formatHours(0)).toBe('0 h');
    expect(formatHours(4212 * 3600 + 900)).toBe('4,212 h');
    expect(formatHours(5400)).toBe('2 h');
  });
});

describe('formatTrackDuration', () => {
  it('shows hours and minutes, minutes only below an hour', () => {
    expect(formatTrackDuration(10 * 3600 + 24 * 60)).toBe('10 h 24 m');
    expect(formatTrackDuration(41 * 60)).toBe('41 m');
    expect(formatTrackDuration(0)).toBe('—');
  });
});

describe('formatScheduled', () => {
  it('writes the date and time in Kyiv time', () => {
    // 29 Sep is UTC+3, 1 Dec is UTC+2.
    expect(formatScheduled(new Date('2026-09-29T06:00:00Z'))).toBe('Tue 29 Sep, 09:00');
    expect(formatScheduled(new Date('2026-12-01T09:00:00Z'))).toBe('Tue 1 Dec, 11:00');
  });
});

const row = (patch: Partial<AdminBookRow>): AdminBookRow => ({
  id: '1',
  slug: 's',
  title: 't',
  status: 'published',
  author: null,
  narrator: null,
  categorySlug: null,
  categoryName: null,
  ongoing: false,
  trackCount: 0,
  durationSeconds: 0,
  publishAt: null,
  publishedAt: null,
  updatedAt: NOW,
  attention: [],
  attentionNote: '',
  ...patch,
});

describe('statusNote', () => {
  it('says since when a book is published', () => {
    expect(statusNote(row({ publishedAt: new Date('2026-08-12T10:00:00Z') }), NOW)).toBe(
      'Since 12 Aug',
    );
    expect(statusNote(row({ publishedAt: new Date('2025-08-12T10:00:00Z') }), NOW)).toBe(
      'Since 12 Aug 2025',
    );
    expect(statusNote(row({}), NOW)).toBe('');
  });

  it('gives the publishing time of a scheduled book', () => {
    expect(
      statusNote(row({ status: 'scheduled', publishAt: new Date('2026-12-01T09:00:00Z') }), NOW),
    ).toBe('Tue 1 Dec, 11:00');
    expect(statusNote(row({ status: 'scheduled' }), NOW)).toBe('No date set');
  });

  it('says how long ago a draft was edited', () => {
    const draft = (ms: number) => row({ status: 'draft', updatedAt: new Date(NOW.getTime() - ms) });
    expect(statusNote(draft(30_000), NOW)).toBe('Edited just now');
    expect(statusNote(draft(5 * 60_000), NOW)).toBe('Edited 5 min ago');
    expect(statusNote(draft(2 * 3600_000), NOW)).toBe('Edited 2 h ago');
    expect(statusNote(draft(3 * 24 * 3600_000), NOW)).toBe('Edited 17 Nov');
  });

  it('puts the problem after the status when a book needs attention', () => {
    expect(
      statusNote(
        row({
          status: 'draft',
          attention: [{ kind: 'failed-track', positions: [4] }],
          attentionNote: 'Track 4 failed',
        }),
        NOW,
      ),
    ).toBe('Draft · Track 4 failed');
    expect(
      statusNote(
        row({ attention: [{ kind: 'no-ready-track' }], attentionNote: 'No ready track' }),
        NOW,
      ),
    ).toBe('Published · No ready track');
  });
});
