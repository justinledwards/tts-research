# QQP-429 — Source and manifest backend event stream

Status: complete
Linear: https://linear.app/niklas-olsson/issue/QQP-429/source-and-manifest-backend-event-stream
Slug: `source-manifest-event-stream`

## Selection rationale

QQP-429 is the next selected first-batch issue by agreed manifest order after QQP-428 was completed and pushed.

Dependency gate:

- QQP-423 `readalong-contracts` — Done.
- QQP-425 `manifest-snapshot-storage-api` — Done.
- QQP-428 `epub-html-incremental-extraction` — Done and relevant producer path exists.

## Atomic deliverable

Implement a sequenced backend source/manifest event protocol with deterministic tests and snapshot fallback.

## Scope

Backend event stream only:

- Add a deterministic backend event model for source/manifest updates using the existing `source-manifest-event.v1` contract vocabulary.
- Sequence events monotonically per service/runtime so clients can detect gaps and reconnect.
- Publish source lifecycle and manifest snapshot events from existing durable lifecycle/snapshot write paths where appropriate.
- Provide snapshot fallback/read APIs so reconnecting clients can recover authoritative current state from source lifecycle and manifest snapshots.
- Add deterministic backend tests for sequencing, subject identity, snapshot fallback, replay/gap behavior, and source/revision/manifest binding.

Out of scope:

- No frontend source/manifest store; QQP-430 owns client cache/store behavior.
- No UI screenshots or Reader shell work.
- No speech-plan segmentation; QQP-431 owns first narratable prefix segmentation.
- No audio artifact state implementation, sync fidelity gates, durable progress/resume, repair overlay runtime, Quick Listen promotion, or reader transport/windowing work.
- No broad job orchestration rewrite.
- No adapter expansion and no DOCX/PDF/OCR best-in-class claims.

## Contract references

- `docs/contracts/readalong-sidecars.md`
- `backend/internal/contentir/schema/source-manifest-event.v1.schema.json`
- `fixtures/contracts/readalong-snapshot.source-manifest-event.v1.json`
- `fixtures/contracts/readalong-interrupted.source-manifest-event.v1.json`
- `docs/architecture/source-reader-flow-invariants.md`
- `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`
- `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`

## Existing implementation context

Likely relevant implementation areas:

- `backend/internal/pipeline/source_lifecycle.go`
- `backend/internal/pipeline/manifest_snapshot.go`
- `backend/internal/pipeline/incremental_extraction.go`
- `backend/internal/pipeline/service.go`
- `backend/internal/httpapi/router.go`
- `backend/internal/httpapi/*routes*.go`
- Existing source lifecycle / manifest snapshot tests.

## Implementation expectations

1. Keep the first implementation narrow, deterministic, and backend-only.
2. Treat events as advisory hints; durable source lifecycle and manifest snapshots remain authoritative.
3. Preserve source identity, source revision, extraction revision, and manifest identity in every relevant event subject/snapshot reference.
4. Add a small event log/bus abstraction with deterministic sequencing and bounded replay/snapshot fallback semantics.
5. Do not require a browser, external network, or live SSE client for tests; HTTP-level tests are acceptable if scoped.
6. Avoid widening QQP-428 incremental extraction beyond emitting backend event hints from existing durable points.
7. Avoid frontend store/cache work; leave consumption semantics to QQP-430.

## Expected verification

Focused backend gates likely include:

```bash
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -run 'SourceManifest|Event|Manifest|SourceLifecycle|Incremental|Snapshot' -count=1
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/httpapi -run 'SourceManifest|Event|Stream|Snapshot' -count=1
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -count=1
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/httpapi -count=1
```

Contract/full gates before completion:

```bash
mise exec -- pnpm validate:ir
mise exec -- pnpm check
git diff --check
```

## Review gates

- Spec review PASS (`deleg_7a571654`): confirmed backend-only source/manifest event protocol, source-manifest-event.v1-compatible semantics, advisory events with authoritative snapshot fallback, per-source sequencing/gap behavior, durable write-path publication, HTTP replay/snapshot/stream scope, deterministic tests, and no adjacent runtime expansion.
- Initial quality review REQUEST_CHANGES (`deleg_6fef2cc2`): identified important blockers around limited SSE/replay silently skipping backlog, empty-log/restart replay not requiring snapshot fallback, and misleading manifest events when previous-current supersession writes fail.
- Focused repair timed out but left coherent diff (`deleg_3b197fbc`): added snapshot-required gap signaling for replay truncation and empty-log nonzero cursors, moved manifest event publication after previous-supersede error checks, and added targeted negative coverage.
- Targeted quality re-review APPROVED (`deleg_fdfbcb12`): confirmed prior blocker classes fixed and no remaining blockers.

## Final evidence

- Focused pipeline gate passed after repair: `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -run 'SourceManifest|Event|Manifest|SourceLifecycle|Incremental|Snapshot' -count=1` (`ok ... 1.836s`).
- Focused httpapi gate passed after repair: `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/httpapi -run 'SourceManifest|Event|Stream|Snapshot' -count=1` (`ok ... 0.046s`).
- Full pipeline package passed after repair: `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -count=1` (`ok ... 18.027s`).
- Full httpapi package passed after repair: `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/httpapi -count=1` (`ok ... 7.312s`).
- Contract gate passed after repair: `mise exec -- pnpm validate:ir` (`Validated 4 Content IR fixtures, 55 public contract fixtures, and 3 adapter files.`).
- Final gates will rerun before commit: `mise exec -- pnpm check`, `git diff --check`.
