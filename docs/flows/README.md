# TTS-Research application flow registry

Status: `candidate_pending_chatgpt`

This registry covers the complete known application architecture at the product-flow level: **34 flows** spanning application shell, projects, sources, voice profiles, synthesis, events, persistence, artifacts, playback, reader modes, repair, portability, settings, error recovery, trust boundaries, and diagnostics.

The read-only inventory observed **123 direct HTTP routes** and only five effective pre-existing application-flow diagrams. This candidate pack closes the architecture-map gap without claiming exact route ownership yet.

## Files

- `application-ux.md` — application shell, project, intake, review, policy, preview, and Teleprompt.
- `content-audio-reader.md` — voice, synthesis, events, persistence, artifacts, playback, reader modes, progress, and repair.
- `runtime-data-security.md` — import/export, UI memory, settings, recovery, trust boundaries, and diagnostics.
- `manifest.json` — stable IDs, owners, versions, and required semantic branches.

## Definition of complete

A flow is complete only when:

1. entry, success, failure, recovery/retry, and cancellation semantics are explicit;
2. every implementation route/state belongs to exactly one primary flow or a declared shared concern;
3. trust-boundary crossings declare data class and egress policy;
4. executable tests prove critical branches;
5. Mermaid and semantic freshness checks pass deterministically;
6. ChatGPT returns `AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH` for this packet;
7. repo-local validators and PO verification remain authoritative.

## Current non-claims

- Candidate diagrams are not yet peer-agreed.
- Exact mapping of all 123 routes and implementation state constants is not yet proven.
- No CI enforcement exists yet.
- The diagrams do not authorize implementation outside an agreed Linear issue.
