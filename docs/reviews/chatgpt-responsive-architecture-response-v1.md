TTS_RESPONSIVE_ARCHITECTURE_REQUEST_CHANGES

The product invariants and the brief’s central diagnosis are supported by the archive. The current v10 architecture packet and 20-issue batch are not approvable, however. They still lack a canonical lifecycle owner, a replayable event contract, a single playback controller, an explicit source-revision binding, and an atomic issue graph capped at 15 issues.

This verdict requests changes to the candidate architecture and implementation packet, not to the owner-directed product invariants.

Evidence and verification status

The supplied archive SHA-256 is exactly:

fef0fa919baf138a194c59d88e79400595b3040ea6b5c8f26afe20a44d1b3b8f

Verified archive properties:

ZIP integrity and path-safety checks pass.

Every path is under tts-research-responsive-v1/.

The archive contains 1,321 files: 1,318 repository files named in _review/file-list.txt, plus the three _review/ provenance files.

_review/git-status.txt records 12 tracked modified paths.

_review/git-diff.patch has 12 matching tracked-file diff sections.

There is no .git directory, so commit ancestry and reverse-application against an original checkout cannot be independently verified from this archive. File inventory, ZIP integrity, and status/diff parity can be and were verified.

Executable evidence:

scripts/validate-linear-batch.test.mjs: 19/19 tests pass.

scripts/validate-linear-batch.mjs: passes, validating the current 20-issue packet’s schema, DAG, thresholds, reconciliation, and Markdown parity.

scripts/start-port-env.test.mjs: 3/3 tests pass.

The flow-registry validator could not run because the archive has no installed TypeScript dependency.

Frontend tests/build could not run because dependencies are not installed.

The focused Go test could not compile in this environment because the installed Go version is 1.23.2 while backend/go.mod requires Go 1.26.3.

The passing Linear validator proves that the existing 20-issue packet is internally consistent. It does not prove that its lifecycle model or issue seams meet the responsive Cinema requirements.

1. Root-cause verdict
1.1 Primary root cause: independent capabilities are collapsed into one terminal audio lifecycle

This finding is confirmed.

frontend/src/features/playback/generatedAudioLifecycle.ts defines one generated-audio lifecycle without a partial-playability state:

GENERATED_AUDIO_LIFECYCLE_STATES, lines 7–16.

generatedAudioLifecycleFromJob, lines 125–158.

A job becomes ready only when job.status === "completed", lines 154–155.

isGeneratedAudioPlayable, lines 196–198, recognizes only state === "ready".

The same file already contains separate evidence that partial audio is useful:

generatedAudioReadySegmentCount, lines 200–209.

generatedAudioTotalSegmentCount, lines 211–221.

isGeneratedAudioPartiallyPlayable, lines 249–258.

canQueueGeneratedAudioPlayback, beginning at line 260.

Those partial-capability functions are then neutralized by top-level terminal gates in frontend/src/App.tsx:

generatedAudioLifecycle, lines 4029–4032.

playbackLifecycleReady = playbackControls.isAvailable && generatedAudioLifecycle === "ready", lines 4033–4034.

canOpenCurrentCinema = generatedAudioLifecycle === "ready" && temporaryCinemaActionsEnabled, line 4039.

Book Cinema play, restart, and skip callbacks return unless playbackLifecycleReady, lines 7530–7555.

The workbench rail passes terminal readiness as audioReady and runs audio creation rather than opening Cinema when false, lines 10544–10563.

NarrationStatusStrip receives the same gate, lines 10938–10961.

This scalar lifecycle is being asked to answer four different questions:

Is the source readable?

Is narration work still running?

Is any compatible audio currently playable?

How trustworthy is timing alignment?

Those are independent capabilities. The disabled Cinema and delayed transport are consequences of that conflation.

Architectural correction to the brief

“Partially playable” should not become another top-level narration-run phase. That would preserve the same category error with an additional enum member.

The narration run phase should describe execution:

accepted → queued → optimizing → synthesizing → checking → completed, with cancellation, failure, and interruption branches.

Partial playability should be derived from the media manifest:

playableContiguousPrefixDurationMs > 0.

Sync fidelity should be derived independently from timing/mapping evidence.

1.2 Cinema already supports pre-audio reading internally

This finding is confirmed and makes the top-level gate more clearly incorrect.

frontend/src/features/cinema/model.ts already defines:

preAudio, generating, playable, playing, paused, completed, and degraded, lines 23–31.

deriveCinemaPlaybackState, lines 133–165, which distinguishes pre-audio and generating states from playable states.

deriveCinemaReadinessDisplay, lines 219–267, including:

“Generated audio is being created while the reader remains available.”

“The source is readable. Create audio when you want synchronized playback.”

Degraded audio while the reader remains ready.

frontend/src/App.tsx also contains an audio-independent opening primitive:

openPreparedSourceCinema, lines 3831–3844.

frontend/src/features/cinema/PreparedSourceCinemaTransport.tsx derives source start eligibility from source.status === "ready" at line 86 and has separate playback-state handling at lines 87–99.

Therefore, the missing capability is not fundamentally a Cinema-renderer feature. The primary defect is ingress and state ownership above Cinema.

1.3 Progressive backend/media primitives already exist and should be retained

This finding is confirmed.

backend/internal/pipeline/models_runtime.go already models:

PartialAudioSegmentManifest, lines 139–156.

PartialAudioManifest, lines 158–170.

Per-segment artifact identity, replacement, compatibility, readiness, duration, and timing fields.

SyncFidelity and SyncFidelityDecision, lines 475–509.

VoiceJob fields including partial audio, ready-segment count, and FirstPlayableAt, beginning around line 526.

backend/internal/pipeline/service.go publishes per-segment state in both reused and newly synthesized paths:

Reused-segment publication around lines 2258–2303.

Newly synthesized segment publication around lines 2438–2502.

ensureFirstPlayableAt, lines 2625–2634.

Partial-manifest normalization, including partialReady, lines 2687–2691.

backend/internal/pipeline/service_test.go::TestCreateJobPublishesPartialAudioWhileSynthesizing, lines 3132–3223, proves that while the run is still active:

At least one segment is ready.

FirstPlayableAt is populated.

The manifest status is partialReady.

A segment URL is exposed.

The provisional artifact is unchecked and replaceable.

Partial WAV data is retrievable.

The eventual terminal artifact becomes checked.

This machinery should be extracted behind a clearer contract, not rewritten.

1.4 A separate first-playable latency problem exists in segmentation

This is an additional root cause not fully represented by the candidate issue list.

The observed fixture produced one 42-word, approximately 16.2-second segment and did not become playable until terminal completion. That behavior is consistent with the current segment policy:

Default maximum segment size is 300 runes; studio defaults are 220 and 180 runes in backend/internal/pipeline/service.go, lines 200–206.

synthesizeUntilComplete calls splitTextSegments, lines 1829–1855.

splitTextSegments, lines 3288–3328, combines complete sentence pieces until maxRunes is exceeded.

A sentence piece longer than the maximum is not subdivided by this function.

The progressive publication primitive works in its focused test because the test deliberately sets SegmentMaxRunes: 10. Production defaults can collapse a meaningful passage into one long synthesis unit.

This does not cause Cinema to be disabled—the terminal frontend gate does that—but it can eliminate the user-visible advantage of progressive playback even after the frontend is corrected. It requires its own bounded-segment/first-playable issue.

1.5 Multiple playback owners create a controller replacement hazard

This finding is confirmed.

frontend/src/App.tsx contains:

PlaybackControllerHost, beginning at line 18679.

StreamingAudioPanel, beginning at line 18711.

CompletedAudioPlayer, beginning at line 19760.

ArrivalAudioPlayer, beginning at line 20187.

ArrivalAudioPlayerQueue, beginning at line 20211.

StreamingAudioPanel has separate arrival and completed modes and mounts different keyed players:

CompletedAudioPlayer key={completed-${job.id}}, lines 18847–18856.

ArrivalAudioPlayer key={arrival-${job.id}}, lines 18858–18866.

The arrival implementation is useful. It:

Builds and schedules a growing segment timeline without rescheduling already-active sources, lines 20402–20507.

