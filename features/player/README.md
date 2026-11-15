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
- `data/load-book.ts` — fetches what the player needs for a book (`/api/player/books/:id`) when
  Play is pressed or the last book is restored; `play-book.ts` wraps it for cards and pages.
- `data/test-book.ts` — a three-tone test book for the showcase and the tests.

Position is always **book time** (seconds from the start of the book), never track + offset,
so replacing or appending tracks keeps saved positions valid.

Saving: every 5 s while playing, and on pause, seek, chapter change, tab hide and page unload.
Saved positions are cached in memory so Play can call `audio.play()` synchronously inside the
click, which iOS requires.

Sleep timer (`setSleepTimer(minutes | 'chapter' | null)`): the volume fades over the last 10 s,
then playback pauses; "end of chapter" lands exactly on the chapter boundary. Any manual play
or pause, starting another book or closing the player cancels it.

UI on top of the bar:

- `ui/player-ui.ts` — the full-screen player is open while the URL says `#player` (Back closes
  it, a reload keeps it); which sheet is open is plain memory.
- `components/now-playing.tsx` — the full-screen player; its scrubber is chapter-scoped.
- `components/player-sheets.tsx` — speed, sleep timer and chapters sheets (a drawer on phones,
  a centred card from 768 px). They nest inside the full-screen player when it is open. From 1024 px the
  full-screen player has inline speed presets and a sleep menu instead (canvas: NowPlaying).
- `ui/shortcuts.ts` — Space play/pause, ←/→ back 15 s / forward 30 s, Shift+←/→ previous /
  next chapter. Never taken from a focused text field, button, slider or menu.
