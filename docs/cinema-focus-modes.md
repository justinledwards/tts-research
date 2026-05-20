# Cinema Focus Modes

Cinema surfaces share one focus model across Book, Document, and Website Cinema.

- `Read` is the default for every newly opened cinema overlay. It is canvas-first: desktop inspector rails are hidden unless a panel is pinned, and secondary reader chrome is suppressed inside the canvas.
- `Inspect` prioritizes source provenance, current passage, speech policy, and extraction health.
- `Review` prioritizes the current passage, wayfinding, bookmarks, recent positions, speech policy, and section queues.
- `Debug` prioritizes extraction warnings, skipped content, generated-audio health, policy notes, and timing diagnostics.

Inspector panels are single-panel docks. Switching focus mode changes the available panel group instead of expanding every card at once. The `Pin` control keeps the current panel visible while moving between modes, including `Read`; unpinning returns `Read` to a fully canvas-first layout.

Focus mode, active panel, and pinned panel state are session-only overlay state. Closing and reopening a cinema surface starts in `Read` mode with no pinned inspector panel.

The shared footer keeps restart, 10-second seek, primary play/create, progress, speed, bookmark, and display controls in the same order across Book, Document, and Website Cinema. Bookmarks remain part of wayfinding and are also reachable from the footer transport.

Mobile cinema surfaces use the same bottom sheet pattern: `Source`, `Structure`, and `Narration`. The sheet is opened from the shared footer `More` control and does not change the active focus mode.
