# Voice Studio Reader-First Architecture release reset

Status: `owner_accepted_rca_reconciled_peer_pending_not_authorized`

Date: 2026-07-10

## Owner direction

The acting Product Owner replaces the pending responsive-only implementation packet with one Reader-First Architecture release packet. Continue in this repository through a strangler migration; do not create a replacement repository or perform a big-bang rewrite.

The historical BIC and RSP packets remain frozen provenance. They are not active implementation backlogs and must not be mutated into the new scope.

## Customer promise for the next project trial

For the existing **Design for the Real World** project and every future project, the product must support this journey:

1. Open the project from any clean browser or device and restore authoritative project, source revision, narration run, media manifest, fidelity, and paused progress from the server.
2. Press **Narrate** once from the readable book.
3. Enter Book Reading mode immediately; reading never waits for narration.
4. Enable playback as soon as the first contiguous 4–8 second segment and its manifest commit are available.
5. Highlight the correct source word from trusted native timing, or from segment-local forced alignment that runs concurrently with narration when the provider has no trustworthy word events.
6. Keep synthesis, checking, timing upgrades, and remaining chapters progressing in the background without remounting the reader or player.
7. Narrate headings and other structural boundaries as explicit isolated speech units with intentional pauses and source identity.
8. Keep Preview/Audition restricted to voice comparison and cloning; normal narration has no Preview Player.
9. Preserve playable segments if final assembly, checking, timing, connection, or a later segment fails.
10. Never label a completed compatible run as “Audio needs rebuild” or “System critical” because identity fields or optional diagnostics are missing.

## Evidence-backed release blockers

- Browser `localStorage` currently acts as authority for active project/workspace state. A clean browser can list a project but cannot reconstruct its source, run, or Cinema state.
- A ready book selected through a summary DTO is rejected because the frontend tries to derive full source text from summary-only data.
- The completed reference job has 1,680/1,680 checked segments and available audio, yet omits source-revision identity used by frontend currentness checks.
- Final audio is approximately 1.325 GB and the current handlers materialize bytes through `ctx.Send(audio)` without a range contract.
- The single project consumes approximately 2.89 GB because segments, partial assembly, and final assembly overlap.
- Current Kokoro integration does not emit word timing. The alignment stack can normalize native events and supports MFA/Aeneas/Gentle, but forced alignment is currently restricted to `request.Final == true` and no aligner runtime is configured.
- The installed Qwen ASR package exposes `Qwen3ForcedAligner`; its model is not currently cached. Activation/download must be explicit and observable.
- Current timing therefore falls back to heuristic block/phrase timing at confidence 0.625; exact word highlighting is correctly forbidden.
- The Preview Player is mounted by narration-mode `App.tsx` call sites and can receive regular `VoiceJob` state.
- The frontend bootstrap and orchestration remain concentrated in `App.tsx`, with oversized project/source/job payloads and high-frequency state reaching broad component ownership.
- The active deployment keeps committed-job artifacts in `/dev/shm`; a host reboot can erase a completed run while leaving durable project/source metadata behind.
- Opening the completed 1,680-segment run can fan out every missing segment request, retain approximately 2.47 GiB of decoded PCM, and decode the complete 1.325 GB WAV again only to draw waveform bars.
- Timing and highlight artifacts are whole-job snapshots, including an 88.7 MB legacy highlight map; they cannot support immediate windowed Reader ingress.
- PDF structure inference is page-local and shallow, while fallback/OCR paths collapse pages into body blocks; the prepared-source synthesis path then flattens surviving structure and reparses it by rune count.
- Any blocking disclosure panel is currently promoted into `System critical`, conflating stage readiness with backend health.

## Independent audit reconciliation

Three read-only audits attested HEAD `e97ff6f4932f4429939f1c278e1d4b8361ac6688`, made no repository mutations, and converged on the same target seams:

1. server-authored workspace projection with latest-compatible-run fallback, detail hydration, revision/ETag writes, server currentness, domain-separated health, and durable artifact promotion;
2. immutable playback manifest, bounded request/buffer windows, eviction, seek cancellation, segment-local timing revisions, and no full-book waveform decode;
3. revision-bound structure overlay, real scanned-PDF/OCR fixtures, one ordered speech-unit planner, hard heading boundaries, and removal—not hiding—of Preview ownership from Narration.

These findings are incorporated into RFA-02, RFA-04 through RFA-06, RFA-09, RFA-13, RFA-15, RFA-17, RFA-19, and RFA-20 without changing the 20-issue cap or dependency DAG.

