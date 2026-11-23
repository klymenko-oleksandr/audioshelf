# features/library

Likes, Listen later, History, Settings, guest identity (Phase 5).

## Local store (Phase 5a)

`lib/local-db` holds the Dexie schema (v2: `progress`, `likes`, `listenLater`, `history`, `settings`, `meta`) and the device id. `features/library/store` is the typed access layer: `createLibraryStore(db)` gives `likes`, `listenLater` (add/remove/has/list) and `history` (start/finish/remove/list). Rows carry `updatedAt` and `deviceId`; deletes are tombstones (`deletedAt`). There is no outbox yet (Phase 6). The UI arrives in 5b–5c.
