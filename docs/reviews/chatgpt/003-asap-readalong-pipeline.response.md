# ASAP read-along verdict

The current pipeline direction can support **early partial audio for a completed text job**, but it does **not yet support early safe read-along from any supported source**.

There are useful primitives worth keeping: job phases already include extract/structure/render/segment/synthesize/align/check/assemble (`backend/internal/pipeline/models.go:28-40`), jobs track ready segment counts, first playable time, partial URLs, and partial manifests (`backend/internal/pipeline/models_runtime.go:76-93`, `411-473`), and the backend commits contiguous ready audio segments while refreshing partial timing artifacts (`backend/internal/pipeline/service.go:2285-2438`, `2549-2615`). Highlight-map v2 also has the right vocabulary for timing levels, confidence, fallback, degraded state, source locators, node IDs, and source word IDs (`backend/internal/highlightmap/build_v2.go:14-89`, `144-196`).

The blocker is that these are still **job/audio primitives**, not **source/read-along lifecycle primitives**.

## Top blockers

**1. The source still has to become whole text before the read-along pipeline starts.**
`CreateJob` requires full `Text` (`backend/internal/pipeline/service_create_job.go:11-38`). Book import runs extraction synchronously and only writes metadata/Content IR after the adapter returns (`backend/internal/pipeline/book_sources.go:82-153`). Book narration requires the book source to already be ready and resolves full narration text before creating a job (`backend/internal/pipeline/book_sources.go:436-496`). Temporary sources fetch/read/preprocess the full source before they become prepared sources (`backend/internal/pipeline/temporary_sources.go:76-220`). This prevents EPUB/HTML sections from becoming playable while later sections are still extracting.

**2. Whole-input optimization/rendering still blocks segmentation.**
`runJob` starts from `job.InputText`, then preprocesses/renders spoken form over the whole input before segmenting (`backend/internal/pipeline/service.go:1245-1340`). `synthesizeUntilComplete` then splits the full optimized text into job segments up front (`backend/internal/pipeline/service.go:1765-1828`). That is the wrong boundary for ASAP read-along. Segmentation should start from the first narratable source units, not from a finished full-document string.

**3. Partial manifests are not source-aware.**
Current `PartialAudioManifest` has status, ready segment count, total segments, first playable time, and segment audio URLs (`backend/internal/pipeline/models_runtime.go:76-93`). It does not carry `sourceRevisionId`, source unit IDs, Content IR node IDs, locators, quality tier, speech-plan segment identity, stale state, supersession, or repair metadata. The UI can know “segment 0 is ready,” but not “chapter 1 paragraph 3 from source revision R is readable, narratable, phrase-syncable, and safe to resume.”

**4. The sync spine is not canonical end-to-end.**
The desired direction is already documented as `audioTime -> sourceWordId -> rendered token`, but the handoff doc says current surfaces still use cue-local, batch-local, or segment-local ordinals and lack a shared `NarrationSyncProvider` (`docs/handoff/whole-app-followalong-sync-spine.md:9-35`, `139-147`). The backend highlight schema is closer to the right model than the frontend runtime.

**5. Partial word sync is not generally safe yet.**
Forced alignment is effectively final-artifact oriented; partial jobs without final audio fall back to provider timing or heuristic timing (`backend/internal/alignment/alignment_service.go:106-112`). Word timing is considered reliable only with sufficient token confidence and trusted timing sources such as native/provider or forced alignment (`backend/internal/alignment/alignment_quality.go:127-149`). That is acceptable only if the UI defaults to phrase/block/source progress until word evidence exists.

# Pipeline lifecycle

The pipeline should become **source-first, manifest-driven, and incrementally commit durable units**. The job pipeline should consume narratable units; it should not own source truth.

