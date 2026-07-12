# Resume/retry/state verdict

The current state model can support **basic leave/reopen behavior for completed or partially generated audio jobs**, but it cannot yet support the agreed durable resume/retry model for source-first ASAP read-along.

There are useful foundations:

* Jobs are persisted and reloaded from disk, including metadata, timing, and partial segment audio hydration (`backend/internal/pipeline/projects.go:202-254`; `backend/internal/pipeline/service.go:1515-1613`).
* Playback progress and playback sessions are persisted locally, with source IDs, current time, active word index, locator envelope, and text quote (`backend/internal/pipeline/models.go:1054-1084`, `1111-1127`; `backend/internal/pipeline/progress.go:31-208`).
* Partial segment audio is written atomically and job metadata is persisted as segments become ready (`backend/internal/pipeline/service.go:2334-2433`).
* Temporary source promotion already has a real promotion path and can copy some generated audio/timing artifacts into a project (`backend/internal/pipeline/temporary_sources.go:927-1057`, `1343-1417`).

But the model is still **job-centric, whole-text-centric, and weakly revisioned**. Durable resume for the agreed product must be **source/manifest/revision-centric**.

## Top blockers

**1. Progress is not tied to a source revision or read-along manifest.**
`ReadingPosition` stores source IDs, scope key, active word index, node ID, locator, locator envelope, and text quote, which is a good seed. But it lacks `sourceRevisionId`, `extractionRevisionId`, `repairOverlaySetId`, `manifestId`, `speechPlanId`, `generatedAudioId`, `highlightMapId`, segment ID, phrase/block identity, sync level, and stale/degraded state (`backend/internal/pipeline/models.go:1054-1084`; `frontend/src/types.ts:762-792`). That means the system can reopen “near a place,” but cannot reliably answer: “Is this exact word/audio/highlight state still valid for this source?”

**2. Retry is job-level, not source-unit or artifact-level.**
`RetryJobWithPhase` retries a failed/cancelled job by creating a new job from the old job’s text or optimized text (`backend/internal/pipeline/service.go:650-697`, `748-779`). Reuse is mostly based on matching contiguous segment text (`backend/internal/pipeline/service.go:1669-1748`). That is too coarse for source-first retry. The platform needs to retry extraction revisions, speech-plan revisions, individual segments, alignment maps, and check failures without invalidating unrelated source units.

**3. Source readiness is whole-source coarse state.**
`SourceReadiness` has states such as importing, ready, failed, unsupported, and stale, but not per-unit readiness, revision maps, repair overlays, or artifact compatibility (`backend/internal/pipeline/models.go:356-390`). This blocks exact resume after partial extraction, repair, split/merge, and supersession.

**4. Temporary promotion is copy-based, not identity-preserving enough.**
Promotion can copy temporary content and some generated artifacts, including partial audio when `AudioReadySegments > 0` (`backend/internal/pipeline/temporary_sources.go:1142-1156`, `1343-1417`). But there is no required promotion crosswalk for source revision, manifest, reading units, repair overlays, progress, bookmarks, segment IDs, highlight maps, and stale state. After promotion, old progress can still point at temporary IDs unless explicitly remapped.

**5. Browser-local UI memory is carrying too much product-critical resume meaning.**
`projectState.ts` stores active source/job/stage/reading position in `localStorage` (`frontend/src/projectState.ts:12-26`, `52-78`, `159-187`). That is appropriate for presentation memory, not durable read-along truth. Also, the normalizer preserves several reading-position fields but not `temporarySourceId`, even though the type supports it. That is a concrete promotion/resume hazard.

## Highest-risk transitions

* **Browser or backend restart during active synthesis/checking.** Persisted partial audio can be hydrated, but in-progress jobs may reload as synthesizing/checking without a live worker. They need to become `interrupted_retriable` or explicitly resumed, not remain misleadingly active.
* **Repair overlay while synthesis is active.** Current state does not enforce fork/supersede semantics. Without this, running audio can silently diverge from repaired source text.
* **Temporary source promotion with partial audio/progress.** Current promotion can copy artifacts, but durable source/progress identity needs a crosswalk.
* **Provider/check failure after unchecked audio was exposed.** The product now allows unchecked playback, so unchecked, checked, failed, stale, and replaced segment states must be first-class.
* **Source correction that splits/merges/reorders units.** Current progress mostly relies on active word index and locator fallback; it needs revision/remap state to remain trustworthy.

