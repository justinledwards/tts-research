# QQP-436 — Minimal repair overlay and manifest supersession

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add the minimal backend/runtime model and deterministic behavior for immutable repair overlays, superseding manifests, affected-artifact stale marking, and revision-map-based progress remap.

**Architecture:** Build on existing source lifecycle, manifest snapshot, revision-map, durable-progress, and audio-artifact state seams. Keep this backend/runtime focused: no full repair UI/workbench, no Quick Listen promotion runtime, no unrelated Reader shell/transport/windowing work.

**Tech Stack:** Go backend (`backend/internal/pipeline`), existing manifest/progress contract fixtures, pnpm/mise validation gates.

---

## Acceptance scope

- Add immutable repair overlay records for source/revision/manifest identity.
- Persist a new source revision/manifest snapshot pair as superseding prior current manifests when a repair overlay is applied.
- Mark affected audio/highlight/progress artifacts stale/superseded only when their source/revision/manifest/artifact evidence matches the repaired scope.
- Produce or consume revision maps so stale progress can remap onto the repaired manifest via the existing QQP-434 resume resolver.
- Emit source-manifest event evidence for repair overlay creation / supersession where current event seams already exist.
- Fail closed on missing/mismatched source ID, revision ID, manifest ID, unit ID, artifact ID, or revision-map evidence.

## Scope exclusions

- No full repair UI/workbench.
- No Quick Listen promotion runtime.
- No Reader shell vocabulary / transport / windowing UI work.
- No PDF/DOCX/OCR best-in-class claims.
- Browser localStorage remains non-authoritative.

## Suggested implementation tasks

### Task 1 — Inventory and test the repair overlay seam

**Objective:** Add focused tests proving the desired repair/supersession behavior before or alongside implementation.

**Files likely touched:**
- `backend/internal/pipeline/models.go`
- `backend/internal/pipeline/source_lifecycle.go`
- `backend/internal/pipeline/manifest_snapshots*.go`
- `backend/internal/pipeline/progress.go`
- new or existing `backend/internal/pipeline/*repair*_test.go`

**Required test cases:**
- Creating a repair overlay requires source/revision/current manifest identity.
- Applying a repair overlay creates a new source revision / current manifest snapshot and supersedes prior current snapshots.
- Old progress on the superseded manifest resolves via a high-confidence revision map to `auto_resume_remapped` or equivalent existing resolver decision.
- Ambiguous/missing/low-confidence revision map blocks remap and offers old vs repaired manifest.

### Task 2 — Persist immutable repair overlays and superseding metadata

**Objective:** Add minimal storage/API-internal functions for immutable repair overlays without UI.

**Guidance:**
- Use existing source lifecycle storage patterns: sanitize IDs, write JSON, hydrate on service startup if relevant.
- Make overlay records immutable: duplicate overlay ID with divergent payload must fail, identical replay should be idempotent only if existing project conventions support that.
- Include source ID, from revision/manifest IDs, to revision/manifest IDs, created timestamp, affected unit/artifact scope, and optional metadata.

### Task 3 — Mark affected artifacts stale/superseded fail-closed

**Objective:** When a repair overlay supersedes a manifest, only matching affected artifact evidence becomes stale/superseded.

**Guidance:**
- Reuse QQP-432/435 audio artifact state helpers where possible.
- Do not mark compatible unaffected checked artifacts stale.
- Require source/revision/manifest/artifact/unit identity for affected marking.
- Add tests for wrong source/revision/manifest/unit/artifact evidence preserving current artifacts.

### Task 4 — Integrate revision-map progress remap

**Objective:** Ensure repair-generated revision maps feed the QQP-434 resolver path deterministically.

**Guidance:**
- Use existing `RevisionMap` models and `ResolveResumeProgress` behavior.
- Add repair-overlay cause metadata (`repair_overlay`) and map IDs to resume resolution evidence.
- Verify stale/superseded progress cannot remap without exactly one high-confidence mapping.

### Task 5 — Event/evidence and gates

**Objective:** Add repair overlay / supersession event evidence if existing source-manifest event seams support it, and run canonical gates.

**Verification commands:**
- `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline ./internal/httpapi -run 'Repair|Overlay|Supersed|RevisionMap|Progress|Manifest|Source|Artifact|Resume' -count=1`
- `mise exec -- pnpm validate:ir`
- `gofmt` changed Go files
- `git diff --check -- <changed files>`

## Review gates expected before closeout

- Parent focused gates.
- Independent SPEC review.
- Independent QUALITY review.
- ChatGPT downstream-contract peer gate if the implementation changes contract/state-machine seams that later Reader/Quick Listen issues depend on.
- Final `mise exec -- pnpm check` before commit.
