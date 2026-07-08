# QQP-439 — Reader transport state machine

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a shared Reader transport state machine for pre-audio, generating, unchecked, checked, stale/replaced, failed/retryable, and degraded playback states.

**Architecture:** Build on the QQP-438 Reader shell vocabulary rather than inferring directly from job state in multiple UI surfaces. Keep this as a frontend state/model seam with focused tests; do not implement windowing/high-frequency highlight scheduling or Quick Listen promotion.

**Tech Stack:** TypeScript frontend models, existing playback/readalong/source-manifest state helpers, Vitest, `pnpm` verification gates.

---

## Scope

In scope:
- Define a small, deterministic Reader transport state model/helper that derives transport readiness from existing Reader shell state, audio artifact state, generated-audio lifecycle, durable progress state, and degraded/readalong evidence.
- Cover these transport categories: pre-audio, generating, unchecked, checked, stale/replaced, failed/retryable, degraded.
- Add terse disabled/recovery reasons suitable for existing reader/playback surfaces.
- Wire only into the smallest existing frontend model seam if natural; otherwise export pure helpers for QQP-440/Reader consumers.
- Add focused deterministic tests for all state categories, precedence, and non-overclaiming behavior.

Out of scope:
- No reader windowing or high-frequency highlight scheduling (QQP-440).
- No Quick Listen promotion/crosswalk (QQP-437 / QQP-4).
- No backend artifact/retry/repair semantics.
- No broad visual redesign, new controls, popups, helper text, or transport UI overhaul.
- No localStorage authority changes.

## Likely files

Inspect before editing:
- `frontend/src/features/reading-surface/model.ts`
- `frontend/src/features/reading-surface/model.test.ts`
- `frontend/src/features/reading-surface/index.ts`
- `frontend/src/features/playback/playbackState.ts`
- `frontend/src/features/playback/audioGenerationPipeline.ts`
- `frontend/src/features/preview/previewAudioCurrentness.test.ts`
- `frontend/src/features/status-strip/model.ts`
- `frontend/src/features/status-strip/model.test.ts`
- `frontend/src/features/readalong/readAlongRuntime.ts`
- `frontend/src/features/readalong/readAlongRuntime.test.ts`

## State model guidance

Preferred categories:
- `pre-audio`: no generated/current audio evidence yet; source-only/prepared state.
- `generating`: queued/generating/checking/retrying synthesis or pipeline work.
- `unchecked`: audio exists or lifecycle is ready, but checked artifact evidence is absent.
- `checked`: explicit checked artifact evidence exists and no higher-severity stale/failed/retryable/superseded/degraded state applies.
- `stale-replaced`: stale, superseded, or replaced artifact/manifest/progress evidence means playback must not be treated current.
- `failed-retryable`: failed or interrupted-retriable states; expose whether retry is allowed when evidence exists.
- `degraded`: degraded playback/readalong/timing evidence; do not claim exact sync.

Precedence should be explicit and tested. Reuse QQP-438 shell precedence where sensible, but transport can group shell states into transport categories.

## Tasks

### Task 1: Discover the smallest state seam

**Objective:** Pick a narrow existing frontend seam for a pure transport state helper.

**Steps:**
1. Inspect the likely files and current exports.
2. Prefer adding pure helpers under `frontend/src/features/reading-surface/model.ts` if that keeps QQP-438/439 state vocabulary together; otherwise justify a smaller playback model file.
3. Avoid editing broad UI components unless a model export is already consumed there.

### Task 2: Add failing transport-state tests

**Objective:** Lock all required categories and precedence before implementation.

Required tests:
- source-only/prepared input -> `pre-audio`.
- queued/generating/checking/retrying input -> `generating`.
- generated ready with no checked artifact -> `unchecked`.
- checked artifact -> `checked`.
- stale/replaced/superseded input -> `stale-replaced`.
- failed/retryable/interrupted-retriable input -> `failed-retryable`.
- degraded input -> `degraded`.
- mixed precedence prevents readiness overclaim, e.g. superseded/replaced beats checked, retryable beats failed/stale if that is the chosen contract, degraded does not imply exact sync.

### Task 3: Implement minimal pure helper

**Objective:** Add typed transport state/category descriptors and derive function.

Rules:
- Keep string unions explicit.
- Prefer deriving from `deriveReaderShellState` plus additional input only when needed.
- Unknown tokens must fail safe to `pre-audio` or non-ready state, not `checked`.
- No hidden UI behavior.

### Task 4: Export and narrow wiring

**Objective:** Export helper/types from the selected feature index and optionally add data attrs only if an existing model naturally accepts them.

Rules:
- No broad UI redesign.
- No new visible controls.
- Do not duplicate label logic across multiple files.

### Task 5: Verification

Run:
- `mise exec -- pnpm --filter @tts-research/frontend test -- src/features/reading-surface/model.test.ts` or equivalent focused touched tests.
- `mise exec -- pnpm --filter @tts-research/frontend typecheck`.
- `mise exec -- pnpm validate:ir`.
- `git diff --check`.

Parent closeout will run independent SPEC/QUALITY reviews, downstream peer gate if required, full `mise exec -- pnpm check`, commit/push, and Linear closeout.
