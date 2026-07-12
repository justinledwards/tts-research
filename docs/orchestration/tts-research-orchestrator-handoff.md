# TTS-Research Orchestrator Handoff

Status: ready for orchestrated sub-agent execution  
Updated: 2026-07-07 16:18 CEST

Latest session-specific handover: `docs/orchestration/session-20260707_122027_0bfb3a-handover.md`

## Purpose

This handoff is for an orchestrator Agent that keeps the TTS-Research / Voice Studio first batch under control while delegating implementation details to focused sub-agents.

The orchestrator owns sequencing, scope, Linear state, verification, review loops, commits, and user-facing status. Sub-agents own all implementation and review tasks.

The main Agent session is orchestration-only. Product-code edits must be performed by focused sub-agents, not by the main Agent.

## Non-negotiable operating model

1. Linear is the live execution source.
2. Repo docs are durable architecture and PM source of truth.
3. ChatGPT threads are architecture/review records, not ongoing PM.
4. `QQP-4` remains the existing Quick Listen capture anchor; do not create a duplicate Quick Listen issue.
5. Active Linear issue cap is full: 20 active issues. Do not create more active issues until completed batch work is archived/removed from the active set.
6. Work one dependency wave at a time; do not start downstream issues until prerequisite artifacts are merged and verified.
7. Use fresh sub-agents per implementation/review task. Do not let a worker self-review replace independent review.
8. Main Agent product-code edits are prohibited. Product-code work includes backend/frontend code, tests, scripts, schemas, fixtures, generated outputs, and migrations.
9. Main Agent may edit orchestration artifacts only: handovers, issue plans, WORKINGLOG entries, Linear comments, and prompt templates.
10. Stop on no-progress liveness. Before restart require facts/logs, RCA, executable anti-stall fix, and a revised prompt.
11. No hidden continuation. Stop when asked; do not run periodic review loops unless explicitly requested.
12. Success reports require artifact-backed verification on intended infrastructure.

## Repo and branch

- Repo: `/home/phoenix/projects/repos/tts-research`
- Legacy symlink: `/home/phoenix/git/tts-research`
- Branch: `niklas/voice-studio-follow-up`
- Remote: `fork/niklas/voice-studio-follow-up`
- Tooling: use `mise exec -- ...` for repo checks and scripts.

## Required source docs

Read these before dispatching any worker:

