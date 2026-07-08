# QQP-439 ChatGPT peer-blocker recheck response

Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4e8b04-f034-83eb-bca0-82af2019805e

Archive: `/tmp/tts-research-qqp439-peer-repair-20260708-180657.zip`

Archive SHA-256: `bfba035959390fedd29a16f11c107656c0e7e98dc64db158eda91f62b9484d32`

```text
PEER-BLOCKER REQUEST_CHANGES

frontend/src/features/reading-surface/model.ts — deriveReaderShellState / deriveReaderTransportState

Remaining blocker tied to prior blocker 3: sourceReadinessState: "stale" is raw stale evidence, but it is not mapped to shell stale. Because deriveReaderTransportState only lets blocking raw shell states override a supplied readerShellState, this can still weaken stale raw evidence into checked.

QQP-440 risk: a caller can pass stale source evidence together with a cached/pre-derived checked shell state and receive playable/current/exact-capable transport, allowing windowing/highlight scheduling against stale source/audio mapping.

Concrete unsafe case:

deriveReaderTransportStateDescriptor({ readerShellState: "checked", sourceReadinessState: "stale", readAlongExactSync: true }) can still return checked/playable/current/exact instead of fail-closed stale/replaced.

Acceptance criteria/tests:

deriveReaderShellState({ sourceReadinessState: "stale" }) should derive stale, or deriveReaderTransportState must otherwise treat sourceReadinessState: "stale" as blocking raw stale evidence.

deriveReaderTransportStateDescriptor({ readerShellState: "checked", sourceReadinessState: "stale", readAlongExactSync: true }) must return state: "stale-replaced", canStartPlayback: false, canClaimCurrentAudio: false, canClaimExactReadAlong: false.

deriveReaderTransportStateDescriptor({ audioArtifactState: "checked", sourceReadinessState: "stale", readAlongExactSync: true }) must also return stale-replaced with no playback/current/exact claims.
```
