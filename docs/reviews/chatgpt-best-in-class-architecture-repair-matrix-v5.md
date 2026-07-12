# TTS best-in-class architecture v6 → v7 repair matrix

Status: `candidate_pending_chatgpt_v7_recheck`

Source review:

- Conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a50bb4c-6a5c-83ed-acb0-cf71fd306cf9`
- Archived verdict: `docs/reviews/chatgpt-best-in-class-architecture-response-v6.md`
- Reviewed package: `output/chatgpt-review-packages/tts-best-in-class-v6-20260710T105635Z.zip`
- Reviewed SHA-256: `ae4d296e2517905848be5c1236bff447971c099cd29dcba3edfa4815f270acb1`
- Verdict: `REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH`
- Linear creation permitted: `NO`

This matrix maps only the six v6 findings. Every row remains open until its reproduction fails and canonical current-byte gates pass.

## 1. Router-return control-flow paths are incomplete

Finding:

- branch-local receiver reassignment is discarded;
- `switch` and loop returns can be skipped;
- reachable `/different` prefixes may be silently reported as `/same`.

Required closure:

- path-sensitive receiver environments through conditionals;
- merge all reachable return prefixes;
- reject conflicting prefixes;
- fail closed for unsupported receiver-affecting control flow;
- exact conditional-assignment, switch-return, and loop-return negative fixtures.

Owned paths:

- `backend/cmd/flow-route-inventory/main.go`
- `backend/cmd/flow-route-inventory/main_test.go`

Status: `repaired_verified_current_bytes`

## 2. Nonexecuting text can satisfy transition evidence

Finding:

- fake tests in comments and strings are discovered;
- regex literals can look like executable assertions;
- uninvoked object/class methods can satisfy evidence.

Required closure:

- enumerate actual JS/TS/TSX and Go test declarations from complete-source ASTs;
- accept only direct executable `flowAssert(...)` call nodes in the cited case;
- exclude nested/deferred function, object-method, and class-method bodies;
- exact comment, block-comment, string, template/raw-string, regex, object-method, and class-method negatives.

Owned paths:

- `scripts/validate-flow-registry.mjs`
- `scripts/validate-flow-registry.test.mjs`
- AST helper files if required

Status: `repaired_verified_current_bytes`

## 3. The review ZIP is not source-closed

Finding:

- the archive was built from a tool-truncated `git ls-files` capture;
- workspace importer files, evidence files, symbol-source files, and fixtures were absent;
- archive/file-list parity alone did not prove source closure.

Required closure:

- enumerate Git/index files without tool-output truncation;
- reject sparse/absent tracked paths;
- include all nonignored source-worktree files;
- validate pnpm workspace importers, manifest evidence, required-symbol sources, and checked-in fixture references before packaging;
- independently audit unique safe entries and required-path closure.

Owned paths:

- `scripts/build-chatgpt-review-archive.mjs`
- focused packaging tests

Status: `repaired_verified_current_bytes`

## 4. The provenance patch is corrupt and incomplete

Finding:

- `_review/git-diff.patch` contains an output-truncation marker;
- it covers only four of twelve modified paths;
- it cannot reverse-apply.

Required closure:

- generate the patch directly with uncapped `git diff --binary --no-ext-diff` bytes;
- require exact modified-path parity against porcelain status;
- prove reverse apply against the archived postimage or an equivalent isolated worktree;
- reject truncation markers and corrupt/incomplete patches.

Owned paths:

- `scripts/build-chatgpt-review-archive.mjs`
- focused packaging tests

Status: `repaired_verified_current_bytes`

## 5. State-symbol reconciliation accepts pseudo-declarations

Finding:

- commented TypeScript/Go declarations and string/template/raw-string text can satisfy state-symbol discovery and required declaration checks.

Required closure:

- AST-only exported declaration discovery for TS/TSX and Go;
- shared AST result for canonical discovery and required-symbol validation;
- exact block-comment, template/raw-string, and ordinary-string negatives.

Owned paths:

- `scripts/validate-flow-registry.mjs`
- `scripts/validate-flow-registry.test.mjs`
- AST helper files if required

Status: `repaired_verified_current_bytes`

## 6. Candidate/null Linear invariants are not atomic

Finding:

- a fake non-null issue binding is accepted;
- capacity may claim one created issue and remain compliant;
- generated Markdown still hard-codes “No Linear item was created.”

Required closure:

- candidate status requires every `issue.linear === null`;
- `newIssuesCreatedNow === 0`;
- `activeUnarchivedAfter === activeUnarchivedBefore`;
- compliance is validated from the exact capacity arithmetic;
- Markdown derives the mutation statement from validated fields;
- exact fake-binding and one-created-issue regressions.

Owned paths:

- `scripts/validate-linear-batch.mjs`
- `scripts/validate-linear-batch.test.mjs`

Status: `repaired_verified_current_bytes`

## V7 submission gate

Before another ChatGPT submission:

1. All exact v6 reproductions fail closed.
2. Flow and Linear generated artifacts are regenerated from canonical inputs.
3. `pnpm validate:flows`, direct packet validation, focused tests, `pnpm check`, formatting, and `git diff --check` pass on final bytes.
4. The new archive builder produces a source-closed package with complete, reverse-applicable provenance and exact SHA-256 metadata.
5. The review archive is frozen before submission.
6. No Linear mutation occurs before an exact approving verdict.
