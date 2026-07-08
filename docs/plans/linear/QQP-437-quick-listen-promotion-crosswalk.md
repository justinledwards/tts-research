# QQP-437 — Quick Listen to project promotion crosswalk

Linear: https://linear.app/niklas-olsson/issue/QQP-437/quick-listen-to-project-promotion-crosswalk

## Goal

Promote temporary Quick Listen sources into durable project sources while preserving mapped progress, artifacts, highlights, and source identity.

QQP-4 is complete and remains the capture anchor. Do not duplicate Quick Listen capture in this issue.

## Scope

- Backend promotion/crosswalk behavior for temporary Quick Listen sources becoming durable project sources.
- Preserve source/manifest/revision invariants from `docs/architecture/source-reader-flow-invariants.md`.
- Preserve or map by default:
  - source envelope/revision identity lineage;
  - reading/readalong manifest identity where applicable;
  - generated audio artifacts and timing/highlight maps when requested;
  - durable progress/bookmarks/reopen anchors where existing runtime support exists;
  - repair/stale/supersession references without mutating running manifests.
- Keep temporary expiry/discard semantics local to unpromoted artifacts.
- Keep QQP-4 capture behavior unchanged.

## Non-scope

- No new Quick Listen capture surface.
- No broad Reader UI redesign.
- No final evidence package; QQP-441 owns active-processing evidence.
- No unrelated source lifecycle, artifact state, or resume resolver rewrite.

## Acceptance criteria

- Promotion creates durable project-owned source state with an explicit promotion crosswalk/provenance record from temporary source IDs to durable IDs.
- Promotion preserves generated audio/timing/highlight/progress mappings when requested and does not leave durable project state pointing at temporary-only IDs.
- Temporary source lifecycle reflects promoted state without deleting durable artifacts.
- Discard/cleanup of the original temporary source does not remove promoted durable project artifacts.
- Deterministic tests cover successful promotion and at least one negative/no-project-mutation failure path.
- Issue-specific focused commands pass.
- Before closeout: `mise exec -- pnpm check` passes.

## Suggested seams

- `backend/internal/pipeline/temporary_sources.go`
- `backend/internal/pipeline/temporary_sources_test.go`
- `backend/internal/httpapi/temporary_source_routes.go`
- `backend/internal/httpapi/temporary_source_routes_test.go`
- Promotion/crosswalk sidecar contracts in `docs/contracts/readalong-sidecars.md` and schema fixtures if runtime shape changes.
- Frontend promotion API/types/UI only if backend response contract changes require it.

## Verification plan

Implementer should discover exact focused commands. Expected minimum:

- focused backend temporary-source promotion tests;
- focused HTTP route tests for `/api/temporary-sources/:id/promote`;
- `mise exec -- pnpm validate:ir` if sidecar/contract fixtures change;
- `git diff --check`;
- parent will run `mise exec -- pnpm check` before commit/Linear Done.
