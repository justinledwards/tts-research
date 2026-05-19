# Wayfinding and Policy Scope UX

Reader surfaces expose the same navigation model across Book, Document, and Website Cinema:

- Outline entries point at the closest structural scope or block.
- Bookmarks are saved on playback progress rows with their reading position.
- Recent positions come from non-hidden project progress rows, sorted by `updatedAt`.
- Resume uses locator data first, then falls back to `activeWordIndex` and text quote context.

Policy scope is shown as visible chips near the active reading surface:

- `Project default` is the durable project profile for unpinned sources.
- `Source pin` is a prepared-source or book-source profile/override that survives project profile changes.
- `Session override` is the current browser-session override set and wins only for previews or jobs.
- `Current profile` reflects the resolved profile returned by the active block policy decision.

Source pins are edited through the existing source speech-policy PATCH APIs. Clearing a pin returns the source to project-default behaviour; it does not clear session overrides.