Exposes one transport control interface, lines 20736–20768.

Queues at the current buffered boundary and continues as data arrives.

The defect is the wrapper that treats terminal audio as a separate player and can replace the active controller. Final assembled audio should be an optimization or alternate artifact of the same playback session, not a new playback owner.

1.6 Regular narration is incorrectly routed through Preview/Audition semantics

This finding is confirmed.

frontend/src/features/preview/GlobalPreviewPlayer.tsx:

Builds a queue from regular job data, lines 136–141.

Detects partial availability but still requires playbackLifecycle === "ready", lines 173–177.

Uses provider capability action "audition", lines 171 and 178–181.

Labels transport actions “Audition” and “Pause preview audition”, lines 192–195.

Renders “Global preview mini-player” and “Preview Player”, lines 228 and 244.

frontend/src/features/playback/playbackSurfaceRules.ts deliberately exposes the global preview player on regular Review/Preview surfaces.

The flow registry’s PREVIEW-001 describes voice preview creation, audition, comparison, and user decision. That is the correct domain boundary. Regular narration must not use this surface or its state.

1.7 The source-list endpoint is not a true list-summary contract

The brief’s payload conclusion is confirmed with one correction.

backend/internal/pipeline/source_preps.go::ListProjectPreparedSources, lines 289–310, returns []PreparedSource.

backend/internal/pipeline/source_preps_text_helpers.go::summarizePreparedSourcePayload, lines 361–368:

Clears top-level Text and SpeechText.

Retains every source’s complete Blocks array.

Truncates each block’s Text and SpokenText to 220 characters.

Therefore, it is not literally returning every complete top-level text field, but it is still returning the entire per-source block structure and substantial per-block text. That is not a list DTO.

The frontend reinforces the ambiguous contract:

frontend/src/api.ts::listPreparedSources, lines 900–907, returns Promise<PreparedSource[]>.

getPreparedSource, lines 1136–1142, also returns PreparedSource.

frontend/src/App.tsx::isPreparedSourceDisplayIncomplete, lines 1444–1452.

mergePreparedSourcesPreservingFullContent, lines 1454–1467.

refreshPreparedSources, lines 4987–5020.

The bootstrap refresh effect, lines 7717–7738.

The measured 4.34 MB response for 26 sources and approximately 29 KB compact representation in the brief are consistent with this source shape.

React StrictMode can expose duplicate effects in development, but frontend/src/main.tsx, lines 13–18, is not the architectural defect. The root problem is that fetch ownership is scattered and not single-flight/idempotent. StrictMode should remain enabled.

1.8 The narration “event stream” is timed snapshot polling without replay semantics

This finding is confirmed with an important wording constraint: SSE exists; the problem is its protocol.

backend/internal/httpapi/voice_job_routes.go, lines 142–174:

Opens an SSE response.

Polls service.GetJob on a 1,500 ms ticker.

Emits the complete job snapshot each time.

Closes at a terminal status.

Does not emit event IDs, sequence numbers, or replay information.

frontend/src/api.ts::subscribeToVoiceJob, lines 1852–1914:

Opens an EventSource.

Parses complete VoiceJob snapshots.

Has no sequence or duplicate/gap reducer.

On error, closes SSE and switches to two-second polling.

Closes on terminal status.

The current 1.5-second server cadence alone is incompatible with a sub-500 ms first-playable-to-enabled-transport target. Reconnect convergence is also not provable without a sequence cursor or authoritative snapshot protocol.

The existing source-manifest cursor/replay patterns in:

backend/internal/pipeline/source_manifest_events.go

backend/internal/pipeline/source_manifest_events_test.go

backend/internal/httpapi/source_manifest_routes_test.go

frontend/src/features/source-manifest/sourceManifestStore.test.ts

should be reused as a design precedent.

1.9 Source revision and stale-state primitives already exist

This finding supports revision-pinned reading sessions.

backend/internal/pipeline/models.go defines SourceReadinessState, including ready, failed, unsupported, and stale, around lines 356–390.

backend/internal/pipeline/source_lifecycle.go defines:

SourceRevisionStateCurrent, Superseded, and Archived, lines 57–63.

Work statuses including cancellation and retriable interruption, lines 65–75.

SourceEnvelope, lines 86–98.

SourceRevision, lines 108–122, with content hash, fingerprint, and supersession references.

Persistence and supersession behavior around lines 298–329.

These should be the server-side source identity authority. A Cinema session must pin a revision rather than silently switching when a newer revision appears.

1.10 Timing fidelity is already capable of degrading without blocking audio

This finding is confirmed.

backend/internal/pipeline/sync_fidelity_decisions.go:

Derives exact-word fidelity only when all source, mapping, timing, resource, and artifact gates pass.

Falls back to phrase, block, audio-only, or source-only modes.

Existing tests cover exact, low-resource, unchecked-artifact, phrase, block, and audio-only cases.

The missing part is frontend state ownership and UX presentation. Timing confidence should never be used as the audio-playability gate.

1.11 Overlay and tutorial observations are symptoms, not the lifecycle root

The hit-target issue is material and release-blocking but is not the state-model root cause.

frontend/src/features/layout/overlayManager.ts computes preview placement and reserved-zone metadata; it does not prove geometric non-occlusion or hit-test ownership.

frontend/src/features/readalong/highlightVisualModes.ts generates classes such as .readalong-highlight--teleprompt. The base highlight CSS does not universally remove pointer interaction. A browser geometry and elementFromPoint probe is required.

One wording in the brief should be corrected: the tutorial is implemented/tested as a non-modal Drawer, not a semantic modal. It may still visually obstruct the workbench while leaving background actions exposed. The defect is inconsistent overlay semantics and missing hit-test validation, not specifically an incorrectly implemented modal primitive.

1.12 Bundle and monolith observations are supported but are secondary causes

frontend/src/App.tsx is 21,168 lines and owns source selection, job subscription, Cinema gates, playback, global preview, diagnostics, and numerous surfaces. That is structural evidence of missing domain ownership.

According to the production-build evidence recorded in the brief:

Main JS gzip: 253.95 KB.

CSS gzip: 20.53 KB.

The canonical thresholds in benches/thresholds.json are:

Initial JS gzip: 160,000 bytes.

Initial CSS gzip: 15,000 bytes.

Largest asynchronous application chunk gzip: 110,000 bytes.

The recorded build therefore fails the existing compressed bundle gates. This build was not independently reproduced because frontend dependencies are absent from the archive environment.

2. Target lifecycle, state ownership, and event/data flow
2.1 Ownership rule

There must be exactly one authoritative owner for each independent lifecycle. UI components may derive views but may not independently reconstruct domain state.

Domain	Server authority	Client authority	Stable identity
Source revision and preprocessing	Existing source lifecycle service	SourceSessionStore	{sourceId, revisionId, contentHash}
Narration execution	Pipeline/job service	NarrationRunStore mirror	runId, bound to immutable source revision and configuration
Playable media manifest	Persisted segment/artifact manifest	Manifest slice inside NarrationRunStore	{runId, manifestVersion, segmentIndex, artifactId}
Playback cursor and intent	Optional durable progress endpoint	One PlaybackSessionController	{sourceRevisionId, runId}
Sync fidelity	Backend timing/mapping decision evidence	SyncFidelityStore or run-store projection	{runId, segmentIndex, timingRevision}
Open reader/Cinema session	None required	One CinemaSession	Pinned source revision plus locator
Voice preview/audition	Voice-preview service	VoiceAuditionSession	previewId, never runId

App.tsx must cease being the canonical owner for these lifecycles. It should eventually compose routes and providers.

2.2 Source lifecycle

Define the server lifecycle separately from client hydration:

Server source:
absent
  → preprocessing
  → ready
  → failed

ready
  → superseded/stale
  → archived

Client source session:
summary
  → hydrating
  → readable
  → renderDegraded

Rules:

ready means preprocessing produced an immutable source revision and reader projection.

readable means the selected revision’s detailed projection is resident in the client.

A list item may be ready but only summary-hydrated. Cinema may open its shell immediately and hydrate detail without waiting for narration.

