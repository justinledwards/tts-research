# Teleprompt Studio

Teleprompt Studio is the dedicated recording surface for the workspace stage model. It can be
entered from Review or Preview and keeps the active source, active block, scope, voice profile, and
speech policy profile attached to the session.

## Studio Layout

- The sticky toolbar keeps recording actions visible: previous cue, play or pause, restart, next
  cue, Back to Review, Back to Preview, Open Cinema, and Create & Listen.
- The header repeats source, scope, policy, voice, block, word count, estimated time, and active cue
  position so the operator does not need the side rails open.
- The script area restores the last Teleprompt scroll position for the same project and source.
- Selecting a cue updates the shared workspace active block, so Review, Preview, and Teleprompt
  keep the same block selection.
- Current, next, and previous block previews stay visible beside the script.

## Accessibility Presets

Teleprompt Studio exposes four top-level presets:

- `Standard`: balanced type and gentle cue highlighting.
- `Large text`: larger type and line height for reading from farther away.
- `High contrast`: strong foreground and cue contrast for difficult lighting.
- `Dyslexic friendly`: wider spacing and a calmer cue treatment.

Mirror mode is a separate toggle for mirrored recording rigs. Low-level highlight timing remains
available only under Advanced, not in the default Teleprompt path.

## Keyboard Contract

Keyboard shortcuts are active only outside editable controls:

- `Space` or `K`: play or pause.
- `Left` or `Up`: previous cue.
- `Right` or `Down`: next cue.
- `R`: return to Review.
- `V` or `P`: return to Preview.
- `C`: Create & Listen.

## Return Memory

Teleprompt writes a project/source snapshot containing active block, return target, and scroll
position. The workspace still owns source, voice, policy, and scope state; Teleprompt memory only
restores presentation context for the same project and source.

## Validation

Local UI validation should enter Teleprompt from Review and Preview, toggle accessibility presets,
toggle mirror mode, move between cues, return to both Review and Preview, and confirm the selected
source and active block survive every transition.