# Canonical durable state model

The durable model should be organized around **source → revision → manifest → artifacts → progress**, not around job ID alone.

## 1. Project and source identity

Minimum durable fields:

* `projectId`
* `sourceId`
* `sourceOwner: project | temporary`
* `temporarySourceId?`
* `sourceType: paste | markdown | html | epub | pdf | docx | ocrBatch | prepared`
* `originKind: paste | url | file | prepared`
* `displayName`
* `rawArtifactId`
* `rawContentHash`
* `createdAt`
* `updatedAt`
* `currentSourceRevisionId`
* `currentExtractionRevisionId`
* `currentManifestId`
* `currentRepairOverlaySetId?`
* `promotionState?`

The source envelope is durable even when extraction, synthesis, or alignment fails.

## 2. Source revision and extraction revision

Separate raw source identity from adapter output.

**Source revision** should represent the immutable source input:

* `sourceRevisionId`
* `sourceId`
* `rawArtifactId`
* `rawContentHash`
* `sourceUri?`
* `fetchedAt?`
* `mimeType`
* `createdAt`
* `supersededBySourceRevisionId?`

**Extraction revision** should represent an adapter run over that source revision:

* `extractionRevisionId`
* `sourceRevisionId`
* `adapterId`
* `adapterVersion`
* `adapterConfigHash`
* `status: pending | running | partial | complete | failed | interrupted | superseded`
* `qualityReportId`
* `contentIrFragmentIds`
* `finalContentIrId?`
* `startedAt`
* `completedAt?`
* `failure?`

A repair overlay does not mutate either one. It creates a new source view/manifest over the immutable extraction output.

## 3. Reading unit identity, order, and remap

Each readable unit needs:

* `unitId`
* `nodeId`
* `sourceId`
* `sourceRevisionId`
* `extractionRevisionId`
* `repairOverlaySetId?`
* `parentUnitId?`
* `orderKey`
* `readingOrderIndex`
* `kind`
* `role`
* `stableFingerprint`
* `displayTextHash`
* `speechTextHash?`
* `locatorEnvelope`
* `textQuote`
* `readiness: readable | narratable | alignable`
* `state: pending | extracting | readable | narratable | synthQueued | audioReady | syncReady | failed | stale | superseded`
* `confidence`
* `warnings`
* `errors`

Revision/remap sidecar:

* `revisionMapId`
* `fromSourceRevisionId`
* `toSourceRevisionId`
* `fromExtractionRevisionId`
* `toExtractionRevisionId`
* `fromRepairOverlaySetId?`
* `toRepairOverlaySetId?`
* per-unit mappings:

  * `oldUnitId`
  * `newUnitIds`
  * `mappingKind: unchanged | edited | split | merged | moved | deleted | inserted`
  * `confidence`
  * `locatorFallback`
  * `textQuoteFallback`
  * `preserveProgress: exact | approximate | blockOnly | sourceOnly | impossible`

Stable reading-unit identity wins over emitted order. Use sparse `orderKey`; do not renumber existing units when later extraction inserts content.

## 4. Narration job and manifest identity

A read-along manifest should be the durable source of truth for generation state.

Minimum manifest fields:

* `manifestId`
* `sourceId`
* `sourceRevisionId`
* `extractionRevisionId`
* `repairOverlaySetId?`
* `speechPlanId`
* `speechPlanRevisionId`
* `voiceId`
* `engineId`
* `policyHash`
* `status: extracting | partiallyReadable | partiallyNarratable | partiallyPlayable | complete | failed | interrupted | cancelled | stale | superseded`
* `currentJobIds`
* `supersedesManifestId?`
* `supersededByManifestId?`
* `revisionMapId?`
* `createdAt`
* `updatedAt`

Segment state:

* `segmentId`
* `jobId`
* `unitIds`
* `nodeIds`
* `sourceRevisionId`
* `speechTextHash`
* `status: planned | queued | synthesizing | audioUnchecked | checking | audioChecked | checkFailed | failed | stale | replaced | superseded | cancelled`
* `generatedAudioId?`
* `audioUrl?`
* `durationMs?`
* `highlightMapId?`
* `syncLevel: none | block | phrase | word`
* `syncConfidence`
* `staleReason?`
* `supersededBySegmentId?`

