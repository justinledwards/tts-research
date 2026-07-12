import { describe, expect, it } from "vitest";
import {
  addAlignmentRepairCandidate,
  addAlignmentRepairOperation,
  addAlignmentRepairOperationFromCandidate,
  alignmentRepairMapStaleness,
  alignmentRepairSummary,
  createAlignmentRepairCandidateFromSyncSnapshot,
  createAlignmentRepairMap,
  parseAlignmentRepairMap,
  serializeAlignmentRepairMap,
} from "./alignmentRepairModel";
import { buildReadAlongSyncDebugSnapshot } from "./syncDebugSnapshot";

const context = {
  contentFingerprint: "source-v1-policy-v1-run-v1",
  generatedAudioId: "audio-1",
  projectId: "project-1",
  sourceId: "source-1",
  speechPlanId: "speech-plan-1",
};

describe("alignmentRepairModel", () => {
  it("creates versioned project-local repair maps without source mutation", () => {
    const map = createAlignmentRepairMap(context, "2026-05-26T08:00:00.000Z");
    const repaired = addAlignmentRepairOperation(
      map,
      {
        deltaMs: 120,
        fragmentIndex: 2,
        kind: "adjust-fragment-boundary",
        reason: "Provider boundary was late.",
      },
      "2026-05-26T08:01:00.000Z",
    );

    expect(repaired.operations).toHaveLength(1);
    expect(repaired.operations[0]).toMatchObject({
      deltaMs: 120,
      fragmentIndex: 2,
      kind: "adjust-fragment-boundary",
    });
    expect(map.operations).toHaveLength(0);
    expect(alignmentRepairSummary(repaired)).toContain("Boundary adjustment: 1");
  });

  it("flags stale repairs when audio, speech plan, or content fingerprint changes", () => {
    const map = createAlignmentRepairMap(context);

    expect(alignmentRepairMapStaleness(map, context)).toMatchObject({ stale: false });
    expect(
      alignmentRepairMapStaleness(map, { ...context, generatedAudioId: "audio-2" }),
    ).toMatchObject({
      reason: "Generated audio changed; repair must be reviewed again.",
      stale: true,
    });
    expect(
      alignmentRepairMapStaleness(map, { ...context, contentFingerprint: "source-v2" }),
    ).toMatchObject({
      reason: "Source, policy, or run configuration changed.",
      stale: true,
    });
  });

  it("round-trips export and import repair maps", () => {
    const map = addAlignmentRepairOperation(createAlignmentRepairMap(context), {
      kind: "mark-token-unspoken",
      reason: "Citation marker is skipped by policy.",
      tokenIndex: 4,
    });

    expect(parseAlignmentRepairMap(serializeAlignmentRepairMap(map))).toMatchObject({
      generatedAudioId: "audio-1",
      operations: [{ kind: "mark-token-unspoken", tokenIndex: 4 }],
      sourceId: "source-1",
    });
  });

  it("stores QA drift markers as repair candidates and links repair actions", () => {
    const snapshot = buildReadAlongSyncDebugSnapshot({
      activePhraseText: "the highlighted phrase",
      activeWordText: "highlighted",
      capturedAt: "2026-05-27T11:00:00.000Z",
      currentSourceLocator: {
        activeWordIndex: 12,
        blockId: "block-1",
        kind: "prepared-source",
        projectId: "project-1",
        sourceId: "source-1",
        textQuote: "expected",
        value: "prepared-source:source-1:block-1:word-12",
      },
      runtime: {
        activeCue: null,
        activeTokenIndex: 7,
        audioTimeSec: 31.25,
        confidence: 0.72,
        driftMs: 180,
        expectedCue: null,
        expectedTokenIndex: 8,
        mode: "word",
        reason: "Runtime drift exceeds the word budget.",
        resyncCount: 1,
        state: "degraded",
        timingSource: "trusted-word",
      },
      surface: "DocumentCinema",
    });
    const candidate = createAlignmentRepairCandidateFromSyncSnapshot(
      snapshot,
      "2026-05-27T11:01:00.000Z",
    );
    const map = addAlignmentRepairCandidate(
      createAlignmentRepairMap(context),
      candidate,
      "2026-05-27T11:02:00.000Z",
    );
    const repaired = addAlignmentRepairOperationFromCandidate(
      map,
      candidate.id,
      "phrase-fallback",
      "2026-05-27T11:03:00.000Z",
    );

    expect(repaired.candidates).toHaveLength(1);
    expect(repaired.candidates[0]).toMatchObject({
      actualHighlightedWord: "highlighted",
      audioTimestamp: "00:31.25",
      expectedVisibleWord: "expected",
      timingSource: "trusted-word",
    });
    expect(repaired.operations[0]).toMatchObject({
      candidateId: candidate.id,
      kind: "force-phrase-fallback",
    });
    expect(alignmentRepairSummary(repaired)).toContain("Repair candidates: 1");
    expect(alignmentRepairSummary(repaired)).toContain("Phrase fallback: 1");
  });
});