The preprocessing/create response should seed the complete selected source session so a newly prepared source does not require an avoidable list-then-detail round trip.

Cinema pins {sourceId, revisionId, contentHash}.

If a newer revision appears, the open session remains on the pinned revision and shows a stale/superseded notice. It must not silently substitute content beneath audio, timing, bookmarks, or cursor state.

Switching to the newer revision creates a new Cinema/source session and requires a compatible or new narration run.

2.3 Narration run lifecycle

Use an execution phase that does not encode playability:

idle
  → accepted
  → queued
  → optimizing
  → synthesizing
  → checking
  → completed

Any active phase:
  → cancelRequested
  → cancelled

Any active phase:
  → interruptedRetriable
  → failed

A run is immutable in its source/configuration binding:

NarrationRunBinding {
  runId
  sourceId
  sourceRevisionId
  sourceContentHash
  voiceProfileVersion
  engineId
  engineConfigurationHash
  speechPolicyHash
  segmentationPolicyVersion
  audioFormat
}

A retry creates a new run ID linked to the predecessor. It may reuse artifacts only when the segment compatibility key proves that source text, source revision, voice version, engine configuration, policy, segmentation, and output format are compatible.

2.4 Partial audio and playable capability

The media manifest—not the run phase—owns playability.

NarrationMediaManifest {
  runId
  manifestVersion
  readySegmentCount
  totalSegmentCount
  contiguousPlayableThroughIndex
  contiguousPlayableDurationMs
  complete
  segments[]
}

Segment {
  index
  textHash
  status: pending | synthesizing | playable | superseded | failed
  artifactId
  artifactGeneration
  artifactCompatibilityKey
  audioUrl
  durationMs
  provisional
  replaceable
  checkedAt
  timingRevision
}

Derived capabilities:

canPlayAudio =
  contiguousPlayableDurationMs > 0

canContinueWithoutBuffering =
  decodedDurationAheadMs >= configuredBufferFloor

isFullyGenerated =
  all required segments have terminal usable artifacts

hasFinalAssembly =
  optional final artifact exists

Only a contiguous compatible prefix is automatically playable. Segment 3 must not make the initial session “playable through segment 3” while segment 2 is absent.

The existing partial manifest, compatibility-key, replacement, and reuse fields should be preserved and normalized into this contract.

2.5 First-playable segment policy

The segmentation policy must be optimized for useful first audio, not only throughput.

For the canonical local profile:

Target initial segment: approximately 4–8 seconds of estimated speech.

Hard target maximum: 12 seconds for the first segment.

Inputs with estimated speech longer than 12 seconds should normally produce at least two synthesis segments.

Sentence boundaries are preferred, but an overlong sentence must permit safe clause/phrase fallback rather than becoming one unbounded segment.

The first artifact is committed and published immediately after it is valid for provisional playback.

ASR/checking and final assembly continue independently.

A checker replacement is applied at a safe playback boundary. An already-playing source node is not interrupted or destroyed.

Final assembled audio does not replace the playback controller.

Short inputs below the first-segment target can remain one segment, but their artifact must still be published before optional checking/final assembly is treated as terminal completion.

2.6 Canonical event protocol

The current snapshot ticker should be replaced with a durable, monotonically sequenced run event stream.

Event envelope:

NarrationRunEvent {
  schemaVersion
  eventId
  runId
  sequence
  occurredAt
  sourceId
  sourceRevisionId
  type
  payload
}

Required event types:

run.accepted
run.phaseChanged
manifest.segmentPlayable
manifest.segmentReplaced
manifest.segmentFailed
sync.updated
run.cancelRequested
run.cancelled
run.interrupted
run.failed
run.completed
heartbeat

Protocol rules:

POST /api/voice-jobs returns promptly with the accepted run snapshot, runId, and current event sequence.

Audio bytes do not travel over SSE. Events carry artifact/manifest metadata and URLs.

The backend commits the artifact, updated manifest, run snapshot, and sequence record before publishing the event.

SSE messages include an id: matching the sequence/event cursor.

Reconnect supports browser Last-Event-ID and an explicit afterSequence query for controlled reconciliation.

The authoritative snapshot includes snapshotSequence.

The client reducer behavior is:

sequence <= appliedSequence: ignore as duplicate/stale.

sequence === appliedSequence + 1: apply.

sequence > appliedSequence + 1: record a gap, fetch an authoritative snapshot, replace the remote run/manifest projection, and then process buffered later events.

Reconciliation must not reset the local Cinema locator, playback cursor, playback rate, or play intent.

Terminal state does not require closing the local playback session. The event connection may close only after the terminal snapshot/sequence is durably observable.

The source-manifest event architecture should be reused as the precedent for cursor and snapshot handling.

2.7 Single playback session

There must be one playback controller instance for the active {sourceRevisionId, runId}.

PlaybackSession {
  state:
    readingOnly
    | awaitingAudio
    | playable
    | playing
    | paused
    | buffering
    | ended

  cursorSec
  rate
  playIntent
  activeSegmentIndex
  decodedThroughSec
  controllerInstanceId
}

Rules:

Extract and retain the scheduling behavior from ArrivalAudioPlayerQueue.

The controller consumes manifest changes and appends compatible segments.

No CompletedAudioPlayer versus ArrivalAudioPlayer mode switch exists.

A final assembled file may be used for future sessions or promoted only at a verified safe boundary. Promotion must retain the same logical controller, cursor, rate, callbacks, and UI.

If the next segment is not ready, the session enters buffering at the end of the contiguous prefix. Reading remains active.

If a segment is replaced while currently playing, the current decoded artifact may finish. The replacement applies to future seeks/replays or before playback enters that segment.

The UI may have multiple control proxies, but all proxies invoke the same controller. There must be one audio/Web Audio owner and one controller instance.

2.8 Sync fidelity

Use explicit availability levels:

sourceOnly
audioOnly
phraseFollow
trustedWordFollow

Backend block fallback may remain an internal decision but should be presented as degraded phrase/block following rather than as a separate promise of word precision.

Rules:

sourceOnly: reader available, no playable audio or follow mode disabled.

audioOnly: audio plays, but source-to-audio mapping is absent or untrusted.

phraseFollow: a phrase/block region can be followed reliably.

trustedWordFollow: exact-word criteria pass.

Timing updates can upgrade the active session without remounting it.

Stale source, incompatible artifacts, low confidence, or missing mapping can downgrade fidelity.

A downgrade disables only the unsupported highlight precision. It never disables reading or audio.

A timing/alignment failure is not a narration-run failure.

2.9 Cancellation and partial success

Cancellation semantics:

cancelRequested is visible immediately.

Workers stop starting new segments and cancel in-flight work where supported.

Already committed compatible segments remain available.

Reading remains available.

If a playable prefix exists, the transport remains available with an explicit state such as “Generation cancelled — 3 of 8 segments available.”

Cancellation must not delete artifacts needed by the active playback session.

A later retry creates a new run and may reuse compatible committed segments.

2.10 Reconnect and interruption

During an SSE/network interruption:

Reading and already-buffered audio continue.

The client records a disconnected state but does not close Cinema or replace the controller.

On reconnect, the client supplies its last sequence.

A missing range triggers snapshot reconciliation.

The resulting manifest is merged through the canonical reducer.

The same controller consumes newly reconciled segments.

A backend-process interruption becomes interruptedRetriable when persisted evidence supports retry/reuse.

2.11 Persistence and restoration

Server persistence:

Source envelope/revision and content hash.

Narration run binding and current phase.

Segment manifest and artifact compatibility evidence.

Monotonic event sequence and enough event history or snapshot metadata for reconnect.

Cancellation/interruption state.

Existing progress/bookmark data.

Client checkpoint:

{
  sourceId,
  sourceRevisionId,
  runId,
  locator,
  cursorSec,
  playbackRate,
  followPreference,
  updatedAt
}

Rules:

Do not persist decoded audio buffers.

Restoration opens in a paused state unless a fresh user gesture permits playback.

Invalid, corrupt, or incompatible checkpoints fall back to reading-only.

A stale source checkpoint opens its pinned revision when retained; otherwise it reports that the revision is unavailable rather than binding old audio to new text.

2.12 Failure recovery

