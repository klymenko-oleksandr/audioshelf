# features/player

The persistent audiobook player (PRD: Player).

- `core/` — pure logic, no DOM and no React, exhaustively unit-tested:
  - `machine.ts` — the state machine: idle, loading, playing, paused, buffering, error, finished.
  - `timeline.ts` — book time ↔ track + offset, chapters as ranges of book time, book validation.
  - `rules.ts` — finished rule, resume position, skip, previous / next chapter, seek scopes, speed.
  - `sleep-timer.ts` — minutes or end of chapter, 10 s fade-out.
  - `format.ts` — clock, remaining time, duration and speed formatting.
- `engine/` — `AudioEngine` drives one audio element from the state machine: track changes,
  seeking, speed, the 15 s stall timeout, saving. `media-session.ts` adds lock-screen and
  headset controls; `single-tab.ts` pauses other tabs. `fake-audio.ts` is the scriptable audio
  element the engine tests run against.
- `storage/` — local progress records (Dexie / IndexedDB, with an in-memory fallback).
- `player.ts` — the per-tab singleton (`getPlayer()`) and the React hooks
  (`usePlayerState`, `useBookProgress`).
- `components/` — `PlayerBarView` (presentational, all states, three widths), `PlayerBarLive`
  (connected to the engine), `Scrubber`, and the fixed `PlayerBar` slot in the root layout.
- `data/static-books.ts` — TEMPORARY: the four v1 books and a three-tone test book.

Position is always **book time** (seconds from the start of the book), never track + offset,
so replacing or appending tracks keeps saved positions valid.

Saving: every 5 s while playing, and on pause, seek, chapter change, tab hide and page unload.
Saved positions are cached in memory so Play can call `audio.play()` synchronously inside the
click, which iOS requires.

Coming in Phase 2c: the full-screen player with `#player`, the speed, sleep and chapters
sheets, and keyboard shortcuts.
