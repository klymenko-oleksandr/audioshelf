# features/catalogue

Home, Explore, Category, Book, Author, Search — the read path (Phase 3).

- `data/` — read queries (`queries.ts`, tested against an in-memory Postgres) and their cached
  versions for pages and route handlers (`index.ts`, tag `catalogue`). `continue-books.ts` is
  the browser side of `GET /api/catalogue/books?ids=`.
- `sort.ts` — the sort orders of book lists (`?sort=newest|length|title`): parsing the URL
  value and sorting a list. Lists are sorted here, not in SQL, so titles follow the Ukrainian
  alphabet whatever the database collation is.
- `names.ts` — a category's name in the interface language, avatar initials for people.
- `progress.ts` — pure helpers that turn saved progress into what screens show (which books
  are in "Continue listening", which chapters are finished).
- `components/` — `BookCard` (presentational) and `CatalogueCard` (wired to the player and
  saved progress); Home pieces (`HomeSection`, `BookRow`, `ContinueListening`,
  `HomeRowsSkeleton`); the Book page (`BookDetail`, `ChapterList`); list pages (`BookGrid`,
  `ListToolbar`, `SortMenu`, `BookGridSkeleton`), category navigation (`CategoryChips` on Home,
  Explore and Category; `CategoryTiles` on the phone Explore) and the Author page
  (`AuthorDetail`).

Routes: `/` Home, `/explore` every book, `/category/:slug`, `/author/:slug`, `/book/:slug`.
Category and author pages count as Explore in the navigation. A category with no live books
has a page (it says so) but is never linked; an author with no live books is NotFound.

Catalogue pages are rendered on the server and carry no per-listener data. Progress lives on
the device, so anything that depends on it (progress bars, Resume, "Continue listening") is
filled in by client components.
