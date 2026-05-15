# Working Log

## 2026-05-15 11:32 CEST - Concept-fidelity product pass
- [x] Backend portable bundle API.
- [x] Theme system and product shell controls.
- [x] Top-bar project/chapter import/export controls.
- [x] Teleprompter and cinema fidelity.
- [x] Compact audio player and dynamic queue polish.
- [x] Workspace library, import, export, and report UI.
- [x] Tests and visual QA.
- [ ] Commit revertable implementation slices.

## 2026-05-15 02:54 CEST - Optimization rounds for cloning UI and natural flow
- [x] Generate natural-flow product imagery and extract design targets.
- [x] Voice cloning optimization rounds.
  - [x] Round 1: measurable candidate score, denoise fast path, stitching allocation cleanup.
  - [x] Round 2: split overlapped speaker turns and stitch remaining clean spans.
- [x] UI optimization rounds.
  - [x] Round 1: Kokoro voicepack selector, compact player density, dynamic queue strip.
  - [x] Round 2: compact checked-run action label after desktop QA.
- [x] End-to-end content flow optimization rounds.
  - [x] Round 1: source text file drop and Markdown-to-speech cleanup.
- [x] Commit after each meaningful optimization batch.
- [x] Run checks and browser QA.

## 2026-05-15 01:50 CEST - Fix source-analysis interpreter selection
- [x] Reproduce startup check/analyzer interpreter mismatch.
- [x] Default source analysis to the checked backend virtualenv in local startup.
- [x] Surface analyzer Python path in diagnostics.
- [x] Run checks.

## 2026-05-15 01:44 CEST - Fix profile-analysis runtime bootstrap
- [x] Reproduce why UI source analysis can miss torch.
- [x] Add profile-analysis extras to startup bootstrap when pyannote is configured.
- [x] Align mise preflight with pyannote profile-analysis runtime requirements.
- [x] Verify backend profile-analysis imports and Ozzy source analysis flow.
- [x] Run checks.

## 2026-05-15 01:29 CEST - HF-token speaker analysis QA
- [x] Run source-analysis diagnostics with a runtime-only Hugging Face token.
- [x] Analyze the two-speaker demo fixture through the backend.
- [x] Inspect candidate ranking, warnings, and preview/profile readiness.
- [x] Record any setup or pipeline blockers without persisting the token.

## 2026-05-15 00:44 CEST - Voice Studio UI and local analysis pass
- [x] Add backend project persistence and project-aware jobs.
- [x] Add local pyannote diagnostics and offline model-path support.
- [x] Add dynamic short-reference voice candidate scoring metadata.
- [x] Refactor left rail profile/source/script review layout.
- [x] Add teleprompter/cinema playback controls and clipping fixes.
- [x] Run checks and Playwright desktop/mobile QA.

## 2026-05-15 00:21 CEST - Teleprompter cinema mode
- [x] Move teleprompter to the top of the center column.
- [x] Add full-viewport cinema teleprompter mode.
- [x] Wire playback state into the teleprompter overlay.
- [x] Run checks and browser sanity pass.
- [x] Commit focused UI changes without unrelated dirty files.

## 2026-05-15 00:12 CEST - Frontend startup launch reliability
- [x] Inspect current running processes and identify why frontend port 5173 stays unused.
- [x] Switch frontend launch command in `scripts/start.sh` to the explicit workspace `pnpm run dev` path.
- [x] Confirm one-command startup prints and binds both backend and frontend ports with `mise start -- pnpm start:local`.
- [ ] Cleanly shut down old orphaned `scripts/start.sh`/backend processes if startup is retried repeatedly.
- [x] Fix startup PID-capture race by passing service PIDs by reference instead of command substitution.
- [x] Start frontend through `pnpm exec vite` so frontend port overrides are reliably honored.
- [ ] Document the cleanup/restart flow in the final handoff.

