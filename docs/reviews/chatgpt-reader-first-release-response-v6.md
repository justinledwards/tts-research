PEER REQUEST_CHANGES

Verdict binding and archive verification

This verdict is bound exclusively to tts-research-reader-first-peer-review-v6.zip, SHA-256:

16ac941dd6e1117a7c7989823647b16c364e3b21a8b7858d1fd4793a6f9add8d

Independent archive checks:

Computed SHA-256: MATCH

ZIP integrity: PASS

ZIP entries: 1,355

Source entries in _review/file-list.txt: 1,352

Manifest-to-archive source closure: PASS

_review/git-status.txt and _review/git-diff.patch path parity: PASS

Reverse patch applicability: PASS

node scripts/validate-reader-first-release.mjs: PASS

Adversarial validator tests: 18/18 PASS

PDF adapter tests: 10 PASS, 1 optional OCRmyPDF test skipped

Raster-only scanned fixture and committed OCR transcript reproduction: PASS

The full pnpm and Go suites were not independently rerunnable in this offline runner because the pinned pnpm and requested Go toolchain were not locally cached. That environment limitation is not the basis for this verdict. The v5 archive and its interrupted review were not used as authorization evidence.

V6 correction adjudication
PASS — Durable-artifact and browser-retirement evidence ownership

The contract and packet now agree on ownership:

docs/architecture/reader-first-release-contract-v2.json#/mediaContract/durableArtifactMigration/backfillEvidencePath
→ docs/evidence/reader-first/RFA-06/completed-artifact-backfill.json

RFA-06-AC02 owns and produces that evidence.

docs/architecture/reader-first-release-contract-v2.json#/serverAuthority/legacyBrowserStateTransition/retirementEvidencePath
→ docs/evidence/reader-first/RFA-11/legacy-browser-import-removal.json

RFA-11-AC03 owns and produces that evidence.

PASS — Sustained request-concurrency parity

The contract and RFA-13-AC03 now consistently require nominal sustained concurrency of 2–4 requests, with exactly these constrained exceptions:

saveData

effectiveType_2g

deviceMemory_below_2gb

active_manifest_has_one_remaining_segment

Cancellation, backpressure, and teardown are treated as transient lifecycle behavior rather than sustained-concurrency exceptions. concurrencyReason is required evidence.

FAIL — Executable OCR evidence still uses the quarantined legacy resolution schema

The canonical contract and packet were repaired, but the active hash-bound fixture was not.

The canonical list at:

docs/architecture/reader-first-release-contract-v2.json#/structureContract/ocrReviewRequiredPolicy/requiredAuditFields

is correctly:

sourceNodeId

sourceEvidence

sourceOverlayRevision

reviewedOverlayRevision

reviewerId

resolvedRole

resolvedDisposition

resolvedAt

RFA-04-AC04 and its telemetry use that same list.

However:

fixtures/pdf/scanned_fixture.expected-overlay.json#/requiredResolution/auditFields

still contains the quarantined legacy fields:

nodeId

priorOverlayRevision

newOverlayRevision

reviewerId

resolvedText

resolvedRole

resolvedDisposition

resolvedAt

It is missing sourceNodeId, sourceEvidence, sourceOverlayRevision, and reviewedOverlayRevision.

The contract binds the hash of this stale fixture through:

#/structureContract/scannedPdfFixture/expectedOverlaySha256

The validator’s evidence-binding check verifies the fixture hash and role membership but does not compare requiredResolution.auditFields to either the fixed literal or the contract. Consequently, the validator passes while the canonical behavioral schema and its executable expected evidence contradict one another.

Minimum correction:

Change fixtures/pdf/scanned_fixture.expected-overlay.json#/requiredResolution/auditFields to the exact canonical eight-field list.

Recompute its hash and update the contract, packet, generated Markdown, and canonical seals.

Make scripts/validate-reader-first-release.mjs compare the fixture list independently against the fixed literal and the contract.

Add an adversarial fixture mutation test that changes sourceNodeId to nodeId and fails specifically for fixture-schema drift, not merely because a canonical file hash changed.

PASS — Authoritative system-health evidence

docs/architecture/reader-first-release-contract-v2.json#/healthContract and RFA-17 now agree on:

Exact backend-owned reason-code enumeration.

Required evidence fields, including clearCondition.

Maximum evidence age of 30 seconds.

Expiry to unknown rather than critical.

Backend-owned clearing.

Prohibition on frontend inference or domain-local escalation to global System critical.

