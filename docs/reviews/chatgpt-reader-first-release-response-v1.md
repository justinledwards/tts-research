# ChatGPT Reader-First Release architecture response v1

- Verdict: `PEER REQUEST_CHANGES TTS READER-FIRST RELEASE`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a515ff1-fb90-83eb-8ff4-666dfdb0023b
- Reviewed archive: `tts-research-rfa-owner-peer-20260710T204913Z.zip`
- Archive SHA-256: `fe58ff6e1d0615bc6161e1dcc76109edd970388f08c521afa0dbc0957995d3fe`
- Model/effort: `GPT-5.6 Sol` / `Pro`
- Linear creation permitted: `NO`
- Product implementation permitted: `NO`

## Exact peer response

PEER REQUEST_CHANGES TTS READER-FIRST RELEASE

Reviewed archive filename and supplied SHA-256

Archive: tts-research-rfa-owner-peer-20260710T204913Z.zip

Supplied SHA-256: fe58ff6e1d0615bc6161e1dcc76109edd970388f08c521afa0dbc0957995d3fe

Independently computed SHA-256: fe58ff6e1d0615bc6161e1dcc76109edd970388f08c521afa0dbc0957995d3fe — MATCH

Size: 23,026,005 bytes — MATCH

ZIP integrity: PASS

Inventory closure: 1,335 repository source files plus three _review metadata files; the file-list manifest has no missing or extra source paths.

Recorded baseline HEAD: e97ff6f4932f4429939f1c278e1d4b8361ac6688

Dirty-worktree metadata records 12 modified tracked paths. No repository or Linear mutation was performed.

Executive rationale

The architecture has the correct reader-first direction, and all four externally identified audit deltas are materially present in both the canonical contract and issue acceptance. The baseline validator passes, all 11 supplied validator tests pass, the canonical JSON and generated Markdown are synchronized, and the 20-node dependency graph is acyclic with the intended single root and single final gate.

Approval is nevertheless blocked.

The fail-closed validator protects selected headline booleans but does not protect many of the semantic requirements that make those booleans truthful. Plausible mutations removing essential restoration fields, bounded-delivery properties, trusted-timing gates, playback ownership details, health-evidence separation, issue acceptance, rollback content, audit provenance, and target Linear identity still validate successfully.

The Linear packet is also not evidence-complete or sufficiently atomic. It contains no accountable owner mapping, implementation scope or symbol boundaries, executable verification commands, expected evidence artifacts, or issue-specific rollback procedures. Performance budgets are concentrated on RFA-01 and RFA-20 rather than attached to the implementation slices that can violate them. Durable-storage migration, legacy /audio capability isolation, already-played timing immutability, scanned-PDF review behavior, and explicit backend authority for System critical remain substantively underspecified. RFA-20 combines final proof with destructive legacy removal and is therefore not an atomic final gate.

Owner acceptance remains correctly represented as distinct from peer approval, Linear-creation authorization, and implementation authorization. The current packet must remain fail-closed.

