# Working Log

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
