# Atomicity verdict

**ATOMIC ENOUGH FOR LINEAR**

The refined 19-new-issue batch is atomic enough to create in Linear after tightening a few titles, dependencies, and acceptance scopes. No additional split is required, and no issue must be dropped to satisfy the active issue cap.

The main corrections are:

1. `readalong-contracts` must explicitly include **all first-batch sidecar contracts**, including durable progress/resume resolution, source-manifest events, and audio artifact state shape.
2. `incremental-speech-plan-segmentation` should not depend on the frontend store; it is a backend/contracted data slice.
3. `durable-progress-resume-resolver` should depend on `source-lifecycle-storage`.
4. `retry-interrupted-artifact-semantics` should depend on `source-lifecycle-storage`.
5. `quick-listen-promotion-crosswalk` should depend on `manifest-snapshot-storage-api` because it maps manifest identity, not only source/audio/progress identity.
6. `active-processing-evidence-gates` should remain a merged evidence issue, but its scope must be strictly evidence-only: screenshots, budgets, fixture runs, logs, and review package. No feature implementation.

# Flowchart verdict

The flowcharts are sane and complete enough for the first batch.

They correctly separate:

* intake from extraction;
* source identity from jobs;
* readable, narratable, and alignable readiness;
* unchecked audio from checked/timed audio;
* exact sync from degraded sync;
* repair/supersession from mutation;
* Quick Listen capture from durable project promotion.

Material additions to make in the flow doc before Linear creation:

1. **Degraded extraction should be able to continue into a manifest snapshot.**
   The current flow sends `failed/degraded` to “record recoverable extraction warning,” but it should show that recoverable warnings may still produce readable units and snapshots. Only unrecoverable/no-readable-output failures should become terminal or retry-only.

2. **Add an explicit pending/blocked unit state.**
   Some units will be known but not yet readable, narratable, or alignable. The flow should include `pending_extraction`, `blocked`, or equivalent so implementers do not fake readiness.

3. **Make snapshot fallback explicit for events.**
   The event stream should be advisory/sequenced, while the persisted manifest snapshot remains the authoritative recovery state. Reconnect should resolve by fetching the latest snapshot plus event cursor.

4. **Make stale/superseded resume resolution explicit after repair.**
   The repair flow should show that progress/bookmarks/highlight maps resolve through the revision map before deciding whether to auto-resume or offer old-vs-repaired state.

These are doc-level corrections, not blockers to the batch shape.

# Invariant/contract verdict

The invariants and contract map are sane.

The most important architectural choice is correct: **stable Content IR remains the content structure contract, while lifecycle/readiness/staleness/revision behavior lives in sidecar contracts.** That separation should be preserved.

Valid existing contracts to reuse:

| Existing contract                                    | Verdict                            | Use                                                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content-ir.v1` / `docs/contracts/content-ir.md`     | Reuse as stable                    | Node/content structure only. Do not add lifecycle, job, readiness, or staleness state into Content IR.                                                                                              |
| `locator-envelope.v1` / `docs/contracts/locators.md` | Reuse as stable                    | Progress, bookmarks, highlight anchors, remap targets. Add source/manifest binding in sidecars if needed.                                                                                           |
| `speech-plan.v1` / `docs/contracts/speech-plan.md`   | Reuse as stable                    | Speech segment payload/plan shape. Bind segments to source/revision/manifest/unit identity through sidecar fields or compatible metadata.                                                           |
| `highlight-map.v2`                                   | Reuse if already present/validated | Exact/phrase/block/audio-only decisions should reference this, but stale/fidelity gating must live outside the raw highlight map. The flow doc should cite its exact contract path for consistency. |

New sidecar contracts that must be added or formalized in the first batch:

| New sidecar contract                        | Required purpose                                                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SourceEnvelope`                            | Durable source identity independent of jobs.                                                                                                                     |
| `SourceRevision`                            | Immutable source revision identity, raw artifact linkage, supersession metadata.                                                                                 |
| `ExtractionRevision`                        | Adapter/extraction run identity tied to source revision and emitted units.                                                                                       |
| `ReadingUnitManifest`                       | Stable reading unit snapshot, order keys, readiness, provenance, current/stale state.                                                                            |
| `ReadalongManifest`                         | Readalong-level manifest binding units, speech plans, audio artifacts, sync/highlight maps, and progress references.                                             |
| `AudioArtifact` / audio segment state shape | Checked/unchecked/stale/replaced/failed artifact state, provider identity, compatibility keys, retry scope.                                                      |
| `ArtifactCompatibility`                     | Reuse/staleness rules across source revisions, repairs, audio, highlight maps, and speech plans.                                                                 |
| `RepairOverlay`                             | Immutable repair layer; no mutation of running manifests.                                                                                                        |
| `RevisionMap`                               | Old-to-new unit/locator/progress/highlight remap after repair or extraction correction.                                                                          |
| `PromotionCrosswalk`                        | Temporary Quick Listen identity to durable project identity mapping.                                                                                             |
| `SourceManifestEvent`                       | Sequenced backend event envelope for source/manifest progress with snapshot fallback.                                                                            |
| `DurableProgress` / `ResumeResolution`      | Canonical progress state and deterministic reopen/resume resolution across exact, degraded, stale, superseded, failed, and interrupted states.                   |
| `SyncFidelityDecision`                      | Explicit exact/phrase/block/audio-only/source-only decision record, unless already fully represented by `highlight-map.v2` plus artifact compatibility sidecars. |

The contract map should add rows for `AudioArtifact`, `DurableProgress`, `ResumeResolution`, and `SourceManifestEvent` so they are not implied but undefined.

# Issue-by-issue review

