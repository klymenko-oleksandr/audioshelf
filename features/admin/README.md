# features/admin

Admin panel (Phase 4). English only, desktop first, outside the listener shell (`app/(admin)`).

- 4a (done): login, books list with KPIs, status tabs, search, category filter, "Needs attention".
- Every admin change must call `revalidateCatalogue()` (`revalidate.ts`) so the `catalogue` cache tag refreshes.
- `attention.ts` holds the "Needs attention" rules; `data/books.ts` the list query.
