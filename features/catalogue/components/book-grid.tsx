import type { BookSummary } from '../data/queries';
import { CatalogueCard } from './catalogue-card';

/** A fluid grid of book cards (PRD: auto-fill columns, 140 px minimum). */
export function BookGrid({ books }: { books: readonly BookSummary[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-5 lg:gap-x-6">
      {books.map((book) => (
        <CatalogueCard key={book.id} book={book} />
      ))}
    </div>
  );
}