| Phase                                       | Durable output                                                                                                               | UI permission                                                              | Key rule                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **1. Source intake**                        | `SourceEnvelope` with `sourceId`, owner, source type, raw artifact hash, source revision, adapter target, initial state.     | Show source card, import status, skeleton reader.                          | Persist raw/pasted/fetched bytes before extraction so local-first reproducibility is preserved.                  |
| **2. Extraction**                           | Adapter emits source events: section/spine/page discovered, unit readable, unit failed, warnings, adapter quality.           | Show partial structure and extraction status.                              | EPUB/structured HTML proof path should stream spine/section units; later spine items must not block early units. |
| **3. Structure normalization / Content IR** | Content IR fragments or source-unit sidecars; final `content-ir.v1` after close.                                             | Render stable prefix in reader.                                            | `content-ir.v1` remains finalized/exportable; partial state lives in manifests/sidecars.                         |
| **4. Readable unit readiness**              | Unit has stable ID/fingerprint, sparse `orderKey`, display text, normalized text, locator, provenance, confidence, warnings. | User can read/select unit.                                                 | Readable does not mean narratable. Low-confidence OCR/table units may be visible but not speakable.              |
| **5. Narratable unit readiness**            | Unit has speech text, language, speech policy decision, speak/skip mode, and sufficient confidence.                          | Unit may enter queue for synthesis.                                        | Speech plan is incremental and source-scoped. Skipped units remain visible in source; they do not disappear.     |
| **6. Synthesis segment readiness**          | Speech segment has `segmentId`, source unit IDs, text hash, speech-plan revision, status, audio artifact pointer when ready. | First contiguous ready segment can become playable.                        | Prefer contiguous-prefix playback first. Do not require whole-source segment count to be final.                  |
| **7. Alignment / sync readiness**           | Highlight/sync artifact declares `word`, `phrase`, `block`, `audio-only`, or unavailable with confidence and fallback.       | Reader chooses exact word, phrase, block, audio-only, or source-only mode. | Sync level is earned per unit/segment. Feature flags must not override evidence.                                 |
| **8. Playback / progress resume**           | Progress stores source revision, unit/node/source word locator, segment ID, audio time fallback, repair/stale state.         | User can leave/reopen and resume.                                          | Elapsed audio time is fallback, not primary resume state.                                                        |
| **9. Finalization**                         | Final Content IR, final speech plan, final audio, final highlight map, complete manifest, validation report.                 | UI removes “partial” state where safe.                                     | Finalization must not silently rewrite active progress.                                                          |
| **10. Stale / superseded artifacts**        | Revision map, repair overlay, tombstones, stale segment/highlight flags.                                                     | UI shows stale/repaired state and safe recovery options.                   | Immutable extraction plus repair overlay; never mutate extracted source truth in place.                          |

For the EPUB/structured HTML proof path, the first target should be:

`raw source persisted → first spine item parsed → first section units readable → first units narratable → first speech segment synthesized → phrase/block sync available → final word sync only if timing evidence validates`.

# Partial manifest contract

Add a source/read-along manifest separate from the current audio-only partial manifest. The current `PartialAudioManifest` can remain as a compatibility view, but the reader needs a richer `readalong-manifest.v1` or equivalent.

## Manifest-level fields

| Field group       | Required fields                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity          | `manifestId`, `schemaVersion`, `sourceId`, `sourceRevisionId`, `sourceOwner`, `projectId?`, `temporarySourceId?`, `sourceType`, `contentHash`, `adapterId`, `adapterVersion`. |
| Revision          | `baseRevisionId?`, `revisionReason`, `repairOverlayIds`, `supersedesManifestIds`, `sequence`, `generatedAt`, `updatedAt`.                                                     |
| Status            | `intaking`, `extracting`, `partially_readable`, `partially_narratable`, `partially_playable`, `finalizing`, `complete`, `failed`, `stale`, `superseded`.                      |
| Capabilities      | `qualityTier`, `allowedHighlightLevels`, `preferredHighlightLevel`, `degradationReason`, `canResumeExact`, `canPromoteToProject`.                                             |
| Artifact pointers | `contentIrFragmentUrl`, `contentIrFinalUrl?`, `speechPlanUrl?`, `partialAudioUrl?`, `finalAudioUrl?`, `highlightMapUrl?`, `revisionMapUrl?`, `qualityReportUrl?`.             |
| Recovery          | `recoverableErrors`, `retryActions`, `repairActions`, `resumeHints`, `tombstoneUrl?`.                                                                                         |

## Unit-level fields

Each source unit needs:

* `unitId`
* `nodeId`
* `parentId`
* `orderKey`
* `readingOrderIndex`
* `kind`
* `role`
* `title?`
* `displayTextHash`
* `speechTextHash?`
* `stableFingerprint`
* `locatorEnvelope`
* `textQuote`
* `readiness: { readable, narratable, alignable }`
* `state: pending | extracting | readable | narratable | synthQueued | audioReady | syncReady | failed | stale | superseded`
* `confidence: { extraction, structure, locator, speech, timing }`
* `warnings`
* `errors`
* `repairOverlayIds`
* `supersedesUnitIds`
* `supersededByUnitIds`
* `staleReason?`

