# Best-in-class UX and CPU-first performance architecture

Status: `responsive_peer_request_changes_reconciled_planned_not_implemented`

## Product ranking

1. UX quality and task clarity.
2. Performance and system responsiveness.
3. Feature breadth.

A feature that obscures the core journey or stalls the machine is not best-in-class.

## Progressive product spine

`Choose or create → add source → show first readable content → confirm or adjust scope → optional audition → start first playable prefix → read/listen while remaining work continues → repair/resume/export`

Reading and playback are progressive capabilities, not rewards for completing a wizard. A readable unit may appear before narration, and the earliest contiguous narratable prefix may synthesize before full extraction. The shell exposes one primary next action without hiding already-available reading or playback. Advanced controls remain optional progressive disclosure.

## Architecture decisions

- Keep the local Go API and React client; do not rewrite for fashion.
- Make the local CPU Kokoro path the default. Mock checking is the default; Qwen checking is explicit.
- Bind API/frontend ports through one contract; no hard-coded API port when `API_PORT` is supplied.
- Do not import models, probe heavyweight Python modules, install dependencies, download weights, mutate model caches, or call providers before the user requests a capability.
- Define readiness with successful frontend and API HTTP probes plus the project-create smoke, never listener presence alone. A missing readiness mechanism fails closed.
- Every external process and network call has a deadline, cancellation, process-group termination, grace period, bounded output, temporary-file cleanup, and actionable failure classification.
- Decompose `frontend/src/App.tsx` by shell/domain/state ownership without redesigning behavior in the same phase. Each phase starts from characterization, render-count, lazy-chunk, and bundle evidence.
- Keep heavy surfaces lazy and isolate high-frequency playback/highlight state from shell re-renders.
- Treat UX state coverage, flow contracts, and performance budgets as architecture gates.
- Establish the baseline before App extraction or UX implementation; every later issue reruns each affected gate.

## Responsive Cinema ownership contract

This section reconciles [`chatgpt-responsive-architecture-response-v1.md`](../reviews/chatgpt-responsive-architecture-response-v1.md). It is the planned replacement architecture, not a claim about current behavior or authorization to implement it. The old BIC packet remains frozen provenance; responsive replacement ownership is tracked as planned only in the flow registry and the [repair matrix](../reviews/chatgpt-responsive-architecture-repair-matrix-v1.md).

Each independent lifecycle has exactly one authority. Components derive presentation and control proxies from these authorities; they do not reconstruct domain state independently.

| Domain | Server authority | Client authority | Stable identity |
| --- | --- | --- | --- |
| Source preprocessing and revision | Existing source lifecycle service | Planned `SourceSessionStore` | `{sourceId, revisionId, contentHash}` |
| Narration execution | Pipeline/job service | Planned `NarrationRunStore` mirror | immutable `runId` binding |
| Playable media manifest | Persisted segment/artifact manifest | Manifest slice in the planned run store | `{runId, manifestVersion, segmentIndex, artifactId}` |
| Playback cursor and intent | Optional durable progress endpoint | One planned `PlaybackSessionController` | `{sourceRevisionId, runId}` |
| Sync fidelity | Timing/mapping decision evidence | Planned fidelity projection/store | `{runId, segmentIndex, timingRevision}` |
| Open Cinema/reader session | No server authority required | One `CinemaSession` | pinned revision plus locator |
| Voice Preview/Audition | Voice-preview service | `VoiceAuditionSession` | `previewId`, never narration `runId` |

`App.tsx` is not the target authority for any of these domains. Its current ownership and terminal gates are baseline defects to remove only through the planned migration graph.

### Source readiness, detail hydration, and revision pinning

- Server source state is separate from client hydration: `absent → preprocessing → ready`, with `failed`, `superseded/stale`, and `archived` branches. Client state is `summary → hydrating → readable`, with a render-degraded fallback.
- The prepared-source list must become a true summary DTO. The current helper clears top-level `Text` and `SpeechText`, but retains every block and up to 220 characters of each block's `Text` and `SpokenText`; that bounded block text is still detail payload and is excluded from the target list DTO.
- List fetches are single-flight/idempotent by project/cache key. React StrictMode remains enabled. Selection detail is hydrated on demand, and a stale response cannot overwrite a newer selection.
- A preprocessing/create response seeds complete detail for the newly prepared source rather than forcing an avoidable list-then-detail round trip.
- Cinema opens its shell from source readiness and hydrates missing detail without waiting for narration. A readable resident revision enables reading immediately.
- An open Cinema session pins `{sourceId, revisionId, contentHash}`. A newer revision produces a stale/superseded notice; it never silently substitutes text beneath audio, timing, bookmarks, or the cursor. Choosing the newer revision creates a distinct source/Cinema session and requires compatible or new narration.