This is where the user’s requirement to distinguish **unchecked audio, checked audio, stale audio, failed audio, and replaced audio** belongs.

## 5. Playback position and active unit/word/phrase/block

Progress should point to source identity first and audio time second.

Minimum durable progress:

* `progressId`
* `projectId?`
* `temporarySourceId?`
* `sourceId`
* `sourceRevisionId`
* `extractionRevisionId`
* `repairOverlaySetId?`
* `manifestId`
* `speechPlanId?`
* `generatedAudioId?`
* `highlightMapId?`
* `unitId`
* `nodeId?`
* `scopeKey?`
* `sourceWordId?`
* `activeWordIndex?`
* `phraseId?`
* `blockId?`
* `locatorEnvelope`
* `textQuote`
* `segmentId?`
* `audioTimeSec?`
* `playbackRate`
* `selectedReadAlongLevel: word | phrase | block | audioOnly | sourceOnly`
* `resolvedReadAlongLevel`
* `degraded: boolean`
* `degradationReason?`
* `stale: boolean`
* `staleReason?`
* `updatedAt`

Resume resolution order:

1. Exact `sourceRevisionId + manifestId + unitId + sourceWordId`.
2. Same source revision, unit and locator.
3. Revision map from old unit to new unit.
4. Text quote/fingerprint within same section/spine item.
5. Block-level location.
6. Audio elapsed time.
7. Source-only reopen with visible “resume location degraded” state.

## 6. UI mode and selected source/read-along surface

The product-critical part must be durable; presentation-only preferences can remain browser-local.

Durable:

* selected `projectId`
* selected `sourceId`
* selected `manifestId`
* selected reading surface: `read | review | cinema | teleprompt`
* selected read-along level preference
* last active unit/block/word
* last known degraded state
* active repair/review state

Browser-local only:

* panel open/closed state
* transient filters
* scroll position where recoverable from source progress
* non-critical layout preferences

The current UI-memory split is conceptually right (`docs/ui-memory.md:1-20`), but the non-negotiable resume fields need to move behind backend/local durable source state, not only `localStorage`.

## 7. Repair overlay state

Repairs must be immutable overlays.

Minimum fields:

* `repairOverlayId`
* `sourceId`
* `baseSourceRevisionId`
* `baseExtractionRevisionId`
* `baseManifestId?`
* `affectedUnitIds`
* `patchType: replaceText | replaceSpeechText | split | merge | reorder | markSkipped | restore | metadataCorrection`
* `displayTextPatch?`
* `speechTextPatch?`
* `reason`
* `createdBy: user | system`
* `createdAt`
* `supersedesRepairOverlayIds`
* `conflictsWithRepairOverlayIds`
* `artifactInvalidation`
* `newRepairOverlaySetId`

Applying a repair creates or targets a new manifest. It must not mutate a running manifest in place.

## 8. Temporary source promotion into durable project state

Promotion must produce a crosswalk, not just a copy.

Minimum promotion state:

* `promotionId`
* `temporarySourceId`
* `fromSourceId`
* `fromManifestId`
* `toProjectId`
* `toSourceId`
* `toSourceRevisionId`
* `toManifestId`
* `sourceIdMap`
* `unitIdMap`
* `segmentIdMap`
* `generatedAudioIdMap`
* `highlightMapIdMap`
* `progressIdMap`
* `bookmarkIdMap`
* `repairOverlayIdMap`
* `keptArtifacts`
* `droppedArtifacts`
* `warnings`
* `createdAt`

After promotion, the temporary source may expire, but promoted project artifacts must not depend on temporary directories, temporary IDs, or temporary progress targets.

## 9. Stale, superseded, and failure states

Use explicit artifact states:

* `current`
* `unchecked`
* `checked`
* `failed`
* `interrupted`
* `stale`
* `superseded`
* `replaced`
* `cancelled`
* `expired`
* `orphaned`

Every stale/superseded state needs a reason:

