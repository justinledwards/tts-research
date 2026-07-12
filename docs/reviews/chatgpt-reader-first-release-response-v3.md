# ChatGPT Reader-First release Peer response v3

- Conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a515ff1-fb90-83eb-8ff4-666dfdb0023b`
- Reviewed archive: `tts-research-reader-first-peer-review-v3.zip`
- Actual archive SHA-256: `e03ac26cb5e96bce083c6b4f1e7d3fe94c67e1ff047181d3ffab55b0ea79cbcc`
- Declared prompt SHA-256 was incorrect; v4 must use tool-read exact output.
- Model metadata: `gpt-5-6-pro`
- Exact rendered assistant response follows.

---

PEER REQUEST_CHANGES TTS READER-FIRST RELEASE V3

Archive verification

Reviewed archive: tts-research-reader-first-peer-review-v3.zip

Supplied SHA-256: e03ac26c9a66032410e319094982c2141d3477f953a043ebcfe6267b56bbcbcc

Computed SHA-256: e03ac26cb5e96bce083c6b4f1e7d3fe94c67e1ff047181d3ffab55b0ea79cbcc → MISMATCH

Size: 445,199 bytes; ZIP CRC: PASS

Entries: 52 (manifest covers 50 files; all hash checks PASS)

Validator: PASS (node scripts/validate-reader-first-release.mjs)

Adversarial suite: 17/17 PASS

PDF fixture: raster-only A4, 84,284 bytes; OCR transcript reproduced exactly (hash match)

Critical: The uploaded archive does not match the declared SHA-256, and it is not a full dirty-worktree archive (context lists many paths not present). This alone prevents fail-closed authorization.

Round 2 blocker closure (current bytes)

RFA-06 backfill/promotion — PASS (behavior), FAIL (evidence binding)

Behavior fully specified in contract and RFA-06-AC02 + RFA-19-AC03.

Gap: Contract path docs/evidence/reader-first/RFA-06/completed-artifact-backfill.json is not owned/listed by RFA-06 (only verification.json/rollback.json).

RFA-09 exact 2–4 concurrency + /audio isolation — FAIL

Contract /mediaContract/nominalConcurrentSegmentRequests:[2,4] is correct.

RFA-09-AC02/04 correctly isolate full audio and require 200/206/416.

Gap: No implementing acceptance enforces the minimum of 2 requests.
RFA-13-AC03 only enforces “≤4”, allowing always-serial playback.

RFA-15 consumed-timing immutability — PASS

Contract and RFA-15-AC03 fully freeze identity, order, timing (both directions), replacement, and deletion at/before watermark.

RFA-04 executable scanned-PDF OCR/overlay proof — FAIL

Fixture, OCR, hashes, and verifier ownership are correct.

Gap: fixtures/...expected-overlay.json uses roles bodyParagraph and pageNumber, which are not in /structureContract/unitRoles (expects paragraph, etc.). Executable truth contradicts contract schema.

RFA-17 system-health authority, freshness, clearing — FAIL

Contract requires backend-only evidence with exact enum and fields.

Gaps:

Enum mismatch: contract uses backendUnavailable, etc.; RFA-17-AC03 uses snake_case variants.

Field mismatch: contract requires clearCondition; issue uses clearedAt and omits clearCondition.

Scope miss: current inference remains in frontend/src/features/status-strip/model.ts:325–329, outside RFA-17/inScope.paths.

RFA-19 dependency on RFA-18 — PASS

RFA-19.dependencies includes RFA-18; DAG is acyclic and ordered.

Future harness ownership & reachability (incl. browser cleanup) — FAIL

Harness ownership map and ancestry checks pass.

Gap: Browser-authority cleanup is not executable:

RFA-11 owns it, but scope omits frontend/src/projectState.ts and frontend/src/App.tsx where localStorage authority exists.

Contract retirement evidence still points to RFA-02, not RFA-11.

RFA-20 bound to integrated release gate — PASS

All RFA-20 probes use run-reader-first-release-gate.mjs --exact-bytes; issue is adjudication-only with evidence-only rollback.

Browser-authority removal moved to RFA-11 — FAIL

Ownership flag moved to RFA-11.

Gaps:

Scope excludes actual write sites (frontend/src/projectState.ts, frontend/src/App.tsx).

No acceptance probe verifies retirement/one-time import behavior.

Contract evidence path still references RFA-02 and is unowned.

Domain-specific observability/rollback + evidence manifest — FAIL

Root evidenceManifestContract is present and hash-bound.

Core domains (snapshot, media, timing, playback, health) have specific telemetry.

Gaps:

RFA-19 claims “every implementing-issue budget passes” but omits five budgets (warmFirstPlayable, commitToTransport, segmentTimingPublication, trustedWordDrift, narrateAcknowledgement).

RFA-19 rollback is product-style despite nonGoals forbidding product mutation.

Contract-specific evidence paths (backfill, browser retirement) are not bound to owning issues.

Additional blocking findings

Archive identity and completeness

SHA mismatch prevents trust in the reviewed bytes.

Bundle is not a full worktree; included tests cannot run (adapters/pdf/orchestrator.py missing).

App-owned legacy paths not in issue scope (atomicity breach)

Full-audio waveform decode: frontend/src/App.tsx:19194–19234

Segment fan-out + Promise.all: frontend/src/App.tsx:20858–20952

Global Preview ownership: frontend/src/App.tsx:9573+

Issues affected: RFA-13, RFA-16, RFA-17 claim system-level behavior but exclude App.tsx.
Dependencies (RFA-18 after them) make current acceptance impossible to satisfy.

Contract–packet evidence-path inconsistency

/serverAuthority/legacyBrowserStateTransition/retirementEvidencePath → RFA-02 (should be RFA-11)

/mediaContract/durableArtifactMigration/backfillEvidencePath not owned by RFA-06

Acceptance-to-command mismatch

RFA-19-AC04 (stale mutation) uses performance gate command instead of continuity harness.

Validator semantic coverage gaps

Does not enforce:

nominal 2–4 concurrency at issue level

role-schema consistency (overlay vs contract)

exact health enums/fields

ownership of contract-declared evidence paths

repository-real scope vs current implementation

Weak mutations fail only via canonical hash, not semantic invariants.

Summary checkpoint verdict

Architecture direction: coherent; all four audit deltas present.

Six requirements: not yet authorization-ready due to packet-level inconsistencies in concurrency, OCR schema, health evidence, and browser authority.

20-issue DAG: correct and acyclic; RFA-01 root, RFA-20 terminal.

Validator/tests: strong sealing, insufficient semantic coverage.

Evidence/provenance: internally hash-bound; outer archive identity invalid.

Approval is blocked.

Owner acceptance already recorded: yes
Linear creation permitted after fresh parent live-capacity check: no
Product implementation permitted after Linear creation and explicit parent authorization: no
