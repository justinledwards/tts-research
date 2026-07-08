# QQP-431 — Incremental speech-plan segmentation for first narratable prefix

Status: complete
Linear: https://linear.app/niklas-olsson/issue/QQP-431/incremental-speech-plan-segmentation-for-first-narratable-prefix
Slug: `incremental-speech-plan-segmentation`

## Selection rationale

QQP-431 is the next unblocked first-batch issue by agreed manifest order after QQP-430 was completed, pushed, remote-verified, and moved Done.

Dependency gate:

- QQP-423 `readalong-contracts` — Done.
- QQP-425 `manifest-snapshot-storage-api` — Done.
- QQP-428 `epub-html-incremental-extraction` — Done.

Live Linear preflight:

- Project: TTS-Research (`010252d0-b34c-473d-82f2-05bc4d7bc685`).
- Project issue pagination: `hasNextPage=false` on 2026-07-08 preflight.
- QQP-431 state before kickoff: Backlog.
- Repo branch: `niklas/voice-studio-follow-up`.
- Repo HEAD before kickoff: `ca717ddb7526b5f707eec1679cb618f6a597206b`.
- Local HEAD equals `fork/niklas/voice-studio-follow-up` before kickoff.

## Atomic deliverable

Generate speech-plan segments tied to source/revision/manifest/unit identity from the earliest contiguous narratable prefix.

## Scope

Backend/contracted data slice only:

- Extend speech-plan generation so segments can be built from manifest-bound narratable units rather than only whole-input Content IR text.
- Preserve source ID, source revision ID, extraction revision ID, reading-unit manifest ID, readalong manifest ID, reading unit IDs, node IDs, speech text hash, and voice/engine/policy hash in segment metadata or compatible contract fields.
- Generate the earliest contiguous narratable prefix so a first narratable unit can produce a plan before full-source completion.
- Keep skipped/non-narratable units represented in source/manifest state without becoming speech segments.
- Base segment reuse identity on unit identity plus speech text hash, not raw contiguous text alone.
- Preserve existing whole-text/content-IR speech-plan compatibility path.

Out of scope:

- No audio artifact state implementation; QQP-432 owns partial audio artifact state and replacement semantics.
- No sync fidelity decision layer; QQP-433 owns sync gates.
- No durable progress/resume; QQP-434 owns resume resolution.
- No retry/interrupted artifact behavior; QQP-435 owns retry semantics.
- No repair overlay or manifest supersession runtime; QQP-436 owns repairs.
- No Quick Listen promotion; QQP-437 owns promotion crosswalk.
- No Reader shell labels, transport state machine, windowing, or UI redesign; QQP-438/439/440 own those.
- No backend event protocol changes unless a tiny contract-alignment addition is unavoidable.

## Source references

- `docs/architecture/source-reader-flow-invariants.md`
- `docs/contracts/speech-plan.md`
- `docs/contracts/readalong-sidecars.md`
- `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`
- `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`
- `docs/reviews/chatgpt/007-linear-issue-batch.response.md`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`
- Existing backend package: `backend/internal/speechplan/`
- Existing TS SDK builder: `packages/sdk-ts/src/speech-plan.ts`
- Existing contract fixtures: `fixtures/contracts/*.speech-plan.v1.json`, `fixtures/golden-minute/expected-speech-plan.json`

## Implementation expectations

1. Keep the current whole-Content-IR speech-plan builder working unchanged for existing callers/tests.
2. Add a narrow backend/contracted API or builder seam for incremental/manifest-bound segmentation, preferably under `backend/internal/speechplan` unless existing manifest services provide a better fit.
3. Model earliest contiguous narratable prefix deterministically:
   - include narratable units from the start of the ordered manifest while they are complete/narratable;
   - stop at the first pending/blocked/non-narratable gap that breaks contiguity;
   - do not include later narratable islands after a gap.
4. Bind segments to stable source/revision/manifest/unit identity and speech/policy hashes in a way that downstream QQP-432 can use for audio artifact compatibility/reuse.
5. Add deterministic tests for:
   - first narratable prefix before full extraction completes;
   - gap stops prefix and excludes later islands;
   - skipped/non-narratable units remain non-segments;
   - segment identity/hash changes on speech text or policy/voice/engine change;
   - existing whole-text path remains compatible.
6. Update docs/fixtures/contracts only as needed for this atomic slice.

## Expected verification

Focused gates:

```bash
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/speechplan -count=1
mise exec -- pnpm validate:ir
```

If TS SDK/contracts are touched:

```bash
mise exec -- pnpm package:test
```

Full gates before completion:

```bash
mise exec -- pnpm check
git diff --check
```

## Review gates

- Spec review must confirm the implementation is limited to speech-plan segmentation from earliest contiguous narratable prefix and does not implement QQP-432+ audio/runtime/UI behavior.
- Quality review must inspect source/revision/manifest/unit identity binding, hash/reuse semantics, prefix/gap determinism, compatibility with existing builders, and test coverage.
- ChatGPT Project peer checkpoint should be used if the implementation changes contract shape or materially affects downstream QQP-432/433 assumptions.


## Review results

- Contract/acceptance inspector: completed (`deleg_f5b77bd4`).
- Implementation worker: completed (`deleg_43a12561`).
- Parent focused gates after implementation: `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/speechplan -count=1`, `mise exec -- pnpm validate:ir`, `git diff --check`, and `gofmt -l` passed.
- Spec review: PASS (`deleg_253bd096` / `subagent-summary-0-20260708_021756_385373.txt`).
- Quality review: REQUEST_CHANGES (`deleg_c2b65eef` / `subagent-summary-0-20260708_021802_826412.txt`) for empty manifest identity IDs, stale node binding, duplicate IDs, JSON round-trip binding coverage, and readiness coverage.
- Focused repair: completed (`deleg_627eb341`).
- Parent repair gates: `gofmt -l`, speechplan Go package test, `mise exec -- pnpm validate:ir`, and `git diff --check` passed.
- Targeted quality re-review: APPROVED (`deleg_435ccf5a`).

- ChatGPT peer checkpoint: REQUEST_CHANGES; response saved at `docs/reviews/chatgpt/qqp431-peer-checkpoint.response.md` for under-bound source/unit identity, node-ID readalong membership contradiction, missing narratable node fail-open behavior, and under-keyed synthesis reuse.
- Focused peer repair: completed (`deleg_ef931a9f`); parent gates passed after repair.

- Targeted peer-blocker re-review: APPROVED (`deleg_1e499154` / `subagent-summary-0-20260708_030134_049461.txt`); no remaining ChatGPT peer blockers.

## Final closeout gate plan

Before commit/push/Linear Done, rerun:

- `gofmt -l backend/internal/speechplan/speech_plan.go backend/internal/speechplan/speech_plan_test.go`
- `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/speechplan -count=1`
- `mise exec -- pnpm validate:ir`
- `mise exec -- pnpm check`
- `git diff --check`

## Final verification evidence

Passed after ChatGPT peer repair and targeted peer-blocker approval:

- `gofmt -l backend/internal/speechplan/speech_plan.go backend/internal/speechplan/speech_plan_test.go`
- `cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/speechplan -count=1`
- `mise exec -- pnpm validate:ir`
- `mise exec -- pnpm check`
- `git diff --check`

Closeout pending at this plan update: commit/push/remote verification and Linear Done.
