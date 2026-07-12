# Shared Reading Follow-Along Renderer

Updated: 2026-06-03

## Purpose

The reading surface is a product primitive, not a decorative text layer. Preview, Teleprompt,
and Theatre must render the same cue with the same source/spoken identity, word roles, timing
confidence, and accessibility behavior unless a display preset intentionally changes the visual
treatment.

The shared frontend contract lives in `frontend/src/features/reading-surface` and wraps the
existing `readalong/HighlightRenderer`.

## Cue Contract

Each rendered cue keeps three text forms distinct:

| Field | Meaning |
| --- | --- |
| `sourceText` | Original source/provenance text. |
| `spokenText` | Listener-ready generated or manually repaired spoken form. |
| `cueText` | Reading-optimized display text; preferred for visible cue rendering. |

Display precedence is `cueText`, then `spokenText`, then `sourceText`. Tokens may carry
`sourceWordId`, `sourceWordIndex`, `spokenTokenId`, timing confidence, and a transformation marker
such as `skipped` or `transformed`.

The canonical active identity is `activeSourceWordId` when available. `activeWordIndex` remains a
compatibility fallback for generated estimates, manual rehearsal, and local cue progress.

## Highlight State Model

Word roles are shared across surfaces:

- `active`: exact current word, only when timing is trusted enough to claim word sync.
- `activePhrase`: current phrase or local fallback when timing is estimated or low confidence.
- `recent` and `spoken`: history, with recent words slightly more visible.
- `upcoming`: nearby future words.
- `skipped`: source content intentionally not spoken.
- `transformed`: visible cue differs from source or spoken token identity.
- `idle`: neutral text.

Cue roles are `previous`, `current`, `next`, `skipped`, and `unavailable`.

Timing states are `trusted`, `estimated`, `lowConfidence`, `resyncing`, `degraded`, and `stale`.
Only `trusted` timing may produce `aria-current="true"` on an exact word. Estimated and
low-confidence timing fall back to phrase emphasis so the UI remains useful without becoming
frantic or misleading.

## Typography And Presets

Baseline surface scale:

| Surface | Font | Line height | Measure |
| --- | ---: | ---: | ---: |
| Source/editor | 15 px | 1.55 | 82 ch |
| Preview/spoken | 20 px | 1.66 | 58-66 ch |
| Teleprompt cue | 40 px | 1.24 | 36-42 ch |
| Theatre | 56 px | 1.16 | 18-24 ch |

Display presets:

- `Standard`: balanced spacing, background highlight, phrase fallback.
- `Large Text`: larger type, narrower measure, stronger current emphasis.
- `High Contrast`: high-contrast shape highlight with non-color-only state.
- `Dyslexic Friendly`: wider word spacing, generous line height, calm phrase emphasis, and
  letter spacing kept at `0`.

## Surface Examples

Preview uses `ReadingFollowAlongRenderer` for the mini-player and spoken cue list. Generated or
estimated timing renders phrase emphasis; source and spoken form stay attached to the cue model.

Teleprompt uses the shared renderer for current cue and script blocks, while keeping teleprompter
intensity classes as a surface-specific visual layer. Manual rehearsal and estimated cue timelines
do not claim exact word sync.

Theatre uses the shared renderer with theatre typography and high-contrast defaults. Continuous
crawl follows the active line when motion preferences allow it; low-confidence states use phrase or
cue emphasis instead of rapid word movement.

## Accessibility And Validation

Required behavior:

- Active word and high-contrast shapes must remain legible in light and dark themes.
- Highlight meaning must not rely on color alone.
- Reduced motion disables glow/crawl transitions and keeps layout stable.
- Screen readers receive `aria-current` only for trusted exact word sync.
- Skipped and transformed text expose semantic data attributes for tests and diagnostics.

Validation should include focused renderer tests, Preview and Teleprompt render tests,
`pnpm e2e:reading-surface`, `pnpm e2e:teleprompt-memory`, and `pnpm e2e:accessibility-audit`.
