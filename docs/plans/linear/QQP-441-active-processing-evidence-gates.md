# QQP-441 — First-batch active-processing and canonical fixture evidence gate

Linear: https://linear.app/niklas-olsson/issue/QQP-441/first-batch-active-processing-and-canonical-fixture-evidence-gate

## Goal

Produce the final deterministic evidence package for the canonical fixture, performance budgets, degraded modes, screenshots, logs, and review handoff for the first batch.

This is evidence-only. It must not hide missing subsystem implementation work.

## Dependency preflight

Live Linear dependency check passed after QQP-437 closeout:

- QQP-427 lower-tier-adapter-contract-fit: Done
- QQP-435 retry-interrupted-artifact-semantics: Done
- QQP-436 minimal-repair-overlay-supersession: Done
- QQP-437 quick-listen-promotion-crosswalk: Done (`02dd04dff8b7e75d391a7022cbfe0dcd03afc14f`)
- QQP-438 reader-shell-state-vocabulary: Done
- QQP-439 reader-transport-state-machine: Done
- QQP-440 reader-windowing-highlight-scheduling: Done

Repo state before kickoff:

- branch: `niklas/voice-studio-follow-up`
- local/remote equality: `02dd04dff8b7e75d391a7022cbfe0dcd03afc14f`
- worktree clean before this kickoff plan/log

## Scope

In scope:

- deterministic canonical fixture evidence package
- performance budget evidence
- degraded-mode evidence
- screenshots/logs/review handoff artifacts
- test/evidence harnesses only when required to make evidence deterministic
- final `mise exec -- pnpm check`
- `mise exec -- pnpm review:chatgpt` if screenshot/evidence-impacting work requires it

Out of scope:

- new Quick Listen capture behavior (QQP-4)
- promotion crosswalk implementation (QQP-437)
- Reader implementation gaps from dependency issues
- broad feature implementation disguised as evidence

## Required references

- `docs/architecture/source-reader-flow-invariants.md`
- `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`
- `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`

## Worker brief

1. Discover current evidence/review scripts and canonical fixture commands.
2. Identify the minimal deterministic evidence package QQP-441 must produce or refresh.
3. Implement/repair only evidence harnesses or generated evidence docs needed for deterministic output.
4. Run issue-specific evidence commands.
5. Run `mise exec -- pnpm check` if feasible; otherwise return the exact blocker.
6. Do not commit, push, or update Linear.

## Parent gates

- fan-in actual diff and untracked files
- run focused evidence gates
- run `mise exec -- pnpm check`
- run required SPEC then QUALITY review
- commit/push/remote-verify
- close QQP-441 in Linear
