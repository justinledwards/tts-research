# Temporary Source Migration Strategy

Temporary source work ships as a sibling path to project sources. Each phase must preserve existing project source behavior, expose visible user value, and leave automated plus screenshot evidence before the next phase starts.

## Goals

- Let users listen to pasted text, webpages, and files without first creating durable project history.
- Keep project-owned source IDs, artifacts, cards, jobs, and workflows stable.
- Make expiry, discard, cleanup, provider use, and promotion explicit.
- Let reviewers verify each phase through focused tests, screenshot baselines, and compatibility checks.

## Migration Rules

- Do not change existing project source IDs.
- Do not move existing project artifacts.
- Add temporary support as a sibling path, not as hidden project state.
- Keep durable source cards unchanged except for optional `Promoted from temporary source` provenance.
- Project workflows must pass before and after each phase.
- Temporary artifacts must be scoped under temporary storage roots or `scope: "temporary"`.
- Promotion is the only path that may copy temporary content into durable project history.

## Feature Flags

| Flag | Default During Migration | Owns | Purpose |
| --- | --- | --- | --- |
| `temporarySources.enabled` | On in dev, controlled in release builds | App shell, backend routes | Enables temporary source envelopes and API routes. |
| `temporarySources.quickListen` | On after Phase 1 checks pass | Quick Listen | Enables paste, URL, and file temporary intake. |
| `temporarySources.cinema` | On after Phase 2 checks pass | Cinema, Teleprompt | Enables temporary Website Cinema, Document Cinema, and Theatre return context. |
| `temporarySources.promotion` | On after Phase 3 checks pass | Promotion service, UI | Enables `Keep in project`, promotion manifest, artifact copy choices, and conflicts. |
| `temporarySources.premiumSurfaces` | Off until Phase 4 release evidence is complete | Command Center, Palette, Settings, Voice Dashboard, UI memory | Enables management and recall surfaces outside the core Quick Listen flow. |
| `temporarySources.cleanupStress` | Dev/test only | Backend cleanup, QA | Runs aggressive expiry and cleanup scenarios. |

Flags should fail closed. If a temporary feature is disabled, project source creation, review, preview, audio jobs, Cinema, Teleprompt, Settings, Command Palette, Command Center, Voice Dashboard, and UI memory must keep their durable-source behavior.

## Phased Delivery Plan

### Phase 1: Model and Storage Foundation

User value: the app can represent temporary work without polluting project history.

Scope:
- Add temporary source schema and `owner`/scope fields.
- Add create, read, cleanup, delete, readiness, voice-job, and storage-summary API boundaries.
- Add storage cleanup that cannot traverse into project artifact roots.
- Add basic frontend source envelope support that does not require `projectId`.

Exit evidence:
- Backend lifecycle tests for create/read/delete/cleanup/expired/not-found.
- Compatibility tests proving existing project source IDs and artifact paths are unchanged.
- Frontend tests proving temporary envelopes render through reviewable source selectors without project ownership.
- `pnpm check`.

### Phase 2: Quick Listen MVP

User value: users can paste text or submit a URL and listen without creating a project source.

Scope:
- Add Quick Listen paste and URL temporary source intake.
- Add temporary Review and Preview readiness states.
- Add `Create & Listen` for prepared temporary sources.
- Add `Discard temporary source` and recovery copy.
- Keep project intake and durable source cards unchanged.

Exit evidence:
- Focused Quick Listen tests for paste, URL, readiness, discard, error states, and generated temporary audio.
- API tests for temporary voice jobs through `/api/temporary-sources/:id/voice-jobs`.
- Screenshot evidence for desktop and mobile Quick Listen states.
- Project intake regression tests.

### Phase 3: Cinema and Teleprompt

User value: users can rehearse and read temporary sources in high-focus surfaces.

Scope:
- Add temporary Website Cinema and Document Cinema.
- Add temporary Teleprompt rehearsal.
- Preserve Theatre return context so users can return to the originating workbench or Quick Listen session.
- Add mobile coverage for temporary Cinema and Theatre controls.

Exit evidence:
- Cinema model tests for temporary source overview, review, diagnostics, policy, history, and promotion tabs.
- Teleprompt return-memory tests for temporary sessions.
- Responsive screenshot lane for phone, constrained desktop, desktop, and wide desktop.
- Accessibility smoke for focus order, labels, escape/return flows, and no horizontal overflow.

### Phase 4: Promotion

User value: users can explicitly keep valuable temporary work in a project when it becomes durable.

Scope:
- Add `Keep in project` flow.
- Add promotion manifest with source, artifact, audio, policy, provenance, and conflict details.
- Copy selected artifacts into project ownership.
- Let generated temporary audio preservation be optional.
- Resolve conflicts without overwriting existing project sources.

Exit evidence:
- Backend promotion tests for manifest contents, artifact copy, optional audio, conflicts, and expired sessions.
- Frontend promotion dialog tests for project choice, artifact choices, success, and failure recovery.
- Compatibility tests proving unpromoted temporary cleanup does not remove project sources.
- Screenshot evidence for normal, conflict, and success states.

