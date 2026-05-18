# Frontend Performance

Voice Studio is optimized for local-first reading on modest machines. The default startup path should
load the shell, narration controls, and current project state only. Heavy inspection, import/export,
diagnostic, Markdown, Mermaid, and Book Cinema surfaces must stay lazy until the user opens them.

## Critical Path Rules

- Keep the initial JS graph under the local bundle budgets in `benches/thresholds.json`.
- Do not import `MarkdownRenderer`, Mermaid, Content IR drawers, bundle tools, settings/help panels,
  workspace drawers, pronunciation tools, or diagnostics panels from the default path.
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

`validate:local` includes a Frontend Bundle Performance section in JSON, Markdown, and HTML reports.
The bundle gate currently fails on startup graph regressions. Browser timing metrics are recorded as
baseline data in the Book Cinema E2E summary and do not fail validation yet.

## Budgets

Current local bundle gates:

- Initial JS raw bytes: `<= 520000`
- Initial JS gzip bytes: `<= 160000`
- Initial CSS gzip bytes: `<= 14000`
- Largest async app chunk gzip bytes: `<= 110000`
- Mermaid/diagram vendor chunks must not appear in the initial graph

Reader timing metrics exposed through `window.__ttsResearchPerformance.metrics`:

- `app-cold-usable`
- `studio-route-switch`
- `book-cinema-open`
- `reader-resume`

To convert timing baselines into hard budgets, run the low-resource smoke several times on the target
machine class, use the slowest representative mock-stack values, then add thresholds to the local
performance step. Keep provider latency out of those thresholds.
