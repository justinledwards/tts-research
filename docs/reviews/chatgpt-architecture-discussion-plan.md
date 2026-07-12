# ChatGPT Architecture Discussion Plan

Status: ready for project-scoped ChatGPT run
Updated: 2026-07-07 01:09 CEST

## Intended ChatGPT project

ChatGPT project: `TTS-Research`.

URL: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/project

Voice Studio project context: `Design for the Real World` is an in-app TTS-Research / Voice Studio project, not a ChatGPT project. Architecture discussions should happen inside the ChatGPT `TTS-Research` project while treating `Design for the Real World` as the target app project/source context.

## Required input package

Use:

```sh
mise exec -- pnpm review:chatgpt
```

The package hard-fails unless the archive contains committed complete-UI screenshots for:

- phone 390px;
- constrained desktop 1100px;
- desktop 1440px;
- large desktop / taskbar 1920px;
- website, document, EPUB/book, PDF, DOCX read-along/cinema surfaces.

## Discussion rules

- Treat ChatGPT as a skeptical architecture/product partner, not a code-review-only reviewer.
- Attach the verified `review:chatgpt` archive in every new top-level discussion.
- Prompts must be atomic and include the product brief, Linear cap, source-of-truth split, archive SHA, and required output marker.
- Continue follow-ups until ChatGPT returns `AGREED ARCHITECTURE` or `NOT AGREED`.
- Save every prompt/response summary under `docs/reviews/chatgpt-discussion-log.md` with conversation URL, archive SHA, and decision deltas.
- Only after agreement, create/update up to 20 Linear issues and write a local Linear manifest.

## Prompt sequence

### 1. Product / market fit

Ask ChatGPT to pressure-test the purpose, target users, competing alternatives, best-in-class bar, and market wedge for a TTS aid whose differentiator is instant read-along over arbitrary serious sources.

### 2. Source model

Pressure-test source adapters, Content IR, provenance, partial extraction, OCR/web/PDF/EPUB/DOCX edge cases, and user-visible failure semantics.

### 3. ASAP read-along architecture

Pressure-test phase orchestration, partial audio manifests, segment readiness, alignment timing, first-playable latency, and safe fallback when checks lag.

### 4. Resume and retry model

Pressure-test navigation/reload resume, playback progress, retry phase constraints, reusable artifacts, cancellation, and failure recovery.

### 5. Responsiveness architecture

Pressure-test frontend state locality, workers, streaming updates, scheduling, performance budgets, and low-resource degradation.

### 6. UI / complete screenshot review

Use committed screenshots and screenshot manifest to review all expected screen sizes and UI modes: workspace, settings, teleprompt, website/document/book/PDF/DOCX cinema, read/review/debug/inspect modes, failure states, menus, and phone/tablet/desktop variants.

### 7. Issue-batch design

Ask ChatGPT to convert the agreed architecture into <=20 Linear-ready issues with dependencies, acceptance criteria, verification commands, and explicit out-of-scope items.
