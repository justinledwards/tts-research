# UI Memory

UI memory is the machine-local preference layer for presentation state. It is separate from project
content, generated audio, provider credentials, model paths, and source text.

## Remembered State

Users can control these categories from Settings > Reader > UI memory:

- `Remember layout`: Workspace rail layout and active review pane.
- `Remember theme`: the selected Studio theme for this browser.
- `Remember last project`: the project id used to reopen the last active project.
- `Remember reader preferences`: typography, spacing, contrast, and motion preferences.
- `Remember Teleprompt return target`: Review or Preview return target and Teleprompt return
  presentation memory.
- `Remember panel pins`: Cinema focus panel state and pinned context panels.

Cinema focus mode, active panel, and pinned panel state remain session-only by default. They only
become machine-local when `Remember panel pins` is enabled.

## Reset Scopes

UI memory supports three reset scopes:

- `Reset workspace layout`: clears Workspace layout and review pane memory.
- `Reset reader preferences`: restores reader accessibility preferences to defaults.
- `Reset all UI memory`: clears layout, theme, last project, reader preferences, Teleprompt return
  memory, and panel pin memory.

Every reset requires confirmation before it mutates local state.

## Export And Import

The preferences export is a JSON document with kind `tts-ui-preferences`. It can include enabled
UI memory preferences, theme, last project id, and reader accessibility preferences.

Exports intentionally omit:

- generated audio
- model paths
- provider secrets
- private project content
- raw Teleprompt script snapshots

Imports accept only known preference fields. Unknown fields are ignored, and imported last-project
memory is applied only when the project already exists locally.

The broader local-first data boundary is documented in `docs/privacy-local-first.md`.

## Validation

Local validation should confirm that disabling a memory category removes its local storage entry,
reset controls show confirmation, exported JSON does not include project content or runtime paths,
and Teleprompt return memory does not persist when that preference is disabled.
