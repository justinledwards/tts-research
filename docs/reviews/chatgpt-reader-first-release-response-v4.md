PEER REQUEST_CHANGES TTS READER-FIRST RELEASE V4

Archive and independent-check result

Reviewed: tts-research-reader-first-peer-review-v4.zip

Supplied and independently computed SHA-256: 74aec289b0c6d3461710c8f92019ba8883f94a99dbad29bb0678b989e65aa71c — MATCH

ZIP integrity: PASS

Entries: 1,351

_review/file-list.txt: 1,348 unique, sorted source paths, exactly matching the archived non-review inventory.

_review/git-status.txt and _review/git-diff.patch: parity PASS

Reverse patch application check: PASS

node scripts/validate-reader-first-release.mjs: PASS

Adversarial validator suite: 18/18 PASS

PDF adapter: 10 PASS, 1 optional OCRmyPDF smoke skipped

Raster scan and OCR transcript reproduction: PASS, exact committed transcript hash.

Generated Markdown/canonical packet parity: PASS

The complete pnpm and Go suites were not independently rerunnable in this environment because the pinned package manager and requested Go toolchain were unavailable offline. The archive itself contains the full source inventory, lockfile, workspace manifests, and reproducible archive metadata; this environment limitation is not the basis for the request-changes verdict.

Round 3 blocker recheck
1. Full archive SHA truth and source closure — PASS

Exact evidence:

Archive SHA matches.

_review/file-list.txt exactly covers all 1,348 source entries.

_review/git-status.txt records 15 modified tracked paths and 62 untracked paths.

_review/git-diff.patch covers exactly the 15 modified tracked paths.

scripts/build-chatgpt-review-archive.mjs checks source closure, status/patch parity, deterministic ZIP construction, and reverse patch applicability.

scripts/build-chatgpt-review-archive.test.mjs covers deterministic archives, uncapped inventory, staged/status drift, workspace/local-import closure, manifest references, fixture references, and reverse application.

.gitignore intentionally retains demo/deep-research-report.md.

2. Contract evidence-path ownership for RFA-06 and RFA-11 — PASS

Exact evidence:

docs/architecture/reader-first-release-contract-v2.json#/mediaContract/durableArtifactMigration/backfillEvidencePath
points to docs/evidence/reader-first/RFA-06/completed-artifact-backfill.json.

Packet issue RFA-06, acceptance RFA-06-AC02, owns and produces that evidence path.

docs/architecture/reader-first-release-contract-v2.json#/serverAuthority/legacyBrowserStateTransition/retirementEvidencePath
points to docs/evidence/reader-first/RFA-11/legacy-browser-import-removal.json.

Packet issue RFA-11, acceptance RFA-11-AC03, owns and produces that evidence path.

3. RFA-13 nominal 2–4 request acceptance — FAIL

The nominal bound is present, but the exception semantics are inconsistent.

Contract:

#/mediaContract/nominalConcurrentSegmentRequests is [2,4].

#/mediaContract/constrainedConcurrencyException/allowedSignals permits:

saveData

effectiveType_2g

deviceMemory_below_2gb

active_manifest_has_one_remaining_segment

#/mediaContract/constrainedConcurrencyException/mustEmitReasonCode is true.

Packet:

RFA-13, RFA-13-AC03.assertion permits one request for “one eligible segment remains” or “seek cancellation/backpressure.”

It omits three contract-authorized constrained-device signals and introduces cancellation/backpressure as sustained concurrency exceptions.

RFA-13.observabilityEvidence.requiredFields does not require the concurrency-exception reason code.

Minimum correction: Make RFA-13-AC03 exactly mirror the contract’s four allowed exception signals, distinguish transient request cancellation from sustained one-request operation, require a reason code, and add that field to RFA-13 telemetry. Extend the validator and mutation tests to enforce exact exception parity.

4. OCR fixture role parity and exact proof — PASS for fixture/schema parity; packet wording remains inconsistent

Closed evidence:

fixtures/pdf/scanned_fixture.pdf is a genuine raster-only PDF with the committed hash.

OCR output reproduces fixtures/pdf/scanned_fixture.ocr.txt exactly.

fixtures/pdf/scanned_fixture.expected-overlay.json now uses roles contained in #/structureContract/unitRoles, including partHeading, chapterHeading, sectionHeading, paragraph, and omittedOrDegraded.

The scan-verification harness is explicitly owned and dependency-reachable.

Remaining packet inconsistency:

Contract #/structureContract/ocrReviewRequiredPolicy/requiredAuditFields requires:
nodeId, priorOverlayRevision, newOverlayRevision, reviewerId, resolvedText, resolvedRole, resolvedDisposition, and resolvedAt.

RFA-04-AC04.assertion instead names source revision, reviewer, disposition, reason, and observedAt, omitting several canonical fields and using different names.

Minimum correction: Replace the RFA-04 acceptance wording with the exact canonical audit-field set and enforce that equality in the validator. The executable fixture is sound, but the issue packet must not state a weaker transition contract.

5. RFA-17 health enums, clearCondition, freshness, and inference scope — PASS

Exact evidence:

#/healthContract uses exact enumerated backend reason codes and requires the canonical evidence fields, including clearCondition.

RFA-17-AC03 uses the same reason-code spelling and required evidence schema.

RFA-17-AC04 covers the 30-second freshness limit, expiry to unknown rather than critical, backend-owned clearing, and prohibition of frontend or domain-local escalation.

