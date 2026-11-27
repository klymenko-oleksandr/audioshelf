# features/sync

Local-first store, outbox, push/pull, merge rules, conflict prompt (Phase 6). The server (6b)
and the client (6c) are here; the conflict prompt and device names are 6d.

## Server

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

## Client (`client/`, 6c)

| File           | What                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `outbox.ts`    | One row per changed thing and account, written in the change's own transaction.   |
| `identity.ts`  | Whose data the tables hold: `adopt` (sign-in) and `release` (sign-out).           |
| `apply.ts`     | A pulled page into Dexie with `merge.ts`'s rules, saved together with the cursor. |
| `client.ts`    | `SyncClient`: when to push and pull, retry, beacon. Everything injected.          |
| `wire.ts`      | Outbox rows to requests; the device name.                                         |
| `tab-owner.ts` | The account this tab shows; the progress store refuses writes once it is stale.   |
| `browser.ts`   | Binds `SyncClient` to the account store, the player and the stores of this tab.   |

`components/sync-runner.tsx` starts it in the listener layout.

- **Local tables** (Dexie v3): `outbox` (`[owner+key]`), and `meta` rows `syncOwner` and
  `syncCursor:<account>`. No `syncOwner` means a guest: nothing is queued and nothing is sent.
- **First sign-in**: every live local row is queued with `merge: true` (removed rows are not, so
  the merge is a union; only saved settings have rows). No pull until the merge push got through.
- **The first pull** after a sign-in takes the server's rows as they are, unless changed here
  since the request. The merge can keep an older write (the furthest position), which plain
  last-write-wins would not take. Later pulls use `merge.ts` and skip this device's own rows.
- **Sign-out** sends what it can (5 s at most), then clears progress, likes, Listen later,
  History and settings, with the cursor. Unsent rows stay in the outbox under their account.
- **An unreadable session** (offline with an expired token) is "unknown", not signed out:
  nothing is removed.
- **The loaded book** is never moved by a pull. A newer stored place is taken over when the
  listener leaves the book without playing on. If they press Play instead, what they play wins
  (6d's conflict prompt is the place to ask).
