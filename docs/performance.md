# Performance measurement and budget protocol

Voice Studio targets local-first reading on modest CPU-only machines. Performance claims are valid only when the command, source revision, machine, cache/build state, marks, sample set, failures, and generated artifacts are recorded together.

## Canonical numerical source

[`../benches/thresholds.json`](../benches/thresholds.json) is the sole machine-readable source for pass/fail numbers. Documentation explains meaning and procedure; copied prose values never override the JSON.

- `pnpm bundle:local` reads `frontendBundle` and writes `output/performance/latest/bundle.json`.
- `validate:local:release` reads the same file and renders bundle and reader threshold rows in its JSON, Markdown, and HTML reports.
- Reader timing evaluation reads `readerTiming` directly.
- `pnpm e2e:readalong-performance` currently emits long-task/render-counter budget rows. Its built-in defaults mirror `readAlongRuntime`, but are non-canonical; evidence is accepted only when every emitted expected value matches the JSON. This integrates the existing generator without changing product or script code.

The CSS discrepancy is resolved in favor of the implemented canonical gate: `frontendBundle.maxInitialCssGzipBytes` is 15,000 bytes. The removed 14 KB prose value was never the gate read by `pnpm bundle:local`; retaining 15,000 does not relax an existing limit.

## Responsive Cinema Peer contract — planned, not yet enforced

The Peer-returned responsive contract is reconciled here for architecture planning. The current `benches/thresholds.json` does **not** yet contain these responsive-narration rows, so they are not canonical machine-enforced gates and no pass is claimed. They become release gates only when an authorized contract issue adds schema, validator, negative fixtures, and source-bound raw evidence without weakening existing thresholds.

The current baseline has four independent problems that measurements must keep separate:

- source-preps list transport: observed 4,340,522 downloaded bytes for 26 sources; top-level `Text`/`SpeechText` is cleared, but complete block arrays remain with each block's text fields bounded to 220 characters;
- event propagation: `/api/voice-jobs/:id/events` is SSE, but the server emits full snapshots on a 1,500 ms ticker with no sequence/replay contract, then the client falls back to two-second polling on error;
- first-playable synthesis: the observed 42-word fixture became one approximately 16.2-second segment, so `FirstPlayableAt` equalled terminal completion; production segmentation can coalesce full sentence pieces and does not subdivide an overlong sentence;
- initial bundle: recorded production output was 253.95 KB main-JS gzip and 20.53 KB CSS gzip against the existing 160,000-byte and 15,000-byte gates.

These observations are not protocol-qualified baselines unless accompanied by the run metadata required below. They identify expected failing cases; documentation must not translate them into covered/implemented claims.

### Planned p50/p95 budgets

| Metric | Start → end | p50 | p95 | Hard/additional gate |
| --- | --- | ---: | ---: | --- |
| Prepared-source list server | request accepted → response bytes completed; canonical 26-source fixture | 50 ms | 150 ms | raw JSON ≤64 KiB and ≤8 KiB base + 2.25 KiB/source |
| Source-list client ingestion | fetch start → normalized summary store committed | 75 ms | 200 ms | one effective request per project/cache key |
| Selected-source hydration | detail request → reader projection committed | 120 ms | 300 ms | stale response cannot replace newer selection |
| Ready source → Cinema enabled | source-ready store commit → enabled action painted | 16 ms | 50 ms | no narration dependency |
| Resident-data Cinema open | input → interactive Cinema paint | 50 ms | 100 ms | reader focus target available |
| First useful cold shell | navigation start → first primary interaction usable | 650 ms | 1,000 ms | optional diagnostics/rich rendering excluded |
| Visible action acknowledgement | input → visible pressed/pending/status response | 16 ms | 75 ms | existing 100 ms hard limit remains |
| Playback command acknowledgement | input → controller state/audio effect observed | 16 ms | 50 ms | existing transport threshold remains |
| Narration request acceptance | start input → accepted run with `runId` visible | 50 ms | 150 ms | no source/navigation blocking |
| Warm local first playable | run accepted → first segment artifact durably committed | 10 s | 20 s | canonical local fixture; warmed engine |
| Cold local first playable | run accepted → first segment artifact durably committed | 20 s | 35 s | cold engine/model state reported separately |
| Progressive advantage | accepted → first playable / accepted → terminal completion | — | ≤0.35 | sources with estimated speech ≥30 s |
| Artifact commit → SSE flush | durable segment commit → event bytes flushed | 25 ms | 100 ms | sequence included |
| Event receipt → enabled transport | event callback → enabled transport painted | 32 ms | 100 ms | same Cinema/controller instance |
| Commit → enabled transport | durable segment commit → enabled transport painted | 100 ms | 250 ms | supersedes the brief's 500 ms candidate |
| Reconnect convergence | network restored → authoritative sequence/store convergence | 250 ms | 1,000 ms | no cursor/session reset |
| Predecoded intersegment gap | segment end → next compatible decoded segment audible | 20 ms | 50 ms | no missing-prefix crossing |
| Cursor continuity | before append/promotion → after | — | — | transition-attributable jump/regression ≤20 ms |
| Main-thread generation session | 60-second generation/playback/navigation fixture | — | — | zero long tasks ≥50 ms |
| Overlay geometry | 390/1100/1440/1920 CSS px | — | — | zero occlusion and primary-action hit interceptions |

