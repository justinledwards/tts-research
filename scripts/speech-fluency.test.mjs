import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSyntheticSpeechWAV,
  evaluateSpeechFluency,
  parsePCM16WAV,
} from "./speech-fluency.mjs";

const segments = [
  {
    expectedDurationMs: 2400,
    generatedDurationMs: 2400,
    id: "s1",
    startMs: 0,
    text: "First sentence.",
  },
  {
    expectedDurationMs: 2600,
    generatedDurationMs: 2600,
    id: "s2",
    startMs: 2400,
    text: "Second sentence.",
  },
];

test("speech fluency passes synthetic speech-like seams", () => {
  const audio = buildSyntheticSpeechWAV(segments);
  const parsed = parsePCM16WAV(audio);
  assert.equal(parsed.sampleRate, 16_000);
  assert.equal(parsed.channelCount, 1);

  const report = evaluateSpeechFluency({ audioBuffer: audio, segments });
  assert.equal(report.status, "passed");
  assert.equal(report.metrics.segmentCount, 2);
  assert.equal(report.metrics.clippedStartCount, 0);
  assert.equal(report.metrics.clippedEndCount, 0);
  assert.equal(report.metrics.silentSegmentCount, 0);
});

test("speech fluency fails silent segments and excessive seams", () => {
  const silent = Buffer.alloc(44 + 16_000 * 6 * 2);
  silent.write("RIFF", 0, "ascii");
  silent.writeUInt32LE(silent.length - 8, 4);
  silent.write("WAVE", 8, "ascii");
  silent.write("fmt ", 12, "ascii");
  silent.writeUInt32LE(16, 16);
  silent.writeUInt16LE(1, 20);
  silent.writeUInt16LE(1, 22);
  silent.writeUInt32LE(16_000, 24);
  silent.writeUInt32LE(32_000, 28);
  silent.writeUInt16LE(2, 32);
  silent.writeUInt16LE(16, 34);
  silent.write("data", 36, "ascii");
  silent.writeUInt32LE(silent.length - 44, 40);

  const report = evaluateSpeechFluency({
    audioBuffer: silent,
    segments: [
      { ...segments[0], generatedDurationMs: 3000 },
      { ...segments[1], generatedDurationMs: 3000, startMs: 3000 },
    ],
  });
  assert.equal(report.status, "failed");
  assert.ok(report.metrics.silentSegmentCount > 0);
});