| Slug                                    | Verdict | Reason                                                                                                                   | Corrected title / dependencies / acceptance scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readalong-contracts`                   | keep    | Atomic as a single repo contract pack, provided it is spec/fixture/validation only.                                      | **Title:** Readalong source, manifest, artifact, repair, promotion, event, and progress contract pack. **Deps:** none. **Scope:** Add docs/schemas/fixtures/validation for SourceEnvelope, SourceRevision, ExtractionRevision, ReadingUnitManifest, ReadalongManifest, AudioArtifact state, ArtifactCompatibility, RepairOverlay, RevisionMap, PromotionCrosswalk, SourceManifestEvent, DurableProgress, and ResumeResolution. No runtime implementation.                                                                |
| `source-lifecycle-storage`              | keep    | Backend source persistence is one deliverable, but startup recovery must be narrowly scoped.                             | **Title:** Backend source lifecycle storage and startup interruption marking. **Deps:** `readalong-contracts`. **Scope:** Persist source identity, source revisions, raw artifacts, and mark orphaned active source/extraction work as `interrupted_retriable` on restart. No manifest snapshot API, no audio retry implementation, no frontend.                                                                                                                                                                         |
| `manifest-snapshot-storage-api`         | keep    | Atomic backend storage/API slice.                                                                                        | **Title:** Manifest snapshot storage API. **Deps:** `readalong-contracts`, `source-lifecycle-storage`. **Scope:** Persist and retrieve ReadingUnitManifest/ReadalongManifest snapshots by source/revision/manifest identity with current/superseded semantics. No SSE/client store.                                                                                                                                                                                                                                      |
| `stable-unit-ir-core-adapters`          | keep    | Atomic adapter-contract backfill for the proof adapters if the adapter set is named.                                     | **Title:** Stable unit identity for core adapters. **Deps:** `readalong-contracts`. **Scope:** HTML, EPUB, and Markdown core adapters emit stable unit IDs, sparse order keys, fingerprints, locators, and provenance that validate against Content IR plus manifest sidecars. No PDF/DOCX/OCR best-in-class work.                                                                                                                                                                                                       |
| `lower-tier-adapter-contract-fit`       | keep    | Atomic report/warning lane; prevents overclaiming non-core adapters.                                                     | **Title:** Lower-tier adapter contract-fit reports. **Deps:** `readalong-contracts`. **Scope:** Produce deterministic contract-fit reports and warnings for DOCX/PDF/OCR or other non-core adapters. No best-in-class implementation claim.                                                                                                                                                                                                                                                                              |
| `epub-html-incremental-extraction`      | keep    | Acceptable vertical proof path if limited to incremental emission/snapshotting.                                          | **Title:** Incremental extraction proof for HTML and EPUB. **Deps:** `source-lifecycle-storage`, `manifest-snapshot-storage-api`, `stable-unit-ir-core-adapters`. **Scope:** HTML/EPUB extraction emits readable units incrementally and writes manifest snapshots as units become available. No unrelated adapter upgrades.                                                                                                                                                                                             |
| `source-manifest-event-stream`          | keep    | Backend event protocol is atomic when separated from frontend store.                                                     | **Title:** Source and manifest backend event stream. **Deps:** `readalong-contracts`, `manifest-snapshot-storage-api`. **Scope:** Implement sequenced source/manifest SSE or equivalent backend event protocol with deterministic tests and snapshot fallback contract. No frontend store.                                                                                                                                                                                                                               |
| `frontend-source-manifest-store`        | keep    | Atomic frontend state slice.                                                                                             | **Title:** Frontend source/manifest store. **Deps:** `source-manifest-event-stream`, `manifest-snapshot-storage-api`. **Scope:** Client store keyed by source/revision/manifest identity with reconnect, snapshot fallback, render coalescing, and disposable cache behavior.                                                                                                                                                                                                                                            |
| `incremental-speech-plan-segmentation`  | keep    | Atomic backend/readalong planning slice; dependency on frontend store is unnecessary.                                    | **Title:** Incremental speech-plan segmentation for first narratable prefix. **Deps:** `readalong-contracts`, `manifest-snapshot-storage-api`, `epub-html-incremental-extraction`. **Scope:** Speech plan segments reference source/revision/manifest/unit identity and may start from the earliest contiguous narratable prefix. No audio artifact state implementation.                                                                                                                                                |
| `partial-audio-artifact-states`         | keep    | Atomic artifact state-machine slice.                                                                                     | **Title:** Partial audio artifact states and replacement semantics. **Deps:** `incremental-speech-plan-segmentation`. **Scope:** Persist segment-level audio artifact states including generating, unchecked, checked, stale, replaced, failed, and retryable. No sync fidelity UI.                                                                                                                                                                                                                                      |
| `sync-fidelity-gates`                   | keep    | Atomic decision layer.                                                                                                   | **Title:** Sync fidelity gates for exact, phrase, block, audio-only, and source-only modes. **Deps:** `partial-audio-artifact-states`. **Scope:** Decide allowable sync/highlight fidelity from revision identity, text mapping, timing confidence, stale state, and low-resource gates. Exact word highlighting is forbidden unless all gates pass.                                                                                                                                                                     |
| `durable-progress-resume-resolver`      | keep    | Atomic persistence/resolution slice, but must depend on source lifecycle.                                                | **Title:** Durable progress and manifest-aware resume resolver. **Deps:** `source-lifecycle-storage`, `manifest-snapshot-storage-api`, `sync-fidelity-gates`. **Scope:** Persist canonical progress and resolve reopen order across current, degraded, stale, failed, interrupted, remapped, and superseded states. Browser localStorage remains non-authoritative.                                                                                                                                                      |
| `retry-interrupted-artifact-semantics`  | keep    | Atomic retry semantics slice; source lifecycle dependency is required for restart behavior.                              | **Title:** Retry and interrupted artifact semantics. **Deps:** `source-lifecycle-storage`, `partial-audio-artifact-states`, `durable-progress-resume-resolver`. **Scope:** Artifact/segment-scoped retry semantics across cancellation, provider failure, backend restart, checking failure, stale artifacts, and compatible reuse. No broad job orchestration rewrite.                                                                                                                                                  |
| `minimal-repair-overlay-supersession`   | keep    | Atomic minimal repair/supersession slice if it avoids a repair workbench.                                                | **Title:** Minimal repair overlay and manifest supersession. **Deps:** `readalong-contracts`, `manifest-snapshot-storage-api`, `durable-progress-resume-resolver`, `retry-interrupted-artifact-semantics`. **Scope:** Create immutable repair overlays, superseding manifests, affected-unit stale markings, and revision-map-based progress remap. No full repair UI/workbench.                                                                                                                                         |
| `quick-listen-promotion-crosswalk`      | keep    | Atomic promotion slice; must not duplicate QQP-4.                                                                        | **Title:** Quick Listen to project promotion crosswalk. **Deps:** `QQP-4`, `source-lifecycle-storage`, `manifest-snapshot-storage-api`, `partial-audio-artifact-states`, `durable-progress-resume-resolver`. **Scope:** Promote temporary Quick Listen source identity into durable project identity while preserving source/unit/segment/audio/highlight/progress IDs through a PromotionCrosswalk. QQP-4 remains the capture anchor and should be linked/rescoped.                                                     |
| `reader-shell-state-vocabulary`         | keep    | Atomic UI vocabulary/labels slice.                                                                                       | **Title:** Reader shell state vocabulary and mode labels. **Deps:** `frontend-source-manifest-store`. **Scope:** Reader shell labels/state chips/mode ownership for source-only, generating, unchecked, checked, degraded, stale, failed, retryable, and superseded states. No visual redesign.                                                                                                                                                                                                                          |
| `reader-transport-state-machine`        | keep    | Atomic transport UI state machine.                                                                                       | **Title:** Reader transport state machine. **Deps:** `partial-audio-artifact-states`, `reader-shell-state-vocabulary`. **Scope:** Shared transport states for pre-audio, generating, unchecked playable audio, checked audio, stale/replaced artifacts, failed/retryable segments, and degraded sync.                                                                                                                                                                                                                    |
| `reader-windowing-highlight-scheduling` | keep    | Atomic rendering/performance/scheduling slice.                                                                           | **Title:** Reader windowing and highlight scheduling. **Deps:** `sync-fidelity-gates`, `reader-shell-state-vocabulary`, `reader-transport-state-machine`. **Scope:** Internal reader windowing, high-frequency highlight isolation, constrained-device downgrade, and low-resource sync fidelity fallback. No new visual design system.                                                                                                                                                                                  |
| `active-processing-evidence-gates`      | keep    | Merging evidence/performance with canonical fixture proof is acceptable under the cap, but it must remain evidence-only. | **Title:** First-batch active-processing and canonical fixture evidence gate. **Deps:** `quick-listen-promotion-crosswalk`, `reader-windowing-highlight-scheduling`, `retry-interrupted-artifact-semantics`, `minimal-repair-overlay-supersession`, `lower-tier-adapter-contract-fit`. **Scope:** Produce deterministic evidence package: commands, logs, screenshots, performance budgets, degraded-mode proof, and Design for the Real World fixture review. No feature implementation beyond test/evidence harnesses. |

# Final batch shape

Existing active issue retained:

| Existing issue                     | Role                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| `QQP-4` — Quick Narrate Pasted URL | Existing Quick Listen capture anchor. Link/rescope; do not duplicate. |

Create these **19 new issues**:

| Slug                                    | Title                                                                                      | Priority | Dependencies                                                                                                                                                                                  | Atomic deliverable                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readalong-contracts`                   | Readalong source, manifest, artifact, repair, promotion, event, and progress contract pack | P1       | none                                                                                                                                                                                          | Add the complete first-batch sidecar contract pack with docs, schemas, fixtures, and validation, without runtime implementation.                                       |
| `source-lifecycle-storage`              | Backend source lifecycle storage and startup interruption marking                          | P1       | `readalong-contracts`                                                                                                                                                                         | Persist source identity, source revisions, raw source artifacts, and startup `interrupted_retriable` marking for orphaned active work.                                 |
| `manifest-snapshot-storage-api`         | Manifest snapshot storage API                                                              | P1       | `readalong-contracts`, `source-lifecycle-storage`                                                                                                                                             | Persist and retrieve reading-unit/readalong manifest snapshots by source/revision/manifest identity.                                                                   |
| `stable-unit-ir-core-adapters`          | Stable unit identity for core adapters                                                     | P1       | `readalong-contracts`                                                                                                                                                                         | Make HTML, EPUB, and Markdown core adapters emit stable unit IDs, order keys, fingerprints, locators, and provenance.                                                  |
| `lower-tier-adapter-contract-fit`       | Lower-tier adapter contract-fit reports                                                    | P2       | `readalong-contracts`                                                                                                                                                                         | Produce deterministic contract-fit reports and warnings for non-core adapters without claiming best-in-class behavior.                                                 |
| `epub-html-incremental-extraction`      | Incremental extraction proof for HTML and EPUB                                             | P1       | `source-lifecycle-storage`, `manifest-snapshot-storage-api`, `stable-unit-ir-core-adapters`                                                                                                   | Emit readable HTML/EPUB units incrementally and write manifest snapshots as units become available.                                                                    |
| `source-manifest-event-stream`          | Source and manifest backend event stream                                                   | P1       | `readalong-contracts`, `manifest-snapshot-storage-api`                                                                                                                                        | Implement a sequenced backend source/manifest event protocol with deterministic tests and snapshot fallback.                                                           |
| `frontend-source-manifest-store`        | Frontend source/manifest store                                                             | P1       | `source-manifest-event-stream`, `manifest-snapshot-storage-api`                                                                                                                               | Add a frontend store keyed by source/revision/manifest identity with reconnect and snapshot fallback behavior.                                                         |
| `incremental-speech-plan-segmentation`  | Incremental speech-plan segmentation for first narratable prefix                           | P1       | `readalong-contracts`, `manifest-snapshot-storage-api`, `epub-html-incremental-extraction`                                                                                                    | Generate speech-plan segments tied to source/revision/manifest/unit identity from the earliest contiguous narratable prefix.                                           |
| `partial-audio-artifact-states`         | Partial audio artifact states and replacement semantics                                    | P1       | `incremental-speech-plan-segmentation`                                                                                                                                                        | Persist segment-level audio artifact states and replacement/reuse semantics for unchecked, checked, stale, replaced, failed, and retryable audio.                      |
| `sync-fidelity-gates`                   | Sync fidelity gates for exact, phrase, block, audio-only, and source-only modes            | P1       | `partial-audio-artifact-states`                                                                                                                                                               | Gate sync/highlight fidelity so exact word highlighting is only allowed with sufficient revision, mapping, timing, and resource evidence.                              |
| `durable-progress-resume-resolver`      | Durable progress and manifest-aware resume resolver                                        | P1       | `source-lifecycle-storage`, `manifest-snapshot-storage-api`, `sync-fidelity-gates`                                                                                                            | Persist canonical progress and deterministically resolve reopen/resume state across current, stale, degraded, failed, interrupted, remapped, and superseded manifests. |
| `retry-interrupted-artifact-semantics`  | Retry and interrupted artifact semantics                                                   | P1       | `source-lifecycle-storage`, `partial-audio-artifact-states`, `durable-progress-resume-resolver`                                                                                               | Implement artifact/segment-scoped retry behavior across cancellation, provider failure, backend restart, checking failure, and compatible reuse.                       |
| `minimal-repair-overlay-supersession`   | Minimal repair overlay and manifest supersession                                           | P2       | `readalong-contracts`, `manifest-snapshot-storage-api`, `durable-progress-resume-resolver`, `retry-interrupted-artifact-semantics`                                                            | Add immutable repair overlays, superseding manifests, affected-artifact stale marking, and revision-map-based progress remap.                                          |
| `quick-listen-promotion-crosswalk`      | Quick Listen to project promotion crosswalk                                                | P1       | `QQP-4`, `source-lifecycle-storage`, `manifest-snapshot-storage-api`, `partial-audio-artifact-states`, `durable-progress-resume-resolver`                                                     | Promote temporary Quick Listen sources into durable project sources while preserving mapped progress, artifacts, highlights, and source identity.                      |
| `reader-shell-state-vocabulary`         | Reader shell state vocabulary and mode labels                                              | P1       | `frontend-source-manifest-store`                                                                                                                                                              | Add Reader shell labels/state vocabulary for source-only, generating, unchecked, checked, degraded, stale, failed, retryable, and superseded states.                   |
| `reader-transport-state-machine`        | Reader transport state machine                                                             | P1       | `partial-audio-artifact-states`, `reader-shell-state-vocabulary`                                                                                                                              | Add shared Reader transport states for pre-audio, generating, unchecked, checked, stale/replaced, failed/retryable, and degraded playback.                             |
| `reader-windowing-highlight-scheduling` | Reader windowing and highlight scheduling                                                  | P1       | `sync-fidelity-gates`, `reader-shell-state-vocabulary`, `reader-transport-state-machine`                                                                                                      | Implement internal reader windowing, high-frequency highlight isolation, and low-resource fidelity downgrade behavior.                                                 |
| `active-processing-evidence-gates`      | First-batch active-processing and canonical fixture evidence gate                          | P2       | `quick-listen-promotion-crosswalk`, `reader-windowing-highlight-scheduling`, `retry-interrupted-artifact-semantics`, `minimal-repair-overlay-supersession`, `lower-tier-adapter-contract-fit` | Produce the final deterministic evidence package for the canonical fixture, performance budgets, degraded modes, screenshots, logs, and review handoff.                |