## Architecture decisions

### Server authority

The server owns durable workflow state. A versioned project restoration snapshot returns:

- project identity and revision;
- preferred/current readable source identity and source revision/content hash;
- latest compatible narration run and predecessor/retry relationship;
- immutable playable media manifest version and contiguous prefix;
- timing revision and fidelity evidence per segment;
- durable reader locator and paused playback checkpoint where applicable.

Browser storage is disposable cache/preferences only. Deleting it must not break project restoration.

### Structural source and speech plan

Extraction produces a stable document IR with explicit unit roles such as title, part, chapter heading, section heading, paragraph, list item, caption, footnote, table, code, and omitted/degraded content. PDF structure combines embedded outline, layout/font evidence, spacing, repetition/header-footer suppression, numbering patterns, and bounded confidence. Low confidence is surfaced; it is not silently promoted.

Structure inference is stored as an immutable revision-bound overlay referencing Content IR node IDs. It records front/body/back-matter zones and `speak`, `skip`, `onDemand`, or `reviewRequired` dispositions. Born-digital and real scanned-PDF/OCR fixtures are both release evidence.

Speech plans preserve source-unit identity. Headings are standalone speech units, never concatenated into body paragraphs. A speech policy controls whether hierarchy labels are spoken and defines pre/post pauses without injecting fake words into highlight text.

### Progressive audio and timing

The canonical artifact is an immutable per-segment media/timing entry, not a growing monolithic WAV. The first target segment is 4–8 seconds; 12 seconds is the normal hard maximum. Segment audio is committed durably before publication.

A job cannot become `completed` until metadata and playable media are atomically promoted out of tmpfs/scratch. Missing committed bytes are reported explicitly as `artifact_missing`.

Timing policy:

1. use trustworthy provider-native word/mark events when available;
2. otherwise run bounded segment-local forced alignment concurrently after each audio segment commits;
3. publish versioned timing independently from audio so an active session can upgrade from audio-only/phrase follow to trusted-word follow without remounting;
4. never claim trusted-word highlighting unless source revision, text normalization map, audio artifact, timing revision, token coverage, monotonicity, duration bounds, and drift/error gates pass.

Qwen3ForcedAligner is the preferred local fallback for the current Kokoro path, subject to explicit capability activation, bounded process/resource ownership, and measured segment latency. Alternative aligners remain adapters, not parallel authorities.

### Browser-light playback and reading

One Cinema-owned `PlaybackSessionController` consumes a bounded manifest window and fetches/decodes only the next segments. It never fetches the final 1.325 GB object to begin playback. Final assembly is optional export/download optimization and does not replace the controller.

At most four segment requests may be in flight. Lookahead and back-buffer stay at or below 60 seconds; played media is evicted and seeks abort obsolete requests. Waveforms come from server-produced envelopes, never full-book audio decoding. Fragmented MP4/AAC with Opus/WebM where supported is the gapless compressed target; sequential immutable segments remain the first strangler slice.

Reader text and timing are windowed around the viewport/current segment. The client must not ingest full-book highlight maps. High-frequency cursor/highlight state is isolated from shell/project/source renders.

### Truthful health and recovery

Run execution, media playability, artifact compatibility/currentness, sync fidelity, provider capability, and system diagnostics are independent facts. Missing optional diagnostics or legacy identity fields cannot produce a global critical state. A rebuild action is offered only when an explicit compatibility comparison proves the selected artifact is stale/incompatible. Final-assembly failure preserves segment playback.

Stage/audio blockers stay in their own domain. `System critical` is reserved for backend unavailability, corrupt state, durable-storage failure, or an unrecoverable invariant violation.

## Replacement issue graph

The canonical packet will contain exactly `RFA-01` through `RFA-20`:

1. `RFA-01` — Freeze Reader-First lifecycle, identity, UX, and performance contract.
2. `RFA-02` — Add server-authoritative project restoration snapshot and durable paused progress.
3. `RFA-03` — Add bounded source/job summary DTOs and on-demand detail hydration.
4. `RFA-04` — Define stable structural document IR and PDF heading/layout evidence.
5. `RFA-05` — Generate structure-aware speech plans with isolated heading units and pause semantics.
6. `RFA-06` — Enforce bounded first-playable segmentation and durable segment publication.
7. `RFA-07` — Normalize provider-native per-segment timing and capability evidence.
8. `RFA-08` — Run concurrent Qwen forced alignment fallback and publish timing revisions.
9. `RFA-09` — Version immutable media/timing manifests and bounded segment/range delivery.
10. `RFA-10` — Publish sequenced replayable narration events after durable commits.
11. `RFA-11` — Build SourceSessionStore and deterministic clean-browser Cinema ingress.
12. `RFA-12` — Build canonical NarrationRunStore with replay/snapshot reconciliation.
13. `RFA-13` — Build one append-capable PlaybackSessionController.
14. `RFA-14` — Make Cinema own immediate reading and regular narration transport.
15. `RFA-15` — Implement windowed trusted-word read-along with fidelity upgrades/downgrades.
16. `RFA-16` — Remove Preview Player from regular narration and isolate Audition identity.
17. `RFA-17` — Repair artifact currentness, rebuild semantics, health severity, and retained-prefix recovery.
18. `RFA-18` — Decompose application bootstrap/ownership and enforce lazy/browser budgets.
19. `RFA-19` — Prove cross-browser resume, reconnect, retry, repair, and migration continuity.
20. `RFA-20` — Run and adjudicate the exact-byte integrated Design for the Real World release gate; it owns no implementation or legacy removal.

### Dependency DAG

```text
RFA-01: []
RFA-02: [RFA-01]
RFA-03: [RFA-01]
RFA-04: [RFA-01]
RFA-05: [RFA-04]
RFA-06: [RFA-02, RFA-05]
RFA-07: [RFA-01, RFA-05]
RFA-08: [RFA-06, RFA-07]
RFA-09: [RFA-06, RFA-07]
RFA-10: [RFA-01, RFA-06, RFA-09]
RFA-11: [RFA-02, RFA-03]
RFA-12: [RFA-06, RFA-09, RFA-10]
RFA-13: [RFA-09, RFA-12]
RFA-14: [RFA-11, RFA-12, RFA-13]
RFA-15: [RFA-07, RFA-08, RFA-09, RFA-13, RFA-14]
RFA-16: [RFA-14]
RFA-17: [RFA-02, RFA-09, RFA-12]
RFA-18: [RFA-03, RFA-11, RFA-12, RFA-13, RFA-16, RFA-17]
RFA-19: [RFA-02, RFA-10, RFA-11, RFA-12, RFA-13, RFA-14, RFA-15, RFA-17, RFA-18]
RFA-20: [RFA-04, RFA-05, RFA-06, RFA-07, RFA-08, RFA-09, RFA-10, RFA-11, RFA-12, RFA-13, RFA-14, RFA-15, RFA-16, RFA-17, RFA-18, RFA-19]
```

## Release budgets

The canonical contract and validator must set fail-closed thresholds, including:

- clean-browser project restore to useful shell: p95 ≤500 ms on local supported hardware;
- resident readable source to Cinema shell: p95 ≤100 ms;
- Narrate acknowledgement: p95 ≤100 ms;
- warm first playable segment: p95 ≤3 seconds; cold explicit-capability path measured separately;
- segment commit to transport enabled: p95 ≤250 ms;
- segment commit to timing publication: p95 ≤1.5× segment duration and normally ≤2 seconds after audio commit on the reference CPU path;
- trusted-word highlight drift: p95 ≤150 ms with zero wrong-word identity on canonical fixtures;
- decoded buffer target: bounded window, normally 15–45 seconds; no full-book audio fetch;
- at most four concurrent segment requests, at most 60 seconds lookahead/back-buffer, and zero full-book waveform decodes;
- initial project/source summaries: bounded by canonical byte budgets;
- active 60-second generation/reading session: zero main-thread tasks ≥50 ms caused by app work;
- final/partial audio route must support correct byte ranges if retained; normal playback must use immutable segment delivery;
- no global “critical” status from optional capability absence or a healthy completed run;
- no rebuild prompt without explicit incompatible identity evidence.

## Authorization

- Owner direction: accepted.
- Repository strategy: in-repository strangler migration.
- Replacement repository: not authorized.
- Linear project capacity: 20; current active unarchived TTS-Research issues: 0.
- Independent architecture peer: required before product implementation.
- Linear creation: not yet authorized.
- Product implementation: not yet authorized.
- Current graph-unblocked issue: `RFA-01` only.

The next mutation is to produce and validate the canonical machine-readable contract/issue packet, then submit an exact dirty-worktree archive to the verified TTS-Research ChatGPT Project using the best non-Instant model/effort gate. After peer approval, create exactly the authorized Linear batch and begin only dependency-unblocked issues.
