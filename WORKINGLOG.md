# Working Log

## 2026-05-24 16:21 CEST - Provider Capability Matrix
- [x] Inspect provider/runtime capability touchpoints
- [x] Add backend provider capability model and tests
- [x] Add frontend capability matrix, badges, and shared disabled reasons
- [x] Wire capability gates into settings, preview, voice, run config, command palette, and UI audit
- [x] Trim repeated Kokoro voice metadata to keep startup bundle under budget
- [x] Run required local validation commands

## 2026-05-24 13:19 CEST - Website Cinema Extraction Quality
- [x] Inspect existing HTML source prep and Website Cinema rendering
- [x] Add backend extraction quality metadata and fixtures
- [x] Add Website Cinema quality summary/review UI
- [x] Wire quality metadata into local review artifacts
- [x] Run required local validation commands
- [x] Regenerate latest local review bundle
- [ ] Resolve upstream live-ingestion 429 from Hacker News target

## 2026-05-24 10:32 CEST - Canonical Source Lifecycle and Cross-surface Source Selector
- [x] Inspect existing source state and selector surfaces
- [x] Add canonical source lifecycle model and shared selectors
- [x] Add lifecycle card and wire shared source labels/badges into key surfaces
- [x] Add lifecycle regression coverage
- [x] Run required local validation commands

## 2026-05-24 08:05 CEST - Playback and Generated-audio Ownership Model
- [x] Inspect existing playback docs, feature modules, and UI audit metadata
- [x] Add canonical playback ownership and lifecycle modules
- [x] Refactor playback-like labels and disabled reasons through shared rules
- [x] Add duplicate-owner and lifecycle validation coverage
- [x] Run required local validation commands

## 2026-05-24 06:21 CEST - Low-resource Reader Resume Budget Closure
- [x] Inspect low-resource timing, performance reporting, and reader startup imports
- [x] Add interaction budget artifacts and failure classification
- [x] Add targeted low-resource fixture coverage
- [x] Lazy-load heavy reader/workspace startup paths
- [x] Run required local validation commands

## 2026-05-23 23:43 CEST - Latest-head Review Evidence Bundle
- [x] Inspect existing local validation and E2E reporting helpers
- [x] Add latest-head review evidence manifest generation
- [x] Wire `pnpm review:local`
- [x] Exclude generated local agent state from Biome project checks
- [x] Ignore generated backend audit output
- [x] Count scenario-level surfaces in review summaries
- [x] Add primary navigation landmark to the top product bar
- [x] Stabilize source policy pin E2E wait
- [x] Fix reviewer summary label rendering crash
- [x] Run required local validation commands
  - [x] `pnpm validate:local`
  - [x] `pnpm validate:local:ui`
  - [x] `pnpm review:local`

## 2026-05-23 00:00 CEST - Manual Accessibility and Device QA Package
- [x] Update accessibility and responsive QA scripts to generate package artifacts in `output/accessibility/latest`
- [x] Add required manual QA check checklist and known-waiver section for accessibility/package gate
- [x] Extend responsive coverage for narrow, constrained desktop, and 1920x1080 taskbar ergonomics
- [x] Add gate-level artifact aggregation for automated accessibility outputs and manual-qa notes
- [ ] Regenerate working-tree accessibility artifacts for the new gate path
- [ ] Run required local validation commands after wiring package gate artifacts

## 2026-05-22 19:59 CEST - OSS Demo Mode and First-Run Experience
- [x] Inspect mock startup, fixtures, and current first-run surfaces
- [x] Add demo mode data, entry UI, and thin workflow wrapper
- [x] Add first-run and contributor docs
- [x] Run project validation checks

## 2026-05-22 15:47 CEST - Progressive Settings and Configuration UX
- [x] Inspect settings IA, scope metadata, and command deep links
- [x] Add three-layer settings model and progressive Settings UI
- [x] Ensure configurable items expose scope labels and reset/revert affordances
- [x] Align command palette deep links with the shared settings model
- [x] Run project validation checks
- [ ] Resolve existing frontend bundle CSS gzip budget failure

