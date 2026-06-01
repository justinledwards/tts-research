# Contextual Inspector

The contextual inspector is the single secondary information area for workspace Review, Preview, Intake, Teleprompt, Cinema inspector details, diagnostics, policy notes, and return context. It keeps main narration and playback surfaces calm while preserving expert detail behind one stage-aware panel.

The shared rendering primitive is still `ContextPanel`, but the user-facing label is `Inspector`.

Workbench inspector visibility is governed by `docs/workbench-layout.md`; this document defines inspector content, ownership, and display states.

## Information Architecture

- `Overview`: source, provenance, import confidence, current passage, and readiness summary.
- `Review`: active block or cue, block status, generated-audio queue, repair context, and return target.
- `Diagnostics`: extraction health, generated-audio health, timing map, highlight confidence, skipped content, backend/runtime checks, and other operator details.
- `Policy`: speech policy scope, source pins, selected voice, pronunciation, voice-policy facts, and policy notes.
- `History`: outline, bookmarks, recent positions, previous returns, and wayfinding context.

Sections carry priority metadata:

- `critical`: blockers and readiness failures that may also appear in main status banners.
- `primary`: the highest-value context for the current stage or selected object.
- `secondary`: useful supporting facts that should not crowd the main surface.
- `advanced`: diagnostics and internals that stay reachable without appearing by default in calm states.

## Stage Defaults

- `Intake`: expanded summary when source activity exists; source metadata and import confidence come first.
- `Review`: expanded and focused on the selected block, diagnostics, policy, pronunciation, repairs, and return history.
- `Preview`: expanded summary with readiness, generated audio, queue health, voice, and policy scope first.
- `Teleprompt`: collapsed summary by default; pinned only when the layout asks for a full inspector.
- `Theatre`: hidden unless summoned or pinned, then shows cue timing, sync, operator settings, exit paths, and audio readiness.

Collapsed state shows one compact inspector affordance plus the highest-priority blocker or readiness summary. Expanded state follows stage and selection changes automatically. Pinned state keeps the full inspector visible and preserves the active tab for the current session; local persistence follows the existing `rememberPanelPins` UI memory preference.

## Workspace Migration

Workspace layouts expose one secondary information area:

- Main stage: Intake, Review, Preview, Teleprompt, or Theatre reading/playback surface.
- Compact header/status summaries: primary wayfinding and blockers.
- Inspector: source, voice, policy, diagnostics, queue, generated audio, and history details.

The inspector replaces repeated persistent rails and panels:

- Source metadata strips, intake source metadata, and source detail rails move into the Source and Import confidence sections.
- Preview voice, policy, scope facts, and policy notes move into Voice and Policy sections.
- Review math, rules, pronunciation, transcript, and repair context move into Review, Policy, and Diagnostics sections.
- Audio lifecycle, buffer, queue, and job details move into Queue and generated-audio sections.
- Runtime/backend metrics and setup diagnostics move into Diagnostics.
- Teleprompt tabs use the same inspector adapter while preserving compact summary and pinned behavior.
- Cinema keeps its existing inspector dock but shares section priorities and labels.

The inspector must not repeat the main reading canvas, spoken-text body, or primary playback toolbar. Blocking issues may appear both in the main stage status strip and in the inspector.

## Implementation

Shared implementation lives in `frontend/src/features/context-panel/`:

- `contextPanelTabs.ts`: tab ids, labels, descriptions, and advanced status.
- `contextPanelModel.ts`: section kinds, priorities, display state, ownership metadata, tab grouping, normalization, and focus-mode defaults.
- `ContextPanel.tsx`: accessible tab list, collapsed/expanded/pinned display states, section shells, and optional pin control.
- `InspectorSections.tsx`: reusable Source, Voice, Policy, Diagnostics, Queue, and History section bodies.
- `WorkspaceContextInspector.tsx`: workspace-level adapter that combines stage context with selection, source, voice, policy, job/audio, diagnostics, disclosure, and return/history context.

## Ownership Guardrails

Every section resolves shared ownership metadata before rendering:

- `panelId`: one of `overview`, `review`, `diagnostics`, `policy`, or `history`.
- `owner`: `cinema`, `review`, `teleprompt`, `workspace`, or the shared `context-panel`.
- `allowedSurfaces`: the surfaces where the section may render.
- `emptyState`: useful copy for no-content states.
- `relevance`: the predicate that explains why the section belongs in the panel.
- `priority`: one of `critical`, `primary`, `secondary`, or `advanced`.
- `debugOnly`: marks Diagnostics-only content.

Validation fails the context-panel audit when more than one workspace inspector is visible, when the legacy Review panel appears alongside the Workspace inspector, when a section lacks owner, relevance, priority, allowed surface, or empty-state metadata, when Diagnostics appears in a normal Cinema `Read` state, when Review and Diagnostics duplicate the same section data in one surface, or when a section renders outside its allowed surface.

## Section Kinds

Context sections use semantic kinds rather than surface-specific names:

- `current-passage`
- `source-provenance`
- `import-confidence`
- `extraction-health`
- `speech-policy`
- `policy-notes`
- `voice-profile`
- `timing-map`
- `highlight-confidence`
- `skipped-content`
- `generated-audio-health`
- `generation-queue`
- `narration-block-status`
- `alignment-repair`
- `wayfinding`

New surfaces should add thin adapters that produce these section kinds before creating new side-panel UI.
