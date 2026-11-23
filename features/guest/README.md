# features/guest

Phase 5d: the welcome screen and the guest nudge. All state lives in the browser (Dexie `meta`), no server data and no schema change (still Dexie v2).

## Welcome screen

- Shown only on a plain `/` (no hash), once per browser. Skip, Escape, "Start listening" and the sign-in link all count as seen. A deep link never shows it and never uses it up.
- Someone with any saved progress, likes, Listen later or history is treated as already welcomed.
- Decided before first paint: `WELCOME_INIT_SCRIPT` (in `<head>`, next to the theme script) reads a localStorage mirror and sets `data-welcome="pending"` on `<html>`. `AppReady` keeps the static splash up while it is pending (capped at 1.5 s). Dexie `meta.welcomeSeenAt` stays the source of truth.
- `welcomeSeen()` in `welcome.ts` is the one place that decides "seen". Phase 6 adds the per-account rule there.

## Guest nudge

- `LibraryFlagsStore.toggle()` reports every add (like or Listen later) through `onAdd`; unlike, `remove()` and Undo never count.
- Due after the 3rd add; once dismissed, again after 7 days or 10 more adds, whichever comes first (`nudge.ts`, pure).
- Hidden while the full-screen player (`#player`) is open, while a toast is showing, during the welcome and on `/signin`.
- The CTA goes to `/signin?next=<current page>`.

## State and sync between tabs

`store.ts` follows the flags/history pattern: overlay of unsaved changes, serial write queue, stable snapshot and a cross-tab BroadcastChannel ping. The counter is incremented inside one Dexie transaction, so two tabs never lose an add.
