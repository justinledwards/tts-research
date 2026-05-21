# Wayfinding and Policy Scope UX

Reader surfaces expose the same navigation model across Book, Document, and Website Cinema:

- Outline entries point at the closest structural scope or block.
- Bookmarks are saved on playback progress rows with their reading position.
- Recent positions come from non-hidden project progress rows, sorted by `updatedAt`.
- Resume uses locator data first, then falls back to `activeWordIndex` and text quote context.

Wayfinding now lives in the shared context panel model:

- `Read` mode hides wayfinding unless the `History` tab is pinned, keeping the canvas dominant.
- `Review` mode opens the `Review` tab by default and keeps Outline, Bookmarks, and Recent positions in `History`.
- Bookmark creation is placed with the wayfinding panel and footer transport controls, not in separate per-surface rail stacks.
- Switching focus modes must not change active outline position, saved bookmarks, or recent-position ordering.

Policy scope is shown as visible chips near the active reading surface. Shared settings scope labels live in `docs/settings-scope.md`:

- `Project default` is the durable project profile for unpinned sources.
- `Source pin` is a prepared-source or book-source profile/override that survives project profile changes.
- `Session override` is the current browser-session override set and wins only for previews or jobs.
- `Current profile` reflects the resolved profile returned by the active block policy decision.

Provenance, policy, and health information remain discoverable through context tabs:

- `Overview` groups source provenance, current passage context, and readiness summary.
- `Policy` groups speech policy scope, source pins, voice-policy facts, and policy notes.
- `Diagnostics` groups skipped content, extraction health, generated-audio health, highlight confidence, and timing diagnostics.
- Pinned context tabs are session-only and may stay visible in `Read` without expanding all other panels.

Footer transport is shared across Book, Document, and Website Cinema. Left/J and Right/L seek by 10 seconds, matching the visible `-10s` and `+10s` controls. The mobile bottom sheet uses `Source`, `Structure`, and `Narration` panels so source selection, outline/bookmark/recent navigation, and current narration context stay in predictable places.

The global command palette also exposes bookmark navigation, recent-position jumps, and cinema focus-mode switches. Its shortcut reference and UX contract live in `docs/command-palette.md`; the visible wayfinding panel remains the primary non-palette path.

Source pins are edited through the existing source speech-policy PATCH APIs. Clearing a pin returns the source to project-default behaviour; it does not clear session overrides. Studio Settings mirrors this same split under `Sources` so users can distinguish session overrides, source pins, project defaults, and machine/runtime settings.
