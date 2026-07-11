# Reader-First release Peer repair v5

Status: owner-accepted repair; Peer v5 pending; Linear creation and product implementation remain unauthorized.

## V4 evidence

- Verdict: `PEER REQUEST_CHANGES TTS READER-FIRST RELEASE V4`
- Response: `docs/reviews/chatgpt-reader-first-release-response-v4.md`
- Response SHA-256: `047ac056b40a5d8ebf57741d8c911ded142167971382b360c99025c6e63accec`
- V4 archive SHA-256: `74aec289b0c6d3461710c8f92019ba8883f94a99dbad29bb0678b989e65aa71c`

## Blocker 1 — exact concurrency exceptions

RFA-13 AC03 now mirrors `mediaContract.constrainedConcurrencyException.allowedSignals` exactly:

- `saveData`
- `effectiveType_2g`
- `deviceMemory_below_2gb`
- `active_manifest_has_one_remaining_segment`

Sustained one-request operation requires one of those reason codes. Seek cancellation and backpressure are transient request-lifecycle behavior, not sustained-concurrency exceptions. RFA-13 telemetry requires `concurrencyReason`.

## Blocker 2 — exact OCR resolution audit fields

RFA-04 AC04 and telemetry now require the canonical eight fields exactly:

- `nodeId`
- `priorOverlayRevision`
- `newOverlayRevision`
- `reviewerId`
- `resolvedText`
- `resolvedRole`
- `resolvedDisposition`
- `resolvedAt`

The validator enforces parity with `structureContract.ocrReviewRequiredPolicy.requiredAuditFields`.

## Blocker 3 — repository-wide long-form waveform and media selection ownership

RFA-09 owns the completed-job media selector in `frontend/src/api.ts` and must replace Reader full-audio fallback with manifest segment selection.

RFA-13 owns:

- `frontend/src/audioWaveform.ts`
- `frontend/src/waveform.ts`
- `frontend/src/features/teleprompt`
- `frontend/src/features/book-cinema/BookCinemaPanel.tsx`
- `frontend/src/features/cinema/PreparedSourceCinemaTransportHelpers.tsx`
- the existing App waveform and segment fan-out paths

Long-form Reader, Cinema, and Teleprompt surfaces must use server waveform envelopes and bounded manifest segments; they cannot fetch or decode full audio for waveform display.

RFA-16 owns the `GlobalPreviewPlayer` waveform path. The only local full-clip waveform exception is a voice-comparison or voice-cloning `AuditionSessionId` clip no longer than 30 seconds and no larger than 5 MiB. It cannot carry a `VoiceJob` or narration `runId`; over-limit clips use a server envelope or no waveform.

## Exact source ownership audit

`docs/reviews/reader-first-audits/source-scope-ownership-v5.md` binds the current `projectState.ts`, `App.tsx`, and status-strip symbols, including the corrected `ArrivalAudioPlayerQueue()` owner.

## Validator closure

Mutation tests reject:

- drift in exact RFA-13 exception parity or missing concurrency reason telemetry;
- drift in exact RFA-04 OCR audit fields;
- removal of any shared long-form waveform/media selector path from RFA-09/RFA-13;
- drift in bounded Audition clip duration, byte cap, identity, or over-limit behavior;
- stale `VoiceJobPlayer` ownership or missing global Preview ownership bridge.

Issue IDs and dependency edges remain unchanged. `peerApproved`, `linearCreationAuthorized`, and `productImplementationAuthorized` remain false; `authorizedIssues` remains empty.
