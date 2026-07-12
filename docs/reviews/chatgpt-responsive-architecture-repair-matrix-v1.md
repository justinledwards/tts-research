# ChatGPT Responsive Architecture Repair Matrix — v1

Date: 2026-07-10

Source verdict: [`chatgpt-responsive-architecture-response-v1.md`](chatgpt-responsive-architecture-response-v1.md)

Verdict: `TTS_RESPONSIVE_ARCHITECTURE_REQUEST_CHANGES`

Status: Peer response reconciled into architecture, performance, brief, and flow planning surfaces. Acting Product Owner accepted the exact `RSP-01`–`RSP-15` graph and the in-repository strangler-remake strategy on 2026-07-10. **Peer v2 remains pending; nothing is covered, implemented, implementation-authorized, or Linear-authorized.**

## Scope and provenance rules

- The owner-directed product invariants are retained. The candidate lifecycle and current 20-issue BIC packet are not approved for responsive implementation.
- The old BIC packet and its `BIC-*` flow evidence assignments remain frozen provenance. They are not rewritten to imply they contained the responsive model.
- Responsive `RSP-*` ownership below is replacement planning only. Existing flow transitions still have zero covered claims; a planned owner is not implementation evidence.
- This reconciliation does not modify the replacement contract packet, responsive validators/tests, product code, `package.json`, old BIC packet, or Linear.
- Owner acceptance is recorded. Only `RSP-01` is graph-unblocked; the independent Peer v2 gate still blocks product implementation and Linear creation.

## One-to-one root-cause ledger

