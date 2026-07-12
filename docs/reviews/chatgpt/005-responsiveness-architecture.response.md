# Responsiveness verdict

The current architecture can deliver **some responsive-feeling completed-reader flows**, especially in the existing Book Cinema path, but it cannot yet guarantee **“feels responsive while source processing/generation continues”** for the agreed ASAP read-along product.

There are good ingredients already:

* The archive has explicit frontend performance rules: keep heavy inspection/import/export/diagnostic/Markdown/Mermaid/Book Cinema surfaces lazy and keep reader state helpers lightweight (`docs/performance.md:3-18`).
* There are existing timing gates for app cold usable, route switch, Book Cinema open, transport interaction, settings open, and reader resume (`docs/performance.md:76-88`; `benches/thresholds.json#readerTiming`).
* Degraded-state UX is already recognized: lazy panel loading, phrase fallback, low-confidence highlight, slow resume, and locator fallback are recorded as performance/degradation evidence (`docs/performance.md:128-141`; `frontend/src/features/performance/index.ts:28-34`).
* The read-along scheduler already avoids React for the hottest word-highlight path: it uses audio time, binary search, DOM anchor resolution, caching, and direct class swaps (`frontend/src/features/readalong/ReadAlongWordScheduler.ts:74-169`, `191-241`).
* Backend segment synthesis already runs workers and persists contiguous ready segments as they arrive (`backend/internal/pipeline/service.go:1766-1828`, `2249-2438`).

But those ingredients are not yet arranged around the source/manifest/revision architecture we agreed to. The current state is still too **App-monolithic, job-centric, snapshot-heavy, and whole-source-oriented**.

## Top blockers

**1. Frontend state locality is too broad.**
`App.tsx` is over 21k lines and owns project/source/job/progress/cinema/settings/temporary/policy/voice state in one component. The active app state block alone spans dozens of `useState` entries for jobs, projects, book sources, temporary sources, prepared sources, progress, reader preferences, panels, run config, theme, workspace context, and revision state (`frontend/src/App.tsx:2725-2935`). Any active job/source update risks re-rendering surfaces that should not care.

**2. Events are too coarse and too slow for ASAP read-along.**
The current backend SSE endpoint sends the whole `VoiceJob` every `1500ms` (`backend/internal/httpapi/voice_job_routes.go:142-175`), and the frontend fallback polls the whole job every `2000ms` (`frontend/src/api.ts:1645-1707`). That is acceptable for a progress bar; it is not good enough for source-unit readiness, partial manifests, segment state, unchecked/checked/stale audio, or responsive read-along upgrades.

**3. Source extraction still blocks too much.**
Book source import copies files, runs extraction, and writes metadata/Content IR after extraction returns (`backend/internal/pipeline/book_sources.go:82-153`). That prevents early source rendering for EPUB/structured HTML unless the source lifecycle work from prior agreements is added.

**4. Large document rendering is not yet a robust windowed architecture.**
Book Cinema has some useful scope/windowing helpers, such as `visibleBookSpans` capped at 220 words (`frontend/src/features/book-cinema/model.ts:513-531`) and paged rendering for current spreads (`frontend/src/features/book-cinema/model.ts:533-579`). But follow-mode still maps blocks and token renderers directly (`frontend/src/features/book-cinema/BookCinemaPanel.tsx:3815-3890`), and there is no general virtualization/windowing layer for large source documents across HTML/EPUB/PDF/DOCX/OCR.

**5. There is no frontend worker split.**
The frontend package has no worker-based path for tokenization, source-window preparation, fuzzy remap, large manifest diffing, waveform prep, or expensive fallback anchor resolution. Some work is lazy-loaded, but lazy loading is not the same as scheduling.

**6. Current low-resource gates already carry waivers.**
The low-resource budget registry lists accepted waivers/known overruns for command palette, context panel, reader resume, settings open, source switch, teleprompt cue switch, and transport interaction (`scripts/validate-local/reader-timing-budget-config.mjs:61-224`). That is a warning: the current app can pass review with caveats, but the agreed product needs active-processing responsiveness as a core promise, not a waiver-laden secondary gate.

# Responsiveness architecture

The target architecture should be **source/manifest-store driven, route-light, event-coalesced, and high-frequency-render isolated**.

## Route / navigation during active jobs

Route changes must not depend on generation state.

Required shape:

* App shell remains mounted and lightweight.
* Active source/job processing continues backend-side after route changes.
* Route components subscribe only to the source/manifest slices they need.
* Route switch should show a stable placeholder quickly, then hydrate details.
* Closing a reader/cinema surface cancels UI subscriptions, not backend work.
* Navigation should never fetch full project/job/source lists synchronously before showing the target route.
* Terminal job events should invalidate targeted caches, not trigger broad project refreshes by default.

