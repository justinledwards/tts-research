# ChatGPT Reader-First release Peer response v2

- Conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a515ff1-fb90-83eb-8ff4-666dfdb0023b`
- Reviewed archive: `tts-research-rfa-owner-peer-v2-20260710T214343Z.zip`
- Archive SHA-256: `56d90061956073ef3ef010b9ede25c84bce395da5b868cfea9307130f0336ae7`
- Independent verdict: `REQUEST_CHANGES`
- Linear creation permitted: `NO`
- Product implementation permitted: `NO`

## Exact assistant response

PEER REQUEST_CHANGES TTS READER-FIRST RELEASE V2

Reviewed archive

Archive: tts-research-rfa-owner-peer-v2-20260710T214343Z.zip

Supplied SHA-256: 56d90061956073ef3ef010b9ede25c84bce395da5b868cfea9307130f0336ae7

Independently computed SHA-256: 56d90061956073ef3ef010b9ede25c84bce395da5b868cfea9307130f0336ae7 — MATCH

Archive size: 23,231,752 bytes — MATCH

ZIP integrity: PASS

Recorded review head: e97ff6f4932f4429939f1c278e1d4b8361ac6688

_review/file-list.txt: 1,343 unique source entries, exactly matching the extracted source inventory.

Contract, packet, generated Markdown, scan fixture, validator, and validator-test hashes all match the supplied values.

Archived validator: PASS

Archived adversarial validator tests: 15/15 PASS

PDF adapter rerun: 10 PASS, 1 optional OCRmyPDF smoke skipped

The complete 135-test script suite could not be independently reproduced from the sealed archive because installed Node dependencies such as jszip and ajv were not included. This does not contradict the supplied pre-seal result and is not the reason for this verdict.

No repository, Linear, or product mutation was performed.

The canonical architecture is substantially repaired. The remaining blockers are in the implementation packet, acceptance semantics, dependency ordering, and final evidence gate. Several issue assertions are weaker than or contradictory to the canonical contract, and two final-gate assertions are bound to a static architecture validator that cannot prove the claimed product behavior.

Round 1 blocker closure matrix
#	Result	Exact current evidence	Adjudication
1. Validator rejects title/dependency/scope/non-goal/command/evidence/acceptance/observability/rollback/budget weakening and binds canonical hashes	PASS	scripts/validate-reader-first-release.mjs: exact dependency maps, budget allocations, legacy-removal owners, contract/packet canonical hashes, Markdown hash, evidence hashes, and fail-closed authorization checks. scripts/validate-reader-first-release.test.mjs: tests at lines 91–129 cover DAG, issue execution schema, acceptance bindings, observability/rollback/budgets, pure RFA-20, and random canonical mutation. Independent run: 15/15 pass. Additional mutations of title, dependency, scope, non-goal, command, evidence, acceptance, observability, rollback, budget, contract, and packet were rejected.	The requested mutation classes are now sealed. This does not establish that the currently sealed acceptance text is internally correct; several semantic packet defects below are now faithfully hash-bound.
2. Snapshot v0/v1 migration, browser-state precedence/retirement, and revision-conflict behavior	PASS	docs/architecture/reader-first-release-contract-v2.json /serverAuthority: snapshotSchemaVersion, exact v0/v1 read policies, server-derived compatibility facts, conditional v1 writeback, explicit incompatible-snapshot behavior, one-time browser import only when no server snapshot exists, serverSnapshotAlwaysWins, retirement evidence path, and stale-revision rejection with current snapshot and retry token. RFA-02-AC01 through RFA-02-AC04 cover clean restore, migration, server selection, and revision/ETag rejection.	The restoration architecture closes the prior schema, precedence, and conflict gaps. A separate scope defect in who removes browser-authoritative writes remains below.
3. Nominal segment-request concurrency is 2–4 with enumerated constrained exceptions	PASS	Contract /mediaContract/nominalConcurrentSegmentRequests:[2,4], /maxConcurrentSegmentRequests:4, and /constrainedConcurrencyException with minimum 1 only for saveData, effectiveType_2g, sub-2 GB memory, or one remaining segment; reason code required and maximum may not be exceeded. Mutation tests reject [1,4] and maximum 5.	The architectural request envelope is now unambiguous and fail-closed.
4. Existing completed artifacts are durably backfilled and valid artifacts cannot regress to artifact_missing	FAIL	Contract /mediaContract/durableArtifactMigration is correct: startup and pre-read scanning, checksum/length/header/compatibility verification, copy–fsync–atomic rename–metadata commit, and validArtifactMayBecomeArtifactMissing:false. However, RFA-06-AC02 is asserted as “Final assembly failure cannot invalidate committed compatible segments” while invoking the completed-artifact-backfill case; it never asserts discovery, promotion, atomic metadata conversion, or post-reboot playability of an existing completed artifact. RFA-19-AC03 says a host reboot “preserves durable audio or returns explicit artifact_missing,” without limiting the latter to genuinely absent or corrupt bytes.	The contract is repaired, but issue acceptance can close without proving the required backfill and still permits an overbroad missing-artifact outcome.
5. Manifest-capable Reader cannot fall back to full audio; legacy/export capability, 200/206/416 semantics, and gapless profiles are explicit	FAIL	Contract /mediaContract/manifestCapableReaderMayFallbackToFullAudio:false, /finalAudioRoutePolicy, and /compressedDeliveryProfiles correctly define explicit export or negotiated legacy callers, full 200, satisfiable 206, unsatisfiable 416, Accept-Ranges, Content-Range, fMP4/AAC, and WebM/Opus. RFA-09-AC04, however, says “legacy full audio is export-only,” contradicting the contract’s allowed legacy_client_without_manifest_capability. RFA-09-AC02 says only “correct range semantics or export-only,” and RFA-09-AC04 names only 206, not the required 200, 416, Content-Range, and capability branches.	The architecture is correct, but the issue can be implemented to a narrower and contradictory behavior.
6. Consumed timing watermark freezes identity, ordering, both timing directions, replacement, and deletion	FAIL	Contract /timingContract/consumedCueWatermark and /consumedCueImmutability correctly freeze cue ID, word identity, ordering, start, end, segment, and locator and prohibit deletion, reorder, replacement, forward movement, and backward movement. Later revisions apply only after the watermark. Mutation tests cover all five prohibited mutations. RFA-15-AC03, however, asserts only that played cues “never move backward.”	The canonical rule is repaired, but the implementation issue does not require evidence for forward movement, replacement, deletion, identity change, ordering change, or boundary mutation.
7. Real raster scan evidence, expected overlay/confidence, reviewRequired Reader behavior, and reviewed resolution transition	FAIL	The scan evidence itself is genuine and hash-bound. fixtures/pdf/scanned_fixture.pdf is 84,284 bytes, raster-only, one A4 page, and contains one 1937×2740 grayscale image. pdftotext yields no text layer. The archived OCR command reproduced fixtures/pdf/scanned_fixture.ocr.txt exactly. fixtures/pdf/scanned_fixture.expected-overlay.json contains low-confidence part/chapter headings, reviewRequired, disabled unresolved auto-narration, and a new audited overlay revision on resolution. Contract /structureContract/ocrReviewRequiredPolicy is correct. But RFA-04 has no acceptance assertion that unresolved Reader narration pauses at the boundary or that reviewed resolution creates the required new audited overlay revision; its OCR command emits text but does not compare the transcript or expected overlay. The future speech-plan verification script is also absent and not owned in RFA-05 scope.	Evidence and contract pass; executable issue acceptance for the Reader behavior and transition remains incomplete.
8. System critical requires fresh backend-owned enumerated evidence; frontend inference and domain-local escalation are prohibited	FAIL	Contract /healthContract correctly requires backend-only evidence, allowed reason codes, required evidence fields, 30-second maximum age, unknown-not-critical expiry, backend clearing, and domain-local blockers. Mutation tests reject frontend inference, stale evidence, and reason-code weakening. RFA-17-AC03 names the permitted critical categories and domain-local behavior, and its non-goals prohibit frontend inference. It does not accept or test the required evidence fields, freshness/expiry transition, backend-only clearing, or rejection of an otherwise allowed but stale reason.	The health architecture is repaired, but the issue can close without proving the authority and freshness rules that distinguish explicit evidence from inference.
9. Audit summaries and exact Linear QQP/TTS-Research 0/20 paginated provenance are archive-contained and hash-bound	PASS	All three files under docs/reviews/reader-first-audits/ are present and match the hashes in /auditEvidence/reviews. docs/project-management/linear/tts-research-reader-first-linear-provenance.json is present and hash-bound as 9847d3326468cb9e0743d75533df9260aa123f8273cf645734df696f56c92009; it records team QQP, project TTS-Research, zero active unarchived issues, cap 20, one page read, and hasNextPage:false. Contract, packet, and validator bind the exact team/project IDs and provenance hash.	Archive provenance is now independently reviewable. It remains historical read-only evidence, not authorization or a substitute for the parent’s fresh live check immediately before mutation.
Issue-schema and atomicity verdict

Formal issue-schema closure: PASS.

Every issue now has:

One named accountable owner surface.

Repository-relative paths and symbols.

Explicit non-goals.

Structured acceptance probes.

Verification commands and evidence paths.

Named issue events.

A rollback object.

Allocated performance budgets.

Fail-closed authorization fields.

The packet remains exactly RFA-01 through RFA-20. The declared graph is acyclic, every declared dependency precedes its dependent, RFA-01 is the only structural root, and RFA-20 transitively depends on all other issues.

Substantive atomicity and implementability: FAIL.

Semantic DAG defect

RFA-19 does not depend on RFA-18, but:

RFA-19-AC02 invokes run-reader-first-performance-gate.

RFA-19 owns mainThreadLongTasks, initial-workspace bootstrap/bytes, request, buffer, waveform, and related performance budgets.

Those app-shell and long-task corrections are implemented by RFA-18.

The declared DAG therefore allows RFA-19 to become graph-unblocked while one of its acceptance-producing implementation slices remains unfinished. Structural acyclicity passes; dependency completeness does not.

Verification-harness ownership defect

The packet references the following scripts, none of which exists in the sealed archive:

scripts/e2e-reader-first-continuity.mjs

scripts/e2e-reader-first-journey.mjs

scripts/e2e-reader-first-media.mjs

scripts/measure-reader-first-bootstrap.mjs

scripts/run-reader-first-performance-gate.mjs

scripts/run-reader-first-release-gate.mjs

scripts/verify-reader-first-speech-plan.mjs

scripts/verify-reader-first-timing.mjs

It is reasonable for an implementation issue to create its own verification harness, but the exact script path must then be owned by that issue. Most issues invoking these commands do not include the script in inScope.paths. The broad scripts scope in RFA-19 cannot own a continuity harness required to close RFA-02, RFA-06, RFA-10, RFA-11, and RFA-12 before RFA-19 begins.

Accountable-scope defect in RFA-02

RFA-02/legacyRemovalOwned requires removal of browser-authoritative workspace writes, but RFA-02/inScope.paths contains only:

backend/internal/httpapi

packages/schema

backend/data

The current browser-side authority and local-state write paths are frontend concerns. RFA-11 owns regular ingress dependency removal, but not all browser-authoritative writes. The deletion owner therefore lacks the path scope needed to perform its declared responsibility.

RFA-02, RFA-09, RFA-17, and RFA-18
Issue	Verdict	Finding
RFA-02	FAIL	Backend snapshot work is bounded, but the browser-authority removal it owns is outside its declared path scope.
RFA-09	FAIL	Scope is bounded, but acceptance contradicts the canonical legacy-client policy and omits explicit full/range failure semantics.
RFA-17	FAIL	Paths and owner are bounded, but acceptance does not prove fresh backend evidence, expiry, or backend-only clearing.
RFA-18	PASS in isolation	Its app-shell/lazy-loading boundary and performance probes are independently implementable after its listed dependencies. The packet defect is that RFA-19 consumes its outcomes without depending on it.
Legacy-removal ownership

The metadata assigns removals only to RFA-02, RFA-11, RFA-13, RFA-16, and RFA-18, and the validator rejects owner-list drift. This is structurally correct.

Execution is not complete because the RFA-02 browser-write removal is outside its declared scope. RFA-11, RFA-13, RFA-16, and RFA-18 have credible repository surfaces for their declared removals.

RFA-20 purity

RFA-20 now correctly owns no product implementation and no legacy deletion. Its title, objective, non-goals, and legacyRemovalOwned:[] are repaired.

Its acceptance execution remains invalid:

RFA-20-AC02 claims that all browser, storage, range, timing, recovery, accessibility, and performance gates pass, but runs only node scripts/validate-reader-first-release.mjs.

RFA-20-AC04 claims production scanned/noisy structure proof, but also runs only the static architecture validator.

That validator validates contracts, hashes, packet shape, and fixture bindings. It does not run the browser, storage, media, timing, OCR implementation, accessibility, or performance gates. These probes can therefore report claimed integrated success without executing the claimed evidence.

Observability and rollback

The issue objects now have issue-prefixed lifecycle events and rollback records, but all issues use essentially the same three lifecycle events, the same required fields, and the same rollback strategy.

This is insufficient for the stateful changes under review. For example:

RFA-06 does not require artifact source root, destination, checksum result, metadata revision, or promotion phase.

RFA-09 does not require caller capability, selected route, response status, range, or codec profile.

RFA-15 does not require watermark and old/new timing revision.

RFA-17 does not require reason code, evidence timestamps, expiry, source subsystem, or clear condition.

RFA-02 has no rollback distinction between disabling new v1 writes, reading v1 snapshots, and re-enabling browser authority—which must never occur.

The current schema proves that an observability and rollback object exists, but not that it can diagnose or safely reverse the issue’s actual state transition.

Artifact verdicts
Canonical contract

PASS.

docs/architecture/reader-first-release-contract-v2.json now contains a coherent reader-first architecture satisfying the six owner requirements:

Server-authoritative, revision-guarded restoration.

Progressive immutable media and timing.

Structured speech units and honest OCR review.

One append-capable playback owner.

Explicit artifact compatibility and backend health evidence.

Bounded browser and server resource behavior.

The contract also remains correctly fail-closed:

ownerAccepted:true

peerApproved:false

linearCreationAuthorized:false

productImplementationAuthorized:false

authorizedIssues:[]

Canonical Linear packet

FAIL.

docs/project-management/linear/tts-research-reader-first-release-batch-draft.json is much stronger than Round 1, but is not yet sufficient for creation because of:

Acceptance text weaker than or contradictory to the contract.

An incomplete semantic dependency graph.

Unowned verification-harness creation.

A browser-authority removal outside the responsible issue’s scope.

Generic rather than state-specific rollback and observability.

Final integrated assertions bound to the wrong command.

Generated Markdown

Parity PASS; authorization suitability FAIL.

docs/project-management/linear/tts-research-reader-first-release-batch-draft.md exactly matches validator generation and its supplied SHA-256. It faithfully reproduces the canonical packet, including the packet defects above.

Validator and mutation tests

Integrity and drift protection PASS; execution-sufficiency FAIL.

The validator is materially improved and the 15 mutation tests pass. Canonical hashes ensure that the reviewed object cannot be weakened without updating the validator.

However:

repoPaths() checks only that a path is nonempty, relative, and contains no ..; it does not verify that a current path exists or that a future path is assigned to the issue creating it.

It validates exact dependency arrays, not whether acceptance and budgets introduce a missing semantic dependency.

It validates acceptance-command membership, not whether the command can prove the assertion.

It validates issue-prefixed event names, not issue-specific operational facts.

It does not detect contradictions between contract behavior and issue acceptance such as RFA-09-AC04.

It accepts RFA-20-AC02 and RFA-20-AC04 even though the bound static validator cannot produce the claimed runtime evidence.

Evidence and provenance

PASS.

The three audits, Round 1 response, repair matrix, provenance record, raster PDF, OCR transcript, and expected overlay are present and hash-bound. The scanned fixture was independently rendered and inspected without a visible defect, and the specified OCR command reproduced the committed transcript.

Blocking findings and minimum corrections
1. Completed-artifact backfill is not an explicit issue acceptance condition

Exact locations

Packet RFA-06-AC02

Packet RFA-19-AC03

Contract /mediaContract/durableArtifactMigration

Minimum correction

Rewrite or add a RFA-06 probe that explicitly requires:

Discovery of an existing completed artifact under every enumerated legacy root.

Checksum, length, decodable-header, and compatibility verification.

Copy, fsync, atomic rename, and revision-guarded metadata commit.

Idempotent interruption recovery.

Post-restart and post-host-reboot playback from the durable object.

Proof that a valid candidate never becomes artifact_missing.

Qualify RFA-19-AC03 so artifact_missing is permitted only when verification proves that no valid compatible artifact exists.

2. RFA-09 contradicts the canonical legacy-client policy and does not explicitly prove range semantics

Exact locations

Contract /mediaContract/finalAudioRoutePolicy/allowedCallers

Packet RFA-09-AC02

Packet RFA-09-AC04

Minimum correction

Replace the “export-only” assertion with the exact contract rule:

Manifest-capable Reader: compressed immutable segments only; no full-audio fallback.

Full audio: explicit export or negotiated legacy client lacking manifest capability.

Full request: 200.

Satisfiable byte range: 206 plus correct Content-Range.

Unsatisfiable range: 416 plus correct unsatisfied Content-Range.

Accept-Ranges: bytes.

Gapless fMP4/AAC evidence on Safari/iOS WebKit and WebM/Opus evidence on Chromium/Firefox.

Route-selection evidence proving normal Reader playback did not select full audio.

3. RFA-15 does not accept the complete consumed-cue immutability rule

Exact locations

Contract /timingContract/consumedCueImmutability

Packet RFA-15-AC03

Minimum correction

Make the acceptance assertion enumerate and test:

No cue-ID or word-identity change.

No reorder.

No replacement.

No deletion.

No start or end movement in either direction.

No segment or locator reassignment.

Later timing revisions affect only cues strictly after the persisted consumed watermark.

Conflicts preserve the consumed revision and emit timing-conflict evidence.

4. OCR review behavior and resolution are not bound to an executable acceptance comparison

Exact locations

Contract /structureContract/ocrReviewRequiredPolicy

fixtures/pdf/scanned_fixture.expected-overlay.json

Packet RFA-04-AC02 through RFA-04-AC04

Packet RFA-05 verification script reference

Minimum correction

Add an acceptance command that compares:

Rendered scan properties and fixture hash.

OCR output against scanned_fixture.ocr.txt.

Produced overlay against the reviewed expected overlay.

Automatic narration refusal and boundary pause for unresolved nodes.

Reviewed resolution producing a new overlay revision with all required audit fields.

Assign the exact comparison/verification script path to the issue that creates it.

5. RFA-17 does not explicitly prove backend evidence freshness and clearing

Exact locations

Contract /healthContract/backendEvidenceSchema

Packet RFA-17-AC03

Packet RFA-17-AC04

Minimum correction

Add explicit acceptance for:

All required evidence fields.

Exact enumerated reason codes.

Backend-only authorship.

No global critical state from domain-local facts.

Expiry after 30 seconds to unknown, not critical.

Backend-owned clearing.

Frontend inability to promote stale, missing, optional-capability, stage, run, or audio facts to global critical.

6. RFA-19 has a hidden dependency on RFA-18

Exact locations

Packet RFA-19/dependencies

Packet RFA-19-AC02

Packet RFA-19/performanceBudgetIds

Packet RFA-18-AC02 and RFA-18/performanceBudgetIds

Minimum correction

Either:

Add RFA-18 to RFA-19/dependencies; or

Remove all RFA-18-owned app-shell and long-task budgets from RFA-19 and leave their integrated adjudication to RFA-20.

The first option is the clearer dependency model and preserves the 20-issue count.

7. Verification-harness creation is unowned

Exact locations

Packet /issues/*/verificationCommands

Packet /issues/*/inScope.paths

Minimum correction

Assign each future script to the earliest issue that creates it, with that exact path in inScope.paths. Later issues may depend on and reuse it. At minimum:

Continuity harness: an issue no later than RFA-02.

Bootstrap harness: RFA-03.

Speech-plan verifier: RFA-05.

Timing verifier: RFA-07.

Media harness: RFA-09.

Journey harness: RFA-14.

Performance gate: RFA-18 or a predecessor of RFA-19.

Integrated release gate: RFA-20.

Update dependencies where a consuming issue otherwise precedes the harness owner.

8. RFA-20 uses the architecture validator as false runtime proof

Exact locations

Packet RFA-20-AC02/verificationCommand

Packet RFA-20-AC04/verificationCommand

scripts/validate-reader-first-release.mjs

Minimum correction

Bind RFA-20-AC02 and RFA-20-AC04 to the exact-byte integrated release-gate command and its immutable evidence manifest. The architecture validator may remain a prerequisite check, but it cannot be the proof command for browser, media, timing, OCR implementation, accessibility, recovery, or performance behavior.

RFA-20 should remain adjudication-only after this correction.

9. RFA-02 owns a frontend legacy removal outside its scope

Exact locations

Packet RFA-02/inScope.paths

Packet RFA-02/legacyRemovalOwned

Packet RFA-11/legacyRemovalOwned

Minimum correction

Either:

Add the exact browser-state write modules and symbols to RFA-02 scope; or

Move browser-authoritative write removal to the frontend issue that owns those modules and update the validator’s exact legacy-removal-owner mapping.

Retirement must preserve the contract rule that browser authority is never restored as rollback.

10. Rollback and telemetry are structurally present but not state-specific

Exact locations

Packet /issues/*/observabilityEvidence

Packet /issues/*/rollbackBoundary

Validator issue checks around the observability and rollback invariants

Minimum correction

Give each stateful issue domain-specific evidence fields and rollback states. At minimum, cover snapshot schema/read-write mode, artifact promotion phase and revision, selected media route and capability, request-window reason, consumed timing watermark and revisions, playback owner identity, and health evidence reason/freshness/clear condition.

RFA-20, as an evidence-only issue, should not use a rollback strategy describing disabling a new write or owner path. Its rollback should invalidate or supersede the verdict/evidence manifest without changing product state.

Non-blocking recommendations

Update docs/plans/2026-07-10-reader-first-release-reset.md:131, which still says RFA-20 removes legacy ownership. The canonical packet correctly makes it adjudication-only, but the retained plan statement is misleading.

Record exact pdftoppm, Tesseract, browser, codec, operating-system, and hardware versions in generated evidence so scan and performance results are reproducible.

Replace broad scope entries such as scripts with exact harness paths once assigned.

Add a machine-readable evidence-manifest schema requiring command, commit/archive hash, fixture hashes, profile, raw output path, result, and reviewer for every acceptance probe.

Retain the parent’s planned fresh, paginated Linear identity/capacity check immediately before any mutation; the archived 0/20 provenance must not be treated as live state.

Linear creation permitted: NO

Product implementation permitted after Linear creation and explicit parent authorization: NO

Initially graph-unblocked issue IDs: RFA-01
