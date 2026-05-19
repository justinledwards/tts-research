# Workspace Flow

Voice Studio uses a stage-based narration workspace:

- `Intake` collects draft text, books, prepared files, and URLs.
- `Review` focuses on source blocks, spoken script, and validation transcript with one active review pane at a time.
- `Preview` shows the selected source and spoken form before `Create & Listen`.
- `Teleprompt` is an inline continuation from Review or Preview; the full-screen cinema teleprompter remains available from that stage.

Workspace density is controlled by one shell mode:

- `Focus` collapses both workspace rails and the activity footer.
- `Balanced` is the default and keeps rails/footer compact.
- `Full` expands both rails and the activity footer for operators who need all controls visible.

Context preservation rules:

- Entering and leaving Teleprompt keeps the active source, active block, voice profile, and speech policy profile.
- Choosing a new source resets only the active block selection for the previous source.
- `Create & Listen` is an action from Preview and global controls, not a separate workspace stage.

Local UX smoke:

1. Start with a new Intake source.
2. Move to Review and switch between Block Review, Spoken Script, and Validation Transcript.
3. Open Teleprompt, then return to Review.
4. Open Preview and run `Create & Listen`.
5. Compare Focus, Balanced, and Full layouts and confirm the primary stage remains visually dominant.
