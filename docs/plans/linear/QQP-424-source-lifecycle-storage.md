# QQP-424 — Backend source lifecycle storage and startup interruption marking

Status: complete pending Linear comment/commit
Linear: https://linear.app/niklas-olsson/issue/QQP-424/backend-source-lifecycle-storage-and-startup-interruption-marking
Slug: `source-lifecycle-storage`

## Atomic deliverable

Persist source identity, source revisions, raw source artifacts, and startup `interrupted_retriable` marking for orphaned active work.

## Scope

Backend only:

- Add backend-local persistence for source lifecycle records aligned with the `source-envelope.v1` and `source-revision.v1` contracts introduced by QQP-423.
- Persist raw source artifacts/metadata for URL/upload/paste sources where bytes/text are available.
- Add startup recovery that marks orphaned active source work as `interrupted_retriable` instead of leaving it pretending to run.
- Add deterministic backend tests for source/revision persistence and startup interruption marking.

Out of scope:

- Manifest snapshot API/storage.
- Audio retry implementation.
- Frontend source/manifest store.
- Event stream/SSE.
- Quick Listen promotion crosswalk runtime behavior.
- PDF/DOCX/OCR best-in-class adapter work.

## Invariants to preserve

- Source identity is not job identity.
- Content IR v1 remains content-only; lifecycle/readiness/staleness live outside Content IR nodes.
- Raw source is persisted locally before adapter extraction when available.
- Backend/local storage is authoritative.
- Backend restart cannot leave active work pretending to run; orphaned active work becomes `interrupted_retriable`.
- `QQP-4` remains the Quick Listen capture anchor; do not duplicate or rescope unrelated Quick Listen behavior.

## Implementation notes for worker

- Start by inspecting current backend persistence patterns in `backend/internal/pipeline` and `backend/cmd/api/pipeline_bootstrap.go`.
- Prefer a small file-backed store consistent with existing project/job/progress persistence helpers unless a better existing storage abstraction already exists.
- Keep public API additions minimal unless needed for deterministic tests.
- Use existing schema terminology where practical: source envelope, source revision, source state, revision ID, raw artifact location/checksum/bytes.
- Tests should use temp dirs and avoid mutating `backend/data` or repository fixtures.

## Expected verification

Focused first:

```bash
mise exec -- pnpm --filter @tts-research/backend test
```

Then before completion:

```bash
mise exec -- pnpm check
git diff --check
```

## Review gates

- Spec review must confirm this is backend-only and implements only QQP-424.
- Quality review must inspect persistence correctness, restart semantics, deterministic temp-dir tests, and absence of hidden manifest/API/frontend scope.

## Completion evidence

- Implementation used focused sub-agents; parent session remained orchestrator-only after handover correction.
- Spec review: `SPEC PASS` (`deleg_e51d1c39`).
- Initial quality review: `QUALITY REQUEST_CHANGES` (`deleg_d91cffb9`).
- Repair worker: `deleg_592a7cf3` timed out but left coherent partial repair; parent inspected read-only and verified.
- Targeted quality re-review: `QUALITY APPROVED` (`deleg_5df602dc`).
- Parent verification:
  - `cd backend && mise exec -- go test ./internal/pipeline -count=1` passed.
  - `mise exec -- pnpm --filter @tts-research/backend test` passed.
  - `mise exec -- pnpm check` passed.
  - `git diff --check` passed.
