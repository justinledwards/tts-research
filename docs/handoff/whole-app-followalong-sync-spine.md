# Whole-App Follow-Along Sync Spine Handoff

Generated: 2026-05-27 23:29 CEST

## Purpose

This handoff captures the current state of the Whole-App Follow-Along Sync Spine work from the conversation history. It is meant for the next engineer or agent to continue implementation without rediscovering the same architecture.

The requested feature is a single app-wide sync path:

`audioTime -> sourceWordId -> rendered token`

Book Cinema, Theatre, Teleprompt, Markdown/Document Cinema, and other follow-along surfaces should stop using cue-local, batch-local, or segment-local ordinals as the active highlight identity. Those ordinals may remain adapter inputs, but rendered UI should consume canonical `sourceWordId` identity through one shared runtime snapshot.

## Current Status

No production implementation files were edited during the sync-spine exploration before this handoff. The work so far was inspection and design alignment.

The repository already has important pieces of the desired architecture:

- `frontend/src/features/readalong/wordTimeline.ts` already defines `WordTimeline`, `WordTimelineEntry`, `NarrationWordLedgerEntry`, `SpeechTokenLedgerEntry`, `resolveWordTimelineAtCursor`, `wordTimelineFromHighlightMapV2`, and `wordTimelineFromLegacyHighlightMap`.
- `resolveWordTimelineAtCursor` already performs binary-search style timeline lookup over sorted entries and returns an active entry plus phrase range.
- Timeline entries already carry `sourceWordId`, `sourceWordIndex`, `spokenTokenId`, `segmentId`, absolute audio timing, provenance, confidence, and timing level.
- `HighlightRenderer` already accepts `activeSourceWordId` and writes `data-source-word-id` for tokens that have source identity.
- `BookCinema` page structure already emits structured page tokens with `sourceWordId` via `bookPageStructuredBlocks`.
- Teleprompt Theatre already maps cue word timings to `sourceWordId` when those timings exist.

The missing piece is the shared ownership layer and full consumer migration:

- There is no `NarrationSyncProvider` yet.
- `ReadAlongRuntimeSnapshot` is still cue/token-index oriented.
- Book Cinema and Prepared Source Cinema still calculate local `activeWordIndex` and then convert timing into UI highlight state.
- Markdown rendering still highlights by block-local active word offset and only emits index attributes for the active word.
- Teleprompt cue sync still owns its own cue timeline and returns `currentWordIndex` as a live runtime highlight path.
- Sync diagnostics currently show cue/token-centric data instead of canonical source identity and mounted-token state.

## Files Already Inspected

Core read-along:

- `frontend/src/features/readalong/wordTimeline.ts`
- `frontend/src/features/readalong/readAlongState.ts`
- `frontend/src/features/readalong/ReadAlongResyncController.ts`
- `frontend/src/features/readalong/syncDebugSnapshot.ts`
- `frontend/src/features/readalong/SyncDebugOverlay.tsx`
- `frontend/src/features/readalong/HighlightRenderer.tsx`
- `frontend/src/features/readalong/index.ts`

Book Cinema and document rendering:

- `frontend/src/features/book-cinema/model.ts`
- `frontend/src/features/book-cinema/BookCinemaPanel.tsx`
- `frontend/src/features/cinema/BookDocumentReaderStage.tsx`
- `frontend/src/MarkdownRenderer.tsx`

Prepared Source Cinema:

- `frontend/src/features/cinema/PreparedSourceCinemaBase.tsx`

Teleprompt and Theatre:

- `frontend/src/features/teleprompt/telepromptCueTimeline.ts`
- `frontend/src/features/teleprompt/TelepromptTheatre.tsx`
- `frontend/src/features/teleprompt/TelepromptStudio.tsx`

Relevant tests found by search:

- `frontend/src/features/readalong/readAlongRuntime.test.ts`
- `frontend/src/features/readalong/timingArtifact.test.ts`
- `frontend/src/features/readalong/syncDebugSnapshot.test.ts`
- `frontend/src/features/readalong/alignmentRepairModel.test.ts`
- `frontend/src/features/book-cinema/model.test.ts`
- `frontend/src/features/teleprompt/telepromptCueSync.test.ts`
- `frontend/src/features/teleprompt/teleprompt.test.ts`

## Key Existing Behavior

### `wordTimeline.ts`

This is the best foundation for the new shared contract. It already normalizes both v2 and legacy highlight maps into `WordTimeline`.

Important exports:

- `sourceWordIdFor(sourceId, scopeKey, sourceWordIndex)`
- `sourceWordIdForSpan(sourceId, scopeKey, span)`
- `buildNarrationWordLedger(...)`
- `wordTimelineFromHighlightMapV2(...)`
- `wordTimelineFromLegacyHighlightMap(...)`
- `resolveWordTimelineAtCursor(timeline, cursorMs)`
- `wordTimelineEntryForSourceWordId(...)`

Important implementation detail:

`activeTimelineEntryAtCursor` currently returns the closest entry before the cursor, or the first entry if before the timeline. For fail-closed stale clearing, the provider may need stricter behavior: when the cursor is outside any entry, it should expose no active source word unless degraded mode intentionally says otherwise.

### `readAlongState.ts` and `ReadAlongResyncController.ts`

Current runtime snapshots expose:

- `activeCue`
- `activeTokenIndex`
- `expectedCue`
- `expectedTokenIndex`
- `mode`
- `state`
- `confidence`
- `driftMs`
- `reason`
- `timingSource`

They do not expose:

- `activeSourceWordId`
- `activeSpokenTokenId`
- `activeSegmentId`
- `activeTimelineEntry`
- `activePhraseSourceWordIds` or source-word range
- `degradedSyncReason` as a canonical field
- mounted token count or visibility state

Best next step is to add a new `SyncSnapshot` or `NarrationSyncSnapshot` contract while keeping the old snapshot fields compatible during migration.

### `HighlightRenderer.tsx`

Already supports:

- `activeSourceWordId`
- `data-source-word-id`
- phrase range by `wordIndex`

Current risk:

`active` is computed as source identity OR `token.wordIndex === activeWordIndex`. During migration, UI surfaces should pass `activeSourceWordId` and avoid `activeWordIndex` for active highlighting. Index may still be acceptable for non-timing layout, pagination, or manual fallback.

`splitHighlightText` currently produces tokens without source IDs. Any text-only surface using it cannot participate in canonical highlight identity unless callers supply tokens or defaults are extended.

### `BookCinemaPanel.tsx`

Current local timing flow:

- `resolveBookActiveWordIndex(...)` estimates active index from progress.
- `resolveHighlightCue(...)` resolves legacy cue.
- `ReadAlongResyncController` creates a cue-centric runtime snapshot.
- `resolveBookTimingMapV2WordIndexes(...)` and `resolveBookTimingCueWordIndexes(...)` convert timing to source word indexes.
- `readerActiveWordIndex` is passed into `BookCinemaReaderStage`.

This is the main place to wire a provider near audio playback ownership for books.

Likely provider inputs here:

- `sourceId: book.id`
- `scopeKey: bookScopeKey(normalizedScope)`
- `spans: scopedSpans`
- `blocks: scopeContent?.blocks`
- `highlightMap`
- `highlightMapV2`
- `audioTimeSec: calibratedPlaybackCursorSec`
- `generatedAudioState`
- `isPlaying`, `isPaused`, `isSeeking`

Likely provider output replacements:

- `activeSourceWordId`
- `activeSourceWordIndex` for pagination and legacy UI labels only
- `activeEntry`
- `activePhraseWordStart` / `activePhraseWordEnd`
- `state`, `mode`, `confidence`, `reason`
- render registry fields

### `BookDocumentReaderStage.tsx`

Current props are index-first:

- `activeWordIndex`
- `phraseWordStart`
- `phraseWordEnd`

It resolves `activeSpan` by index and calls `MarkdownRenderer` with `activeWordIndex` and block-local `activeWordOffset`.

Needed migration:

- Accept `activeSourceWordId`.
- Resolve active span from `sourceWordIdForSpan(book.id, bookScopeKey(scope), span)`.
- Pass `activeSourceWordId` into Markdown highlighting.
- Ensure markdown-rendered words include `data-source-word-id`.

### `MarkdownRenderer.tsx`

Current `MarkdownWordHighlight`:

- `activeWordOffset`
- optional `activeWordIndex`
- block offsets and IDs

Current output:

- Only the active word becomes a span.
- It emits `data-readalong-word-index` if provided.
- It does not emit `data-source-word-id`.

Needed migration:

- Add optional `activeSourceWordId`.
- Add optional source-word-id resolver or base source index for block words.
- Emit spans for follow-along words with `data-source-word-id`, not just the active word.
- Keep skipped speech elements untouched.

Conservative approach:

- For Book Document, pass a per-block `sourceWordIdsByOffset` map based on `scopedSpans`.
- For Prepared Source, add a helper that derives stable ids from `source.id`, a scope key such as `"prepared"`, and source word index.
- Keep existing index props temporarily for compatibility, but active class should prefer source identity.