Six-requirement PASS/FAIL matrix with exact archive evidence
#	Result	Exact archive evidence	Peer finding
1. Durable clean-browser restoration through server authority, revision-guarded mutation, no localStorage authority	FAIL	docs/architecture/reader-first-release-contract-v2.json:63-89, especially /serverAuthority/snapshotFields, /browserStorageIsDisposableCache, /missingBrowserStorageMustNotBreakRestore, /revisionPreconditionRequired, and /serverChoosesCompatibleRun; RFA-02, RFA-11, RFA-12, and RFA-19 in docs/project-management/linear/tts-research-reader-first-release-batch-draft.json.	The target model is present, but completion proof is incomplete. No snapshot schema-version migration, existing local-state import/retirement procedure, or explicit compatibility behavior for older server snapshots is accepted. The validator permits removal of projectRevision, sourceId, runCompatibilityKey, syncFidelity, playback rate, follow preference, and updatedAt, and even permits restoreAutoplay:true. Those mutations materially weaken clean-browser restoration while still validating.
2. Immediate Book Reading from progressive immutable media/timing manifests	PASS	Contract /timing at lines 123-149, /media at lines 151-170, and /playback at lines 172-181; RFA-06, RFA-07, RFA-08, RFA-09, RFA-10, RFA-13, RFA-14, and RFA-15. The contract requires immutable segments, a 4–8 second first segment, a 12-second hard maximum, independent timing publication, and no dependency on final assembly.	The canonical design and issue sequence support progressive start without whole-book completion. Approval is still conditioned on closing the legacy /audio selection and validator-enforcement blockers below.
3. Structure-preserving narration, isolated headings, honest OCR/review-required behavior	FAIL	Contract /structure at lines 90-121 includes semantic roles, isolated headings, zones, dispositions speak, skip, onDemand, and reviewRequired, revision binding, and a real scanned-PDF/OCR requirement; RFA-04 and RFA-05.	The representation primitives are present, but the behavioral invariant is incomplete. The packet does not bind low-confidence or conflicting OCR to reviewRequired, does not prohibit the planner from narrating such units before explicit resolution, and does not define the review transition. The archive’s existing fixtures/pdf/scanned_fixture.pdf is a 98-byte synthetic placeholder containing marker text, not credible real scanned-page evidence. No exact replacement fixture, hash, expected overlay, or confidence outcome is specified.
4. Remove Narration Preview Player ownership and enforce one playback owner	PASS	Contract /playback/owner, /maxPlaybackControllers, /maxAudioElementOwners, and /narrationModePreviewPlayer:false at lines 172-181; RFA-13 and RFA-16. Existing ownership debt is visible in frontend/src/features/playback/playbackOwner.ts, which still defines cinema, preview, and teleprompt primary owners.	The intended single-owner end state is explicit, and the packet includes both controller consolidation and Preview Player removal. The implementation issue still needs exact lifecycle and verification evidence, but the architectural ownership decision itself is unambiguous.
5. Preserve valid completed audio; separate run/stage blockers from explicit system health	FAIL	Contract /health at lines 183-203 defines independent run/media/compatibility/fidelity/provider/system facts, forbids stage blockers from becoming global critical, provides a systemCritical allowlist, and introduces artifact_missing; RFA-17.	Separation is represented, but no authoritative backend diagnostic evidence schema is defined for asserting global System critical. Reason provenance, freshness, correlation, and clearing behavior are missing. In addition, RFA-19 accepts a reboot result that either preserves durable audio or returns artifact_missing; that is honest reporting but does not protect already-valid completed audio that currently resides in temporary storage. Existing completed artifacts require migration or reconciliation before this requirement is met.
6. Bounded long-form browser operation, durable promotion, 2–4 concurrency, ≤60-second windows, cancellation, eviction, windowed timing, no full-waveform decode	FAIL	Contract /media and /playback at lines 151-181; RFA-06, RFA-09, RFA-13, RFA-15, and RFA-18. The contract has a maximum of four requests, 30–60 seconds lookahead, no more than 60 seconds behind, seek cancellation, eviction, windowed timing, and no full-waveform decode.	The upper bounds are strong, but the required 2–4 request operating range is reduced to “at most four”; no lower/nominal concurrency behavior is accepted. Several bounded-delivery fields are not validator-protected, relevant budgets are not assigned to the implementation issues, and legacy route selection is not sufficiently constrained to prevent a normal-playback fallback to monolithic /audio.
Audit-reconciliation PASS/FAIL matrix

This matrix assesses whether each identified audit delta is genuinely represented in both the architecture and issue acceptance. These representation passes do not override the implementation and validator blockers.

