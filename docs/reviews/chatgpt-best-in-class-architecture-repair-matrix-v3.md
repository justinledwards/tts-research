# TTS best-in-class architecture v3 → v4 repair matrix

Status: `candidate_pending_chatgpt_v4_recheck`

Source review:

- ChatGPT conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a5095d1-7c84-83eb-97dc-c173848ed99a`
- V3 review archive: `tts-best-in-class-v3-20260710T063903Z.zip`
- V3 archive SHA-256: `b099c43274f285648d6f10b1a7ba0297eac93a7ec23147a8d546568a5003b5d1`
- V3 verdict: `REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH`
- Linear mutation: none

The authoritative response is archived in `docs/reviews/chatgpt-best-in-class-architecture-response-v3.md`.

## Repair matrix

### 1. Universal nine-role scaffold and missing domain semantics

V3 reproduction:

- all 39 flows had exactly nine states;
- one kind/authority sequence;
- identical rollback prose;
- first-readable/playable, Preview outcomes, Playback lifecycle, UI-memory authority, and cancellation-policy parity were incomplete.

V4 repair:

- Added 16 declared `flowFamilies` and two explicitly declared shared subgraphs.
- Re-authored canonical machines to 11, 12, 13, or 16 states instead of one nine-state count.
- Current state-count distribution: 11×9, 12×22, 13×5, 16×3.
- Current kind/authority sequence count: 12.
- Added `architectureFamily`, `sharedSubgraphs`, `semanticRoles`, `semanticInvariants`, `requiredDecisions`, and stable transition IDs to every flow.
- Added 677 canonical transitions.
- Added flow-specific rollback contracts; duplicate rollback count is zero.
- Made `cancellationPolicy.cancellablePhases` equal ordinary cancel-edge sources exactly; mismatch count is zero.
- Generated Mermaid now has a canonical start anchor from `requestCaptured` and terminal anchors for every `terminal-*` state.

Required representative semantics now enforced:

- `APP-FIRST-RUN-001`: distinct `firstReadable`, `audioChoice`, `firstPlayable`, and `audioSkipped` states; `generate/change/skip` outcomes.
- `PREVIEW-001`: `auditionReady`, `reviewDecision`, and `changeRequested` states; `accept/change/skip` outcomes.
- `PLAYBACK-001`: `mediaLoading`, `playing`, `paused`, `interrupted`, `stale`, `superseded`, and `resumeDecision`; `resume/supersede/fail` outcomes.
- `UI-MEMORY-001`: every canonical state is frontend-authoritative.
- `APP-BOOT-001`: explicit `bind/conflict/cancel` port-bind decision.

Validator strengthening:

- family and shared-subgraph identity;
- family-required semantic roles;
- distinct role-to-state mapping;
- stable unique transition IDs;
- three-or-more named outcomes bound to actual outgoing transitions;
- at least four state counts and eight kind/authority sequences;
- unique rollback contracts;
- exact cancellation-edge/policy equality;
- exact representative role/outcome/authority checks;
- semantic-template signatures now include family, labels, observability, roles, events, guards, decisions, cancellation, retry identity, commit effects, rollback, and invariants after normalizing each flow's own ID/title tokens.

Adversarial tests cover:

- full semantic-contract cloning across four flows;
- missing first-readable role;
- missing Preview decision outcome;
- cancellation-policy drift;
- UI-memory authority drift.

Changed paths:

- `docs/flows/manifest.json`
- `docs/flows/application-ux.md`
- `docs/flows/content-audio-reader.md`
- `docs/flows/runtime-data-security.md`
- `docs/flows/coverage-report.json`
- `docs/flows/README.md`
- `scripts/validate-flow-registry.mjs`
- `scripts/validate-flow-registry.test.mjs`

### 2. Route inventory skipped aliased/unclassified Fiber receivers

V3 reproduction:

- `router := app; router.Get(...)` returned no route and no error;
- `func helper(router fiber.Router)` was unclassified;
- returned grouped helpers were unclassified;
- unknown route-method receivers were silently skipped.

V4 repair:

- Fiber import aliases are discovered explicitly.
- `*fiber.App` and `fiber.Router` parameters are registration receivers.
- identifier aliases propagate receiver identity and group prefix.
- direct helper returns and `return app.Group("/literal")` propagate identity and prefix.
- all route-method calls on unknown receivers fail closed.
- unsupported `Route`, `Mount`, or `Static` registration forms fail explicitly.
- `fiber.Ctx` request receivers and MIME `.Header.Get` are explicitly classified as non-registration APIs, avoiding false positives without opening unknown Router-like receivers.

New tests:

- aliased receiver discovery;
- `fiber.Router` helper parameter discovery;
- returned grouped helper discovery;
- unknown receiver rejection.

Fresh result:

- route-inventory tests: 8/8 pass;
- live routes: 123;
- unique routes: 123;
- scanned source files: 5.

Changed paths:

- `backend/cmd/flow-route-inventory/main.go`
- `backend/cmd/flow-route-inventory/main_test.go`
- `scripts/validate-flow-registry.mjs`

### 3. Unsupported evidence claims were treated as covered

V3 reproduction:

- filename plus existing test-name presence could claim a branch;
- unrelated Playback, adapter capability, startup-port, and project-delete cases were counted as covered;
- no case-to-transition or assertion-to-transition binding existed.

V4 repair:

- Every transition has a stable flow-local transition ID.
- `testEvidence[].testCases[]` is now case-level and contains `name` plus exact `transitionIds`.
- A covered transition is accepted only when the exact evidence source contains `FLOW_ASSERT:<flow-id>:<transition-id>`.
- An unrelated existing executable case with no marker fails validation.
- Covered and planned transitions cannot overlap.
- Covered plus planned transition IDs must equal the exact canonical transition inventory.
- All unsupported v3 claims were removed rather than relabeled.

Current honest evidence state:

- evidence references: 40;
- named executable source anchors: 198;
- covered transition claims: 0;
- planned transition evidence: 677;
- unclassified transition evidence: 0.

All 677 transition-evidence obligations are owner-bound to BIC-01 or BIC-04–10. Those issues cannot close until they add transition-specific executable assertions/markers on final issue bytes.

Packet changes:

- BIC-03 thresholds now include exact transition count 677, zero unsupported covered claims, and zero unclassified transition evidence.
- BIC-03 requires stable transition IDs and marker-bound evidence.
- BIC-01 explicitly closes APP-BOOT transition evidence.
- BIC-04–10 explicitly close all planned transition evidence for their owned flows.
- Root and all 20 issue statuses are `candidate_pending_chatgpt_v4_recheck`.

Changed paths:

- `docs/flows/manifest.json`
- `docs/flows/coverage-report.json`
- generated flow documents
- `scripts/validate-flow-registry.mjs`
- `scripts/validate-flow-registry.test.mjs`
- `docs/project-management/linear/tts-research-best-in-class-batch-draft.json`
- `docs/project-management/linear/tts-research-best-in-class-batch-draft.md`
- `scripts/validate-linear-batch.mjs`
- `scripts/validate-linear-batch.test.mjs`

## Fresh focused gates

```text
node scripts/validate-flow-registry.mjs --write
  39 flows; 123 routes; 3 generated documents

node --test scripts/validate-flow-registry.test.mjs
  7/7 pass

cd backend && go test ./cmd/flow-route-inventory -count=1
  pass (8 tests)

go run ./cmd/flow-route-inventory --root internal/httpapi
  123 routes; 123 unique; 5 source files

node scripts/validate-linear-batch.mjs --write
  20 issues; DAG/cap/schema/threshold/reconciliation/Markdown parity pass

node --test scripts/validate-linear-batch.test.mjs
  5/5 pass
```

## Gate and non-claims

- No Linear mutation has occurred.
- The packet remains a candidate until ChatGPT returns the exact AGREED marker.
- Existing tests are source anchors only unless they carry transition-specific executable FLOW_ASSERT bindings.
- Planned transition evidence is implementation work, not a completed-evidence claim.
- Passing repository validators does not substitute for PO or release verification.
