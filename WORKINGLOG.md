## 2026-05-27 23:40 CEST - Whole-App Follow-Along Sync Spine (Execution 202605272340)
- [ ] Define NarrationSyncSnapshot + provider integration API
- [ ] Add source-word global timeline normalization and fallback/degradation rules
- [ ] Migrate all follow-along renderers to consume activeSourceWordId only
- [ ] Add render-mounted registry and stale-active clear behavior
- [ ] Extend diagnostics overlay with sync reason/mount and identity fields
- [ ] Add/adjust unit + integration tests for canonical sync path and resets
- [ ] Run focused checks and summarize gaps

## 2026-05-28 11:02 CEST - Codebase Sanitization
- [x] Select next hotspot candidate `backend/internal/pipeline/profile_targets.go:extract target normalization helpers`.
- [x] Move shared target resolution helpers into `backend/internal/pipeline/profile_target_helpers.go`.
- [x] Leave orchestrator logic in `backend/internal/pipeline/profile_targets.go` unchanged.
- [x] Update refactor ledger and handoff metadata for candidate completion.
- [x] Run `pnpm check` and report remaining unrelated failures.
- [x] Commit focused refactor patch.

## 2026-05-28 12:01 CEST - Codebase Sanitization
- [x] Select highest-value oversized candidate not improved in this cycle.
- [x] Extract source profile orchestration helpers from `backend/internal/pipeline/profile_sources.go` into `backend/internal/pipeline/profile_source_helpers.go`.
- [x] Preserve orchestration behavior and public interfaces while reducing cognitive load in `profile_sources.go`.
- [x] Update ledger status for candidate completion and follow-up target.
- [x] Run `pnpm check` and capture unrelated failures.
- [x] Commit focused refactor patch.

# Working Log

This log is intentionally concise. It records branch-level progress and open follow-ups without
duplicating every implementation detail from commits, PR text, or generated review artifacts.

## 2026-05-28 10:02 CEST - Codebase Sanitization
- [x] Select next oversized candidate `backend/internal/pipeline/source_preps.go:extract source prep helpers`.
- [x] Move shared source-prep helper cluster into `backend/internal/pipeline/source_preps_text_helpers.go`.
- [x] Update `docs/refactor-sanitization-ledger.md` with candidate status.
- [x] Run `pnpm check` and capture unresolved pre-existing issues.
- [x] Commit focused refactor.

## 2026-05-28 08:02 CEST - Codebase Sanitization
- [x] Select next candidate `scripts/e2e-book-cinema.mjs:extract reusable e2e command helpers`.
- [x] Add `scripts/e2e-book-cinema-commands.mjs` to house command/API helper logic.
- [x] Replace in-script command helper implementations with destructured helper references.
- [x] Update rotation ledger with candidate state and next target.
- [x] Run `pnpm check` and capture remaining known failures.
- [x] Finish helper extraction polish by removing remaining dynamic `fs` imports.
- [ ] Resolve unrelated pre-existing lint/test failures noted during handoff checks.

## 2026-05-28 07:03 CEST - Codebase Sanitization
- [x] Select next candidate `scripts/e2e-ui-action-audit.mjs:extract provider profile/config helpers`
- [x] Extract reusable provider profile and audit constants into `scripts/e2e-ui-action-audit-config.mjs`
- [x] Remove extracted helper and constant block from `scripts/e2e-ui-action-audit.mjs`
- [x] Update rotation ledger for this candidate and run `pnpm check`
- [ ] Resolve remaining unrelated lint/check failures outside this refactor if they persist

## 2026-05-28 06:01 CEST - Codebase Sanitization
- [x] Select next candidate `backend/internal/pipeline/service.go:decompose generation orchestration functions`
- [x] Extract `CreateJob` preparation/normalization to `backend/internal/pipeline/service_create_job.go`
- [x] Rewire `CreateJob` to delegate to `prepareCreateJob` and launch job runner
- [x] Update sanitization ledger and working log for candidate completion
- [x] Run `pnpm check`
- [ ] Resolve pre-existing `pnpm check` failures in unrelated lint/test paths (`scripts/e2e-ui-actions-guard.mjs`, `scripts/validate-local/validate-local.mjs`, backend `TestCreateBookSourceFromURLUsesHTMLContentType`)