## 2026-05-14 23:52 CEST - Demo voice profile playback validation
- [x] Create a demo-file voice profile.
- [x] Generate two-paragraph test audio with the default voice.
- [x] Generate the same test audio with the demo voice profile.
- [x] Verify playback waveform is derived from decoded audio.
- [x] Add clone runtime compatibility guard for Kanade `dropout_p` calls.
- [x] Record runtime pain points and performance notes.
- [ ] Make backend CORS dev ports configurable for isolated QA instances.
- [ ] Investigate clone throughput: demo run completed at about 0.31x realtime with one clone worker.

## 2026-05-14 23:40 CEST - Teleprompter read-along layout polish
- [x] Move project/job context out of the crowded center header.
- [x] Replace read-along cards with a teleprompter-style panel and active word cue.
- [x] Surface the default provider voice in the profile library.
- [x] Add helper tests for teleprompter cue timing.
- [x] Run frontend checks and capture UI sanity notes.

## 2026-05-14 23:37 CEST - Add FlashAttention-3 fallback option with compat shim
- [x] Add optional `KOKOCLONE_FLASH_ATTENTION_PACKAGE`/`KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE` support.
- [x] Implemented install-time compatibility shim for kanade imports when using `flash-attn-3`.
- [ ] Verify whether `flash-attn-3` improves clone quality in practice on this setup.

## 2026-05-14 23:45 CEST - Wire flash-attn-3 fallback into `start:local` defaults
- [x] Set `KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE=flash-attn-3==3.0.0` in local start defaults.
- [ ] Verify startup completes with this path enabled.

## 2026-05-14 23:27 CEST - Make local start enforce fast FlashAttention defaults
- [x] Update `scripts/mise-start.sh` `start:local` defaults so the bootstrap flags are set unless explicitly overridden.
- [ ] Verify no other startup path depends on legacy bootstrap defaults.

## 2026-05-14 23:18 CEST - Split KokoClone runtime from main backend env
- [x] Add dedicated KokoClone Python interpreter config to startup bootstrap path.
- [x] Ensure FlashAttention bootstrap and koko-clone dependency checks use the dedicated clone interpreter.
- [x] Wire backend Kokoro clone execution to an explicit reference interpreter.
- [x] Add clone interpreter env defaults to backend and root `.env` examples.
- [x] Expose split-runtime behavior in startup diagnostics.

## 2026-05-14 22:34 CEST - Resolve startup compile failure
- [x] Fix Go startup compile break (`job.VoiceJob`) in `backend/internal/pipeline/service.go` that prevented `mise start` from continuing.

## 2026-05-14 20:31 CEST - Fast flash-attn bootstrap path
- [x] Add fast/fast-fail FlashAttention install controls to `scripts/start.sh`.
- [x] Add explicit bootstrapping defaults for wheel-only mode and opt-in-on-boot behavior.
- [x] Document recommended FlashAttention env settings for quick startup and binary-only installs.
- [x] Confirm startup defaults are reflected in operator docs and onboarding examples.

## 2026-05-14 20:31 CEST - Speaker-aware voice profile intake and player polish
- [x] Add backend source analysis API and storage flow.
- [x] Add diarization-driven candidate scoring and reference builder.
- [x] Extend voice profile metadata for source speakers and quality metrics.
- [x] Add frontend source review, candidate preview, and profile creation flow.
- [x] Polish audio player to match accepted Voice Studio concept.
- [x] Add backend and frontend coverage.
- [x] Run checks and visual QA.

## 2026-05-14 19:09 CEST - Voice Studio pipeline optimization overhaul
- [x] Map long-source reference synthesis timeout path and current pipeline bottlenecks.
- [x] Optimize cloned-reference synthesis segmentation, timeouts, and progress telemetry.
- [x] Redesign Voice Studio/TTS panels, transcript cues, audio flow, and relevant metrics.
- [x] Re-run frontend and backend checks after implementation.