| ID | Peer finding | Reconciled repair | Documentation/flow surface | Planned owner | Status |
| --- | --- | --- | --- | --- | --- |
| RC-1 / §1.1 | One terminal generated-audio lifecycle conflates source readability, run execution, playability, and sync fidelity. | Define independent authorities. Keep run phase execution-only; derive `canPlayAudio` from `contiguousPlayableDurationMs > 0`. | Brief “Architectural contradiction”; architecture “Responsive Cinema ownership contract”; `JOB-RUN-001`, `ARTIFACT-001`, `PLAYBACK-001`, `SYNC-FIDELITY-001` | `RSP-01`, `RSP-06`–`RSP-09` | Planned; not implemented |
| RC-2 / §1.2 | Cinema already supports pre-audio reading internally; ingress/top-level ownership is defective. | Enable Cinema from a readable pinned source revision, hydrate detail independently, and keep narration non-modal. | Architecture “Source readiness…” and “One playback owner and Cinema ingress”; `SRC-REVIEW-001`, `CINEMA-001` | `RSP-03`, `RSP-08` | Planned; current terminal gate remains baseline defect |
| RC-3 / §1.3 | Progressive backend/media primitives exist and should be retained. | Reuse partial manifests, per-segment publication, compatibility/replacement/reuse, ready counts, and `FirstPlayableAt`; normalize behind the target contract rather than rewrite. | Architecture “Narration execution…”; `SPEECH-PLAN-001`, `JOB-RUN-001`, `ARTIFACT-001` | `RSP-04` | Planned reuse; not proof of end-to-end behavior |
| RC-4 / §1.4 | Production segmentation can collapse useful passages into one long unit. | Add an independent first-playable segmentation seam: 4–8 s initial target, 12 s hard target maximum, safe clause/phrase fallback for overlong sentences, immediate durable publication. | Brief timing evidence; architecture “Narration execution…”; performance baseline; `SPEECH-PLAN-001`, `JOB-RUN-001` | `RSP-04` | Planned; observed 42-word/~16.2 s one-segment case recorded |
| RC-5 / §1.5 | Arrival/completed players can replace the playback owner. | Extract one append-capable controller. Final assembly is an optional same-session artifact; controller/cursor/rate/intent survive append and completion. | Architecture “One playback owner…”; `PLAYBACK-001`, `ARTIFACT-001` | `RSP-07`, `RSP-08`, `RSP-10` | Planned; duplicate-owner baseline not repaired |
| RC-6 / §1.6 | Regular narration is routed through Preview/Audition semantics. | Reserve preview IDs/APIs and “Audition” labels for voice cloning/comparison. Regular narration uses the Cinema/reader controller; preview cannot accept `runId`. | Architecture “Independent sync fidelity and Preview/Audition”; `PREVIEW-001`, `PLAYBACK-001`, `CINEMA-001` | `RSP-11` | Planned; not implemented |
| RC-7 / §1.7 | Source-preps list is detail-shaped, but does not retain top-level full text. | Correct evidence wording: top-level `Text`/`SpeechText` is cleared; complete block arrays remain with each block’s text fields bounded to 220 characters. Target a true summary DTO and detail-on-demand single-flight hydration. | Brief bootstrap evidence; architecture “Source readiness…”; performance baseline; `SRC-DURABLE-001`, `SRC-REVIEW-001` | `RSP-02`, `RSP-03` | Correction recorded; DTO not implemented |
| RC-8 / §1.8 | SSE exists, but it is a 1.5-second complete-snapshot ticker without sequence/replay semantics. | Record the exact baseline. Target durable monotonic events, `id:`, `Last-Event-ID`/`afterSequence`, `snapshotSequence`, duplicate/gap reducer, and push-driven segment publication. | Brief timing evidence; architecture “Sequenced narration events…”; performance baseline/marks; `JOB-EVENTS-001`, `SRC-MANIFEST-001` | `RSP-05`, `RSP-06`, `RSP-10` | Planned; ticker remains baseline defect |
| RC-9 / §1.9 | Source revision and stale-state primitives already exist. | Make server revision/content hash authoritative. Pin Cinema; show stale/superseded; never silently rebind old audio/timing/progress to new text. | Architecture “Source readiness…”; `SRC-MANIFEST-001`, `REPAIR-001`, `CINEMA-001` | `RSP-03`, `RSP-10` | Planned reuse; not implemented |
| RC-10 / §1.10 | Sync can degrade without blocking audio. | Expose `sourceOnly`, `audioOnly`, `phraseFollow`, `trustedWordFollow`; allow in-session upgrade/downgrade; timing failure affects highlight precision only. | Architecture “Independent sync fidelity…”; `SYNC-FIDELITY-001`, `CINEMA-001` | `RSP-09` | Planned; not implemented |
| RC-11 / §1.11 | Overlay/tutorial defects are symptoms; tutorial is a non-modal Drawer, not a modal. | Correct terminology and semantics. Non-modal Drawer preserves background operability and reserves/adapts layout; true modal makes background inert. Add geometry, hit-test, focus, and highlight interception gates. | Brief product-state evidence; architecture “Overlays, drawers…”; performance overlay gate; `APP-NAV-001`, `TELEPROMPT-001`, `THEATRE-001`, `CINEMA-001` | `RSP-13` | Planned; current occlusion remains baseline defect |
| RC-12 / §1.12 | App monolith and bundle failures are supported but secondary. | Extract canonical owners before shell decomposition; retain StrictMode; lazy-load diagnostics/tutorial/rich renderers/inactive stages; preserve current bundle gates. | Architecture ownership/overlay sections; performance responsive contract; `APP-BOOT-001`, `APP-NAV-001`, `DIAGNOSTICS-001` | `RSP-12`, `RSP-14` | Planned; recorded bundle exceeds existing gzip gates |

## One-to-one target-contract ledger