Existing bundle limits remain unchanged: initial JS raw ≤523,700 bytes; initial JS gzip ≤160,000 bytes; initial CSS gzip ≤15,000 bytes; largest asynchronous application chunk gzip ≤110,000 bytes. Diagram vendors, Cinema Markdown rendering, diagnostics, the tutorial Drawer, and inactive stages remain outside the initial route when not required.

### Planned responsive instrumentation

Frontend marks/measures:

- shell/source: `app_navigation_start`, `shell_interactive`, `source_list_request_start`, `source_list_response_end`, `source_list_store_commit`, `source_detail_request_start`, `source_session_readable`, `cinema_action_enabled`, `cinema_open_input`, `cinema_interactive`;
- narration/events: `narration_start_input`, `narration_start_ack`, `narration_run_accepted`, `narration_event_received`, `narration_event_reduced`, `segment_playable_committed_client`, `transport_enabled`, `event_stream_disconnected`, `event_reconcile_started`, `event_reconciled`;
- playback/sync: `playback_controller_created`, `playback_command_input`, `playback_effect_observed`, `segment_append_received`, `segment_append_scheduled`, `sync_fidelity_changed`.

Where applicable, every responsive measure carries trace ID, source/revision ID, run ID, segment index, event sequence, controller instance ID, cold/warm state, engine, and performance mode. Metrics contain no source text or sensitive voice material. Use Event Timing and `PerformanceObserver` for long tasks, Resource Timing for list/detail transfer, React Profiler around shell/store subscribers, and a controller-instance assertion that fails if one run has more than one active owner.

Backend boundaries record request acceptance/completion and bytes; run acceptance; segment-plan creation; per-segment synthesis start/finish; artifact durable commit; `FirstPlayableAt`; manifest commit; event-sequence allocation/enqueue/SSE flush; cancellation request/effect; snapshot/reconnect start/finish; gap/replay counts; and final assembly start/finish/failure.

Raw responsive results belong under a source-hash-bound `benches/results/responsive-cinema/` tree when that harness is authorized. Missing results, missing marks, a 1.5-second ticker path, duplicate controller creation, payload overflow, occlusion, or absent provenance fail closed rather than being interpreted as a pass.

## Critical-path rules

- Load the shell, narration controls, and current project state only.
- Keep Markdown/Mermaid, schema/Content IR, import/export, settings/help, waveform, diagnostic, and advanced Cinema surfaces behind the action that opens them.
- Normal Book Cinema must not statically import the Markdown/Mermaid renderer.
- Prefer narrow model/helper imports over barrels that pull validators, SDK schemas, or diagnostics into the browser entry.
- Reader resume and first readable content must not wait for secondary drawers, provider diagnostics, export code, or diagram rendering.
- Default startup performs no dependency installation, heavyweight model/module import, model download, provider call, or cache mutation.

## Reference machine class

The comparison class is `measurementProtocol.referenceMachineClass` in the threshold file: Linux or WSL2 on x86-64, SSD-backed repository/build storage, the declared logical-CPU range and minimum memory, and no required GPU. A run report must additionally capture:

- CPU model, allocated logical/physical cores, memory and swap, kernel/virtualization, storage filesystem and free space;
- power mode and whether other sustained workloads were present;
- Node, pnpm, Go, mise, Python, Chromium, and Playwright versions;
- commit SHA, dirty/untracked paths, lockfile hash, and exact environment overrides;
- whether GPU/CUDA devices, tools, or libraries were visible even when disabled.

A faster or more memory-rich host may produce diagnostic evidence but cannot silently replace the reference class. Compare like-for-like classes and report deviations.

## Build and cache states

Never label a run simply “cold” or “warm.” Use one of these states and record each cache location as present, empty, or not inspected.