## 2026-05-14 18:36 CEST - System metrics observability for throughput tuning
- [x] add backend `/api/system-metrics` collector integration
- [x] expose GPU, host, and process telemetry schema for frontend consumption
- [x] poll and render compute telemetry in a new UI panel
- [x] add Playwright-based E2E validation of metrics panel and slider behavior

## 2026-05-14 18:52 CEST - Metrics endpoint mismatch handling
- [x] stop infinite noisy polling when `/api/system-metrics` is missing in the running backend
- [x] add clear UI message and guidance when endpoint capability is unavailable
- [x] make backend metrics fetch errors preserve backend status code context

## 2026-05-14 23:59 CEST - Clone worker env and startup plumbing
- [x] Parse and propagate `KOKOCLONE_WORKER_COUNT` to the Kokoro reference worker pool.
- [x] Add startup diagnostics for clone worker count, device, and initialization status.
- [x] Add cloned-reference worker defaults to environment example files and startup script.
- [x] Add fallback safety around worker pool init failures so runtime remains usable.

## 2026-05-14 23:14 CEST - Voice Studio cancellation, adaptive control, and tmpfs/stability hardening
- [ ] Finish backend job cancellation APIs and UI cancel controls.
- [ ] Prevent resume playback resets and stale-seek jumps in arrival playback by preserving seek context during dynamic segment appends.
- [ ] Ensure studio/clone segment settings always use tmpfs-backed job/profile directories when temp fs is enabled.
- [ ] Verify adaptive studio worker defaults and pipeline progress visibility remain accurate under mid-stream segment updates.

## 2026-05-14 23:45 CEST - Playback slider rollback fix
- [x] Remove stale drag-end value reads from completed and arrival seek commit handlers.
- [x] Ensure slider commit uses last scrubbed cursor as authoritative.
- [x] Keep touch/pointer commit behavior identical across both player modes.


## 2026-05-14 22:08 CEST - Adaptive/studio hardening continuation
- [x] Restrict adaptive segment tuning to reference-profile runs only.
- [x] Keep synthesis stage visibly running while checker is active.
- [x] Add regression coverage for adaptive segment resolution behavior.
- [ ] Re-validate live pipeline panels and arrival queue health after restart.
- [ ] Confirm startup bootstrap path for reference dependencies remains stable when dependency installs are incomplete.

## 2026-05-14 17:37 CEST - Slider seek determinism and playback continuity
- [x] Refactor slider event handling to single source of truth and remove stale commit races.
- [x] Validate completed and arrival players share identical scrub behavior.
- [x] Remove duplicate/inconsistent event wiring that can rewind playback mid-seek.

## 2026-05-14 21:32 CEST - Arrival queue slider and seek correctness
- [x] Fix callback initialization order issues in `ArrivalAudioPlayerQueue` to prevent runtime hook-order crashes.
- [x] Rework arrival seek handlers so commit and update paths share the same authoritative slider value.
- [x] Remove zero-duration slider clamp that forced scrubber back to 0 during in-progress playback.
- [ ] Validate pipeline panel activity updates when checker progress is partially complete.
- [ ] Optionally remove remaining startup/bootstrap flakiness by verifying environment bootstrap path for reference-synthesis dependencies.

## 2026-05-14 17:18 CEST - Adaptive studio throughput and pipeline state polish
- [ ] Add adaptive throughput defaults for cloned-voice runs (adaptive workers/runes) and expose them via env/config.
- [ ] Ensure adaptive mode in backend is effective for reference synthesis instead of a no-op.
- [ ] Improve TTS pipeline stage status resolution so active checking/synthesis progress stays visible during partial completion.
- [ ] Run compile/type and service checks after the implementation.

## 2026-05-14 17:55 CEST - Continue plan and stabilize interactive polish
- [ ] Fix Arrival/Completed audio slider logic so seeking doesn't cause duplicate playback resets.
- [ ] Ensure studio pipeline status remains true-to-state under in-flight segment checks (no stale "done" states).
- [ ] Re-check startup defaults/bootstrap messaging after adding studio/clone-specific segment knobs.
- [ ] Verify type/build checks for frontend + backend after final wiring.

