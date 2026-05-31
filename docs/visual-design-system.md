# Visual Design System

Audience: frontend engineers and reviewers working on Voice Studio UI surfaces.

Purpose: keep the app warm, legible, and visually calm by using semantic tokens instead of one-off palette utilities.

## Color And Contrast

Use semantic `--vs-*` tokens for app UI. Raw Tailwind palette classes such as `bg-orange-*`, `text-zinc-*`, and `border-amber-*` are guarded against in non-test frontend source.

| Layer | Token family | Use |
| --- | --- | --- |
| App shell | `--vs-shell` | Page backdrop and inactive global chrome. |
| Active workspace | `--vs-workspace` | Main working area behind panels. |
| Primary content | `--vs-surface-primary` | Core readable panels and dialogs. |
| Secondary inspector | `--vs-surface-inspector` | Supporting sidebars and inspectors. |
| Passive metadata | `--vs-surface-muted`, `--vs-text-muted`, `--vs-text-passive` | Low-priority summaries, timestamps, and helper details. |
| Borders | `--vs-border-subtle`, `--vs-border-strong` | Use subtle borders by default; strong borders only for selection, alerts, or overlays. |
| Actions | `--vs-action-*` | Buttons and interactive controls. |
| Status | `--vs-status-*` | Info, success, warning, and danger states. |
| Theatre | `--vs-theatre-*` | Immersive Theatre/Cinema chrome and cue surfaces only. |

Contrast targets:

- Primary and muted text on primary surfaces: at least 4.5:1.
- Large text, icons, focus rings, and current-word marks: at least 3:1.
- Disabled text remains readable, with unavailable state conveyed by more than opacity.

## Typography

- Use the existing app font stack and avoid viewport-scaled UI chrome.
- Headings: `text-base` to `text-xl`, semibold, no negative tracking.
- Labels and metadata: `text-xs`, semibold, uppercase only for stable section labels.
- Body/help text: `text-sm leading-6` or `text-xs leading-5` in compact inspectors.
- Theatre and reading surfaces keep their dedicated reading-size variables.

## Spacing And Elevation

- Use spacing to separate regions before adding borders.
- Default panel padding is `p-3` for dense controls and `p-4` or `p-5` for primary content.
- Use `--vs-shadow` for raised panels and `--vs-shadow-strong` for overlays.
- Avoid nested cards; repeated items may be cards, but page sections should not become card stacks.

## Buttons

Use the shared `Button` component whenever possible.

| Variant | Purpose |
| --- | --- |
| `primary` | The dominant next action for the current surface. |
| `secondary` | Supporting actions with visible affordance. |
| `tertiary` / `ghost` | Low-priority or chrome actions. |
| `soft` / `pinned` | Selected or recommended-but-not-primary state. |
| `destructive` | Cancel, remove, retry-danger, or irreversible actions. |

Disabled buttons must include `disabledReason`; the shared button exposes it as `data-disabled-reason` and a `title` fallback.

## Panel Hierarchy

- App shell is quiet and should not compete with work content.
- Active workspace uses `--vs-workspace` to create a readable stage.
- Primary panels use `variant="primary"` or `variant="raised"`.
- Inspectors use `variant="inspector"` or `--vs-surface-inspector`.
- Passive metadata should usually be unframed text or a muted row.
- Alerts use status tokens, not ad hoc amber/red/blue classes.

## Light And Dark Examples

Light mode keeps warm paper-adjacent surfaces while using dark text and a deeper orange primary action. Dark mode uses warm charcoal surfaces, light text, and orange actions with dark action text for contrast.

Theatre and Cinema inherit the same semantic contract, then override immersive chrome with `--vs-theatre-bg`, `--vs-theatre-chrome`, `--vs-theatre-panel`, `--vs-theatre-text`, and `--vs-theatre-accent`.

## Accessibility Checklist

- Primary action is visually obvious but not duplicated across the same surface.
- Disabled controls have a readable state and an exposed reason.
- Color is not the only status cue; include text labels or icons where state matters.
- Focus rings are visible against shell, panel, and Theatre backgrounds.
- Text does not rely on raw palette utilities that bypass theme contrast.
- Light, dark, papery, night, and Theatre modes are checked at desktop and mobile widths.