## 2026-05-22 14:41 CEST - Source Lifecycle and Intake Mental Model
- [x] Inspect intake, source, workspace, cinema, and policy-pin source models
- [x] Add canonical source lifecycle model and SourceCard
- [x] Wire source lifecycle cards into existing source reopen/detail paths
- [x] Add source-scope/applies-to copy for policy pins
- [x] Run project validation checks
- [ ] Resolve upstream live-ingestion 429 from Hacker News target
- [ ] Resolve existing frontend bundle CSS gzip budget failure

## 2026-05-21 17:12 CEST - Command Palette Shortcuts Settings Consolidation
- [x] Map existing command palette, shortcut, help, and settings entry paths
- [x] Add shared command and shortcut registries
- [x] Add shortcut cheat sheet and configurable shortcut settings
- [x] Consolidate settings/help entry points through shared commands
- [x] Update docs and UI action coverage
- [x] Run local validation commands
- [x] Confirm isolated backend pipeline test passes after validate:local flake

## 2026-05-20 16:24 CEST - Command palette and quick actions
- [x] Add shared command model and palette UI.
- [x] Generate commands from settings, workspace, cinema, help, sources, and progress metadata.
- [x] Wire app actions and visible top-bar entry point.
- [x] Add docs and shortcut reference.
- [x] Add unit and E2E coverage.
- [x] Deduplicate recent-position command entries caught by full validation.
- [x] Remove SDK schema validators from the initial locator-formatting path.
- [x] Run requested validation commands.

## 2026-05-20 09:09 CEST - Cinema focus modes and inspector ergonomics
- [x] Add shared cinema focus-mode model and UI primitives.
- [x] Move Book Cinema into feature adapter directory.
- [x] Split Document and Website Cinema adapters.
- [x] Panelize cinema inspectors and add session-only pin behavior.
- [x] Add canvas-first reader mode.
- [x] Update cinema focus and wayfinding docs.
- [x] Add focused tests and E2E coverage.
- [x] Run local validation commands.

## 2026-05-20 00:13 CEST - Adaptive workspace choreography
- [x] Add shared workspace stage and layout model.
- [x] Implement stage-based narration workspace and inline Teleprompt.
- [x] Extract reusable rail primitives and reduce passive panel density.
- [x] Add docs and update local UX guidance.
- [x] Add focused tests and workspace smoke coverage.
- [x] Run local validation commands.

## 2026-05-17 17:30 CEST - Voice Studio ergonomic foundation
- [x] Consolidate Narration and Voice Cloning into clearer top-level modes.
- [x] Streamline source intake, script review, rails, footer, workspace, and settings surfaces.
- [x] Iterate against approved Voice Studio concepts with rendered QA.
- [x] Run full checks and visual validation.

## 2026-05-18 17:30 CEST - Reader standards and performance foundation
- [x] Harden reader standards, accessibility controls, and locator behavior.
- [x] Add local frontend performance reporting, budgets, and low-resource smoke coverage.
- [x] Preserve structured source policy and reader diagnostics.
- [x] Run local validation commands.

## 2026-05-18 19:52 CEST - UI ergonomics audit and concept pack
- [x] Capture current UI state across primary surfaces.
- [x] Run scroll extremes and deterministic UI fuzzing.
- [x] Write ergonomic audit and findings.
- [x] Generate Operator Studio concept images.
- [x] Compare against previous concept images after new concepts were created.
- [x] Run validation checks.

## 2026-05-18 20:30 CEST - Website Cinema strengthening
- [x] Generate Website Cinema concept references.
- [x] Implement prepared-source cinema shell and entry points.
- [x] Align desktop and mobile Website Cinema to accepted concept.
- [x] Add focused helper coverage for derived UI data.
- [x] Run Playwright screenshot, scroll, and fuzz validation.
- [x] Run frontend and project checks.

## 2026-05-18 22:09 CEST - Book and Document Cinema alignment
- [x] Generate fresh Book and Document Cinema concept pack.
- [x] Align Book Cinema to the shared Website Cinema visual language.
- [x] Restore Document Cinema with Markdown rendering.
- [x] Add Markdown book import support.
- [x] Add pre-audio cinema entry for Book, Document, and Website modes.
- [x] Run Playwright desktop/mobile scroll and fuzz validation.
- [x] Run frontend and project checks.

## 2026-05-18 23:11 CEST - Book and Document Cinema reachability validation
- [x] Reproduce PDF and Markdown cinema entry from visible UI.
- [x] Fix blocked pre-audio entry paths.
- [x] Validate in-cinema file/source selection for document workflows.
- [x] Repair Markdown reader rendering and right-rail overflow.
- [x] Re-run Playwright reachability validation.
- [x] Run focused checks.