Failure classes must remain independent:

Source preprocessing failure: no new readable revision; an older pinned readable revision may remain usable.

Segment synthesis failure: reading remains; already committed prefix remains; playback buffers at the first missing segment.

Checker failure: provisional audio may remain playable with an honest quality state if policy permits.

Timing failure: audio-only mode.

Final assembly failure: segment playback remains usable; final-file optimization is unavailable.

Event-stream failure: reconnect/snapshot; no session replacement.

Rich renderer failure: fall back to the plain reader projection.

Persistence failure before publication: do not publish the event.

Publication failure after persistence: reconnect/snapshot discovers the committed state.

3. Exact UX availability contract
3.1 Cinema
Condition	Cinema availability
No source selected	Visible but disabled with “Choose a source.”
Source preprocessing	Visible with “Preparing source”; reading controls unavailable until a readable revision exists.
Source revision ready and detail resident	Enabled immediately, regardless of narration state.
Source revision ready but only summary resident	Enabled; opens the Cinema shell immediately and hydrates the reader projection.
Narration absent	Fully usable in reading-only mode.
Narration queued/generating/checking	Fully usable; generation status is non-modal.
Narration failed/cancelled	Fully usable; failure/cancellation is shown without closing Cinema.
Event stream disconnected	Fully usable from resident source state.
New source revision exists	Existing Cinema remains pinned and displays a stale/superseded notice.

The Cinema action must never require generatedAudioLifecycle === "ready".

3.2 Reading-only mode

Once the source is readable, all of these are available without audio:

Open and close Cinema.

Scroll and navigate headings/blocks/pages.

Search within the source.

Select passages.

Create or use bookmarks and reading position.

Change reader theme, font, spacing, and layout.

Enter supported reader/Theatre presentation modes.

Reopen at the persisted locator.

Inspect source metadata that does not require narration.

Start or cancel narration without leaving the reader.

Audio, checking, alignment, diagnostics, and persistence work must not disable those interactions.

3.3 Regular narration transport

The regular narration transport belongs to the reader/Cinema session.

Before narration starts:

Show a “Create narration” action.

Do not show Preview/Audition terminology.

After the start command:

A visible acknowledgement appears within the action budget.

The transport remains in the same place.

State reads “Preparing narration.”

Play is disabled only because no contiguous audio exists, with a precise reason.

Cancel remains available.

Reader navigation remains active.

When the first contiguous segment arrives:

The already-mounted transport becomes playable.

Cinema does not close, reopen, or remount.

No Preview Player appears.

No terminal job completion is required.

A queued play intent may be honored only when browser media policy permits; otherwise the enabled Play action is announced.

As later segments arrive:

They append to the same session.

Cursor, rate, play/pause state, follow preference, and reader locator remain stable.

Buffering at the current prefix is reported without disabling reading.

At terminal completion:

The transport does not change owner or identity.

A final assembled artifact may become available without replacing the controller.

3.4 Voice Preview/Audition

Preview/Audition is available only in voice-cloning and voice-comparison workflows:

Preview generation uses preview IDs and preview APIs.

“Audition” and A/B comparison remain appropriate there.

The global preview player must not receive a regular narration runId or VoiceJob.

Review, Reader, Cinema, Teleprompt, and Theatre use the regular narration controller.

A compact transport shown outside Cinema may be a proxy to that same controller, not another media owner.

3.5 Audio playback

Audio playback is available when:

contiguousPlayableDurationMs > 0

It does not require:

Full narration completion.

Final assembled audio.

ASR checking completion.

Word timing.

Phrase timing.

Trusted source mapping.

An unchecked/replaceable segment must be visibly identified as provisional if that distinction affects user trust, but it may not be hidden behind terminal completion when the product policy permits provisional arrival playback.

3.6 Follow-along levels
Level	Availability	UX promise
Source only	Readable source exists	Reading works; no audio-follow promise.
Audio only	Playable audio exists but mapping/timing is unavailable or untrusted	Audio plays; no automatic text-follow guarantee.
Phrase follow	Phrase/block mapping passes its confidence threshold	Current phrase or block follows playback.
Trusted word follow	Exact-word source, artifact, timing, and compatibility gates pass	Word-level highlight is enabled.

The active level must be visible and understandable. Upgrade and downgrade can happen during playback. No level transition may recreate the reader or player.

3.7 Overlays and responsive behavior

At 390, 1100, 1440, and 1920 CSS pixels:

No primary action may be geometrically covered.

document.elementFromPoint at the center and actionable regions of a primary control must resolve to that control or its descendant.

Read-along highlight layers must not intercept unrelated controls.

A modal overlay must make the background inert and inaccessible.

A non-modal drawer must reserve or adapt layout so primary content and actions remain usable.

Only one dominant action per surface is allowed under the existing threshold.

No duplicate visible action label, horizontal overflow, or control/content occlusion is allowed under the existing threshold.

4. Local p50/p95 performance contract

These budgets extend, rather than loosen, benches/thresholds.json.

Measurement protocol:

Existing local-cpu-modest-v1 machine class: 4–8 logical CPUs, at least 16 GiB RAM, SSD, no required GPU.

Production frontend build for product timings.

Explicit cold/warm/cache state in every result.

One discarded warm-up and at least 10 measured runs.

Report p50, p95, and maximum.

Bind raw results to source SHA, build SHA, machine metadata, fixture ID, provider/engine configuration, and threshold-file hash.

Localhost network only for these gates.

Negative fixtures must prove the validator fails when a budget is breached.

4.1 Budgets
Metric	Start and end points	p50	p95	Additional gate
Prepared-source list server time	Request accepted → response bytes completed, canonical 26-source fixture	50 ms	150 ms	Raw JSON ≤64 KiB and ≤8 KiB base + 2.25 KiB/source
Source-list client ingestion	Fetch start → normalized summary store committed	75 ms	200 ms	One effective request per project/cache key
Selected-source detail hydration	Detail request → reader projection committed	120 ms	300 ms	Stale response cannot replace newer selection
Ready source → Cinema enabled	Source-ready store commit → enabled action painted	16 ms	50 ms	No narration dependency
Resident-data Cinema open	Input event → interactive Cinema paint	50 ms	100 ms	Reader focus target available
First useful cold shell	Navigation start → first primary interaction usable	650 ms	1,000 ms	Optional diagnostics/rich renderers excluded
Visible action acknowledgement	Input event → visible pressed/pending/status response	16 ms	75 ms	Existing global hard limit remains 100 ms
Playback command acknowledgement	Input event → controller state/audio effect observed	16 ms	50 ms	Retains existing threshold
Narration request acceptance	Start input → accepted run visible with runId	50 ms	150 ms	No source/navigation blocking
Warm local first playable	Run accepted → first segment artifact durably committed	10 s	20 s	Canonical local fixture and warmed engine
Cold local first playable	Run accepted → first segment artifact durably committed	20 s	35 s	Cold engine/model state reported separately
Progressive advantage	Run accepted → first playable, divided by run accepted → terminal completion	—	≤0.35	Applies to sources with estimated speech ≥30 s
Artifact commit → SSE flush	Durable segment commit → event bytes flushed	25 ms	100 ms	Sequence included
Event receipt → enabled transport	Event callback → enabled transport painted	32 ms	100 ms	Same Cinema/controller instance
Commit → enabled transport	Durable segment commit → enabled transport painted	100 ms	250 ms	Replaces the brief’s 500 ms candidate
Reconnect convergence	Network restored → authoritative sequence/store convergence	250 ms	1,000 ms	No cursor/session reset
Predecoded intersegment gap	End of segment → next audible segment	20 ms	50 ms	When the next compatible segment is decoded
Cursor continuity	Before append/promotion → after append/promotion	—	—	Maximum regression or jump attributable to transition: 20 ms
Main-thread generation session	60-second generation/playback/navigation fixture	—	—	Zero long tasks ≥50 ms
Overlay geometry	Four required viewport widths	—	—	Zero occlusions and zero primary-action hit-test interceptions

First-playable synthesis timing is intentionally separated from UI responsiveness. A slow engine may still fail its own gate, but it cannot make the reader unresponsive.

