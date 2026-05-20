# Narrow-Width Cinema QA

Run after `pnpm e2e:book-cinema:responsive` or during manual device QA.

## Viewports

- [ ] Phone-like: `390x844`
- [ ] Tablet portrait: `768x1024`
- [ ] Tablet landscape: `1024x768`
- [ ] Narrow desktop: `1180x820`

## Book, Document, And Website Cinema

- [ ] Open each Cinema surface at every viewport and confirm there is no horizontal overflow.
- [ ] Confirm phone and tablet portrait widths use the shared `More` bottom sheet instead of inspector rails.
- [ ] Confirm tablet landscape and narrow desktop remain usable with the desktop presentation.
- [ ] Open `More` and verify `Source`, `Structure`, `Narration`, and display controls are reachable without covering the footer.
- [ ] Confirm footer playback, speed, bookmark, and `More` controls are at least `44px` by `44px`.
- [ ] Confirm sheet tabs, bookmark rows, recent rows, outline rows, and display controls are at least `44px` by `44px`.
- [ ] Navigate from a bookmark, recent position, and outline row; the sheet should close, focus should return to the reader canvas, and focus mode should remain unchanged.
- [ ] Verify no clipped sheet content, obscured focus ring, or hidden footer control around safe-area insets.