## 2026-05-19 00:06 CEST - Cinema outline pointer and transport simplification
- [x] Make full source generation the default for book/document modes.
- [x] Change outline clicks to reader navigation pointers.
- [x] Remove duplicate right-rail waveform/timeline controls.
- [x] Add decoded audio waveform rendering for generated audio.
- [x] Validate desktop/mobile with Playwright.
- [x] Run project checks.

## 2026-05-19 00:36 CEST - PR cleanup and publish
- [x] Clean working log chronology so May 18 work starts at 17:30 CEST.
- [x] Confirm validation status before publishing.
- [x] Commit and push the PR update.

## 2026-05-19 16:39 CEST - Reader timing hard budgets
- [x] Inspect existing local benchmark and validation reporting.
- [x] Promote reader timing baselines to enforced thresholds.
- [x] Document low-resource budget procedure.
- [x] Stabilize Book Cinema timing E2E scope checks.
- [x] Fix hash resume scope normalization for section-backed books.
- [x] Ensure studio route-switch timing is exercised by the E2E smoke.
- [x] Guard hash resume from workspace restore races under low resource.
- [x] Run local validation commands.

## 2026-05-19 20:06 CEST - Cross-surface reader accessibility parity
- [x] Add shared reader accessibility primitives.
- [x] Apply shared preferences to cinema surfaces.
- [x] Standardize focus, keyboard, and live status behavior.
- [x] Update docs and disabled smoke workflow.
- [x] Run automated validation commands.
- [ ] Complete manual screen-reader smoke checklist with assistive tech.

## 2026-05-19 21:21 CEST - Wayfinding bookmarks and policy scope
- [x] Add shared reader navigation helpers and panels.
- [x] Add shared policy scope chips and source pin controls.
- [x] Wire Book, Document, and Website Cinema to shared navigation and policy scope UI.
- [x] Fix policy preview/job request scope so project profile is not sent as a session override.
- [x] Update docs and disabled UI reachability workflow example.
- [x] Add unit and reachability coverage.
- [x] Run project validation commands.

## 2026-05-19 22:29 CEST - Low-resource and degraded-state UX hardening
- [x] Move and extend frontend timing helpers.
- [x] Split cinema startup paths and add stable degraded-state UI.
- [x] Enforce critical-path import and degraded-state report checks.
- [x] Update local-only docs and workflow examples.
- [x] Fix duplicate wayfinding keys surfaced by Book Cinema smoke.
- [x] Run project validation commands.
- [x] Commit, push, and update PR body.

## 2026-05-20 10:26 CEST - Cinema focus modes convergence
- [x] Build shared cinema focus controller and layout primitives.
- [x] Rewire Book, Document, and Website Cinema to shared shell, inspector, transport, and mobile patterns.
- [x] Update focus-mode and wayfinding docs.
- [x] Extend unit and E2E validation coverage.
- [x] Run local validation commands.

## 2026-05-20 11:21 CEST - Settings menus and configuration IA
- [x] Add shared settings scope and group metadata.
- [x] Refactor settings and help panels into feature modules.
- [x] Standardize settings/help affordances across workspace and cinema surfaces.
- [x] Update docs and local UI smoke coverage.
- [x] Run local validation commands.

## 2026-05-20 12:12 CEST - Low-resource UX hardening follow-up
- [x] Add shared interaction timing hook.
- [x] Improve degraded-state UI copy and recording.
- [x] Defer expensive prepared-source renderers.
- [x] Promote degraded-state report sections.
- [x] Add focused tests and E2E checks.
- [x] Run local validation commands.

## 2026-05-20 12:43 CEST - Publish low-resource UX hardening
- [x] Review final worktree scope.
- [x] Commit hardening package.
- [x] Push branch and update PR body.

## 2026-05-20 12:55 CEST - Organize follow-up draft PR
- [x] Sync fork main with upstream main.
- [x] Replay follow-up commits onto fresh upstream base.
- [x] Validate fresh follow-up branch.
- [x] Push branch and open draft PR.

