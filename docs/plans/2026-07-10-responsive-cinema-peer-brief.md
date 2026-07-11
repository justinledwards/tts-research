# Responsive Cinema and Progressive Narration — Peer Architecture Brief

**Status:** Peer response reconciled; request changes; planned architecture only; no implementation authorization
**Date:** 2026-07-10
**Owner direction:** re-architecture is allowed and expected if required. Responsiveness and product usability outrank preserving the current stage model.

**Peer disposition:** [`TTS_RESPONSIVE_ARCHITECTURE_REQUEST_CHANGES`](../reviews/chatgpt-responsive-architecture-response-v1.md). The response confirms the product invariants but rejects the candidate lifecycle and issue decomposition. The reconciled one-to-one ledger is [`chatgpt-responsive-architecture-repair-matrix-v1.md`](../reviews/chatgpt-responsive-architecture-repair-matrix-v1.md). Neither document authorizes product work, Linear mutation, or the replacement packet.

## Required product invariants

1. A prepared/readable source unlocks Cinema immediately. Narration need not be started or completed.
2. Cinema supports reading-only mode before audio exists.
3. Starting narration provides immediate visible acknowledgement and progress without blocking reading or navigation.
4. When the first audio segment becomes playable, the active Cinema session gains play/pause and follow-along without reopening or waiting for the whole narration.
5. Later segments arrive into the same playback session without losing cursor, reading position, or controls.
6. Read-along fidelity degrades explicitly: reading-only -> audio-only/phrase-follow -> trusted word-follow. Lack of trusted word timing must not block audio playback or reading.
7. “Preview player” and “audition” are voice-cloning/voice-comparison concepts only. Regular narration uses a narration transport owned by the reading/Cinema experience.
8. Core interactions remain responsive while preprocessing, synthesis, checking, alignment, diagnostics, or persistence run.
9. Hidden diagnostics, tutorial UI, and optional rich rendering must not block, cover, or materially slow primary reading/narration actions.

## Direct reproduction evidence

The local app was exercised at `http://127.0.0.1:5173` against the live backend at `http://127.0.0.1:8080` using the built-in local education fixture.

### Product-state failures

- After fixture preprocessing/review text was available, `Create audio` was enabled but Cinema remained disabled with `Audio missing`.
- `frontend/src/App.tsx:4039` defines `canOpenCurrentCinema = generatedAudioLifecycle === "ready" && temporaryCinemaActionsEnabled`.
- `frontend/src/features/playback/generatedAudioLifecycle.ts:154-155` maps audio to `ready` only when the whole job status is `completed`.
- Therefore source readiness cannot independently unlock Cinema.
- The tutorial text says Theatre opens only when “script and audio context are ready,” encoding the same invalid requirement.
- Normal narration is presented in a global surface labelled `PREVIEW PLAYER` / `PREVIEW PLAYBACK` with an `Audition` action.
- `frontend/src/features/playback/playbackSurfaceRules.ts` intentionally exposes the global preview player on Review/Preview surfaces.
- `frontend/src/features/preview/GlobalPreviewPlayer.tsx:173-177` computes partial/queued availability but then requires `playbackLifecycle === "ready"`, neutralizing in-progress playback.
- Preview and Review surface formulas in `App.tsx` likewise require the terminal `ready` lifecycle.
- A visible `Create audio` button was not normally clickable because a `.readalong-highlight--teleprompt` element was the top hit target over it. DOM invocation was required to continue the reproduction.
- The tutorial is implemented/tested as a **non-modal Drawer**, not a semantic modal. It covered most of the workbench while duplicate Cinema actions and the global preview player remained operable behind it, exposing inconsistent overlay semantics rather than a modal-primitive defect.

### Narration timing and state

Observed local fixture job: `2f9edb4a6ed49882`.