### Narration execution and manifest-derived playability

Narration execution phase describes work only:

`idle → accepted → queued → optimizing → synthesizing → checking → completed`

Active work may enter `cancelRequested → cancelled`, `interruptedRetriable`, or `failed`. A run is immutably bound to source revision/content hash, voice-profile version, engine/configuration hash, speech-policy hash, segmentation-policy version, and audio format. Retry creates a linked new run and reuses an artifact only when its full compatibility key matches.

Partial playability is **not** a run phase. The media manifest independently derives:

```text
canPlayAudio = contiguousPlayableDurationMs > 0
```

Only the contiguous compatible segment prefix counts. A ready segment after a missing/incompatible segment does not extend `contiguousPlayableThroughIndex` or duration. Full generation, final assembly, checking, and timing fidelity are separate facts. Cancellation or later failure preserves a previously committed compatible prefix.

The existing progressive manifest/publication, `FirstPlayableAt`, compatibility, replacement, and reuse primitives are retained. The target segmentation policy also fixes the separate first-playable latency defect: aim for an initial 4–8 seconds of estimated speech, treat 12 seconds as the hard target maximum, and safely split an overlong sentence at clause/phrase boundaries. The observed production-default behavior—one 42-word, approximately 16.2-second segment—shows why ingress repair alone is insufficient.

### Sequenced narration events and reconnect

The current endpoint is SSE, but it sends complete job snapshots from a 1,500 ms server ticker and has no event IDs, sequence cursor, replay, or client duplicate/gap reducer. It is a timed snapshot protocol, not the target event protocol.

The target event envelope contains `schemaVersion`, `eventId`, `runId`, monotonic `sequence`, `occurredAt`, source/revision identity, `type`, and payload. Required events cover acceptance, phase changes, segment playable/replaced/failed, sync updates, cancellation, interruption/failure, completion, and heartbeat. Artifact bytes remain outside SSE.

Publication ordering is durable artifact → manifest/snapshot → sequence record → event. SSE `id:` matches the sequence. Reconnect accepts `Last-Event-ID` or `afterSequence`; authoritative snapshots carry `snapshotSequence`. The canonical reducer ignores stale/duplicate sequences, applies the exact next sequence once, and reconciles a gap from snapshot before buffered later events. Reconciliation never resets Cinema locator, cursor, rate, play intent, or controller identity. The existing source-manifest replay/snapshot design is the precedent.

### One playback owner and Cinema ingress

- One `PlaybackSessionController` owns audio/Web Audio for the active `{sourceRevisionId, runId}`. Multiple visible controls are proxies to it, never additional media owners.
- Preserve the append/scheduling behavior in `ArrivalAudioPlayerQueue`, but remove arrival-versus-completed player replacement. A final assembled file is an optional artifact optimization, not a new controller.
- Manifest updates append compatible segments without recreating the session. Missing next audio enters buffering at the end of the contiguous prefix while reading stays active. Replacement applies at a safe boundary and never destroys an already-playing node.
- Cinema availability depends on source readability, not `generatedAudioLifecycle === "ready"`. Before audio it is a reading-only session. Narration acceptance and progress are non-modal; the already-mounted regular transport enables when the first contiguous playable prefix arrives.
- Cursor, rate, play/pause intent, follow preference, reader locator, callbacks, and controller identity survive segment arrival, final assembly, reconnect, cancellation, and terminal completion.

### Independent sync fidelity and Preview/Audition

Sync fidelity is an independent availability projection:

1. `sourceOnly` — reading works; no playable-audio/follow promise.
2. `audioOnly` — audio works; mapping/timing is absent or untrusted.
3. `phraseFollow` — phrase/block following is reliable.
4. `trustedWordFollow` — exact-word source, artifact, timing, and compatibility gates pass.

Timing can upgrade or downgrade the active session without remounting it. A timing failure disables only unsupported highlight precision; it does not fail narration, reading, or audio.

Preview/Audition remains a voice-cloning and voice-comparison flow using preview IDs and preview APIs. Normal Reader, Cinema, Review, Teleprompt, and Theatre narration uses the regular controller. No preview component may accept a narration `runId` or mount audio for one.

### Overlays, drawers, and hit-test ownership

