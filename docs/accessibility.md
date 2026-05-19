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

All reader preferences are persisted in local storage under `tts-reader-accessibility-v1` and are expressed as reader data attributes/CSS variables rather than playback engine settings. Older saved values with only reduced motion and high contrast are normalized with default typography values.

## Screen Reader Status

Every cinema surface exposes a polite live region for the current source and scope. Fragment-based playback announces the fragment number. Word-based playback announces the current word index. Scope or block changes update the announcement with the new chapter, page range, document block, website block, or full-source label.

Policy Notes are rendered as normal text, including the shared policy explanation string, so skipped, summarised, on-demand, literal, code, table, citation, math, caption, quote, list, and admonition decisions are inspectable outside visual highlighting.

Wayfinding controls share one model for outlines, bookmarks, recent positions, and locator-backed resume. The concise UX contract lives in `docs/wayfinding-scope-ux.md`.

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

The expanded checkbox version lives in `docs/reader-accessibility-qa.md`.
