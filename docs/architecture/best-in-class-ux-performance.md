# Best-in-class UX and CPU-first performance architecture

Status: `candidate_pending_chatgpt`

## Product ranking

1. UX quality and task clarity.
2. Performance and system responsiveness.
3. Feature breadth.

A feature that obscures the core journey or stalls the machine is not best-in-class.

## Product spine

`Choose or create project → add source → review scope → audition → create audio → read/listen → repair/resume/export`

The shell should expose one primary next action, preserve context across modes, and keep diagnostics/recovery adjacent to the failed task. Advanced controls are progressive disclosure, never prerequisites for the basic journey.

## Architecture decisions proposed for peer review

- Keep the local Go API and React client; do not rewrite for fashion.
- Make the local CPU Kokoro path the default. Mock checking is the default; Qwen checking is explicit.
- Bind API/frontend ports through one contract; no hard-coded `8080` when `API_PORT` is supplied.
- Do not import models, probe heavyweight Python modules, download weights, or call providers before the user requests a capability.
- Every external process and network call has a timeout, cancellation, bounded output, and actionable failure.
- Decompose `frontend/src/App.tsx` by shell/domain/state ownership without redesigning behavior in the same issue.
- Keep all heavy surfaces lazy and isolate high-frequency playback/highlight state from shell re-renders.
- Treat flow diagrams and budgets as executable architecture contracts.

## Measured baseline (2026-07-09/10)

- Exact command verified: `API_PORT=8087 PORT=5174 mise start -- pnpm start:local`.
- Lean runtime: Kokoro CPU, mock checker, Qwen preload disabled, FlashAttention disabled.
- Warm frontend readiness: 15.182 s.
- Warm API readiness: 16.824 s.
- First cold post-edit API bind observed around 100 s because `go run` compiled before binding.
- Project create transaction after readiness: 1.8 ms and reversible delete passed.
- Settled API process: about 51 MiB RSS and 0% sampled CPU.
- Settled Vite process: about 118 MiB RSS and 0% sampled CPU.
- `frontend/src/App.tsx`: 735,610 bytes / 21,168 lines.
- Existing bundle budgets: initial JS ≤160 KB gzip, largest async app chunk ≤110 KB gzip, initial CSS ≤15 KB gzip; heavy surfaces and Mermaid must remain lazy.

## Hard performance budgets for the new batch

| Budget | Required target |
| --- | --- |
| Startup egress/model work | Zero model imports/downloads/provider calls before explicit capability use |
| Warm local API ready | p95 ≤ 5 s after dependencies/build cache exist |
| Warm frontend ready | p95 ≤ 5 s |
| Cold post-edit local ready | p95 ≤ 30 s; report compile separately from runtime initialization |
| Idle CPU after 30 s | API ≤1%; frontend dev server ≤1% on the reference machine |
| Idle RSS after 30 s | API ≤100 MiB; frontend dev server ≤200 MiB |
| Project CRUD p95 | ≤100 ms locally |
| Visible action response | p95 ≤100 ms; playback transport acknowledgement ≤50 ms |
| Main-thread long tasks | Zero >50 ms during steady read-along fixture |
| Initial bundle | Preserve current ≤160 KB gzip JS and ≤15 KB gzip CSS gates |
| Largest async app chunk | ≤110 KB gzip |
| App orchestration module | `App.tsx` target <2,000 lines after behavior-preserving extraction; no replacement god-file >3,000 lines |
| Low-resource mode | No GPU/CUDA requirement; CPU synthesis remains usable; optional checks degrade honestly |

## UX definition of best-in-class

- A new user can create a project and begin source intake without model setup.
- Every screen has one visually dominant task and no duplicate competing controls.
- Empty, loading, degraded, failed, interrupted, stale, and ready states explain what happened and offer the next safe action.
- Phone, constrained desktop, desktop, and large desktop preserve content-first hierarchy.
- Keyboard, screen reader, pointer, and touch paths reach the same shared action handlers.
- Read/listen surfaces never let controls occlude source text, cues, or focus content.
- Progress, retry, cancellation, and model capability are observable; no indefinite spinners.

## Required evidence

- Complete 34-flow registry and semantic validator.
- Visual baselines at 390, 1100, 1440, and 1920 px for core journeys and failure states.
- Automated accessibility, action-inventory, surface-complexity, bundle, read-along, and startup-resource reports.
- Archive-backed ChatGPT architecture/UX review followed by issue-atomicity agreement.
