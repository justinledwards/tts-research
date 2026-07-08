# ChatGPT peer checkpoint — QQP-432 partial audio artifact states

- Date: 2026-07-08
- Project: TTS-Research
- ChatGPT Project: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/project
- Archive: `/home/phoenix/projects/repos/tts-research/output/chatgpt-review-packages/qqp432-peer-current-worktree.zip`
- Archive SHA-256: `52ce23027a4288fe22a49e73f4dd85e42addbddc83efe38e3ff054fff90311e7`
- Verdict: `PEER REQUEST_CHANGES`

## Response

PEER REQUEST_CHANGES

- Blocker: derived QQP-432 metadata can become stale across state transitions. `markSegmentAttemptRetry` sets a segment to `retrying`, which normalization turns into `retryable` and fills `FailureCode` / `FailureMessage`; later the ready path sets the segment back to `ready` but does not clear those fields, and `normalizeJobSegmentAudioArtifacts` only clears `Retry`, not `FailureCode` / `FailureMessage`. A successfully checked or unchecked segment can therefore still expose retry/failure metadata. Evidence: `service.go:1968-1978`, `service.go:2433-2449`, `audio_artifact_states.go:48-58`. Minimal repair: make normalization authoritative for derived failure metadata—clear `FailureCode`, `FailureMessage`, and `Retry` whenever state is not `failed`, `retryable`, or `interrupted_retriable`; for failure-like states, recompute from current `segment.Reason` / `job.Error` instead of preserving an older value. Add a regression using the transient checker/provider retry path asserting final non-failure segments have empty failure fields and nil retry metadata.

- Related blocker in the same normalization pattern: `Replacement.NewState` is only set when empty, so retry replacement metadata can remain `unchecked` after the regenerated segment is later promoted to `checked`. Evidence: `audio_artifact_states.go:59-60` and retry replacement creation at `service.go:2447-2448`. Minimal repair: update `Replacement.NewState` from the current derived segment state on each normalization, or omit it if it is meant to be only a creation-time transition value; add a retry regression that checks `Replacement.NewState == ArtifactState` after completion.

- Verification note from ChatGPT: archive hash matched and `gofmt -l` was clean; ChatGPT could not rerun Go tests in its container because the repo requires Go 1.26.3 and the environment could not download the toolchain.