Current risk: `subscribeToVoiceJob` updates `job`, selected book source/scope, request state, error state, project job lists, and storage refreshes from a single App effect (`frontend/src/App.tsx:8214-8261`). That should move behind a manifest/source event store with selectors.

## Source extraction updates

Source extraction should emit **small durable events** and update a source manifest, not push large whole-source payloads into React.

Target flow:

1. Backend persists raw source.
2. Backend creates `SourceEnvelope`.
3. Adapter emits events: source started, section/spine discovered, unit readable, unit failed, extraction warning, extraction complete.
4. Backend appends/updates `PartialExtractionManifest`.
5. Frontend source store receives event sequence.
6. Reader fetches or patches manifest snapshot.
7. UI renders readable prefix while later units remain pending.

Events should be coalesced. If EPUB extraction emits 500 paragraph events rapidly, the frontend should not render 500 times. Batch unit changes into a single manifest sequence and flush to UI at most every animation frame or every `100-250ms`, whichever is more appropriate for the surface.

## Partial manifest updates

Partial manifests should be treated as the client’s primary read model.

Frontend should not subscribe to “the job.” It should subscribe to:

* `sourceId`
* `sourceRevisionId`
* `manifestId`
* `manifestSequence`
* active unit/window
* active segment
* sync decision

The event stream should say what changed; the manifest endpoint should remain authoritative.

Example event categories:

* `source.unit.readable`
* `source.unit.narratable`
* `speech.segment.planned`
* `speech.segment.audio_unchecked`
* `speech.segment.audio_checked`
* `speech.segment.check_failed`
* `sync.segment.ready`
* `artifact.stale`
* `manifest.superseded`
* `progress.resolved`

The frontend should use events as invalidation/patch hints, not as the only durable state.

## Playback / control interactions

Playback controls need an imperative media controller outside broad React state.

Required behavior:

* Button press visually acknowledges within `<=100ms`.
* Play/pause/seek command reaches the audio element within `<=250ms p95`.
* Transport should not wait for manifest refresh, highlight map fetch, project refresh, storage refresh, or route state.
* Progress sync should be throttled and persisted on interval, pause, seek, route switch, visibility change, and page unload.
* Unchecked audio can play immediately, with segment status visible.

The existing playback session sync runs every `15s` and then refreshes project progress (`frontend/src/App.tsx:8372-8401`). Keep periodic sync, but make it manifest/progress scoped and avoid broad refreshes during active playback.

## Read-along highlight updates

High-frequency highlight updates should stay outside React render.

The existing `ReadAlongWordScheduler` is directionally right: it reads audio time, resolves active word by binary search, and swaps DOM classes directly (`frontend/src/features/readalong/ReadAlongWordScheduler.ts:110-169`, `197-241`). Keep that posture.

Needed changes:

* Scheduler must consume manifest-derived sync level: `word | phrase | block | audioOnly | sourceOnly`.
* Word mode only attaches to currently rendered/windowed tokens.
* Phrase/block mode should update a small number of block/phrase elements, not all tokens.
* Auto-scroll must be rate-limited and suppressed in low-resource mode.
* Smooth cursor should be disabled automatically under reduced motion or low-resource degradation.
* Exact word highlight should not trigger React commits for every word. React may update coarse state such as active block/segment.

The current performance counters and long-task observer are useful (`frontend/src/features/readalong/readAlongPerformance.ts:1-16`, `115-140`), but they should become gates for Book/Website/Document read-along, not only advisory scenarios.

## Rendering large source documents

Use **section/block virtualization**, not full-document token rendering.

Target:

* Render the active unit, nearby units, and a small overscan window.
* Render offscreen sections as placeholders with stable height estimates.
* Keep TOC/section navigation separate from the full text DOM.
* Render plain display text for inactive/offscreen blocks.
* Upgrade visible narratable/aligned units to token spans only when needed.
* Preserve anchor identity for resume by storing unit locators, not by keeping every token in the DOM.
* Use `content-visibility` or a simple internal windowing utility before adding a heavy dependency.

For the first EPUB/structured HTML proof path, render:

* current section/spine item;
* previous/next small window;
* active block;
* queued/extracting placeholders for later sections;
* exact word spans only for the visible active region.

PDF/OCR can reuse the same model later with page/block windows.

## Repair overlays and remap operations

Repair/remap must not block the reader.

Target:

* Backend owns repair overlay application and revision/remap sidecars.
* Applying a repair creates or selects a superseding manifest.
* UI receives `manifest.superseded` and `progress.remap_pending/resolved`.
* High-confidence remap can switch automatically.
* Low-confidence remap shows the user choice agreed in the previous step.
* Fuzzy text matching and large diff/remap work should not run synchronously in React render. Prefer backend; if client-side preview is required, use a worker.

During remap, the reader should remain open in degraded state: block/source-only progress is acceptable; frozen exact word sync is not.

## Low-resource degradation

Low-resource mode should be active behavior, not just a test mode.

Trigger signals:

* repeated long tasks over `50ms` during read-along;
* route/control budgets exceeded in current session;
* low hardware concurrency or memory where available;
* active local synthesis/alignment/checking competing with UI;
* reduced-motion preference;
* CPU-throttled validation lane.

Degradation actions:

* Disable smooth cursor.
* Disable or reduce auto-follow scroll.
* Prefer block/phrase highlight over exact word when UI stability is poor, even if timing evidence is technically available.
* Reduce rendered overscan.
* Pause waveform rendering and nonessential progress visualizations.
* Defer diagnostics, command indexing, schema validation, and context panels.
* Coalesce SSE updates more aggressively.
* Cap backend synthesis/alignment/check concurrency when the reader is active on a low-resource machine.
* Keep first contiguous segment priority; throttle later segments if they harm UI responsiveness.

This is the trade-off: a serious read-along aid should choose stable controls and honest block/phrase highlighting over jittery exact-word spectacle.

# Client scheduling and state locality

## React state

Keep React state for:

* route/surface selection;
* selected source/manifest pointer;
* coarse UI mode;
* visible document window;
* selected read-along fidelity preference;
* repair choice UI;
* settings/panel disclosure state.

Do not keep high-frequency or durable artifact truth in broad React state:

* active word tick;
* audio clock;
* segment audio readiness for every segment;
* large manifest arrays;
* large source text;
* all token spans;
* fuzzy remap work;
* project-wide refresh state.

## External stores

Create small external stores with `useSyncExternalStore`-style selectors or equivalent:

* `sourceManifestStore`
* `playbackControllerStore`
* `readalongClockStore`
* `artifactReadinessStore`
* `progressResumeStore`

Each selector should return a narrow immutable view:

* current active unit;
* visible unit IDs;
* current segment status;
* allowed highlight level;
* first playable audio;
* stale/degraded reason;
* progress resolution state.

This avoids the current pattern where a job event can update broad App state and cause unrelated surfaces to re-evaluate.

## Memoization and selectors

Memoization should be structural, not cosmetic.

Required selector boundaries:

* `sourceId + sourceRevisionId + manifestId` → manifest summary.
* `manifestId + visibleWindow` → visible units.
* `unitId + syncLevel` → rendered block/tokens.
* `segmentId` → audio status.
* `progressId` → resume decision.
* `artifactId` → URL/currentness.

Do not memoize derived full-document token arrays for every route if the reader only needs the active window.

## Workers

Add workers selectively. Do not “workerize everything.”

Good first worker candidates:

* source-window token preparation for large HTML/EPUB blocks;
* manifest diff normalization if patch payloads become large;
* fuzzy text quote remap for low-confidence resume;
* waveform/bar generation;
* optional Markdown/HTML rendering preprocessing if it appears on the reader path.

Keep actual source extraction in the backend/local adapter layer for local-first reproducibility.

## Virtualization

Add section/block windowing before chasing micro-optimizations.

First proof path:

* EPUB/structured HTML reader windows by spine item/section/block.
* Overscan maybe `1-2` sections or `20-40` blocks, tuned by low-resource evidence.
* Exact word spans only in active/near-active blocks.
* Keep stable anchor placeholders for offscreen blocks so resume and scroll recovery do not require full DOM.

## Throttling / debouncing

* Manifest UI flush: at most once per animation frame; usually coalesce to `100-250ms`.
* Progress persistence: interval plus lifecycle events; not every word.
* Scroll-follow: no more than a few times per second; never during user scroll.
* Resize/page-fit recalculation: debounce and avoid active-word dependency unless the active page actually changes.
* Diagnostics/project storage refresh: idle or terminal only; never in the control path.
* Highlight map fetch: keyed by artifact identity; do not refetch on unrelated job snapshot changes.

## Persistence

Backend/local storage remains authoritative.

Browser storage should hold only:

* last project/source/surface pointer;
* reader preferences;
* panel/layout memory;
* session-scoped temporary return pointers.

