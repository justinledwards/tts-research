PEER REQUEST_CHANGES

This verdict is bound exclusively to tts-research-reader-first-peer-review-v7.zip, SHA-256 b105fc493407207125ed2d51165a2c86d882abcee622b0cef7f0021cbd5f65db.

Archive and verification

Computed archive SHA-256: MATCH

ZIP integrity: PASS

ZIP entries: 1,357

_review/file-list.txt: 1,354 unique, sorted source entries, exactly matching the archive

_review/git-status.txt / _review/git-diff.patch path parity: PASS

Reverse patch check: PASS

node scripts/validate-reader-first-release.mjs: PASS

Reader-First adversarial suite: 20/20 PASS

Exact PDF-adapter command: 10 PASS, 1 optional skip

The fixture’s committed 150-DPI Tesseract command reproduced fixtures/pdf/scanned_fixture.ocr.txt exactly

Canonical contract, packet, generated Markdown, fixture hashes, prior verdict, and v7 repair evidence bindings: PASS

The complete pnpm/Go suite was not independently rerun because this runner lacks the pinned pnpm package and installed dependencies offline. That environment limitation is not the blocking finding.

V6 blocker closure
1. Executable OCR fixture schema — PASS

Exact evidence:

fixtures/pdf/scanned_fixture.expected-overlay.json#/requiredResolution/auditFields

docs/architecture/reader-first-release-contract-v2.json#/structureContract/ocrReviewRequiredPolicy/requiredAuditFields

Both now contain exactly:

sourceNodeId, sourceEvidence, sourceOverlayRevision, reviewedOverlayRevision, reviewerId, resolvedRole, resolvedDisposition, resolvedAt.

The expected-overlay hash matches the contract. scripts/validate-reader-first-release.mjs#validateExecutableOcrFixture independently compares the fixture against both a fixed literal and the contract. The fixture-only sourceNodeId → nodeId mutation is covered by scripts/validate-reader-first-release.test.mjs and fails without relying on canonical document hashes.

2. Timing-fidelity ownership — FAIL

RFA-15-AC05 correctly requires that every Reader, Teleprompt, Cinema, and Theatre renderer consume authoritative fidelity and that no renderer hard-code or default timing to trusted.

Most previously identified paths are now assigned to RFA-15, but two repository-real renderers remain outside RFA-15.inScope.paths:

frontend/src/features/teleprompt/TelepromptTheatre.tsx:139

TypeScript
currentTimingState = "trusted",

frontend/src/features/cinema/PreparedSourceCinemaBase.tsx:1984

TypeScript
readAlongTimingState={block.id === activeBlockId ? readAlongTimingState : "trusted"}

These are direct instances of the behavior prohibited by RFA-15-AC05. Neither file appears under:

docs/project-management/linear/tts-research-reader-first-release-batch-draft.json, issue RFA-15, field inScope.paths

scripts/validate-reader-first-release.mjs:778-792, fixed RFA-15 source ownership

scripts/validate-reader-first-release.test.mjs:293-306, per-path and per-symbol omission mutations

Although the files fall inside broad earlier RFA-13 or RFA-14 directory scopes, neither earlier issue has timing-fidelity acceptance or owns removal of these trusted defaults. This leaves hidden cross-issue work and permits RFA-15’s declared scope to close while live renderers retain false fidelity defaults.

Minimum correction:

Add frontend/src/features/teleprompt/TelepromptTheatre.tsx and frontend/src/features/cinema/PreparedSourceCinemaBase.tsx to RFA-15.inScope.paths.

Add exact symbols for the TelepromptTheatre default timing state and the prepared-source active/inactive-block timing state.

Extend the validator’s fixed RFA-15 ownership list and mutation tests so each new path and symbol is independently required.

Bind RFA-15-AC05 tests to prove that an omitted Theatre timing input and an inactive prepared-source block cannot become trusted or enable exact read-along without authoritative manifest/snapshot fidelity.

No DAG change is required because RFA-15 already depends on both RFA-13 and RFA-14.

DAG and authorization

Issue IDs remain exactly RFA-01–RFA-20.

Dependency graph: acyclic and packet-order correct

RFA-20 transitively depends on all other 19 issues.

Sole graph root: RFA-01

Owner acceptance remains separate from Peer approval.

Canonical authorization remains fail-closed:

ownerAccepted:true

peerApproved:false

linearCreationAuthorized:false

productImplementationAuthorized:false

authorizedIssues:[]

Linear creation permitted: NO

Product implementation permitted after Linear creation and explicit parent authorization: NO

Exact graph-unblocked issue IDs: RFA-01
