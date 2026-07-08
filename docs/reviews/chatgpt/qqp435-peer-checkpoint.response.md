PEER REQUEST_CHANGES

QQP-435 acceptance is not satisfied: restart/cancel retry scoping can over-mark a compatible ready prefix as interrupted/retryable.

Release-blocking blocker: backend/internal/pipeline/service.go:synthesizeUntilComplete persists active metadata after a successful segment with AudioReadySegments = nextSegment and Retries.CurrentSegment = nextSegment before job completion; backend/internal/pipeline/service.go:markInterruptedRuntimeJob only recomputes the current segment when CurrentSegment <= 0 and marks segmentIndex == CurrentSegment interrupted even if that segment is already ready; backend/internal/pipeline/audio_artifact_states.go:deriveSegmentAudioArtifactState then converts that ready segment to interrupted_retriable. A backend restart between persisted segment 1 and pending segment 2 can therefore retry segment 1 instead of the affected pending/interrupted segment.

Prior quality blockers remain fixed: resume artifact evidence now fails closed on missing/wrong UnitID/SegmentID, and interrupted metadata write failures surface in in-memory job error/progress detail while preserving interrupted/retriable state.

Non-blocking follow-up: add a regression for restart/cancel immediately after persisting a ready prefix and before the next segment has a persisted running/checking status.
---
Source: ChatGPT Project TTS-Research
Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4e52e7-03e4-83eb-a4c9-8c88d7d866c7
Archive: /tmp/tts-research-qqp435-peer-20260708T133733Z.zip
Archive-SHA256: 317078cdb98dc40f1209e1a4ceb4b4cb070df4b1a8c996ad982c5dc735f0da2b
Archive-Bytes: 22247808