## 2026-05-14 16:53 CEST - Frontend Skill Install
- [x] Check curated skills for frontend-skill
- [x] Check experimental skills source
- [ ] Install frontend-skill after a valid source path is provided

## 2026-05-11 09:08 EDT - Project Scaffold
- [x] Initialize repository and root project files
- [x] Add Go Fiber backend with typed mock TTS pipeline
- [x] Add Vite React Tailwind frontend
- [x] Configure Biome, ESLint, Husky, and git ignores
- [x] Install dependencies and generate lockfiles
- [x] Run checks and verify the scaffold

## 2026-05-11 09:30 EDT - Kokoro TTS Integration
- [x] Pin Kokoro-compatible Python tooling
- [x] Add Python Kokoro synthesis script
- [x] Add Go Kokoro TTS agent and env-based provider selection
- [x] Expose provider metadata in the API and frontend
- [x] Install Kokoro dependencies and generate lockfiles
- [x] Verify real Kokoro audio generation

## 2026-05-11 09:40 EDT - OpenRouter Voice Optimization
- [x] Inspect helper OpenRouter references without copying secrets
- [x] Add OpenRouter-backed VoiceOptimization agent
- [x] Add env configuration and rule-based fallback
- [x] Update docs and examples
- [x] Keep rotating free router and add few-shot optimizer examples
- [x] Expose optimizer provider metadata separately from TTS provider
- [x] Run checks and verify the OpenRouter optimization path

## 2026-05-11 10:03 EDT - Full Checker Loop PoC
- [x] Make voice jobs asynchronous with live stage state
- [x] Add local Qwen3-ASR-backed checker
- [x] Compare ASR transcript to optimized text and detect clean cutoffs
- [x] Retry/resume bounded incomplete segments and merge audio
- [x] Add numeric ASR normalization for spoken percentages and compact units
- [x] Poll job state from the frontend instead of static done markers
- [x] Run checks and verify full-cycle behavior

## 2026-05-12 08:51 EDT - Long Job Progress Feedback
- [x] Inspect timed-out checker behavior and clean stale processes
- [x] Add server-sent job progress updates
- [x] Show live stage details and animated processing indicators
- [x] Make source text read-only while a job is running
- [x] Improve long checker feedback and timeout visibility
- [x] Split long optimized text into bounded synthesis/checking segments
- [x] Run checks and verify long-job progress behavior

## 2026-05-12 10:06 EDT - Start Script
- [x] Add a single command startup script
- [x] Load root and backend environment files safely
- [x] Wire root package scripts to the startup script
- [x] Document local startup usage
- [x] Run checks and verify script behavior

## 2026-05-12 10:19 EDT - Streaming Optimizer And Retry Loop Repair
- [x] Inspect helper OpenRouter streaming code
- [x] Stream VoiceOptimization partial output into job state
- [x] Retry same-segment checker failures before exhausting
- [x] Keep clean cutoff resume behavior for partial audio
- [x] Run checks and verify progress events expose streamed optimizer text

## 2026-05-12 11:10 EDT - Final Audio Persistence
- [x] Stop exposing partial in-progress audio as final playback
- [x] Save completed job audio and metadata to disk
- [x] Cache-bust completed audio playback
- [x] Run checks and verify persistence behavior

## 2026-05-12 11:23 EDT - Persistent ASR Worker
- [x] Keep ASR verification on every segment
- [x] Reuse one loaded Qwen ASR worker across checks
- [x] Update docs and environment examples
- [x] Run checks
- [x] Restart local dev stack with persistent checker enabled
- [x] Verify live short job with Kokoro and Qwen ASR