Required audit delta	Result	Contract evidence	Issue-acceptance evidence
Promote completed artifacts out of /dev/shm or temporary storage before completed	PASS	reader-first-release-contract-v2.json:151-170, /media/completedRequiresDurablePromotionOutOfTmpfs:true, with explicit artifact_missing behavior.	RFA-06 requires atomic promotion to durable storage before completion and forbids final assembly from blocking progressive availability.
Bounded segment fetch/buffer behavior, seek cancellation, no full-waveform decode	PASS	/media/maxConcurrentSegmentRequests:4, bounded lookahead/back-buffer windows, seek cancellation, eviction, and /noFullWaveformDecode:true; /playback also prohibits fan-out.	RFA-13 explicitly accepts no more than four in-flight requests, ≤60-second media windows, seek aborts, eviction, and no full-waveform decode.
Revision-bound structure overlays with zones, dispositions, reviewRequired, and real scanned-PDF/OCR evidence	PASS	/structure defines revision-bound overlays, front/body/back zones, narration dispositions including reviewRequired, and requires real scanned-PDF/OCR proof.	RFA-04 calls for overlay persistence, zones/dispositions, revision mismatch rejection, OCR fixtures, and review-required behavior. The exact fixture and behavior remain insufficiently specified, but the delta is not merely mentioned.
Stage/audio blockers cannot become global System critical without explicit system-health evidence	PASS	/health/stageOrAudioBlockerMaySetGlobalSystemCritical:false and the explicit systemCritical condition allowlist.	RFA-17 requires separate run/media/compatibility/fidelity/provider/system status, prevents stage/audio blockers from causing global critical, and distinguishes rebuild from artifact_missing.

One audit-evidence defect remains: reader-first-release-contract-v2.json:296-304 records three absolute /home/phoenix/.hermes/cache/delegation/... review paths. Those review reports are not contained in the archive, are not content-hashed, and are only checked by the validator for array length. The four deltas stated in the checkpoint request can be verified against the packet, but the archive cannot independently substantiate the three claimed source audits.

Contract/validator mutation-probe findings
Baseline result

node scripts/validate-reader-first-release.mjs: PASS

node --test scripts/validate-reader-first-release.test.mjs: 11/11 PASS

Canonical issue count, IDs, dependencies, graph acyclicity, and generated Markdown consistency: PASS

Baseline authorization remains fail-closed:

peerApproved:false

linearCreationAuthorized:false

productImplementationAuthorized:false

authorizedIssueIds:[]

graphUnblockedIssueIds:["RFA-01"]

Mutations correctly rejected

The validator correctly rejected direct changes to:

Audit reconciliation from true to false.

Durable promotion from true to false.

Maximum segment concurrency from four to five.

Seek cancellation from true to false.

Full-waveform decoding from false to true.

Structure-overlay mode.

Real scanned-PDF/OCR requirement.

Removal of reviewRequired.

Allowing stage blockers to set global system critical.

Issue-count drift from 20 to 19.

Removal of a canonical DAG edge.

Setting peerApproved:true.

Marking RFA-01 creation-eligible.

Material mutations incorrectly accepted

The following independently tested mutations still produced validator success:

Accepted mutation	Consequence
Packet top-level status changed to a false approved state	A misleading approval label can coexist with fail-closed booleans and pass validation.
Packet projectId and teamId replaced with incorrect values	The generated creation packet can target the wrong Linear project or team.
Three audit review paths replaced with arbitrary x, y, z values	Audit reconciliation is not bound to actual evidence.
Every issue acceptance array replaced with ["implemented"]	All substantive issue probes can disappear while the 20-issue packet remains “valid.”
All issue observability and rollback text emptied	Operational proof and reversibility are not enforced.
/performanceBudgets/releaseBlocking set false and all additionalGate clauses removed	Release-critical wrong-word, long-task, and dual-threshold requirements can disappear.
Restoration fields including projectRevision, runCompatibilityKey, and syncFidelity removed	Revision and compatibility semantics can be weakened without failure.
restoreAutoplay changed to true	Clean-browser restore can unexpectedly start playback and still validate.
PDF evidence list emptied	Structure/OCR proof requirements can lose their evidence set.
Trusted-word gates reduced to ["confidence"]	Word-level timing can be marked trusted without identity, monotonicity, coverage, or drift gates.
Independent timing publication disabled and maximum aligner input raised to 3,600 seconds	Timing can again become book-scale or terminally coupled.
Bounded segment delivery and contiguous-compatible-prefix rules disabled	Normal playback can regress toward unbounded or incompatible delivery.
Normal decoded buffer changed to 3,600–7,200 seconds	A full-book-scale browser memory path can pass validation.
Compressed target changed to monolithic_wav	The segment-first compressed delivery decision is not protected.
Playback owner changed to “Global Preview,” append disabled, terminal remount enabled, and reading made audio-dependent	The one-owner, stable-reader lifecycle can be removed while validation passes.
Health independent-fact model emptied	The system-health separation underlying System critical can disappear.
Baseline heuristic timing falsely relabeled native/trusted with confidence 1	False timing-fidelity claims are not baseline-protected.
Capacity provenance changed to an unverified textual guess	Capacity and target provenance are not machine-bound.

