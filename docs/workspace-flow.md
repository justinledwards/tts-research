# Workspace Flow

Voice Studio uses a stage-based narration workspace:

- `Intake` uses the guided wizard to collect intent, source, metadata, template defaults, voice/profile, and the next stage for draft text, books, prepared files, and URLs.
- `Review` focuses on source blocks, spoken script, and validation transcript with one active review pane at a time.
- `Preview` shows the selected source and spoken form before `Create & Listen`.
- `Teleprompt` is an inline continuation from Review or Preview; the full-screen cinema teleprompter remains available from that stage.

Workspace density is controlled by one shell mode:

- `Focus` collapses both workspace rails and the activity footer.
- `Balanced` is the default and keeps rails/footer compact.
- `Full` expands both rails and the activity footer for operators who need all controls visible.

UI memory is opt-in from Studio Settings:

- `Remember my layout` is off by default. With it off, reopening the app uses the documented shell default: `Balanced`.
- With it on, shell mode is remembered on this browser. The active project can override the browser default, so restore order is project shell mode, browser shell mode, then `Balanced`.
- The last active `Review` pane is remembered per project. Resetting UI memory returns Review to `Block Review`.
- Teleprompt return targets are remembered per project only for `Review` and `Preview`. Reopening into Teleprompt restores the valid return target, otherwise it falls back to `Review`.
- `Reset UI memory` clears remembered layout while preserving whether `Remember my layout` is on. It does not clear source text, selected sources, bookmarks, progress, source pins, voice profiles, speech policy, or playback transport.

Context preservation rules:

- Entering and leaving Teleprompt keeps the active source, active block, voice profile, and speech policy profile.
- Choosing a new source through Intake resets only the active block selection for the previous source.
- `Create & Listen` is an action from Preview and global controls, not a separate workspace stage.

Local UX smoke:

1. Start with a new source through the Intake wizard.
2. Move to Review and switch between Block Review, Spoken Script, and Validation Transcript.
3. Open Teleprompt, then return to Review.
4. Enable `Remember my layout`, reopen, and confirm shell mode, Review pane, and Teleprompt return target restore.
5. Reset UI memory and confirm Workspace returns to `Balanced`, `Block Review`, and the documented Teleprompt fallback.
6. Open Preview and run `Create & Listen`.
7. Compare Focus, Balanced, and Full layouts and confirm the primary stage remains visually dominant.