RFA-17.inScope includes the current inference surfaces in:

frontend/src/features/status-strip/model.ts

frontend/src/App.tsx

PASS — Browser-authority migration and removal

RFA-11 now owns the relevant frontend state surfaces, including:

frontend/src/projectState.ts

frontend/src/App.tsx

Its acceptance covers one-time compatible import only when no server snapshot exists, server precedence, revision-guarded persistence, no restore autoplay, removal of workflow-authoritative browser writes, and retained retirement evidence.

PASS — RFA-19 dependency and evidence-only behavior

RFA-19.dependencies includes RFA-18.

It carries all 16 canonical performance budgets.

Its rollback is evidence-only.

RFA-19-AC04 uses the continuity harness.

The issue graph remains acyclic and dependency ordered.

PASS — Monolithic media and bounded Audition ownership

The previously unowned media paths now have explicit implementation ownership:

RFA-09: completed-job route selection in frontend/src/api.ts.

RFA-13: frontend/src/audioWaveform.ts, frontend/src/waveform.ts, App full-source decoding, segment Promise.all fan-out, Teleprompt, Book Cinema, and Prepared Source Cinema waveform paths.

RFA-16: only the bounded Audition exception, restricted to voice comparison or cloning, an AuditionSessionId, at most 30 seconds, at most 5,242,880 bytes, and never a VoiceJob or narration runId.

FAIL — Timing-fidelity implementation scope still permits heuristic timing to appear trusted or exact

The canonical timing policy is correct:

docs/architecture/reader-first-release-contract-v2.json#/timingContract/heuristicMayClaimTrustedWord is false.

#/timingContract/rendererMayHardCodeTrusted is false.

RFA-15 likewise says heuristic timing must not be presented as trusted. Its declared paths, however, are limited to the read-along, reading-surface, and playback feature areas. Current timing renderers outside that scope contain false-fidelity paths:

frontend/src/features/teleprompt/TelepromptStudio.tsx

Promotes an estimated timing state to trusted when word timings are present, rather than solely from authoritative fidelity.

Derives exact-read-along eligibility from that promoted state.

Supplies "trusted" for non-active blocks.

frontend/src/features/teleprompt/telepromptStudioComponents.tsx

Uses "trusted" defaults for cue and word components.

frontend/src/features/teleprompt/telepromptTheatreCueContent.tsx

Uses a "trusted" default timing state.

frontend/src/features/cinema/BookDocumentReaderStage.tsx

Constructs block and word highlights with hard-coded trusted timing.

frontend/src/features/theatre/model.ts

Defaults runtime timing availability to trusted and emits trusted-timing state.

These are not merely display labels: they can determine whether exact word-following behavior is exposed. The packet can therefore close RFA-15 while existing renderers continue to infer or hard-code trust, contrary to the contract and the original fidelity requirement.

Minimum correction:

Add the exact files and timing-related symbols above to RFA-15.inScope, while retaining media-only symbols under RFA-13.

Require all Reader, Teleprompt, Cinema, and Theatre timing renderers to consume authoritative fidelity from the timing manifest or server snapshot.

Prohibit promotion from heuristic or estimated to trusted based solely on the presence of word timings or highlight-map data.

Add acceptance probes for heuristic phrases with word boundaries that must remain visibly estimated and must not enable exact-read-along behavior.

Extend the validator’s fixed source-ownership checks and mutation tests so removal of any of these timing surfaces from RFA-15 fails independently of canonical hashing.

Contract, packet, validator, and DAG verdict

Canonical contract structure: PASS except for the stale hash-bound OCR expected evidence

Linear packet schema and generated Markdown parity: PASS

Validator and adversarial suite: PASS for encoded checks, FAIL for complete semantic coverage

Exact issue IDs: 20, RFA-01 through RFA-20

DAG: acyclic and dependency ordered

Sole graph root: RFA-01

Terminal adjudication gate: RFA-20

RFA-20 implementation ownership: none; evidence/adjudication only

Owner acceptance remains distinct from Peer approval: PASS

Current authorization remains correctly fail-closed:

ownerAccepted:true

peerApproved:false

linearCreationAuthorized:false

productImplementationAuthorized:false

authorizedIssues:[]

The stale executable OCR schema and unowned false-fidelity timing paths are Medium-or-higher specification and quality defects. Passing canonical-hash validation does not close either defect.

Linear creation permitted: NO

Product implementation permitted after Linear creation and explicit parent authorization: NO

Exact graph-unblocked issue IDs: RFA-01