Existing bundle gates remain unchanged:

Initial JS raw: ≤523,700 bytes.

Initial JS gzip: ≤160,000 bytes.

Initial CSS gzip: ≤15,000 bytes.

Largest asynchronous application chunk gzip: ≤110,000 bytes.

Diagram vendors, book/Cinema Markdown rendering, diagnostics, tutorial code, and inactive stages must remain outside the initial route when not required.

4.2 Frontend instrumentation

Add a dedicated instrumentation boundary, proposed at:

frontend/src/features/performance/responsiveNarrationMetrics.ts

Required marks/measures:

app_navigation_start
shell_interactive

source_list_request_start
source_list_response_end
source_list_store_commit

source_detail_request_start
source_session_readable
cinema_action_enabled

cinema_open_input
cinema_interactive

narration_start_input
narration_start_ack
narration_run_accepted

narration_event_received
narration_event_reduced
segment_playable_committed_client
transport_enabled

playback_controller_created
playback_command_input
playback_effect_observed
segment_append_received
segment_append_scheduled

sync_fidelity_changed

event_stream_disconnected
event_reconcile_started
event_reconciled

Every narration measure must include, where applicable:

Trace ID.

Source ID and revision ID.

Run ID.

Segment index.

Event sequence.

Controller instance ID.

Cold/warm state.

Engine and performance mode.

Use:

PerformanceObserver for long tasks and Event Timing.

Resource Timing for source-list/detail transfer size.

React Profiler around the shell and store subscribers.

A controller-instance counter that fails when more than one active controller exists for one run.

No source text or sensitive voice material in metrics.

4.3 Backend instrumentation

Add structured timing at the exact boundaries:

HTTP request accepted/completed and response bytes for list, detail, and run creation.

runAcceptedAt.

Segment plan created.

Segment synthesis started/completed.

Artifact durable commit completed.

Existing FirstPlayableAt.

Manifest update committed.

Event sequence allocated.

Event enqueued.

SSE event flushed.

Cancellation requested and effective.

Snapshot/reconnect requested and completed.

Gap count and replayed event count.

Final assembly started/completed/failed.

Suggested implementation boundaries:

HTTP timing middleware under backend/internal/httpapi/.

Pipeline timing helpers under backend/internal/pipeline/.

Raw local benchmark artifacts under a source-hash-bound benches/results/responsive-cinema/ tree.

5. Dependency-ordered atomic issue graph

The replacement graph contains exactly 15 issues.

RSP-01 — Freeze the responsive lifecycle and validation contract

Objective: Establish the machine-readable state, capability, event, UX, and performance contract before product changes.

In scope:

docs/plans/2026-07-10-responsive-cinema-peer-brief.md

docs/architecture/best-in-class-ux-performance.md

docs/performance.md

benches/thresholds.json

Relevant records in docs/flows/manifest.json

docs/flows/content-audio-reader.md

docs/flows/application-ux.md

docs/flows/runtime-data-security.md

scripts/validate-flow-registry.mjs

New scripts/validate-responsive-architecture.mjs

Corresponding Node validator tests

Relevant flows include source manifest/readiness, job creation/run/events, artifacts, playback, sync fidelity, Cinema, Reader, progress, repair, Teleprompt/Theatre, and PREVIEW-001.

Explicit non-goals: Runtime product behavior, backend pipeline changes, frontend component changes, Linear mutation.

Dependencies: None.

Acceptance tests/probes:

The contract distinguishes source readiness, run phase, media playability, playback state, and sync fidelity.

Event schemas require sequence, snapshot cursor, immutable source revision, and duplicate/gap behavior.

Negative fixtures fail for terminal Cinema gating, a second playback owner, missing source revision, unsequenced event streams, and oversized source-list DTOs.

The current product baseline records known failures without requiring intentionally failing CI tests.

Every affected flow transition is assigned to one issue and one named executable probe.

Threshold validation rejects missing p50/p95/raw-artifact evidence.

Observability evidence: A checked-in baseline report with archive/source hash, recorded payload, event cadence, bundle evidence, and known violation IDs.

Rollback boundary: Documentation, schema, validator, and test-fixture changes only.

Dependency-unblocked: Yes in the proposed DAG. It is not implementation-authorized until the owner accepts this replacement graph.

RSP-02 — Introduce a real prepared-source summary API boundary

Objective: Stop transporting detailed block/source payloads during project bootstrap and hydrate one selected source on demand.

In scope:

backend/internal/pipeline/models.go

Add a dedicated PreparedSourceListItem or equivalent DTO.

Do not repurpose the existing aggregate PreparedSourceSummary.

backend/internal/pipeline/source_preps.go::ListProjectPreparedSources

Delete or replace backend/internal/pipeline/source_preps_text_helpers.go::summarizePreparedSourcePayload

backend/internal/httpapi/router.go list/detail routes

backend/internal/httpapi/router_test.go

frontend/src/types.ts

frontend/src/api.ts::listPreparedSources

frontend/src/api.ts::getPreparedSource

frontend/src/api.test.ts

Temporary migration of:

App.tsx::refreshPreparedSources

isPreparedSourceDisplayIncomplete

mergePreparedSourcesPreservingFullContent

The summary DTO must include stable source/revision identity, label/type/status, useful counts, timestamps, and bounded display metadata. It must exclude blocks, source text, transcripts, skipped-item arrays, and unbounded metadata.

Explicit non-goals: Source extraction quality, narration generation, player architecture, rich reader rendering.

Dependencies: RSP-01.

Acceptance tests/probes:

The 26-source canonical list is ≤64 KiB raw.

No list item contains blocks, full text, speech text, transcript, or other detail arrays.

Detail endpoint behavior remains complete.

Selecting A then B cannot allow A’s slower detail response to overwrite B.

Duplicate concurrent list requests for the same project/cache key collapse into one effective request.

Source creation/preprocessing responses seed complete detail for the just-created source.

Server and client list/hydration p50/p95 budgets pass.

Observability evidence: Response bytes, item count, serialization time, request-to-store timing, cache hit/miss, deduplicated-request count.

Rollback boundary: Keep the detail endpoint unchanged; version or feature-flag the list DTO during migration. Do not reintroduce detail arrays into the list.

Dependency-unblocked: No.

RSP-03 — Establish SourceSessionStore and source-ready Cinema ingress

Objective: Make one client owner responsible for selected source revision, hydration, readability, stale state, and Cinema opening.

In scope:

New frontend/src/features/source-session/ types, reducer/store, selectors, and tests.

Existing backend revision identity from:

backend/internal/pipeline/models.go

backend/internal/pipeline/source_lifecycle.go

Migrate from frontend/src/App.tsx:

Prepared/book source selection relevant to Cinema.

canOpenBookCinema

canOpenCurrentCinema

openReadingCinema

openPreparedSourceCinema

Detail hydration effect at lines 3846–3879.

frontend/src/features/cinema/model.ts

PreparedSourceCinemaBase.tsx

PreparedSourceCinemaTransport.tsx

Explicit non-goals: Narration event transport, audio decoding/scheduling, timing alignment, voice-preview changes.

Dependencies: RSP-01 and RSP-02.

Acceptance tests/probes:

A readable source with no job opens Cinema and supports navigation.

Queued, generating, failed, cancelled, or disconnected narration does not alter Cinema availability.

A summary-only selected source opens an immediate shell and becomes readable after detail hydration.

A stale detail response cannot replace the current selection.

A newer source revision marks the pinned session stale without silently replacing it.

Switching revision creates a distinct source session.

A rich-renderer failure falls back to a readable plain projection.

Source-ready-to-enabled and resident-Cinema-open budgets pass.

Observability evidence: Source-session transition log, hydration duration, selected revision ID, stale-response count, Cinema-enabled mark, Cinema-session ID, source-store subscriber render count.

Rollback boundary: Feature-flag store-backed selection during migration. Rollback may return to legacy selection wiring but must not restore an audio-ready Cinema gate.

Dependency-unblocked: No.

RSP-04 — Enforce bounded first-playable segmentation and durable segment publication

Objective: Ensure meaningful inputs produce an early playable segment and preserve the existing progressive artifact mechanism.