The central defect is in scripts/validate-reader-first-release.mjs:350-381: issue validation checks exact dependencies and only that objective and acceptance are nonempty. It does not validate acceptance semantics, titles, ownership, scope, observability, rollback, verification commands, or evidence artifacts. Lines 387-394 require all performance-budget IDs only on RFA-01 and RFA-20, allowing every implementation issue to omit the budgets it can violate.

Contract validation similarly checks selected fields rather than the complete load-bearing schema. releaseBlocking, warm-up policy, all additionalGate clauses, several media and playback invariants, exact trusted-timing gates, health evidence authority, packet target identity, audit paths, and packet status are not protected.

The supplied tests accurately test the validator’s current narrow rules; they do not establish semantic fail-closed authorization.

20-issue DAG/atomicity/acceptance findings
DAG structure

The dependency graph itself is valid:

Exactly 20 nodes, RFA-01 through RFA-20.

No missing dependency target.

No self-dependency.

No cycle.

One root: RFA-01.

One terminal integrated gate: RFA-20.

Every dependency precedes its dependent in the packet.

RFA-20 transitively depends on all prior work.

Topological levels are:

L0  RFA-01
L1  RFA-02, RFA-03, RFA-04
L2  RFA-05, RFA-11
L3  RFA-06, RFA-07
L4  RFA-08, RFA-09
L5  RFA-10
L6  RFA-12
L7  RFA-13, RFA-17
L8  RFA-14
L9  RFA-15, RFA-16
L10 RFA-18, RFA-19
L11 RFA-20

The ordering is conservative but logically coherent. No blocking dependency omission was found solely from graph reachability.

Owner mapping

FAIL. Issue objects contain:

localId

title

objective

dependencies

acceptance

generic observability

generic rollback

performanceBudgetIds

authorization/status/Linear fields

They do not contain an accountable owner or owner surface. RFA-01 says an ownership map will be created, but the Linear-creation packet being reviewed has no ownership mapping to validate. Responsibility cannot be assessed before creation.

Atomicity

FAIL.

The most material scope problems are:

RFA-18 combines large App decomposition, lazy loading, runtime ownership cleanup, and long-task performance remediation.

RFA-20 combines final evidence adjudication with deletion of legacy/localStorage, dual-player, terminal-remount, and giant-component paths. Proof and destructive cleanup have different rollback and review characteristics.

RFA-09 combines manifest schemas, segment delivery, range behavior, codec policy, final-export compatibility, and legacy route restrictions without API-version or client-capability boundaries.

RFA-17 combines health taxonomy, rebuild semantics, artifact repair, compatibility judgment, provider facts, and global system-critical behavior.

RFA-02 combines snapshot schema, mutation concurrency control, legacy run selection, and clean-browser restore without endpoint or migration boundaries.

These can remain within a 20-issue packet only if each issue gains explicit in-scope symbols, non-goals, migration boundaries, and independently executable acceptance. In the present form, they are broad epics expressed as single implementation slices.

Acceptance and evidence

FAIL.

Acceptance prose generally states desired outcomes, but the issues lack:

Exact commands or tests to run.

Required fixture paths and hashes.

Expected API request/response examples.

Expected persisted records and revisions.

Failure-injection cases.

Evidence artifact paths.

Browser/device/network profiles.

Explicit owner sign-off surfaces.

Per-issue budget ownership.

Required telemetry fields.

Issue-specific rollback state transitions.