* `sourceRevisionChanged`
* `extractionRevisionChanged`
* `repairOverlayChanged`
* `speechTextChanged`
* `voiceChanged`
* `engineChanged`
* `policyChanged`
* `audioReplaced`
* `alignmentFailed`
* `checkFailed`
* `unitSuperseded`
* `locatorUnresolved`
* `temporarySourceExpired`
* `backendInterrupted`

# Retry and resume semantics

## Retry from source extraction

Retry extraction by creating a new `extractionRevisionId` under the same `sourceRevisionId`, assuming the raw artifact still exists.

Rules:

* Do not refetch remote HTML if the raw fetched artifact is already persisted.
* Preserve existing readable units until replaced or superseded.
* New extraction emits a revision map against prior units.
* Failed pages/spine items/sections are retryable independently once the adapter supports it.
* If adapter version/config changes, mark prior extraction as superseded, not silently overwritten.
* UI remains source-only or partial-readable during retry.

## Retry from structure / render spoken form

Retry render/spoken-form work by creating a new `speechPlanRevisionId`, not a new source.

Rules:

* If source text and repair overlay set are unchanged, source/extraction remain current.
* Invalidate affected speech segments where `speechTextHash` changes.
* Reuse unaffected segments by `unitId + speechTextHash + voiceId + engineId + policyHash`.
* If policy changes, audio/timing may be stale but source is not stale.
* Render failure should not block visual reading.

## Retry from segment synthesis

Retry at segment level.

Rules:

* A failed segment can retry if its `sourceRevisionId`, `repairOverlaySetId`, `speechTextHash`, `voiceId`, `engineId`, and `policyHash` still match the active manifest.
* Ready contiguous-prefix audio remains playable.
* Unchecked audio may remain playable but must be labeled.
* Replacement audio gets a new `generatedAudioId` or segment artifact revision.
* Old segment audio becomes `replaced` or `superseded`, not deleted silently.

## Retry from alignment / checking

Alignment/checking retry should reuse audio unless the checker proves audio invalid.

Rules:

* If alignment fails but audio is usable, downgrade to block/audio-only; do not re-synthesize automatically.
* If checking fails because synthesized speech materially differs from expected speech text, mark the segment `checkFailed` and require replacement synthesis.
* New alignment creates a new `highlightMapId` or highlight-map revision.
* Word highlight is forbidden until the new highlight map is current and validated.
* Phrase/block fallback remains allowed when supported by source/audio mapping.

## Retry after user cancellation

Cancellation should stop active work but preserve durable artifacts.

Rules:

* Existing readable units remain readable.
* Existing audio prefix remains playable if not otherwise stale.
* Manifest becomes `cancelled` or `interrupted`, not failed.
* Resume should reopen to the same source/progress with generation paused.
* Retry should continue from the earliest missing/stale required segment, not restart whole source.
* Current behavior marks temporary source jobs stale on cancel (`backend/internal/pipeline/service.go:699-745`); for this product, cancellation should make the generation run incomplete, not make the source itself stale.

## Retry after provider failure

Provider failure should be segment-scoped unless the configuration itself is invalid.

Rules:

* Mark affected segment `failed` with retry reason.
* Preserve prior checked/unchecked prefix.
* Allow retry with same provider, alternate provider, or lower-fidelity mode only through explicit manifest state.
* Non-retriable configuration failures block narration but do not block source reading.
* Provider substitution creates new artifact IDs; it must not pretend old audio is current.

## Retry after source repair / supersession

Repair creates a new manifest or supersedes the current one.

Rules:

* Running jobs finish into the old manifest or are explicitly cancelled/superseded.
* Affected units’ audio and highlight maps become stale.
* Unaffected segments can be reused only if source unit identity and `speechTextHash` still match.
* Progress is remapped through revision sidecars.
* If remap confidence is low, resume in block/source-only mode with a visible degraded state.
* Never mutate extracted source truth in place.

# Navigation / reload behavior

## User leaves during extraction

Required behavior:

* Source envelope and raw artifact are already durable.
* Partial extraction manifest remains durable.
* Readable prefix remains visible on return.
* Running extraction continues if backend process is alive.
* If backend restarted, active extraction becomes `interrupted_retriable`.
* UI should show exact phase and recoverable unit-level failures, not a generic spinner.

