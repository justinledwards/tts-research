# ChatGPT Best-in-Class Architecture Repair Matrix — v9 → v10

Date: 2026-07-10

Source verdict: `docs/reviews/chatgpt-best-in-class-architecture-response-v9.md`

Verdict: `REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH`

Linear creation authorization: **NO**

## Review identity

- Archive: `/tmp/tts-research-best-in-class-v9.zip`
- SHA-256: `fe0f9466f571aeb43c28379e4e45efabba436660571e3c84bd42d51b6467beca`
- Conversation: `https://chatgpt.com/g/g-p-6a0ded7bad54819197c0a2f9a82bf65b-tts-research/c/6a50ef49-6de4-83eb-9764-abda9e39a44e`
- ChatGPT project: `TTS-Research` (`g-p-6a0ded7bad54819197c0a2f9a82bf65b`)
- Model/effort: GPT-5.6 Sol / Pro
- Source access: confirmed; `accessBlocked: false`

## Critical correction to the review brief

The v9 brief incorrectly asserted these required Linear IDs:

- project: `a283459d-22bb-4f13-bc38-85a75a39327e`
- team: `417c63b6-4b55-403d-95d1-901f25ddba39`

A fresh read-only Linear GraphQL query on 2026-07-10 proved the canonical packet already targets the real `TTS-Research` project and `QQP` team:

- project: `010252d0-b34c-473d-82f2-05bc4d7bc685`
- team: `cdc92ef0-dc69-47b5-8896-312dbc1e2d93`
- project page: `https://linear.app/niklas-olsson/project/tts-research-9683c18e447c`
- pagination: `hasNextPage: false`

Therefore the v9 finding that the repository uses the wrong Linear target is rejected as a brief-induced false positive. V10 must state the live-verified identifiers and must not rewrite source artifacts to the erroneous IDs. The remaining creation-plan/provenance findings are valid.

## One-to-one blocker ledger

| ID | V9 blocker | Exact repair | Regression/verification | Owner |
|---|---|---|---|---|
| V9-R1 | Direct IIFEs and callable aliases can be silently omitted. | Add explicit callable bindings for function declarations, function literals, bound methods, and aliases/alias chains. Resolve direct `FuncLit`, `IndexExpr`, and `IndexListExpr` call targets. | Exact direct-IIFE, closure-alias, alias-chain, named-function-alias, bound-method-alias, and explicit-generic tests. | route lane |
| V9-R2 | Switch tags, range expressions, and send operands are not traversed. | Traverse all reachable expression-bearing statement positions and preserve call multiplicity. | Exact duplicate fixtures in switch tag, range expression, send channel, and send value. | route lane |
| V9-R3 | Route occurrences are global rather than path-local; mutually exclusive branches can false-positive. | Carry route occurrence multisets per continuation path; merge discovered ownership separately from maximum per-path count. | Mutually-exclusive if/else and early-return fixtures must pass; real repeated-runtime registrations must fail. | route lane |
| V9-E1 | Test/spec suffix is accepted without proof that a canonical TS runner selects the file. | Derive evidence allowlist from canonical repository runner globs/configuration and require one matching runner. | Full-validator negatives for `docs/fake.test.mjs`, `scripts/fake.spec.mjs`, and nested files below non-recursive package globs. | evidence lane |
| V9-E2 | Virtual Go evidence ignores GOOS/GOARCH filename rules and legacy `// +build`. | Prefer existing-file `--root/--file` analysis with `build.Default.MatchFile`; make virtual analysis honor filename and modern/legacy constraints. | `*_windows_test.go` on Linux and contradictory legacy-tag fixtures must not count. | evidence lane |
| V9-L1 | Required nested approval marker is absent; prose gates have no explicit false state. | Add exact `creationPlan.requiresApprovalMarker`; represent every authorization gate with a machine-readable boolean and require all false in candidate state. | Wrong/missing marker and any true/missing gate fail closed. | Linear lane |
| V9-L2 | Repository artifact provenance is selected by packet-declared paths. | Select canonical artifacts from validator-owned constants or a fixed exact-hash provenance manifest. Compare packet declarations against independently selected sources. | End-to-end `run({root})` path-substitution fixtures fail. | Linear lane |
| V9-L3 | Source metadata is incompletely validated. | Validate exact schemas, target identity, source query, timestamps, issue/state/archive counts, pagination, and count arithmetic. | Mutations of every metadata/count field fail closed. | Linear lane |
| V9-N1 | Progressive product spine is not pinned by the validator. | Add exact structural validation of `progressiveProductSpine` if it can be done without broadening scope. | Drift fixture fails. | parent/Linear lane |

## Retained passes

- BIC-01/BIC-18 benchmark harness ownership: PASS.
- BIC-02 root-runnable Go command: PASS.
- BIC-20 dirty/untracked/upstream divergence commands and five negative fixtures: PASS.
- Current architecture/flow packet coherence: PASS on current bytes.
- Candidate statuses, null Linear bindings, zero-creation arithmetic, pagination, and reconciliation resolution: PASS, subject to provenance hardening.

## V10 gate

Do not build or submit v10 until:

1. Every exact blocker fixture above is green.
2. `mise exec -- pnpm check` passes on current bytes.
3. Flow and Linear generated documents are in parity.
4. `git diff --check` passes.
5. A fresh archive closes tracked and nonignored-untracked source with independently checked integrity and reverse-apply provenance.
6. The v10 brief uses the live-verified Linear IDs above and explicitly identifies the v9 brief’s unrelated IDs as an authoring error.

No Linear mutation is allowed until a fresh exact archive receives the strict marker `AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH`, followed immediately by a fresh parent-side live capacity check.
