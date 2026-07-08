# QQP-434 — Durable progress and manifest-aware resume resolver

Status: In Progress
Branch: `niklas/voice-studio-follow-up`
Linear: https://linear.app/niklas-olsson/issue/QQP-434/durable-progress-and-manifest-aware-resume-resolver

## Why this issue is next

Live Linear preflight after QQP-433 closeout:

- Branch clean and remote-equal at `2f06051974f627369c8a2c2eeccc8f11b3f72570`.
- TTS-Research project pagination: `hasNextPage=false`.
- Active unarchived remaining issues: 9.
- QQP-434 prerequisites are Done live in Linear:
  - QQP-424 — source lifecycle storage
  - QQP-425 — manifest snapshot storage API
  - QQP-433 — sync fidelity gates

QQP-434 is therefore the next manifest-order dependency-unblocked issue.

## Atomic deliverable

Persist canonical progress and deterministically resolve reopen/resume state across current, stale, degraded, failed, interrupted, remapped, and superseded manifests.

Browser localStorage remains non-authoritative.

## Source-of-truth contracts and docs

- `docs/architecture/source-reader-flow-invariants.md`
- `docs/contracts/readalong-sidecars.md`
- `packages/schema/schemas/durable-progress.v1.schema.json`
- `packages/schema/schemas/resume-resolution.v1.schema.json`
- `fixtures/contracts/readalong-current.durable-progress.v1.json`
- `fixtures/contracts/readalong-current.resume-resolution.v1.json`
- `fixtures/contracts/readalong-remapped.durable-progress.v1.json`
- `fixtures/contracts/readalong-remapped.resume-resolution.v1.json`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`

## Implementation boundaries

In scope:

1. Backend/runtime durable progress model aligned with `durable-progress.v1`:
   - progress ID, source ID, source revision ID, readalong manifest ID
   - optional audio artifact ID
   - kind `resume|bookmark|highlight`
   - state `current|degraded|stale|superseded|failed|interrupted_retriable|remapped`
   - canonical flag, locator envelope, and position payload
2. Backend/runtime resume-resolution model aligned with `resume-resolution.v1`:
   - decisions `auto_resume_current`, `auto_resume_degraded`, `resume_audio_only`, `resume_source_only`, `offer_retry`, `offer_old_vs_repaired`, `auto_resume_remapped`, `blocked_failed`
   - resolved manifest/locator, optional revision map/stale progress/retry artifact/offers
3. Persistence for canonical progress under backend storage, not browser localStorage.
4. Deterministic resolver behavior for current/degraded/audio-only/source-only/failed/interrupted/remapped/superseded/stale cases using manifest, artifact, sync-fidelity, and revision-map evidence available from current runtime sidecars.
5. Tests proving source/manifest/revision binding and fail-closed behavior on mismatched IDs.

Out of scope:

- Reader UI labels or visual redesign.
- Broad retry orchestration (QQP-435).
- Repair overlay implementation beyond consuming available revision-map/sidecar evidence (QQP-436).
- Quick Listen promotion runtime (QQP-437 / QQP-4).
- Windowing/high-frequency highlight scheduling (QQP-440).

## Acceptance checklist

- [ ] Progress writes are source/manifest/revision-bound and reject missing/mismatched source context.
- [ ] Only one canonical progress record per relevant source/readalong/kind context is authoritative, with deterministic update/reload behavior.
- [ ] Resolver returns `auto_resume_current` for current progress on current manifest with compatible checked evidence.
- [ ] Resolver returns `auto_resume_degraded`, `resume_audio_only`, or `resume_source_only` honestly when sync/audio evidence is degraded or absent.
- [ ] Resolver returns `offer_retry` for failed/interrupted retryable artifacts/progress.
- [ ] Resolver returns `auto_resume_remapped` when a stale/superseded progress position can be mapped through a high-confidence revision map.
- [ ] Resolver returns `offer_old_vs_repaired` or another non-auto decision when remap confidence is insufficient or ambiguous.
- [ ] Resolver returns `blocked_failed` for terminal failed/missing/corrupt context.
- [ ] Browser/localStorage remains non-authoritative; frontend may keep hints only.
- [ ] Existing source manifest and progress tests continue to pass.

## Required verification

Implementation worker should run focused gates before returning when possible:

```bash
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline ./internal/httpapi -run 'Progress|Resume|Manifest|Source|Artifact|SyncFidelity' -count=1
mise exec -- pnpm validate:ir
```

Parent closeout will run focused gates plus `mise exec -- pnpm check`, independent spec/quality review, ChatGPT peer checkpoint if the resolver affects downstream contracts, commit/push/remote verify, and Linear Done.
