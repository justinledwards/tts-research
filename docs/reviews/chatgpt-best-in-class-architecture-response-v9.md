REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH
accessBlocked: false

1. Source-access proof

The attached ZIP was opened and inspected directly.

SHA-256: fe0f9466f571aeb43c28379e4e45efabba436660571e3c84bd42d51b6467beca — exact match.

ZIP integrity: passed.

Archive prefix: every entry is under tts-research-v9/.

Inventory: _review/file-list.txt contains 1,314 paths; the three _review artifacts are present separately.

_review/git-status.txt contains exactly 12 modified tracked paths plus the disclosed untracked review/validator/inventory sources.

_review/git-diff.patch contains 12 tracked-file diff sections.

Inspected source locations include:

Exact archive path	Inspected symbols/tests or content
tts-research-v9/backend/cmd/flow-route-inventory/main.go	evaluateReceiver, analyzeCall, analyzeFunction, walkExpression, discover
tts-research-v9/backend/cmd/flow-route-inventory/main_test.go	TestDiscoverTraversesInvokedFunctionLiteral, TestDiscoverRejectsRepeatedRouteHelperInvocation, TestDiscoverRejectsRouteRegistrationInRepeatedLoop, and the remaining exact v8 route regressions
tts-research-v9/scripts/validate-flow-registry.mjs	configuredTsRunnerKind, tsStaticValue, executableCaseBodies, caseHasFlowAssertion, validateFlowRegistry
tts-research-v9/scripts/validate-flow-registry.test.mjs	v8 TypeScript static truthiness, casts, comparisons, and short-circuit branches fail closed; v8 evidence selection rejects non-canonical TypeScript test filenames
tts-research-v9/backend/cmd/flow-symbol-inventory/main.go	staticValue, directTerminalTestCall, sourceBuildEnabled, analyzeSource, run
tts-research-v9/backend/cmd/flow-symbol-inventory/main_test.go	TestInventoryTreatsTestingTerminalMethodsAsNonReturning, TestInventoryAcceptsEvidenceOnlyFromActiveGoTestFiles
tts-research-v9/scripts/validate-linear-batch.mjs	validatePacket, repoArtifactPath, loadInputs, run
tts-research-v9/scripts/validate-linear-batch.test.mjs	v8 lifecycle constants and no-creation state are exact and unconditional; v8 capacity snapshot provenance, pagination, and arithmetic fail closed; command-ownership tests
tts-research-v9/docs/project-management/linear/tts-research-best-in-class-batch-draft.json	Canonical lifecycle, capacity, creation plan, reconciliation, twenty issues, ownership and measurement contracts
tts-research-v9/docs/project-management/linear/tts-research-best-in-class-batch-draft.md	Generated packet parity and human-readable creation conditions
tts-research-v9/docs/flows/manifest.json	Thirty-nine flows, route and state ownership, evidence and planned-evidence classification
tts-research-v9/docs/flows/coverage-report.json	Generated 39/123/161/40 coverage summary

Independent focused reruns from the exact source passed:

Route-inventory Go tests: PASS.

Symbol-inventory Go tests: PASS.

Flow-registry tests: PASS, 13/13.

Linear packet tests: PASS, 16/16.

node scripts/validate-linear-batch.mjs: PASS.

Direct flow validation and generated-artifact comparison: 39 flows, 123 routes, 161 required symbols, 40 evidence references, 677 transitions, and all three generated documents in parity.

The green suites do not cover the failing adversarial cases below.

2. Numbered closure table
#	Blocking class	Result	Closure assessment
1	Go route inventory soundness	BLOCK	The ten named v8 regressions are present and pass, and current source produces 123 routes. However, direct IIFEs, callable aliases, explicit generic calls, and calls in switch/range/send expressions can still be silently omitted. Route occurrence state is also not maintained per control-flow path.
2	Executable evidence soundness	BLOCK	TypeScript constant truthiness/comparisons/short-circuit cases and all six terminal Go testing methods are repaired. Ordinary .go files are rejected. Actual runner-glob selection and filename-based Go build exclusion remain fail-open.
3	Candidate lifecycle and Linear atomicity	BLOCK	Candidate statuses, null Linear bindings, zero-creation arithmetic, pagination, safe integers, prefix arithmetic, and identifier resolution are enforced. The required project/team IDs do not match, the required nested approval-marker field is absent, no machine-readable all-false creation-gate state exists, and repository artifact paths/metadata can be substituted.
4	Issue command and ownership blockers	PASS	BIC-01 owns mise exec -- pnpm bench:startup; BIC-18 explicitly reuses and extends it; BIC-02 has the root-runnable Go command; BIC-20 contains all required Git commands and all five negative fixtures.
5	Architecture and flow packet coherence	PASS	On current bytes, 39 flows, 123 route owners, 161 symbols, 40 evidence references, 677 transitions, three generated documents, the 20-issue acyclic graph, cap, exclusive flow/route/state ownership, completed-behavior classifications, measurement bindings, and progressive product spine are internally coherent. This current-byte coherence cannot override the fail-open validators in classes 1–3.
3. Commit-blocking findings
3.1 Required Linear target and creation-plan contract do not match