Do not store full source text, manifest, generated audio, highlight maps, or repair overlays in `localStorage`.

# Backend / event architecture

## SSE and polling

Use SSE for first implementation. Do not switch to WebSockets yet.

Target:

* one source/manifest event stream;
* sequenced events;
* heartbeat;
* reconnect with `lastEventId` or `sinceSequence`;
* polling fallback by manifest `ETag`/sequence;
* small event payloads;
* authoritative snapshot endpoint.

Polling fallback should fetch:

`GET /api/sources/:sourceId/manifests/:manifestId?since=<sequence>`

not:

`GET /api/voice-jobs/:id` every 2 seconds as the main progress model.

## Event coalescing

Backend should coalesce noisy events:

* many `unit.readable` events can become one `source.units.readable_batch`;
* many segment status changes can become one `manifest.segments.updated`;
* progress heartbeats should not trigger manifest invalidation if no artifact changed;
* active audio clock does not belong on the backend event stream.

## Job progress vs source progress

Separate:

* **Source progress:** intake, extraction, readable units, quality, errors.
* **Manifest progress:** narratable units, segments, audio, sync, stale state.
* **Job progress:** provider calls, retries, checker/alignment work.

The current job status enum is too coarse for the UI state we need. It can remain internally, but the reader should subscribe to source/manifest progress.

## Artifact readiness

Artifact readiness should be explicit and cacheable:

* `contentIrFragment`
* `finalContentIr`
* `speechPlan`
* `segmentAudioUnchecked`
* `segmentAudioChecked`
* `highlightMap`
* `alignmentQuality`
* `revisionMap`
* `repairOverlay`

Each artifact needs identity, currentness, stale reason, URL, checksum/hash where applicable, and compatibility keys.

## Cache invalidation

Use identity-based invalidation:

| Change                             | Invalidate                                                  |
| ---------------------------------- | ----------------------------------------------------------- |
| Source revision changes            | source manifest, progress remap, affected speech/audio/sync |
| Extraction revision changes        | unit manifest, quality report, source windows               |
| Repair overlay changes speech text | affected speech plan, audio, sync                           |
| Voice/engine changes               | audio and timing only                                       |
| Timing confidence changes          | sync mode only                                              |
| Segment unchecked → checked        | segment status and sync eligibility                         |
| Segment replaced                   | audio artifact and highlight map                            |
| Route change                       | UI subscription only, not backend work                      |

# Performance budgets and gates

Use existing gates as the floor, then add active-processing gates.

## Existing gates to keep

From `docs/performance.md` and `benches/thresholds.json`:

| Metric                        |     Current gate |
| ----------------------------- | ---------------: |
| App cold usable               |       `<=2200ms` |
| Source switch                 |       `<=1200ms` |
| Studio route switch           |        `<=600ms` |
| Book Cinema open              |        `<=450ms` |
| Transport interaction latency |        `<=850ms` |
| Settings open                 |        `<=850ms` |
| Reader resume                 |        `<=500ms` |
| Initial JS gzip               | `<=160000 bytes` |
| Largest async app chunk gzip  | `<=110000 bytes` |

Treat these as active-job gates too unless explicitly revised. The first responsiveness batch should not add new waivers.

## New active-processing budgets

| User-visible event                                       |                                                                         Target |
| -------------------------------------------------------- | -----------------------------------------------------------------------------: |
| Route click visual acknowledgement                       |                                                                      `<=100ms` |
| Route placeholder/shell visible during active processing |                                                                  `<=250ms p95` |
| Route content usable during active processing            |                  `<=600ms p95` for normal studio route; `<=750ms p95` hard cap |
| Reader open with active source manifest                  |                                        `<=450ms p95` once reader chunk is warm |
| Source switch while generation continues                 | existing `<=1200ms p95`; no more than `20%` regression under active processing |
| Play/pause button visual response                        |                                                                      `<=100ms` |
| Play/pause/seek command to media element                 |                                                                  `<=250ms p95` |
| Existing transport interaction outer gate                |                                                                      `<=850ms` |
| Progress save after pause/route switch                   |                                                        `<=500ms`, non-blocking |
| SSE event propagation after backend state commit         |                                                                  `<=500ms p95` |
| Manifest patch flush to UI                               |                                              `<=250ms p95` after event receipt |
| Poll fallback interval                                   |                                               `<=2000ms`, but only as fallback |
| First visible source skeleton                            |                                                                      `<=250ms` |
| First visible pasted/Markdown text                       |                                                                  `<=500ms p95` |
| First visible clean HTML/EPUB section after bytes local  |                                                                 `<=2000ms p95` |
| First narratable unit after first readable unit          |                                         `<=750ms p95` for EPUB/structured HTML |
| First segment planned after narratable unit              |                                                                     `<=1000ms` |
| First playable local overhead after TTS bytes arrive     |                                                                      `<=500ms` |
| First playable proof fixture excluding provider latency  |                                                          target `<=3000ms p95` |
| Phrase/block sync after segment audio ready              |                                                                      `<=500ms` |
| Exact word sync                                          |                    no ASAP guarantee unless timing evidence is already trusted |

