# UI Component Baseline

Voice Studio uses a warm paper identity, but hierarchy comes from semantic roles rather than many similar beige cards.

## Semantic Roles

Theme variables live in `frontend/src/styles.css`; typed helpers and component contracts live in `frontend/src/design/`.

| Role | Use For | Token Or Variant |
| --- | --- | --- |
| App shell | Global chrome, top bar, modal frame. | `.vs-app-shell`, `Panel variant="appShell"` |
| Active workbench | The current workspace behind task surfaces. | `.vs-workbench`, `Panel variant="workbench"` |
| Primary work surface | Main authoring, review, preview, and cue surfaces. | `.vs-work-surface`, `Panel variant="workSurface"` |
| Secondary inspector | Context, diagnostics, side panels, secondary detail. | `.vs-inspector`, `Panel variant="inspector"` |
| Management surface | Settings, asset management, route lists, maintenance controls. | `.vs-management-surface`, `Panel variant="management"` |
| Status/recovery strip | Runtime status, blockers, recovery actions. | `.vs-status-strip-surface`, `Panel variant="statusStrip"` |
| Alert | Failed, destructive, or blocking state summaries. | `.vs-alert-surface`, `Panel variant="alert"` |
| Passive metadata | Counts, labels, facts, scope markers, explanatory chips. | `.vs-metadata-surface`, `StatusChip tone="metadata"` |

Selected/pinned state is separate from warning/failure state. Selected stays warm orange; pinned uses a quieter gold/brown; warning uses caution amber; failure/destructive uses red.

## Components

Use exports from `frontend/src/design/index.ts` before adding local card, button, chip, drawer, or toggle styles.

| Component | Contract |
| --- | --- |
| `Button` | `primary` is the single obvious stage action. `soft` is a supporting action, `warning` is caution/recovery, `destructive` is cancel/delete, `mode` is for tabs and segmented choices, and `pinned` is persistent state. Disabled buttons must remain readable and expose `disabledReason` when context is not obvious. |
| `StatusChip` | Use `selected` for active choices, `metadata`/`readOnly` for passive facts, `info` for in-progress/system facts, `success` for ready, `warning` for caution, `failed`/`danger` for failure, `pinned` for persistent source or panel state, and `disabled` for unavailable status. |
| `Panel` | Choose the semantic surface variant before adding borders or shadows. Avoid nested bordered panels unless the inner panel is a repeated item, inspector fact, or alert. |
| `SegmentedControl` | For mutually exclusive modes. Selected state inherits `Button selected`; do not use warning/danger colors for the selected segment. |
| `Toggle` | Label and detail text stay readable when disabled. Use for binary settings only. |
| `Drawer` | Shared modal frame using workbench shell and a primary work-surface header. |

## Typography And Spacing

- `textStyles.display`: top-level workbench/page titles.
- `textStyles.sectionHeading` and `heading`: panel and surface headings.
- `textStyles.label` and `eyebrow`: compact labels and scope names.
- `textStyles.metadata`: passive facts and secondary metrics.
- `spacing.actionGap`, `panelGap`, `sectionGap`: keep controls grouped before adding boxes.
- `spacing.compactPadding`, `comfortablePadding`, `spaciousPadding`, `workbenchPadding`: scale density by surface role.
- Controls must keep the 44 px minimum target from `minInteractiveSize`.

## Migration Rules

- Prefer semantic variants over raw Tailwind palette utilities.
- Use typography, spacing, and surface role first; add shadows only for true foreground work surfaces or overlays.
- Use `StatusChip tone="metadata"` for counts and facts that should not compete with alerts.
- Use `StatusChip tone="selected"` for active project/source/profile/stage state.
- Use warning only for recoverable caution; use failed/danger for failure or blocked generation.
- Use `Button variant="warning"` for cautionary recovery actions and `destructive` for irreversible or cancel/delete actions.
- Do not use red/orange tokens for selected stage unless the selected token is explicitly used.

## Accessibility Contrast Checklist

- Body text and muted text meet WCAG AA contrast on primary work surfaces.
- Primary, soft, warning, destructive, selected, pinned, metadata, and disabled state pairs are covered by `frontend/src/design/colorContrast.test.ts`.
- Theatre uses its own dark overrides for status chips and word highlights; it must not inherit light status colors.
- Disabled controls are lower emphasis but readable, keyboard focusable when applicable, and explain unavailable actions with `disabledReason`.
- Accessibility presets must visibly change readability through contrast, text scale, line spacing, measure, and reduced motion.

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
- `output/ui-component-baseline/latest/screenshots/theatre.png`
- `output/ui-component-baseline/latest/screenshots/high-contrast.png`

These snapshots verify semantic layers, buttons, chips, panels, drawer states, disabled controls, high contrast, and Theatre mode.