## 2026-05-28 05:02 CEST - Codebase Sanitization
- [x] Select next candidate `frontend/src/features/settings/SettingsPanel.tsx:extract section components and state helpers` from rotation ledger
- [x] Extract `settingsPanelHelpers.tsx` for settings command/selection helpers and shared section widgets
- [x] Rewire `SettingsPanel.tsx` to import shared helpers and remove local helper definitions
- [x] Update `WORKINGLOG.md` and sanitization ledger entries for this run
- [x] Run `pnpm check`
- [ ] Resolve unrelated pre-existing lint failures in unrelated script/runtime test paths before full green check

## 2026-05-28 02:02 CEST - Codebase Sanitization
- [x] Select next candidate from sanitization cycle with highest-value skipped item
- [x] Extract transport and playback helper cluster into `frontend/src/features/cinema/PreparedSourceCinemaTransport.tsx`
- [x] Wire overlay to extracted transport component
- [x] Remove moved transport-only helpers/icons from `PreparedSourceCinemaBase.tsx`
- [x] Update sanitization ledger entry to completed for transport/player split
- [x] Run `pnpm check`

## 2026-05-28 02:07 CEST - Codebase Sanitization
- [x] Clean final lint/type issues in `PreparedSourceCinemaTransport.tsx`
- [x] Re-run `pnpm format`
- [x] Re-run `pnpm check` and capture remaining failures outside refactor scope
- [ ] Address unrelated lint/test failures outside current candidate scope

## 2026-05-28 03:01 CEST - Codebase Sanitization
- [x] Select next oversize candidate `backend/internal/pipeline/service_test.go:extract fixture builders and assertion helpers`
- [x] Move shared test fixture and helper constructors/wait helpers into `backend/internal/pipeline/service_test_fixtures_test.go`
- [x] Update sanitization ledger status for this cycle candidate
- [x] Trim and preserve source file boundary to keep imports/APIs stable
- [x] Run `pnpm check` handoff validation
- [ ] Add follow-up candidate from cycle rotation in next pass

## 2026-05-28 01:03 CEST - Codebase Sanitization
- [x] Inspect sanitization ledger state and pick next untouched hotspot
- [x] Create reusable book-cinema import helper in feature-local module
- [x] Replace duplicated upload/import entrypoint logic with shared helper
- [x] Update sanitization ledger and refactor status
- [x] Run project handoff check (`pnpm check`)
- [x] Commit focused refactor patch

## 2026-05-28 01:13 CEST - Codebase Sanitization
- [x] Extract library upload-import flow into shared helper callpath
- [x] Stage `BookCinemaPanel.tsx` import + library import handler refactor only
- [x] Update ledger and working log entries to reflect completed run
- [x] Run project handoff validation and commit

## 2026-05-28 00:11 CEST - Codebase Sanitization
- [x] Inspect prior sanitization entries and oversized candidate set
- [x] Seed rotation ledger for the current cycle and candidate status
- [x] Extract reusable helper cluster from `frontend/src/App.tsx` into `frontend/src/appHelpers.ts`
- [x] Run `pnpm check` as handoff validation
- [x] Commit focused refactor (`00af50d`)

## 2026-05-27 23:16 CEST - Whole-App Follow-Along Sync Spine
- [ ] Define NarrationSyncSnapshot contract and shared provider API
- [ ] Normalize legacy and v2 highlight maps into global NarrationWordTimeline
- [ ] Migrate Book Cinema to snapshot-driven activeSourceWordId
- [ ] Migrate Document/Website Cinema to snapshot-driven activeSourceWordId
- [ ] Migrate Theatre/Teleprompt highlight paths to source-word identity
- [ ] Add render registry and non-stale active token behavior
- [ ] Add degraded-sync diagnostics overlay fields and controls
- [ ] Add regression coverage for timeline handoff and binary-search resolution
- [ ] Run targeted checks/tests and report blockers

