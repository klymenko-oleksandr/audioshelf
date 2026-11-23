import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AudioTracksCard } from '@/features/admin/components/audio-tracks-card';
import { BookReadinessProvider } from '@/features/admin/components/book-readiness';
import { BookForm } from '@/features/admin/components/book-form';
import { getBookForEdit, getBookFormOptions } from '@/features/admin/data/book-form';
import { getBookTracks } from '@/features/admin/tracks/data';
import { requireAdminSession } from '@/lib/auth/admin/guard';
import { readDb } from '@/lib/db';
import { timed } from '@/lib/perf';

export const metadata: Metadata = { title: 'Edit book' };

/** Canvas: AdminEdit. An unknown, deleted or malformed id is the admin's own 404. */
export default async function EditBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [book, options, tracks] = await timed('page.book-edit', () =>
    readDb('page.book-edit', (db) =>
      Promise.all([getBookForEdit(db, id), getBookFormOptions(db), getBookTracks(db, id)]),
    ),
  );
  if (!book) notFound();

  const readyTracks = tracks.tracks.filter((track) => track.status === 'ready').length;

  return (
    <BookReadinessProvider key={book.id} initialReadyTracks={readyTracks}>
      <BookForm
        book={book}
        options={options}
        created={query.created === '1'}
        tracks={<AudioTracksCard bookId={book.id} bookStatus={book.status} initial={tracks} />}
      />
    </BookReadinessProvider>
  );
}