## Read-along frame stability

For active read-along:

* No React commit per word tick on the main reader path.
* Long tasks `>50ms`: target `0` during a 60s read-along smoke; any occurrence records degraded state.
* Highlight swap should remain frame-safe; target no visible missed highlight and no scroll jumps.
* Auto-scroll should never fire while the user is actively scrolling.
* Smooth cursor disabled after repeated long tasks or reduced-motion preference.
* Existing sync quality thresholds remain: word drift `<=150ms`, phrase drift `<=350ms`, wrong/stale highlight counts `0`, scroll jumps `0` (`benches/thresholds.json#readAlongSync`).

## Low-resource fallback behavior

Low-resource fallback is successful if the reader remains usable, even with lower fidelity.

Required fallback evidence:

* exact word → phrase/block downgrade reason visible;
* smooth cursor disabled where needed;
* waveform/diagnostics deferred;
* source window shrunk;
* route/control budgets still pass;
* degraded states recorded in `window.__ttsResearchPerformance.degradedStates`;
* no hidden spinner that blocks reading.

## Screenshot / UI regression evidence

First batch should extend existing evidence, not create a sprawling QA universe.

Required evidence lanes:

* Responsive snapshots across phone, constrained desktop, desktop, and large desktop for the active read surface.
* Source states: extracting, partially readable, partially playable unchecked, checked audio, stale/replaced audio, failed segment, repair superseded.
* Overlay collisions: `0` blocking collisions in Read mode.
* Surface complexity: Read mode remains `calm`; diagnostics hidden by default.
* Navigation-under-processing audit: route/action activation still works while generation is running.
* Low-resource timing: reader timing summary present, `missingMetricCount = 0`, no new blocking waivers.
* Read-along performance: long-task and highlight counters captured for Book/Website/Document read surfaces, not only advisory fixtures.
* Screenshot manifest must identify source owner: project vs temporary/promoted source.

# Trade-offs / anti-goals

Keep these out of the first `<=20` active issue batch:

* Full rewrite of `App.tsx`.
* React Router / full routing framework migration unless absolutely necessary.
* WebSocket infrastructure before SSE/source-manifest events prove insufficient.
* Full global state-management migration for the whole app.
* Service worker / PWA / cloud sync / multi-device offline sync.
* Full PDF/OCR/DOCX responsiveness parity.
* Non-contiguous playback.
* Full repair workbench.
* Full virtualized layout engine for every source type.
* New TTS providers, voice cloning, or provider-quality work.
* AI summaries, chat, notes, quizzes, or study mode.
* Command Palette expansion.
* Diagnostics dashboards.
* Waveform editor.
* Full import wizard redesign.
* Theme/visual redesign not tied to responsiveness evidence.
* Performance micro-optimizations without a failing metric or trace.

The first batch should carve out the read-along responsiveness path, not renovate every surface.

# Pressure-test questions

1. May low-resource mode downgrade from exact word highlight to phrase/block highlight **for performance stability**, even when timing evidence technically permits word sync? I recommend yes; stable controls and honest lower-fidelity sync are better than jittery exact-word sync.

2. Should the backend reserve CPU for the reader by capping synthesis/alignment/checking concurrency when an active read surface is open? I recommend yes for local-first. Otherwise local provider work can make the UI feel broken on the machines this product claims to support.

3. Is a small internal virtualization/windowing utility acceptable for the first EPUB/structured HTML proof path, instead of adding a third-party virtual list dependency? I recommend internal first because source anchors, read-along spans, and resume locators are product-specific.

# Agreement candidate

Carry this into complete UI/screenshot review: responsiveness should be achieved by **keeping route/UI state narrow, moving source/read-along truth into manifest-scoped external stores, using source/manifest SSE events instead of whole-job snapshots, isolating playback/highlight from broad React renders, windowing large source documents, and degrading visibly under low resources rather than blocking or lying**. Backend/local storage remains authoritative; frontend caches are narrow and disposable; diagnostics and heavy surfaces stay lazy.

`AGREED RESPONSIVENESS ARCHITECTURE`
