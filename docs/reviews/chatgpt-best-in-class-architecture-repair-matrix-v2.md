# TTS best-in-class architecture v2 → v3 repair matrix

Status: `candidate_pending_chatgpt_v3_recheck`

Source review:

- ChatGPT conversation: `https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a5085c1-6258-83eb-b672-cd4b6e9b9629`
- Reviewed archive SHA-256: `b526081bb85f6577740352c9b478b723b5ecacbf1ff7e25d26f51da762bd17c3`
- Saved response: `docs/reviews/chatgpt-best-in-class-architecture-response-v2.md`
- Verdict: `REQUEST_CHANGES`

No Linear issue has been created or mutated. This matrix records the repair candidate for the next archive-first recheck.

## Blocker closure

### 1. Universal 39-flow machine

Repaired in:

- `docs/flows/manifest.json`
- `scripts/validate-flow-registry.mjs`
- generated `docs/flows/*.md`

Evidence:

- 39 flows now use 15 family-appropriate full-flow structures: startup, guided journey, guarded UI, CRUD, destructive reset, ingestion, review, event stream, planning, voice preparation, job recovery, playback, immersive reading, portability, and runtime diagnostics.
- Maximum full-flow normalized structural signature reuse is 3, enforced by `governance.normalizedTemplatePolicy.maxFullFlowStructuralSignatureInstances`.
- Guards and events derive from domain state labels/ownership instead of the repeated placeholders rejected in v2.
- The validator rejects a four-flow normalized clone in `scripts/validate-flow-registry.test.mjs`.

### 2. Fail-open route and implementation-state inventory

Repaired in:

- `backend/cmd/flow-route-inventory/main.go`
- `backend/cmd/flow-route-inventory/main_test.go`
- `scripts/validate-flow-registry.mjs`
- `docs/flows/manifest.json`

Evidence:

- Go AST inventory covers direct, grouped, and helper-parameter Fiber registrations and rejects variable/computed paths or unsupported registration forms.
- Live inventory: 123 unique routes with exactly one primary flow owner.
- AST tests cover literal direct routes, helper receivers, grouped routes, and variable-path rejection.
- Scoped recursive state discovery now inventories 157 exported state-like declarations plus four explicit non-pattern declarations: 161 exact `path#symbol` entries.
- Every symbol must exist in source and have exactly one primary flow owner.
- Reader shell/transport and temporary-source lifecycle states are explicitly owned.
- Adversarial tests reject duplicate ownership, missing declarations, unowned discoveries, and inventory drift.

### 3. Cosmetic evidence references

Repaired in:

- `docs/flows/manifest.json`
- `scripts/validate-flow-registry.mjs`
- generated flow documents/report

Evidence and non-claim:

- 198 exact executable test-case names are bound to evidence paths.
- 143 conservative branch-coverage claims are declared.
- 132 currently uncovered branches are **not** claimed as covered; each is classified in `plannedEvidence` with a BIC-01/BIC-04–10 owner, exact verification command, and reason.
- The validator rejects missing evidence files, stale case names, unknown branch claims, covered/planned overlap, invalid issue owners, and any branch that is neither covered nor planned.
- Generated docs render both existing evidence and planned evidence gaps.

### 4. Hand-maintained Mermaid/docs drift

Repaired in:

- `scripts/validate-flow-registry.mjs`
- `docs/flows/manifest.json`
- `docs/flows/application-ux.md`
- `docs/flows/content-audio-reader.md`
- `docs/flows/runtime-data-security.md`
- `docs/flows/coverage-report.json`

Evidence:

- Canonical state/transition records generate each Mermaid diagram.
- Canonical manifest records generate all three flow documents, README, and coverage report.
- Default `pnpm validate:flows` requires byte parity; `--write` regenerates only after semantic validation.
- State/transition mutation without Mermaid regeneration fails before other semantic claims.

### 5. Stale README

Repaired in:

- generated `docs/flows/README.md`

Evidence:

- README reports current 39 flows, 123 AST routes, and 161 state symbols.
- Status is `candidate_pending_chatgpt_v3_recheck`.
- It explicitly states repository validation does not substitute for ChatGPT agreement or PO verification.
- Byte drift fails `pnpm validate:flows`.

### 6. BIC-03 scope collision

Repaired in:

- `docs/project-management/linear/tts-research-best-in-class-batch-draft.json`
- generated packet Markdown
- `scripts/validate-linear-batch.mjs`

Evidence:

- BIC-03 is registry infrastructure only: schema, AST/parser, generator, report, and adversarial fixtures.
- BIC-03 has empty domain `routePatterns` and `stateSymbols` and explicitly excludes domain semantic authoring.
- BIC-04–10 exactly own all 38 non-startup flows, all 123 routes, and all 161 symbols once; APP-BOOT remains BIC-01.
- BIC-09 now includes TELEPROMPT and THEATRE.
- Packet validation compares issue flow/route/state scopes directly with the canonical flow manifest and rejects drift.
- BIC-04–10 acceptance requires closing their owned `plannedEvidence` gaps with named executable cases.

### 7. Post-change/final performance freshness

Repaired in:

- canonical packet JSON/Markdown
- `scripts/validate-linear-batch.mjs`
- `scripts/validate-linear-batch.test.mjs`

Evidence:

- BIC-11–17 require post-change `bench:frontend-performance` plus `validate:local:frontend-performance` on final issue bytes.
- Each requires raw and summary artifacts, exact source-hash binding, explicit core threshold keys, and zero measured failures/timeouts/missing marks.
- BIC-20 requires final-byte startup, runtime-resource, frontend-performance, and local frontend gates; raw/summary artifacts; final exact source hash; and the BIC-18/BIC-19 threshold union.
- Mutation tests reject missing post-change command, threshold, raw artifact, final command, or final-hash requirement.

## Reproduction commands

```text
cd /home/phoenix/projects/repos/tts-research
cd backend && go test ./cmd/flow-route-inventory -count=1
cd ..
node --test scripts/validate-flow-registry.test.mjs
mise exec -- pnpm validate:flows
node --test scripts/validate-linear-batch.test.mjs
node scripts/validate-linear-batch.mjs
mise exec -- pnpm format:check
mise exec -- pnpm check
git diff --check
```

## Creation gate

Linear creation remains blocked until a fresh archive-first ChatGPT response starts exactly with:

`AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH`
