# Progressive media, timing, and browser resource audit

Read-only audit captured 2026-07-10.

## Outcome

### Repository and runtime proof

- Repository: `/home/phoenix/projects/repos/tts-research`
- Branch: `niklas/voice-studio-follow-up`
- HEAD: `e97ff6f4932f4429939f1c278e1d4b8361ac6688`
- Worktree was heavily dirty before and after investigation: 54 status lines; I made no changes.
- Live API process was running from the repository’s `backend` directory on port 8080 with Kokoro, two workers, and 300-rune segments.

Live job `2f752faaa77ec7b1`:

- `completed`, provider `kokoro`
- 1,680/1,680 segments ready and checked
- Duration: 27,606.825 seconds
- Final WAV: 1,325,127,644 bytes
- Segment WAV total: 1,325,201,520 bytes
- Timing: heuristic phrase-level, confidence `0.625`
- `providerTimingAvailable=false`
- `forcedAlignmentAvailable=false`
- `wordTimingReliable=false`
- `exactAllowed=false`
- `firstPlayableAt` was correctly recorded after the initial accepted segment.

Current artifact sizes observed:

- `highlight-map.json`: 88,691,174 bytes
- `highlight-map.v2.json`: 4,773,802 bytes
- `token-timing.json`: 15,051,953 bytes
- `fragment-timing.json`: 803,023 bytes
- `speech-plan.v1.json`: 3,813,637 bytes

## RCA

### 1. The backend becomes playable early, but its public whole-audio contract does not scale

The pipeline already publishes checked immutable segment WAVs and advances:

- `audioReadySegments`
- `audioPartialPCM`
- `firstPlayableAt`
- per-segment duration/state

Relevant paths:

- `backend/internal/pipeline/service.go`
- `backend/internal/pipeline/speech_rendering.go`
- `backend/internal/pipeline/models_runtime.go`
- `backend/internal/httpapi/voice_job_routes.go`

But `/audio` and `/audio/partial` materialize and return an entire WAV. Live Range probes against both endpoints returned:

- `200 OK`, not `206`
- no `Accept-Ranges`
- no `Content-Range`
- full 1.325 GB `Content-Length`
- `Cache-Control: no-store`

The per-segment endpoint exists and is the correct progressive primitive, but it also returns `no-store`.

### 2. The progressive browser player is not browser-light

`ArrivalAudioPlayerQueue` in `frontend/src/App.tsx`:

- Computes every missing segment from `loadedThrough + 1` through `audioReadySegments`.
- Starts all those fetches simultaneously with `Promise.all`.
- Calls `decodeAudioData` for every segment.
- Retains every decoded `AudioBuffer` permanently in `segmentsRef`.
- Schedules all buffered sources through Web Audio.
- Has no download concurrency bound, lookahead window, eviction, or retry/backpressure protocol.

Opening a completed 1,680-segment book and pressing play can therefore trigger 1,680 concurrent requests and decode the entire book. At 24 kHz mono float32, decoded PCM for this job is approximately **2.47 GiB**, excluding browser and Web Audio overhead.

The completed player has a second large-book problem: `useCompletedWaveformBars` fetches the complete audio into an `ArrayBuffer` and decodes it solely to build waveform bars.

### 3. Timing artifacts are whole-job snapshots, not progressive windows

`backend/internal/pipeline/timing_artifacts.go` rebuilds normalized timing and highlight artifacts from all ready segments. Frontend API helpers fetch whole JSON artifacts, and Book Cinema receives whole `HighlightMap`/`HighlightMapV2` objects.

There is no contract for:

- Segment-relative timing publication
- Append-only timing revisions
- Timing windows around the playback cursor
- ETags/cursors/deltas
- “audio ready, alignment pending” per segment
- Stable finalization/version semantics

The 88.7 MB legacy map is especially unsuitable for immediate reader entry.

### 4. Current provider integration exposes no real native timestamps

`agents.TTSResult` has a valid extension point:

```go
TimingEvents []alignment.NativeTimingEvent
```

The pipeline offsets and collects these per segment, and `alignment.NormalizeNativeEvents` validates monotonicity, duration bounds, and confidence.

However, no current Go TTS implementation populates `TimingEvents`:

- Kokoro returns WAV plus duration/metadata only.
- Supertonic returns WAV plus duration/metadata only.
- Mock also emits no timing.
- Searches found no `TimingEvents:` producer.

Provider capability metadata can advertise `wordtiming`, `phrasetiming`, and `streaming`, but that is declarative and does not prove the active adapter emits timing events. Kokoro’s current Python bridge emits audio metadata, not word timestamps.

Thus native-timestamp support exists in the schema and consumer pipeline, but not in the actual integrations inspected.

### 5. Forced alignment is final-audio-only

`backend/internal/alignment/alignment_service.go:110` explicitly requires:

- `request.Final == true`
- a complete `AudioPath`
- an enabled aligner

Consequently MFA/Aeneas/Gentle cannot currently improve timing concurrently with synthesis. The running process also had no alignment configuration enabled, yielding provider-only heuristic fallback.

### 6. The frontend can visually misrepresent trust

The backend correctly denies exact highlighting for this job, but `BookDocumentReaderStage.tsx` hard-codes rendered timing state as `"trusted"` for block and word highlights. Trust/fidelity should flow from the timing decision, not be assigned by the rendering component.