- The tutorial is a **non-modal Drawer**, not a semantic modal. It must reserve/adapt layout so primary content and actions remain usable; it must not claim modal focus/inert semantics.
- A true modal makes background content inert and inaccessible and owns focus entry, containment, Escape/cancel, and restoration.
- At 390, 1100, 1440, and 1920 CSS pixels, primary-control center/action-region `document.elementFromPoint` probes must resolve to that control or a descendant.
- Read-along/Teleprompt highlight layers do not intercept unrelated actions. Geometry, hit-testing, focus, zoom/text scale, 44×44 targets, overflow, duplicate labels, and one-dominant-action rules are release gates.
- Optional diagnostics, tutorial code, rich renderers, and inactive stages remain lazy and may not cover or materially delay the reading/narration path.

## Core-surface state matrix

Every core surface must render the states below. “Stay usable” means the state is not applicable to that surface's own operation and must not disable unrelated controls. Each cell describes the dominant content and recovery, not implementation wording. `partial/playable` is a UI projection of a non-empty contiguous manifest prefix; it is never a narration-run phase.

| State | Project library | Intake/workspace | Scope/preview/generation | Reader/listener | Teleprompt/Theatre | Settings/capabilities |
| --- | --- | --- | --- | --- | --- | --- |
| `empty` | Explain no projects; **Create project** | Explain no source; **Add source** | Explain preview needs source; **Add source** | Explain no readable content; **Return to source** | Explain presenter needs content; **Return to reader** | Explain no optional capability selected; **Choose capability** |
| `connecting` | Preserve library shell; announce API connection | Preserve entered source; announce source connection | Preserve scope; announce job-channel connection | Keep readable content; announce audio connection | Keep cues visible; announce transport connection | Keep form values; announce capability check |
| `loading` | Stable project skeleton and label | Stable source skeleton and label | Stable scope/preview skeleton and label | Stable text skeleton or preserved prior text | Stable cue stage; controls do not jump | Stable control skeleton; current values do not jump |
| `processing` | Show project indexing once, without duplicate actions | Show extraction progress; first readable content wins | Show scoped synthesis progress and cancel | Permit reading available units while work continues | Permit prepared cues; label remaining preparation | Show user-triggered activation progress only |
| `partial/readable` | Mark project readable; **Read** | Show first readable content; scope remains adjustable | Show readable prefix and optional audition | Open source-only reading immediately | Show available cues with unavailable portions labeled | Stay usable; explain capability is not needed for reading |
| `partial/playable` | Mark playable prefix; **Continue** | Show playable-prefix affordance beside readable content | Play labeled checked/unchecked prefix while generation continues | Play available prefix; preserve source-only fallback | Present only prepared playable range; label boundary | Stay usable; capability status remains observable |
| `ready` | Continue the most recent project | Show accepted source and next safe action | Show complete preview and **Read/listen** | Full reading/playback with resume/export | Full prepared presenter mode | Show current effective settings and capability status |
| `degraded` | Keep usable projects; label unavailable metadata | Keep readable extraction; label omitted/low-confidence parts | Offer lower-fidelity or mock-safe path | Fall back honestly to phrase, block, audio-only, or source-only | Reduce motion/fidelity without hiding cues | Explain optional capability degradation and fallback |
| `capability-unavailable` | Do not block project access | Do not block source reading | Explain unavailable audition/checker; offer safe fallback or setup | Keep source-only reading; disable only unavailable audio action | Keep text presentation if audio capability is absent | Explain requirement, local impact, and explicit activation path |
| `reconnecting` | Preserve cached list as potentially stale | Preserve source draft/readable units | Preserve scope and committed progress | Continue local reading/playback where safe | Preserve current cue and transport state | Preserve edits; defer verification until reconnected |
| `stale` | Label snapshot age; **Refresh** | Identify superseded source revision; preserve draft | Identify stale preview/artifacts; **Regenerate affected work** | Resolve progress through revision map or offer versions | Pause stale automation; choose current source version | Identify settings changed elsewhere; reload or keep edits |
| `interrupted` | Identify interrupted project work | State where extraction stopped and what survived | State completed segments and safe resume point | Keep readable/playable artifacts; offer **Resume** | Keep last stable cue; offer safe resume | State interrupted activation and retained configuration |
| `canceling` | Keep project accessible; announce cancellation | Freeze duplicate submit; show bounded cancellation | Keep completed artifacts visible; stop future work | Keep preserved content usable | Stop future cue/audio work without blanking stage | Keep settings usable; show activation cancellation |
| `canceled` | Keep project and preserved artifacts | Show retained source/readable units and restart action | Show retained compatible outputs and restart cost risk | Keep preserved reading/playback available | Return to preserved cue/text | Show unchanged effective configuration and retry action |
| `failed` | Name failed operation; keep other projects usable | Name failed intake phase; show preserved input and safe retry | Name failed phase/segment; offer scoped retry | Keep readable content; isolate failed audio/sync | Keep text/cues; isolate failed transport/audio | Name failed capability step; preserve credentials/settings safely |
| `blocked` | Explain the user-resolvable prerequisite | Explain format/access prerequisite and alternative | Explain prerequisite with direct resolution action | Explain why requested mode is unavailable; keep safe fallback | Explain missing preparation; return to reader | Explain missing dependency/credential and explicit setup action |
| `restored` | Announce refreshed projects and resume target | Confirm restored draft/source and retained work | Confirm resumed phase and reused artifacts | Restore focus, locator, playback state, and fidelity label | Restore cue, mode, and focus without surprise autoplay | Confirm effective values and restored capability state |

