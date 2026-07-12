# Surface Complexity Budget

Local review now includes a surface complexity gate so reviewers can see when a normal user
surface is drifting into operator/debug density. The gate is generated from the same browser action
inventory used by the UI action audit.

Run:

```bash
pnpm e2e:surface-complexity
```

Artifacts:

- `output/ui-complexity/latest/budget.json`
- `output/ui-complexity/latest/budget.md`
- `output/ui-complexity/latest/source-action-audit/`

## What Is Measured

Each scenario records:

- visible actions
- primary actions
- disabled actions
- destructive actions
- panels open by default
- drawers and sheets reachable from the current surface
- duplicated visible labels
- average accessible-label length
- visible chips and badges
- active modes and tabs

The metrics are intentionally simple and reviewable. They are a guardrail, not a replacement for
human UX review.

## Budget Tiers

Read mode is `calm`: one primary reading task, compact transport, and diagnostics hidden by
default.

Preview and Teleprompt are `standard`: the main audition or presenter toolbar stays primary, with
workflow actions secondary.

Review and Workspace are `dense`: batch actions, context, and rail controls are allowed, but the
budget still catches runaway duplication and hidden required paths.

Debug and pinned-inspector states are `advanced`: they may exceed normal density only because they
are explicitly operator-facing.

## Review Rules

- Read mode should remain canvas-first.
- Preview must not become a second full Cinema.
- Review gets one primary review action group; batch actions are secondary.
- Teleprompt keeps presenter controls primary.
- Settings Quick exposes common settings only; expert/debug settings belong in advanced groups.
- Command Palette remains secondary navigation, not a dumping ground for hidden required tasks.

When a new control exceeds a budget, either simplify the surface or classify the control into an
advanced/debug path with an owner and reason.
