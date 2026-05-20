# Cinema Focus Modes

Cinema surfaces share one focus model across Book, Document, and Website Cinema.

- `Read` is the default for every newly opened cinema overlay. It is canvas-first: desktop inspector rails are hidden unless a panel is pinned, and secondary reader chrome is suppressed inside the canvas.
- `Inspect` prioritizes source provenance, current passage, speech policy, and extraction health.
- `Review` prioritizes the current passage, wayfinding, bookmarks, recent positions, speech policy, and section queues.
- `Debug` prioritizes extraction warnings, skipped content, generated-audio health, policy notes, and timing diagnostics. It is advanced-only by default: keep it behind `More`, advanced command-palette entries, keyboard/operator paths, or an explicit developer preference instead of placing it in the primary reader mode strip.

Inspector panels are single-panel docks. Switching focus mode changes the available panel group instead of expanding every card at once. The `Pin` control keeps the current panel visible while moving between modes, including `Read`; unpinning returns `Read` to a fully canvas-first layout.

Pinned panel state must not look like a second active reader mode. The active mode uses the strongest selected state. A pinned inspector panel uses only the pin control or a small pin badge in the panel list; its tab/list item must not also use the selected styling reserved for active panels.

Focus mode, active panel, and pinned panel state are session-only overlay state by default. Closing and reopening a cinema surface starts in `Read` mode with no pinned inspector panel unless the user has enabled `Remember my layout` in Studio Settings.

When `Remember my layout` is enabled:

- Book, Document, and Website Cinema each remember focus mode, active dock panel, and pinned panel independently on this browser.
- Remembered state is presentation-only. It must not change bookmarks, progress, source pins, locators, content state, speech policy, or playback transport.
- `Reset UI memory` clears remembered Cinema state and returns every open or reopened cinema surface to `Read` with no active or pinned inspector panel.

Pre-audio is a playback state, not a reader mode. The shared playback state vocabulary is:

- `preAudio`: show one primary `Create audio` action, source/scope summary, and generation settings. Do not show disabled restart, seek, speed, bookmark, waveform, or duplicate pre-audio labels.
- `generating`: show generation progress, readiness estimate, and cancel/pause controls only when the backing operation supports them.
- `playable`, `playing`, `paused`, `completed`: show restart, seek, play/pause, speed, bookmark, waveform, and display controls in a consistent order across Book, Document, and Website Cinema.
- `degraded`: show a fallback explanation plus retry/rebuild controls. Keep the reader canvas usable.

All transport visibility derives from the shared playback state mapper. Per-format code may provide labels, scope summaries, and callbacks, but it must not independently decide whether inert playback controls are visible.

The shared footer keeps playable controls in this order: restart, 10-second seek back, primary play/pause, 10-second seek forward, progress/waveform, speed, bookmark, and display controls. Bookmarks remain part of wayfinding and are also reachable from the footer transport when audio is playable.

Mobile cinema surfaces use the same bottom sheet pattern below `1024px`: `Source`, `Structure`, and `Narration`. The sheet is opened from the shared footer `More` control, exposes display controls inside the sheet, and does not change the active focus mode. Navigation from bookmarks, recent positions, or outlines closes the sheet and returns focus to the reader canvas.

The `More` control owns the bottom sheet with `aria-controls` and `aria-expanded`. The sheet is rendered in the dialog flow above the footer so one-handed users can keep playback, bookmark, speed, and More controls reachable while the sheet is open.

Desktop-width layouts at `1024px` and above may show the toolbar and rails; phone and tablet portrait widths must derive their rail suppression and bottom-sheet behavior from the shared Cinema shell primitives, not per-surface overrides.

Book-like reading keeps a two-page spread only when the scope genuinely spans multiple reader pages. Short or one-page scopes and narrow viewports use a single-page canvas. A blank `End` page is allowed only when it helps orient a multi-page final spread; one-page sources must not waste half the canvas with an empty page.
