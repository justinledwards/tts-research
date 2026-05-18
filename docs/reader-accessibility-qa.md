# Reader Accessibility QA

Use this checklist for Workstream Lambda manual validation after `pnpm check`,
`pnpm e2e:book-cinema`, `mise run validate:local`, and the explicit EPUB
fixture roundtrip checks pass locally.

## Keyboard-Only Smoke Run

- [ ] Start from a fresh app load and import an EPUB, PDF, DOCX, or HTML book source without using a pointer.
- [ ] Select a book scope, open Book Cinema, and confirm focus remains visible across header, side rail, page controls, and footer controls.
- [ ] Use Space and K to toggle play/pause without triggering controls while typing in an input or selecting from a menu.
- [ ] Use Left/J and Right/L to seek by 10 seconds.
- [ ] Use Home to restart the current narration.
- [ ] Use `[` and `]` to step playback speed down and up.
- [ ] Use B to add a bookmark when a matching active book job is available.
- [ ] Use Escape to close Book Cinema from the reader surface.
- [ ] Resume a saved progress point and confirm the active word/page returns to the saved location.

## Policy And Element Behaviour

- [ ] Switch between Enterprise, Accessibility, Technical Docs, Education, and Language Learning profiles while a book scope is selected.
- [ ] Confirm the book-scope preview refreshes after profile or session override changes.
- [ ] Read a technical chapter containing prose, code, tables, math, citations, captions, lists, quotes, and admonitions.
- [ ] Confirm code, table, math, caption, citation, list marker, admonition, and quote behaviour matches the selected profile/default table.
- [ ] Confirm table traversal changes when `tableHeaderMode` is set to none, column, and row-and-column.
- [ ] Confirm skipped, summarised, on-demand, literal, code, table, citation, and math blocks appear in Policy Notes with a plain-language explanation.

## Highlight And Motion

- [ ] Enable Reduced motion and confirm the active-word highlight uses a static treatment without glow motion.
- [ ] Enable High contrast and confirm active words and phrase highlights remain legible in light and dark reader themes.
- [ ] Toggle Reduced motion and High contrast together and confirm page layout does not shift.
- [ ] Change text size and reader theme while highlights are active and confirm text never overlaps adjacent controls or pages.

## Screen Reader Smoke Checklist

- [ ] With a screen reader running, open Book Cinema and confirm the dialog name, current book, and scope are discoverable.
- [ ] Start playback and confirm polite announcements update for the current chapter/page scope and fragment without interrupting controls.
- [ ] Change scope and confirm the live announcement reflects the new chapter or page range.
- [ ] Inspect Policy Notes and confirm explanations are readable as normal text, not only visual badges.
- [ ] Confirm Reduced motion and High contrast toggles expose checked state and can be changed from the keyboard.