Exact paths and fields

tts-research-v9/docs/project-management/linear/tts-research-best-in-class-batch-draft.json

projectId

teamId

requiredPeerMarker

creationPlan

creationGates

tts-research-v9/scripts/validate-linear-batch.mjs

EXPECTED_PROJECT_ID

EXPECTED_TEAM_ID

REQUIRED_PEER_MARKER

validatePacket

The project-setup, capacity, existing-issue, and completed-archive JSON artifacts.

Reproduction and observed result

The canonical packet contains:

projectId = 010252d0-b34c-473d-82f2-05bc4d7bc685
teamId    = cdc92ef0-dc69-47b5-8896-312dbc1e2d93

The recheck requires:

projectId = a283459d-22bb-4f13-bc38-85a75a39327e
teamId    = 417c63b6-4b55-403d-95d1-901f25ddba39

The two required identifiers occur zero times in the archive. The validator hard-codes the archive’s different identifiers at scripts/validate-linear-batch.mjs:19-20, so its green result validates the wrong target for this gate.

The required field:

creationPlan.requiresApprovalMarker

is absent. The packet instead has top-level requiredPeerMarker. Adding:

JavaScript
packet.creationPlan.requiresApprovalMarker = "WRONG";

and invoking validatePacket succeeds because the nested field is not examined.

There is also no machine-readable set of creation-gate booleans that are all exactly false. creationGates is an array of prose conditions, and the validator only compares that array to another prose array. Therefore the exact “all creation gates remain false” invariant is neither represented nor enforceable.

The following required no-mutation properties do pass on current bytes:

Packet and all issue statuses are candidate_pending_chatgpt_v8_recheck.

Every issue.linear is null.

newIssuesCreatedNow is 0.

activeUnarchivedBefore and activeUnarchivedAfter are both 0.

Smallest required repair

Regenerate the canonical packet and all target-dependent repository evidence from the required project and team; do not merely rewrite identifiers in existing exports. Update the validator’s authoritative constants and negative fixtures. Add and unconditionally validate:

creationPlan.requiresApprovalMarker ===
  "AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH"

Represent each creation authorization gate with an explicit boolean state and require every state to be exactly false in this candidate schema. Regenerate the Markdown and rerun the full Linear suite.

3.2 Route inventory still silently omits reachable registrations

Exact paths and symbols

tts-research-v9/backend/cmd/flow-route-inventory/main.go

evaluateReceiver around lines 248–289

analyzeCall around lines 368–472

walkExpression around lines 602–617

SwitchStmt, RangeStmt, and SendStmt handling around lines 795–925

tts-research-v9/backend/cmd/flow-route-inventory/main_test.go

Source cause

analyzeCall handles only selector and identifier call targets. A direct *ast.FuncLit, *ast.IndexExpr, or *ast.IndexListExpr call target falls through successfully.

evaluateReceiver copies only prefix and known for an identifier, discarding its function-value binding. Thus g := f loses an assigned closure.

Named function and bound-method values are not represented as callable aliases.

walkExpression intentionally stops at function literals, which is correct for uninvoked closures but leaves direct IIFEs unhandled.

SwitchStmt does not traverse its tag expression.

RangeStmt does not traverse its range expression.

SendStmt traverses neither the channel nor sent value.

Routes are accumulated in one global slice rather than as path-local occurrence state.

Reproductions

Each fixture was run through a binary compiled from the archived main.go.

