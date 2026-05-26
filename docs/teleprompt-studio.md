# Teleprompt Studio

Teleprompt Studio is the dedicated recording surface for the workspace stage model. It can be
entered from Review or Preview and keeps the active source, active block, scope, voice profile, and
speech policy profile attached to the session.

## Studio Layout

- The primary presenter path is **Enter Theatre**, which opens a full-window cinematic Teleprompt
  overlay while preserving the inline Studio underneath for editing and recovery.
- The sticky toolbar keeps one presenter-first action cluster visible: previous cue, play or pause,
  restart, next cue, current cue progress, and recording/preview status.
- Secondary workflow actions, Back to Review, Back to Preview, Open Cinema, and Create & Listen,
  live behind the compact Workflow menu so generation and navigation do not compete with recording.
- The header repeats source, scope, policy, voice, block, word count, estimated time, and active cue
  position so the operator does not need the side rails open.
- The script area restores the last Teleprompt scroll position for the same project and source.
- Selecting a cue updates the shared workspace active block, so Review, Preview, and Teleprompt
  keep the same block selection.
- Current, next, and previous block previews stay visible beside the script.

## Theatre and Fullscreen

Theatre Mode is the dedicated presenter layout for recording, rehearsal, and long-form narration.
It hides normal app chrome behind a fixed full-window overlay and shows the current cue at presenter
scale, next cue preview, script progress, word count, estimated remaining time, source/scope,
playback status, sync/confidence status, and a minimal escape bar.

Native fullscreen is requested only from an explicit user action. When the browser or runtime does
not support native fullscreen, the same Theatre layout remains available as the fallback and the
control explains why native fullscreen is unavailable.

Theatre exit paths are explicit:

- `Exit theatre`: return to inline Teleprompt without losing cue, scroll, voice, policy, or source.
- `Back to Review`: persist return memory and return to Review.
- `Back to Preview`: persist return memory and return to Preview.
- `Open Cinema`: keep the current generated-audio context and open Cinema.

Operator Preview is an advanced presenter panel inside Theatre that shows cue sync, confidence,
progress, and playback state without exposing the default inline context panel.

## Accessibility Presets

Teleprompt Studio exposes four top-level presets:

- `Standard`: balanced type and gentle cue highlighting.
- `Large text`: larger type and line height for reading from farther away.
- `High contrast`: strong foreground and cue contrast for difficult lighting.
- `Dyslexic friendly`: wider spacing and a calmer cue treatment.

Mirror mode is a separate toggle for mirrored recording rigs. The default Teleprompt path names the
cue highlight style in presenter language and does not expose raw timing or intensity values.

## Keyboard Contract

Keyboard shortcuts are active only outside editable controls:

- `Space` or `K`: play or pause.
- `Left` or `Up`: previous cue.
- `Right` or `Down`: next cue.
- `R`: return to Review.
- `V` or `P`: return to Preview.
- `C`: Create & Listen.

Theatre adds presenter shortcuts:

- `Esc`: exit fullscreen/theatre and preserve Teleprompt state.
- `F`: request native fullscreen where supported.
- `M`: toggle mirror mode.
- `O`: toggle Operator Preview.
- `L`: apply Large text.
- `H`: toggle High contrast.

## Return Memory

Teleprompt writes a project/source snapshot containing source label, active block, selected cue,
originating stage, return target, scroll position, voice profile, and policy profile. The workspace
still owns source, voice, policy, and scope state; Teleprompt memory only restores presentation
context for the same project and source.

## Validation

Local UI validation should enter Teleprompt from Review and Preview, open Theatre, try native
fullscreen where supported, toggle accessibility presets, toggle mirror mode, move between cues,
return to both Review and Preview, and confirm the selected source and active block survive every
transition.
