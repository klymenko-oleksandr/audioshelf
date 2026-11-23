# features/library

Likes, Listen later, History, Settings, guest identity (Phase 5).

## Local store (Phase 5a)

`lib/local-db` holds the Dexie schema (v2: `progress`, `likes`, `listenLater`, `history`, `settings`, `meta`) and the device id. `features/library/store` is the typed access layer: `createLibraryStore(db)` gives `likes`, `listenLater` (add/remove/restore/has/list) and `history` (start/finish/remove/list). Rows carry `updatedAt` and `deviceId`; deletes are tombstones (`deletedAt`). There is no outbox yet (Phase 6). `restore` puts a removed row back with its original `addedAt` (used by Undo).

## Likes and Listen later in the UI (Phase 5b)

`flags/store.ts` is `LibraryFlagsStore`: it reads both sets from Dexie, applies a change to the screen at once (an overlay of unsaved changes, like `SettingsStore`), saves in order, then pings other tabs over the `audioshelf-library` BroadcastChannel (storage-event fallback), and they re-read. `toggle` returns an `undo()` that puts the previous state back (add → tombstone, removal → `restore`); a stale or second Undo does nothing.

`flags/use-library-flags.ts`: `useLibraryFlags()` (sets, for pages that need many books) and `useBookFlags(bookId)` (one book; a card re-renders only when its own flags change). `flags/actions.tsx` adds the toast with Undo. Books that are no longer in the catalogue stay in the store and are simply never looked up. Not yet: the Library page and History recording (5c), the guest nudge (5d), sync (Phase 6).