In scope:

backend/internal/pipeline/service.go

Segment defaults around lines 200–206.

resolveSegmentSettingsForMode

synthesizeUntilComplete

splitTextSegments

Reused and newly synthesized segment-publication paths.

ensureFirstPlayableAt

normalizePartialAudioManifest

backend/internal/pipeline/models_runtime.go

backend/internal/pipeline/speech_plan_artifacts.go

backend/internal/pipeline/service_test.go

Extend TestCreateJobPublishesPartialAudioWhileSynthesizing.

Add production-default segmentation and first-playable tests.

Existing artifact compatibility/replacement/reuse helpers.

Explicit non-goals: Replacing the TTS engine/model, frontend SSE handling, UI transport work, word-alignment quality.

Dependencies: RSP-01.

Acceptance tests/probes:

Canonical sources estimated above 12 seconds do not normally collapse into one segment.

Initial target segment is approximately 4–8 seconds, with 12 seconds as the hard target maximum unless an explicitly reported unsplittable fallback applies.

Long sentences have a safe clause/phrase fallback.

The first artifact is retrievable and the manifest is partialReady while the run is non-terminal.

FirstPlayableAt precedes terminal completion for multi-segment fixtures.

Checker/final-assembly work does not delay segment publication.

A final-assembly failure does not invalidate committed segment playback.

Replacement and reuse require matching artifact compatibility evidence.

Warm and cold first-playable budgets pass on the canonical fixture.

Observability evidence: Planned segment count, estimated duration/runes per segment, synthesis latency per segment, artifact commit timestamp, first-playable timestamp, terminal timestamp, reuse/replacement reason.

Rollback boundary: Version/configure the segmentation policy. Existing manifest fields and previously generated artifacts remain readable.

Dependency-unblocked: No.

RSP-05 — Replace timed job snapshots with a sequenced replayable event protocol

Objective: Publish state changes immediately and make reconnect convergence deterministic.

In scope:

backend/internal/httpapi/voice_job_routes.go

New narration-run event log under backend/internal/pipeline/

Existing source-manifest event patterns and tests

Voice-job route tests

SSE serialization including id:

Authoritative run snapshot with snapshotSequence

Last-Event-ID and afterSequence

Event retention/compaction policy

Explicit non-goals: Audio bytes over SSE, synthesis algorithm changes, frontend playback, UI redesign.

Dependencies: RSP-01.

Acceptance tests/probes:

Event sequences are strictly monotonic per run.

Duplicate delivery is safe.

Reconnect after an exact cursor replays the missing range.

A cursor older than retained history yields an authoritative snapshot and new cursor.

Segment-playable publication is push-driven, not a 1.5-second ticker.

Terminal, cancel, failure, and interruption events are observable.

Events are never published before the referenced manifest/artifact state is durable.

Commit-to-SSE-flush p95 is ≤100 ms.

Observability evidence: Event sequence, queue and flush timestamps, connected client count, replay count, snapshot fallback count, gaps, retention boundaries.

Rollback boundary: Introduce a versioned event endpoint or protocol flag. The legacy snapshot endpoint may remain temporarily as a fallback, but not as the final release path.

Dependency-unblocked: No.

RSP-06 — Extract the canonical NarrationRunStore

Objective: Give one frontend reducer ownership of run phase, manifest state, event sequence, and reconnect reconciliation.

In scope:

New frontend/src/features/narration-run/ domain types, reducer, store, selectors, and tests.

frontend/src/api.ts::subscribeToVoiceJob

New snapshot/replay API functions.

Remove run-state mutation from the App.tsx subscription effect at lines 8214–8261.

Adapt existing VoiceJob snapshots during migration.

Bind every run to immutable source-revision/configuration identity.

Explicit non-goals: Audio scheduling/decoding, transport layout, source detail cache, alignment computation.

Dependencies: RSP-04 and RSP-05.

Acceptance tests/probes:

Duplicate and stale sequences are ignored.

Exact-next sequences are applied once.

A sequence gap triggers one snapshot reconciliation.

Buffered later events apply after reconciliation.

Source-revision mismatch is rejected and surfaced.

Terminal, cancel, failure, and interrupted states converge correctly.

A segment replacement increments artifact generation without losing the run.

Store reconciliation does not mutate local playback cursor or Cinema locator.

React StrictMode does not create duplicate live subscriptions for one run.

Observability evidence: Event-received/reduced lag, applied sequence, ignored duplicate count, gap count, snapshot count, active subscription count, subscriber render count.

Rollback boundary: A legacy snapshot adapter may feed the new store during migration. Domain ownership must not move back into scattered component state.

Dependency-unblocked: No.

RSP-07 — Extract one progressive PlaybackSessionController

Objective: Replace arrival/completed player switching with a single append-capable playback owner.

In scope:

Extract reusable behavior from:

App.tsx::PlaybackControllerHost

StreamingAudioPanel

ArrivalAudioPlayer

ArrivalAudioPlayerQueue

CompletedAudioPlayer

New frontend/src/features/playback/PlaybackSessionController.ts and supporting modules/tests.

Preserve the useful existing PlaybackController interface where it matches the target.

Manifest subscription from NarrationRunStore.

Playback checkpoint persistence and paused restoration.

Segment replacement at safe boundaries.

Final assembled artifact as optional same-session optimization.

Explicit non-goals: TTS generation, event persistence, Cinema visual design, word-timing calculation.

Dependencies: RSP-01, RSP-04, and RSP-06.

Acceptance tests/probes:

First segment enables one controller.

Later segments append without controller recreation.

Play, pause, restart, seek, skip, and rate work across append boundaries.

Buffering at the contiguous prefix preserves play intent.

Missing segment gaps cannot be crossed accidentally.

Segment replacement does not interrupt an already-playing source.

Terminal completion while playing or paused does not remount or reset controls.

Controller instance count is exactly one for the active run.

Cursor transition error is ≤20 ms.

Checkpoint restore is paused and preserves locator/rate/cursor.

Observability evidence: Controller instance ID/create count, decoded and scheduled ranges, buffer-ahead duration, intersegment gap, cursor delta, replacement decisions, checkpoint restore outcome.

Rollback boundary: A feature flag may select legacy versus new controller for a whole session. Both controllers must never be active for the same run.

Dependency-unblocked: No.

RSP-08 — Make Cinema own the regular narration transport

Objective: Attach regular narration to the already-open reading session as soon as the first playable prefix exists.

In scope:

frontend/src/features/cinema/PreparedSourceCinemaBase.tsx

PreparedSourceCinemaTransport.tsx

CinemaTransportBar.tsx

Cinema model/selectors.

Relevant App.tsx rail, status-strip, Book Cinema, Review, Teleprompt, and Theatre call sites.

Remove terminal playbackLifecycleReady and canOpenCurrentCinema audio gates.

Introduce regular narration labels and disabled reasons.

Bind transport controls to PlaybackSessionController.

Explicit non-goals: Voice audition/comparison implementation, alignment quality, backend segment generation, global shell extraction.

Dependencies: RSP-03, RSP-06, and RSP-07.

Acceptance tests/probes:

Cinema opens and reads before any job exists.

Narration can be started without closing or replacing Cinema.

The first segment enables the same mounted transport.

Later segments append while reading/navigation remains active.

Terminal completion does not replace the transport/controller.

Failure and cancellation preserve reading and any playable prefix.

No regular narration control uses “Preview” or “Audition.”

First-playable-event-to-enabled-transport p95 is ≤100 ms; commit-to-enabled p95 is ≤250 ms.

Observability evidence: Cinema-session ID, controller ID, start acknowledgement, first playable sequence, transport-enabled paint, mount count, input latency.

Rollback boundary: Feature-flag the new transport surface while preserving source-ready Cinema. Rollback must not restore terminal Cinema gating.

Dependency-unblocked: No.

RSP-09 — Integrate independent sync-fidelity upgrades and downgrades

Objective: Allow reading and audio immediately while progressively improving follow-along fidelity.

In scope:

backend/internal/pipeline/sync_fidelity_decisions.go

Related runtime models and tests.

frontend/src/features/readalong/readAlongState.ts

frontend/src/features/readalong/alignmentStatus.ts