## User leaves during synthesis

Required behavior:

* Backend job continues independently of the page.
* Every ready segment is persisted and reflected in the manifest.
* On return, UI subscribes by `sourceId + manifestId`, not only `jobId`.
* Existing contiguous-prefix audio is playable.
* In-progress segments after backend restart become `interrupted_retriable`.
* Unchecked/checked/stale states are preserved.

## User leaves during checking / alignment

Required behavior:

* Audio remains playable if it is available.
* UI returns with correct state: unchecked, checking, checked, check failed, or alignment failed.
* Highlight level is recomputed from the current manifest.
* Word sync must not survive reload unless the highlight map identity matches current source/audio/speech plan.

## User closes and reopens browser

Required behavior:

* Browser-local state only tells the app which project/source/surface to reopen.
* Backend/local durable state resolves source, manifest, progress, and artifact validity.
* Resume first attempts exact source/word/segment identity.
* If unresolved, revision map and locator/text quote fallback are used.
* If still unresolved, reopen source-only at the best block/section with visible degradation.

## User switches project/source

Required behavior:

* Current playback session is synced and closed or marked inactive.
* Jobs continue unless the user explicitly cancels.
* New project/source hydration uses backend manifest/progress.
* UI cache invalidates by `sourceId + sourceRevisionId + manifestId`.
* Project/source switching must not reuse a stale highlight map keyed only by job ID.

## User promotes Quick Listen / temporary source

Required behavior:

* Promotion creates a durable project source and promotion crosswalk.
* Source extraction, repair overlays, generated audio, timing maps, bookmarks, and progress are copied/remapped according to keep flags.
* New project progress is created from old temporary progress.
* Old temporary source becomes a redirectable/promoted origin until expiry.
* Expiry/discard must not delete promoted project artifacts.
* Partial audio stays visibly partial/unchecked if that was its state before promotion.

# Conflict and staleness rules

## Stale source

A source is stale when:

* raw source revision changed;
* extraction revision was superseded;
* adapter version/config changed in a way that invalidates emitted units;
* repair overlay set changed;
* prepared source provenance no longer maps to current source;
* temporary source expired before promotion.

UI: source remains visible if possible, but generation/read-along state is degraded or blocked until remapped.

## Stale audio

Audio is stale when:

* source revision changed for any unit in the segment;
* repair overlay changed display or speech text for that unit;
* `speechTextHash` changed;
* voice, engine, or policy hash changed;
* segment was replaced;
* checker failed and requires re-synthesis;
* segment belongs to a superseded manifest.

UI: audio may be playable only if safe, but it cannot be presented as current read-along audio. Show stale/replaced state.

## Stale highlight map

A highlight map is stale when:

* `highlightMap.sourceRevisionId` does not match active source revision;
* `speechPlanId` or `generatedAudioId` differs;
* source-word IDs no longer map to rendered tokens;
* repair overlay changed affected units;
* timing confidence was downgraded;
* check/alignment failed;
* segment audio was replaced.

UI: downgrade to phrase, block, audio-only, or source-only. Never keep exact word highlight across this mismatch.

## Stale repair overlay

A repair overlay is stale or conflicting when:

* its base extraction revision is not an ancestor of the active manifest;
* affected units were deleted, split, merged, or superseded;
* a newer overlay touches the same unit/text range;
* the overlay was applied to a temporary source that has since been promoted without a crosswalk.

UI: show repair conflict and prevent silent application to the active manifest.

## Stale playback position

Playback position is stale when:

* saved `sourceRevisionId` or `manifestId` is not current;
* unit was superseded and remap confidence is low;
* active word/source word ID no longer exists;
* segment ID/audio artifact was replaced;
* highlight map is stale;
* temporary source expired and no promotion crosswalk exists;
* audio time exceeds the current segment duration.

UI: resolve through revision map first. If uncertain, resume at block/source-only level and show why precision was degraded.

# API / data model implications

## Backend changes

Add durable source/read-along state models:

* `SourceEnvelope`
* `SourceRevision`
* `ExtractionRevision`
* `ReadingUnitManifest`
* `ReadalongManifest`
* `RevisionMap`
* `RepairOverlay`
* `ArtifactCompatibility`
* `PromotionCrosswalk`
* revision-aware `PlaybackProgress`

