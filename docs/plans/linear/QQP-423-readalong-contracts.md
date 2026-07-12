# QQP-423 — Readalong contracts implementation plan

Status: planned
Updated: 2026-07-07 12:21 CEST

## Linear

- Issue: QQP-423
- URL: https://linear.app/niklas-olsson/issue/QQP-423/readalong-source-manifest-artifact-repair-promotion-event-and-progress
- Slug: `readalong-contracts`
- Title: Readalong source, manifest, artifact, repair, promotion, event, and progress contract pack
- Priority: P1
- Dependencies: none

## Atomic deliverable

Add the complete first-batch sidecar contract pack with docs, schemas, fixtures, and validation, without runtime implementation.

## In scope

1. Add sidecar contract documentation under `docs/contracts/` for:
   - SourceEnvelope
   - SourceRevision
   - ExtractionRevision
   - ReadingUnitManifest
   - ReadalongManifest
   - AudioArtifact state
   - ArtifactCompatibility
   - RepairOverlay
   - RevisionMap
   - PromotionCrosswalk
   - SourceManifestEvent
   - DurableProgress
   - ResumeResolution
   - SyncFidelityDecision if it is not fully represented by highlight-map v2 plus artifact compatibility.
2. Add JSON schemas for the new sidecar contracts in the canonical schema source tree (`backend/internal/contentir/schema/`) and thread them through generated public schema outputs.
3. Add representative public fixtures under `fixtures/contracts/` that validate the new sidecar contract family and exercise current, degraded, stale, superseded, interrupted, retryable, and promoted identity paths.
4. Extend deterministic validation so `mise exec -- pnpm validate:ir` fails if any new sidecar fixture is malformed or if generated outputs are stale.
5. Extend package/schema exports and tests so the new schema bundle entries are visible to TypeScript/package consumers.

## Out of scope

- Runtime storage, APIs, event streams, frontend stores, adapter backfills, audio retry behavior, repair UI, or Quick Listen promotion implementation.
- Creating or duplicating Linear issues.
- PDF/DOCX/OCR best-in-class behavior.
- Changing source/manifest/revision invariants without parent approval.

## Architecture invariants to preserve

- Content IR v1 remains the stable node/content contract; lifecycle, readiness, staleness, source revision, and artifact state live in sidecars.
- Source identity is not job identity.
- Manifest snapshots are authoritative; source/manifest events are advisory and sequenced.
- Exact word highlighting requires source revision, mapping, timing confidence, and low-resource gates to pass.
- Browser localStorage must not become canonical progress or artifact state.
- Repair overlays are immutable and supersede through revision maps rather than mutating running manifests.
- Quick Listen capture remains anchored to QQP-4; this issue may define PromotionCrosswalk but must not implement capture or duplicate QQP-4.

## Expected file areas

- `docs/contracts/readalong-sidecars.md` or equivalent contract doc(s)
- `backend/internal/contentir/schema/*.schema.json`
- `fixtures/contracts/*.json`
- `scripts/generate-contract-types-templates.mjs`
- `scripts/validate-content-ir.mjs`
- `packages/schema/test/schema.test.mjs`
- generated mirrors after `mise exec -- pnpm generate:contracts`:
  - `packages/schema/schemas/*.schema.json`
  - `packages/sdk-py/src/voice_studio_sdk/schema_files/*.schema.json`
  - `fixtures/contracts/schema-snapshots/*.schema.json`
  - `docs/contracts/schema-bundle.v1.json`
  - `packages/schema/src/generated/contracts.ts`
  - `packages/schema/src/generated/schemas.ts`

## TDD / implementation sequence

1. Add failing validation/package assertions for expected sidecar schema kinds and fixtures.
2. Add schema source files and generator registration.
3. Add contract docs and public fixtures.
4. Generate public schema outputs with `mise exec -- pnpm generate:contracts`.
5. Extend `scripts/validate-content-ir.mjs` to validate sidecar fixtures and basic cross-fixture identity semantics.
6. Run focused gates, then full gate.

## Verification commands

Run in order:

```bash
mise exec -- pnpm generate:contracts
mise exec -- pnpm validate:ir
mise exec -- pnpm --filter @tts-research/schema test:core
mise exec -- pnpm test:scripts
mise exec -- pnpm check
```

`mise exec -- pnpm review:chatgpt` is not required unless review package or screenshot/evidence package content changes beyond contract/docs/test artifacts.

## Acceptance checklist

- [ ] New sidecar contract family is documented and explicitly separate from Content IR.
- [ ] Schema bundle includes all new sidecar schema kinds.
- [ ] Public fixtures validate through the canonical validation command.
- [ ] Generated TypeScript/schema/Python mirrors are up to date.
- [ ] No runtime behavior is implemented.
- [ ] Parent spec review returns `SPEC PASS`.
- [ ] Parent quality review returns `QUALITY APPROVED`.
- [ ] Parent verification commands pass or blockers are reported with RCA.
