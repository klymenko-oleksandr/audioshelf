# features/player

The persistent audiobook player (PRD: Player).

- `core/` — pure logic, no DOM and no React, exhaustively unit-tested:
  - `machine.ts` — the state machine: idle, loading, playing, paused, buffering, error, finished.
  - `timeline.ts` — book time ↔ track + offset, chapters as ranges of book time, book validation.
  - `rules.ts` — finished rule, resume position, skip, previous / next chapter, seek scopes, speed.
  - `sleep-timer.ts` — minutes or end of chapter, 10 s fade-out.
  - `format.ts` — clock, remaining time, duration and speed formatting.
- `components/` — `PlayerBarView` (all states, three widths) and the fixed `PlayerBar` slot.

Position is always **book time** (seconds from the start of the book), never track + offset,
so replacing or appending tracks keeps saved positions valid.

Coming in Phase 2b: the audio engine that drives one global `<audio>` element from the state
machine, local position saving, Media Session and the one-tab rule. 2c: the full-screen player.