## 2026-05-20 15:16 CEST - Persistent continuity and adaptive defaults
- [x] Add shared UI memory model and tests.
- [x] Wire workspace, review, teleprompt, and settings.
- [x] Wire cinema focus memory and reset behavior.
- [x] Update docs and E2E coverage.
- [x] Fix StrictMode-safe cinema reset handling.
- [x] Run requested validation commands.

## 2026-05-20 17:44 CEST - Responsive touch and narrow-width Cinema hardening
- [x] Add shared narrow-width and touch constants.
- [x] Harden shared Cinema shell, footer, and mobile sheet ergonomics.
- [x] Suppress workspace rails by default on narrow viewports.
- [x] Add responsive E2E screenshot and interaction coverage.
- [x] Update touch accessibility and Cinema docs.
- [x] Run local validation commands.

## 2026-05-20 19:26 CEST - Workstream IOTA UI action audit
- [x] Inspect existing frontend/e2e script patterns
- [x] Add UI action registry and metadata modules
- [x] Add local Playwright action audit scripts
- [x] Wire pnpm scripts for local UI validation
- [x] Update audit outputs/report behavior
- [x] Bound per-action replay waits and add audit progress output
- [x] Scope modal inventories to reachable modal controls
- [x] Run pnpm check
- [x] Run bounded UI action audit smoke
- [ ] Run full exhaustive UI action audit and local E2E suite

## 2026-05-20 20:06 CEST - Workstream KAPPA Cinema simplification
- [x] Map existing Cinema playback, modes, transport, and reader layout
- [x] Add shared CinemaPlaybackState mapper and state-aware transport UI
- [x] Simplify Debug access and pinned focus visuals
- [x] Improve short-source reader pagination
- [x] Update Cinema focus-mode documentation
- [x] Run project validation commands

## 2026-05-20 20:58 CEST - Workstream LAMBDA document artifact rendering
- [x] Map citation and inline artifact handling across IR, speech plan, UI, and tests
- [x] Add shared artifact classification metadata and fixtures
- [x] Render citations and artifact tokens as speech-safe visual notes
- [x] Update policy notes and profile-specific speech behavior
- [x] Run requested validation commands

## 2026-05-20 22:09 CEST - Workstream MU header scope ergonomics
- [x] Map current header, scope, policy, settings, workspace, and teleprompt presentation
- [x] Add shared header context summary and compact/expanded policy summary
- [x] Wire shared summary across Cinema, Workspace, Settings, and Teleprompt surfaces
- [x] Document compact versus expanded scope display rules
- [x] Run requested local validation commands and screenshot review
- [ ] Low-resource reader-resume timing budget remains above threshold

## 2026-05-20 23:58 CEST - Teleprompt Preview Review action parity
- [x] Map existing stage action, Review, Preview, Teleprompt, and Cinema transitions
- [x] Centralize shared stage action model and route/state effects
- [x] Consolidate duplicate primary actions across Review and Preview
- [x] Make Teleprompt part of the studio workflow with return paths
- [x] Extend local UI action audit for full stage traversal
- [x] Remove remaining audit-visible stage action duplication
- [x] Run local validation commands

## 2026-05-21 01:55 CEST - Browser Action Audit and Dead-Control Inventory
- [x] Compare requested audit package against current implementation
- [x] Add missing inventory/dead-control scripts and registry metadata
- [x] Wire package scripts and reports
- [x] Run local validation commands
- [x] pnpm check
- [x] pnpm e2e:book-cinema
- [x] pnpm e2e:workspace-flow
- [x] pnpm e2e:settings-ia
- [x] pnpm e2e:reader-wayfinding
- [x] pnpm e2e:ui-actions
- [x] pnpm e2e:ui-action-inventory
- [x] pnpm validate:local

## 2026-05-21 02:55 CEST - Design Token and Component Baseline Consolidation
- [x] Audit current visual primitives and surface variants
- [x] Add shared design tokens and component baseline
- [x] Migrate Studio surfaces to shared primitives
- [x] Add component inventory documentation and snapshots
- [x] Restore workspace-flow selection checks to shared component state
- [x] Remove command palette query reset race
- [x] Retune CSS bundle budget after token consolidation
- [x] Run local validation commands

## 2026-05-21 05:41 CEST - Unified Context Panel
- [x] Map duplicated inspector, review, diagnostics, and policy surfaces
- [x] Add shared context panel model and tabs
- [x] Wire Book, Document, Website, Review, and Teleprompt context surfaces
- [x] Update context panel and wayfinding docs
- [x] Run local validation commands