## 2026-05-27 22:30 CEST - Mechanical Word Sync
- [x] Inspect current source/timing/render identity pipeline
- [x] Add canonical word timeline and ledger helpers
- [x] Drive Cinema highlighting from source word identity
- [x] Drive Theatre highlighting and crawl from source word identity
- [x] Add regression coverage
- [x] Run targeted and project checks
- [x] Validate rendered Cinema and Theatre playback

## 2026-05-27 21:29 CEST - Multi-Block Follow-Along Repair
- [x] Inspect current Cinema/Theatre timing identity pipeline
- [x] Normalize multi-block source word indexes
- [x] Stabilize Theatre crawl by active row
- [x] Add regression coverage
- [x] Run targeted and project checks

## 2026-05-27 20:50 CEST - Cinema Theatre Follow-Along Fix
- [x] Normalize Book Cinema timing indexes
- [x] Add Theatre word-follow rendering
- [x] Add Theatre cinematic crawl
- [x] Add regression coverage
- [x] Run targeted and project checks
- [x] Validate rendered follow-along views

## 2026-05-27 19:48 CEST - Book Cinema Structure Restoration
- [x] Preserve Book Cinema structure and punctuation
- [x] Improve Theatre cue hierarchy
- [x] Add focused regression coverage
- [x] Run targeted and project checks
- [x] Validate rendered reader/theatre views

## 2026-05-27 20:18 CEST - Book Cinema Density And Heading Polish
- [x] Improve Book Cinema page density and heading spacing
- [x] Add display-only intro heading splitting for flat sources
- [x] Classify obvious PDF text-layer headings
- [x] Improve Theatre combined cue hierarchy
- [x] Add regression coverage
- [x] Run targeted and project checks
- [x] Validate rendered reader and theatre views

## 2026-05-28 09:02 CEST - Codebase Sanitization
- [x] Extract `backend/internal/httpapi/router.go` `voice-jobs` route registrations into `backend/internal/httpapi/voice_job_routes.go`
- [x] Register extracted helper from `NewRouter`
- [x] Update sanitization ledger candidate status
- [x] Run `pnpm check`
- [ ] Pick the next oversized-file candidate for the next cycle

## 2026-05-27 14:06 CEST - Work Log and PR Refresh
- [x] Condense redundant historical checklist entries into a branch summary
- [x] Commit the log cleanup
- [x] Push the branch and update PR #3

## Active PR Summary - Voice Studio Follow-Up
- Branch: `niklas/voice-studio-follow-up`
- PR: `justinledwards/tts-research#3`
- Theme: local-first Voice Studio hardening across review evidence, Cinema, Teleprompt, read-along sync, provider capabilities, accessibility, and reviewer triage.
- Primary evidence roots: `output/review/latest`, `output/final-ux-gates/latest`, `output/golden-minute/latest`, `output/readalong-sync/latest`, and `output/ui-action-audit/latest`.

