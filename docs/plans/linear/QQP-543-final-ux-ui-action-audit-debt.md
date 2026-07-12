# QQP-543 — Resolve final UX UI action audit debt blocking QQP-441

Linear: https://linear.app/niklas-olsson/issue/QQP-543/resolve-final-ux-ui-action-audit-debt-blocking-qqp-441

## Context

QQP-542 fixed the Book Cinema responsive theatre canvas-budget blocker without relaxing budgets. After that repair, QQP-441 evidence gates pass except the long final UX gate:

- `mise exec -- pnpm generate:contracts` — PASS
- `mise exec -- pnpm validate:ir` — PASS
- `mise exec -- pnpm test:adapters` — PASS
- `mise exec -- pnpm e2e:readalong-sync` — PASS
- `mise exec -- pnpm e2e:readalong-performance` — PASS
- `mise exec -- pnpm e2e:book-cinema:responsive` — PASS
- `mise exec -- pnpm e2e:responsive-snapshots` — PASS
- `mise exec -- pnpm check` — PASS
- `mise exec -- pnpm review:chatgpt` — PASS
- `mise exec -- pnpm validate:ux-final` — FAIL

Latest report: `output/final-ux-gates/latest/final-ux-summary.md`.

## Current failure

`validate:ux-final` reports 12/13 clean gates passed. The remaining failed gate is UI action audit:

- `workspace-preview-generation-failed` scenario inventory fails waiting for `Audio does not match the current source, voice, policy, or scope`.
- `workspace-preview-asr-warning` scenario inventory fails waiting for `localized-preview-playback-toolbar`.
- 73 duplicate action groups are unclassified by the duplicate waiver registry.
- 31 duplicate groups are overexposed with burn-down owners.
- 8 duplicate groups are needs-consolidation.

## Scope

Fix or explicitly classify the final UX UI action audit debt so QQP-441 can close honestly.

In scope:
- RCA the two scenario inventory failures and make them deterministic.
- Classify duplicate action groups in the existing registry if they are accepted parity/proxy/scenario duplicates.
- Create explicit burn-down/waiver entries with owner/review date for intentional debt.
- Keep evidence hard-failing for real regressions.

Out of scope:
- Do not relax Book Cinema canvas budgets.
- Do not hide failed activations.
- Do not mark QQP-441 Done while `validate:ux-final` is red unless the residual failure is explicitly waived by repo policy and Linear evidence.

## Verification

Required before closeout:

```bash
mise exec -- pnpm validate:ux-final
mise exec -- pnpm check
git diff --check
```

If touched surfaces affect screenshots/review evidence:

```bash
mise exec -- pnpm review:chatgpt
```