| ID | Peer contract | Reconciled target | Primary documentation | Planned owner/status |
| --- | --- | --- | --- | --- |
| TA-1 / §2.1 | Exactly one authority per independent lifecycle. | Ownership table pins source, run, manifest, playback, sync, Cinema, and audition identities. | Architecture ownership table | `RSP-01`; planned only |
| TA-2 / §2.2 | Separate server source lifecycle from client hydration and revision-pinned Cinema. | Summary/hydrating/readable split, create-response seeding, stale-response rejection, immutable revision pin. | Architecture “Source readiness…” | `RSP-02`, `RSP-03`; planned only |
| TA-3 / §2.3 | Run phase is execution-only and immutably bound. | `accepted → queued → optimizing → synthesizing → checking → completed`, cancellation/failure/interruption branches, linked retry and compatibility-key reuse. | Architecture “Narration execution…” | `RSP-04`–`RSP-06`, `RSP-10`; planned only |
| TA-4 / §2.4 | Manifest—not run phase—owns partial playability. | Non-empty contiguous compatible duration is the sole initial playability formula; gaps stop the prefix. | Brief correction; architecture manifest formula | `RSP-01`, `RSP-06`, `RSP-07`; planned only |
| TA-5 / §2.5 | First-playable policy must optimize early useful audio. | 4–8 s target, 12 s hard target maximum, long-sentence fallback, immediate publish, checker/final assembly independent. | Architecture segmentation paragraph; performance synthesis gates | `RSP-04`; planned only |
| TA-6 / §2.6 | Durable monotonic run events with replay/snapshot semantics. | Commit-before-publish, sequenced envelope/events, cursor reconnect, duplicate/gap handling, no local-session reset. | Architecture event section; performance event marks | `RSP-05`, `RSP-06`; planned only |
| TA-7 / §2.7 | One playback session/controller. | Append compatible segments; preserve intent/cursor/rate/callbacks; no arrival/completed mode switch. | Architecture playback section | `RSP-07`, `RSP-08`; planned only |
| TA-8 / §2.8 | Sync fidelity is independent. | Four visible levels; timing updates do not remount or block reading/audio. | Architecture fidelity section | `RSP-09`; planned only |
| TA-9 / §2.9 | Cancellation preserves useful partial success. | `cancelRequested` visible; stop new work; retain readable source and committed compatible prefix. | Architecture run/playback sections | `RSP-10`; planned only |
| TA-10 / §2.10 | Disconnect/reconnect preserves local reading/audio and converges deterministically. | Continue resident/buffered state; replay/snapshot through canonical reducer; same controller consumes reconciliation. | Architecture event/playback sections; performance reconnect row | `RSP-05`, `RSP-06`, `RSP-10`; planned only |
| TA-11 / §2.11 | Persist compatible server evidence and a bounded client checkpoint. | Persist source/run/manifest/sequence/cancellation/progress; client stores IDs, locator, cursor, rate, follow preference; restore paused and fail to reading-only. | Architecture ownership/revision/playback sections | `RSP-07`, `RSP-10`; planned only |
| TA-12 / §2.12 | Failure classes remain independent. | Source, synthesis, checker, timing, assembly, stream, renderer, and persistence failures preserve unaffected capabilities. | Architecture lifecycle sections | `RSP-03`, `RSP-04`, `RSP-09`, `RSP-10`; planned only |

## One-to-one UX and performance ledger

| ID | Peer requirement | Reconciled contract/evidence location | Planned owner/status |
| --- | --- | --- | --- |
| UX-1 / §3.1 | Cinema availability follows readable source state, including summary-shell hydration and stale pinning. | Architecture source/Cinema sections; `CINEMA-001`, `SRC-REVIEW-001` | `RSP-03`, `RSP-08`; planned only |
| UX-2 / §3.2 | Reading-only navigation/search/bookmark/theme/presentation remains usable without audio. | Architecture source/Cinema sections and core-surface matrix | `RSP-03`, `RSP-08`; planned only |
| UX-3 / §3.3 | Regular transport stays mounted, acknowledges start, enables on first prefix, appends later segments, and keeps identity at completion. | Architecture playback/Cinema sections | `RSP-07`, `RSP-08`, `RSP-10`; planned only |
| UX-4 / §3.4 | Preview/Audition is voice-preview-only. | Architecture Preview/Audition section; `PREVIEW-001` flow planning note | `RSP-11`; planned only |
| UX-5 / §3.5 | Audio requires only a contiguous playable prefix. | Brief formula; architecture manifest formula | `RSP-06`–`RSP-08`; planned only |
| UX-6 / §3.6 | Follow-along exposes source/audio/phrase/trusted-word levels. | Architecture fidelity section; `SYNC-FIDELITY-001` | `RSP-09`; planned only |
| UX-7 / §3.7 | Responsive overlays pass geometry/hit-test/focus semantics at four widths. | Architecture overlay section; performance overlay gate | `RSP-13`; planned only |
| PERF-1 / §4.1 | Local p50/p95 budgets cover list/hydration/Cinema/shell/actions/narration/events/reconnect/playback/long tasks/overlays. | `docs/performance.md` “Planned p50/p95 budgets” | `RSP-14`; planned, absent from current threshold JSON |
| PERF-2 / §4.2 | Frontend marks bind source/run/segment/sequence/controller identities without sensitive text. | `docs/performance.md` “Planned responsive instrumentation” | `RSP-12`, `RSP-14`; planned only |
| PERF-3 / §4.3 | Backend timing spans request, segment, durable artifact, manifest, event, cancel, reconnect, and assembly boundaries. | `docs/performance.md` “Planned responsive instrumentation” | `RSP-04`, `RSP-05`, `RSP-14`; planned only |
| PERF-4 | Existing bundle gates remain unchanged. | Architecture performance contract and `docs/performance.md`; threshold JSON remains sole canonical numeric source | `RSP-12`, `RSP-14`; existing gates, current recorded build fails |

