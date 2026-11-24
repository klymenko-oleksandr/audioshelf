# features/sync

Local-first store, outbox, push/pull, merge rules, conflict prompt (Phase 6). The server half
(6b) is here; nothing in the app calls it yet (the client arrives in 6c).

| File          | What                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| `merge.ts`    | Pure merge rules, clock correction, `planMerge`. The only place a merge is decided. |
| `request.ts`  | Pure strict parsing of the push body and the pull query; JSON/size limits.          |
| `data.ts`     | `applyPush(tx, …)` (one transaction, tx handle only) and `readChanges(db, …)`.      |
| `handlers.ts` | `handlePush` / `handlePull` with injected deps; same-origin, 401, status codes.     |

Routes: `app/api/sync/push/route.ts`, `app/api/sync/pull/route.ts`, bound to the real database and
the Supabase session in `app/api/sync/deps.ts` (`auth.getUser()`, never `getSession()`).

## Cursor

`seq` comes from one global sequence, taken per changed row. A per-listener advisory lock makes the
`seq` order of one listener's rows equal their commit order, so a pull cannot skip a row that
commits late. Across listeners a gap is possible (a lower `seq` can commit after a higher one),
and nothing depends on it: the cursor is per listener. Even so, re-reading is safe: every merge is
idempotent and clients apply rows idempotently, so a client may keep an overlap.
