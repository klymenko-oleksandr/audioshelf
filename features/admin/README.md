# features/admin

Admin panel (Phase 4). English only, desktop first, outside the listener shell (`app/(admin)`).

- 4a (done): login, books list with KPIs, status tabs, search, category filter, "Needs attention".
- 4b (done): add / edit book (`/admin/books/new`, `/admin/books/[id]`), no cover upload. Rules in `book-form/values.ts`
  (what a save accepts, one message per field), slugs in `book-form/unique-slug.ts`, saving in `data/book-form.ts`
  (all or nothing; slug made once from the title and never changed), form in `components/book-form.tsx`, server action
  in `app/(admin)/admin/(panel)/books/actions.ts`. Unsaved-changes protection: `book-form/use-unsaved-changes.ts`.
- Every admin change must call `revalidateCatalogue()` (`revalidate.ts`) so the `catalogue` cache tag refreshes.
- `attention.ts` holds the "Needs attention" rules; `data/books.ts` the list query.