Total active count after creation: **20**
Existing active issue: **1**
New issues: **19**

# Gate before Linear creation

Update these repo-local artifacts before creating Linear issues:

1. `docs/architecture/source-reader-flow-invariants.md`

   Required edits:

   * Change status from draft pending ChatGPT agreement to agreed/ready for Linear seeding.
   * Add recoverable degraded extraction path back into manifest snapshot creation.
   * Add explicit pending/blocked unit readiness state.
   * Add snapshot-fallback/reconnect semantics for source/manifest events.
   * Add stale/superseded resume resolution after repair.
   * Add contract status rows for `AudioArtifact`, `SourceManifestEvent`, `DurableProgress`, `ResumeResolution`, and optionally `SyncFidelityDecision`.
   * Cite the exact `highlight-map.v2` contract path if it exists.
   * Clarify that Content IR remains stable and lifecycle/readiness/staleness are sidecars.

2. `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`

   Required edits:

   * Change status from draft pending ChatGPT atomicity/flow agreement to agreed/ready for Linear creation.
   * Replace the refined candidate batch with the final 19-issue list above.
   * Add the corrected dependency changes:

     * remove `frontend-source-manifest-store` from `incremental-speech-plan-segmentation`;
     * add `source-lifecycle-storage` to `durable-progress-resume-resolver`;
     * add `source-lifecycle-storage` to `retry-interrupted-artifact-semantics`;
     * add `manifest-snapshot-storage-api` to `quick-listen-promotion-crosswalk`;
     * add evidence-only dependencies to `active-processing-evidence-gates`.
   * Preserve the non-negotiable invariant that `QQP-4` is linked/rescoped and not duplicated.

3. `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`

   Required edits:

   * Replace issue payloads with the final slugs, titles, priorities, dependencies, and atomic deliverable sentences above.
   * Include project cap metadata:

     * project: `TTS-Research`;
     * active cap: `20`;
     * existing active issue: `QQP-4`;
     * max new active issues: `19`;
     * planned new active issues: `19`.
   * Include an explicit `links_existing_issue` or equivalent field for `quick-listen-promotion-crosswalk` pointing to `QQP-4`.
   * Include `do_not_create_duplicate_quick_listen_issue: true`.
   * Include evidence commands already validated:

     * `mise exec -- pnpm generate:contracts`;
     * `mise exec -- pnpm validate:ir`;
     * `mise exec -- pnpm test:adapters`.

4. Optional but recommended if the repo keeps ChatGPT review records:

   * Add this review as a new file under `docs/reviews/chatgpt/`, for example:

     * `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`

   This is not an implementation dependency, but it preserves the agreement trail before Linear creation.

AGREED ATOMIC FLOW AND LINEAR BATCH
