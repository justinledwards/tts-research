# Readalong sidecar contracts

Status: first-batch contract pack for QQP-423
Schema family: `*.v1` readalong sidecars

## Purpose

These contracts define the durable source, manifest, artifact, repair, promotion, event, progress, resume, and sync-decision sidecars for the readalong pipeline.

Content IR v1 remains the stable content structure contract. These sidecars carry lifecycle, readiness, revision, staleness, supersession, retry, promotion, progress, and fidelity state so runtime implementations do not add job state or lifecycle flags to Content IR nodes.

## Contract boundaries

| Contract | Schema kind | Purpose |
| --- | --- | --- |
| SourceEnvelope | `source-envelope.v1` | Durable source identity independent of jobs, including project/temporary/imported origin and current revision. |
| SourceRevision | `source-revision.v1` | Immutable source revision, raw artifact linkage, repair/supersession metadata. |
| ExtractionRevision | `extraction-revision.v1` | Adapter/extraction run identity tied to a source revision and extraction status. |
| ReadingUnitManifest | `reading-unit-manifest.v1` | Stable reading-unit snapshot: unit IDs, sparse order keys, readiness, provenance, locators, fingerprints, and warnings. |
| ReadalongManifest | `readalong-manifest.v1` | Readalong manifest binding reading units to speech plans, audio artifacts, highlight maps, compatibility records, sync decisions, progress, and repair overlays. |
| AudioArtifact | `audio-artifact.v1` | Segment-level audio artifact state including generating, unchecked, checked, stale, replaced, failed, retryable, and interrupted. |
| ArtifactCompatibility | `artifact-compatibility.v1` | Reuse/staleness decision for artifacts across source revisions and repairs. |
| RepairOverlay | `repair-overlay.v1` | Immutable repair layer targeting a new revision without mutating a running manifest. |
| RevisionMap | `revision-map.v1` | Old-to-new unit/locator/progress/highlight remap after repair or extraction correction. |
| PromotionCrosswalk | `promotion-crosswalk.v1` | Temporary Quick Listen identity to durable project identity mapping. |
| SourceManifestEvent | `source-manifest-event.v1` | Sequenced advisory source/manifest event envelope with authoritative snapshot fallback. |
| DurableProgress | `durable-progress.v1` | Canonical progress/bookmark/highlight position bound to source, revision, manifest, locator, and optional artifact. |
| ResumeResolution | `resume-resolution.v1` | Deterministic reopen/resume decision across current, degraded, stale, failed, interrupted, remapped, and superseded states. |
| SyncFidelityDecision | `sync-fidelity-decision.v1` | Explicit exact/phrase/block/audio-only/source-only sync decision, including evidence gates and low-resource downgrades. |

## Invariants

1. Source identity is not job identity. Jobs may create artifacts; sources and manifests own durable reading state.
2. Content IR is content-only. Lifecycle, readiness, staleness, source revision, artifact, and progress semantics live in sidecars.
3. Reading unit IDs must be stable across compatible revisions. Insertions and reorders use sparse order keys and revision maps.
4. Readable, narratable, alignable, pending, and blocked are separate unit readiness states.
5. Recoverable degraded extraction may still emit readable units and manifest snapshots.
6. Manifest snapshots are authoritative. Source/manifest events are sequenced advisory hints; reconnect resolves by fetching a snapshot.
7. Audio may be playable while unchecked only when explicitly labeled and replaceable.
8. Exact word sync is forbidden unless source revision, text mapping, timing confidence, stale state, and resource gates pass.
9. Browser localStorage may store layout/reopen hints only; it is not canonical progress or artifact state.
10. Repairs create immutable overlays and superseding revisions/manifests rather than mutating running manifests.
11. Stale/superseded progress resolves through `RevisionMap` before auto-resume or old-vs-repaired choice.
12. Quick Listen promotion maps identities through `PromotionCrosswalk`; QQP-4 remains the capture anchor.

## Schema locations

Canonical source schemas live under:

- `backend/internal/contentir/schema/*.schema.json`

Generated/public mirrors are produced by `mise exec -- pnpm generate:contracts`:

- `docs/contracts/schema-bundle.v1.json`
- `packages/schema/schemas/*.schema.json`
- `packages/sdk-py/src/voice_studio_sdk/schema_files/*.schema.json`
- `fixtures/contracts/schema-snapshots/*.schema.json`
- `packages/schema/src/generated/contracts.ts`
- `packages/schema/src/generated/schemas.ts`

## Public fixtures

Representative fixtures live under `fixtures/contracts/readalong-*.json` and cover:

- current project source, source revision, extraction revision, reading-unit manifest, readalong manifest, checked audio, compatibility, durable progress, and resume resolution;
- recoverable degraded extraction and reading-unit manifest;
- stale/superseded manifest, artifact, compatibility, and progress;
- interrupted/retryable audio and source-manifest event;
- immutable repair overlay and revision map to repaired revision;
- Quick Listen temporary source/revision/manifest/audio/progress and promotion crosswalk to durable project source;
- exact word and low-resource sync fidelity decisions.

## Deterministic validation

Run:

```bash
mise exec -- pnpm generate:contracts
mise exec -- pnpm validate:ir
mise exec -- pnpm --filter @tts-research/schema build
mise exec -- pnpm --filter @tts-research/schema test:core
```

`validate:ir` checks:

- generated schema outputs are up to date;
- every public fixture validates against its JSON schema;
- every sidecar kind has at least one fixture;
- basic sidecar identity references resolve across source/revision/extraction/manifest/artifact/repair/promotion/event/progress/resume/sync fixtures;
- exact sync decisions reference HighlightMap v2 evidence and explicitly set `exactAllowed=true`.

## Non-goals for this contract issue

- No backend persistence implementation.
- No manifest storage API.
- No source/manifest event runtime stream.
- No frontend manifest store.
- No adapter stable-unit backfill.
- No audio retry implementation.
- No repair UI/workbench.
- No Quick Listen capture or promotion runtime implementation.
