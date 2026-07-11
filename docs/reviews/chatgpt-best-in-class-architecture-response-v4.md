# ChatGPT TTS best-in-class architecture response v4

- Verdict: `REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH`
- Conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a50a386-17f4-83eb-b513-b111ab56912b`
- Reviewed archive: `tts-best-in-class-v4-20260710T074528Z.zip`
- Archive SHA-256: `c514f79729c35f123df984b98ba5bc322abb663366652eba551b759566d7bd93`
- Source commit: `e97ff6f4932f4429939f1c278e1d4b8361ac6688`
- Linear mutation after verdict: none

---

REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH

Source-access proof

Archive: tts-best-in-class-v4-20260710T074528Z.zip

Computed SHA-256: c514f79729c35f123df984b98ba5bc322abb663366652eba551b759566d7bd93 — exact match.

Extracted repository root: /mnt/data/tts-v4-recheck/tts-research

Archive contents: 1,305 entries under one tts-research/ root; no absolute paths or .. traversal entries.

Archive metadata identifies source commit e97ff6f4932f4429939f1c278e1d4b8361ac6688, branch niklas/voice-studio-follow-up, and source dirty working tree.

git apply --reverse --check _review/WORKTREE_DIFF.patch: passed.

Required paths opened, each followed by an exact snippet:

docs/reviews/chatgpt-best-in-class-architecture-response-v3.md
- Verdict: `REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH`

docs/reviews/chatgpt-best-in-class-architecture-repair-matrix-v3.md
Status: `candidate_pending_chatgpt_v4_recheck`

docs/flows/manifest.json
"schemaVersion": "tts-research.flow-registry.v1",

docs/flows/coverage-report.json
"plannedTransitionEvidenceCount": 677,

scripts/validate-flow-registry.mjs
const marker = `FLOW_ASSERT:${flow.id}:${transitionId}`;

scripts/validate-flow-registry.test.mjs
test("validator rejects missing domain decisions, cancellation drift, and UI-memory authority drift", async () => {

backend/cmd/flow-route-inventory/main.go
discoveryError = fmt.Errorf("unclassified Fiber route receiver for %s at %s", method, expressionText(fset, selector.X))

backend/cmd/flow-route-inventory/main_test.go
func TestDiscoverPropagatesReturnedGroupedReceiver(t *testing.T) {

docs/project-management/linear/tts-research-best-in-class-batch-draft.json
"expectedTransitionCount": 677,

scripts/validate-linear-batch.mjs
assert(packet.issues.length === 20, "packet must contain exactly 20 issues");

_review/ARCHIVE_METADATA.json
"head": "e97ff6f4932f4429939f1c278e1d4b8361ac6688",

_review/GIT_STATUS.txt
?? backend/cmd/flow-route-inventory/

_review/WORKTREE_DIFF.patch
diff --git a/WORKINGLOG.md b/WORKINGLOG.md
Recheck execution

Semantic analysis independently found 39 flows and 476 states. State-count distribution is 11 states × 9 flows, 12 × 22, 13 × 5, and 16 × 3. There are 12 kind/authority sequences, with multiplicities 9, 8, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1. The expanded semantic signature produced 39 distinct signatures with maximum reuse 1.

All 16 family declarations and both shared-subgraph declarations were parsed. Required family roles resolve to distinct states; decision outcomes resolve to outgoing transitions; the five required representative flows contain the claimed roles and lifecycle states. All 39 cancellation phase sets exactly match their ordinary cancel-edge sources. All 39 rollback strings are nonempty and exact-unique. APP-FIRST-RUN-001 separates readable, audio decision, playable, and skipped outcomes; PREVIEW-001 has accept/change/skip transitions; PLAYBACK-001 has loading/playing/paused/interrupted/stale/superseded/resume-decision states; UI-MEMORY-001 is entirely frontend-authoritative; APP-BOOT-001 has bind/conflict/cancel outcomes.

node --test scripts/validate-flow-registry.test.mjs, using the exact route-inventory source through a temporary standalone binary because local Go 1.23.2 cannot load the repository’s Go 1.26.3 module: 7/7 passed. Independent missing-role, missing-outcome, cancellation-drift, UI-memory-authority-drift, and Mermaid-anchor mutations were rejected. Generated Mermaid comparison found one request-captured start anchor and all required terminal anchors for every flow. Generated flow documents, README, and coverage report had zero byte mismatches.

The exact route-inventory source passed its eight supplied tests in a standalone Go module. Live inventory reported 123 routes, 123 unique routes, and five scanned files. The live list exactly equals both manifest ownership and coverage-report.json. Import alias, ordinary receiver alias, fiber.Ctx, MIME Header.Get, and unknown-receiver adversaries behaved as intended. Two grouped-helper propagation adversaries did not.

Transition analysis found 677 globally unique IDs; every ID matches its flow, has a branch suffix agreeing with the transition branch, and is classified exactly once. Current evidence totals are 40 references, 198 named source anchors, 0 covered claims, 677 planned claims, and 0 unclassified. Planned ownership is BIC-01: 17, BIC-04: 81, BIC-05: 83, BIC-06: 64, BIC-07: 86, BIC-08: 93, BIC-09: 154, and BIC-10: 99.

node scripts/validate-linear-batch.mjs: passed. node --test scripts/validate-linear-batch.test.mjs: 5/5 passed. The packet currently has 20 issues against a cap of 20, 73 dependency edges, no cycle, exact BIC-04–10 canonical flow/route/source-symbol ownership, BIC-11–17 post-change performance commands and raw/summary artifacts, all 19 direct BIC-20 dependencies, final-byte performance commands/artifacts, and generated Markdown byte parity. The blockers below are gaps those validators currently accept.

Blocking findings
1. Fiber helper and returned-group prefixes are silently discarded

Severity: BLOCKER

Exact paths:
backend/cmd/flow-route-inventory/main.go:107-169
backend/cmd/flow-route-inventory/main.go:204-288
backend/cmd/flow-route-inventory/main_test.go:82-111

Reproduction: This valid helper registration:

Go
func helper(router fiber.Router) {
    router.Post("/helper", nil)
}

func routes(app *fiber.App) {
    api := app.Group("/api")
    helper(api)
}

was inventoried as POST /helper, not POST /api/helper.

This valid returned-group registration:

Go
func api(app *fiber.App) fiber.Router {
    router := app.Group("/api")
    return router
}

func routes(app *fiber.App) {
    api(app).Put("/returned", nil)
}

was inventoried as PUT /returned, not PUT /api/returned.

The first failure occurs because every fiber.Router parameter is seeded with an empty prefix independently of its call sites. The second occurs because parameterIndexes[expression.Name] treats an unknown returned local identifier as parameter index zero and drops the local group suffix. Both cases return successful inventories with incorrect paths rather than rejecting an unresolved registration form.

Expected result: Group prefixes must propagate through fiber.Router helper calls and returned local aliases. Any helper result or call-site prefix that cannot be resolved unambiguously must fail inventory generation; it must never be silently interpreted as a root receiver.

Minimal repair: Replace file-global name propagation with scope-aware, interprocedural receiver analysis using go/types, SSA, or equivalent. Resolve Router parameters from actual call arguments, track local returned aliases and group suffixes, and reject uncalled, multi-prefix, or unresolved helper registrations. Add the two reproductions above as mandatory unit tests.

2. FLOW_ASSERT validation is file-scoped rather than bound to the named executable case

Severity: BLOCKER

Exact paths:
scripts/validate-flow-registry.mjs:602-635
scripts/validate-flow-registry.test.mjs:204-230

Reproduction: In a temporary copy, a separate uncited test was appended to scripts/start-port-env.test.mjs containing:

JavaScript
// FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry

The transition was then assigned to the existing case invalid ports fail before service launch, while being removed from planned evidence. The marker was not in that named case and did not describe an assertion made by it.

validateFlowRegistry() accepted the mutation and reported:

coveredTransitionClaimCount: 1
plannedTransitionEvidenceCount: 676

The validator checks evidenceSource.includes(marker), so any sibling test, helper, fixture, or top-level comment in the same file can confer coverage on an unrelated named case. The supplied negative test covers only the complete absence of a marker.

Expected result: A transition claim on a named case must be rejected unless the exact marker occurs within that case’s executable body and is bound to the relevant assertion or assertion block. A marker in a sibling case or top-level source must not satisfy it.

Minimal repair: Parse JavaScript/TypeScript and Go test case spans and require each marker to occur inside the cited case body. Bind the marker to an executable assertion or structured transition-evidence helper. Add negative fixtures for a marker in a sibling case, a top-level comment, and an unrelated helper.

3. The V4 state rename was not propagated into the Linear packet

Severity: BLOCKER

Exact paths:
docs/project-management/linear/tts-research-best-in-class-batch-draft.json:476-480 and corresponding entries throughout the packet
docs/flows/manifest.json:787-794
scripts/validate-linear-batch.mjs:239-270
scripts/validate-linear-batch.mjs:402-465

Reproduction: The packet contains references such as:

manifest:APP-BOOT-001#APP_BOOT_001_REQUESTED
manifest:APP-BOOT-001#APP_BOOT_001_VALIDATED

The V4 manifest instead defines:

APP_BOOT_001_REQUESTCAPTURED
APP_BOOT_001_PRECONDITIONSCHECKED

An independent audit of every stateSymbols entry beginning with manifest: found 102 references and 102 unresolved references across BIC-01, BIC-02, and BIC-11–20. Despite that, node scripts/validate-linear-batch.mjs and all five packet tests pass because validation checks only array presence generally and canonical source-symbol parity for BIC-04–10; it never resolves manifest:<flow>#<state> references.

Expected result: Every manifest state reference in every issue must resolve to an existing state in the referenced current canonical flow. The generated Markdown must not contain V3 state IDs after the V4 semantic repair.

Minimal repair: Replace the 102 stale _REQUESTED and _VALIDATED references with the applicable V4 state IDs, preferably deriving them from semanticRoles.requestCaptured and semanticRoles.preconditionsChecked. Extend validate-linear-batch.mjs to parse every manifest:<flow-id>#<state-id> symbol and reject unknown flows or states before Markdown generation.

4. BIC-03’s required 677/0/0 thresholds are listed but not enforced

Severity: BLOCKER

Exact paths:
docs/project-management/linear/tts-research-best-in-class-batch-draft.json:66-77
scripts/validate-linear-batch.mjs:264-268
scripts/validate-linear-batch.mjs:402-465
scripts/validate-flow-registry.mjs:851-892

Reproduction: With the canonical manifest still containing 677 transitions, each of these mutations was independently accepted by validatePacket(packet, benches, flowManifest):

expectedTransitionCount = 676
maxUnsupportedCoveredTransitionClaims = 1
maxUnclassifiedTransitionEvidence = 1

The Linear validator checks only that a threshold key resolves to some value. It does not compare expectedTransitionCount with the manifest transition inventory, does not reconcile evidence totals with coverage-report.json, and has no computed unsupported-claim or unclassified-evidence value tied to the packet thresholds.

Expected result: The packet validator must reject any values other than a transition total equal to the canonical manifest, zero unsupported covered claims, and zero unclassified transition evidence. Manifest, coverage report, BIC-03 thresholds, and rendered Markdown must be reconciled in one gate.

Minimal repair: Compute transition, covered, planned, overlap, unsupported, and unclassified totals from the manifest during validatePacket, or load and independently verify coverage-report.json. Assert expectedTransitionCount === 677 from current canonical bytes and both maxima equal zero. Add mutation tests for all three threshold values and for manifest/report drift.

END TTS BEST-IN-CLASS ARCHITECTURE V4 RECHECK