## Graph, reuse, and gate reconciliation

| ID | Peer decision | Reconciled disposition | Status |
| --- | --- | --- | --- |
| GRAPH-1 / §5 | Replace the 20-issue packet with exactly 15 dependency-ordered `RSP-*` seams. | Brief lists `RSP-01`…`RSP-15`; detailed graph remains in the exact Peer response/replacement planning surface and is not copied into the old BIC packet. | Planned; replacement packet not modified here |
| REUSE-1 / §6.1 | Reuse progressive media, source-revision, sync, arrival-queue, Cinema pre-audio, source-event, and progress primitives. | Architecture sections explicitly identify reuse versus target ownership. | Planned reuse; no implementation claim |
| REUSE-2 / §6.2 | Retain threshold/performance protocol, architecture principles, flow infrastructure, validators, provenance. | Existing docs retained and extended; no threshold relaxation or validator rewrite. | Retained |
| SUPERSEDE-1 / §6.2–6.3 | Supersede current BIC packet as the active responsive implementation packet but preserve provenance. | Flow records retain `BIC-*` planned evidence and add explicit planned `RSP-*` replacement ownership. Old BIC packet untouched. | Frozen provenance; no active responsive authorization |
| REVERT-1 / §6.4 | No immediate product-code revert; do not revert protocol/validator/flow/provenance work. | No product code, old packet, validator, package, or Linear mutation performed. | Satisfied by scope |
| GATE-1 / §7 | Work may not begin; only `RSP-01` becomes unblocked after owner acceptance. | Owner accepted the graph and same-repository strategy; Peer v2 remains independently required. | Owner gate passed; Peer/Linear/product gates blocked |

## Flow replacement ownership index

The registry’s original `plannedEvidence.ownerIssue` remains the BIC provenance field required by the existing validator. Relevant flow records add a generated, visible semantic note with these replacement owners and the exact status “planned; not covered or implemented”:

| Flow | Frozen BIC provenance | Planned responsive replacement ownership |
| --- | --- | --- |
| `APP-BOOT-001` | `BIC-01` | `RSP-12`, `RSP-14` |
| `SRC-DURABLE-001` | `BIC-05` | `RSP-02`, `RSP-03` |
| `SRC-REVIEW-001` | `BIC-05` | `RSP-02`, `RSP-03` |
| `SRC-MANIFEST-001` | `BIC-06` | `RSP-03`, `RSP-05` |
| `REPAIR-001` | `BIC-09` | `RSP-03`, `RSP-10` |
| `SPEECH-PLAN-001` | `BIC-06` | `RSP-04` |
| `JOB-CREATE-001` | `BIC-08` | `RSP-05`, `RSP-06` |
| `JOB-RUN-001` | `BIC-08` | `RSP-04`, `RSP-06`, `RSP-10` |
| `JOB-EVENTS-001` | `BIC-08` | `RSP-05`, `RSP-06`, `RSP-10` |
| `ARTIFACT-001` | `BIC-08` | `RSP-04`, `RSP-06`, `RSP-07`, `RSP-10` |
| `PLAYBACK-001` | `BIC-09` | `RSP-07`, `RSP-08`, `RSP-10` |
| `SYNC-FIDELITY-001` | `BIC-09` | `RSP-09` |
| `CINEMA-001` | `BIC-09` | `RSP-03`, `RSP-08`, `RSP-09`, `RSP-10` |
| `PREVIEW-001` | `BIC-07` | `RSP-11` |
| `APP-NAV-001` | `BIC-04` | `RSP-12`, `RSP-13` |
| `TELEPROMPT-001` | `BIC-09` | `RSP-08`, `RSP-13` |
| `THEATRE-001` | `BIC-09` | `RSP-08`, `RSP-13` |
| `DIAGNOSTICS-001` | `BIC-10` | `RSP-12`, `RSP-14` |
