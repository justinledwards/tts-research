# QQP-435 — Retry and interrupted artifact semantics

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Implement artifact/segment-scoped retry behavior across cancellation, provider failure, backend restart, checking failure, and compatible reuse.

**Architecture:** Extend the existing backend readalong/audio artifact and resume-sidecar model, not broad job orchestration. Retry decisions must be bound to source identity, source revision, readalong manifest identity, segment/unit identity, artifact state, compatibility, and durable progress/resume evidence. Browser localStorage remains non-authoritative.

**Tech Stack:** Go backend under `backend/internal/pipeline`, existing readalong sidecar runtime models/tests, contract fixtures under `fixtures/contracts`, validation via `mise exec -- pnpm validate:ir` and repo gate via `mise exec -- pnpm check`.

---

## Linear context

- Issue: QQP-435 — Retry and interrupted artifact semantics
- URL: https://linear.app/niklas-olsson/issue/QQP-435/retry-and-interrupted-artifact-semantics
- Priority: P1 / Urgent
- Atomic deliverable: Implement artifact/segment-scoped retry behavior across cancellation, provider failure, backend restart, checking failure, and compatible reuse.
- Scope: No broad job orchestration rewrite.
- Dependencies verified Done live in Linear:
  - QQP-424 — Backend source lifecycle storage and startup interruption marking
  - QQP-432 — Partial audio artifact states and replacement semantics
  - QQP-434 — Durable progress and manifest-aware resume resolver

## Boundaries

Do not implement:
- broad job orchestration rewrite;
- repair overlay runtime or manifest supersession beyond consuming existing sidecar evidence;
- Quick Listen promotion runtime;
- Reader UI state vocabulary / transport UI / windowing;
- PDF/DOCX/OCR best-in-class behavior.

Must preserve:
- source/revision/manifest/artifact identity invariants in `docs/architecture/source-reader-flow-invariants.md`;
- `QQP-4` remains the Quick Listen capture anchor;
- localStorage never becomes canonical progress/artifact state.

## Implementation tasks

### Task 1: Inventory existing artifact/retry state seams

**Objective:** Identify current runtime model and persistence seams before editing.

**Files to inspect:**
- `backend/internal/pipeline/models.go`
- `backend/internal/pipeline/progress.go`
- `backend/internal/pipeline/service.go`
- `backend/internal/pipeline/service_create_job.go`
- existing tests in `backend/internal/pipeline/*artifact*`, `*progress*`, `*source*`, `*manifest*`.

**Expected output:** A narrow implementation plan in the worker summary naming exact files touched. If no existing audio-artifact persistence seam exists, add the smallest backend-side model/helper necessary under `backend/internal/pipeline` rather than changing frontend/UI.

### Task 2: Add/extend retry evidence runtime models

**Objective:** Represent retry/interruption evidence with enough identity to make deterministic decisions.

**Likely files:**
- Modify: `backend/internal/pipeline/models.go`
- Modify/add tests: `backend/internal/pipeline/durable_progress_test.go` or a focused new pipeline test file if cleaner.

**Requirements:**
- Model cancellation/provider failure/backend restart/checking failure/retryable state without broad job rewrite.
- Include source ID, source revision ID, readalong manifest ID, artifact ID, segment/unit identity where applicable.
- Preserve compatible reuse semantics from QQP-432; retry only affected failed/interrupted/retryable artifacts/segments.

### Task 3: Implement retry-resolution helpers

**Objective:** Make retry decisions deterministic and artifact/segment scoped.

**Likely files:**
- Modify: `backend/internal/pipeline/progress.go` and/or a focused helper file under `backend/internal/pipeline`.
- Tests: focused pipeline tests.

**Requirements:**
- Cancellation and provider/checking failure should surface retryable artifact evidence when compatible.
- Backend restart/orphaned active work should be represented as interrupted/retriable, not running.
- Compatible checked artifacts should be reused; stale/replaced/failed/retryable artifacts must not be treated as exact/current playback evidence.
- Durable progress resume should offer retry only for the affected artifact and should remain blocked/source-only/degraded where evidence is incompatible or missing.

### Task 4: Add regressions for failure/retry cases

**Objective:** Prove QQP-435 behavior without UI or orchestration changes.

**Tests must cover:**
- user/system cancellation marks affected artifact/segment retryable without invalidating compatible checked artifacts;
- provider failure marks only affected artifact/segment retryable;
- backend restart/interrupted active work becomes interrupted_retriable and can produce offer_retry through resume evidence;
- checking failure yields retryable artifact evidence rather than exact sync eligibility;
- compatible reuse keeps unaffected checked artifacts usable;
- wrong source/revision/manifest/artifact evidence fails closed.

### Task 5: Verify and keep scope clean

Run:

```bash
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline ./internal/httpapi -run 'Retry|Interrupted|Artifact|Progress|Resume|Manifest|Source|SyncFidelity' -count=1
mise exec -- pnpm validate:ir
gofmt -l backend/internal/pipeline/*.go
git diff --check
```

Parent/orchestrator will run broad `mise exec -- pnpm check`, independent SPEC/QUALITY reviews, any peer checkpoint if needed, commit/push, and Linear closeout.
