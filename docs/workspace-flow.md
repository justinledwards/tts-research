# Workspace Flow

Voice Studio uses a stage-based narration workspace:

- `Intake` uses the guided wizard to collect intent, source, metadata, template defaults, voice/profile, and the next stage for draft text, books, prepared files, and URLs.
- `Review` is a repair queue for source blocks. It starts with health, groups blocks by attention level, and lets the selected block be edited, previewed, approved, retried, skipped, or marked for review from one place.
- `Preview` shows the selected source and spoken form before `Create & Listen`; the global preview mini-player makes selected-block, whole-source, and A/B voice/config auditioning available across Workspace, Review, Preview, and Settings.
- `Teleprompt` opens Teleprompt Studio from Review or Preview as a recording-first surface: presenter cue controls stay primary, while return, Cinema, and Create & Listen actions sit behind the Workflow menu.

Workspace density is controlled by one shell mode:

- `Focus` protects attention with no persistent rails or inspector and only essential status.
- `Balanced` is the default production posture with compact source context, inspector, and status.
- `Full` expands source context, inspector, status, and diagnostics entry points for operators.
- `Custom` uses the panel densities and advanced pins managed from the global Layout menu.

The full layout, panel visibility, Theatre exception, and responsive rules live in `docs/workbench-layout.md`.

UI memory is opt-in from Studio Settings:

- `Remember my layout` is off by default. With it off, reopening the app uses the documented shell default: `Balanced`.
- With it on, shell mode is remembered on this browser. The active project can override the browser default, so restore order is project shell mode, browser shell mode, then `Balanced`.
- Custom source context, inspector, and system status density persists with `Remember my layout`. Advanced system pins persist only with `Remember panel pins`.
- The last active `Review` detail tab is remembered per project. Resetting UI memory returns Review to the repair queue. When the status strip reports `Review needs repair`, opening Review selects the first actionable repair item even if a previous tab was remembered.
- Teleprompt return targets are remembered per project only for `Review` and `Preview`. Reopening into Teleprompt restores the valid return target, otherwise it falls back to `Review`.
- `Reset UI memory` clears remembered layout while preserving whether `Remember my layout` is on. It does not clear source text, selected sources, bookmarks, progress, source pins, voice profiles, speech policy, or playback transport.

Context preservation rules:

- Entering and leaving Teleprompt keeps the active source, active block, selected cue, originating stage, voice profile, speech policy profile, Teleprompt return target, and Teleprompt scroll position.
- Choosing a new source through Intake resets only the active block selection for the previous source.
- `Create & Listen` is an action from Preview and global controls, not a separate workspace stage.
- The mini-player preserves the same active source, active block, voice profile, speech policy profile, run configuration, and generated-audio state as Review and Preview. It is hidden when Cinema is open because Cinema transport wins there.
- Project Dashboard source cards are the canonical reopen path for imported and prepared sources. A card reuses the source lifecycle model, shows what scope will be narrated, and routes to Review, Preview, or Cinema without creating another import control for the same source.

Local UX smoke:

1. Start with a new source through the Intake wizard.
2. Move to Review, confirm the health summary, grouped repair queue, selected-block editor, pronunciation repair, skipped-content notes, policy notes, and clean-block bulk approval are visible.
3. Open Teleprompt, then return to Review.
4. Enable `Remember my layout`, reopen, and confirm shell mode, Review pane, and Teleprompt return target restore.
5. Reset UI memory and confirm Workspace returns to `Balanced`, the Review repair queue, and the documented Teleprompt fallback.
6. Open Preview, use the mini-player to move between preview blocks, toggle `Skip silence`, and compare a B run configuration.
7. Run `Create & Listen`, then audition a selected segment from the mini-player without opening Cinema.
8. Compare Focus, Balanced, and Full layouts and confirm the primary stage remains visually dominant.
