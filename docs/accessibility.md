# Reader Accessibility

Book Cinema, Document Cinema, and Website Cinema share the same reader accessibility model. Reader controls, policy explanations, progress resume, highlight preferences, typography preferences, reflow preferences, and speech-status announcements are separate from playback transport state so assistive settings do not mutate audio state.

## Keyboard Paths

Each reader dialog receives focus when it opens, traps keyboard focus inside the active surface, and restores the previously focused control when it closes. Shortcuts are ignored inside text inputs, selects, textareas, editable regions, and controls marked with `data-reader-ignore-shortcuts`.

| Action | Keys |
|---|---|
| Play or pause | Space, K |
| Seek backward | Left Arrow, J |
| Seek forward | Right Arrow, L |
| Restart scope | Home |
| Slower | `[` |
| Faster | `]` |
| Bookmark | B |
| Close reader | Escape |

The same map applies to Book, Document, and Website Cinema. Bookmark only acts when the active surface has a matching generated narration that can receive bookmarks.

## Reader Preferences

Reduced motion disables animated/glowing active-word transitions and keeps a static highlight treatment.

High contrast uses a stronger active-word, phrase, block, and prepared-source highlight palette across reader themes and source formats.

Text scale, line spacing, and measure control reader typography and reflow for paged books, Markdown documents, prepared documents, and extracted websites. These settings are format-agnostic and should not change audio generation, playback progress, locators, or transport state.

Reader preferences now expose preset shortcuts backed by `frontend/src/features/accessibility/accessibilityAudit.ts`:

| Preset | Intent |
|---|---|
| Standard | Default reader comfort with large text and standard motion. |
| High contrast | Stronger contrast without otherwise changing reading geometry. |
| Reduced motion | Instant scrolling and no nonessential motion. |
| Dyslexic friendly | Spacious line height, wider measure, and reduced motion. |
| Large text | Giant text and spacious line height. |
| Low-vision measure | High contrast, giant text, spacious line height, narrow measure, and reduced motion. |

Presets are not separate storage. Choosing a preset writes the same reduced-motion, high-contrast, text-scale, line-spacing, and measure values users can still fine tune one by one.

All reader preferences are persisted in local storage under `tts-reader-accessibility-v1` and are expressed as reader data attributes/CSS variables rather than playback engine settings. Older saved values with only reduced motion and high contrast are normalized with default typography values.

## Touch And Narrow Widths

Narrow Cinema means any viewport below `1024px`. Book, Document, and Website Cinema must use the shared bottom-sheet pattern below that breakpoint, keep the reader canvas as the primary target, and suppress inspector rails unless the user is on a desktop-width layout.

Touch targets in Cinema transport, More sheet tabs, bookmarks, wayfinding rows, display controls, focus-mode controls, and source actions must be at least `44px` wide and `44px` tall. The shared `.cinema-touch-target` class is the local implementation contract for these controls.

Cinema overlays, footers, and bottom sheets must account for `env(safe-area-inset-*)`; the frontend viewport meta includes `viewport-fit=cover` so phones and tablets with display cutouts expose those values. The bottom sheet is part of the dialog flow above the transport footer, not a fixed overlay covering playback controls.

## Screen Reader Status

Every cinema surface exposes a polite live region for the current source and scope. Fragment-based playback announces the fragment number. Word-based playback announces the current word index. Scope or block changes update the announcement with the new chapter, page range, document block, website block, or full-source label.

Policy Notes are rendered as normal text, including the shared policy explanation string, so skipped, summarised, on-demand, literal, code, table, citation, math, caption, quote, list, and admonition decisions are inspectable outside visual highlighting.

Wayfinding controls share one model for outlines, bookmarks, recent positions, and locator-backed resume. The concise UX contract lives in `docs/wayfinding-scope-ux.md`.

The command palette shortcut and keyboard contract live in `docs/command-palette.md`. Reader shortcuts remain active only inside reader surfaces; the global palette is additive and closes before returning focus to the current surface.

## Non-Book Parity

Document Cinema and Website Cinema use the shared focus lifecycle, keyboard map, live-region helper, reduced-motion behavior, high-contrast treatment, and typography/reflow controls. Auto-follow scrolling uses instant movement when reduced motion is enabled. Prepared-source reader settings live in the same settings menu as theme and auto-follow so the preferences remain shared across formats.

## Manual Smoke Protocol

Run this after automated checks:

- Import an EPUB fixture and open Book Cinema without using a pointer.
- Prepare a local document and a URL source, then open Document Cinema and Website Cinema without using a pointer.
- Move focus through source controls, scope selection, reader pages/blocks, playback controls, accessibility toggles, typography controls, Policy Notes, and close.
- Use every shortcut listed above and verify shortcuts do not fire while focus is inside editable controls.
- Toggle reduced motion and high contrast while playback highlights are active in each cinema surface.
- Change text scale, line spacing, and measure while highlights are active and verify layout remains readable without clipping.
- Resume from a saved locator and verify the same visible text is highlighted.
- With a screen reader running, confirm the dialog name, current source, current scope/block, fragment or word announcement, and Policy Notes are understandable.

## Local Audit Gate

Run the local browser checks with:

```sh
pnpm e2e:accessibility-audit
pnpm e2e:responsive-snapshots
```

`e2e:accessibility-audit` starts the mock local stack, scans visible interactive controls for accessible names, disabled reasons, touch-target warnings, live regions, image alt text, first-tab focus, and browser console/page issues. It writes `output/accessibility/latest/accessibility-results.json`, `a11y-findings.json`, and `accessibility-report.md` (or the configured output directory).

`e2e:responsive-snapshots` captures the workspace, settings drawer, temporary Quick Listen paste flow, temporary Website Cinema read mode, and temporary Teleprompt Theatre at `390px`, `1100px`, `1440px`, and `1920px (taskbar context)`. It checks for meaningful content, browser issues, owner/route failure summaries, and horizontal overflow while saving screenshots under `output/accessibility/latest/responsive-snapshots/screenshots/` (or the configured output directory).

`e2e:book-cinema:responsive` covers Book, Document, and Website Cinema at phone, constrained desktop, desktop, and wide desktop widths. `e2e:temporary-sources` runs the temporary-source visual regression lane: responsive screenshots, Teleprompt return memory, Context Inspector tabs, and Command Palette temporary commands.

`pnpm validate:local` includes both checks so accessibility and responsive coverage remain part of the local gate, not an afterthought.

### Accessibility package gate artifacts

For the manual-accessibility gate, keep a stable package artifact directory:

- `output/accessibility/latest/manual-qa.md`
- `output/accessibility/latest/a11y-findings.json`
- `output/accessibility/latest/responsive-snapshots/`

`pnpm validate:local` writes these package artifacts from the latest run so every release/merge candidate has a machine-readable finding summary plus human manual QA notes.

The expanded checkbox version lives in `docs/reader-accessibility-qa.md`.

The narrow-width checklist lives in `docs/narrow-width-cinema-qa.md`.