Fixture pattern	Required behavior	Observed behavior
(func(r *fiber.App) { r.Get("/iife", nil) })(app)	Emit /iife	Exit 0; /iife omitted
f := func(...); g := f; g(app)	Emit closure route	Exit 0; route omitted
Direct method call followed by alias := registrar{}.add; alias(app)	Fail for duplicate runtime registration	Exit 0; one registration reported
helper(app, 1); helper[int](app, 2) where helper registers /duplicate	Fail for duplicate runtime registration	Exit 0; one registration reported
register(app); switch register(app) { default: }	Fail for duplicate runtime registration	Exit 0; one registration reported
register(app); for range register(app) {}	Fail for duplicate runtime registration	Exit 0; one registration reported
register(app); ch <- register(app)	Fail for duplicate runtime registration	Exit 0; one registration reported

An uninvoked closure was correctly ignored, so the defect is specifically failure to distinguish an invoked callable from an uninvoked literal.

Path exactness is also incomplete. Two mutually exclusive branches that each register the same route, and an early-return branch paired with a later equivalent registration, both produce a duplicate error even though no runtime path performs two registrations. This is fail-closed, but it does not satisfy the stated path-sensitive if/else/early-return invariant.

The ten archived v8 regression tests do pass:

TestDiscoverRestoresLexicallyShadowedReceiverAfterNestedBlock

TestDiscoverRestoresLexicallyShadowedReceiverAfterIfInit

TestDiscoverTraversesInvokedReceiverMethod

TestDiscoverTraversesInvokedFunctionLiteral

TestDiscoverTraversesRouteCallInIfCondition

TestDiscoverRejectsRepeatedRouteHelperInvocation

TestDiscoverRejectsRouteRegistrationInRepeatedLoop

TestDiscoverPrunesStaticallyFalseBranch

TestDiscoverStopsAfterUnconditionalPanic

TestDiscoverExcludesBuildConstrainedRouteRoot

They do not cover the callable and expression forms above.

Smallest required repair

Introduce an explicit callable-binding model that can represent function declarations, closures, bound methods, and aliases. Resolve call targets after unwrapping IndexExpr and IndexListExpr. Execute a FuncLit only when it is the actual call target, preserving rejection of uninvoked closures.

Traverse switch tags, range expressions, and both send operands. Carry route occurrence sets or multisets per continuation path; merge possible route ownership separately from maximum per-path execution count. Add exact tests for direct IIFE, closure alias, named function alias, bound-method alias, explicit generic invocation, switch/range/send duplicates, mutually exclusive branches, and the uninvoked-closure negative case.

3.3 Evidence selection is not bound to canonical runners or complete Go build rules

Exact paths and symbols

tts-research-v9/scripts/validate-flow-registry.mjs

configuredTsRunnerKind

executableCaseBodies

parseGoSource

tts-research-v9/scripts/validate-flow-registry.test.mjs

tts-research-v9/backend/cmd/flow-symbol-inventory/main.go

sourceBuildEnabled

analyzeSource

tts-research-v9/backend/cmd/flow-symbol-inventory/main_test.go

tts-research-v9/package.json

Reproduction and observed result

executableCaseBodies accepts any path whose basename looks like a test/spec file. It does not establish that the path is included by an applicable package runner.

Using an imported node:test registration:

scripts/real.test.mjs                 accepted
scripts/fake.spec.mjs                 accepted
docs/fake.test.mjs                    accepted
packages/schema/deep/fake.test.mjs    accepted
scripts/not-a-test.mjs                rejected

