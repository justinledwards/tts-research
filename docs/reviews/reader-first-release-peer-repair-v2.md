# Reader-First Peer request-changes repair matrix v2

Source verdict: `docs/reviews/chatgpt-reader-first-release-response-v1.md`

All rows remain owner-accepted but Peer-pending. Linear creation and product implementation remain unauthorized.

| # | Peer blocker | Canonical repair | Fail-closed proof |
|---|---|---|---|
| 1 | Validator accepted title, dependency, scope, evidence, and acceptance weakening | Every issue now has one accountable owner surface, repository-real path/symbol scope, non-goals, commands, evidence artifacts, structured acceptance bindings, issue-local telemetry, rollback, and allocated budgets. Contract and packet also have exact canonical SHA bindings. | `scripts/validate-reader-first-release.test.mjs`: execution-schema, acceptance-binding, observability/rollback/budget, DAG, pure-gate, and random canonical-mutation tests. |
| 2 | Snapshot schema and legacy transition were incomplete | `serverAuthority.snapshotSchemaVersion`, explicit v0/v1 reads, v1 writeback with revision precondition, compatibility failure, browser import precedence, and retirement evidence are normative. | Snapshot migration/browser transition mutation test. |
| 3 | Request concurrency contradicted the nominal 2–4 requirement | `mediaContract.nominalConcurrentSegmentRequests=[2,4]`, maximum 4, constrained minimum 1 only for enumerated signals with a reason code. | Nominal request-envelope mutation test. |
| 4 | Existing completed artifacts could regress during durability migration | Startup/pre-read scan verifies checksum, bytes, decodable segment header, and compatibility; promotion is copy/fsync/atomic-rename/metadata-commit; valid artifacts may never become missing. | Completed-artifact backfill mutation test and RFA-06 restart probe contract. |
| 5 | Reader could fall back to full audio and range semantics were underspecified | A manifest-capable Reader may not fall back to full audio. Final audio is explicit export or negotiated legacy only; satisfiable ranges return 206, unsatisfiable ranges 416, and Content-Range is required. AAC/fMP4 and Opus/WebM profiles are explicit. | Manifest-only Reader/range mutation test; RFA-09 commands and evidence. |
| 6 | Timing revisions protected backward movement only | Server-persisted consumed watermark freezes cue identity, order, segment, locator, start, and end; consumed cues cannot be moved in either direction, replaced, reordered, or deleted. Later revisions apply only after the watermark. | Five-direction consumed-cue mutation loop and 0.625 baseline trust test. |
| 7 | Scanned-PDF fixture was not credible and OCR adjudication had no flow | The 98-byte marker was replaced by an 84,284-byte raster-only A4 PDF containing one 1937×2740 grayscale image. Exact OCR transcript and reviewed structure overlay expose two `reviewRequired` headings. Resolution creates a new audited overlay revision and unresolved nodes cannot auto-narrate. | Exact fixture/overlay/transcript hashes, `pdfimages` shape, OCR command, and scanned-OCR mutation test. |
| 8 | Frontend could infer global critical state | Only fresh backend evidence with an allowed reason code may set System critical. Required fields, 30-second freshness, unknown-on-expiry, backend clearing, and domain-local blockers are normative. | Backend-owned health/freshness mutation test. |
| 9 | Audit and Linear target provenance were external/free-form | All three audit summaries are checked into `docs/reviews/reader-first-audits/` with SHA-256 bindings. Linear team/project identity and a complete paginated 0/20 capacity read are recorded in `tts-research-reader-first-linear-provenance.json` and hash-bound. | Audit/target/capacity mutation test plus runtime evidence-hash verification. |

Additional atomicity closure:

- RFA-02, RFA-09, RFA-17, and RFA-18 have explicit owner/scope/non-goal/verification/evidence/rollback boundaries.
- Legacy removals are owned by RFA-02, RFA-11, RFA-13, RFA-16, and RFA-18 only.
- RFA-20 performs exact-byte adjudication only; it owns no implementation or legacy deletion.
- Performance evidence is allocated to implementing issues, with RFA-20 retaining only integrated adjudication across all budgets.
