# Working Log

## 2026-05-18 13:03 CEST - Workstream Kappa local validation authority
- [x] Add local validation and benchmark orchestration
- [x] Add benchmark fixture manifests, thresholds, and corpus notes
- [x] Make Book Cinema E2E self-contained with clean fixtures
- [x] Add disabled GitHub Actions templates
- [x] Document local validation and benchmark commands
- [x] Run project checks

## 2026-05-18 12:37 CEST - Workstream IOTA first public v1
- [x] Collapse public Content IR contract to v1
- [x] Centralize locator envelope and Readium bridge behavior
- [x] Regenerate schema bundles, snapshots, fixtures, and frontend types
- [x] Update public contract documentation and compatibility notes
- [x] Run contract, frontend, and backend validation

## 2026-05-18 02:43 CEST - Voice Studio PR update
- [x] Clean working log scope for the PR update.
- [x] Confirm project checks and rendered QA status.
- [x] Fix cancellation worker-settle race found by the commit hook.
- [x] Commit, push, and update PR body.

## 2026-05-17 18:45 CEST - Fix theme orchestration and add papery
- [x] Align ThemeName with expanded theme registry and add papery metadata.
- [x] Add papery CSS variable block and complete per-theme variable coverage.
- [x] Remove Book Cinema hardcoded theme list in favor of VOICE_STUDIO_THEMES.
- [x] Use theme-aware select option styling and validate contrast behavior.
- [x] Update theme tests for expanded ordered theme list and list-backed selectors.

## 2026-05-17 18:16 CEST - HF token validation retry fix
- [x] Trace token status versus validation retry path.
- [x] Fix backend/frontend re-validation so saved HF token is used.
- [x] Add regression coverage for token-backed re-validation.
- [x] Fix profile-analysis missing dependency setup guidance.
- [x] Detect saved local Hugging Face token during startup dependency bootstrap.
- [x] Validate checks and commit/amend as appropriate.

## 2026-05-17 17:38 CEST - HF token prompt and Kokoro render mode polish
- [x] Add local Hugging Face token credential status/save/clear APIs.
- [x] Use active token for voice profile likeness validation retries.
- [x] Replace flat Kokoro engine selection with ergonomic render mode choices.
- [x] Clean recent voice-profile/embed working log entries before amend.
- [x] Validate checks and rendered selector flow, then amend commit.

## 2026-05-17 17:07 CEST - Embed setup polish and profile loading fix
- [x] Stabilize profile creation polling so “Loading profiles...” does not flicker.
- [x] Harden Kokoro/Supertonic embed artifact setup preflights.
- [x] Improve target failure messages into actionable setup/retry guidance.
- [x] Validate with focused backend checks and Playwright UI smoke on alternate ports.
- [x] Commit the polished workpackage.

## 2026-05-17 14:10 CEST - Profile target failure ergonomics
- [x] Trace failed demo clone target state.
- [x] Fix target preparation behavior where it is brittle.
- [x] Improve UI failure diagnostics and recovery actions.
- [x] Validate checks and rendered clone flow.

## 2026-05-17 13:22 CEST - Backend-targeted profile workbench
- [x] Add profile target state and creation request support.
- [x] Queue backend artifact builds and validation from profile creation.
- [x] Update Voice Studio target picker, profile cards, and run readiness.
- [x] Add backend and frontend coverage.
- [x] Validate with checks and hosted dev servers.

## 2026-05-17 12:14 CEST - Optional embed clone modules
- [x] Add research module diagnostics and clone setup APIs.
- [x] Add voice profile clone artifacts and artifact build APIs.
- [x] Extend synthesis routing for optional embed artifacts.
- [x] Add Research Modules and profile artifact UI.
- [x] Add focused tests and run project checks.
- [x] Harden clone/setup browser flow and prepared-source concurrency.
- [x] Keep mock TTS out of primary Studio engine ergonomics.
- [x] Re-run checks, smoke the UI, stop dev servers, and commit.

## 2026-05-14 16:53 CEST - Voice Studio pipeline and product controls
- [x] Add the backend voice job pipeline foundation.
- [x] Add product shell controls for source, profile, and script workflows.
- [x] Add baseline backend and frontend coverage.

