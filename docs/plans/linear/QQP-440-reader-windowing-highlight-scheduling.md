# QQP-440 — Reader windowing and highlight scheduling

Linear: https://linear.app/niklas-olsson/issue/QQP-440/reader-windowing-and-highlight-scheduling

## Atomic deliverable

Implement internal Reader windowing, high-frequency highlight isolation, and low-resource fidelity downgrade behavior for read-along rendering/scheduling.

## Dependency state

- QQP-438 Reader shell state vocabulary: Done.
- QQP-439 Reader transport state machine: Done, commit `c6a0e0754fa638223502e2bdc803f7040f918e65`.
- QQP-437 remains blocked by QQP-4 (`Quick Narrate Pasted URL`) still Todo; QQP-440 is the next unblocked Wave 5 item.

## Source of truth

- `docs/architecture/source-reader-flow-invariants.md`, especially invariants 9, 10, 19.
- `frontend/src/features/reading-surface/model.ts` and `model.test.ts` for transport readiness/currentness/exact-sync descriptors.
- `frontend/src/features/reading-surface/followAlongModel.ts` for visual-mode/follow-along role helpers.
- `frontend/src/features/readalong/ReadAlongWordScheduler.ts` and `.test.ts` for high-frequency scheduler isolation.
- `frontend/src/features/reading-surface/ReadingFollowAlongRenderer.tsx` for rendering/window props.

## In scope

1. Add a pure, typed Reader/follow-along windowing seam that bounds recent/upcoming highlighted tokens around the active word.
2. Ensure high-frequency scheduling does not mutate broad React/UI state unnecessarily; scheduler/highlighter behavior should remain isolated and deterministic.
3. Add low-resource/fidelity downgrade logic so exact word highlighting is only used when transport/exact-sync/fidelity evidence allows it; otherwise downgrade honestly to phrase/block/audio-only/source-only behavior already represented by existing visual modes.
4. Wire narrowly through existing reading-surface/readalong helpers only where needed for downstream use.
5. Add focused deterministic tests for:
   - exact allowed path;
   - degraded/stale/non-current/unchecked fallback paths;
   - low-resource downgrade;
   - bounded window roles;
   - scheduler/highlighter isolation/non-overclaiming.

## Out of scope

- No Quick Listen promotion/crosswalk work.
- No backend artifact/retry/repair semantics.
- No broad UI redesign, new visible controls, popups, or helper copy.
- No new visual design system.
- No source/manifest contract rewrites beyond consuming existing state seams.

## Expected verification

- Focused frontend tests for touched reading-surface/readalong files.
- `mise exec -- pnpm --filter @tts-research/frontend typecheck`.
- `mise exec -- pnpm validate:ir` if any contract-adjacent behavior is touched.
- `git diff --check`.
- `mise exec -- pnpm check` before closeout.
- ChatGPT/downstream peer checkpoint if the windowing seam changes downstream scheduling assumptions.
