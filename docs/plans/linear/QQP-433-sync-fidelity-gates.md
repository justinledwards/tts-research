# QQP-433 — Sync fidelity gates for exact, phrase, block, audio-only, and source-only modes

Status: In Progress
Branch: `niklas/voice-studio-follow-up`
Linear: https://linear.app/niklas-olsson/issue/QQP-433/sync-fidelity-gates-for-exact-phrase-block-audio-only-and-source-only

## Atomic scope

Implement the backend/runtime decision layer that gates sync/highlight fidelity so exact word highlighting is only allowed with sufficient source/revision mapping, timing, artifact, and resource evidence.

This issue is decision-layer only.

## Source-of-truth constraints

- `docs/architecture/source-reader-flow-invariants.md`:
  - exact word highlight is forbidden unless source revision, text mapping, timing confidence, and low-resource gates all pass;
  - fallback sync must be honest: phrase, block, audio-only, or source-only must be visible as such.
- `docs/contracts/readalong-sidecars.md`:
  - `SyncFidelityDecision` is explicit exact/phrase/block/audio-only/source-only decision state;
  - exact sync requires current source revision, valid mapping, timing confidence, compatible checked artifact, and low-resource=false.
- `packages/schema/schemas/sync-fidelity-decision.v1.schema.json` and fixtures:
  - `fidelity`: `exact_word | phrase | block | audio_only | source_only | none`;
  - `exactAllowed=true` only for `exact_word` with all evidence gates true;
  - non-exact fidelity must set `exactAllowed=false`.
- QQP-432 artifact states:
  - checked audio may support exact/phrase sync;
  - unchecked/retryable/stale/replaced/failed audio must not be treated as exact-eligible.

## Non-goals

- No Reader UI, shell labels, transport state machine, windowing, scheduling, visual redesign, or screenshots.
- No Quick Listen capture/promotion.
- No broad retry/resume resolver or repair overlay implementation.
- No schema-pack expansion unless a small generated/runtime mirror is strictly required by product code.

## Expected implementation shape

Likely backend files:

- add runtime `SyncFidelityDecision` types to `backend/internal/pipeline/models_runtime.go` or a focused new file;
- add a focused decision helper, likely `backend/internal/pipeline/sync_fidelity_decisions.go`;
- integrate decision derivation in `backend/internal/pipeline/timing_artifacts.go` after alignment/highlight artifacts are built;
- expose decision metadata additively through `TimingArtifacts` and persisted job metadata;
- optionally persist/read a decision JSON artifact only if the existing artifact pattern makes that small and deterministic;
- add focused regression coverage in `backend/internal/pipeline/service_test.go` and/or `backend/internal/highlightmap/build_test.go`.

## Acceptance checklist

1. Exact word fidelity requires all gates:
   - source/revision context is present/current for this runtime slice;
   - text/source mapping is valid enough to bind highlight entries to source identity;
   - timing confidence is word-level and reliable;
   - low-resource mode is false;
   - audio artifact state is checked/compatible, not unchecked/retryable/stale/replaced/failed.
2. Non-exact decisions are honest and additive:
   - phrase when phrase timing is available but exact gates fail;
   - block when timing is degraded/heuristic or low-resource mode downgrades exact;
   - audio-only when audio is playable but no trustworthy source/highlight mapping exists;
   - source-only/none when no playable audio/timing evidence exists.
3. `exactAllowed` is never true for phrase/block/audio-only/source-only/none.
4. Decision evidence mirrors the contract fields and includes deterministic fallback reasons.
5. Existing clients remain backward-compatible: new JSON fields are additive.
6. Existing highlight/timing behavior is not silently over-claimed as exact; if exact is forbidden, decision metadata and/or highlight summary must make the downgrade visible.
7. Tests cover exact pass, low-resource downgrade, mapping/timing failure downgrade, unchecked/retryable artifact exact denial, and ASR-disabled/unchecked behavior.

## Required verification

Implementation worker should run:

```bash
gofmt -w <changed-go-files>
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline ./internal/highlightmap ./internal/alignment -run 'SyncFidelity|Highlight|Timing|Partial|Artifact|PreparedSource' -count=1
cd backend && GOCACHE=${GOCACHE:-/tmp/tts-research-go-build} go test ./internal/pipeline -count=1
mise exec -- pnpm validate:ir
git diff --check
```

Parent will rerun focused gates, then spec review, quality review, final broad gates, commit/push, and Linear closeout.
