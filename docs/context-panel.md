# Unified Context Panel

The context panel is the shared right-side model for Review, Cinema inspector details, diagnostics, policy notes, and Teleprompt return context.

## Tabs

- `Overview`: current source, provenance, current passage, and readiness summary.
- `Review`: active review task, narration block status, spoken-form status, and section queues.
- `Diagnostics`: extraction health, generated-audio health, timing map, highlight confidence, skipped content, and other operator checks.
- `Policy`: speech policy scope, source pins, voice-policy facts, and policy notes.
- `History`: outline, bookmarks, recent positions, and return context.

`Diagnostics` is advanced by default. It remains discoverable through Debug mode, command/operator paths, and the context tab list, but normal Read mode stays canvas-first.

## Focus Mode Defaults

Cinema focus modes map to context defaults:

- `Read`: no context panel unless a tab is pinned.
- `Inspect`: `Overview`.
- `Review`: `Review`.
- `Debug`: `Diagnostics`.

Pinned context state is presentation-only. It does not change playback, source selection, policy selection, saved progress, or generated audio.

## Implementation

Shared implementation lives in `frontend/src/features/context-panel/`:

- `contextPanelTabs.ts`: tab ids, labels, descriptions, and advanced status.
- `contextPanelModel.ts`: section kinds, ownership metadata, tab grouping, normalization, and focus-mode defaults.
- `ContextPanel.tsx`: accessible tab list, active tab body, section shells, and optional pin control.

Cinema surfaces adapt content-specific data into thin context sections, then consume the shared tab model. Workspace Review and Teleprompt return context use the same component instead of separate accordion/detail/drawer vocabularies.

## Ownership Guardrails

Every context section resolves shared ownership metadata before rendering:

- `panelId`: one of `overview`, `review`, `diagnostics`, `policy`, or `history`.
- `owner`: `cinema`, `review`, `teleprompt`, `workspace`, or the shared `context-panel`.
- `allowedSurfaces`: the surfaces where the section may render.
- `emptyState`: useful copy for no-content states.
- `relevance`: the predicate that explains why the section belongs in the panel.
- `debugOnly`: marks Diagnostics-only content.

Validation fails the context-panel audit when a section has no owner, relevance predicate, allowed
surface, or empty-state copy; when Diagnostics appears in a normal Cinema `Read` state; when Review
and Diagnostics duplicate the same section data in one surface; or when a section renders outside
its allowed surface.

## Section Kinds

Context sections use semantic kinds rather than surface-specific names:

- `current-passage`
- `source-provenance`
- `extraction-health`
- `speech-policy`
- `policy-notes`
- `timing-map`
- `highlight-confidence`
- `skipped-content`
- `generated-audio-health`
- `narration-block-status`
- `wayfinding`

New surfaces should add thin adapters that produce these section kinds before creating new side-panel UI.
