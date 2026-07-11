# TTS best-in-class architecture v7 → v8 repair matrix

Status: `verified_pending_chatgpt_v8_recheck`

Source review:

- `docs/reviews/chatgpt-best-in-class-architecture-response-v7.md`
- conversation `6a50c8cb-e78c-83eb-a0b9-c9876c99b4fe`
- archive SHA-256 `3861aff7b2c3c89b1e0cce6f359eac1c58616f4903b328d763a11b1f966cda4f`

Linear mutation remains prohibited. Replacement issues created: `0`.

## 1. Route inventory drops reachable receiver states and adjacent control flow

Current-byte reproduction:

- parallel receiver swap emits only `GET /same/x`;
- direct conditional receiver reassignment emits only `GET /same/x`;
- range receiver reassignment emits only `GET /same/x`;
- direct TypeSwitch and Select registrations emit `sourceFiles: 0` and `routes: null`.

Required repair:

1. Use one path-sensitive continuation model for ordinary route registration and returned-router evaluation.
2. Evaluate all simultaneous-assignment right-hand sides against the pre-assignment environment, then apply atomically.
3. Preserve all reachable branch/loop receiver environments.
4. Traverse TypeSwitch, Select, Range, If, Switch, and For registrations.
5. Fail closed on unsupported receiver-affecting control flow and tuple/multi-result assignment.
6. Add exact regression tests for every reproduced probe.

Acceptance evidence:

- exact probes reject ambiguity or include every reachable route;
- canonical 123-route inventory remains in parity;
- `go test ./cmd/flow-route-inventory -count=1` passes;
- full backend and repository gates pass.

Owned files:

- `backend/cmd/flow-route-inventory/main.go`
- `backend/cmd/flow-route-inventory/main_test.go`

Status: `in_progress`

## 2. Transition evidence accepts unreachable assertions and fake test registrations

Current-byte reproduction: all of the following return `discovered: true, accepted: true`:

- TypeScript assertion after unconditional `return`;
- TypeScript locally shadowed `test` registration;
- TypeScript `test` registration under `if (false)`;
- Go assertion after unconditional `return`;
- Go assertion under `if false`.

Required repair:

1. Analyze callback/test-body statements conservatively in execution order.
2. Stop proof collection after unconditional terminators.
3. Exclude statically impossible branches.
4. Fail closed on unsupported control flow that affects proof reachability.
5. Resolve TypeScript `test`/`it` registrations to unshadowed configured globals or known runner imports.
6. Preserve existing comment/string/regex/nested-function/object-method/class-method rejection.
7. Add exact negative fixtures for all five reproduced probes.

Acceptance evidence:

- all five exact probes are rejected;
- canonical 40 evidence references remain valid;
- focused JS and Go helper suites pass;
- `pnpm validate:flows` and full repository gates pass.

Owned files:

- `scripts/validate-flow-registry.mjs`
- `scripts/validate-flow-registry.test.mjs`
- `backend/cmd/flow-symbol-inventory/main.go`
- `backend/cmd/flow-symbol-inventory/main_test.go`

Status: `in_progress`

## V8 submission gate

Before a v8 recheck:

- [x] independently rerun all v7 exact probes on final bytes;
- [x] run focused route/evidence/archive/Linear suites;
- [x] regenerate deterministic flow and Linear Markdown;
- [x] run fresh `pnpm check`, flow, packet, format, diff, and zero-`undefined` gates;
- [x] build a source-closed archive with the checked-in builder;
- [x] independently audit exact source entry parity, CRC, patch/status parity, and reverse-apply;
- [ ] submit in a fresh `tts-research` Project chat with GPT-5.6 Sol / Pro;
- [ ] require exact `AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH` and `Linear creation may proceed: YES.` markers before any Linear mutation.