## 2026-05-13 10:27 EDT - Git Artifact And Secret Audit
- [x] Ignore and remove generated artifacts
- [x] Stage intended source files only
- [x] Scan staged contents for secrets and artifacts
- [x] Commit locally

## 2026-05-13 10:38 EDT - Bonsai Optimizer Evaluation
- [x] Inspect Bonsai 8B MLX requirements
- [x] Build local versus OpenRouter optimizer comparison harness
- [x] Run shared pre-TTS samples through both models
- [x] Summarize whether Bonsai can handle prompt processing

## 2026-05-13 11:24 EDT - Local Bonsai Stack And Publish
- [x] Add Bonsai as the default local voice optimizer
- [x] Verify local Bonsai plus Kokoro plus Qwen pipeline
- [x] Audit committed files for secrets and generated artifacts
- [x] Create public GitHub repository with gh and push

## 2026-05-13 12:10 EDT - Long Technical Article Reliability
- [x] Inspect failed locality-domain job output and checker metadata
- [x] Improve local pre-TTS normalization around domains, dates, abbreviations, and section labels
- [x] Fix failed-stage reporting for checker retry exhaustion
- [x] Add regression coverage for the long technical article path
- [x] Run checks and verify behavior

## 2026-05-14 23:58 CEST - Optimize Studio arrival playback throughput
- [x] Add studio-specific pipeline config knobs in backend startup and pass defaults through `pipeline.Options`.
- [x] Route cloned-voice jobs through studio-specific segment size/worker settings while preserving default behavior.
- [x] Compute and show arrival-mode smoothness estimate from per-segment duration/latency telemetry.
- [ ] Add/refresh test coverage specifically for studio mode throughput and estimator behavior.

## 2026-05-14 15:58 CEST - Studio Throughput Stabilization Follow-up
- [x] Update studio pipeline worker/segment defaults so studio mode inherits base settings when unspecified.
- [x] Add studio-specific environment knobs to root and backend `.env` examples.
- [x] Fix arrival throughput metric math for fast producers (`productionRatio >= 1`) and avoid misleading queue risk math.
- [x] Simplify Arrival slider seek commit triggers to reduce redundant commit events during drag.
- [ ] Run backend and frontend checks for the plan’s final validation.

## 2026-05-14 16:23 CEST - Studio pipeline throughput and arrival behavior hardening
- [ ] Keep studio throughput instrumentation aligned with clone-mode defaults.
- [ ] Ensure cloned-voice segment worker settings are effective and validated in `synthesizeUntilComplete`.
- [ ] Improve first-segment availability and reduce queue starvation while cloning.
- [ ] Verify Arrival mode playback timeline updates correctly during scrubbing.
- [ ] Run checks for compile/type safety and summarize results.

## 2026-05-14 16:58 CEST - Arrival/Completed slider stability and studio throughput plan
- [x] Remove duplicated and conflicting seek-handler definitions in `CompletedAudioPlayer`.

## 2026-05-14 16:35 CEST - Startup env hardening for segment worker defaults
- [x] Add default value for `VOICE_SEGMENT_WORKERS` in `scripts/start.sh` to avoid `set -u` unbound-variable crashes.
- [x] Add pointer-specific seek input handling for `ArrivalAudioPlayerQueue` slider events.
- [ ] Tighten backend startup defaults for studio pipeline knobs and worker visibility.
- [ ] Add/extend studio throughput safeguards to prevent stalls when reference synthesis is slower.
- [ ] Run frontend typecheck and backend validation checks.

## 2026-05-14 17:45 CEST - Studio throughput defaulting and resolved worker visibility
- [x] Tune default studio/reference synthesis knobs for smoother arrival playback.
- [x] Keep existing global defaults intact while giving cloned-voice profiles a throughput-safe path.
- [x] Log resolved segment worker/rune settings for both standard and studio modes.

