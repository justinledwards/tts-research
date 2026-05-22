# Project Dashboard

The Project Dashboard is the management surface for studio assets that should not crowd the normal narration workflow.

## Purpose

- Manage projects, source material, generated audio, storage, and project bundles from one dashboard.
- Keep the Workspace rail focused on the active source and current narration job.
- Make protected/deletable state explicit before destructive actions.

## Surface Model

- Workspace rail: active source summary, source count, and an entry to the dashboard.
- Workspace drawer: project overview and dashboard entry.
- Project Dashboard: create, open, rename, delete, import, export, source inventory, generated audio, and storage summary.

## Rules

- The default project is protected from deletion.
- Project deletion requires an inline confirmation.
- Export always targets the current project.
- Import opens the bundle flow before mutating project state.
- Source selection and narration review remain in the Workspace; asset management stays in the dashboard.
- Project Dashboard owns project open/create/rename/delete/import/export/protect, source inventory, generated audio, and project status.
- Settings owns configuration, Preview owns audition and A/B comparison, Cinema owns full playback, and Runtime/Diagnostics owns engine readiness.

## Validation

- `pnpm e2e:workspace-flow` opens the Project Dashboard from the Workspace rail.
- `pnpm e2e:ui-actions` includes the dashboard in the full stage traversal.
- `frontend/src/features/dashboard/dashboardOwnership.test.ts` locks project dashboard action ownership.