| State | Dependency state | Build state | Model/provider state | Purpose |
| --- | --- | --- | --- | --- |
| `production-bundle-clean` | Lockfile dependencies already installed; package manager forced offline | Delete `frontend/dist`; Vite production build creates a fresh manifest | No model/provider access | Bundle graph and gzip gate |
| `runtime-warm` | Dependencies installed; no install/sync permitted | Go/Vite/compiler caches populated by the discarded warm-up; services stopped before each run | Empty isolated model cache; providers denied | Normal local startup distribution |
| `runtime-cold-post-edit` | Dependencies installed; no install/sync permitted | Touch the declared source fixture or clear only the declared compiler/build cache; do not clear dependency stores | Empty isolated model cache; providers denied | Compile plus runtime-init distribution |
| `interaction-low-resource` | Dependencies and browser installed | Production assets or one declared dev build reused for all samples | Mock providers; isolated empty model cache | Local UI work without provider variance |

Deleting dependency stores converts the run into setup/install measurement and is outside startup. Reusing a server, browser context, production `dist`, or model cache must be declared.

## Run protocol and statistics

1. Stop prior frontend/API/compiler/browser descendants and prove the test ports are free.
2. Capture machine, toolchain, commit/worktree, cache/build, model-cache, egress, and GPU state.
3. Pin the exact command and environment. Force package managers offline and use isolated temporary HOME/XDG/model-cache directories where the lane allows it.
4. Run one warm-up and discard only that run. The warm-up must still be recorded with status and reason for exclusion.
5. Run at least `measurementProtocol.minMeasuredRuns` measured samples for startup and for any interaction distribution used to set/change a budget. Do not cherry-pick or retry away failures.
6. Report p50, p95, and max using the nearest-rank percentile over measured successful values, plus total count and failure count. Any measured timeout, crash, missing mark, egress, cache mutation, or descendant leak fails the gate regardless of successful percentiles. Keep successful statistics for diagnosis; never coerce a failure into a fast value.
7. Use production mode for bundle and user-path interaction claims. Development-mode startup is a separate lane and must say `dev`; do not compare its Vite/Go compile cost with production runtime initialization.
8. Persist raw per-run marks/samples and a summary. Record all artifact paths and command exit codes.

A one-off timing is an observation, not a baseline. Historical startup numbers that lack this protocol remain provisional.

## Startup marks

All timestamps use the same monotonic clock for one run.

| Mark | Definition | Phase |
| --- | --- | --- |
| `launch-requested` | Immediately before spawning the exact root command | start |
| `command-acknowledged` | Root process successfully spawned and process group/cgroup identity captured | acknowledgement |
| `compile-start` / `compile-complete` | Declared compiler begins/ends Go or frontend compilation; absent instrumentation is a failed evidence field, not zero | compile |
| `api-runtime-start` | API executable begins runtime initialization after compile | runtime init |
| `frontend-runtime-start` | Frontend server begins runtime initialization after compile | runtime init |
| `api-http-ready` | A bounded `GET /api/health` returns the expected successful response | completion/readiness |
| `frontend-http-ready` | A bounded frontend `GET /` returns successful HTML containing the expected root marker | completion/readiness |
| `project-create-committed` | A unique project create returns success and the project is readable back; cleanup result is recorded separately | state commit/readiness |
| `local-ready` | API, frontend, and project-create marks all succeeded | completion/readiness |
| `shutdown-requested` / `process-tree-exited` | Signal sent to root group and last descendant reaped | completion/shutdown |

Report compile duration separately from runtime initialization. For commands that use `go run` or on-demand Vite compilation, add log/trace marks or run an equivalent declared compile phase; do not attribute pre-bind compile time to runtime init. Readiness based only on a listening socket is invalid, and inability to execute a readiness probe fails closed.

## Interaction marks: acknowledgement, commit, completion

- **Acknowledgement:** first visible response caused by the shared action handler—pressed/busy state, stable progress region, or optimistic transport state—painted after input. It does not claim the operation finished.
- **State commit:** authoritative transition accepted and reflected in application state, such as route content committed, job identity persisted, or generation handoff accepted.
- **Completion:** requested user outcome is usable, such as reader restored, search results visible, or audio actually responding.

`interactionAcknowledgement` budgets apply only to acknowledgement marks. Existing `readerTiming` metrics remain end-to-end commit/completion gates and must not be relabeled as acknowledgement to claim a faster result.

| Existing metric | Required terminal mark |
| --- | --- |
| `app-cold-usable` | completion: initial project shell is usable |
| `source-switch` | completion: selected source content is usable |
| `studio-route-switch` | state commit: target studio surface painted |
| `book-cinema-open` / `preview-cinema-open` | completion: requested Cinema surface is interactive |
| `transport-interaction-latency` | completion: requested transport effect is observed; distinct from transport acknowledgement |
| `waveform-progress-render` | state commit: requested progress frame is painted |
| `teleprompt-cue-switch` | state commit: target cue is painted and active |
| `settings-open` | state commit: settings surface is painted and focus is placed |
| `preview-generation-handoff` | state commit: generation request has an authoritative accepted identity/state, not synthesis completion |
| `command-palette-open-search` | completion: palette results are visible and keyboard-usable |
| `context-panel-tab-switch` | state commit: selected panel content is painted |
| `reader-resume` | completion: saved location is restored or an explicit fallback is usable |

