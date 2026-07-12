# TTS-Research First Linear Batch Atomicity Review

Status: agreed with ChatGPT; ready for Linear creation  
Updated: 2026-07-07 11:27 CEST

## Inputs

- ChatGPT batch response: `docs/reviews/chatgpt/007-linear-issue-batch.response.md`
- Atomic flow agreement: `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`
- Active Linear project: https://linear.app/niklas-olsson/project/tts-research-9683c18e447c
- Active issue cap: <=20
- Existing active issue: `QQP-4` — Quick Narrate Pasted URL

## Atomicity rule

An issue is atomic only if it has one independently verifiable deliverable, one primary owner surface, explicit dependencies, deterministic evidence, and no hidden adjacent subsystem implementation.

Allowed atomic shapes:

1. Contract/spec artifact with fixtures and validation.
2. Backend persistence/API slice with deterministic tests.
3. Frontend state/UI slice with deterministic tests/screenshots.
4. Evidence gate that only verifies previously implemented behavior.

Disallowed shapes:

- backend + frontend + evidence + migration all in one issue;
- umbrella work like "make Reader best-in-class";
- multiple source formats at best-in-class depth in one issue;
- implementation work hidden inside evidence or doc-only issues;
- creating a duplicate issue for existing `QQP-4`.

## ChatGPT atomicity agreement

ChatGPT returned `ATOMIC ENOUGH FOR LINEAR` and `AGREED ATOMIC FLOW AND LINEAR BATCH` in `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`.

Required corrections from ChatGPT have been applied:

- `readalong-contracts` includes all first-batch sidecar contracts including durable progress/resume, source-manifest events, and audio artifact state shape.
- `incremental-speech-plan-segmentation` no longer depends on the frontend store.
- `durable-progress-resume-resolver` depends on `source-lifecycle-storage`.
- `retry-interrupted-artifact-semantics` depends on `source-lifecycle-storage`.
- `quick-listen-promotion-crosswalk` depends on `manifest-snapshot-storage-api`.
- `active-processing-evidence-gates` is strictly evidence-only: screenshots, budgets, fixture runs, logs, and review package.

## Final agreed candidate batch

This respects the Linear cap exactly: 1 existing active issue + 19 new issues = 20 active issues.

| slug | P | deps | atomic deliverable |
| --- | --- | --- | --- |
| readalong-contracts | P1 | none | Add the complete first-batch sidecar contract pack with docs, schemas, fixtures, and validation, without runtime implementation. |
| source-lifecycle-storage | P1 | readalong-contracts | Persist source identity, source revisions, raw source artifacts, and startup interrupted_retriable marking for orphaned active work. |
| manifest-snapshot-storage-api | P1 | readalong-contracts, source-lifecycle-storage | Persist and retrieve reading-unit/readalong manifest snapshots by source/revision/manifest identity. |
| stable-unit-ir-core-adapters | P1 | readalong-contracts | Make HTML, EPUB, and Markdown core adapters emit stable unit IDs, order keys, fingerprints, locators, and provenance. |
| lower-tier-adapter-contract-fit | P2 | readalong-contracts | Produce deterministic contract-fit reports and warnings for non-core adapters without claiming best-in-class behavior. |
| epub-html-incremental-extraction | P1 | source-lifecycle-storage, manifest-snapshot-storage-api, stable-unit-ir-core-adapters | Emit readable HTML/EPUB units incrementally and write manifest snapshots as units become available. |
| source-manifest-event-stream | P1 | readalong-contracts, manifest-snapshot-storage-api | Implement a sequenced backend source/manifest event protocol with deterministic tests and snapshot fallback. |
| frontend-source-manifest-store | P1 | source-manifest-event-stream, manifest-snapshot-storage-api | Add a frontend store keyed by source/revision/manifest identity with reconnect and snapshot fallback behavior. |
| incremental-speech-plan-segmentation | P1 | readalong-contracts, manifest-snapshot-storage-api, epub-html-incremental-extraction | Generate speech-plan segments tied to source/revision/manifest/unit identity from the earliest contiguous narratable prefix. |
| partial-audio-artifact-states | P1 | incremental-speech-plan-segmentation | Persist segment-level audio artifact states and replacement/reuse semantics for unchecked, checked, stale, replaced, failed, and retryable audio. |
| sync-fidelity-gates | P1 | partial-audio-artifact-states | Gate sync/highlight fidelity so exact word highlighting is only allowed with sufficient revision, mapping, timing, and resource evidence. |
| durable-progress-resume-resolver | P1 | source-lifecycle-storage, manifest-snapshot-storage-api, sync-fidelity-gates | Persist canonical progress and deterministically resolve reopen/resume state across current, stale, degraded, failed, interrupted, remapped, and superseded manifests. |
| retry-interrupted-artifact-semantics | P1 | source-lifecycle-storage, partial-audio-artifact-states, durable-progress-resume-resolver | Implement artifact/segment-scoped retry behavior across cancellation, provider failure, backend restart, checking failure, and compatible reuse. |
| minimal-repair-overlay-supersession | P2 | readalong-contracts, manifest-snapshot-storage-api, durable-progress-resume-resolver, retry-interrupted-artifact-semantics | Add immutable repair overlays, superseding manifests, affected-artifact stale marking, and revision-map-based progress remap. |
| quick-listen-promotion-crosswalk | P1 | QQP-4, source-lifecycle-storage, manifest-snapshot-storage-api, partial-audio-artifact-states, durable-progress-resume-resolver | Promote temporary Quick Listen sources into durable project sources while preserving mapped progress, artifacts, highlights, and source identity. |
| reader-shell-state-vocabulary | P1 | frontend-source-manifest-store | Add Reader shell labels/state vocabulary for source-only, generating, unchecked, checked, degraded, stale, failed, retryable, and superseded states. |
| reader-transport-state-machine | P1 | partial-audio-artifact-states, reader-shell-state-vocabulary | Add shared Reader transport states for pre-audio, generating, unchecked, checked, stale/replaced, failed/retryable, and degraded playback. |
| reader-windowing-highlight-scheduling | P1 | sync-fidelity-gates, reader-shell-state-vocabulary, reader-transport-state-machine | Implement internal reader windowing, high-frequency highlight isolation, and low-resource fidelity downgrade behavior. |
| active-processing-evidence-gates | P2 | quick-listen-promotion-crosswalk, reader-windowing-highlight-scheduling, retry-interrupted-artifact-semantics, minimal-repair-overlay-supersession, lower-tier-adapter-contract-fit | Produce the final deterministic evidence package for the canonical fixture, performance budgets, degraded modes, screenshots, logs, and review handoff. |

## Non-negotiable issue invariants

- `QQP-4` remains the existing Quick Listen capture anchor; it is linked/rescoped, not duplicated.
- No issue may claim PDF/DOCX/OCR best-in-class behavior in this first batch.
- Every runtime issue must name the source revision, extraction revision, manifest identity, artifact identity, and stale/superseded behavior it touches.
- Every UI issue must name required phone/constrained/desktop/large-desktop evidence or explicitly defer screenshots to `active-processing-evidence-gates`.
- Every issue has deterministic commands/evidence; speculative checks are not acceptance criteria.
- ChatGPT thread is architecture/review record only; repo docs + Linear are the operational source of truth.

## Cap check

- Existing active issues: 1 (`QQP-4`)
- New agreed issues: 19
- Active total after creation: 20
- Remaining capacity after creation: 0
- Cap status: compliant (`<=20`)