## UX acceptance contracts

These are release criteria, not polish guidance:

- **Containment:** no horizontal overflow, narrow word columns, clipped labels/content, or viewport escape. Relevant states have evidence at every width in `benches/thresholds.json#uxEvidence.viewportWidthsPx`.
- **Hierarchy:** one visually dominant task per surface and no duplicated visible action label for the same action. Do not repeat missing-source copy and Intake actions across cards, stages, and footers.
- **Progressive disclosure:** diagnostics are hidden by default on normal-user surfaces. Recovery copy may link to optional diagnostics after the safe action.
- **Responsive inspector:** below `benches/thresholds.json#uxEvidence.sheetRequiredBelowWidthPx`, use the shared sheet pattern rather than an inspector rail. The sheet owns focus and never creates a narrow residual content column.
- **Touch and safe areas:** targets satisfy the width/height budgets in `#uxEvidence`; fixed controls include viewport safe-area insets and remain reachable at browser zoom and text scaling.
- **Shared actions:** keyboard, pointer, touch, command-palette, and shortcut paths invoke the same action handler and therefore share authorization, idempotency, state transition, analytics, and recovery behavior.
- **Focus:** dialogs/sheets have intentional focus entry, containment while modal, visible focus, Escape/cancel behavior, and restoration to the invoking control. Route/state changes move focus only when the user needs a new context.
- **Announcements:** polite live regions announce connecting, progress milestones, partial-readable/playable availability, reconnecting, restored, and non-urgent failure states. Assertive announcements are reserved for immediate interruption/safety needs; progress updates are coalesced.
- **Adaptation:** verify reduced motion, forced/high contrast, text scale, user spacing overrides, readable measure, browser zoom, and reflow. Motion is never the only state cue; content order and actions remain coherent without animation.
- **No occlusion:** controls, toasts, sheets, transport bars, and safe-area padding never cover reader text, presenter cues, focus targets, or the active highlight.

### User recovery copy contract

Every degraded, stale, interrupted, canceled, failed, or blocked message states, in this order:

1. what happened in user language;
2. what input, readable content, progress, and artifacts were preserved;
3. whether retry can duplicate work, cost, or egress;
4. the next safe action, expressed as the dominant control; and
5. where optional diagnostics can be opened.

Internal phrases such as “explicitly blocked with owner” are never user recovery copy. Never promise that retry is safe when idempotency or artifact reuse is unknown.

## Performance budget contract

`benches/thresholds.json` is the sole machine-readable numerical source. It contains startup, process-tree resource, local-operation, acknowledgement, bundle, reader, read-along, low-resource, UX-evidence, and staged maintainability limits. Prose does not override it. Existing bundle and reader-timing reports render their threshold rows from that file; the measurement and artifact protocol is in [`../performance.md`](../performance.md).

The CSS decision is intentionally unchanged: `frontendBundle.maxInitialCssGzipBytes` remains the current canonical 15,000-byte gate. The prior 14 KB prose value was not the implemented gate and has been removed; this correction does not relax a limit.

`App.tsx` line ceilings are maintainability proxies, not performance proof. Each extraction phase must also preserve characterization tests and pass affected render-count, lazy-chunk, bundle, interaction, and read-along gates. The final phase must satisfy both final module limits in `#maintainability`.

## Evidence and non-claims

Required evidence includes:

- state-matrix captures for every relevant core surface/state at the canonical viewport widths;
- automated accessibility, action-inventory, overflow/occlusion, surface-complexity, bundle, reader-timing, read-along, startup-egress, shutdown, and process-tree resource reports;
- production bundle graphs, long-task traces, and render-count evidence before and after affected work;
- runtime evidence with denied egress, empty model caches, and no GPU/CUDA available;
- exact command, commit/worktree state, machine metadata, cache/build state, discarded warm-up, measured runs, p50/p95/max, failures, and artifact paths;
- archive-backed advisory architecture/UX review followed by issue-atomicity agreement.

This document does not claim a complete flow registry, preview readiness, or release approval. Repository flow artifacts remain evidence inputs and must be validated for the specific surface/state under review.
