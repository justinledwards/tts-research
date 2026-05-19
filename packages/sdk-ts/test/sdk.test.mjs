import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  buildSpeechPlanFromContentIR,
  formatContentIRLocator,
  resolveHighlightCue,
  validateSpeechPlan,
} from "../dist/index.js";

test("builds a speech plan from a Content IR fixture", async () => {
  const ir = JSON.parse(
    await readFile(
      new URL("../../../fixtures/contracts/markdown.content-ir.v1.json", import.meta.url),
      "utf8",
    ),
  );
  const plan = buildSpeechPlanFromContentIR(ir, { generatedAt: "2026-05-18T00:00:00.000Z" });
  assert.equal(plan.schemaVersion, "speech-plan.v1");
  assert.ok(plan.segments.length > 0);
  assert.equal(validateSpeechPlan(plan).valid, true);
});

test("formats locators and resolves highlight cues", () => {
  assert.equal(
    formatContentIRLocator({
      markdown: {
        astPath: "/children/0",
        columnEnd: 1,
        columnStart: 1,
        lineEnd: 2,
        lineStart: 1,
        path: "notes.md",
      },
      type: "markdown",
    }),
    "notes.md:lines 1-2",
  );
  const cue = resolveHighlightCue(
    {
      durationMs: 1000,
      fragments: [
        { confidence: 0.8, endMs: 1000, index: 0, segmentIndex: 1, startMs: 0, text: "Hello" },
      ],
      generatedAt: "2026-05-18T00:00:00Z",
      mode: "word",
      schemaVersion: "highlight-map.v1",
      source: "heuristic",
      status: "complete",
      summary: {
        confidence: { overall: 0.8, segment: 0.8, token: 0.8 },
        drift: {
          corrected: false,
          lowConfidence: false,
          maxAbsoluteMs: 0,
          maxRatio: 0,
          meanAbsoluteMs: 0,
        },
        durationMs: 1000,
        fragmentCount: 1,
        lowConfidence: false,
        mode: "word",
        source: "heuristic",
        status: "complete",
        tokenCount: 1,
      },
      tokens: [
        {
          confidence: 0.8,
          endMs: 1000,
          fragmentIndex: 0,
          index: 0,
          mode: "word",
          readingPosition: { activeWordIndex: 4 },
          segmentIndex: 1,
          startMs: 0,
          text: "Hello",
        },
      ],
    },
    0.5,
  );
  assert.equal(cue?.activeWordIndex, 4);
});