For example, RFA-03 requires operation “within byte and latency budgets,” but it has no performanceBudgetIds, and the canonical contract contains no explicit initial snapshot byte budget or bootstrap latency budget matching that acceptance.

Rollback and observability

FAIL. Every issue reuses substantially identical generic observability and rollback prose. That does not describe how to reverse:

A persisted snapshot schema.

A source/run compatibility-key migration.

A durable artifact pointer swap.

A structure-overlay revision.

A timing revision already partially consumed by a listener.

A manifest or codec rollout.

Playback-owner replacement.

Health-classification changes.

Final integrated proof

FAIL. RFA-20 references all 13 performance budgets and broad customer proofs, but does not prescribe exact execution commands, fixture hashes, browser profiles, result formats, or immutable evidence locations. It must be a pure adjudication gate. Deleting legacy paths in the same issue can alter the system after evidence was collected and makes rollback non-atomic.

Performance, migration, compatibility, rollback, and customer-gate findings
Performance

The canonical contract has 13 release-blocking budgets and several valuable compound gates, including:

Segment timing publication p95 ≤2 seconds and ≤1.5× segment duration.

Trusted-word drift p95 ≤150 ms with zero wrong-word identity.

Zero application-caused ≥50 ms long tasks during the specified 60-second measurement.

Maximum four in-flight segment requests.

Maximum 60-second buffered media window.

However:

The packet does not define the bootstrap byte and latency budgets invoked by RFA-03.

The requested 2–4 concurrency operating range is represented only as a maximum of four.

Hardware, browser, network, cache-state, book size, codec, and measurement-start conditions are not fully bound.

Compound additionalGate clauses and releaseBlocking are not validator-enforced.

RFA-02 through RFA-19 have empty performanceBudgetIds; all budgets are assigned only to framing issue RFA-01 and final issue RFA-20.

The current implementation contains the exact browser-heavy paths the architecture seeks to remove:

frontend/src/audioWaveform.ts:42-59 fetches and decodes the complete audio object.

frontend/src/App.tsx:19194-19234 performs another full-audio waveform fetch/decode.

frontend/src/App.tsx:20858-20949 constructs requests for all ready segments, resolves them with Promise.all, decodes them, and retains them in a map.

Server-side persistence hydration also needs a cap: backend/internal/pipeline/service.go:1584-1658 loads all ready segment bytes and accumulates PCM during persisted-job hydration.

The target direction addresses these debts, but issue closure is not currently tied to enforceable resource envelopes.

Migration and durable storage

The repository currently defaults voice job data toward tmpfs:

scripts/start.sh:164-200

scripts/start.sh:746-789

VOICE_JOB_DATA_DIR is directed beneath /dev/shm.

backend/internal/pipeline/service.go:1493-1539 writes final audio under the active job data directory and then marks the job completed. RFA-06 correctly prevents that sequence for future jobs, but neither it nor RFA-19 defines:

Discovery of previously completed temporary artifacts.

Checksum verification before promotion.

Durable directory capacity preflight.

Copy/write, flush, rename, and metadata-pointer ordering.

Crash recovery between artifact commit and job-state commit.

Idempotent retry.

Preservation of the prior artifact until the new reference is committed.

Cleanup policy after successful reconciliation.

Treatment of a valid artifact whose metadata is older than the new schema.

RFA-19’s allowance to return artifact_missing after a host reboot is not sufficient where a valid completed artifact existed before the migration. artifact_missing is an honest state for genuinely unavailable media, not a substitute for a required durability migration.

Server-authoritative restoration also needs an explicit transition from any legacy localStorage-authoritative position. Simply declaring browser storage disposable does not specify whether old position data is imported once, ignored, or reconciled against newer server state.

Legacy /audio compatibility

RFA-09 states that legacy full audio is export-only and that range requests remain available, but the acceptance does not define the capability rule ensuring modern reader playback never chooses it.

Current routes in backend/internal/httpapi/voice_job_routes.go:209-263 read audio or segment bytes into memory and send them as complete response bodies. Existing frontend state also exposes an audioUrl, and existing waveform paths fetch the complete object.

