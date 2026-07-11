# TTS-Research Responsive Cinema Dogfood Report

Date: 2026-07-10
Target: production preview `http://127.0.0.1:4173` backed by local API `http://127.0.0.1:8080`
Scope: cold bootstrap, prepared-source Narration flow, tutorial, Theatre/Cinema before audio, Quick Listen, Voice Cloning ownership, progressive narration observation
Mutation policy: read-only/local mock fixture only; repository frozen at peer archive SHA-256 `fef0fa919baf138a194c59d88e79400595b3040ea6b5c8f26afe20a44d1b3b8f`

## Executive summary

The app is not continuously main-thread blocked: production FCP was 520 ms, measured UI state transition completed within one double-rAF (~17 ms), and no browser long tasks or JS errors were observed. The perceived and actual non-responsiveness is instead produced by oversized domain bootstrap, terminal-state gating, obscured/disabled controls, contradictory surface ownership, modal overload, and cross-mode state leaks.

Findings: 11 total
- Critical: 3
- High: 6
- Medium: 2

## Measurements

- Production navigation DOMContentLoaded/load: 186 ms / 186 ms
- Production FCP: 520 ms
- Resources: 25
- Total transfer: 4,790,179 bytes
- API transfer: 4,476,590 bytes across 12 requests
- `/api/projects/default/source-preps`: 4,340,822 transferred bytes, 1,421 ms
- Direct source-preps response: 4,338,805 compact JSON bytes for 26 records
- Summary projection without full `blocks`: ~28,962 bytes (99.33% reduction)
- Long tasks: 0
- App coordinator: `frontend/src/App.tsx`, 21,168 lines / ~735 KB source
- Production main JS: 912.32 KB minified / 253.95 KB gzip
- Production CSS: 125.97 KB / 20.53 KB gzip
- Main Narration page after fixture: 2,195 px scroll height on 633 px viewport

## Findings

### DF-01 — Prepared-source list hydrates full source bodies at startup
Severity: Critical
Category: Performance / Architecture

Steps:
1. Cold-load production preview.
2. Inspect resource timing.
3. Fetch `/api/projects/default/source-preps` directly.

Expected:
- Bootstrap requests summary metadata only.
- Full blocks/source detail load on demand.

Actual:
- A single list response transfers ~4.34 MB and takes ~1.42 s.
- The 26-record payload embeds full block arrays.
- A summary projection is ~29 KB, a 99.33% reduction.

Relevant surfaces:
- `frontend/src/App.tsx` `refreshPreparedSources`
- `frontend/src/api.ts` `listPreparedSources`
- `backend/internal/httpapi/httpapi.go` project source-preps route

### DF-02 — Cinema is not source-ready; pre-audio “Theatre” opens presenter rehearsal instead
Severity: Critical
Category: Functional / UX / Architecture

Steps:
1. Load Short Education Reading local fixture.
2. Close tutorial.
3. Observe `Theatre · Reading-only` stage.
4. Click Theatre before audio generation.

Expected:
- Open a normal Cinema/read view immediately from prepared source.
- Reading and navigation work without audio.

Actual:
- Tutorial Cinema remains disabled.
- Workbench provides no primary Open Cinema/read action.
- Clicking Theatre opens `Teleprompt Theatre`, labeled `Recording rehearsal` and `Laptop presenter`.
- `Open Cinema` is disabled.
- Text is rendered as oversized cue fragments rather than a normal reader.
- Play/restart/seek/speed/audio-follow/review playback are disabled.
- Sticky CTA still pushes Create & Listen.

### DF-03 — Partial backend audio is neutralized by terminal frontend lifecycle gates
Severity: Critical
Category: Functional / Architecture

Evidence:
- Backend/types support `partialAudioManifest`, `audioPartialUrl`, `audioReadySegments`, `firstPlayableAt`, and event streaming.
- `generatedAudioLifecycleFromJob` remains non-ready until job status is `completed`.
- `canOpenCurrentCinema` requires `generatedAudioLifecycle === "ready"`.
- `GlobalPreviewPlayer` computes partial/queue state but still requires full ready lifecycle.

Expected:
- First ready segment adds transport to the existing read session.

Actual:
- Regular playback/Cinema remains terminal-job gated despite progressive primitives.

### DF-04 — Normal narration is owned by Preview/Audition UI
Severity: High
Category: UX / Architecture

Expected:
- Preview/audition player is scoped to voice cloning, candidate comparison, and short audition.
- Regular narration transport belongs to Cinema/read session.

Actual:
- Narration workflow routes source speech through Preview/Preview Speech.
- Completed regular narration is labeled `PREVIEW PLAYER` / `PREVIEW PLAYBACK`.
- `playbackOwner.ts` itself defines Preview as audition/selected-block/A-B comparison, contradicting its normal-narration use.

### DF-05 — Starting generation does not create an obvious playable/read-along session
Severity: High
Category: Functional / UX

Steps:
1. Select local fixture.
2. Start local mock Create audio/Create & Listen.