ReadAlongResyncController.ts

New fidelity adapter/store or canonical run-store projection.

Cinema/reader fidelity status presentation.

Explicit non-goals: Replacing the aligner/ASR engine, improving linguistic model accuracy, blocking playback until timing completes.

Dependencies: RSP-06, RSP-07, and RSP-08.

Acceptance tests/probes:

Source-only reader works with no run.

Audio-only playback works with no timing data.

Phrase follow activates on phrase/block evidence.

Trusted-word follow activates only when all exact-word gates pass.

Unchecked/incompatible/stale evidence cannot claim trusted words.

Timing arrival upgrades an active session without remount.

Confidence loss or source staleness downgrades the level without stopping audio.

Timing failure produces audio-only rather than narration failure.

Observability evidence: Previous/new fidelity, reason code, source revision, artifact compatibility, timing revision, duration spent at each level, attempted invalid upgrade count.

Rollback boundary: Disable fine-grained highlights and fall back to audio-only/source-only. Never disable the reader or audio controller.

Dependency-unblocked: No.

RSP-10 — Implement narration continuity and failure recovery

Objective: Make cancellation, interruption, reconnect, retry, and partial failure preserve useful reading/audio state.

In scope:

Backend cancellation/retry/interrupted job paths in backend/internal/pipeline/service.go.

Voice-job cancel/retry routes.

Narration event snapshots/log.

Artifact reuse and compatibility helpers.

NarrationRunStore.

PlaybackSessionController.

Existing frontend/src/features/playback/workbenchAudioRestore.ts where applicable.

Error and recovery UX in Cinema transport.

Explicit non-goals: Source extraction repair, automatic cross-device playback, autoplay-policy bypass, voice-model quality work.

Dependencies: RSP-03, RSP-04, RSP-05, RSP-06, RSP-07, and RSP-09.

Acceptance tests/probes:

Cancel acknowledgement is immediate and worker cancellation becomes observable.

Committed playable segments survive cancellation.

Reading remains available for cancel, failure, and disconnect.

Synthesis failure preserves the contiguous prefix.

Checker failure follows provisional-artifact policy.

Timing failure downgrades fidelity only.

Final assembly failure leaves segment playback available.

Disconnect/reconnect converges from sequence or snapshot without controller/cursor reset.

Process interruption restores interruptedRetriable.

Retry creates a new run and reuses only compatibility-matching artifacts.

Corrupt or incompatible client checkpoints fall back safely.

Observability evidence: Cancel-request/effective latency, retained segment count, reconnect convergence, gap and snapshot counts, retry predecessor, reuse/reject reason, restored checkpoint status.

Rollback boundary: Version client checkpoints and run-event snapshots. Preserve server artifacts and old run records during rollback.

Dependency-unblocked: No.

RSP-11 — Isolate voice Preview/Audition from regular narration

Objective: Restore Preview/Audition to the voice-cloning/comparison domain and remove regular narration dependencies.

In scope:

frontend/src/features/preview/GlobalPreviewPlayer.tsx

frontend/src/features/playback/playbackSurfaceRules.ts

Their tests.

Voice-cloning/comparison components under frontend/src/features/preview/.

Relevant App.tsx global-preview call sites.

Voice-preview APIs and preview IDs.

Removal of regular VoiceJob/runId inputs from the preview owner.

Explicit non-goals: Voice-cloning model quality, provider capability changes, redesigning the Cinema transport.

Dependencies: RSP-01 and RSP-08.

Acceptance tests/probes:

Global Preview Player is absent from normal narration Review/Reader/Cinema workflows.

Audition remains available in voice selection/comparison.

Preview state cannot accept a narration run ID.

Regular narration remains available through the Cinema-owned controller.

No preview component mounts an audio owner for a regular run.

Existing A/B comparison behavior remains intact.

Observability evidence: Surface-owner invariant, preview ID versus run ID assertion, preview mount count, forbidden regular-run binding test.

Rollback boundary: Route/surface feature flag. Do not couple preview state back to narration state.

Dependency-unblocked: No.

RSP-12 — Extract application shell/bootstrap ownership and enforce lazy boundaries

Objective: Remove bootstrap, domain ownership, and inactive feature imports from App.tsx after the canonical stores exist.

In scope:

frontend/src/App.tsx

frontend/src/AppShell.tsx

frontend/src/main.tsx, retaining StrictMode.

New bootstrap/query ownership modules.

Store/provider composition for source, narration, playback, and audition.

Lazy boundaries for diagnostics, tutorial UI, inactive stages, rich renderers, diagram vendors, and quick-listen paths.

Static/dynamic import conflict that prevents quick-listen splitting.

Bundle and render tests.

Explicit non-goals: Moving state back into replacement mega-components, threshold relaxation, broad visual redesign, removing StrictMode to hide duplicate effects.

Dependencies: RSP-02, RSP-03, RSP-06, RSP-07, and RSP-11.

Acceptance tests/probes:

StrictMode produces one effective bootstrap request per query key.

App shell does not own source/run/playback domain state.

Inactive diagnostics/tutorial/rich renderer code is absent from the initial graph.

Expected lazy chunks are emitted.

No forbidden initial imports remain.

Shell interaction and source-list budgets pass.

Store selectors prevent unrelated full-shell rerenders.

App line count improves, but line count alone is not acceptance evidence.

Observability evidence: Effective request count, cache key, React Profiler commits, initial module graph, chunk gzip sizes, shell-interactive timing.

Rollback boundary: Incremental module boundaries and import flags. Canonical domain state may not be moved back into App.tsx.

Dependency-unblocked: No.

RSP-13 — Enforce overlay, responsive, focus, and hit-test invariants

Objective: Make every primary reading/narration action operable across supported layouts.

In scope:

frontend/src/features/layout/overlayManager.ts

overlayManager.test.ts

Demo/tutorial Drawer implementation and tests.

frontend/src/features/readalong/highlightVisualModes.ts

Teleprompt highlight layers.

Relevant CSS in frontend/src/styles.css.

Reader/Cinema rails, sheets, drawers, and transport placement.

Browser-level responsive/accessibility tests.

Explicit non-goals: Domain-state redesign, narration-event changes, global visual restyling unrelated to collisions/accessibility.

Dependencies: RSP-03, RSP-08, and RSP-11.

Acceptance tests/probes:

Playwright tests at 390, 1100, 1440, and 1920 px.

Primary action center and actionable-region elementFromPoint checks.

Zero overlay/content occlusions and zero horizontal overflow.

Read-along highlight layers never become the top hit target over unrelated controls.

Modal surfaces make background content inert; non-modal surfaces preserve operability.

Focus enters, remains within when appropriate, and returns correctly.

Touch targets meet 44×44 px.

Zoom and increased text-size fixtures remain usable.

Duplicate dominant actions and visible duplicate labels satisfy existing zero/one limits.

Observability evidence: Geometry JSON, hit-test trace, focus trace, accessibility output, and viewport screenshots tied to source SHA.

Rollback boundary: Per-overlay/per-surface CSS and placement commits. Avoid broad stylesheet rollback.

Dependency-unblocked: No.

RSP-14 — Run the integrated p50/p95, bundle, continuity, and UX release gate

Objective: Prove the target architecture meets the local release contract with validator-backed raw evidence.

In scope:

benches/thresholds.json

docs/performance.md

Frontend and backend instrumentation introduced by prior issues.

Benchmark runners and package scripts.

Production bundle analysis.

Local event/reconnect fault injector.

Browser responsiveness and overlay suites.

Machine-readable results and threshold validator.

Explicit non-goals: Loosening thresholds to obtain a pass, adding new product behavior, accepting screenshots or one-off timings without raw data.

Dependencies: RSP-02 through RSP-13.

Acceptance tests/probes:

One discarded warm-up and at least 10 measured runs for each required path.

Every budget in Section 4 passes p50, p95, and hard invariants.

Negative fixtures prove oversized payloads, delayed events, duplicate controllers, occluded actions, and oversized bundles fail.

Raw artifacts contain source/build/threshold hashes and machine metadata.

No missing-result path is interpreted as a pass.

Existing initial JS/CSS limits pass without amendment.

