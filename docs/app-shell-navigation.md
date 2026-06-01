# App Shell Navigation

Audience: frontend engineers and reviewers working on Voice Studio workspace chrome, overlays, and recovery surfaces.

Purpose: keep the global shell stable while narration, voice cloning, project management, settings, and operational recovery evolve independently.

Layout and density behavior is governed by `docs/workbench-layout.md`.

## Shell Contract

The global shell is the user's anchor. It answers where the user is, which major workbench is active, how to change layout or settings, and how to reach project management.

Allowed in the shell header:

- `Voice Studio` identity and stable run-context summary.
- Command Center entry.
- Active work context summary for the current project and generated chapter.
- Narration / Voice Cloning mode switch.
- Workspace Layout control.
- Command Palette entry.
- Settings entry.

Forbidden in the shell header:

- Job lifecycle labels such as `Cancelled`, `Failed`, `Generating`, `Queued`, or `Complete`.
- Cancellation, retry, or create actions such as `Cancel Job`, `Cancel Run`, `Retry audio`, `Create & Listen`, or `Run`.
- Queue, ETA, segment progress, confidence, provider diagnostics, background-task counts, or active drawer state.
- Duplicate copies of bottom-strip or Command Center Activity messages.

Emergency exception: a compact app-wide blocking indicator may appear in the shell only when the whole app cannot be used. It must route to the unified status or recovery surface and must not duplicate job-level copy.

## Navigation Hierarchy

Global shell owns workspace orientation and global controls. It should not become a project dashboard or job dashboard.

Narration workbench owns Intake, Review, Preview, Teleprompt, and Theatre task flow.

Voice Cloning workbench owns source analysis, candidates, clone targets, and artifact readiness.

Command Center owns Projects, Assets, Activity, Import/Export, and Reports. Activity is the expanded place for cancellable background work.

Settings owns configuration only. It follows the shared Quick / Advanced / Expert grouping from `docs/settings-scope.md`.

Command Palette remains a secondary global action and search layer. It may open the same destinations as visible controls but must not become the only route for required tasks.

## Mode And Return Behavior

Switching between Narration and Voice Cloning changes only the active major workbench. It preserves the active project, source, job, block, voice, policy, layout mode, panel pins, and openable context.

Closing Command Center returns to the same major workbench that opened it. Its return label and aria label should name that destination, for example `Return to Narration Workbench` or `Return to Voice Cloning Workbench`.

Closing Settings returns to the same workbench context. Settings deep links may change the selected settings group or field, but they must not reset `studioMode` or `workspaceContext`.

Teleprompt and Theatre keep using the workspace return-memory rules in `docs/workspace-flow.md`.

## State Ownership

| State | Authoritative surface |
| --- | --- |
| App identity and major workbench | Global shell |
| Layout density and panel pins | Global shell Layout control |
| Project and asset management | Command Center |
| Long-running task list and cancellable background work | Command Center Activity |
| Narration job status, cancellation result, failure, retry, queue, ETA, and readiness | Bottom status strip |
| Stage-specific blockers and context | Workbench stage and inspector |
| Source import/preparation errors | Owning source workbench surface |
| Voice cloning analysis and target readiness | Voice Cloning workbench and Command Center Activity |
| Runtime, provider, and diagnostics configuration | Settings Runtime / Diagnostics |

## Validation

Review shell changes by confirming:

- The header remains visually stable during generation, review, retry, failure, and cancellation.
- Operational messages appear in one authoritative place.
- Command Center and Settings close back to the same workbench context.
- The active major workbench is always visible.
- Bottom status strip cancellation/failure copy is not repeated in the shell.

Maintenance: update this document when a new persistent header control, workbench mode, recovery state, or top-level overlay is introduced.