Expected:
- Immediate queued/generating feedback.
- Cinema remains/open becomes available from source.
- Transport appears as soon as first audio segment is playable.
- Read-along fidelity upgrades progressively.

Actual:
- UI emphasizes generating/Preview state.
- Cinema remains disabled until terminal completion.
- No obvious “play and read along” entry appears during generation.
- One-segment observed job had `firstPlayableAt == completedAt` after ~47.5 s.

### DF-06 — Tutorial is an oversized blocking workflow duplicate
Severity: High
Category: UX / Visual

Steps:
1. Click Try the Studio.
2. Select Short Education Reading.

Expected:
- Compact, dismissible guidance that does not obstruct core controls.

Actual:
- Tutorial becomes a multi-viewport modal duplicating source cards, workflow stages, generation, and Cinema actions.
- Background workbench remains visible but unavailable.
- Earlier normal click on Create audio was intercepted by a teleprompt highlight overlay.
- Tutorial Cinema is disabled pre-audio, teaching the wrong product contract.

### DF-07 — Quick Listen is a competing third narration workflow
Severity: High
Category: UX / Architecture

Steps:
1. Stay in Narration mode with prepared source.
2. Open Quick Listen.

Expected:
- A narrowly defined shortcut or removal from the core Narration path.

Actual:
- Opens another large modal with temporary source, storage, expiry, diagnostics, review, quick preview, and Document Cinema.
- Competes with Preview Speech and Create & Listen.
- Front-loads 49-session cleanup/storage administration before the primary action.
- Further blurs source-prep, preview, narration, and Cinema ownership.

### DF-08 — Narration controls leak into Voice Cloning mode
Severity: High
Category: Functional / UX / Architecture

Steps:
1. Switch from Narration to Voice Cloning.

Expected:
- Voice Cloning owns media analysis, candidate selection, clone creation, and audition preview.
- Narration generation controls are absent.

Actual:
- Voice Cloning workbench is present, but sticky footer retains Narration source/review/audio statuses.
- Footer says `Ready to create audio` and exposes `Create & Listen` for the prior narration source.
- System diagnostics report Narration attention inside clone mode.

### DF-09 — Theatre/Cinema/Teleprompt vocabulary maps to contradictory surfaces
Severity: High
Category: UX / Content / Architecture

Actual mappings observed:
- Workbench `Theatre · Reading-only`
- Click opens `Teleprompt Theatre`
- Mode says `Recording rehearsal`
- `Open Cinema` exists but is disabled
- Tutorial has separate disabled `Cinema`
- Quick Listen offers `Open Document Cinema`

Impact:
- Users cannot predict whether an action opens a reader, presenter rehearsal, audio player, or temporary document flow.

### DF-10 — Core workbench is excessively tall and information-dense for the primary task
Severity: Medium
Category: UX / Visual

Evidence:
- Prepared-source Narration page: 2,195 px document height on 633 px viewport.
- Revision filters, blocks, diagnostics, inspector, stage map, status rail, and sticky generation CTA are shown together.
- The actual “start reading” action is absent/hidden while review administration dominates.

### DF-11 — Main coordinator/bundle splitting limits independent responsiveness work
Severity: Medium
Category: Architecture / Performance

Evidence:
- `App.tsx`: 21,168 lines, ~735 KB source.
- Main JS: 912.32 KB minified / 253.95 KB gzip.
- Vite warns quick-listen is both dynamically and statically imported, preventing intended split.
- Unrelated diagnostics/read-along/status surfaces are coordinated from one top-level component.

Expected:
- Source, narration run, playback, sync, voice cloning, and temporary work have independent state/render boundaries.

## Root-cause synthesis

The app has useful low-level pieces, including prepared blocks, SSE job updates, partial manifests, arrival playback helpers, playback ownership definitions, and manual teleprompt rehearsal. The product state model does not compose them around the user journey. Source readiness, narration completion, playback availability, follow-along fidelity, preview/audition, and Cinema navigation are conflated. That creates disabled controls and duplicated surfaces even when the browser itself is responsive.

Recommended architecture direction for Peer review:
1. Source session becomes readable independently of audio.
2. Narration run publishes progressive audio availability.
3. Playback session owns transport and consumes the append-only segment queue.
4. Sync fidelity upgrades independently and never blocks reading/playback.
5. Cinema is source-ready and hosts regular narration playback/read-along.
6. Preview/Audition belongs only to voice cloning/comparison.
7. Quick Listen is reduced to an explicit temporary-source variant of the same session model or removed from primary navigation.
8. List APIs are summary-first; detail is lazy.
9. Voice Cloning and Narration render independent shells/footers.

## Testing notes

Tested:
- production cold bootstrap
- local prepared-source fixture
- tutorial
- pre-audio Theatre/Cinema
- Quick Listen
- Voice Cloning switch
- local mock narration state from prior dev reproduction
- console errors and resource timings

Not tested in this pass:
- external provider generation
- long multi-segment synthesis end-to-end
- mobile viewport
- persistence across browser restart
- cancellation/retry during partial playback
- source mutation while narration is active
