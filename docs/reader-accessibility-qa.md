# Reader Accessibility QA

Use this checklist for manual validation after `mise doctor`,
`mise run validate:local`, `pnpm validate:local`, `pnpm e2e:book-cinema`,
and `pnpm e2e:book-cinema:low-resource` pass locally.

## Keyboard-Only Smoke Run

- [ ] Start from a fresh app load and import an EPUB, PDF, DOCX, Markdown, or HTML book source without using a pointer.
- [ ] Select a book scope, open Book Cinema, and confirm focus remains visible across header, side rail, page controls, and footer controls.
- [ ] Prepare a local document, open Document Cinema, and confirm focus remains visible across source, reader, narration, transport, and settings controls.
- [ ] Prepare a URL source, open Website Cinema, and confirm focus remains visible across source, reader, narration, transport, and settings controls.
- [ ] Use Space and K to toggle play/pause without triggering controls while typing in an input or selecting from a menu.
- [ ] Use Left/J and Right/L to seek by 10 seconds.
- [ ] Use Home to restart the current narration.
- [ ] Use `[` and `]` to step playback speed down and up.
- [ ] Use B to add a bookmark when a matching active book job is available.
- [ ] Use Escape to close Book, Document, and Website Cinema from the reader surface.
- [ ] Confirm focus returns to the control that opened each cinema surface.
- [ ] Resume a saved progress point and confirm the active word/page returns to the saved location.

## Policy And Element Behaviour

- [ ] Switch between Enterprise, Accessibility, Technical Docs, Education, and Language Learning profiles while a book scope is selected.
- [ ] Confirm the book-scope preview refreshes after profile or session override changes.
- [ ] Read a technical chapter containing prose, code, tables, math, citations, captions, lists, quotes, and admonitions.
- [ ] Confirm code, table, math, caption, citation, list marker, admonition, and quote behaviour matches the selected profile/default table.
- [ ] Confirm table traversal changes when `tableHeaderMode` is set to none, column, and row-and-column.
- [ ] Confirm skipped, summarised, on-demand, literal, code, table, citation, and math blocks appear in Policy Notes with a plain-language explanation.

## Highlight And Motion

- [ ] Enable Reduced motion and confirm active-word/block highlights use a static treatment without glow motion in Book, Document, and Website Cinema.
- [ ] Enable High contrast and confirm active words, phrase highlights, Markdown highlights, and website block highlights remain legible in light and dark reader themes.
- [ ] Toggle Reduced motion and High contrast together and confirm page layout does not shift.
- [ ] Change text scale and reader theme while highlights are active and confirm text never overlaps adjacent controls or pages.

## Typography And Reflow

- [ ] Set Text scale to Compact, Comfortable, Large, and Giant in each cinema surface.
- [ ] Set Line spacing to Compact, Comfortable, and Spacious while playback is active.
- [ ] Set Measure to Narrow, Comfortable, and Wide and confirm lines reflow without clipping or horizontal page overflow.
- [ ] Confirm typography/reflow changes do not reset playback, active scope, active block, or saved progress.

## Screen Reader Smoke Checklist

- [ ] With a screen reader running, open Book, Document, and Website Cinema and confirm the dialog name, current source, and scope/block are discoverable.
- [ ] Start playback and confirm polite announcements update for the current chapter/page scope and fragment without interrupting controls.
- [ ] Change scope or active outline block and confirm the live announcement reflects the new chapter, page range, document block, or website block.
- [ ] Inspect Policy Notes and confirm explanations are readable as normal text, not only visual badges.
- [ ] Confirm Reduced motion, High contrast, Text scale, Line spacing, and Measure controls expose state and can be changed from the keyboard.
