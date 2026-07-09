# QQP-542 — Book Cinema Theatre compact phone controls exceed canvas budget

Linear: https://linear.app/niklas-olsson/issue/QQP-542/book-cinema-theatre-compact-phone-controls-exceed-canvas-budget

## Context

QQP-441 is evidence-only and is blocked by a real product/UI failure in the responsive Book Cinema Theatre gate.

Fresh failing evidence:

- Command: `mise exec -- pnpm e2e:book-cinema:responsive`
- Failing scenario: `book:phone-390:theatre`
- Footer measured: `343px` / `40.64%` viewport
- Budget max: `188px` / `25%`
- Canvas measured: `31.85%` viewport
- Budget min: `43%`
- Screenshot: `output/e2e-book-cinema/screenshots/responsive-book-phone-390-theatre.png`

RCA classification: `REAL_UI`.

## Likely source

- `frontend/src/features/cinema/CinemaTheatre.tsx`
  - `CinemaTheatreTransport` renders theatre mini progress/status and full `LocalizedPlaybackToolbar` while controls are visible.
  - On phone this duplicates progress/status and inflates footer height to ~343px.
- `frontend/src/features/playback/LocalizedPlaybackToolbar.tsx`
  - May need compact/action-only variant for theatre phone use.
- Keep `frontend/src/features/cinema/canvasBudget.ts` unchanged unless a real compact UI fix proves it impossible.

## Acceptance

- Phone Book Cinema Theatre visible controls fit the existing compact budget:
  - footer <= `188px`
  - footer <= `25%` viewport
  - canvas >= `43%` viewport
- Avoid duplicate progress/status in compact theatre mode.
- Keep theatre controls usable/accessibility-friendly.
- Do not relax/hide the evidence gate.

## Required gates

- `mise exec -- pnpm --filter @tts-research/frontend test`
- `mise exec -- pnpm e2e:book-cinema:responsive`
- `mise exec -- pnpm check`
- If screenshots/UI evidence changed: `mise exec -- pnpm review:chatgpt`

## Scope notes

- QQP-441 evidence-only diffs are currently present in the worktree. Preserve them.
- QQP-542 should focus on product UI repair only.
