# Command Palette

Voice Studio exposes a global command palette as the shared quick-action layer for navigation, project/source selection, playback, Review, Teleprompt, Settings, and Diagnostics. It must never hide core tasks, but it is the preferred secondary path for Help, shortcut discovery, and contextual settings deep links.

## Shortcuts

| Action | Keys |
|---|---|
| Open or close Actions | Ctrl+K / Cmd+K by default |
| Open shortcut cheat sheet | ? by default |
| Open Settings | Ctrl+, / Cmd+, by default |
| Open Help | Shift+F1 by default |
| Create & Listen | Ctrl+Enter / Cmd+Enter by default |
| Move through results | Up Arrow / Down Arrow |
| Run selected action | Enter |
| Close palette | Escape |

Global shortcuts are stored in the shortcut registry and can be changed in `Settings → Reader → Keyboard shortcuts`. They are ignored while focus is inside text inputs, selects, textareas, editable regions, or controls marked with `data-command-palette-ignore-shortcuts`.

## Command Categories

Commands use one category list:

- `Navigation`
- `Project`
- `Source`
- `Voice`
- `Playback`
- `Review`
- `Teleprompt`
- `Settings`
- `Diagnostics`

## UX Contract

- Commands are generated from shared metadata for settings groups, settings fields, settings scopes, workspace stages, workspace layouts, cinema focus modes, help anchors, projects, sources, bookmarks, and recent positions.
- Palette actions call the same handlers as visible controls: source switching, project switching, workspace stage transitions, `Create & Listen`, Teleprompt, settings/help open, cinema focus modes, bookmark save, and recent-position resume.
- Disabled commands stay visible with a reason when context is missing, such as trying to switch cinema focus before a Cinema surface is open.
- Search labels must be understandable without knowing feature internals. Results include the action title, category, shortcut when configured, and one short detail line.
- Opening settings from a command lands on the matching task group and highlights the relevant setting scope or field.
- Settings has one visible primary entry in the top bar: the gear button. The command palette and contextual deep links may open the same Settings drawer, but separate settings UIs should not be introduced.
- Help is available through the command palette, configurable shortcut, and Help content deep links. Do not add more persistent Help buttons unless the surface has a specific recovery need.
- Surface complexity budgets keep the command palette secondary. Required tasks must remain available in the owning surface; see `docs/surface-complexity-budget.md`.

## Local Smoke

Run these checks after implementation changes:

```bash
pnpm check
pnpm e2e:settings-ia
pnpm e2e:workspace-flow
pnpm e2e:ui-actions
pnpm e2e:surface-complexity
pnpm e2e:reader-wayfinding
```

Manual testers should open Actions with `Ctrl+K` / `Cmd+K`, open the shortcut cheat sheet with `?`, change one shortcut in Settings, trigger at least one settings command, one workspace command, one cinema focus command, one bookmark command, and one recent-position command.