Only the first is selected by the root command node --test "scripts/**/*.test.mjs". The schema package runs only test/*.test.mjs, and no canonical runner selects the docs/ fixture.

A full validateFlowRegistry mutation was also accepted after moving one transition from planned evidence to covered evidence backed solely by docs/fake.test.mjs:

coveredTransitionClaimCount = 1
plannedTransitionEvidenceCount = 676
validation = PASS

For Go evidence, the full validator accepted:

backend/internal/fake_windows_test.go

as covered transition evidence on Linux. Such a file is excluded by the canonical Go build. The stdin path goes through analyzeSource, whose sourceBuildEnabled checks a modern //go:build expression but does not apply GOOS/GOARCH filename matching. It also does not handle legacy // +build constraints. A virtual fixture_windows_test.go and a contradictory legacy-build-tag test both emitted executable evidence.

The repaired portions do work:

Ordinary .go files do not contribute test evidence.

Modern contradictory //go:build expressions are excluded.

TypeScript if (0), false as boolean, 1 === 2, and 0 && flowAssert(...) do not count.

Go constant-false comparisons and short circuits do not count.

Fatal, Fatalf, FailNow, Skip, Skipf, and SkipNow terminate evidence reachability.

The test named v8 evidence selection rejects non-canonical TypeScript test filenames checks only scripts/not-a-test.mjs; it does not test a runner-looking filename outside the actual runner glob.

Smallest required repair

Derive an exact evidence-path allowlist from the repository’s canonical test commands/configurations and require each TypeScript evidence path to match one applicable runner include. Do not treat a generic test/spec suffix as runner proof.

For Go evidence, analyze the existing repository file through the helper’s --root/--file path, which already invokes build.Default.MatchFile, rather than reparsing evidence through --stdin-path. Alternatively, make virtual-source analysis apply filename GOOS/GOARCH rules plus both modern and legacy build constraints. Add full-validator negative fixtures for:

docs/fake.test.mjs

scripts/fake.spec.mjs

a package test below a non-recursive glob

*_windows_test.go on Linux

a contradictory legacy // +build file

3.4 Repository artifact provenance remains self-declared and substitutable

Exact paths and symbols

tts-research-v9/scripts/validate-linear-batch.mjs

repoArtifactPath

loadInputs

validatePacket

run

tts-research-v9/scripts/validate-linear-batch.test.mjs

The capacity, existing-issue, and completed-archive JSON artifacts.

Source cause

repoArtifactPath correctly prevents absolute paths and repository escape. However:

Capacity is loaded from packet.capacitySnapshot.repoArtifact.

Existing issues are loaded from packet.existingIssueReconciliation.sourceArtifact.

The completed archive is selected from the packet’s own artifact array by a filename substring.

Validation then compares the packet path with the path that was loaded from that same packet. This proves self-consistency, not canonical provenance.

Reproduction and observed result

I copied the three authoritative artifact bytes to:

docs/project-management/linear/substituted-capacity.json
docs/project-management/linear/substituted-existing.json
docs/project-management/linear/substituted-completed-archive.json

I changed the packet fields to those paths, regenerated the canonical Markdown, and ran the complete exported run({root}) check. Result:

JSON
{"mode":"check","issueCount":20}

Metadata provenance is also not exact. A sourceEvidence mutation changing all of the following was accepted by validatePacket:

Existing-issue schemaVersion

capturedAt

source

issueCount

stateTypeCounts

archivedCount

Completed-archive schemaVersion

exportedAt

counts

The existing-issue export carries no team identifier, so exact team provenance cannot be established for that artifact.

The current path test in validate-linear-batch.test.mjs mutates the packet after canonical sourceEvidence has already been loaded. It detects the resulting in-memory mismatch, but it does not perform a fresh loadInputs/run using a substituted repository file.

Smallest required repair

Load capacity, existing-issue, and completed-archive evidence from validator-owned canonical paths, or from a fixed provenance manifest containing exact paths and SHA-256 values. Compare packet declarations against those independently selected sources.

Validate the exact schema, target project and team, source query, capture/export timestamp, issue count, state counts, archived count, pagination state, and completed-archive count arithmetic. Add end-to-end run({root}) tests that copy valid bytes to alternate paths and require rejection.

4. Non-blocking residual risks

The complete mise exec -- pnpm check command was not independently rerun in this review environment. The archive declares Go 1.26.3, while the available host toolchain could not download that toolchain in the network-restricted environment, and mise/pnpm were unavailable. The focused source-level Go suites, both focused Node suites, canonical Linear check, direct flow validation, and generated-document comparisons were rerun successfully. This limitation is not the reason for the verdict; the blockers above reproduce directly.

Route-producing loops are conservatively rejected even where an iteration count might be provably zero or one; staticRangeCount is present but unused. This is fail-closed, but may create unnecessary future false positives.

The current packet preserves the progressive product spine in the root field and in multiple issue acceptance criteria. validatePacket does not directly pin progressiveProductSpine, so later semantic drift in that field would not itself fail validation.

The forty current evidence references make zero covered-transition claims; all 677 transitions are explicitly planned evidence. This is coherent for a pre-implementation planning packet, but those references must not later be interpreted as completed transition evidence without new executable markers.

5. Linear authorization statement

An AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH verdict would be advisory only and would not itself authorize Linear creation. The repository and PO remain authoritative, and any later Linear mutation would still require a fresh parent-side project-capacity check immediately before creation. This verdict is REQUEST_CHANGES; no Linear issue creation is authorized.