## Speech segment fields

Each segment should be source-linked, not merely job-indexed:

* `speechPlanId`
* `speechPlanRevisionId`
* `segmentId`
* `segmentIndex`
* `orderKey`
* `unitIds`
* `nodeIds`
* `sourceRevisionId`
* `speechTextHash`
* `voiceId`
* `engineId`
* `policyHash`
* `status: planned | queued | synthesizing | audioReady | checking | checked | failed | stale | superseded`
* `retryable`
* `generationJobId`
* `createdAt`
* `updatedAt`

## Audio fields

* `generatedAudioId`
* `partialAudioUrl`
* `finalAudioUrl?`
* `firstPlayableAt`
* `firstPlayableSegmentId`
* `readySegmentCount`
* `totalKnownSegments`
* `isContiguousPrefixReady`
* Per segment:

  * `segmentId`
  * `audioUrl`
  * `durationMs`
  * `byteRange?`
  * `checksum`
  * `provider`
  * `latencyMs`
  * `audioStatus`
  * `stale`
  * `supersededBySegmentId?`

## Sync fields

* `highlightMapId`
* `highlightMapVersion`
* `sourceRevisionId`
* `speechPlanId`
* `generatedAudioId`
* `primaryLevel: word | phrase | sentence | block | none`
* `allowedLevels`
* `fallbackMode`
* `timingSource`
* `timingConfidence`
* `driftBudgetMs`
* `degraded`
* `degradationReason`
* `sourceWordCoverage`
* Per segment/unit:

  * `segmentId`
  * `unitIds`
  * `syncStatus: unavailable | estimating | phraseReady | blockReady | wordReady | stale`
  * `confidence`
  * `staleReason?`

## Resume / recovery metadata

* `lastKnownProgress`
* `sourceRevisionId`
* `unitId`
* `nodeId`
* `sourceWordId?`
* `activeWordIndex?`
* `locatorEnvelope`
* `textQuote`
* `segmentId`
* `audioTimeSec`
* `fallbackOrder`
* `revisionMapUrl`
* `repairOverlayIds`
* `artifactCompatibility`

The manifest must be **append/revision-aware**. A later correction can supersede a unit or segment, but it must not silently mutate the meaning of an existing `unitId + segmentId + sourceRevisionId` tuple.

# Read-along sync degradation

The UI should choose the highest level that is safe for the current unit/segment, not the highest level the product wants to demonstrate.

| UI mode                   | Show when                                                                                                                                                                                                                                                                   | Forbid when                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exact word highlight**  | Unit is readable, narratable, and alignable; source revision, speech plan, audio, and highlight map are current; rendered tokens have stable `sourceWordId`; timing source is trusted; confidence is high; drift is within benchmark budget; no stale/superseded artifacts. | Timing is heuristic, OCR/source confidence is low, source words cannot be mapped to rendered tokens, artifact is stale, or highlight map is only phrase/block quality. |
| **Phrase highlight**      | Audio and source unit are mapped, phrase/sentence fragments are reliable, word timing is absent or not reliable, fallback mode is explicit.                                                                                                                                 | Phrase boundaries are estimated from raw duration only with low confidence, or source revision changed since audio generation.                                         |
| **Block highlight**       | Unit-level mapping is reliable but phrase/word timing is not; extraction is block-only; PDF/OCR/table/doc structure is uncertain; timing is degraded but audio segment maps to a source block.                                                                              | Active block cannot be mapped to current source revision.                                                                                                              |
| **Audio-only progress**   | Audio is playable but source mapping/highlight map is missing, stale, superseded, or incompatible.                                                                                                                                                                          | The UI still displays moving word/phrase highlights.                                                                                                                   |
| **Source-only read mode** | Source units are readable but no narratable/audio segment exists yet, generation is queued, extraction is partial, or narration is blocked by confidence/repair.                                                                                                            | The UI implies audio progress or sync that does not exist.                                                                                                             |

Concrete gating:

* Word highlight should require something close to the existing benchmark bar: median/p95 word drift `<=150ms`, wrong node/word/stale highlight counts `0`, and no scroll jumps (`benches/thresholds.json` read-along thresholds).
* Phrase highlight can tolerate less precision but should stay within the existing `<=350ms` phrase drift target.
* Block highlight is the correct fallback for low-confidence extraction, heuristic timing, OCR uncertainty, tables, and stale word maps.
* Audio-only progress is the correct fallback for generated audio whose source revision has changed.
* Source-only mode is not failure; it is the correct ASAP state before audio exists.

# Performance / responsiveness budgets

Use the existing performance budgets as hard UI gates, then add source-pipeline budgets on top. Current documented reader budgets include app cold usable `<=2200ms`, source switch `<=1200ms`, studio route switch `<=600ms`, Book Cinema open `<=450ms`, transport interaction latency `<=850ms`, settings open `<=850ms`, and reader resume `<=500ms` (`docs/performance.md:64-88`). Those remain valid.

Recommended v0/v1 pipeline budgets:

| Event                                                             |                                                                                                   Budget |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------: |
| Source envelope created after paste/file/URL submit               |                                                                                 `<=250ms` local overhead |
| Reader skeleton/source status visible                             |                                                                                                `<=250ms` |
| First readable pasted/Markdown text                               |                                                                       `<=500ms p95` for v0 fixture sizes |
| First readable clean HTML after fetch bytes are local             |                                                                                           `<=1500ms p95` |
| First readable EPUB/structured HTML section after bytes are local |                                                                                           `<=2000ms p95` |
| First narratable unit after first readable unit                   |                                      `<=300ms` paste/Markdown/clean HTML; `<=750ms` EPUB/structured HTML |
| First synthesis segment planned/enqueued after narratable unit    |                                                                                               `<=1000ms` |
| First playable audio, local overhead after provider returns bytes |                                                                                                `<=500ms` |
| First playable audio from generation start on proof fixtures      |                             target `<=3000ms p95`, excluding external provider latency where unavoidable |
| Phrase/block sync after segment audio ready                       |                                                                                                `<=500ms` |
| Exact word sync                                                   | no ASAP budget unless provider/native timing is already trusted; otherwise final/validated artifact only |
| SSE/event propagation after backend state change                  |                                                                                            `<=500ms p95` |
| Current 1500ms whole-job SSE tick                                 |                                                           too slow for ASAP; acceptable only as fallback |
| Route navigation while job active                                 |                                                     no more than `20%` worse than existing route budgets |
| Transport visual acknowledgement                                  |                                                                                                `<=100ms` |
| Play/pause/seek command to media element                          |                                   `<=250ms p95`; existing `<=850ms` transport budget remains outer bound |
| Highlight/render tick during playback                             |                                                       target frame-safe; avoid main-thread tasks `>50ms` |

A critical product decision sits behind these numbers: if ASR/checking must complete before a segment is playable, first playable audio inherits checker latency. If unchecked draft playback is allowed with an explicit “unchecked” state, ASAP latency improves substantially but the UI must expose later failure, replacement, or stale state.

# Backend / frontend boundary

## Backend owns durable truth

The backend/local artifact store should own:

* source envelope;
* source revisions;
* partial extraction manifests;
* Content IR fragments and finalized Content IR;
* speech plans;
* audio segment artifacts;
* highlight/sync maps;
* revision/remap sidecars;
* repair overlays;
* progress/session state;
* stale/superseded artifact state.

The frontend cache is disposable. It can render optimistically, but it must not be the source of truth for progress, repair, or artifact compatibility.

## Events and polling

The current EventSource transport is a reasonable starting point, but the event model is too coarse. `/api/voice-jobs/:id/events` currently sends the whole job every 1500ms and falls back to polling (`backend/internal/httpapi/voice_job_routes.go:142-175`; `frontend/src/api.ts:1645-1707`). Keep SSE, but change the unit of communication.

Use source/read-along events:

* `source.intake.accepted`
* `source.unit.readable`
* `source.unit.narratable`
* `source.unit.failed`
* `speech.segment.planned`
* `speech.segment.synthesis_started`
* `speech.segment.audio_ready`
* `sync.segment.ready`
* `artifact.stale`
* `repair.overlay_applied`
* `manifest.finalized`
* `source.superseded`

Each event should include:

* `sourceId`
* `sourceRevisionId`
* `manifestId`
* `sequence`
* `unitIds?`
* `segmentIds?`
* `artifactIds?`
* `stale/superseded flags`
* `manifestUrl` or patch payload.

Polling fallback should fetch the manifest snapshot by `sourceId + sourceRevisionId + sequence/ETag`, not repeatedly pull unrelated job state.

## Client cache

Frontend cache keys should reflect artifact identity:

* source envelope: `sourceId`
* unit manifest: `sourceId + sourceRevisionId`
* speech plan: `speechPlanId + sourceRevisionId + policyHash`
* audio: `generatedAudioId + speechPlanRevisionId + voiceId + engineId`
* highlight map: `generatedAudioId + speechPlanId + sourceRevisionId + highlightMapVersion`
* progress: `sourceId + sourceRevisionId + sessionId`

Events should be treated as invalidation or patch hints. After important transitions, the reader should fetch the authoritative manifest.

## Storage and invalidation

Invalidation must be unit/segment scoped where possible:

| Change                                     | Invalidate                                                     |
| ------------------------------------------ | -------------------------------------------------------------- |
| Source revision changed                    | affected unit mappings, progress remap needed                  |
| Repair overlay changed display/speech text | affected speech segments and highlight maps                    |
| Voice/engine changed                       | affected audio and timing                                      |
| Speech policy changed                      | affected speech plan/audio/timing                              |
| Locator changed only                       | resume/highlight map may need remap; audio may remain reusable |
| Timing confidence downgraded               | UI highlight mode only; audio remains playable                 |
| Unit split/merge/reorder                   | revision map, affected segments, progress remap                |

The reader should consume an explicit `allowedHighlightLevel` from the manifest or sync provider. It should not infer word/phrase/block mode from feature availability alone.

# Risks / anti-goals for pipeline work

Keep these out of the first `<=20` active issue batch:

* Full distributed queue/event-bus rewrite.
* WebSocket infrastructure unless SSE proves insufficient.
* Full PDF/OCR/DOCX parity.
* Per-word forced alignment for partial segments unless provider-native timing is already trusted.
* Non-contiguous playlist playback where segment 8 can play before segment 2. Start with contiguous-prefix playback.
* Complex repair editor/workbench.
* Full EPUB CFI/Readium implementation beyond local locator/resume needs.
* Browser extension.
* Cloud sync, accounts, collaboration, sharing.
* New TTS provider integrations.
* Voice cloning or voice quality work.
* AI summaries, chat, notes, quizzes, study mode.
* Import wizard redesign.
* Command Palette expansion.
* Visual diagnostics dashboards.
* Full waveform editor.
* Audio export/library management.
* “All formats best-in-class” claims before evidence gates exist.

The first pipeline batch should prove: source envelope, partial manifest, EPUB/structured HTML streaming units, incremental speech plan, earliest contiguous segment synthesis, partial audio manifest with source identity, sync degradation, and durable progress hooks.

# Pressure-test questions

1. Is first playable audio allowed before ASR/checking completes if the UI labels it as unchecked and can later replace, stale, or fail that segment? If not, “ASAP” must mean “as soon as checked audio exists,” which materially raises latency.

2. Is contiguous-prefix playback acceptable for the first implementation, even if later segments finish first? I recommend yes. Non-contiguous playback creates harder progress, buffering, and resume semantics before the source lifecycle is proven.

3. When a repair overlay is applied during active synthesis, should it fork/supersede the active manifest rather than mutate the running one? I recommend fork/supersede. Live mutation is simpler but undermines artifact identity and durable resume.

4. For remote HTML, should the platform require raw fetched content to be fully persisted locally before extraction begins? I recommend yes for local-first reproducibility, even if streaming directly from the network would shave some latency.

# Agreement candidate

Carry this into the resume/retry/state-model discussion: the ASAP pipeline should be **source-first and manifest-driven**. Source units become readable, narratable, and alignable independently. The earliest contiguous narratable segment may synthesize and become playable before the full source is complete. Partial manifests must bind source revision, unit IDs, speech segments, audio artifacts, sync level, confidence, stale state, and recovery metadata. The UI starts in source-only/readable mode and upgrades to block, phrase, or word sync only as evidence permits.

`AGREED ASAP READ-ALONG PIPELINE`
