# QQP-430 — Frontend source/manifest store

Status: complete
Linear: https://linear.app/niklas-olsson/issue/QQP-430/frontend-sourcemanifest-store
Slug: `frontend-source-manifest-store`

## Selection rationale

QQP-430 is the next selected first-batch issue by agreed manifest order after QQP-429 was completed and pushed.

Dependency gate:

- QQP-429 `source-manifest-event-stream` — Done.
- QQP-425 `manifest-snapshot-storage-api` — Done.

## Atomic deliverable

Add a frontend store keyed by source/revision/manifest identity with reconnect and snapshot fallback behavior.

## Scope

Disposable frontend cache/store and render coalescing only:

- Add a frontend source/manifest store keyed by source ID, source revision ID, reading-unit manifest ID, and readalong manifest ID.
- Integrate with QQP-429 backend replay/snapshot/stream APIs through a small client/API layer.
- Treat backend source/manifest events as advisory; authoritative state comes from snapshot fallback.
- Support reconnect/gap behavior: when event replay says `snapshotRequired`, fetch snapshot and replace/coalesce cache state deterministically.
- Coalesce render/store updates so event bursts do not cause unbounded rerender churn.
- Add deterministic frontend tests for identity keys, replay handling, snapshot fallback, gap/reconnect behavior, event ordering/coalescing, and disposable cache semantics.

Out of scope:

- No Reader shell labels/state vocabulary; QQP-438 owns labels/modes.
- No Reader transport state machine; QQP-439 owns transport behavior.
- No reader windowing/highlight scheduling; QQP-440 owns scheduling/performance.
- No speech-plan segmentation; QQP-431 owns first narratable prefix segmentation.
- No audio artifact state implementation, sync fidelity gates, durable progress/resume, repair overlay runtime, Quick Listen promotion, or broad UI redesign.
- No backend event protocol changes except tiny API type alignment if unavoidable.
- No screenshots unless a changed UI surface requires them; this should be model/store focused.

## Contract references

- `docs/architecture/source-reader-flow-invariants.md`
- `docs/contracts/readalong-sidecars.md`
- `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`
- `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`
- `docs/plans/linear/QQP-429-source-manifest-event-stream.md`

## Existing implementation context

Likely relevant implementation areas:

- `frontend/src/api.ts`
- frontend feature/model/store files under `frontend/src/features/**`
- existing frontend source lifecycle / prepared source / cinema model tests
- backend HTTP API routes added for QQP-429 if API shape/types are needed

## Implementation expectations

1. Keep the store local, deterministic, and disposable; it must not become canonical durable progress or artifact state.
2. Preserve source/revision/manifest identity boundaries in keys and updates.
3. Apply source-manifest events only as hints; always recover through snapshot fallback when gaps/restarts/truncation are reported.
4. Keep API/client code typed and testable without a live backend or browser SSE dependency.
5. Coalesce burst updates with a small deterministic scheduler/helper that tests can flush.
6. Do not add Reader chrome/mode labels/transport/scheduling behavior in this issue.

## Expected verification

Focused frontend gates likely include:

```bash
mise exec -- pnpm --filter @tts-research/frontend test -- sourceManifest
mise exec -- pnpm --filter @tts-research/frontend typecheck
```

If shared API types or backend contracts are touched, also run:

```bash
mise exec -- pnpm validate:ir
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/httpapi -run 'SourceManifest|Event|Stream|Snapshot' -count=1
```

Full gates before completion:

```bash
mise exec -- pnpm check
git diff --check
```

## Review gates

- Spec review: PASS (`deleg_7235c4cd`, `subagent-summary-0-20260708_001859_094154.txt`).
- Quality review: initial `REQUEST_CHANGES` (`deleg_0a9620bb`) for backend restart/lower-sequence snapshot fallback; focused repairs completed by `deleg_fbb944c2` and `deleg_65fd0182`.
- Targeted quality re-review: APPROVED (`deleg_1b84aa64`) after first repair.
- ChatGPT Project peer checkpoint: `PEER REQUEST_CHANGES`, saved in `docs/reviews/chatgpt/qqp430-peer-checkpoint.response.md`; blocker was stricter stale replay/latest reset handling.
- Targeted peer-blocker re-review: APPROVED (`deleg_84871c57`, `subagent-summary-0-20260708_005554_492953.txt`).
- Final verification evidence:
  - `mise exec -- pnpm --filter @tts-research/frontend test -- sourceManifest` — 111 files / 748 tests after peer repair.
  - `mise exec -- pnpm --filter @tts-research/frontend typecheck` — passed.
  - `mise exec -- pnpm lint` — passed.
  - `mise exec -- pnpm check` — passed after peer repair/re-review.
  - `mise exec -- pnpm validate:ir` — passed after peer repair/re-review.
  - `git diff --check` — passed after peer repair/re-review.
