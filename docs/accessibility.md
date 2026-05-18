# Reader Accessibility

Book Cinema is designed as a keyboard-first reader. The reader controls, policy explanations, progress resume, highlight preferences, and speech-status announcements are separate from playback transport state so assistive settings do not mutate audio state.

## Keyboard Paths

The reader dialog receives focus when it opens and restores the previously focused control when it closes. Shortcuts are ignored inside text inputs, selects, textareas, and editable regions.

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

## Highlight Preferences

Reduced motion disables animated/glowing active-word transitions and keeps a static highlight treatment.

High contrast uses a stronger active-word and phrase highlight palette across reader themes.

Both preferences are persisted in local storage under `tts-reader-accessibility-v1` and are expressed as reader data attributes rather than playback engine settings.

## Screen Reader Status

The reader exposes a polite live region for the current book and scope. Fragment-based playback announces the fragment number. Word-based playback announces the current word index. Scope changes update the announcement with the new chapter, page range, or full-book label.

Policy Notes are rendered as normal text, including the shared policy explanation string, so skipped, summarised, on-demand, literal, code, table, citation, math, caption, quote, list, and admonition decisions are inspectable outside visual highlighting.

## Manual Smoke Protocol

Run this after automated checks:

- Import an EPUB fixture and open Book Cinema without using a pointer.
- Move focus through source controls, scope selection, reader pages, playback controls, accessibility toggles, Policy Notes, and close.
- Use every shortcut listed above and verify shortcuts do not fire while focus is inside editable controls.
- Toggle reduced motion and high contrast while playback highlights are active.
- Resume from a saved locator and verify the same visible text is highlighted.
- With a screen reader running, confirm the dialog name, current book, current scope, fragment or word announcement, and Policy Notes are understandable.

The expanded checkbox version lives in `docs/reader-accessibility-qa.md`.