- `AGENTS.md`
- `WORKINGLOG.md`
- `docs/architecture/source-reader-flow-invariants.md`
- `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`
- `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`
- `docs/project-management/linear/tts-research-project-setup.md`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`

Use supporting domain docs as needed:

- `docs/contracts/content-ir.md`
- `docs/contracts/locators.md`
- `docs/contracts/speech-plan.md`
- `docs/temporary-source-domain-model.md`
- `docs/temporary-source-migration-strategy.md`
- `docs/privacy-local-first.md`
- `docs/performance.md`
- `reviewer-screenshot-manifest.md`

## Batch issue map

| Order | Linear | Slug | Priority | Dependencies | Atomic deliverable |
| --- | --- | --- | --- | --- | --- |
| 1 | QQP-423 | `readalong-contracts` | P1 | none | Add the complete first-batch sidecar contract pack with docs, schemas, fixtures, and validation, without runtime implementation. |
| 2 | QQP-424 | `source-lifecycle-storage` | P1 | readalong-contracts | Persist source identity, source revisions, raw source artifacts, and startup interrupted_retriable marking for orphaned active work. |
| 3 | QQP-425 | `manifest-snapshot-storage-api` | P1 | readalong-contracts, source-lifecycle-storage | Persist and retrieve reading-unit/readalong manifest snapshots by source/revision/manifest identity. |
| 4 | QQP-426 | `stable-unit-ir-core-adapters` | P1 | readalong-contracts | Make HTML, EPUB, and Markdown core adapters emit stable unit IDs, order keys, fingerprints, locators, and provenance. |
| 5 | QQP-427 | `lower-tier-adapter-contract-fit` | P2 | readalong-contracts | Produce deterministic contract-fit reports and warnings for non-core adapters without claiming best-in-class behavior. |
| 6 | QQP-428 | `epub-html-incremental-extraction` | P1 | source-lifecycle-storage, manifest-snapshot-storage-api, stable-unit-ir-core-adapters | Emit readable HTML/EPUB units incrementally and write manifest snapshots as units become available. |
| 7 | QQP-429 | `source-manifest-event-stream` | P1 | readalong-contracts, manifest-snapshot-storage-api | Implement a sequenced backend source/manifest event protocol with deterministic tests and snapshot fallback. |
| 8 | QQP-430 | `frontend-source-manifest-store` | P1 | source-manifest-event-stream, manifest-snapshot-storage-api | Add a frontend store keyed by source/revision/manifest identity with reconnect and snapshot fallback behavior. |
| 9 | QQP-431 | `incremental-speech-plan-segmentation` | P1 | readalong-contracts, manifest-snapshot-storage-api, epub-html-incremental-extraction | Generate speech-plan segments tied to source/revision/manifest/unit identity from the earliest contiguous narratable prefix. |
| 10 | QQP-432 | `partial-audio-artifact-states` | P1 | incremental-speech-plan-segmentation | Persist segment-level audio artifact states and replacement/reuse semantics for unchecked, checked, stale, replaced, failed, and retryable audio. |
| 11 | QQP-433 | `sync-fidelity-gates` | P1 | partial-audio-artifact-states | Gate sync/highlight fidelity so exact word highlighting is only allowed with sufficient revision, mapping, timing, and resource evidence. |
| 12 | QQP-434 | `durable-progress-resume-resolver` | P1 | source-lifecycle-storage, manifest-snapshot-storage-api, sync-fidelity-gates | Persist canonical progress and deterministically resolve reopen/resume state across current, stale, degraded, failed, interrupted, remapped, and superseded manifests. |
| 13 | QQP-435 | `retry-interrupted-artifact-semantics` | P1 | source-lifecycle-storage, partial-audio-artifact-states, durable-progress-resume-resolver | Implement artifact/segment-scoped retry behavior across cancellation, provider failure, backend restart, checking failure, and compatible reuse. |
| 14 | QQP-436 | `minimal-repair-overlay-supersession` | P2 | readalong-contracts, manifest-snapshot-storage-api, durable-progress-resume-resolver, retry-interrupted-artifact-semantics | Add immutable repair overlays, superseding manifests, affected-artifact stale marking, and revision-map-based progress remap. |
| 15 | QQP-437 | `quick-listen-promotion-crosswalk` | P1 | QQP-4, source-lifecycle-storage, manifest-snapshot-storage-api, partial-audio-artifact-states, durable-progress-resume-resolver | Promote temporary Quick Listen sources into durable project sources while preserving mapped progress, artifacts, highlights, and source identity. |
| 16 | QQP-438 | `reader-shell-state-vocabulary` | P1 | frontend-source-manifest-store | Add Reader shell labels/state vocabulary for source-only, generating, unchecked, checked, degraded, stale, failed, retryable, and superseded states. |
| 17 | QQP-439 | `reader-transport-state-machine` | P1 | partial-audio-artifact-states, reader-shell-state-vocabulary | Add shared Reader transport states for pre-audio, generating, unchecked, checked, stale/replaced, failed/retryable, and degraded playback. |
| 18 | QQP-440 | `reader-windowing-highlight-scheduling` | P1 | sync-fidelity-gates, reader-shell-state-vocabulary, reader-transport-state-machine | Implement internal reader windowing, high-frequency highlight isolation, and low-resource fidelity downgrade behavior. |
| 19 | QQP-441 | `active-processing-evidence-gates` | P2 | quick-listen-promotion-crosswalk, reader-windowing-highlight-scheduling, retry-interrupted-artifact-semantics, minimal-repair-overlay-supersession, lower-tier-adapter-contract-fit | Produce the final deterministic evidence package for the canonical fixture, performance budgets, degraded modes, screenshots, logs, and review handoff. |

## Execution waves

### Wave 0 — orchestration readiness

- Confirm clean tree or explicitly record local changes.
- Confirm Linear active count remains 20 and no hidden pagination.
- Confirm `docs/project-management/linear/tts-research-first-batch.draft.manifest.json` still matches Linear issue identifiers.
- Append a concise `WORKINGLOG.md` section for each new orchestrated work segment.

### Wave 1 — contracts and source truth

1. QQP-423 / `readalong-contracts`
2. QQP-424 / `source-lifecycle-storage`
3. QQP-426 / `stable-unit-ir-core-adapters`
4. QQP-427 / `lower-tier-adapter-contract-fit`

Rationale: implementation must not start inventing sidecar shapes ad hoc.

### Wave 2 — manifest snapshots, source proof, events

1. QQP-425 / `manifest-snapshot-storage-api`
2. QQP-428 / `epub-html-incremental-extraction`
3. QQP-429 / `source-manifest-event-stream`
4. QQP-430 / `frontend-source-manifest-store`

Rationale: UI and pipeline workers need a source/manifest spine before adding behavior.

### Wave 3 — generation, audio, sync, resume

1. QQP-431 / `incremental-speech-plan-segmentation`
2. QQP-432 / `partial-audio-artifact-states`
3. QQP-433 / `sync-fidelity-gates`
4. QQP-434 / `durable-progress-resume-resolver`
5. QQP-435 / `retry-interrupted-artifact-semantics`

Rationale: read-along correctness depends on artifact identity, honest sync gates, and resume/retry semantics.

### Wave 4 — repair and promotion

1. QQP-436 / `minimal-repair-overlay-supersession`
2. QQP-437 / `quick-listen-promotion-crosswalk`

Rationale: repairs/promotion fork or map identities; they must build on stable manifest/progress semantics.

### Wave 5 — Reader UI and responsiveness

1. QQP-438 / `reader-shell-state-vocabulary`
2. QQP-439 / `reader-transport-state-machine`
3. QQP-440 / `reader-windowing-highlight-scheduling`

Rationale: UI must consume manifest-derived state rather than infer from job state.

### Wave 6 — final evidence

1. QQP-441 / `active-processing-evidence-gates`

Rationale: this is evidence-only and should not implement missing feature work.

## Orchestrator loop per issue

For each issue:

1. Fetch current Linear issue details and comments.
2. Confirm dependencies are completed or explicitly not required for a planning-only issue.
3. Write a small issue implementation plan under `docs/plans/linear/QQP-XXX-<slug>.md` before code work.
4. Dispatch a fresh implementation sub-agent with:
   - exact Linear issue identifier and URL;
   - atomic deliverable and non-goals;
   - exact source docs and file paths;
   - TDD/verification commands;
   - requirement to commit only after local verification, if the sub-agent is allowed to commit.
5. Independently inspect the worker result:
   - `git diff --stat`;
   - relevant file reads;
   - targeted tests/evidence actually run by parent or verified from logs.
6. Dispatch a fresh spec-review sub-agent.
7. Fix/re-review until spec review passes.
8. Dispatch a fresh quality-review sub-agent.
9. Fix/re-review until quality review approves.
10. Run issue-specific verification in the parent session.
11. Run `mise exec -- pnpm check` before marking complete.
12. Run `mise exec -- pnpm review:chatgpt` if screenshots, UI, review package content, or evidence manifests changed.
13. Update `WORKINGLOG.md`, local plan status, and Linear comments with evidence.
14. Commit and push only reviewed/verified changes.
15. Move Linear state only after evidence is attached/commented.

## Main-agent code boundary

The main Agent is the controller, not the coder.

Allowed in the main session:

- preflight discovery and dependency selection;
- Linear comments/state changes;
- issue plans, handover docs, WORKINGLOG entries, and prompt templates;
- read-only diff/file inspection;
- verification commands;
- final commit/push after review and verification.

Not allowed in the main session:

- backend/frontend implementation edits;
- test, fixture, schema, script, generator, migration, or generated-output edits;
- “quick fixes” after reviewer feedback;
- recovery-by-coding after a worker timeout.

If code must change, dispatch a focused implementer or repair sub-agent with the exact scope, prior findings, current dirty-tree state, and verification commands.

## Sub-agent roles

### Implementer sub-agent

Scope: make a narrowly specified change.

Required output:

- files changed;
- tests/evidence run with exit codes;
- assumptions made;
- anything intentionally deferred;
- commit hash if it committed.

Hard rules:

- no broad refactors;
- no unrequested issue creation;
- no changes outside the issue scope;
- no success claim without command output;
- no direct Linear status changes unless explicitly delegated.

### Spec-review sub-agent

Scope: compare implementation to Linear issue + plan + architecture invariants.

Required output:

- `SPEC PASS` or `SPEC FAIL`;
- missing/extra scope items;
- invariant violations;
- exact files/lines or tests supporting the verdict.

### Quality-review sub-agent

Scope: code quality, tests, maintainability, integration risk.

Required output:

- `QUALITY APPROVED` or `QUALITY REQUEST_CHANGES`;
- critical/important/minor issues;
- test gaps;
- simplification opportunities;
- security/privacy/local-first concerns.

### Evidence-review sub-agent

Use for UI/evidence-heavy issues.

Required output:

- screenshot/evidence manifest completeness;
- expected screen-size coverage;
- whether degraded/stale/failure states are visible and honest;
- `review:chatgpt` archive manifest path/hash if run.

## Parent verification commands

Use the narrowest relevant checks first, then full gates before merge/complete.

Baseline contract gates:

```bash
mise exec -- pnpm generate:contracts
mise exec -- pnpm validate:ir
mise exec -- pnpm test:adapters
```

Standard full gate:

```bash
mise exec -- pnpm check
```

Review package gate:

```bash
mise exec -- pnpm review:chatgpt
```

Backend focused gate:

```bash
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./... -timeout 15m
```

UI/reader gates as applicable:

```bash
mise exec -- pnpm e2e:readalong-sync
mise exec -- pnpm e2e:readalong-performance
mise exec -- pnpm e2e:book-cinema:responsive
mise exec -- pnpm e2e:responsive-snapshots
mise exec -- pnpm validate:ux-final
```

## Required prompt skeleton for implementers

Use `docs/orchestration/templates/subagent-implementation-prompt.md`.

Every implementer prompt must include:

- issue identifier, URL, slug, and title;
- atomic deliverable copied from the manifest;
- explicit non-goals;
- architecture invariants relevant to the issue;
- exact files/docs to inspect;
- exact tests/evidence to run;
- output contract.

## Required review templates

Use:

- `docs/orchestration/templates/spec-review-prompt.md`
- `docs/orchestration/templates/quality-review-prompt.md`
- `docs/orchestration/templates/evidence-review-prompt.md`

## Linear comments

After each meaningful milestone, add a Linear comment in this shape:

```markdown
Orchestrator update:
- Scope: <what changed>
- Evidence: <commands + exit codes + artifacts>
- Review: <spec/quality/evidence verdicts>
- Next: <next dependency or blocker>
```

Do not paste long ChatGPT transcripts into Linear. Link repo docs instead.

## Stop / escalation rules

Stop and report to the user if:

- a sub-agent changes files outside scope;
- checks fail twice without new RCA;
- Linear active count no longer matches the local manifest;
- ChatGPT/architecture agreement appears contradicted by implementation reality;
- a task requires expanding beyond its atomic issue;
- a worker is stuck/no-progress and logs do not show meaningful movement;
- external service/login/API access blocks deterministic verification.

Before restarting a stuck worker:

1. poll/wait and inspect logs;
2. inspect process tree if applicable;
3. identify RCA;
4. update the prompt to prevent the same stall;
5. verify repo state and service health;
6. start a fresh worker only if the anti-stall fix is concrete.

## Definition of done for an issue

An issue is complete only when all are true:

- atomic deliverable implemented exactly;
- no known spec or quality blockers;
- issue-specific tests/evidence pass;
- `mise exec -- pnpm check` passes;
- `mise exec -- pnpm review:chatgpt` passes when evidence/UI/review package changed;
- architecture invariants still hold;
- Linear comment contains evidence and commit hash;
- changes are committed and pushed.

## Definition of done for the batch

The first batch is complete only when:

- all active batch issues are Done or archived according to capacity policy;
- `Design for the Real World` evidence lane exists and is included in `review:chatgpt`;
- all required complete-UI screenshots across phone/constrained/desktop/large desktop are present;
- active Linear count is reduced before any next batch is created;
- repo docs are updated with what changed and what was deferred.
