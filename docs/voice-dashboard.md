# Voice Profile Dashboard

The Voice Profile Dashboard is the management surface for saved voices, source recordings, candidate voices, clone targets, and diagnostics.

## Purpose

- Keep voice asset management out of the ordinary narration rail.
- Show saved voices, candidate readiness, clone target readiness, and runtime diagnostics together.
- Leave the Workspace rail with only the active voice summary and a voice-profile selector.

## Surface Model

- Workspace rail: active voice summary, saved voice count, profile selector, and dashboard entry.
- Voice cloning rail: dashboard entry for asset management while working in voice mode.
- Voice Profile Dashboard: saved voices, source recording, candidates, targets, diagnostics, delete/export/import affordances.

## Rules

- Delete voice actions require confirmation.
- Import/export controls remain disabled with a visible reason until the backend supports voice bundle operations.
- Running source analysis and clone targets expose cancellation only while cancellable.
- Diagnostics summarize runtime readiness instead of scattering setup details across normal reading panels.
- Voice Dashboard owns voice create/select/clone/delete/import/export, voice readiness, and voice-source diagnostics.
- Settings owns voice behavior for the next run; Preview owns audition and A/B comparison; Runtime/Diagnostics owns engine readiness and failures.

## Validation

- `pnpm e2e:workspace-flow` opens the Voice Profile Dashboard from the Workspace rail.
- `pnpm e2e:ui-actions` captures dashboard screenshots during the full stage traversal.
- `frontend/src/features/dashboard/dashboardOwnership.test.ts` locks voice dashboard action ownership.
