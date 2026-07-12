# QQP-428 — Incremental extraction proof for HTML and EPUB

Status: complete
Linear: https://linear.app/niklas-olsson/issue/QQP-428/incremental-extraction-proof-for-html-and-epub
Slug: `epub-html-incremental-extraction`

## Selection rationale

QQP-428 is the next selected issue by agreed first-batch manifest order after QQP-427 was completed and pushed.

Dependency gate:

- QQP-424 `source-lifecycle-storage` — Done.
- QQP-425 `manifest-snapshot-storage-api` — Done.
- QQP-426 `stable-unit-ir-core-adapters` — Done.

## Atomic deliverable

Emit readable HTML/EPUB units incrementally and write manifest snapshots as units become available.

## Scope

First long-form proof path only:

- Backend-focused proof path for HTML and EPUB sources.
- Use existing stable unit identity emitted by core adapters / Content IR conversion.
- Persist source/extraction lifecycle state through the existing source lifecycle layer.
- Persist reading-unit and readalong manifest snapshots through the existing QQP-425 manifest snapshot API as units become available.
- Add deterministic tests proving incremental unit availability, manifest snapshot writes, stable identity, source/revision/manifest binding, and safe completion/degraded behavior.

Out of scope:

- No unrelated adapter upgrades.
- No DOCX/PDF/OCR expansion; lower-tier handling remains QQP-427 scope.
- No source/manifest event stream; QQP-429 owns event protocol/SSE-like behavior.
- No frontend source/manifest store; QQP-430 owns client cache/store.
- No speech-plan segmentation implementation; QQP-431 owns first narratable prefix segmentation.
- No audio artifact states, sync fidelity gates, durable progress/resume, repair overlays, or Quick Listen promotion.
- No broad job orchestration rewrite.

## Contract references

- `docs/architecture/source-reader-flow-invariants.md`
- `docs/contracts/readalong-sidecars.md`
- `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`
- `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`

## Existing implementation context

Completed prerequisites:

- QQP-424 added source lifecycle storage and startup interruption marking.
- QQP-425 added manifest snapshot storage/API with current/superseded semantics.
- QQP-426 added stable unit identity for HTML, EPUB, and Markdown core adapters.
- QQP-427 documented/report-gated lower-tier DOCX/PDF/OCR paths and is out of this runtime proof lane.

Likely relevant implementation areas:

- `backend/internal/pipeline/source_lifecycle.go`
- `backend/internal/pipeline/source_lifecycle_test.go`
- `backend/internal/pipeline/manifest_snapshot.go`
- `backend/internal/pipeline/manifest_snapshot_test.go`
- `backend/internal/pipeline/source_preps.go`
- `backend/internal/pipeline/source_preps_internal_test.go`
- `backend/internal/pipeline/book_sources.go`
- `backend/internal/pipeline/book_source_to_ir.go`
- `backend/internal/pipeline/book_adapters.go`
- `backend/internal/pipeline/service.go`
- `adapters/html/emit_ir.js`
- `adapters/epub/emit_ir.js`
- Existing adapter tests under `adapters/html/` and `adapters/epub/`

## Implementation expectations

1. Keep the proof path small and deterministic.
2. Prefer existing source lifecycle and manifest snapshot APIs over introducing parallel storage.
3. Model incremental availability explicitly enough that tests can observe manifest snapshots after partial HTML/EPUB unit emission and at completion.
4. Use stable source/revision/extraction/manifest identities from completed contract work; do not invent job-derived unit identity.
5. Keep current/superseded manifest semantics consistent with QQP-425.
6. Handle HTML and EPUB as first-class core adapter lanes; do not widen DOCX/PDF/OCR behavior.
7. Add deterministic focused tests with synthetic fixtures; avoid external network/browser requirements.
8. Do not add frontend, event-stream, audio, progress, repair, promotion, or broad orchestration features.

## Expected verification

Focused backend gates likely include:

```bash
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -run 'Incremental|Manifest|SourceLifecycle|HTML|EPUB|ReadingUnit|Readalong' -count=1
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -count=1
```

Adapter/contract gates likely include:

```bash
mise exec -- pnpm test:adapters
mise exec -- pnpm validate:ir
```

Full gates before completion:

```bash
mise exec -- pnpm check
git diff --check
```

## Review gates

- Spec review PASS (`deleg_5188d9ee`): confirmed a narrow HTML/EPUB incremental proof path, existing source lifecycle + QQP-425 manifest snapshot API use, stable Content IR identity/binding, observable partial/final snapshots without event-stream scope, deterministic tests, and no adjacent runtime expansion.
- Initial quality review REQUEST_CHANGES (`deleg_48736b3c`): identified important consistency blockers around readalong-write half-pairs and lifecycle completion before book metadata/Content IR durability, plus a minor fallback identity hardening gap.
- Focused repair completed (`deleg_83fb3dcb`): added paired incremental manifest persistence, moved lifecycle completion after required durable writes, and hardened fallback unit identity/order with node position.
- Targeted quality re-review APPROVED (`deleg_27e4393c`): confirmed prior blockers fixed, regression coverage added, and no remaining blockers.

## Final evidence

- Focused backend gate passed after repair: `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -run 'Incremental|Manifest|SourceLifecycle|HTML|EPUB|ReadingUnit|Readalong' -count=1` (`ok ... 2.162s`).
- Full pipeline package passed after repair: `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -count=1` (`ok ... 17.626s`).
- Adapter gate passed after repair: `mise exec -- pnpm test:adapters` (JS adapters 18/18; PDF unittest 10 tests, 1 skipped, OK).
- Contract gate passed after repair: `mise exec -- pnpm validate:ir` (`Validated 4 Content IR fixtures, 55 public contract fixtures, and 3 adapter files.`).
- Final gates will rerun before commit: `mise exec -- pnpm check`, `git diff --check`.