## 2026-05-14 16:37 CEST - Adaptive playback and pipeline telemetry finish
- [ ] Add adaptive-mode and per-segment text metadata to backend job model/creation flow.
- [ ] Keep pipeline stage status aligned to true completion lifecycle.
- [ ] Preserve segment metadata for cue pane after completion.
- [ ] Add adaptive mode toggle in UI + current/next segment cue panel.
- [ ] Implement active segment highlighting tied to playback head.
- [ ] Ensure slider/seek behavior remains stable under arrival playback.
- [ ] Verify compile error points and status consistency fixes in UI and API.

## 2026-05-14 20:52 CEST - Transcript cue + slider stabilization
- [ ] Add segmented transcript cue panel wired to playback cursor and active segment highlighting.
- [ ] Propagate arrival-completion seek head changes to cue/highlight updates.
- [ ] Stabilize slider commit/update path for both completed and arrival playback modes.
- [ ] Add defensive defaults for studio segment environment knobs in startup script.

## 2026-05-14 16:46 CEST - Arrival/Completed seek and live pipeline tuning
- [x] Update pipeline status resolver to reflect active stage from job status and current pipeline phase.
- [x] Consolidate slider input handling in completed playback to avoid duplicate seek commits and stale event values.
- [x] Consolidate slider input handling in arrival playback to avoid duplicate seek commits and stale event values.
- [x] Keep slider feedback responsive by treating the last input value as authoritative seek target.

## 2026-05-14 17:10 CEST - Install frontend skill
- [x] Check curated skills for `frontend-skill`.
- [x] Check experimental skills path for `frontend-skill`.
- [ ] Install blocked: `frontend-skill` was not found in current `openai/skills` curated or experimental paths.

## 2026-05-14 17:16 CEST - Playback and startup hardening follow-through
- [x] Validate slider seek handlers under both arrival and completed playback paths using final TypeScript build.
- [x] Validate backend/frontend test/check commands after the prior slider and startup updates.
- [x] Confirm no compile-time regressions from the streaming/player refactors.
- [ ] Tune adaptive/throughput controls further if arrival-mode segment underruns are still observed.

## 2026-05-14 17:43 CEST - Completion retention and tmpfs retention for studio artifacts
- [x] Preserve arrived segment buffers when jobs complete so /audio/segment remains usable after completion.
- [x] Wire `VOICE_JOB_DATA_DIR` and `VOICE_PROFILE_DATA_DIR` to tmpfs-backed directories when tmpfs is enabled.
- [x] Add startup defaults/fallbacks for job/profile data directories outside tmpfs mode.
- [x] Surface job/profile data locations in startup diagnostics.
- [ ] Validate restart and resume behavior for arrival playback after full completion in cloned-voice mode.

## 2026-05-14 20:52 CEST - Clone worker GPU utilization pass
- [ ] Add persistent Kokoro clone worker mode with pooled request handling in `kokoro_clone.py`.
- [ ] Cache normalized reference waveforms inside `KokoClone` to avoid repeated reference reloads.
- [ ] Add `KOKOCLONE_WORKER_COUNT` and wire through backend startup + service options.
- [ ] Tune studio segment defaults for clone throughput where appropriate and document the expected runtime behavior.
- [ ] Update startup diagnostics to expose clone worker pool resolution and device placement.

## 2026-05-14 23:59 CEST - Clone worker throughput implementation
- [ ] Finish pooled, GPU-resident cloned-voice worker implementation in `backend/internal/agents/tts.go`.
- [ ] Add `KOKOCLONE_WORKER_COUNT` env/default wiring to `scripts/start.sh`, `.env.example`, `backend/.env.example`, and `backend/cmd/api/main.go`.
- [ ] Log resolved clone worker/device settings in startup diagnostics.
- [ ] Verify reference synthesis worker behavior degrades gracefully when persistent worker startup fails.

## 2026-05-14 18:45 CEST - Source text draft persistence
- [x] Persist source-text input across UI reloads instead of resetting to sample text.
- [x] Restore textarea from active job payload when a job is resumed from localStorage or query parameter.
- [x] Ensure local draft sync avoids stale resets while processing state changes.

