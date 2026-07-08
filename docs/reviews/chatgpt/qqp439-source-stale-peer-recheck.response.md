# QQP-439 source-stale peer-blocker recheck response

Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4e8b04-f034-83eb-bca0-82af2019805e

Archive: `/tmp/tts-research-qqp439-source-stale-repair-20260708-183547.zip`

Archive SHA-256: `1888e415caa9f8179be79567e1935fff91728e135ee1922b0566aaaf0a3a3a95`

```text
PEER-BLOCKER APPROVED

Verified against the repaired archive SHA. The source-readiness stale blocker is closed:

frontend/src/features/reading-surface/model.ts now normalizes sourceReadinessState and derives shell stale when sourceReadinessState === "stale". deriveReaderTransportState derives raw shell state first, treats raw stale as blocking, and maps it to stale-replaced, so a supplied cached readerShellState: "checked" cannot weaken the stale evidence.

Both required unsafe cases are now covered by direct regression tests in frontend/src/features/reading-surface/model.test.ts:

readerShellState: "checked" + sourceReadinessState: "stale" + readAlongExactSync: true returns stale-replaced with no playback/current/exact claims.

audioArtifactState: "checked" + sourceReadinessState: "stale" + readAlongExactSync: true also returns stale-replaced with no playback/current/exact claims.

This is safe for QQP-440 because stale source evidence now fails closed before any checked/playable/current/exact read-along claim can be emitted, including when exact-sync evidence is present.
```
