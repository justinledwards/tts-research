# Command Palette

Voice Studio exposes a global command palette as an additive quick-action layer. It must never be the only way to complete a task; every command keeps a visible menu, drawer, button, tab, or shortcut path elsewhere in the app.

## Shortcuts

| Action | Keys |
|---|---|
| Open or close Actions | Ctrl+K / Cmd+K |
| Move through results | Up Arrow / Down Arrow |
| Run selected action | Enter |
| Close palette | Escape |

The shortcut is ignored while focus is inside text inputs, selects, textareas, editable regions, or controls marked with `data-command-palette-ignore-shortcuts`.

## UX Contract

- Commands are generated from shared metadata for settings groups, settings scopes, workspace stages, workspace layouts, cinema focus modes, help anchors, projects, sources, bookmarks, and recent positions.
- Palette actions call the same handlers as visible controls: source switching, project switching, workspace stage transitions, `Create & Listen`, Teleprompt, settings/help open, cinema focus modes, bookmark save, and recent-position resume.
- Disabled commands stay visible with a reason when context is missing, such as trying to switch cinema focus before a Cinema surface is open.
- Search labels must be understandable without knowing feature internals. Results should include the action title, surface group, and one short detail line.
- Opening settings from a command lands on the matching task group and highlights the relevant setting scope or field.

## Local Smoke

Run these checks after implementation changes:

```bash
pnpm e2e:settings-ia
pnpm e2e:workspace-flow
pnpm e2e:reader-wayfinding
```

Manual testers should open Actions from Workspace and Cinema, navigate without a pointer, trigger at least one settings command, one workspace command, one cinema focus command, one bookmark command, and one recent-position command.