- POST `/api/voice-jobs`: ~8.5 ms request duration; the job was accepted immediately.
- Backend segment latency: 47,465 ms for one 42-word / 16.225-second segment.
- `firstPlayableAt` equalled terminal completion time for this one-segment job.
- The UI showed `Generating` and disabled Cinema during the run, then exposed playback only after completion.
- The frontend does use `/api/voice-jobs/:id/events`; absence of repeated fetches was not itself the defect.
- That endpoint is SSE, but `backend/internal/httpapi/voice_job_routes.go` emits complete job snapshots from a **1,500 ms server ticker** with no event ID, monotonic sequence, replay cursor, or gap reducer. The frontend falls back to two-second polling after an SSE error. The timed-snapshot protocol cannot satisfy sub-500 ms first-playable propagation or deterministic reconnect convergence.
- The backend already publishes progressive state per segment (`AudioReadySegments`, `AudioPartialURL`, `FirstPlayableAt`, `PartialAudioManifest`) and has a test asserting `partialReady` while synthesis continues.
- The frontend already has `isGeneratedAudioPartiallyPlayable`, `canQueueGeneratedAudioPlayback`, arrival mode, and partial-audio URL support. These primitives are not consistently allowed through top-level product gates.
- A separate first-playable root cause exists in segmentation: production defaults can coalesce complete sentence pieces into one long synthesis unit, and an overlong sentence is not subdivided by `splitTextSegments`. The observed 42-word, approximately 16.2-second fixture therefore produced one segment; the focused progressive test succeeds partly because it sets `SegmentMaxRunes: 10`. Fixing the frontend gate alone would not guarantee a useful progressive advantage.

### Bootstrap and rendering performance

Cold development load observation:

- First contentful paint: ~1.432 s.
- 250 resource requests and ~10.2 MB transferred in development.
- Most bootstrap API calls were duplicated under React StrictMode.
- `/api/projects/default/source-preps` was the slowest bootstrap call: observed ~1.24–2.11 s in-browser.
- Direct endpoint measurement: 4,340,522 downloaded bytes; ~1.067 s.
- It returns 26 prepared sources with every source's complete `blocks` array. The list helper clears top-level `Text` and `SpeechText`, but retains bounded block text: each block's `Text` and `SpokenText` is truncated to 220 characters. This is still a detail-shaped payload, not a true list-summary DTO; it must not be described as retaining top-level full text.
- Compact payload calculation:
  - current list payload: 4,338,805 bytes;
  - summary without detail arrays/text: 28,962 bytes;
  - avoidable list-detail bytes: 4,309,843 (99.33%).
- `frontend/src/App.tsx` is 21,168 lines / 735,610 bytes and owns bootstrap, source selection, narration lifecycle, Cinema gating, playback, diagnostics, and many surfaces.

Production build evidence:

- main JS chunk: 912.32 KB minified / 253.95 KB gzip;
- CSS: 125.97 KB / 20.53 KB gzip;
- Vite warns that `features/quick-listen/index.ts` is both statically and dynamically imported, so dynamic import does not split it;
- several optional diagram/rich-rendering chunks are 600+ KB;
- Vite reports chunks over 500 KB.

No browser console exceptions were observed. This is not a hidden-crash-only problem.

## Architectural contradiction

The repository contains much of a progressive backend/media mechanism, but the product state model treats Cinema, narration playback, and read-along as terminal audio-ready stages. Source readiness, narration generation, playback availability, and alignment fidelity are conflated.

The architecture should separate at least these independent lifecycles:

1. **Source session:** empty -> preprocessing -> readable -> failed/stale.
2. **Narration run:** idle -> accepted -> queued -> optimizing -> synthesizing -> checking -> completed, with cancellation, failure, and retriable-interruption branches. This phase reports execution only.
3. **Playback session:** reading-only / awaiting audio / playable / playing / paused / ended, preserving cursor across arrivals.
4. **Sync fidelity:** none -> audio-only -> phrase -> trusted word, able to improve without replacing the reading/playback session.
5. **Voice preview/audition:** an independent voice-cloning/comparison concern, not the regular narration transport.