## Completed Work Packages
- [x] WP42 Clean Review Evidence Gate - dirty-tree review bundles now fail unless explicitly waived, and review manifests include git status evidence.
- [x] WP43 Final UX / UI Action Consistency - Final UX Gates now consume UI action audit status and surface waived or unresolved findings honestly.
- [x] WP44 UI Action Activation Fixes - Project Dashboard, generated audit entries, and Teleprompt previous-cue replay no longer silently no-op.
- [x] WP45 Stable Test IDs - core controls and generated controls now report deterministic stable ID coverage.
- [x] WP46 Duplicate Action Burn-down - duplicate action groups are classified, waived with owners, or marked for consolidation.
- [x] WP47 Golden-Minute Fixture - added the canonical one-minute read-along flow, fixture, expected speech plan, timing, report, and command.
- [x] WP48 Speech Fluency Rubric - added local seam, pause, clipping, duration, and fluency diagnostics.
- [x] WP49 Read-along Preferences - added ergonomic highlight, scroll, sync, calibration, boundary, degraded-sync, and persistence controls.
- [x] WP50 Runtime Follow-along Debug Overlay - added sync snapshot, copy/export, and manual QA marker support.
- [x] WP51 Golden-Minute Visual Timeline - added optional trace/video capture, sampled screenshots, timelines, and visual continuity report.
- [x] WP52 Low-Resource Waiver Burn-down - added distribution metrics, warm/first-run split, waiver owners, and low-resource breakdown reporting.
- [x] WP53 Live Region Accessibility - added shared polite/assertive live status infrastructure and async announcement coverage.
- [x] WP54 Touch Target Burn-down - added minimum interactive size token and touch-target hit-area validation.
- [x] WP55 Teleprompt Theatre Ergonomics - added Theatre settings, presets, key bindings, preview, and persistence behavior.
- [x] WP56 Cinema Theatre Mode - added immersive Book/Document/Website Cinema Theatre mode with shared focus/fullscreen behavior.
- [x] WP57 Cinema More Menu Quality - added IA sections, budgets, disabled reasons, shortcut hints, and redundancy checks.
- [x] WP58 Provider Capability Gating - added provider profiles and exercised limited-provider UI/action behavior.
- [x] WP59 Golden-Minute Provider Matrix - added word, phrase, forced-alignment, heuristic, and stale-provider timing matrix evidence.
- [x] WP60 Segment Boundary Stress Test - added boundary-specific handoff assertions and mismatch reporting.
- [x] WP61 Artifact Version Compatibility - added source/speech-plan/audio/highlight/alignment identity checks and stale labels.
- [x] WP62 Human QA Script - added `docs/qa/golden-minute-human-review.md` and reporting template for non-developer review.
- [x] WP63 Review Artifact Triage - added severity-sorted `triage.md` and merge-readiness dashboard generation.
- [x] WP64 Ergonomic Use-Case Presets - added transparent, reversible defaults for common reading and presenting workflows.
- [x] WP65 Command Palette / More Cross-Audit - added cross-surface action matrix and parity gates.
- [x] WP66 Speech Policy Golden-Minute Preview - added policy preview and A/B comparison using the golden-minute sample.
- [x] WP67 Manual Drift Repair Workflow - manual QA drift markers now become local repair candidates with reversible repair actions.

## Earlier Branch Foundation
- [x] Cinema, Teleprompt, command palette, settings, source lifecycle, playback ownership, context panel, UI memory, accessibility, responsive, privacy, performance, and validation infrastructure were built earlier in the branch.
- [x] Read-along alignment foundations include HighlightMap v2, audio/text alignment, drift detection, Teleprompt cue timeline sync, shared highlight rendering, sync benchmarks, and alignment repair tooling.
- [x] Local review infrastructure includes validate lanes, review bundle generation, final UX gates, surface complexity budgets, screenshot integrity checks, UI action inventory, and dead-control/duplicate-control evidence.

## Open Follow-Ups
- [ ] Run the WP62 manual golden-minute QA script with a human reviewer and attach findings if any.
- [ ] Regenerate a clean final review bundle from a clean checkout after the PR branch is pushed.
- [ ] Keep the existing local `.gitignore` modification out of this PR unless explicitly accepted.

## 2026-05-27 23:20 CEST - Whole-App Follow-Along Sync Spine
- [ ] implement canonical NarrationSyncProvider contract
- [ ] migrate timeline normalization and legacy/v2 mapping
- [ ] wire Book Cinema to canonical activeSourceWordId
- [ ] wire Book Document reader to canonical activeSourceWordId
- [ ] wire Teleprompt Theatre/Studio to canonical activeSourceWordId
- [ ] add render registry + not-visible/clear stale behavior
- [ ] upgrade sync debug overlay fields
- [ ] update tests for canonical sync path and regression coverage