RFA-17.inScope.paths includes:

frontend/src/features/status-strip/model.ts

frontend/src/App.tsx

Those paths cover the current frontend inference surfaces.

6. RFA-11 browser-authority write sites, one-time import, and retirement — PASS

Exact evidence:

RFA-11.inScope.paths includes:

frontend/src/projectState.ts

frontend/src/App.tsx

relevant workspace/source/cinema state modules.

Its scoped symbols include the local load, save, migration, clear, and App persistence effects.

RFA-11-AC03 requires:

one-time compatible import only when no server snapshot exists;

server snapshot precedence;

no restore autoplay;

revision-guarded persistence;

removal of workflow-authoritative browser writes;

retained retirement evidence at the contract-bound path.

Browser-authority removal is no longer incorrectly assigned to backend RFA-02.

7. RFA-19 budgets, dependency, rollback, and continuity command — PASS

Exact evidence:

RFA-19.dependencies includes RFA-18.

RFA-19.performanceBudgetIds contains all 16 canonical performance budgets.

RFA-19.rollbackBoundary is evidence-only and does not claim product rollback.

RFA-19-AC04.verificationCommand uses the continuity harness rather than the performance-only command.

The DAG remains acyclic and dependency ordered.

8. Exact ownership of App/project/status legacy paths — PASS for the named Round 3 sites

Exact evidence:

RFA-11: frontend/src/projectState.ts and browser-authoritative frontend/src/App.tsx persistence.

RFA-13: the App full-waveform and all-segment fan-out symbols.

RFA-16: App-level Global Preview ownership/removal.

RFA-17: status-strip and App health inference.

The validator’s source-scope checks and Round 4 mutation tests bind these assignments.

New blocking finding: shared monolithic audio/waveform paths remain outside every implementing issue

The repaired App ownership does not cover all repository-real paths that can violate the contract.

Current source evidence:

frontend/src/audioWaveform.ts:42-59 fetches the complete audio object, converts it to an ArrayBuffer, and calls decodeAudioData.

It is consumed by:

frontend/src/features/teleprompt/TelepromptStudio.tsx:432

frontend/src/features/book-cinema/BookCinemaPanel.tsx:2818

frontend/src/features/cinema/PreparedSourceCinemaTransportHelpers.tsx:24

frontend/src/features/preview/GlobalPreviewPlayer.tsx:140

frontend/src/api.ts:1916-1929 selects job.audioUrl || job.audioPartialUrl for completed jobs, retaining a full-audio selection path.

frontend/src/waveform.ts contains decoded-buffer waveform processing.

None of RFA-09, RFA-13, RFA-16, or RFA-18 owns all of:

frontend/src/audioWaveform.ts

frontend/src/waveform.ts

frontend/src/api.ts

frontend/src/features/teleprompt

This conflicts with:

Contract #/mediaContract/fullAudioDecodeForWaveformAllowed:false

Contract #/mediaContract/manifestCapableReaderMayFallbackToFullAudio:false

RFA-13-AC04, which claims waveform UI never full-fetches or decodes long-form audio.

RFA-09-AC04, which claims manifest-capable Reader playback cannot select full audio.

The current issue scopes can therefore close while a shared full-object decode and monolithic-selection path remains reachable outside the specifically repaired App symbols.

Minimum correction: Assign the shared selector, waveform helper, and all long-form call sites to a dependency-correct implementing issue—most naturally RFA-13, with route selection coordinated with RFA-09. Add the exact paths and symbols to issue scope and require replacement by the server waveform envelope and manifest-based bounded media. Define any permitted bounded Preview/Audition clip exception explicitly by maximum duration/bytes. Extend the validator and mutation suite so removal of any shared path from the owning issue fails.

Validator verdict

The validator is substantially stronger and correctly binds:

Canonical contract and packet hashes.

Generated Markdown.

Exact IDs and dependency arrays.

Evidence paths and hashes.

Future harness ownership and dependency reachability.

RFA-20 integrated-gate commands.

Fail-closed authorization fields.

The repaired App/project/status scopes.

It still does not semantically enforce:

Exact parity between RFA-13 concurrency exceptions and the contract.

Exact OCR resolution audit fields.

Ownership of the shared audioWaveform.ts, waveform.ts, api.ts, and teleprompt paths.

Repository-wide absence of full-object waveform decoding or manifest-capable full-audio selection.

Canonical hashing prevents unnoticed edits to the current packet, but it also faithfully seals these remaining semantic defects.

DAG and authorization gates

Exactly 20 IDs: RFA-01–RFA-20.

DAG: acyclic and dependency ordered.

Root: RFA-01.

Terminal gate: RFA-20.

RFA-20 remains evidence collection/adjudication only and invokes the integrated exact-byte release gate.

Owner acceptance remains distinct from Peer approval.

Current contract and packet remain fail-closed:

ownerAccepted:true

peerApproved:false

linearCreationAuthorized:false

productImplementationAuthorized:false

authorizedIssues:[]

The archive is authentic and substantially repaired, but the shared monolithic waveform/audio path, concurrency-exception mismatch, and OCR transition-field mismatch are architecture-packet blockers.

Linear creation permitted: NO

Product implementation permitted after Linear creation and explicit parent authorization: NO

Initially graph-unblocked issue IDs: RFA-01
