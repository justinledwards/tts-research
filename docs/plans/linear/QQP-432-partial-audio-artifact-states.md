# QQP-432 — Partial audio artifact states and replacement semantics

Status: in progress
Linear: https://linear.app/niklas-olsson/issue/QQP-432/partial-audio-artifact-states-and-replacement-semantics

## Atomic deliverable

Persist segment-level audio artifact states and replacement/reuse semantics for unchecked, checked, stale, replaced, failed, and retryable audio.

## Scope

In scope:

- Backend/runtime audio artifact state machine for voice jobs / partial audio manifests.
- Segment-level state records aligned with `audio-artifact.v1` and `artifact-compatibility.v1` contract vocabulary.
- Replacement/reuse metadata that can tell unchecked playable audio, checked audio, stale/replaced audio, failed audio, and retryable/interrupted audio apart.
- Deterministic tests for state transitions and reuse/replacement semantics.

Out of scope:

- Sync fidelity UI or exact-word gate decisions (QQP-433).
- Durable progress/resume resolver (QQP-434).
- Broad retry orchestration rewrite (QQP-435).
- Repair overlay runtime (QQP-436).
- Quick Listen promotion (QQP-437).
- Reader shell/transport/windowing UI (QQP-438/439/440).
- Contract schema redesign unless a minimal backward-compatible field is required.

## Source references

- `docs/architecture/source-reader-flow-invariants.md`
- `docs/contracts/readalong-sidecars.md`
- `packages/schema/schemas/audio-artifact.v1.schema.json`
- `packages/schema/schemas/artifact-compatibility.v1.schema.json`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`
- QQP-431 closeout commit `3926ff1cf8084e6ed25120e7a2ad0d76aef6034c`

## Existing seams to inspect

- `backend/internal/pipeline/models_runtime.go`
  - `JobSegment`
  - `PartialAudioSegmentManifest`
  - `PartialAudioManifest`
  - `VoiceJob`
- `backend/internal/pipeline/service_create_job.go`
- `backend/internal/pipeline/service_test.go`
- `backend/internal/pipeline/timing_artifacts.go`
- `backend/internal/pipeline/project_lifecycle.go`
- `backend/internal/httpapi/voice_job_routes.go`
- Frontend types only for compatibility context: `frontend/src/types.ts`

## Acceptance checklist

- Segment/audio state vocabulary distinguishes at least:
  - `generating`
  - `unchecked`
  - `checked`
  - `stale`
  - `replaced`
  - `failed`
  - `retryable`
  - `interrupted_retriable` when applicable
- State is segment-level, not only whole-job-level.
- Partial playable audio remains explicitly unchecked/replaceable until checker/sync evidence later promotes it.
- Checked state requires the existing checker/quality path evidence, not merely audio bytes.
- Replacement metadata connects old/new artifacts or segments without mutating historical state silently.
- Reuse metadata is tied to QQP-431-compatible identity/reuse keys where available and must not reuse incompatible audio as checked.
- Failed/retryable segment states preserve failure reason and retry scope.
- Existing `VoiceJob`, partial audio manifest, retry, and completed job behavior remain backward-compatible for current clients/tests.
- No sync fidelity UI/gate work is introduced.

## Verification plan

Minimum parent/worker gates:

- `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -run 'Partial|Artifact|Retry|CreateJob|VoiceJob' -count=1`
- `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -count=1`
- `mise exec -- pnpm validate:ir`
- `mise exec -- pnpm check`
- `git diff --check`

Review gates:

- Independent spec review.
- Independent quality review.
- ChatGPT Project peer checkpoint before closeout if runtime state semantics affect downstream QQP-433/434/435 assumptions.