## 2026-05-14 18:49 CEST - System metrics payload null-safety
- [x] Handle null/legacy system-metrics payloads for `gpus` and related fields safely in UI rendering.

## 2026-05-14 20:43 CEST - System metrics panel resilience
- [x] Guard system metrics UI when backend returns `warnings: null`.
- [x] Keep System metrics panel rendering resilient to partial/legacy metrics payloads.
- [x] Confirm runtime no longer crashes on metrics refresh.

## 2026-05-14 18:56 CEST - Worker cap hardening for OOM safety
- [x] Clamp segment and clone worker settings to a 2-worker safety ceiling at startup.
- [x] Update default studio/adaptive worker env defaults to safe 2-worker values.
- [x] Align sample configuration/docs with new defaults to prevent accidental overprovision.
- [x] Record effective runtime behavior in startup logs when values are capped.

## 2026-05-14 22:31 CEST - Wire FlashAttention into startup bootstrap
- [x] Add environment defaults for FlashAttention bootstrap and hard-fail toggles.
- [x] Add startup probe/install guard for flash-attn in `scripts/start.sh`.
- [x] Make startup status/telemetry reflect FlashAttention availability.
- [x] Update example env files with new flags.
## 2026-05-14 21:38 CEST - Local provider startup
- [ ] Verify local-provider startup command(s) with required env vars
- [ ] Confirm fast path for Kokoro/Qwen + mock combinations
- [ ] Note cleanup/disconnect behavior and provider fallbacks

## 2026-05-14 21:39 CEST - README: add local fallback startup command
 - [x] Add local-provider fallback startup example to README
 - [x] Log quick command pattern with mise start -- pnpm start:local
 - [x] Add one-liner quick resume section for fast local startup

## 2026-05-14 22:26 CEST - Product controls and modular shell polish
- [x] Add functional workspace/help/settings/run configuration surfaces.
- [x] Add backend run options for preprocessing, clone use, checker, retry, quality report, and performance mode.
- [x] Refactor frontend shell modules while preserving current job/profile flows.
- [x] Polish player/top-bar visual system against the accepted concept board.
- [x] Add frontend and backend tests for run modes and option behavior.
- [x] Run checks and capture desktop/mobile visual QA screenshots.

## 2026-05-14 22:57 CEST - Product feel and performance squeeze
- [x] Run the app with local providers and exercise primary flows.
- [x] Capture interaction pain points across desktop and mobile.
- [x] Identify frontend render/polling/layout performance squeeze points.
- [x] Identify backend pipeline/runtime performance squeeze points.
- [x] Record prioritized follow-up fixes.
- [ ] Make disabled-checker runs hide or relabel checker-specific stages and metrics.
- [ ] Fix completed-job elapsed time and first-audio ETA wording.
- [ ] Rework buffer-risk wording for completed and single-segment playback.
- [ ] Improve mobile access to Help and Settings and run-config drawer scrolling.
- [ ] Profile Draft Preview latency under explicit mock and real providers.

## 2026-05-14 23:06 CEST - Demo media upload QA
- [x] Inspect demo media metadata.
- [x] Upload demo media through the source analysis UI.
- [x] Verify analysis progress, errors, and candidate preview behavior.
- [x] Capture screenshots and console/network observations.
- [x] Record follow-up fixes from the demo pass.
- [x] Fix queued source response/null candidate crash in the UI.
- [x] Contain source-analysis setup errors inside the left rail on desktop and mobile.
- [ ] Re-run candidate preview/profile creation with pyannote credentials configured.