## 2026-05-27 23:24 CEST - Whole-App Follow-Along Sync Spine
- [ ] add shared readalong SyncSnapshot contract and provider
- [ ] normalize legacy/highlight-map inputs into global NarrationWordTimeline
- [ ] migrate Book Cinema / Document Cinema follow-along consumers to activeSourceWordId
- [ ] migrate Theatre/Teleprompt follow-along consumers to activeSourceWordId
- [ ] add mounted token render registry and stale-word clear behavior
- [ ] update sync diagnostics overlay with canonical and degraded state
- [ ] add focused tests for tokenIndex reset and binary-search resolution

## 2026-05-27 23:29 CEST - Follow-Along Sync Spine Handoff
- [x] capture inspected sync-spine context
- [x] document current implementation state and gaps
- [x] outline next safe implementation steps

## 2026-05-27 23:34 CEST - Whole-App Follow-Along Sync Spine
- [ ] Review handoff and current implementation for follow-along identity handling
- [ ] Define shared SyncSnapshot and NarrationSyncProvider in readalong layer
- [ ] Implement global NarrationWordTimeline normalization with legacy/legacy fallback
- [ ] Refactor Book Cinema, Theatre, Teleprompt, and related follow-along surfaces to consume activeSourceWordId
- [ ] Add render registry keyed by sourceWordId for mount/visibility signaling
- [ ] Add sync diagnostics overlay and degraded-sync state handling
- [ ] Add/update tests for timeline normalization, binary search resolution, and non-stale highlighting

## 2026-05-27 21:51 UTC - Whole-App Follow-Along Sync Spine
- [ ] wire shared readalong sync snapshot contract
- [ ] implement timeline normalizer and resolver
- [ ] add sync diagnostics fields and overlay
- [ ] migrate Book Cinema to activeSourceWordId
- [ ] migrate Prepared Source/Cinema renderer to activeSourceWordId
- [ ] migrate Teleprompt/Theatre crawl to source-word identity

## 2026-05-27 23:54 CEST - Whole-App Follow-Along Sync Spine
- [ ] define shared narration sync contract and provider wiring
- [ ] migrate readalong highlighting to activeSourceWordId
- [ ] migrate cinema/book/teleprompt surfaces to registry + crawl-by-row
- [ ] add sync diagnostics overlay fields and stale-clear behavior

## 2026-05-27 23:55 CEST - Whole-App Follow-Along Sync Spine
- [ ] Add sync contract and provider for canonical source-word identity playback state
- [ ] Implement global NarrationWordTimeline normalization with degraded fallback handling
- [ ] Update read-along runtime resolver to binary-search + fail-closed stale handling
- [ ] Migrate BookCinema/PreparedSourceCinema/Teleprompt/Markdown renderer to sourceWordId rendering and consumption
- [ ] Add render registry + crawl/scroll by data-source-word-id and stale visibility handling
- [ ] Expand SyncDebugOverlay with active source word, token, segment/block, provenance, confidence, mount state
- [ ] Add regression tests for batch handoffs, timeline resets, seek/pause/rate binary-search behavior
- [ ] Verify and document remaining follow-along surfaces using sourceWordId only

## 2026-05-27 23:58 CEST - Whole-App Follow-Along Sync Spine (Phase 1)
- [ ] Define shared NarrationSync contract and provider
- [ ] Normalize timeline resolution to source-word-first snapshots
- [ ] Migrate ReadAlong runtime consumers to activeSourceWordId
- [ ] Convert Book/PreparedSource/Markdown surfaces away from activeWordIndex
- [ ] Add fail-closed degradation diagnostics
## 2026-05-28 00:02 CEST - Whole-App Follow-Along Sync Spine
- [ ] design NarrationSyncSnapshot contract and provider implementation in readalong feature
- [ ] normalize highlight-map inputs into global narration word timeline with source-word canonical identity
- [ ] migrate Book Cinema, Prepared Source Cinema, Theatre, and Teleprompt to consume shared activeSourceWordId
- [ ] replace index-based active resolution in Markdown/Document renderers with source-word based highlighting
- [ ] add render registry and degrade-aware diagnostics fields
- [ ] add focused lint/test/gate coverage scaffolding for sync contract and boundary regression
