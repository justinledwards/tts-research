# TTS-Research application flow registry

Status: `candidate_pending_chatgpt_v8_recheck`

This registry is the canonical candidate architecture map for **39 primary flows**. The current Go AST inventory contains **125 HTTP routes** with exactly one declared primary flow owner and **161 required implementation-state symbols**.

## Canonical and generated files

- `manifest.json` — canonical contracts, ownership, state machines, trust boundaries, and evidence claims.
- `application-ux.md` — generated state tables, transition tables, and Mermaid diagrams.
- `content-audio-reader.md` — generated state tables, transition tables, and Mermaid diagrams.
- `runtime-data-security.md` — generated state tables, transition tables, and Mermaid diagrams.
- `coverage-report.json` — generated exact counts and inventory summary.

`pnpm validate:flows` fails on semantic schema violations, universal normalized templates, route/state/evidence drift, or byte drift in any generated document, README, or report. `pnpm validate:flows -- --write` regenerates derived artifacts only after the canonical contracts pass validation.

## Approval status

The candidate remains blocked from Linear creation until the archive-first ChatGPT gate returns `AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH`. Passing repository validators does not substitute for that advisory gate or PO verification.
