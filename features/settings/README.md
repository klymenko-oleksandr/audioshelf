# features/settings

Local settings (Phase 5a): theme, default speed, skip intervals, auto-rewind, continue to next chapter.

- **Storage.** One Dexie row per setting key (`settings` table: `key, value, updatedAt, deviceId`), so Phase 6 can sync last-write-wins per setting. No sync is built here.
- **Defaults and validation.** `definitions.ts`. A stored value that is not allowed falls back to the default.
- **Theme.** `data-theme` on `<html>` (none = system). A blocking inline script in `<head>` reads the `audioshelf:theme` localStorage mirror before first paint; Dexie stays the source of truth and `ThemeSync` keeps the mirror in line.
- **Two tabs.** A change is saved, then a "changed" ping goes over BroadcastChannel (storage events as fallback); the other tab re-reads Dexie.
- **Player.** The engine takes a `settings()` getter, so a change applies at once and the engine stays framework-free. Auto-rewind: after a pause of 5 min or more, resume 10 s earlier (constants in `player/core/rules.ts`).
- **Downloads.** UI only, disabled with a "Soon" badge until Phase 7. Nothing is stored for it.
- **Language.** Stays the cookie (ADR 6); the switcher just lives on this page.

## Layout decision

`/settings` is **one responsive page**: stacked cards on a phone, two columns from `lg`. The design boards show sub-pages on phones; we deliberately did not build a second navigation level, so there is one layout to maintain. Revisit if the boards' phone sub-pages are wanted later.
