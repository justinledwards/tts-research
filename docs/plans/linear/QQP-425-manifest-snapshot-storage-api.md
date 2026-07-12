# QQP-425 — Manifest snapshot storage API

Status: complete
Linear: https://linear.app/niklas-olsson/issue/QQP-425/manifest-snapshot-storage-api
Slug: `manifest-snapshot-storage-api`

## Selection rationale

QQP-425 is the next selected issue because its dependencies are now Done:

- QQP-423 `readalong-contracts` — Done.
- QQP-424 `source-lifecycle-storage` — Done.

QQP-426 is also Done and pushed, so core adapter stable identity is available before manifest snapshots consume unit IDs/order keys/fingerprints.

## Atomic deliverable

Persist and retrieve reading-unit/readalong manifest snapshots by source/revision/manifest identity.

## Scope

Backend storage/API only:

- Persist `ReadingUnitManifest` snapshots.
- Persist `ReadalongManifest` snapshots.
- Retrieve snapshots by source/revision/manifest identity.
- Current/superseded semantics for manifest snapshots.
- Deterministic backend tests for storage, retrieval, supersession/current behavior, missing IDs, and schema-shaped data.

Out of scope:

- Source/manifest SSE or event stream (`QQP-429`).
- Frontend source/manifest store (`QQP-430`).
- Incremental extraction runtime (`QQP-428`).
- Speech-plan segmentation (`QQP-431`).
- Audio artifact state implementation (`QQP-432`).
- Durable progress/resume resolver (`QQP-434`).
- Repair overlays/supersession runtime beyond snapshot current/superseded bookkeeping.
- Quick Listen promotion runtime.
- Broad API redesign or unrelated source lifecycle changes.

## Contract references

- `docs/contracts/readalong-sidecars.md`
- `backend/internal/contentir/schema/reading-unit-manifest.v1.schema.json`
- `backend/internal/contentir/schema/readalong-manifest.v1.schema.json`
- `fixtures/contracts/readalong-current.reading-unit-manifest.v1.json`
- `fixtures/contracts/readalong-current.readalong-manifest.v1.json`
- `fixtures/contracts/readalong-degraded.reading-unit-manifest.v1.json`
- `fixtures/contracts/readalong-superseded.readalong-manifest.v1.json`

## Existing implementation context

- Source lifecycle persistence exists in `backend/internal/pipeline/source_lifecycle.go` and stores source envelopes/revisions/raw artifacts under `Options.SourceLifecycleDataDir`.
- QQP-426 stable unit identity provides stable Content IR node/unit identifiers, order keys, and fingerprints for core adapters.
- No manifest snapshot storage/API implementation should be assumed complete before this issue.

## Implementation expectations

1. Keep the implementation backend-only and narrowly scoped.
2. Add explicit Go structs/types for reading-unit/readalong manifest snapshots if absent; keep JSON fields compatible with the existing schemas.
3. Add persistence under a dedicated manifest snapshot directory or clearly namespaced source lifecycle subdirectory.
4. Use atomic JSON writes, deterministic IDs, safe path IDs, and existing project conventions.
5. Support retrieval by:
   - manifest ID;
   - source ID + source revision ID + current manifest kind, where applicable;
   - reading-unit manifest ID from readalong manifest records.
6. Implement current/superseded semantics:
   - writing a new current manifest for the same source/revision/kind should mark the previous current as superseded and/or link `supersededByManifestId` where compatible with schema.
   - historical/superseded snapshots remain retrievable by manifest ID.
7. Preserve schema boundaries: Content IR remains content-only; lifecycle/readiness/staleness belongs in sidecar snapshot records.
8. Do not emit events/SSE; if event hooks are useful, leave them as storage metadata only and defer runtime event stream to QQP-429.
9. Add deterministic backend tests. Prefer focused tests in `backend/internal/pipeline/*manifest*_test.go` or equivalent.

## Expected verification

Focused gates:

```bash
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -run 'Manifest|ReadingUnit|Readalong' -count=1
mise exec -- pnpm validate:ir
```

Full gates before completion:

```bash
mise exec -- pnpm check
git diff --check
```

## Review gates

- Spec review must confirm scope is limited to backend snapshot storage/API and does not implement QQP-428/429/430/431/432/434 runtime slices.
- Quality review must inspect identity/path safety, atomic persistence, current/superseded behavior, schema compatibility, deterministic tests, and absence of frontend/event-stream scope creep.

Actual review state:

- Spec review: PASS (`deleg_0d1fd192`).
- Initial quality review: REQUEST_CHANGES (`deleg_8a7664ec`) for crash-unsafe supersession write ordering and shallow nested metadata/locator/provenance clone aliasing.
- Repair: focused sub-agent `deleg_0b07d494` repaired those blockers.
- Targeted quality re-review: APPROVED (`deleg_5f6b97a4`).
- Final parent gates passed at `2026-07-07 20:25 CEST`:
  - `mise exec -- pnpm check`
  - `git diff --check`
  - focused and full pipeline Go gates were also run after repair before final review.
