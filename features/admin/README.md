# features/admin

Admin panel (Phase 4). English only, desktop first, outside the listener shell (`app/(admin)`).

- 4a (done): login, books list with KPIs, status tabs, search, category filter, "Needs attention".
- 4b (done): add / edit book (`/admin/books/new`, `/admin/books/[id]`), no cover upload. Rules in `book-form/values.ts`
  (what a save accepts, one message per field), slugs in `book-form/unique-slug.ts`, saving in `data/book-form.ts`
  (all or nothing; slug made once from the title and never changed), form in `components/book-form.tsx`, server action
  in `app/(admin)/admin/(panel)/books/actions.ts`. Unsaved-changes protection: `book-form/use-unsaved-changes.ts`.
- 4d (done): publish rules, soft delete, categories (section below).
- Every admin change must call `revalidateCatalogue()` (`revalidate.ts`) so the `catalogue` cache tag refreshes.
- `attention.ts` holds the "Needs attention" rules; `data/books.ts` the list query.

## Tracks (`tracks/`)

Pure rules first, then the database layer, then the browser flow:

- `chapters.ts` — chapter maths (insert / cut book time, where a part starts).
- `multipart.ts` — files over 100 MB (up to 500 MB) are cut into 16 MiB parts: `splitIntoParts`,
  `validateCompletedParts`, `overallFraction`.
- `reorder.ts` — `planReorder`: new positions and rebuilt chapters (one per ready part, each
  keeping its title when it still maps to the same part). Drafts only.
- `append-only.ts` — a published or scheduled book only grows at the end: `canReorder`,
  `checkAppendOnly` (no part may become ready before a part that is already ready).
- `data.ts` — transactions (`beginTrackUpload`, `completeTrackUpload`, `reorderTracks`, …). Inside
  a transaction callback always use the transaction handle, never the outer `db`.
- `client/` — `upload-file.ts` (one file, start to finish), `multipart-upload.ts` (parts, retries,
  abort), `put-file.ts` (XHR with progress and cancel).

Every server action in `app/(admin)/admin/(panel)/books/[id]/track-actions.ts` checks
`getAdminSession()` and calls `revalidateCatalogue()` after a change (`track-actions.test.ts`).

## Publish, delete, categories (`publish/`, `delete-book/`, `categories/`)

- `publish/rules.ts` — what a book needs to go live (title, author, category, narrator, one ready
  track) and what is missing: `findMissing`, `describeMissing`. Cover is not a rule for now; add
  `'cover'` here when cover upload exists. `candidate.ts` builds the same input from saved values.
- `publish/data.ts` — `publishBook` / `unpublishBook`: lock the book, re-check the rules on the
  server, keep `published_at` from the first publish.
- `delete-book/` — `confirmationMatches` (typed title) and `softDeleteBook` (sets `deleted_at`
  only; restoring is done in the database).
- `categories/` — create, rename and delete. A category is in use while any book, even a deleted
  one, points to it. Slugs never change on rename.
- Every action checks `getAdminSession()` first and calls `revalidateCatalogue()` on success.
