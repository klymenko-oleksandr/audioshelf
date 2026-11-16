# features/catalogue

Home, Explore, Category, Book, Author, Search — the read path (Phase 3).

- `data/` — read queries (`queries.ts`, tested against an in-memory Postgres) and their cached
  versions for pages and route handlers (`index.ts`, tag `catalogue`). `continue-books.ts` is
  the browser side of `GET /api/catalogue/books?ids=`.
- `progress.ts` — pure helpers that turn saved progress into what screens show (which books
  are in "Continue listening", which chapters are finished).
- `components/` — `BookCard` (presentational) and `CatalogueCard` (wired to the player and
  saved progress); Home pieces (`HomeSection`, `BookRow`, `ContinueListening`,
  `HomeRowsSkeleton`); the Book page (`BookDetail`, `ChapterList`).

Catalogue pages are rendered on the server and carry no per-listener data. Progress lives on
the device, so anything that depends on it (progress bars, Resume, "Continue listening") is
filled in by client components.