## 2026-05-14 19:09 CEST - Voice source analysis, clone quality, and playback polish
- [x] Add speaker-aware source analysis and candidate scoring.
- [x] Add configurable clone/runtime scheduling and Kokoro voicepack selection.
- [x] Improve teleprompter, compact player, and deterministic seek behavior.
- [x] Add waveform, likeness, and cloned-reference quality metadata.
- [x] Add focused regression tests and QA notes.

## 2026-05-15 11:32 CEST - Portable bundles, themes, and product library flows
- [x] Add portable project bundle summary, export, and import APIs.
- [x] Add theme system and reusable product/library panels.
- [x] Preserve project assets, references, progress, and generated audio in bundles.
- [x] Polish product shell layout and visual fidelity.

## 2026-05-15 17:18 CEST - Project workspace scope and TTS engines
- [x] Scope jobs, drafts, and playback state by project.
- [x] Add TTS engine registry and diagnostics.
- [x] Add Supertonic synthesis adapter and runtime script.
- [x] Extend API and model coverage for project-aware workflows.

## 2026-05-15 18:50 CEST - Book Cinema backend and playback experience
- [x] Add PDF and EPUB book source import foundation.
- [x] Add Book Cinema UI and compact playback ergonomics.
- [x] Preserve Book Cinema sources in portable bundles.
- [x] Clean EPUB metadata from narration text.

## 2026-05-15 20:22 CEST - Book Cinema structure, scopes, and guided QA
- [x] Add structured book scopes and narration metadata.
- [x] Move Book Cinema into source intake.
- [x] Add guided Book Cinema polish and dynamic queue behavior.
- [x] Add EPUB/PDF E2E coverage and demo fixture validation.

## 2026-05-15 21:58 CEST - Source prep, progress sync, and pagination reliability
- [x] Add source prep and playback progress APIs.
- [x] Add file and URL source prep UI.
- [x] Add local progress sync and playback session handling.
- [x] Polish Book Cinema pagination and stale-intake reliability.
- [x] Extend source prep and Book Cinema regression coverage.

## 2026-05-16 00:06 CEST - Workspace library, settings, storage, and markdown prep
- [x] Add project delete and storage summary APIs.
- [x] Improve Workspace Library project actions, rename, deletion, and export flow.
- [x] Clarify settings provider, performance, preference, and storage tabs.
- [x] Add markdown-aware source preprocessing and preview metadata.
- [x] Add stale-backend delete diagnostics and overflow fixes.

## 2026-05-16 01:34 CEST - Local provider setup and repository hygiene
- [x] Add mise setup, doctor, provider bootstrap, and audit tasks.
- [x] Document reproducible local runtime setup and repo hygiene.
- [x] Keep runtime model, voice, cache, upstream, demo, and output assets out of Git.
- [x] Remove tracked Kokoro model and voice blobs from the cleaned branch history.
- [x] Run branch-local artifact and validation checks.

## 2026-05-16 16:50 CEST - Workstream Alpha Content IR

- [x] Add Content IR contract and schema
- [x] Add backend adapters, persistence and endpoint
- [x] Add frontend Content IR drawer and inspect actions
- [x] Add validation task and tests
- [x] Run local validation

## 2026-05-16 17:20 CEST - Markdown sentence limit tuning

- [x] Validate demo markdown sentence_too_long warnings
- [x] Tune safe synthesis sentence limits
- [x] Remove hard-blocking on long sentence warnings
- [x] Run focused validation

## 2026-05-16 17:33 CEST - Source intake UI ergonomics

- [x] Validate source intake structure inspection flow
- [x] Streamline preview and inspect ergonomics
- [x] Run rendered UI and local validation
- [x] Add Markdown Cinema follow-along view with flowchart rendering

## 2026-05-16 18:05 CEST - Resume placement ergonomics

- [x] Move continue listening into playback surfaces
- [x] Validate resume from audio player and Cinema
- [x] Run local validation

## 2026-05-16 18:19 CEST - Markdown Cinema fidelity

- [x] Render full Markdown document in Cinema
- [x] Add word-level follow-along in Markdown render mode
- [x] Verify tables and flowcharts render after processing
- [x] Run validation and commit state

## 2026-05-16 19:34 CEST - Policy engine and market profiles