### Phase 5: Premium Systems

User value: temporary work is discoverable and controllable across the full app without becoming project clutter.

Scope:
- Add Command Center temporary shelf.
- Add Command Palette commands for new, paste, URL, file, reopen, keep, discard, and cleanup actions.
- Add Settings behavior for temporary defaults, expiry, cleanup, and generated audio preservation.
- Add Voice Dashboard temporary usage and session voice diagnostics.
- Add UI memory and expiry controls that are scoped to temporary sessions.

Exit evidence:
- Surface complexity tests for ownership, duplicate labels, disabled reasons, and action reachability.
- Settings tests for temporary behavior and privacy copy.
- Command Palette search and shortcut tests.
- Voice Dashboard tests for temporary usage visibility without durable voice ownership drift.
- UI memory tests for expiry, reset, and return context.

### Phase 6: QA and Polish

User value: temporary sources feel trustworthy, understandable, accessible, and stable.

Scope:
- Add and review screenshot baselines.
- Enforce surface complexity gates.
- Run accessibility pass.
- Run copy pass against `docs/temporary-source-copy-guide.md`.
- Run privacy/local-first audit against `docs/privacy-local-first.md`.
- Run storage cleanup stress tests.

Exit evidence:
- `pnpm e2e:temporary-sources`.
- `pnpm e2e:responsive-snapshots`.
- Accessibility report covering keyboard, labels, focus recovery, reduced motion, contrast, and narrow widths.
- Cleanup stress report proving temporary cleanup cannot delete project artifacts.
- Release notes reviewed with product, engineering, QA, and docs.

## Backward Compatibility Tests

Each phase must keep or add tests that prove:

- Existing project source IDs are not rewritten during migration.
- Existing project artifacts remain in place after temporary create, cleanup, delete, and promotion attempts.
- Existing project source cards keep their labels and actions unless explicit promotion provenance is present.
- Existing project intake, review, preview, prepared-source jobs, Cinema, Teleprompt, Settings, Command Palette, Command Center, Voice Dashboard, and UI memory workflows still pass with temporary flags off.
- Temporary source routes do not require a `projectId`.
- Temporary source cleanup deletes only temporary content, generated temporary audio, timing, bookmarks, progress, review notes, diagnostics, and temporary scoped artifacts.
- Promotion copies durable artifacts instead of moving temporary artifacts.

## Migration Checklist

- [ ] Confirm the target phase has one owner for backend, frontend, QA, docs, and release notes.
- [ ] Confirm feature flags and defaults are documented.
- [ ] Run baseline project workflow checks before starting the phase.
- [ ] Add temporary behavior as sibling storage, sibling routes, or sibling UI state.
- [ ] Keep durable project cards and project source IDs unchanged.
- [ ] Add automated compatibility tests before broad UI wiring.
- [ ] Add screenshot evidence for every new visible surface.
- [ ] Validate privacy copy, expiry copy, and provider-boundary copy.
- [ ] Run `pnpm check`.
- [ ] Record known failures or existing flaky checks in `WORKINGLOG.md`.

## Reviewer Evidence Checklist

For every phase, attach or link:

- Phase scope summary and enabled flags.
- Backend route, service, and storage tests.
- Frontend source envelope, UI, command, settings, and memory tests relevant to the phase.
- Screenshots for normal, empty, loading, error, expired, cleanup, and promoted states when those states exist.
- Accessibility evidence for keyboard navigation, screen-reader labels, focus recovery, reduced motion, and responsive widths.
- Privacy/local-first evidence for local storage, provider-backed generation, expiry, discard, cleanup, and promotion.
- Regression evidence for durable project source workflows.
- Release note draft.

## Release Notes

Temporary sources let you use Quick Listen for pasted text, webpages, and supported files without adding anything to project history. Temporary source text, generated temporary audio, timing, bookmarks, progress, review notes, and diagnostics stay scoped to the temporary session until expiry, cleanup, discard, or explicit promotion.

Use `Keep in project` when temporary work should become a durable project source. Promotion copies selected content into the chosen project and can optionally preserve generated audio. `Discard temporary source` deletes only temporary work and does not change existing project sources.

Temporary source controls appear in Quick Listen, Review, Preview, Cinema, Teleprompt, Command Center, Command Palette, Settings, Voice Dashboard, and UI memory where enabled. Existing project workflows and project source cards remain unchanged unless a source shows `Promoted from temporary source` provenance.

## Human-System Fit Guardrails

- Users must be able to perceive whether work is temporary, durable, expired, promoted, or cleaned up.
- Users must understand whether an action affects temporary session data or project history before they act.
- Every destructive action must say what is deleted and that project sources are unchanged.
- Users must be able to recover orientation after Cinema, Teleprompt, Settings, Command Center, and Command Palette flows.
- Reviewers must be able to verify claims through tests and screenshots, not only prose.