The 60-second generation/playback/navigation fixture has zero ≥50 ms long tasks.

Observability evidence: Complete source-bound result bundle, percentile summaries, trace correlations, bundle manifest, geometry evidence, and failure-injection logs.

Rollback boundary: CI enforcement may be temporarily disabled only for a demonstrated harness defect, while collection and thresholds remain intact. A bounded repair issue is required; product thresholds are not silently changed.

Dependency-unblocked: No.

RSP-15 — Delete legacy ownership and complete migration evidence

Objective: Remove superseded state formulas, duplicate players, regular-narration preview paths, and compatibility scaffolding after parity is proven.

In scope:

Delete or narrow terminal generated-audio gate formulas.

Delete arrival/completed player switching and the second media owner.

Remove regular narration call sites from Global Preview Player.

Remove legacy App-owned source/run/playback state and migration adapters.

Remove temporary feature flags after rollback rehearsal.

Update:

docs/flows/manifest.json

Flow documents and coverage report.

Replacement Linear draft packet.

Architecture and operational documentation.

Add forbidden-symbol/path searches and archive-closure checks.

Explicit non-goals: New user behavior, new backend features, unrelated cleanup, release signoff without evidence.

Dependencies: RSP-02 through RSP-14.

Acceptance tests/probes:

Repository search finds no legacy terminal Cinema gate or dual-player mode.

No regular narration run reaches Preview/Audition state.

Exactly one playback controller is active per run.

Relevant flow transitions have executable evidence rather than planned-only claims.

Full backend/frontend/unit/integration/browser/performance gates pass in the supported toolchain.

Rollback rehearsal succeeds at the defined compatibility boundary.

Archive inventory and source-closure checks pass.

Observability evidence: Deletion inventory, before/after ownership map, forbidden-reference report, final flow coverage, full test manifests, performance evidence bundle.

Rollback boundary: One atomic migration boundary with documented data/schema compatibility. A persisted v2 event/manifest schema cannot be rolled back without its migration path.

Dependency-unblocked: No.

DAG summary
RSP-01
├── RSP-02 ── RSP-03
├── RSP-04 ──┐
└── RSP-05 ──┴── RSP-06 ── RSP-07
                         └──────────── RSP-08 ── RSP-09
RSP-03 ────────────────────────────────┘          │
RSP-03/04/05/06/07/09 ─────────────────────── RSP-10
RSP-01/08 ─────────────────────────────────── RSP-11
RSP-02/03/06/07/11 ───────────────────────── RSP-12
RSP-03/08/11 ──────────────────────────────── RSP-13
RSP-02..RSP-13 ────────────────────────────── RSP-14
RSP-02..RSP-14 ────────────────────────────── RSP-15
6. Reuse, supersede, and revert decisions
6.1 Existing product primitives to reuse

Retain and build around:

Backend partial-audio manifest and segment publication.

FirstPlayableAt, ready-segment counts, artifact replacement, compatibility, and reuse evidence.

TestCreateJobPublishesPartialAudioWhileSynthesizing.

Source envelope/revision/content-hash and supersession model.

Existing sync-fidelity decision machinery.

Arrival Web Audio queue scheduling behavior.

Cinema’s existing preAudio and generating/readable presentation model.

Source-manifest replay/snapshot design patterns.

Existing progress/bookmark persistence where identity compatibility can be proved.

6.2 Current tracked v10 documentation/tooling changes

The 12 tracked modifications contain no product-code implementation that needs immediate code reversion.

Reuse

Retain:

benches/thresholds.json measurement protocol and current strict thresholds.

docs/performance.md evidence protocol.

docs/architecture/best-in-class-ux-performance.md principles that reading and degraded modes stay usable.

Flow-registry infrastructure and route/state inventory.

Linear-batch validator and its tests.

Archive/provenance tooling and _review/ files.

package.json validation hooks, updated later to target the replacement packet.

Prior ChatGPT responses and repair matrices as provenance.

The v9 repair matrix’s correction of the false Linear project/team-ID finding remains valid. This review does not reopen that resolved provenance issue.

Supersede

Supersede as an active implementation packet:

docs/project-management/linear/tts-research-best-in-class-batch-draft.json

docs/project-management/linear/tts-research-best-in-class-batch-draft.md

Reasons:

They contain 20 issues, exceeding the required maximum of 15.

Their status remains candidate_pending_chatgpt_v8_recheck.

BIC-08 combines job execution, events, artifacts, persistence, cancellation, and interruption.

BIC-09 combines playback, sync, Reader, Cinema, progress, and repair.

BIC-11 through BIC-13 use line-count-oriented App extraction phases before the canonical state owners have been established.

BIC-20 requires a 20/20 reconciliation that is inapplicable to the replacement graph.

docs/flows/coverage-report.json records 677 transitions but:

coveredTransitionClaimCount: 0

plannedTransitionEvidenceCount: 677

That is a useful plan inventory, not proof of implemented behavior.

The current packet should be retained as frozen provenance and explicitly marked superseded when an authorized replacement is created. It should not be silently rewritten to look as though it always contained the responsive architecture.

6.3 Mapping current BIC issues to the replacement graph
Current issue(s)	Decision
BIC-01	Keep its startup-command evidence as a broader quality gate; it is not an active dependency of the responsive graph.
BIC-02	Reuse bounded cancellation/external-work content in RSP-10; leave unrelated global audit work outside this graph.
BIC-03	Reuse validator/registry infrastructure in RSP-01 and final evidence in RSP-15.
BIC-04	Supersede as a standalone seam; distribute responsive shell/state content to RSP-01 and RSP-12.
BIC-05	Reuse source lifecycle primitives; responsive list/session work becomes RSP-02 and RSP-03.
BIC-06	Reuse source-revision/manifest/speech-plan evidence; responsive portions move to RSP-03, RSP-04, and RSP-05.
BIC-07	Narrow to genuine voice preview/audition and implement through RSP-11.
BIC-08	Supersede and split into RSP-04, RSP-05, RSP-06, and RSP-10.
BIC-09	Supersede and split into RSP-07, RSP-08, and RSP-09.
BIC-10	Reuse bundle/diagnostic constraints in RSP-12 and RSP-14.
BIC-11–BIC-13	Supersede the phase plan. Extract canonical state owners first, then perform shell/bootstrap extraction in RSP-12.
BIC-14	Absorb responsive source journey work into RSP-02, RSP-03, and RSP-13.
BIC-15	Split among RSP-04, RSP-08, and RSP-11.
BIC-16	Split among RSP-03, RSP-08, RSP-09, and RSP-13.
BIC-17	Absorb into the shared controller/transport and responsive-overlay work, RSP-08 and RSP-13.
BIC-18	Reuse runtime performance probes in RSP-14.
BIC-19	Reuse frontend performance/accessibility/bundle probes in RSP-14.
BIC-20	Reuse evidence-only closeout discipline in RSP-15; supersede the 20/20 dependency requirement.
6.4 Revert decision

No immediate source or product-code revert is required because the tracked v10 diff does not modify the identified runtime product files.

Do not revert:

Threshold protocol improvements.

Validator improvements.

Flow inventory work.

Provenance files.

Prior review/repair matrices.

When authorized, atomically replace the active creation packet and affected flow ownership/status mappings with the 15-issue responsive graph. No Linear mutation is authorized by this review.

7. Implementation gate

Work may not begin yet.

Reasons:

The user brief explicitly withholds implementation and Linear authorization.

The current active draft has 20 issues rather than an approved graph of 15 or fewer.

The canonical state, capability, event, revision-binding, and persistence contracts are not yet represented in the repository’s validator-backed artifacts.

The current flow report contains zero covered transition claims.

The present event protocol and playback ownership cannot satisfy the proposed responsiveness and reconnect contracts.

Full executable validation requires the repository-supported frontend dependencies and Go 1.26.3 toolchain.

After the owner accepts this replacement graph, the only first dependency-unblocked issue is RSP-01 — Freeze the responsive lifecycle and validation contract.

RSP-01 is documentation, schema, validator, negative-fixture, and baseline-evidence work. It authorizes neither product implementation nor Linear creation by itself.
