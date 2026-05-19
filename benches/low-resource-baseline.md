# Low-Resource Reader Timing Baseline

Reader timing budgets are local-only and calibrated against the mock Book Cinema path. The target
machine class is a modest local development machine running Chromium with the E2E low-resource
profile enabled, which applies 4x CPU throttling and keeps provider latency out of the measurement.

## Procedure

1. Start from a clean checkout with dependencies installed and no dev server already consuming the
   default ports.
2. Run `pnpm bundle:local` to confirm the startup graph is still inside the bundle budgets.
3. Run `pnpm e2e:book-cinema:low-resource` three times. Keep the generated
   `output/e2e-book-cinema/summary.json` from each run long enough to compare values.
4. For each reader timing metric, use the slowest representative mock-stack value across EPUB, DOCX,
   and PDF fixtures:
   - `app-cold-usable`
   - `studio-route-switch`
   - `book-cinema-open`
   - `reader-resume`
5. Set `benches/thresholds.json#readerTiming` with clear headroom for local jitter, then run
   `pnpm validate:local` and `pnpm e2e:book-cinema:low-resource`.
6. Confirm the generated validation report includes any forced degraded states, especially
   `low-confidence-highlight`, `phrase-fallback`, `slow-resume`, and `lazy-panel-loading`, without
   changing the numeric timing budgets unless the three-run calibration proves they are flaky.

## Current Budget Source

The current hard budgets were chosen from local low-resource Book Cinema runs where the slowest
observed representative timings were approximately:

- `app-cold-usable`: 1.5s
- `studio-route-switch`: 210ms
- `book-cinema-open`: 270ms
- `reader-resume`: 280ms

The thresholds intentionally allow moderate local noise while still failing on reader-path
regressions that would be visible on the target machine class.

Degraded-state summaries are not budget thresholds by themselves. They make confidence fallbacks,
lazy-panel loading, and slow resume paths legible in the local reports so UX regressions can be
checked alongside the hard timing gates.