### `PreparedSourceCinemaBase.tsx`

Current flow is still index-driven:

- Receives `activeWordIndex` as prop.
- Derives `effectiveActiveWordIndex`.
- Calls `resolveReadAlongRuntimeSnapshot(...)`.
- Calls `resolvePreparedSourceActiveWord(source, activeWordIndex)`.
- Passes `activeWordIndex` into `PreparedSourceCinemaReader`.
- `PreparedSourceCinemaBlock` passes `activeWordOffset` to `HighlightRenderer`.

Needed migration:

- Build or reuse a word ledger/timeline for prepared sources.
- Use `activeSourceWordId` as highlight identity.
- Keep index only for compatibility and scroll fallback.
- Ensure block tokens get source IDs.

Potential complication:

Prepared sources may not have `BookSourceWordSpan`. A small adapter will likely be needed to create `BookSourceWordSpan`-like ledger entries from `NarrationBlock` offsets or from `resolvePreparedSourceActiveWord`.

### `telepromptCueTimeline.ts`

Current Teleprompt timeline already captures source identity where possible:

- `TelepromptCueWordTiming.sourceWordId`
- `sourceWordIndex`
- `spokenTokenId`
- absolute audio timing

But runtime still exposes and uses:

- `currentWordIndex`
- `currentSourceWordId`
- `currentSourceWordIndex`

Needed migration:

- Let Teleprompt consume the shared `NarrationSyncSnapshot` where possible.
- If Teleprompt keeps cue sync for cue navigation, it should treat `currentWordIndex` as adapter/layout data and active highlight should use `currentSourceWordId`.
- `runtimePositionForCue` currently returns `currentSourceWordId: null` when exact word timing is missing and falls back to a cue-local estimated word index. That should become explicit degraded sync rather than an active source-word highlight.

### `TelepromptTheatre.tsx`

Already good pieces:

- Accepts `currentSourceWordId`.
- Maps word timings to source IDs.
- Passes `activeSourceWordId` to `HighlightRenderer`.
- Crawl transform is row-gated by active DOM row.

Remaining risk:

- It also passes `activeWordIndex={currentWordIndex}` to `HighlightRenderer`, so local cue indexes can still create active highlights when source identity is missing.
- Crawl effect is triggered by `currentWordIndex`; it should key off `currentSourceWordId` or active mounted token row so same-row word changes do not move transform.

Conservative fix:

- Pass `activeWordIndex={null}` when `currentSourceWordId` is available or when degraded exact sync is unavailable.
- Change crawl effect dependency from `currentWordIndex` to `currentSourceWordId` plus cue identity.
- If no active source word is mounted, clear stale active behavior and report not visible through registry/diagnostics.

## Proposed Implementation Shape

### 1. Add a shared provider module

Suggested file:

`frontend/src/features/readalong/NarrationSyncProvider.tsx`

Suggested public exports:

- `NarrationSyncProvider`
- `useNarrationSync`
- `useOptionalNarrationSync`
- `resolveNarrationSyncSnapshot`
- `NarrationSyncSnapshot`
- `NarrationSyncProviderInput`

Suggested snapshot fields:

- `audioTimeSec`
- `activeSourceWordId`
- `activeSourceWordIndex`
- `activeSpokenTokenId`
- `activeSegmentId`
- `activeBlockId`
- `activeText`
- `activePhraseWordStart`
- `activePhraseWordEnd`
- `activeTimelineEntry`
- `confidence`
- `mode`
- `state`
- `timingSource`
- `provenance`
- `degradedReason`
- `visibility`
- `mountedTokenCount`
- `isActiveWordMounted`

Keep `ReadAlongRuntimeSnapshot` compatibility during migration by either:

- Extending it with optional canonical fields, or
- Building `ReadAlongRuntimeSnapshot` from `NarrationSyncSnapshot` where legacy consumers still expect it.

### 2. Normalize timeline before playback

Use existing timeline builders:

- Prefer `wordTimelineFromHighlightMapV2`.
- Fall back to `wordTimelineFromLegacyHighlightMap`.
- Fall back to estimated source position only as degraded, with no exact `activeSourceWordId` unless the estimate can be tied to a source span.

Provider should own monotonic and fail-closed behavior:

- Sort globally by absolute audio time.
- Detect non-monotonic handoff or repeated batch-local token indexes.
- Expose degraded reason if timeline is empty, stale, non-monotonic, out of range, or only estimated.
- Clear `activeSourceWordId` when no current exact timeline entry exists.

### 3. Add render registry

Suggested file:

`frontend/src/features/readalong/renderRegistry.tsx`

