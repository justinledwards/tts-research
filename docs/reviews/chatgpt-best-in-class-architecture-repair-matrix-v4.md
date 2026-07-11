# TTS best-in-class architecture v4 → v6 repair matrix

Status: `candidate_pending_chatgpt_v6_recheck`

Source reviews:

- V4 conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a50a386-17f4-83eb-b513-b111ab56912b`
- V4 archive: `tts-best-in-class-v4-20260710T074528Z.zip`
- V4 archive SHA-256: `c514f79729c35f123df984b98ba5bc322abb663366652eba551b759566d7bd93`
- V4 response: `docs/reviews/chatgpt-best-in-class-architecture-response-v4.md`
- V5 conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a50b083-269c-83eb-94c5-81a8dad95146`
- V5 response: `docs/reviews/chatgpt-best-in-class-architecture-response-v5.md`

## Source-faithful v4 verdict

`REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH`

The actual v4 response contained the four blockers below. Linear mutation remained prohibited and did not occur.

## V4 blocker 1 — Fiber helper and returned-group prefixes

V4 finding:

- package/file-global receiver identity discarded call-site prefixes;
- returned local group aliases could silently resolve as root receivers;
- unresolved, uncalled, or multi-prefix helpers did not fail closed.

Repair:

- rewrote `backend/cmd/flow-route-inventory/main.go` as package-level interprocedural AST analysis;
- receiver environments are per invocation and actual arguments propagate exact prefixes;
- aliases, `Group` calls, returned Router helpers, and direct returned-group calls resolve at their call site;
- unresolved, computed, recursive, unsupported, duplicate, uncalled, and ambiguous forms fail closed;
- v5 follow-up recursively includes `else if` return branches, so `/same` versus `/different` fails as ambiguous;
- route inventory schema is `tts-research.route-inventory.v2`.

Adversarial proof includes grouped helper propagation, returned groups, local aliases, uncalled and unknown helpers, direct two-prefix ambiguity, `else if` ambiguity, and duplicate registration.

## V4 blocker 2 — FLOW_ASSERT was file-scoped, not case-bound

V4 finding:

- a sibling test, helper, fixture, or top-level comment could satisfy a cited named case.

Repair:

- `scripts/validate-flow-registry.mjs` extracts the exact JS/TS `test`/`it` callback or Go `Test*` function body;
- covered transitions require a real `flowAssert(...)` call in that exact body;
- lexical scanning skips comments, string/template contents, and nested uninvoked function/arrow bodies;
- duplicate case names remain ambiguous and fail;
- JS and Go negatives cover top-level, sibling, unrelated helper, in-case comment, in-case string, and uncalled local helper placements;
- current claims remain honest: zero covered transitions and all 677 transitions planned.

## V4 blocker 3 — V4 state rename was not propagated into the Linear packet

V4 finding:

- 102 `manifest:<flow>#<state>` references used stale V3 `_REQUESTED` and `_VALIDATED` IDs;
- packet validation did not resolve those references.

Repair:

- the packet now contains zero `manifest:` references and zero stale `_REQUESTED`/`_VALIDATED` state IDs;
- ownership fields use only exact canonical source-symbol identities from `requiredStateSymbols`;
- all 20 issues are validated globally for no overlapping `stateSymbols` values;
- BIC-04–10 must exactly own the current canonical source-symbol inventory once, while all non-owner issues have empty ownership arrays;
- any reintroduced `manifest:` pseudo-symbol or stale state ID is therefore extra/noncanonical and fails exact inventory reconciliation before Markdown generation.

## V4 blocker 4 — BIC-03’s required 677/0/0 thresholds were listed but unenforced

V4 finding:

- `expectedTransitionCount = 676` was accepted against a 677-transition manifest;
- `maxUnsupportedCoveredTransitionClaims = 1` was accepted;
- `maxUnclassifiedTransitionEvidence = 1` was accepted.

Repair:

- flow coverage schema `tts-research.flow-coverage.v2` records canonical transition count, covered and planned counts, overlap, unsupported covered claims, and unclassified count;
- `validate-linear-batch.mjs` independently computes transition/classification counts from the manifest;
- packet `expectedTransitionCount` must equal the current manifest total;
- both maxima must equal zero;
- covered/planned overlap and unclassified transitions must equal zero;
- the committed coverage report must exactly match independently computed values;
- report or manifest drift fails validation;
- exact 676/1/1 mutations and manifest/report-drift fixtures are mandatory negatives.

Current canonical contract: 677 total, 0 covered, 677 planned, 0 overlap, 0 unsupported covered claims, 0 unclassified.

## Supplemental hardening — not misattributed to the v4 source

### Exclusive issue ownership

- root `ownershipContract` defines implementation ownership semantics;
- 39 flows, 123 routes, and 161 source symbols are each owned exactly once across all 20 issues;
- duplicate injection in any ownership field fails.

### First-class measurement contracts

- exact machine classes are enforced: `runtime-reference-cpu`, `frontend-reference-chromium`, and `frontend-low-resource-chromium` with their complete declared structure;
- runtime binds exactly to the runtime class; frontend binds exactly to both Chromium classes;
- exact statistics, run counts, variance/failure limits, cache/build states, timestamps, source/environment/command fields, browser version, and viewport are enforced;
- every issue/contract pair requires its exact raw/summary/run-manifest triplet;
- BIC-20 requires distinct runtime and frontend final run manifests;
- final evidence binds exact final batch bytes and prohibits stale reuse;
- generated Markdown resolves packet-root measurement thresholds and fails on unresolved values; zero `undefined` values are permitted.

## Current non-claims

- No Linear issue has been created.
- The 677 transition evidence items are planned, not claimed covered.
- No performance result is claimed before owner issues produce bound artifacts.
- ChatGPT v6 agreement remains required before Linear mutation.

## Recheck commands

```sh
mise exec -- pnpm validate:flows
node scripts/validate-linear-batch.mjs
node --test scripts/validate-flow-registry.test.mjs
node --test scripts/validate-linear-batch.test.mjs
cd backend && go test ./cmd/flow-route-inventory -count=1
mise exec -- pnpm check
mise exec -- pnpm format:check
git diff --check
```