Each future marker must include phase (`acknowledgement`, `commit`, or `completion`), input timestamp, terminal timestamp, source fixture, mode, and success/failure. All input paths call the same handler; measure pointer, keyboard, touch, command-palette, and shortcut paths as conformance variants rather than separate implementations.

## Process-tree CPU, RSS, and shutdown

Account for the complete descendant tree: shell/mise, Go compiler/API, pnpm/Node/Vite/esbuild, browser, Python workers, and transient children.

- Spawn each service lane in a dedicated process group or cgroup and retain the root identity.
- At every `measurementProtocol.processTreeSampleIntervalMs`, rediscover descendants recursively so short-lived and reparented children are not omitted. Record PID, parent PID, start time, command, CPU ticks, RSS, and exited status.
- CPU percent is the sum of descendant CPU-time deltas divided by wall time, with one fully occupied logical CPU reported as 100%. Report tree p50/p95/max; never average only the immediate Go or Vite PID.
- Tree RSS is the sum of resident bytes for live descendants at a sample. Record this portable, conservative measure and identify shared-memory double counting; use cgroup memory as an additional field when available, not a silent substitute.
- Begin the idle window only after `local-ready` and the configured settle interval. Sample for the configured duration with no browser polling fixture unless the lane explicitly includes it.
- Send SIGINT and SIGTERM in separate measured runs. The gate ends only when the entire group/cgroup has exited and no port listener or worker remains. Capture grace escalation and leaked PIDs.

## Egress, model-cache, and no-GPU evidence

Startup evidence must run in an OS-enforced network-denied sandbox that permits loopback only, with empty isolated model caches. A dead proxy alone is not enforcement. Capture a full descendant socket trace and fail on any non-loopback connect/send, DNS request, provider request, clone/download, dependency sync, model import/download, or cache mutation. Also retain pre/post filesystem manifests of model and dependency cache paths.

The no-GPU lane must expose no CUDA-capable device to the process tree: no NVIDIA/DXG device mounts, no usable CUDA runtime/device, and no inherited GPU service. `CUDA_VISIBLE_DEVICES=""` is defense in depth but is not sufficient evidence when the host device remains accessible. Record device-node inventory, `nvidia-smi`/equivalent result, and the application capability probe. CPU synthesis and optional-check degradation must complete honestly.

## Frontend evidence

### Production bundle graph

Run `pnpm bundle:local` from `production-bundle-clean`. Retain:

- `output/performance/latest/bundle.json` (sizes, lazy findings, threshold rows);
- `frontend/dist/.vite/manifest.json` (import graph used by the analyzer);
- command output and exit code.

Any failed threshold is a regression even if the build itself succeeds. Do not increase the JSON limit to make the run green.

### Reader timing and low-resource UI

`pnpm e2e:book-cinema:low-resource` uses mock providers and browser CPU throttling. `output/e2e-book-cinema/summary.json#readerTiming` must contain required markers, source type, units, source script, counts, p50/p75/p95/p99, and missing-marker count. Missing markers fail; provider latency is excluded.

For a budget change, use one discarded warm-up and the required measured-run count, then rerun `pnpm validate:local:release` and the smoke. The older three-run calibration procedure is useful diagnosis but does not qualify a new baseline/budget under this protocol.

### Long tasks, render counts, and traces

Run `pnpm e2e:readalong-performance` for the canonical fixture duration and scenarios. Retain `summary.json`, `counters.json`, `report.md`, and a Playwright trace when diagnosing a failure. Evidence must include long tasks at/above `readAlongRuntime.longTaskBoundaryMs`, React cursor commit rate, DOM highlight swaps, motion measurements, scroll calls, stale highlights, and stuck highlights.

The standalone synthetic fixture proves scheduler/cursor behavior only. Before App extraction and after each affected phase, add or retain application-level React Profiler render/commit counts for shell, reader, transport, and active-highlight owners. A zero synthetic `react-cursor-commit` count is not proof that the real application has no React rerenders.

## Stable artifacts and baseline log

Generated reports remain under `output/`. A concise tracked baseline record may be added under `docs/performance/` and must link raw artifacts rather than copy large traces. Until that source-bound artifact exists, the responsive observations above remain explicitly provisional and must not be cited as a protocol-qualified baseline.

Every issue that changes startup, imports, shell state, reader/playback, overlays, or responsive UX reruns the affected gate before merge. Baseline and budget enforcement precede App extraction and UX redesign; line-count reduction alone never demonstrates performance.