## Recommended target architecture

### Progressive manifest

Introduce:

`GET /api/voice-jobs/{id}/playback-manifest?v=...`

with ETag/conditional polling, plus SSE or long-poll notification. The manifest should be append-only and contain:

- Job/revision/audio compatibility IDs
- Codec/container/sample rate
- `publishedThroughSegment`
- `final`
- Immutable segment records:
  - stable ID/index
  - URL, byte length, checksum
  - exact timeline start and duration
  - source text/token range
  - timing state: `native`, `aligned`, `pending`, `heuristic`, `failed`
  - timing revision, confidence, and URL
- Seek index at chapter/coarse time boundaries

Segments must use immutable, content-addressed URLs with:

- `Cache-Control: public, max-age=31536000, immutable`
- ETag/checksum
- bounded compressed media rather than an expanding WAV

Retain `/audio` for export/download, adding standards-compliant Range via `http.ServeContent`.

### Browser delivery

Best target: fragmented MP4 through MSE using AAC, with an Opus/WebM rendition where supported.

Browser controller should:

- Maintain only a 30–60 second lookahead.
- Limit network concurrency to 2–4.
- Append media in timeline order.
- Remove played media outside a 30–60 second back-buffer.
- Abort stale requests after seeks.
- Keep metadata/timing independent of decoded audio.
- Never retain all book PCM.
- Use a server-produced waveform envelope, not full-audio decoding.

A sequential immutable-segment `<audio>` player is an acceptable first slice, but MSE is the gapless, seekable target.

### Concurrent alignment

For each accepted synthesis segment:

1. Publish audio immediately.
2. If the provider emits trustworthy native word/mark timestamps, publish them immediately as final timing for that segment.
3. Otherwise enqueue forced alignment against that immutable segment concurrently.
4. Publish segment-relative word timing when alignment completes; compute absolute time from manifest start offset.
5. Permit timing revisions only for unplayed/future segments. Freeze timing behind the playback cursor to prevent backward highlight jumps.
6. Run optional final whole-job validation without blocking playback.

Kokoro/Supertonic should be classified as `alignment-required` until their adapters genuinely populate `TimingEvents`.

### Degraded policy

- **Exact word:** native or forced-aligned, monotonic, mapped, confidence threshold passed.
- **Phrase:** reliable phrase timing only; phrase highlight, no moving word claim.
- **Block:** heuristic timing; highlight current block only.
- **Audio-only:** alignment pending/failed and no trusted phrase timing; suppress synchronized highlighting.
- Never interpolate heuristic token times and label them “word accurate.”
- Surface timing state and reason in the manifest/UI.
- `exactAllowed` remains authoritative.

## Migration slices

1. **First issue — bounded progressive segment player**
   - Add a manifest projection over existing segment WAVs.
   - Replace `Promise.all(all missing segments)` with a concurrency-limited sliding window and eviction.
   - Add immutable cache headers.
   - This removes the immediate memory/request explosion without changing synthesis.

2. Add segment-scoped timing documents and manifest timing states.

3. Run forced alignment per accepted segment rather than only against final audio.

4. Integrate genuine provider-native events where supported; keep Kokoro alignment-required.

5. Add MSE compressed renditions and server-generated waveform envelopes.

6. Window Book Cinema timing consumption and retire the full legacy highlight-map path.

7. Add Range support to final export audio and preserve old endpoints for compatibility.

## Exact test locations and acceptance probes

Backend:

- Extend `backend/internal/httpapi/router_test.go` for manifest, cache, ETag, Range/206, and segment readiness.
- Extend `backend/internal/pipeline/timing_artifacts_test.go`.
- Extend `backend/internal/alignment/alignment_service_test.go` and `timing_schema_test.go`.
- Extend `backend/internal/pipeline/sync_fidelity_decisions_test.go`.

Frontend:

- Extract the queue from `frontend/src/App.tsx` and add focused player tests.
- Extend:
  - `frontend/src/features/readalong/ReadAlongWordScheduler.test.ts`
  - `wordTimeline.test.ts`
  - `timingArtifact.test.ts`
  - `frontend/src/features/book-cinema/degradedState.test.tsx`
  - `frontend/src/api.test.ts`

Acceptance probes:

- Reader becomes usable after the first segment is published.
- First audio starts within one segment fetch/decode cycle.
- No more than four segment requests in flight.
- Buffered media stays under 60 seconds; back-buffer under 60 seconds.
- JS/Web Audio memory remains bounded during one hour of playback.
- No segment is downloaded twice without eviction/seek justification.
- Completed 1,680-segment job does not initiate 1,680 requests.
- Seeking aborts obsolete requests and restarts from indexed segment.
- Native/aligned word timing meets a defined p95 boundary-error target.
- Heuristic job never renders word mode or claims trusted timing.
- Manifest revisions never move already-played cues backward.
- Legacy `/audio` returns `206` for valid Range requests.

## Changes and issues

- **Files created or modified:** none.
- **Tests run:** no repository test suites; read-only live HTTP/header and artifact inspections were performed.
- **Issues encountered:** no blocker. One artifact inventory command produced very large output and was truncated, so targeted `stat`/JSON probes were used instead.
