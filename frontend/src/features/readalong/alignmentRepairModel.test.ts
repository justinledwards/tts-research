import { describe, expect, it } from "vitest";
import {
  addAlignmentRepairOperation,
  alignmentRepairMapStaleness,
  alignmentRepairSummary,
  createAlignmentRepairMap,
  parseAlignmentRepairMap,
  serializeAlignmentRepairMap,
} from "./alignmentRepairModel";

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
});