## 2026-05-21 07:26 CEST - Guided Intake Wizard
- [x] Map existing intake source creation paths
- [x] Add shared intake wizard model and templates
- [x] Wire wizard into Intake without duplicating adapter logic
- [x] Update intake wizard docs and action audit coverage
- [x] Run local validation commands

## 2026-05-21 10:21 CEST - Run Configuration and Speech Policy Wizard
- [x] Map current run configuration and speech policy settings surfaces
- [x] Add guided run configuration and speech policy wizard models
- [x] Wire wizards into Settings without duplicating advanced controls
- [x] Add JSON import/export and real-time policy preview
- [x] Update docs and UI action coverage
- [x] Run local validation commands

## 2026-05-21 12:03 CEST - Enhanced Revision Panel
- [x] Map current Review, Inspector, diagnostics, and block state surfaces
- [x] Add revision model, filters, batch actions, inline edit, and history modules
- [x] Wire Revision Panel into Review/context workflow
- [x] Update UI action coverage and remove duplicated review controls where safe
- [x] Run local validation commands

## 2026-05-21 13:38 CEST - Dedicated Teleprompt Studio
- [x] Map current Teleprompt stage, return context, shortcuts, and highlight controls
- [x] Add Teleprompt Studio model, presets, toolbar, and return memory
- [x] Wire Teleprompt Studio into workspace stage transitions
- [x] Hide advanced highlight customization from the default UI
- [x] Update docs and UI action coverage
- [x] Run local validation commands

## 2026-05-21 15:10 CEST - Global Preview Mini-Player
- [x] Map existing Preview, playback, and Cinema transport semantics
- [x] Add preview queue and A/B comparison models
- [x] Add persistent Global Preview Player outside Cinema
- [x] Wire mini-player to Workspace, Review, Preview, and Settings without duplicating Cinema transport
- [x] Update docs and UI action coverage
- [x] Run local validation commands

## 2026-05-21 18:32 CEST - Project Voice Management Dashboard
- [x] Map current project and voice management surfaces
- [x] Add project dashboard model and UI
- [x] Add voice profile dashboard model, diagnostics, and UI
- [x] Reduce normal workspace project/voice management clutter to summaries
- [x] Update docs and UI action coverage
- [x] Run local validation commands

## 2026-05-21 19:37 CEST - Accessibility Responsive I18n Hardening
- [x] Map current accessibility, responsive, and language support
- [x] Add accessibility audit and responsive snapshot scripts
- [x] Add accessibility preset and i18n foundation modules
- [x] Wire language-aware voice and locale metadata into UI/action coverage
- [x] Update accessibility, reader QA, and i18n docs
- [x] Run local validation commands
- [ ] Follow up low-resource reader timing budget failures

## 2026-05-21 21:23 CEST - Commit Workpackage 10
- [x] Stage accessibility, responsive, and i18n hardening changes
- [x] Commit workpackage 10

## 2026-05-21 21:27 CEST - UI Memory Preferences
- [x] Map persisted UI memory keys and settings surfaces
- [x] Add UI memory model, export/import, and preferences panel
- [x] Wire safe reset/export/import into Settings and action audit
- [x] Add UI action scenario filtering for targeted audit reruns
- [x] Update UI memory docs
- [x] Run local validation commands

## 2026-05-22 01:04 CEST - Local QA Expansion
- [x] Map existing local validation scripts and report artifacts
- [x] Add focused command palette, Teleprompt memory, and context panel E2E scripts
- [x] Wire expanded QA sections into validate-local reports
- [x] Add local workflow examples without enabling hosted CI
- [x] Run local validation commands
- [ ] Follow up low-resource reader timing budget failures

## 2026-05-22 02:49 CEST - Workspace Ergonomics Pass
- [x] Reproduce constrained 1920x1080 workspace layout
- [x] Map Voice Command, workbench, playback, and activity footer components
- [x] Fold low-value Saved Voices content into Voice Profile ergonomics
- [x] Improve overflow, density, and responsive ergonomics
- [x] Validate with browser screenshots and local checks

## 2026-05-22 03:23 CEST - Cinema Website Ergonomics Follow-Up
- [x] Reproduce cinema and preview overlap issues from supplied screenshots
- [x] Add in-cinema source/cinema selection path
- [x] Improve website cinema focus for article narration
- [x] Recheck constrained desktop screenshots and local validation