Required compatibility details are absent:

Manifest and client capability/version negotiation.

A hard rule that a manifest-capable Reader never falls back to /audio.

Behavior when a manifest is temporarily incomplete but compatible segments exist.

HEAD, GET, 206, 416, ETag, If-Range, and Content-Range acceptance.

Whether final /audio assembly is generated on demand, persisted, or unavailable until explicit export.

Codec/container compatibility across target browsers.

Telemetry proving normal playback did not select a monolithic route.

Deprecation and rollback behavior for older clients.

Without those controls, “legacy compatibility” can silently reintroduce monolithic normal delivery.

Timing fidelity and already-played history

The contract correctly orders fidelity as native timing, forced segment alignment, phrase heuristic, then none, and states that heuristic timing is not trusted. RFA-15 also requires the renderer to consume authoritative fidelity rather than infer trust.

The played-history invariant is too weak. /timing/playedCuesMayMoveBackward:false and RFA-15’s “never move backward” wording prohibit only a backward movement. They do not prohibit:

Moving an already-played cue forward.

Changing its word or unit identity.

Changing its end time.

Reordering it against another played cue.

Deleting it.

Replacing it under a new timing revision.

A playback watermark or revision epoch is needed so every cue at or before the consumed watermark is immutable in identity, ordering, start, end, and disposition. New timing may refine only the unplayed future window.

Rollback

Generic feature-flag language is insufficient for persistent and compatibility-bearing changes. Rollback must distinguish:

Disabling new writes while retaining readable new-schema data.

Dual-read/dual-write periods.

Reverting artifact metadata without deleting the promoted object.

Reverting client route selection without returning to monolithic normal playback.

Retaining overlay and timing revisions referenced by active sessions.

Reclassifying health without masking a real backend incident.

No issue currently proves backward readability or rollback idempotency.

Customer gate

The contract correctly says missing budget results fail closed. The customer journey includes clean-browser restoration, progressive listening, structure, bounded resources, reconnect, retry, repair, and compatibility.

The gate is not yet reproducible because RFA-20 lacks an exact evidence manifest tying every requirement and budget to:

A command.

A fixture and content hash.

A browser/device/network profile.

A run identifier.

Raw measurement output.

Pass/fail adjudication.

A retained artifact path.

A responsible reviewer.

Final proof must be collected after all implementation and compatibility changes and must not share a transaction with deletion of the paths being compared.

Blocking findings

Semantic fail-closed validation is incomplete.
Exact location: scripts/validate-reader-first-release.mjs:101-395, especially issue checks at lines 350-394; scripts/validate-reader-first-release.test.mjs.
Minimum correction: Validate all load-bearing contract fields, compound budget gates, packet target identity, packet status, exact audit references, and structured issue acceptance. Add mutation tests for every incorrectly accepted mutation listed above. Issue acceptance should use stable requirement/probe IDs or structured objects rather than arbitrary nonempty strings.

The issue packet has no accountable owner or implementation boundary.
Exact location: docs/project-management/linear/tts-research-reader-first-release-batch-draft.json, /issues/*; RFA-01 objective refers to an ownership map that is absent.
Minimum correction: Add and validate, for every issue, an accountable owner surface, in-scope paths/symbols, explicit non-goals, dependencies, verification commands, expected evidence artifacts, issue-specific observability, and state-aware rollback.

Performance requirements are not allocated or fully measurable.
Exact location: Contract /performanceBudgets; packet RFA-03, RFA-06, RFA-08, RFA-09, RFA-13, RFA-15, RFA-18, and /issues/*/performanceBudgetIds.
Minimum correction: Add explicit bootstrap byte and latency budgets, define nominal 2–4 segment-request concurrency with documented constrained exceptions, bind device/network/cache profiles, and assign each budget to the implementation issue capable of violating it. Enforce those assignments in the validator.

