# Reader-First Peer request-changes repair matrix v4

Source verdict: `docs/reviews/chatgpt-reader-first-release-response-v3.md`

Authorization remains fail-closed: Peer, Linear creation, and product implementation remain false.

| Round 3 blocker | Canonical v4 correction | Validator protection |
|---|---|---|
| Declared archive SHA mismatch / partial bundle | Build from every `git ls-files -co --exclude-standard` source path, include a self-manifest and exact live SHA read from `sha256sum`; archive must independently run relevant tests after extraction. | Archive verification is external evidence; exact SHA is supplied only after final archive bytes exist. |
| RFA-06 backfill evidence unowned | Bind `/mediaContract/durableArtifactMigration/backfillEvidencePath` to RFA-06-AC02 and list it in RFA-06 evidence artifacts. | Contract-declared evidence paths must resolve to their owning issue and acceptance probe. |
| Nominal concurrency under-specified | RFA-13-AC03 requires 2–4 requests when at least two eligible segments exist, with one-request exceptions only for one remaining segment or explicit cancellation/backpressure. | Semantic assertion requires nominal 2–4 wording and bounded exception. |
| OCR overlay role mismatch | Change fixture roles `bodyParagraph` to `paragraph` and `pageNumber` to non-narrated `omittedOrDegraded`. | Every executable overlay role must belong to `/structureContract/unitRoles`. |
| Health enum/field/scope mismatch | RFA-17 uses exact camelCase contract enums, requires `clearCondition`, and scopes the real status-strip and App inference sites. | Exact enum/field tokens and repository-real path/symbol ownership are asserted. |
| Browser authority cleanup not executable | RFA-11 owns `projectState.ts`, App persistence effects, one-time compatible import, retirement, and contract retirement evidence. | Evidence ownership, source paths/symbols, and RFA-11-AC03 semantics are asserted. |
| RFA-19 evidence incompleteness | Allocate all 16 budgets, make rollback evidence-only, and bind stale revision AC04 to continuity harness. | Full budget equality, evidence-only strategy, and exact AC04 command are asserted. |
| App-owned legacy paths outside scope | RFA-13 owns `useCompletedWaveformBars` and segment `Promise.all`; RFA-16 owns global Preview visibility; RFA-17 owns App health inference, all with exact App scope/symbols. | Required path/symbol maps fail independently of canonical hashes. |

RFA IDs and dependency edges remain stable. No Linear or product mutation is authorized by this repair.
