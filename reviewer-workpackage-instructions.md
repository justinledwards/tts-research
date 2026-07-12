# Reviewer Instructions: Premium Workpackages (Performance + Smoothness)

## Goal for the reviewer
Create high-impact workpackages that make the app feel snappy while navigating and processing, with measurable outcomes.

This is a user-experience-first optimization request for **perceived performance**:
- playback should remain smooth and responsive even while sources are still processing;
- audio should start as early as possible (from available segments), not only after complete source completion;
- controls and navigation should stay interactive under load;
- measured baselines and targets should be explicit in each package.

## Scope to validate with the screenshots
- Workspace flow and project library
- Settings IA and shortcut panel paths
- Source prep and cinema flows:
  - EPUB
  - DOCX
  - PDF
  - Website source
  - no-audio edge case
- Responsive behavior for phone/desktop/large desktop
- Teleprompt theatre mode

## Required review outcome format
For each workpackage, provide:

1. A short title + priority (`P0/P1/P2`) and urgency rationale.
2. Problem statement with one-paragraph evidence (screenshot references + logs).
3. Repro steps that trigger the issue (including exact flow and viewport when needed).
4. Baseline metric(s) observed today (must include units + source of measure).
5. Target metric(s) to achieve in next version.
6. Proposed implementation approach (front/back split where relevant).
7. Measurable acceptance criteria and rollback criteria.
8. Validation plan (tests + scripts to run) and owners.

## Measurement requirements (must be included)
Baseline and target should be attached per workpackage with current measured values.

### Mandatory baseline sources
- `output/e2e-book-cinema/summary.json`
- `output/accessibility/latest/responsive-snapshots/responsive-results.json`
- `output/e2e-book-cinema/` screenshot state files
- Any run logs collected during this optimization review

### Baseline suite to run before creating targets
- `pnpm e2e:workspace-flow`
- `pnpm e2e:settings-ia`
- `pnpm e2e:responsive-snapshots`
- `pnpm e2e:readalong-performance`
- `pnpm e2e:readalong-sync`
- `pnpm e2e:ui-actions:smoke` (or at least `pnpm e2e:ui-actions` baseline)
- `pnpm bundle:local`
- Any backend profiler command you use for job queue / worker contention during synthesis.

### Suggested metrics + target examples
- **Input responsiveness**: INP p75 and p95 (target: p75 < 100ms, p95 < 250ms).
- **First user interaction latency**: time from click in workspace action to visible UI response (target: < 120ms p75).
- **First audio play latency**: time from user pressing Play to first chunk audio output (target baseline-to-target with progressive playback enabled).
- **First playable chunk latency**: time to first available playable chunk after source submission (target < 4s for short sources, < 12s for long sources on warm path).
- **Frame stability**: dropped-frame ratio during seek/playback controls (target < 1% for the measured sessions).
- **Navigation during processing**: no modal blocking/interaction freeze for route changes while active jobs run (asserted by automation script checks + manual QA).
- **Memory ceiling**: avoid growth above baseline during repeated source navigation/pause/play cycles in a 20-minute flow.

## Premium optimization workpackage categories to split into
1. **Streaming-first playback pipeline**
   - Start playback from earliest completed segment.
   - UI should reflect partial readiness safely.
   - Add explicit partial-state and resume controls.

2. **Main-thread responsiveness / UI scheduling**
   - Move heavy parser/render work off critical control path.
   - Batch updates and gate expensive recalculations.
   - Reduce rerender pressure in active cinema and workspace panels.

3. **Source processing orchestration**
   - Separate job submission, extraction, and rendering phases.
   - Make failures resumable and prevent full-path cancellation.

4. **React + state locality improvements**
   - Improve memoization and avoid broad prop churn around reader playback state.
   - Tighten selector usage in high-frequency UI controls.

5. **Cross-device smoothness**
   - Add responsive/perf gating for lower-end devices.
   - Degrade visuals before degrading interaction latency.

6. **Observability for production-like feedback**
   - Add synthetic + real timing markers for: route changes, play command, playback segment queue depth, job phase transitions.
   - Persist markers in a standard shape for regression trend tracking.

## Explicit reviewer asks (hard requirements)
- Return workpackages, not implementation.
- Prioritize user-visible smoothness, not just throughput.
- Each package must include measurable baseline and target, with suggested script names.
- Include at least one package focused specifically on "playback while processing" and one on "navigation while processing".
- Include rough effort estimate and dependency impact (frontend/backend/cache/service queue).
- Note regression risk and validation criteria for each package.