Existing completed-artifact migration is missing.
Exact location: RFA-06, RFA-19; scripts/start.sh:164-200,746-789; backend/internal/pipeline/service.go:1493-1539.
Minimum correction: Specify and accept an idempotent backfill/reconciliation flow: discover existing completed artifacts, copy to durable storage, flush and checksum, atomically commit the durable reference and schema revision, preserve the old artifact until commit, recover after interruption, and clean up only after verification. A valid available artifact may not become artifact_missing merely because the storage architecture changed.

Legacy /audio compatibility can still become a monolithic normal-playback fallback.
Exact location: RFA-09; contract /media/finalRouteSupportsByteRanges; backend/internal/httpapi/voice_job_routes.go:209-263; existing audioUrl and waveform consumers.
Minimum correction: Define manifest/client capability negotiation and require that every manifest-capable Reader uses compressed segments only. Add explicit no-fallback tests and complete range/cache-validator semantics. Restrict /audio to legacy-client or explicit export flows and emit route-selection telemetry.

Already-played timing history is not frozen.
Exact location: Contract /timing/playedCuesMayMoveBackward:false; RFA-15.
Minimum correction: Define a consumed-cue watermark or playback epoch. For cues at or before it, freeze identity, order, start, end, disposition, and existence. Permit revisions only in the future/unplayed timing window, with tests for forward movement, replacement, deletion, and reorder—not only backward movement.

OCR reviewRequired behavior and real scan evidence are incomplete.
Exact location: Contract /structure; RFA-04, RFA-05; fixtures/pdf/scanned_fixture.pdf.
Minimum correction: Add a genuine scanned-page fixture with a committed hash and expected OCR/overlay result. Define confidence/conflict rules that produce reviewRequired, prohibit automatic narration of unresolved units, specify the explicit resolution transition, and revision-guard that transition.

System critical lacks a defined authoritative evidence contract.
Exact location: Contract /health; RFA-17; current broad inference behavior in frontend/src/features/status-strip/model.ts:325-329.
Minimum correction: Define backend-owned system-health evidence with enumerated reason code, source subsystem, observed timestamp, freshness/expiry rule, correlation identifier, and clearing semantics. Require the frontend to render that authority without promoting run, stage, audio, compatibility, or provider facts to global critical.

Audit and Linear-target provenance are not fail-closed.
Exact location: Contract /auditEvidence/reviews at lines 296-304; packet /projectId, /teamId, /capacitySnapshot, and /status; validator target/provenance checks.
Minimum correction: Include the reconciled audit summaries or immutable digest artifacts in the archive with hashes; validate exact paths and hashes. Bind the packet to the recorded Linear provenance manifest and target IDs. Require a fresh read-only capacity/identity check immediately before creation rather than trusting free-form checkedVia text.

RFA-20 is not an atomic final gate.
Exact location: RFA-20 acceptance and objective.
Minimum correction: Make RFA-20 evidence collection and adjudication only. Move deletion of localStorage authority, dual-player paths, terminal-remount paths, and giant-component legacy paths into their owning implementation issues after replacement parity is proven. This correction can preserve the 20-issue count.

Non-blocking recommendations

Add dedicated package commands such as validate:reader-first-release and test:reader-first-release so the release gate is not dependent on knowledge of the broader script-test glob.

Add a server-memory budget and acceptance probe for persisted-job hydration; backend/internal/pipeline/service.go:1584-1658 currently accumulates all ready audio and can become a long-book server-memory analogue of the browser problem.

Make forced-alignment implementation capability-based rather than coupling architecture correctness to one named model. Model identity, download policy, resource envelope, and fallback behavior can remain an implementation profile.

Generate the Markdown packet from the canonical JSON with a visible canonical-content hash and include ownership, budgets, rollback, and evidence fields in the rendered Linear descriptions.

Record route-selection, buffer-window, request-concurrency, timing-fidelity, overlay-revision, and system-health reason facts in the final evidence manifest so customer-gate failures are diagnosable rather than binary.

RFA-01 is the sole graph-unblocked node, but the contract’s authorizedIssueIds is empty. Graph reachability does not constitute permission to create or implement it.

Linear creation permitted: NO

Product implementation permitted after Linear creation and parent authorization: NO
***
Exact initially unblocked issue IDs: RFA-01