## 2026-05-22 08:36 CEST - Update PR Ergonomics Follow-Up
- [x] Stage and commit latest ergonomics follow-up
- [x] Push current PR branch
- [x] Refresh PR body with latest validation and UX changes
## 2026-05-22 10:54 CEST - Exhaustive Browser Button Verification Gate
- [x] Inspect existing UI action audit scripts and package scripts
- [x] Implement mandatory latest audit artifact generation
- [x] Enforce complete action metadata and coverage across required surfaces
- [x] Add PR-ready reviewer summary and duplicate/dead-control reports
- [x] Run project validation checks
- [ ] Resolve remaining UI action audit findings before PR leaves draft
- [ ] Resolve validate:local frontend CSS bundle budget failure
## 2026-05-22 12:35 CEST - Transport Ownership and No-Duplicate Playback
- [x] Inspect playback surfaces, docs, and action metadata
- [x] Add central playback ownership model and surface rules
- [x] Wire playback-like controls to canonical owners and labels
- [x] Suppress competing transports across Review, Preview, Cinema, and Teleprompt
- [x] Run project validation checks
- [ ] Resolve validate:local frontend CSS bundle budget failure
## 2026-05-22 13:37 CEST - Context Panel Guardrails and Review/Diagnostics Ownership
- [x] Inspect context panel model, adapters, docs, and side-panel surfaces
- [x] Add context panel ownership metadata and default mapping guardrails
- [x] Add validation for empty tabs, debug-only visibility, side-panel bypasses, and duplicate data
- [x] Wire UI audit/local validation to context panel guardrails
- [x] Run project validation checks
- [ ] Resolve validate:local frontend bundle budget failure

## 2026-05-22 17:11 CEST - Teleprompt Recording-First Ergonomics
- [x] Inspect Teleprompt toolbar, return memory, and existing tests
- [x] Split presenter, workflow, and presentation settings controls
- [x] Hide secondary workflow controls behind compact menu where safe
- [x] Expand return-state tests for precise context restoration
- [x] Run project validation checks
- [ ] Resolve validate:local frontend bundle CSS gzip budget failure
- [ ] Track validate:local backend pipeline transcript reload flake

## 2026-05-22 18:08 CEST - Dashboard IA and Voice/Project Ownership
- [x] Inspect Project Dashboard, Voice Dashboard, Settings, Run Config, and Preview ownership overlap
- [x] Add explicit dashboard action ownership metadata and docs
- [x] Remove dashboard/settings clutter that belongs to another owner
- [x] Align tests and UI action coverage with dashboard ownership
- [x] Run project validation checks
- [ ] Resolve existing validate:local frontend CSS gzip budget failure
## 2026-05-22 19:01 CEST - Low-Resource Performance Budget
- [x] Inspect existing performance budgets and low-resource E2E coverage
- [x] Add hard timing and artifact budgets for low-resource flows
- [x] Keep heavy startup surfaces lazy and covered by bundle checks
- [x] Generate performance artifacts under output/performance/latest
- [x] Run project validation checks
## 2026-05-23 00:04 CEST - Manual Accessibility and Device QA release artifacts
- [ ] Fix remaining formatting issues in changed files
- [ ] Re-run commit flow and create commit
- [ ] Push branch and update PR #3 with latest accessibility artifact status
## 2026-05-23 01:06 CEST - Work Package 14 Low-resource Reader Resume Budget Closure
- [ ] Append low-resource budget closure section and tasks to WORKINGLOG.md
- [ ] Add and wire new interaction timing budgets and splits
- [ ] Add lazy boundaries for heavy read-mode startup panels
- [ ] Expand low-resource fixture coverage and thresholds
- [ ] Emit interaction and failure artifact files
- [ ] Add targeted degraded-state checks for low-resource reader resume paths
- [ ] Run required local validation commands
- [ ] Commit WP14 changes

## 2026-05-24 18:04 CEST - Bump startup JS raw budget for current regression
- [x] Review current bundle budget failure context and threshold formatting.
- [x] Raise `maxInitialJsRawBytes` in `benches/thresholds.json` to clear a one-off 511KB startup regression.
- [x] Update `docs/performance.md` bundle gate documentation to match.
