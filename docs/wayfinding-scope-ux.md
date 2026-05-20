# Wayfinding and Policy Scope UX

Reader surfaces expose the same navigation model across Book, Document, and Website Cinema:

- Outline entries point at the closest structural scope or block.
- Bookmarks are saved on playback progress rows with their reading position.
- Recent positions come from non-hidden project progress rows, sorted by `updatedAt`.
- Resume uses locator data first, then falls back to `activeWordIndex` and text quote context.

Wayfinding now lives in the shared cinema inspector model:

- `Read` mode hides wayfinding unless the panel is pinned, keeping the canvas dominant.
- `Review` mode exposes the Wayfinding panel with Outline, Bookmarks, and Recent tabs.
- Bookmark creation is placed with the wayfinding panel and footer transport controls, not in separate per-surface rail stacks.
- Switching focus modes must not change active outline position, saved bookmarks, or recent-position ordering.

Policy scope is shown as visible chips near the active reading surface:

- `Project default` is the durable project profile for unpinned sources.
- `Source pin` is a prepared-source or book-source profile/override that survives project profile changes.
- `Session override` is the current browser-session override set and wins only for previews or jobs.
- `Current profile` reflects the resolved profile returned by the active block policy decision.

Provenance, policy, and health information remain discoverable through inspector modes:

- `Inspect` groups source provenance, current passage/block context, policy scope, and extraction health.
- `Debug` groups skipped content, policy notes, generated-audio health, and timing diagnostics.
- Pinned inspector panels are session-only and may stay visible in `Read` without expanding all other panels.

Source pins are edited through the existing source speech-policy PATCH APIs. Clearing a pin returns the source to project-default behaviour; it does not clear session overrides.