Partial playability is **not** a narration-run phase. It is a derived media-manifest capability: `contiguousPlayableDurationMs > 0`, computed only from the contiguous compatible segment prefix. A ready segment beyond a gap does not extend the playable prefix.

The Peer accepted the separation but corrected the lifecycle details above and returned the planned target model summarized here. The result remains unapproved for implementation until the owner explicitly accepts the replacement graph.

## Candidate non-negotiable budgets for Peer review

The Peer should approve, tighten, or replace these with measurable local acceptance thresholds:

- source-list bootstrap: <= 100 KB response and <= 250 ms p95 locally; list summaries only, detail on selection;
- first useful shell interaction: <= 1,000 ms p95 on the reference local machine;
- primary action acknowledgement: <= 100 ms p95;
- source-ready -> Cinema interactive: <= 150 ms p95, independent of narration;
- backend first playable event -> enabled transport in an already-open Cinema session: <= 500 ms p95;
- Cinema/stage transition after data is resident: <= 100 ms p95;
- no primary action may be covered by an overlay at supported viewport sizes;
- no mandatory audio generation/check/alignment work on the browser main thread;
- production initial route must have an explicit compressed JS/CSS budget and optional diagnostics/rich rendering must be lazy.

## Peer-returned replacement graph (planned only)

The original 14 candidate seams below were superseded by the Peer-returned 15-issue graph. This is a planning reconciliation, not an active implementation packet and not evidence that any issue is covered or implemented:

1. `RSP-01` — Freeze the responsive lifecycle and validation contract.
2. `RSP-02` — Introduce a true prepared-source summary API boundary.
3. `RSP-03` — Establish source-session ownership and source-ready Cinema ingress.
4. `RSP-04` — Enforce bounded first-playable segmentation and durable segment publication.
5. `RSP-05` — Replace timed job snapshots with a sequenced replayable event protocol.
6. `RSP-06` — Extract the canonical narration-run store.
7. `RSP-07` — Extract one progressive playback-session controller.
8. `RSP-08` — Make Cinema own the regular narration transport.
9. `RSP-09` — Integrate independent sync-fidelity upgrades and downgrades.
10. `RSP-10` — Implement narration continuity and failure recovery.
11. `RSP-11` — Isolate voice Preview/Audition from regular narration.
12. `RSP-12` — Extract application shell/bootstrap ownership and enforce lazy boundaries.
13. `RSP-13` — Enforce overlay, responsive, focus, and hit-test invariants, including non-modal Drawer behavior.
14. `RSP-14` — Run the integrated p50/p95, bundle, continuity, and UX release gate.
15. `RSP-15` — Delete legacy ownership and complete migration evidence.

The current BIC packet remains frozen provenance. Its 20/20 graph is superseded for responsive planning but has not been rewritten to imply it contained this model. Work still may not begin; after explicit owner acceptance, only `RSP-01` would be dependency-unblocked, and it would authorize contract/evidence work only.

## Required Peer response

The first line must be exactly one of:

- `TTS_RESPONSIVE_ARCHITECTURE_APPROVED`
- `TTS_RESPONSIVE_ARCHITECTURE_REQUEST_CHANGES`

Then provide:

1. Root-cause verdict: confirm, correct, or reject each major finding with exact source paths/symbols.
2. Target architecture: lifecycle/state ownership, event/data flow, persistence, cancellation, reconnect, stale-source behavior, and failure recovery.
3. UX contract: exact availability of Cinema, narration transport, reading-only, audio playback, and each read-along fidelity level.
4. Performance contract: measurable budgets and instrumentation points.
5. Atomic issue graph: <= 15 issues, each with objective, exact scope, dependencies, acceptance tests, observability, rollback, and non-goals.
6. Identify which current v10 changes/issues are reusable, superseded, or must be reverted.
7. State whether implementation may begin and name only the first dependency-unblocked issue(s).

No Linear mutation is authorized by this brief. No implementation is authorized until the owner and Peer gate the issue graph.