- [x] Add backend policy engine, market profiles, and docs
- [x] Extend project storage, APIs, IR, and legacy source prep bridges
- [x] Add frontend profile selector, session overrides, and explanations
- [x] Add profile snapshots, precedence tests, frontend tests, and validation

## 2026-05-16 20:30 CEST - Policy review and Markdown Cinema fixes

- [x] Fix Enterprise prose/citation classification
- [x] Add project custom speech profiles and policy-aware inspection
- [x] Expand prepared-source review and profile comparison UI
- [x] Stabilize Markdown Cinema rendering and readalong mapping
- [x] Add regression coverage, run checks, and visual smoke

## 2026-05-16 21:27 CEST - Markdown adapter v2

- [x] Add strict Markdown adapter package and CLI bridge
- [x] Integrate strict and legacy parse modes in source prep
- [x] Extend IR, policy, frontend types, and review UI
- [x] Add markdown fixtures, docs, snapshots, and benchmark command
- [x] Run project validation

## 2026-05-16 21:49 CEST - Markdown adapter v2 UX QA and commit

- [x] Validate Source Prep parser-mode ergonomics in rendered UI
- [x] Iterate on UX polish if needed
- [x] Run validation after UX pass
- [x] Commit Markdown adapter v2 package

## 2026-05-16 22:18 CEST - EPUB, DOCX and HTML ingestion

- [x] Add shared EPUB, DOCX, and HTML adapter CLIs
- [x] Integrate adapter diagnostics and capability APIs
- [x] Route Book Cinema imports through IR-backed adapters
- [x] Add deep-link reading position support
- [x] Add fixtures, regression tests, and validation script
- [x] Run local checks and Book Cinema regression
- [x] Note mise doctor shim warning

## 2026-05-16 23:10 CEST - EPUB, DOCX and HTML ergonomics QA

- [x] Review rendered ingestion and Book Cinema UX
- [x] Iterate on polish if needed
- [x] Rerun validation after polish
- [x] Commit EPUB, DOCX and HTML ingestion package

## 2026-05-16 23:31 CEST - Workstream Epsilon PDF OCR image scholarly ingestion

- [x] Add tiered PDF and image adapter pipeline
- [x] Integrate import options, diagnostics, and provenance in backend
- [x] Add frontend import controls and diagnostics panel
- [x] Add fixtures and regression coverage
- [x] Validate free-text source intake remains visible and editable
- [x] Run local validation

## 2026-05-17 00:21 CEST - Pronunciation, multilingual and maths pipeline

- [x] Add central normalisation, lexicon, maths and SSML backend pipeline
- [x] Add pronunciation, mixed-language, maths and Supertonic UI controls
- [x] Add fixture regression coverage and local smoke paths
- [x] Run project checks and commit package

## 2026-05-17 00:59 CEST - Pronunciation pipeline ergonomics QA

- [x] Run rendered UI ergonomics smoke
- [x] Iterate on any UX issues found
- [x] Validate and commit QA follow-up if needed

## 2026-05-17 01:29 CEST - Alignment and read-along

- [x] Add timing contract, alignment adapters, and highlight-map persistence
- [x] Expose timing artefacts through playback APIs
- [x] Wire reader highlighting, locator resume, debug overlay, and playback speed
- [x] Add alignment benchmarks, setup support, and regression coverage
- [x] Run project checks

## 2026-05-17 02:07 CEST - Alignment package ergonomics QA

- [x] Reproduce and fix HN URL source intake 429
- [x] Validate read-along ergonomics in browser
- [x] Rerun checks and Book Cinema E2E
- [x] Commit Alignment and read-along package

## 2026-05-17 03:11 CEST - Workstream IOTA contract hardening

- [x] Add versioned Content IR, locator envelope, and speech-plan contracts
- [x] Implement migration, locator codecs, speech-plan persistence, and APIs
- [x] Add generated frontend contract types and shared locator helpers
- [x] Add public contract fixtures, docs, and validation coverage
- [x] Run local validation and review diffs

## 2026-05-17 11:30 CEST - IOTA ergonomics QA and commit

- [x] Review API and UI ergonomics for contract hardening
- [x] Iterate on any polish or friction found
- [x] Rerun local validation
- [x] Commit contract hardening package

## 2026-05-17 18:46 CEST - Voice Studio ergonomic redesign

