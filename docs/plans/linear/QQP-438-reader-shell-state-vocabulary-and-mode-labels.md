# QQP-438 — Reader shell state vocabulary and mode labels

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a manifest-derived Reader shell state vocabulary and mode labels for source-only, generating, unchecked, checked, degraded, stale, failed, retryable, and superseded states.

**Architecture:** Keep this as a frontend/model vocabulary slice. Consume existing source/manifest/artifact/progress metadata and expose deterministic Reader-facing labels/state descriptors without implementing transport controls, windowing, highlight scheduling, or new backend runtime behavior.

**Tech Stack:** TypeScript/React frontend models/tests, existing source-manifest/readalong/progress contracts, Vitest, repo `pnpm` gates.

---

## Scope

In scope:
- Define a small Reader shell state vocabulary/model that is derived from existing manifest/artifact/progress state.
- Add mode/label helpers for: source-only, generating, unchecked, checked, degraded, stale, failed, retryable, superseded.
- Wire labels only where the existing Reader shell/status model already needs them; keep UI minimal and deterministic.
- Add focused tests for state derivation and labels.

Out of scope:
- No Reader transport state machine (QQP-439).
- No reader windowing/high-frequency highlight scheduling (QQP-440).
- No Quick Listen promotion (QQP-437 / QQP-4).
- No backend repair/promotion semantics.
- No broad visual redesign.

## Likely files

Inspect before editing:
- `frontend/src/features/reading-surface/model.test.ts`
- `frontend/src/features/reading-surface/model.ts`
- `frontend/src/features/readalong/readAlongRuntime.test.ts`
- `frontend/src/features/readalong/readAlongRuntime.ts`
- `frontend/src/features/preview/previewAudioCurrentness.test.ts`
- `frontend/src/features/source-manifest/sourceManifestStore.test.ts`
- `frontend/src/features/source-manifest/sourceManifestStore.ts`
- `frontend/src/features/status-strip/model.ts`
- `frontend/src/features/status-strip/model.test.ts`

## Tasks

### Task 1: Discover current Reader/readalong state surfaces

**Objective:** Identify the narrowest existing frontend seam for Reader shell state labels.

**Steps:**
1. Search for existing Reader/readalong status label derivation.
2. Read the listed model/test files.
3. Pick one model seam; do not scatter duplicate enum/string logic.

**Verification:** No code changes yet; document chosen seam in implementation notes or tests.

### Task 2: Add failing vocabulary tests

**Objective:** Prove all required states map to explicit labels/modes.

**Files:**
- Modify/create focused frontend model test under the selected seam.

**Required cases:**
- source-only
- generating
- unchecked
- checked
- degraded
- stale
- failed
- retryable
- superseded

**Expected:** Tests fail before implementation if the vocabulary/helper does not exist.

### Task 3: Implement minimal vocabulary helper

**Objective:** Add a typed helper/enum that maps existing manifest/artifact/progress states to Reader shell labels.

**Rules:**
- No hidden backend changes.
- No transport/windowing behavior.
- Prefer discriminated string unions and small pure functions.
- Keep labels deterministic and terse.

**Verification:** Focused Vitest test passes.

### Task 4: Wire into existing Reader/status model only where natural

**Objective:** Surface the derived vocabulary through existing Reader/status view model without UI sprawl.

**Rules:**
- Do not add popups/helper text.
- No broad visual redesign.
- Use existing status strip/reader shell patterns.

**Verification:** Existing model/render tests pass; add one integration-ish assertion if needed.

### Task 5: Gates and handoff

Run:
- `mise exec -- pnpm --filter @tts-research/frontend test -- --runInBand` if supported, otherwise focused Vitest command for touched tests.
- `mise exec -- pnpm validate:ir`
- `mise exec -- pnpm check`
- `git diff --check`

Parent closeout will run independent SPEC/QUALITY review and ChatGPT peer checkpoint if this affects downstream Reader transport/windowing assumptions.
