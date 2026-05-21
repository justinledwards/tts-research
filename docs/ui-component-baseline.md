# UI Component Baseline

This baseline keeps Voice Studio surfaces visually aligned without hand-tuning every screen.

## Token Layer

Shared tokens live in `frontend/src/design/`:

- `color.ts`: semantic color roles for surface, raised surface, text, muted text, accent, selected, pinned, success, warning, danger, and focus.
- `spacing.ts`: shared spacing names, 8 px radius conventions, and the 44 px minimum touch target.
- `typography.ts`: compact labels, body copy, headings, and truncation helpers.
- `tokens.ts`: `cx`, focus ring, disabled state, touch target, and field-control class contracts.

Theme CSS variables live in `frontend/src/styles.css` and now include focus, selected, pinned, success, warning, and destructive states for light, dark, dawn, papery, and night themes.

The local frontend CSS bundle budget is 15 KB gzip to cover the shared token and component state layer while keeping the initial surface lean.

## Shared Components

Use the components exported from `frontend/src/design/index.ts` before creating local button, card, chip, drawer, or toggle styles.

| Component | Contract |
| --- | --- |
| `Button` | One primary CTA style, one destructive style, shared secondary/soft/ghost/mode/pinned variants, 44 px minimum target, consistent focus and disabled states. |
| `Toggle` | Checkbox control with label/detail text, 44 px minimum target, shared disabled state. |
| `Drawer` | Modal side-panel frame with shared header, close action, focus lifecycle compatibility, and surface tokens. |
| `SegmentedControl` | Selected tab/mode style for stage, source, layout, and parser choices. |
| `StatusChip` | Shared neutral/accent/success/warning/danger/pinned status badges. |
| `Panel` | Shared raised/surface/dashed/pinned panel shell for cards, inspector panels, settings groups, review panels, and intake blocks. |

## Migration Rules

- Prefer semantic variants over screen-specific color classes.
- `Button variant="primary"` is reserved for the single primary stage action.
- Use `Button variant="destructive"` for cancel/delete flows.
- Use `Button variant="mode"` or `SegmentedControl` for tabs, modes, and selected choices.
- Use `Panel pinned` or `Button variant="pinned"` for pinned inspector state.
- Disabled interactive controls must expose `disabledReason` when the reason is not obvious from nearby text.
- Do not use sub-44 px action targets in Workspace, Cinema, Settings, Intake, Review, Preview, or Teleprompt.

## Surfaces Updated

- Workspace header actions and stage/source controls use `Button` and `SegmentedControl`.
- Intake source prep uses shared panels, buttons, parser segmented control, and field controls.
- Review uses shared primary action, accordion panels, block-row buttons, and status chips.
- Preview uses shared primary/secondary actions, stage panels, and status chips.
- Teleprompt uses shared panel and stage actions.
- Cinema transport and inspector use shared buttons, panels, status chips, and field controls.
- Settings uses shared drawer, panels, toggles, buttons, mode cards, chips, and field controls.

## Snapshot Pack

Run:

```bash
pnpm ui:component-baseline
```

The script writes:

- `output/ui-component-baseline/latest/manifest.json`
- `output/ui-component-baseline/latest/index.html`
- `output/ui-component-baseline/latest/screenshots/light.png`
- `output/ui-component-baseline/latest/screenshots/dark.png`
- `output/ui-component-baseline/latest/screenshots/high-contrast.png`

These snapshots verify the component baseline in light, dark, and high-contrast modes.
