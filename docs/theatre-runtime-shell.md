# Theatre and Cinema Runtime Shell

Theatre is the runtime shell for long-form listening, reading, and recording rehearsal. It is
separate from the production workbench: the shell keeps the current cue or passage, progress,
state, control reveal, and emergency exit visible while moving production controls into revealed or
operator-only zones.

## Runtime State

The shared runtime model lives in `frontend/src/features/theatre/model.ts`.

- Runtime modes: `audio-follow`, `recording-rehearsal`, `reading-only`.
- Availability states: `ready`, `waiting-audio`, `waiting-timing`, `low-confidence`,
  `generation-failed`, `renderer-failed`.
- Control zones: `persistent`, `listener`, `return`, `operator`, `environment`, `emergency`.

`audio-follow` is used only when generated audio and trusted timing are ready. `recording-rehearsal`
is manual cue advance and must not claim audio-follow. `reading-only` means Theatre remains readable
while audio, timing, confidence, generation, or renderer state prevents trusted follow-along.

## Control Visibility

Hidden controls show only:

- Theatre/Cinema surface label.
- Current title plus source and cue or passage position.
- Runtime status and progress.
- Controls toggle.
- Persistent Exit Theatre.

Hidden controls must not show Back to Review, Back to Preview, Operator, native fullscreen, mirror,
generation, retry, diagnostics, confidence, or production settings.

Revealed controls appear after pointer movement/down, focus, or `T`, then auto-hide unless focus
remains inside the controls.

- Listener controls: playback, cue movement, seek, restart, speed, bookmark, or jump-to-audio.
- Return controls: Back to Review and Back to Preview.
- Operator controls: settings, sync diagnostics, confidence, recovery, and debug facts.
- Environment controls: native fullscreen and fullscreen fallback messaging.
- Emergency controls: Exit Theatre.

## Keyboard Map

- Shared: `Esc` exits Theatre; `T` toggles controls; `Space` and `K` play or pause; `Home` restarts;
  `[` and `]` change speed; `F` requests native fullscreen.
- Teleprompt Theatre: arrow keys move cues, `J` jumps to the current audio cue, `O` toggles the
  operator panel, `M` toggles mirror mode, `R` returns to Review, and `V` returns to Preview.
- Cinema Theatre: `ArrowLeft` or `J` seeks backward, `ArrowRight` or `L` seeks forward, and `B`
  bookmarks when available.

Editable fields and controls ignore shortcuts except for the emergency exit path.

## Fallback States

Theatre must be explicit about degraded runtime states:

- Missing or preparing audio: readable text remains available; audio-follow is not active.
- Timing unavailable or estimated: audio may play, but word-follow is withheld.
- Low confidence: confidence appears only as a warning or in operator diagnostics.
- Generation failed: Theatre stays readable and recovery actions live in return or operator zones.
- Renderer failed: Cinema Theatre reports the reader failure and keeps Exit discoverable.

Confidence uses the existing read-along trusted threshold from `READ_ALONG_TRUSTED_CONFIDENCE`.
Do not add another threshold.

## Exit And Return State

`Esc` and persistent Exit Theatre always exit safely and leave native fullscreen if active. Back to
Review and Back to Preview preserve source, active cue or block, scroll position, voice, policy, and
return target through the existing Teleprompt return-memory flow. Cinema Theatre exits back to the
normal Cinema layout and restores focus to the entry control.

## Fullscreen

The dark Theatre shell is always available in the browser window. Native fullscreen is optional and
lives in the environment/operator control zone. Unsupported native fullscreen must show a
non-blocking fallback message rather than blocking Theatre entry.