Add manifest-centric endpoints:

* get source state by `sourceId`;
* get current/readalong manifest by `sourceId + manifestId`;
* update progress by `sourceId + manifestId`, not ambiguous target ID alone;
* retry extraction, speech plan, segment synthesis, alignment/checking;
* cancel/supersede manifest;
* promote temporary source and return crosswalk;
* resolve resume position through revision map.

Change eventing from job snapshots to source/manifest events. The current SSE endpoint sends the whole job every `1500ms` (`backend/internal/httpapi/voice_job_routes.go:142-175`). For durable resume and ASAP UI, events should be sequenced by source/manifest:

* `source.revision.created`
* `extraction.unit.readable`
* `extraction.unit.failed`
* `manifest.segment.audio_unchecked`
* `manifest.segment.audio_checked`
* `manifest.segment.check_failed`
* `manifest.sync.ready`
* `manifest.artifact.stale`
* `manifest.superseded`
* `progress.resolved`
* `promotion.completed`

On backend startup, normalize persisted active jobs:

* `queued`, `synthesizing`, `checking`, or `aligning` without a live worker become `interrupted_retriable`;
* ready segment audio is preserved;
* manifests remain resumable;
* UI does not show phantom active work.

## Frontend changes

Add a source/read-along state store keyed by:

* `sourceId`
* `sourceRevisionId`
* `manifestId`

The frontend should treat backend/local runtime state as authoritative for:

* progress;
* artifact validity;
* selected source/read-along surface;
* sync level;
* stale/superseded status;
* promotion crosswalk.

Browser local storage should retain only a pointer to reopen:

* last project;
* last source;
* last surface;
* non-critical layout preferences.

The read-along renderer should consume a manifest-derived sync decision:

* exact word;
* phrase;
* block;
* audio-only;
* source-only.

It should not infer read-along fidelity from whether a timing file happens to exist.

# Risks / anti-goals for state/retry work

Keep these out of the first `<=20` active issue batch:

* Cloud sync, accounts, multi-device conflict resolution, or collaboration.
* CRDT-style source editing.
* Full repair editor/workbench.
* Full PDF/OCR/DOCX parity.
* Non-contiguous playback.
* Automatic background provider substitution without explicit artifact identity.
* New TTS providers or voice-cloning work.
* Browser extension.
* Large import/export bundle polish beyond local evidence needed for resume.
* Full Readium/EPUB CFI implementation beyond local locator compatibility.
* Perfect bookmark/note system.
* AI summaries, chat, quizzes, notes, study mode.
* Visual artifact debugger dashboards.
* Command Palette expansion.
* Making `localStorage` the durable product state.
* A full distributed workflow engine.

The first state/retry batch should be narrow: source/manifest/revision identity, revision-aware progress, artifact states, segment-level retry, startup interruption recovery, repair supersession semantics, and temporary-to-project promotion crosswalk.

# Pressure-test questions

1. Should interrupted synthesis/checking after backend restart **auto-resume** or become `interrupted_retriable` requiring user action? I recommend `interrupted_retriable` for the first batch; silent auto-resume can surprise users and complicates provider failure recovery.

2. During Quick Listen promotion, should progress/bookmarks/generated artifacts default to **kept** when they exist, or require explicit opt-in? I recommend default keep for durable-project promotion, with clear storage warnings.

3. When a repair changes text before the user’s saved position, should resume automatically remap to the repaired version, or should the UI offer “resume in old version / resume in repaired version”? I recommend automatic remap when confidence is high, explicit choice when remap confidence is low.

# Agreement candidate

Carry this into the responsiveness architecture discussion: move from job-centric resume to **source/manifest/revision-centric durable state**. Backend/local storage is authoritative. Progress points to source revision, extraction revision, manifest, repair overlay set, reading unit, locator, source word/phrase/block, segment, audio artifact, and highlight map. Retry is artifact- and segment-scoped. Repairs and promotion fork/supersede through explicit crosswalks. Reload and navigation recover into current, degraded, interrupted, stale, failed, or superseded states without pretending precision survived.

`AGREED RESUME/RETRY STATE MODEL`
