import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = path.resolve(import.meta.dirname, "..");
const goldDir = path.join(rootDir, "backend", "internal", "alignment", "testdata", "gold");

function tokenize(text) {
  return text.trim().match(/\S+/g) ?? [];
}

function weights(tokens) {
  return tokens.map((token) => Math.max(2, [...token.replace(/[^\p{L}\p{N}]/gu, "")].length));
}

function heuristicTokens(fixture) {
  const tokens = [];
  for (const segment of fixture.segments ?? []) {
    const words = tokenize(segment.text);
    const segmentWeights = weights(words);
    const totalWeight = segmentWeights.reduce((sum, value) => sum + value, 0);
    let consumed = 0;
    for (const [index, word] of words.entries()) {
      const start =
        segment.startMs + Math.round((consumed / Math.max(1, totalWeight)) * segment.durationMs);
      consumed += segmentWeights[index] ?? 0;
      const end =
        segment.startMs + Math.round((consumed / Math.max(1, totalWeight)) * segment.durationMs);
      tokens.push({ text: word, startMs: start, endMs: Math.max(start + 1, end) });
    }
  }
  return tokens;
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function scoreFixture(fixture) {
  const expected = fixture.tokens ?? [];
  const actual = heuristicTokens(fixture);
  const count = Math.min(expected.length, actual.length);
  const errors = [];
  for (let index = 0; index < count; index += 1) {
    errors.push(Math.abs((actual[index]?.startMs ?? 0) - (expected[index]?.startMs ?? 0)));
    errors.push(Math.abs((actual[index]?.endMs ?? 0) - (expected[index]?.endMs ?? 0)));
  }
  const mae = errors.length > 0 ? errors.reduce((sum, value) => sum + value, 0) / errors.length : 0;
  const expectedEnd = expected.at(-1)?.endMs ?? fixture.durationMs ?? 0;
  const actualEnd = actual.at(-1)?.endMs ?? 0;
  return {
    coverage: expected.length > 0 ? count / expected.length : 0,
    driftMs: Math.abs(actualEnd - expectedEnd),
    maeMs: mae,
    name: fixture.name ?? "fixture",
    p95Ms: percentile(errors, 95),
    tokenCount: count,
  };
}

const files = (await readdir(goldDir)).filter((file) => file.endsWith(".json")).sort();
if (files.length === 0) {
  console.log("No alignment gold fixtures found.");
  process.exit(0);
}

const reports = [];
for (const file of files) {
  const fixture = JSON.parse(await readFile(path.join(goldDir, file), "utf8"));
  reports.push(scoreFixture(fixture));
}

const totals = reports.reduce(
  (accumulator, report) => ({
    coverage: accumulator.coverage + report.coverage,
    driftMs: accumulator.driftMs + report.driftMs,
    maeMs: accumulator.maeMs + report.maeMs,
    p95Ms: Math.max(accumulator.p95Ms, report.p95Ms),
    tokenCount: accumulator.tokenCount + report.tokenCount,
  }),
  { coverage: 0, driftMs: 0, maeMs: 0, p95Ms: 0, tokenCount: 0 },
);

console.log("Alignment benchmark");
for (const report of reports) {
  console.log(
    `- ${report.name}: MAE=${report.maeMs.toFixed(1)}ms p95=${report.p95Ms.toFixed(
      1,
    )}ms drift=${report.driftMs.toFixed(1)}ms coverage=${Math.round(
      report.coverage * 100,
    )}% tokens=${report.tokenCount}`,
  );
}
console.log(
  `Overall: MAE=${(totals.maeMs / reports.length).toFixed(1)}ms p95=${totals.p95Ms.toFixed(
    1,
  )}ms drift=${(totals.driftMs / reports.length).toFixed(1)}ms coverage=${Math.round(
    (totals.coverage / reports.length) * 100,
  )}% tokens=${totals.tokenCount}`,
);
