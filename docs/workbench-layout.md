# Workbench Layout Contract

Audience: frontend engineers and reviewers working on Voice Studio workspace density, panel visibility, and responsive behavior.

Purpose: make Narration and Voice Cloning layout modes predictable while keeping Settings, Command Center, and Theatre governed by their own surface contracts.

## Scope

Workbench layout applies to persistent Narration and Voice Cloning chrome:

- left source/context rail
- main work surface
- right contextual inspector
- bottom narration status strip
- advanced disclosure pins managed from the global Layout menu

Workbench layout does not resize Command Center, Settings, Cinema overlays, or Teleprompt Theatre runtime chrome. Those surfaces keep their own internal layout rules.

## Mode Matrix

| Mode | Work posture | Left context | Inspector | Status strip | Expert context |
| --- | --- | --- | --- | --- | --- |
| `Focus` | Protect attention on the active work surface. | Off. | Off unless attention disclosure promotes a compact recovery surface. | Essential strip. | Hidden unless blocking, warning, or active work requires recovery. |
| `Balanced` | Normal production work. | Compact source/context rail. | Compact or collapsed contextual inspector. | Compact production status. | Available through compact disclosure and Command Center Activity. |
| `Full` | Diagnosis and expert operation. | Full source/context rail. | Expanded inspector. | Expanded status. | Diagnostics and recovery entry points visible. |
| `Custom` | Power-user saved density. | Uses the global Layout menu setting. | Uses the global Layout menu setting. | Uses the global Layout menu setting. | Advanced pins are managed from the same Layout menu. |

Mode names describe a work posture, not just panel size. Do not add local `Full`, `Slim`, `Hide`, or `Less` controls to individual panels.

## Panel Visibility Rules

Layout mode owns baseline visibility. Disclosure logic may temporarily promote a hidden or collapsed rail, inspector, or status area only for blocking, warning, or active work.

Temporary inspector collapse and expand state is session-only. It resets when the stage or layout density changes.

Persistent workbench panel pinning is Custom layout. Pinning the workspace inspector changes the context-inspector slot to `Pinned` and switches the workspace to `Custom`. Advanced system pins are also controlled only from the Layout menu and persist only when `Remember panel pins` is enabled.

The bottom status strip is always the authoritative place for narration job status, cancellation, retry, queue, ETA, and readiness. Focus keeps the essential strip; Balanced keeps compact status; Full exposes expanded status.

The left rail rules apply to both Narration and Voice Cloning. Each workbench supplies its own compact and full content, but the global layout mode decides whether that content is persistent.

## Surface Exceptions

Command Center owns project management, assets, activity, import/export, and reports. It is opened from the shell and returns to the originating workbench without adopting workbench density.

Settings owns configuration and keeps the Quick / Advanced / Expert structure from `docs/settings-scope.md`. It is not resized by Focus, Balanced, Full, or Custom.

Theatre is a runtime layout, not a workbench density. Teleprompt Theatre and Cinema Theatre use Theatre chrome, Theatre status, and operator-preview controls. Exiting Theatre restores the previous workbench context and layout.

## Responsive Rules

Below `1024px`, persistent left and right rails are suppressed. A saved desktop layout may remain selected, but rendering is effectively focus-like with compact routes to status, inspector, and activity.

From `1024px` to `1535px`, Balanced shows compact side context, compact inspector/status, and a dominant main work surface. Full may show both side context and inspector, but rail widths must stay clamped.

At `1536px` and wider, Full can expose expert context with full rails and expanded status. Balanced remains compact and must not silently become Full.

## UI Memory

`Remember layout` is opt-in. When disabled, desktop restores Balanced and narrow viewports default to Focus. When enabled, restore order is project layout, browser layout, then the documented default.

`Remember panel pins` is separate from `Remember layout`. Advanced disclosure pins do not persist when panel-pin memory is disabled.

Resetting workspace layout clears layout mode, custom density, project layout overrides, and review-pane memory. Resetting all UI memory also clears panel pins and Theatre presentation memory.

## Validation

Review layout changes by confirming:

- one global Layout menu owns density and advanced pins
- no local rail, footer, or inspector reintroduces `Full`, `Slim`, `Hide`, or `Less` controls
- Focus removes persistent side panels while keeping essential status and recovery
- Balanced shows compact production context without crowding the work surface
- Full exposes expert context without duplicating Command Center or Settings responsibilities
- Theatre remains visually and behaviorally distinct from the workbench
- mobile and tablet portrait widths suppress persistent rails

Maintenance: update this document when a new persistent workbench panel, layout slot, layout mode, or density-persistence rule is introduced.