## 2026-05-14 23:21 CEST - Demo voice clone fixture tuning
- [x] Create a repeatable demo-file voice profile through the compatibility path.
- [x] Verify bounded reference extraction metadata from the 10-minute MP4.
- [x] Run a cloned-voice synthesis job against the demo profile.
- [x] Compare pipeline telemetry and UI feedback for clone effectiveness.
- [x] Record tuning changes for source analysis and clone QA flow.
- [x] Cap cloned-profile segment workers to the available KokoClone reference worker pool.
- [ ] Add a first-class clone-provider health check before enabling cloned run actions.
- [ ] Add a reusable demo-fixture QA command for profile creation plus cloned synthesis.

## 2026-05-14 22:41 CEST - Fix KokoClone env path resolution
- [x] Validate KOKOCLONE_PYTHON_PATH-anchored venv creation path now resolves from repo root.
- [x] Confirm startup command for split-runtime fast flash-attn path.

## 2026-05-14 22:42 CEST - Fix clone dependency bootstrap import-time failure
- [x] Prevent `backend/scripts/kokoro_clone.py` from importing torch at module load during `--ensure-dependencies`.
- [x] Add lazy torch loading in clone device/import helper paths so ensure-dependencies can install missing runtime modules.

## 2026-05-14 22:43 CEST - Normalize KOKOCLONE_PYTHON_PATH and avoid backend/backend venv path
- [x] Normalize `KOKOCLONE_PYTHON_PATH` to absolute path to avoid cwd-relative duplication under backend.
- [x] Raise default `KOKOCLONE_PYTHON_VERSION` to 3.12 for `kanade-tokenizer` compatibility.

## 2026-05-14 23:23 CEST - Ensure default local-start bootstrap settings and reliable shutdown
- [x] Default `start:local` to fast flash bootstrap settings in `scripts/mise-start.sh`.
- [x] Align env example values for 3.12 and fast flash bootstrap defaults.
- [x] Improve signal/cleanup behavior so Ctrl+C terminates spawned backend/frontend services.

## 2026-05-14 23:39 CEST - Enable flash-attn-3 fallback by default for local start
- [x] Keep `flash-attn==2.8.3` primary and attempt `flash-attn-3==3.0.0` fallback when wheels are unavailable.
- [x] Add compatibility shim for `flash-attn-3` module re-exporting expected `flash_attn` symbols.
- [x] Update `.env.example` and `backend/.env.example` to expose `KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE=flash-attn-3`.

## 2026-05-14 23:45 CEST - Fix flash-attn-3 fallback index resolution
- [x] Use `https://download.pytorch.org/whl/flash-attn-3/` index when installing `flash-attn-3`.
- [x] Unpin fallback package to `flash-attn-3` so uv resolves index-provided wheel metadata.
- [x] Update local-start defaults and docs to match the corrected fallback package and index path.

## 2026-05-14 23:49 CEST - Improve frontend startup visibility for `mise start`
- [x] Add explicit frontend startup logs and readiness checks in `scripts/start.sh`.
- [x] Keep startup behavior unchanged unless actual service startup fails.

## 2026-05-14 23:55 CEST - Ensure frontend starts while backend warms up
- [x] Start frontend immediately after backend launch instead of waiting on backend port.
- [x] Extend service startup timeout to 120s for long backend model warmup periods.
- [x] Launch frontend via explicit `pnpm --filter @tts-research/frontend exec vite` to avoid workspace ambiguity.

## 2026-05-15 02:11 CEST - Voice clone quality and teleprompter highlight demo
- [x] Add configurable teleprompter highlight timing, persistence, and demo mode.
- [x] Add focused-word stroke/glow highlight styling with accessible reduced-motion behavior.
- [x] Add local denoise stage, raw/clean previews, and denoise metadata for source analysis.
- [x] Improve same-speaker reference span stitching metadata and warnings.
- [x] Add cloned-voice likeness metadata with pending/scored states.
- [x] Update frontend candidate/profile UI for raw-clean preview and likeness.
- [x] Add Kokoro voicepack catalog with human-readable names.
- [x] Add backend and frontend tests for the quality and highlight behavior.
- [x] Run project checks and capture QA notes.