- [x] Add top-level Narration and Voice Cloning modes
- [x] Merge Source Intake and Script Review into central workbench
- [x] Add persistent pipeline footer and Cinema entry points
- [x] Rehome voice cloning workflow into dedicated mode
- [x] Run frontend checks and visual QA

## 2026-05-17 19:33 CEST - Voice Studio activity awareness refinement

- [x] Tighten header fidelity and mode switch ergonomics
- [x] Add two-lane activity footer with voice cloning state
- [x] Rework voice cloning workbench progress and readiness views
- [x] Run project checks and visual QA

## 2026-05-17 20:22 CEST - Voice Studio ergonomics menus and cancellation

- [x] Add cancellable voice cloning background work contracts
- [x] Stabilize voice library and target action view models
- [x] Streamline fixed rails, workspace activity, and settings ergonomics
- [x] Add regression coverage for cancellation and UI state helpers
- [x] Run project checks and visual QA

## 2026-05-17 21:23 CEST - Voice Studio ergonomic iteration

- [x] Move run configuration into settings
- [x] Add collapsible activity footer states
- [x] Fix desktop scroll ownership for rails and workbench
- [x] Rework Papery theme token usage
- [x] Polish rail actions and run visual QA

## 2026-05-17 22:00 CEST - Voice Studio fidelity iteration

- [x] Add collapsible left and right rail states
- [x] Tighten visual fidelity against approved concepts
- [x] Clean working log and avoid unrelated task leakage
- [x] Run full checks and rendered QA

## 2026-05-17 22:34 CEST - Voice Studio menu fidelity iteration

- [x] Streamline Workspace & Activity menu
- [x] Tighten header ergonomics and visual fidelity
- [x] Rework Settings into a best-in-class configuration surface
- [x] Run full checks and rendered QA

## 2026-05-17 23:03 CEST - Voice Studio header and Supertonic fidelity

- [x] Remove odd header previous and next controls
- [x] Fix Supertonic ready artifact attention state
- [x] Tighten Workspace and Settings menu ergonomics
- [x] Run full checks and rendered QA

## 2026-05-17 23:23 CEST - Voice Studio vision fidelity loop

- [x] Compare rendered app against approved visual targets
- [x] Tighten shell, rail, footer, and menu fidelity
- [x] Run full checks and rendered QA

## 2026-05-17 23:50 CEST - Voice Studio final fidelity tightening

- [x] Remove remaining prototype glyphs and header/control roughness
- [x] Tighten footer real estate and rail readability against the approved concepts
- [x] Recheck backend readiness copy for misleading failed or prepare states
- [x] Run full checks and rendered QA

## 2026-05-18 00:06 CEST - Voice Studio narration fidelity pass

- [x] Compare Narration intake and review against approved workbench concept
- [x] Rework source intake and review ergonomics
- [x] Tighten related rails and footer fit where the narration viewport exposes gaps
- [x] Run full checks and rendered QA

## 2026-05-18 01:00 CEST - Voice Studio rail fidelity pass

- [x] Compare Narration and Voice Cloning rails against approved concept
- [x] Polish left rail hierarchy, density, and collapse behavior in both modes
- [x] Polish right rail playback/readiness inspectors in both modes
- [x] Run full checks and rendered QA

## 2026-05-18 01:25 CEST - Voice Studio narration viewport pass

- [x] Compare Narration Text, Book, and File / URL modes against approved workbench concept
- [x] Fix workbench scroll and first-viewport visibility issues
- [x] Streamline intake and review ergonomics across source modes
- [x] Run full checks and rendered QA

## 2026-05-18 01:53 CEST - Voice Studio narration cleanliness pass

- [x] Compare Narration viewport against the approved clean workbench concept
- [x] Reduce visual weight and duplicated surfaces in Source Intake and Review
- [x] Tighten Text, Book, and File / URL ergonomics toward one coherent intake family
- [x] Run full checks and rendered QA

## 2026-05-18 02:20 CEST - Voice Studio voice cloning rail streamlining

- [x] Compare Voice Cloning rails against the accepted activity concept
- [x] Remove duplicated workbench/footer content from left and right rails
- [x] Rework Voice Cloning rails into focused command and readiness surfaces
- [x] Run full checks and rendered QA
