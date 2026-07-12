# Reader-First Peer request-changes repair matrix v3

Source verdict: `docs/reviews/chatgpt-reader-first-release-response-v2.md`

Authorization remains fail-closed: Peer, Linear creation, product implementation, and issue authorization are all false/empty.

| Round 2 blocker | Canonical v3 correction |
| --- | --- |
| Completed-artifact backfill acceptance | `RFA-06-AC02` now requires legacy-root discovery, checksum/length/header/compatibility verification, copy+fsync+atomic rename+revision-guarded metadata, idempotent interruption recovery, restart/reboot playback, and no valid-candidate `artifact_missing`; `RFA-19-AC03` permits missing only after every root proves no valid compatible artifact. |
| Legacy/full-audio contradiction and ranges | `RFA-09-AC02/04` exactly distinguish manifest Reader, explicit export, and negotiated incapable legacy clients; require 200/206/416, `Content-Range`, `Accept-Ranges`, route evidence, and Safari/iOS plus Chromium/Firefox gapless profiles. |
| Consumed timing acceptance | `RFA-15-AC03` freezes cue/word identity, order, start/end in both directions, segment, locator, replacement, and deletion at/before the persisted watermark; conflicts retain the consumed revision and emit evidence. |
| OCR executable acceptance | `RFA-04` owns `scripts/verify-reader-first-scan-fixture.mjs`; AC02/04 compare raster/hash, OCR transcript, expected overlay, unresolved narration pause, and audited resolution revision. |
| Backend health authority acceptance | `RFA-17-AC03/04` require all evidence fields, exact reason codes, backend authorship/clearing, 30-second expiry to unknown, domain-local behavior, and rejection of frontend promotion. |
| Hidden RFA-18 → RFA-19 dependency | `RFA-19.dependencies` now includes `RFA-18`. |
| Verification harness ownership | Exact future scripts are in the earliest creating issue scope: continuity RFA-02, bootstrap RFA-03, scan RFA-04, speech plan RFA-05, timing RFA-07, media RFA-09, journey RFA-14, performance RFA-18, integrated release RFA-20. `RFA-06` now depends on RFA-02; consumers may only invoke an ancestor-owned or self-owned script. |
| False RFA-20 runtime proof | `RFA-20-AC02/04` invoke `run-reader-first-release-gate.mjs --exact-bytes`; the architecture validator is prerequisite-only. RFA-20 remains adjudication-only. |
| Browser-write removal outside RFA-02 scope | Browser-authoritative/localStorage write retirement moved to frontend owner RFA-11. RFA-02 owns no frontend deletion. Rollback never restores browser authority. |
| Generic telemetry and rollback | Every issue has issue-specific evidence fields and rollback strategy. Stateful minimums cover snapshot modes/revision, artifact promotion, media capability/route/status/range/profile, consumed watermark/revisions, playback owner, and health reason/freshness/clearing. RFA-20 rollback only invalidates/supersedes evidence/verdict. |

Additional closure:

- Root `evidenceManifestContract` requires immutable command, archive/commit hash, fixture hashes, measurement/tool/OS/hardware profiles, raw output, result, reviewer, and timestamp with supersession-only correction.
- `docs/plans/2026-07-10-reader-first-release-reset.md` now states RFA-20 is adjudication-only and reflects the RFA-06/RFA-19 dependency corrections.
- Count remains exactly 20; `RFA-01` remains the sole structural root; authorization remains closed.