Minimal contract:

- Register mounted tokens by `sourceWordId`.
- Track count and whether the active source word is visible.
- Expose query helpers for scroll/crawl surfaces.

Initial implementation can be lightweight:

- DOM-query based helper using `[data-source-word-id="..."]`.
- Context registry can come later if DOM query is enough for first migration.

### 4. Migrate Book Cinema first

Book Cinema is the highest-value anchor because it has source spans and already has v2/legacy timing.

Replace in `BookCinemaPanel.tsx`:

- `resolveBookTimingMapV2WordIndexes`
- `resolveBookTimingCueWordIndexes`
- direct active cue/index highlight paths

With:

- `NarrationSyncProvider` or `resolveNarrationSyncSnapshot(...)`
- `snapshot.activeSourceWordId`
- `snapshot.activeSourceWordIndex` for pagination and labels
- `snapshot.activePhraseWordStart` / `snapshot.activePhraseWordEnd`

Keep `resolveDisplayedBookActiveWordIndex` for progress compatibility, but do not let it choose active highlight identity when exact snapshot is absent.

### 5. Migrate rendered words

Book paged reader:

- Pass `activeSourceWordId` to `HighlightRenderer`.
- Stop passing `activeWordIndex` for active highlight.
- Page tokens already have source IDs.

Book markdown/document reader:

- Pass `activeSourceWordId`.
- Make `MarkdownRenderer` emit `data-source-word-id` for word tokens.

Prepared Source:

- Add source IDs to block text tokens.
- Pass `activeSourceWordId`.
- Keep block scroll fallback by block ID.

Teleprompt Theatre:

- Keep `currentSourceWordId`.
- Remove local word index as active highlight fallback.
- Make crawl row movement depend on mounted active source word.

## Guardrails And Tests To Add

Focused unit tests:

- Timeline normalization across multiple speech batches where `tokenIndex` resets but `sourceWordId` continues.
- Binary search at first block, second block, middle document, late document, segment boundaries, seeks, pauses, and playback-rate changes.
- Fail-closed behavior when cursor is between/outside exact entries.
- Legacy map conversion marked degraded when only estimated identity is available.

Rendering tests:

- Book paged reader: exactly one active token by `data-source-word-id`.
- Book markdown reader: active token has `data-source-word-id`.
- Prepared Source/Website Cinema: active token uses source identity.
- Teleprompt Theatre: active source word wins over cue-local word index; no stale active class after source word becomes unavailable.

Theatre-specific test:

- Heading/subheading/body combined cue shares one source identity stream.
- Same-row word changes do not change transform.

Search/lint guardrail:

- Add a focused assertion that UI follow-along surfaces do not use `tokenIndex`, `currentWordIndex`, cue-local index, or batch-local index as active highlight identity.
- Allow those fields in adapters, tests, and diagnostics only.

Manual/E2E gate:

- Seek Book Cinema, Theatre, Teleprompt, Document Cinema/Website Cinema to 10%, 35%, 65%, and 90%.
- Assert active source word advances and does not freeze at a batch boundary.

## Important Risks

- `resolveWordTimelineAtCursor` currently returns closest previous or first entry when no exact entry matches. That is convenient for UI continuity but conflicts with the fail-closed requirement. Add a strict resolver or option instead of changing behavior blindly if existing tests rely on nearest-entry fallback.
- `HighlightRenderer` still highlights by `activeWordIndex` when provided. During migration, avoid passing that prop from runtime surfaces unless the mode is explicitly degraded and visibly marked.
- Markdown currently wraps only the active word. To support render registry and no-stale semantics, follow-along markdown should wrap all visible words or otherwise register each rendered source word.
- Prepared sources may need a new ledger adapter because they do not naturally expose `BookSourceWordSpan`.
- Teleprompt cue-local `currentWordIndex` is still useful for presenter UI and estimated progress, but it should not drive exact active highlight.
- Multiple `WORKINGLOG.md` entries already exist for this work. Keep them concise and append-only; do not clean up unrelated history as part of the sync-spine patch.

## Suggested Next Session Prompt

Continue the Whole-App Follow-Along Sync Spine implementation from `docs/handoff/whole-app-followalong-sync-spine.md`. Start by adding `NarrationSyncProvider` and a strict canonical `NarrationSyncSnapshot` in `frontend/src/features/readalong`, using existing `wordTimeline.ts` builders. Then migrate Book Cinema paged reader to pass `activeSourceWordId` into `HighlightRenderer` and add focused tests for v2 `tokenIndex` reset across batches.

## Validation Not Run

No test or check command was run for this handoff-only document change.
