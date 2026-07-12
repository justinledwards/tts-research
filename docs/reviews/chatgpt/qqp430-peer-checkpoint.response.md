# ChatGPT peer checkpoint — QQP-430 frontend source/manifest store

- Date: 2026-07-08
- Project: TTS-Research
- ChatGPT Project: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/project
- Archive: `/home/phoenix/projects/repos/tts-research/output/chatgpt-review-packages/qqp430-peer-current-worktree.zip`
- Archive SHA256: `379ff1fea4ba5fa10ee2e3f861f221f196f6492d27876aada74baafda2f177ee`
- Review mode: dirty-worktree-current-qqp430

## Verdict

PEER REQUEST_CHANGES.

QQP-430 is close and mostly well-contained, but ChatGPT did not consider it safe to close because the prior restart/lower-sequence class is not fully repaired in the current frontend store implementation.

## Blocking findings

1. `frontend/src/features/source-manifest/sourceManifestStore.ts:219-224` still lets advisory replay state override an authoritative lower snapshot. In the snapshot fallback path, `applyReplay()` calls `replaceSourceSnapshot(snapshot, Math.max(snapshot.latestSequence, replay.latestSequence))`. If the client is at sequence 4, receives a stale/truncated gap replay with `latestSequence: 4`, then fetches an authoritative post-restart snapshot with `latestSequence: 1`, the store keeps latest sequence 4 and will still ignore post-restart event 2. The existing regression only covers the easier case where the replay and snapshot both report `latestSequence: 1`.

2. `applyReplay()` does not treat `replay.latestSequence < current client latestSequence` as a reset signal when `gap` / `snapshotRequired` is false. With the QQP-429 in-memory event log shape, a backend restart that has already emitted sequence 1 before reconnect can return a non-gap replay with `latestSequence: 1` and no selected events for a client reconnecting after sequence 4. The store then calls `recordLatestSequence()`, refuses to lower the cursor, retains stale cache entries, and ignores subsequent post-restart events below 4.

Required fix before closeout: make snapshot fallback use the snapshot sequence as authoritative, and add targeted regression for `client latest 4 -> replay stale/latest 4 or lower non-gap -> authoritative snapshot 1 -> accept event 2`.

## Non-blocking follow-ups

- Add a small runtime payload guard for SSE event/gap parsing so malformed-but-valid JSON cannot silently enter the typed store as a bad event shape.
- Document the frontend/backend sequence-reset contract in the QQP-430 plan or source comment: event sequences are advisory/runtime-local, snapshot replacement is authoritative.
- Consider exposing stream connection errors through store state later, but keep retry/backoff and Reader UI state out of QQP-430.

## Scope check

The implementation appears to stay within QQP-430’s intended frontend source/manifest store slice. No Reader transport/windowing/speech-plan/audio/progress/repair/Quick Listen/backend-protocol creep was observed in the new frontend feature area; the risk is specifically inside adjacent source-manifest replay/snapshot reset semantics.

## Evidence check

The supplied local gates and Hermes reviews are strong for formatting, type safety, broad sourceManifest coverage, and scope control. They are not sufficient to close this slice because the missing targeted restart/lower-sequence regression is material and would currently expose the same stale-cursor failure class under realistic replay/snapshot mismatch conditions.
