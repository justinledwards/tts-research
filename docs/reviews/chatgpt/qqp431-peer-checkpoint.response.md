# ChatGPT peer checkpoint — QQP-431 incremental speech-plan segmentation

- Date: 2026-07-08
- Project: TTS-Research
- ChatGPT Project: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/project
- Archive: `output/chatgpt-review-packages/qqp431-peer-current-worktree.zip`
- Archive SHA256: `0faeea9d4b3e6f9750748b6ef1460e3350c7867db3e860bb3354b6593e78c975`
- Verdict: `PEER REQUEST_CHANGES`

## Blocking findings

1. Manifest-bound identity can still be emitted under-bound.
   - `validateManifestUnitIdentities` allows blank `UnitID`; `nodeForManifestUnit` can resolve by `NodeID`; `segmentBinding` can emit empty `readingUnitId` / `unitId`.
   - Empty `orderKey` and `unitFingerprint` are also permitted despite reading-unit manifest identity/order/fingerprint expectations.
   - `BuildFirstNarratablePrefixFromContentIR` derives `sourceID` with fallback but does not reject empty final source ID or `options.SourceID` / IR source mismatch.
   - Required fix: fail closed for non-empty final sourceId, source mismatch when both are present, and non-empty `UnitID`, `OrderKey`, `Fingerprint` for every manifest-bound unit.

2. Readalong membership can be contradicted by node-ID fallback.
   - `manifestUnitInReadalong` accepts membership when `ReadalongUnitIDs` contains either `unit.UnitID` or `unit.NodeID`.
   - Readalong manifest contract field is `unitIds`; accepting `NodeID` can include a unit not actually in the readalong manifest.
   - Required fix: treat `ReadalongUnitIDs` as unit IDs only, require non-empty `unit.UnitID`, and add regression where `ReadalongUnitIDs` excludes `unit.UnitID` but includes `unit.NodeID`.

3. Narratable units with missing backing Content IR nodes fail open as a prefix gap.
   - `nodeForManifestUnit` returns empty node + nil when narratable/readalong-included unit without `NodeID` cannot be resolved by `UnitID`; caller silently breaks on empty node.
   - Required fix: once a readalong-included unit passes narratable readiness, missing node resolution should return an error naming the `unitId`. Keep ordinary prefix breaks for explicit readiness gaps and speech-ineligible nodes.

4. `reuseKey` is under-keyed for actual synthesis input.
   - `plainSSML` / serializer targets can change through `node.Metadata["speechRender"].ssml`, generated SSML can change with `node.Lang`, and pronunciation/lexicon targets affect synthesis payload.
   - Existing `speechTextHash` + `voiceEnginePolicyHash` do not necessarily change for SSML/lang/pronunciation/lexicon changes.
   - Required fix: add or expand a synthesis input hash covering plain text, SSML, language, PLS refs / pronunciation refs, voice, engine, and policy version; include it in `reuseKey`; add tests for language, SSML, pronunciation/lexicon changes.

## Non-blocking follow-ups

- Consider a typed internal `SegmentBinding` struct before assigning metadata.
- Consider diagnostic `firstNarratablePrefixStopReason` metadata later.

## Rationale

ChatGPT agreed the basic explicit-prefix cases are covered and found no QQP-432+ runtime scope creep, but judged the seam not safe for Linear Done because under-bound unit/source identity, readalong membership contradiction, silent missing-node truncation, and under-keyed synthesis reuse can break downstream QQP-432 audio artifact reuse and QQP-433 sync-fidelity assumptions.
