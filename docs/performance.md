# Frontend Performance

Voice Studio is optimized for local-first reading on modest machines. The default startup path should
load the shell, narration controls, and current project state only. Heavy inspection, import/export,
diagnostic, Markdown, Mermaid, and Book Cinema surfaces must stay lazy until the user opens them.

## Critical Path Rules

- Keep the initial JS graph under the local bundle budgets in `benches/thresholds.json`.
- Do not import `MarkdownRenderer`, Mermaid, Content IR drawers, bundle tools, settings/help panels,
  workspace drawers, pronunciation tools, or diagnostics panels from the default path.
- Book Cinema's normal reader overlay must not statically import the Markdown/Mermaid renderer. The
  Markdown document reader is lazy and should load only for Document Cinema.
- Import contract or SDK helpers directly only when they do not pull schema validators into the
  browser entry. If a barrel import adds AJV/schema code to startup, replace it with a small local
  helper or a narrower package export.
- Reader state helpers belong in lightweight model modules. UI modules such as `BookCinemaPanel.tsx`
  should be loaded only when the Book panel or overlay is rendered.

## Measuring Locally

Run the bundle budget check:

```sh
pnpm bundle:local
```

Run the full local validation report:

```sh
pnpm validate:local
```

Run the mock-only low-resource Book Cinema smoke:

```sh
pnpm e2e:book-cinema:low-resource
```

`validate:local` includes Frontend Bundle Performance and Book Cinema reader timing sections in JSON,
Markdown, and HTML reports. Bundle and timing thresholds both fail locally; there is no hosted CI
dependency for these gates.

The stable reviewer artifacts are written under `output/performance/latest/`:

- `timing.json`: low-resource timing summary and threshold inputs.
- `bundle.json`: production bundle graph, gzip sizes, and lazy-loading status.
- `degraded-states.md`: explainable slow, fallback, and lazy-loading states seen during the run.

## Budgets

Current local bundle gates:

- Initial JS raw bytes: `<= 520000`
- Initial JS gzip bytes: `<= 160000`
- Initial CSS gzip bytes: `<= 14000`
- Largest async app chunk gzip bytes: `<= 110000`
- Mermaid/diagram vendor chunks must not appear in the initial graph
- Book Cinema must keep Markdown rendering out of its static import graph
- Forbidden startup imports must remain absent from the initial graph

Current local reader timing gates:

- `app-cold-usable`: `<= 2200ms`
- `source-switch`: `<= 1200ms`
- `studio-route-switch`: `<= 600ms`
- `book-cinema-open`: `<= 450ms`
- `transport-interaction-latency`: `<= 850ms`
- `teleprompt-cue-switch`: `<= 1100ms`
- `settings-open`: `<= 850ms`
- `preview-generation-handoff`: `<= 900ms`
- `command-palette-open-search`: `<= 2200ms`
- `context-panel-tab-switch`: `<= 950ms`
- `reader-resume`: `<= 500ms`

Reader timing metrics are exposed through `window.__ttsResearchPerformance.metrics` and summarized
from the Book Cinema E2E smoke. The gate uses the worst observed value across the EPUB, DOCX, and PDF
fixtures. Missing metrics fail the threshold check, so new reader flows must keep emitting the same
markers when the UX changes.

The low-resource smoke records the broader interaction set once per run and keeps the reader/Cinema
open/resume metrics across all Book fixtures. The interaction metrics use mock providers and browser
CPU throttling to measure local UI work, not provider latency.

## Low-Resource Budget Procedure

Use `benches/low-resource-baseline.md` when changing the hard timing budgets. In short:

1. Run `pnpm bundle:local`.
2. Run `pnpm e2e:book-cinema:low-resource` at least three times on the target local machine class.
3. Use the slowest representative mock-stack value for each reader metric, add modest jitter
   headroom, and update `benches/thresholds.json#readerTiming`.
4. Run `pnpm validate:local` and `pnpm e2e:book-cinema:low-resource`.

Provider latency is intentionally excluded. The low-resource smoke uses mock providers and Chromium
CPU throttling so the budget covers local UI startup, route switching, Book Cinema open, and resume
work rather than network or model variance.

## Degraded-State UX

Timing confidence and slow local work should be visible without blocking the reader:

- Low-confidence highlight maps show a timing status chip and use phrase/block highlighting instead
  of presenting inaccurate word timing.
- Phrase fallback is recorded in `window.__ttsResearchPerformance.degradedStates` and summarized in
  local validation reports.
- Resume opens the reader first. If restoring the saved point takes longer than 250ms, the overlay
  shows a stable restoring state; resume work over 500ms is recorded as `slow-resume`.
- Lazy panels use fixed-size placeholders with `aria-busy` and record `lazy-panel-loading` while
  their chunk is loading.
- If locator resume cannot map into the current highlight map, the reader falls back to saved elapsed
  seconds and records that fallback in the degraded-state detail.

## UI Change Rules

- New panels, diagnostics, schema viewers, Markdown/Mermaid rendering, and waveform decoding must be
  loaded behind the user action that opens them.
- Reader resume must not wait for secondary drawers, project export/import code, provider
  diagnostics, or Markdown diagram rendering.
- Book, provider, system, and voice-source diagnostics should load when their panels or modes become
  visible, not during the cold reader startup path.
- Prefer direct model/helper imports over barrels that pull validators or diagnostics into
  `main.tsx` or `App.tsx`.
- If a feature needs reader state, put the shared state shape in a lightweight model module and keep
  the React surface lazy.
- After adding UI to the startup, studio switch, Book Cinema open, or resume path, run the low-resource
  smoke and confirm `readerTiming.thresholds` passes in the summary.
