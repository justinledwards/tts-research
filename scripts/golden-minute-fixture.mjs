import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluateReadAlongSyncFixtures } from "./readalong-sync-evidence.mjs";

export const GOLDEN_MINUTE_THRESHOLDS = {
  maxDegradedTimePercentage: 0,
  maxMedianWordDriftMs: 150,
  maxMissedHighlightCount: 0,
  maxP95WordDriftMs: 150,
  maxPhraseDriftMs: 350,
  maxScrollJumpCount: 0,
  maxStaleHighlightCount: 0,
  maxWrongNodeCount: 0,
  maxWrongWordCount: 0,
  minFixtureCount: 1,
};

export async function loadGoldenMinuteFixture(rootDir) {
  const fixtureDir = path.join(rootDir, "fixtures", "golden-minute");
  const manifestPath = path.join(fixtureDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const samplePath = path.join(fixtureDir, manifest.samplePath);
  const expectedSpeechPlanPath = path.join(fixtureDir, manifest.expectedSpeechPlanPath);
  const expectedTimingPath = path.join(fixtureDir, manifest.expectedTimingPath);
  return {
    fixtureDir,
    manifest,
    paths: {
      expectedSpeechPlan: expectedSpeechPlanPath,
      expectedTiming: expectedTimingPath,
      manifest: manifestPath,
      sample: samplePath,
    },
    sampleText: await readFile(samplePath, "utf8"),
    speechPlan: JSON.parse(await readFile(expectedSpeechPlanPath, "utf8")),
    timing: JSON.parse(await readFile(expectedTimingPath, "utf8")),
  };
}

export function validateGoldenMinuteFixture(fixture) {
  const failures = [];
  const { manifest, sampleText, speechPlan, timing } = fixture;
  const required = manifest.requiredFeatures ?? {};
  const segments = speechPlan.segments ?? [];
  const segmentBoundaries = timing.segmentBoundaries ?? [];
  const sampleSentences = sentences(sampleText);
  const longSentences = sampleSentences.filter(
    (sentence) => wordCount(sentence) >= Number(required.longSentenceMinWords ?? 30),
  );
  const shortSentences = sampleSentences.filter(
    (sentence) => wordCount(sentence) <= Number(required.shortSentenceMaxWords ?? 3),
  );

  if (!sampleText.match(/^#\s+/m)) {
    failures.push("Sample is missing a Markdown heading.");
  }
  if (!sampleText.includes(required.abbreviation ?? "Dr.")) {
    failures.push("Sample is missing the required abbreviation.");
  }
  if (!sampleText.includes(required.number ?? "47")) {
    failures.push("Sample is missing the required number.");
  }
  if (!sampleText.includes(`"${required.quotedPhrase}"`)) {
    failures.push("Sample is missing the required quoted phrase.");
  }
  if (!sampleText.includes(required.citationToken ?? "[^gm1]")) {
    failures.push("Sample is missing the citation/footnote-like token.");
  }
  if (longSentences.length === 0) {
    failures.push("Sample is missing a long sentence.");
  }
  if (shortSentences.length === 0) {
    failures.push("Sample is missing a short sentence.");
  }
  if (!sampleText.includes(required.naturalPauseMarker ?? "waits for a breath")) {
    failures.push("Sample is missing the natural pause marker.");
  }
  if (!sampleText.includes(required.sourceLocator ?? "golden-minute://resume-anchor")) {
    failures.push("Sample is missing the source locator/bookmark target.");
  }

  const segmentMin = Number(required.narrationSegments?.min ?? 6);
  const segmentMax = Number(required.narrationSegments?.max ?? 8);
  if (segments.length < segmentMin || segments.length > segmentMax) {
    failures.push(
      `Expected ${String(segmentMin)}-${String(segmentMax)} narration segments, saw ${String(
        segments.length,
      )}.`,
    );
  }
  if (new Set(segments.map((segment) => segment.id)).size !== segments.length) {
    failures.push("Speech plan segment IDs are not unique.");
  }
  if (segmentBoundaries.length !== segments.length) {
    failures.push("Timing segment boundary count does not match speech plan segment count.");
  }

  const duration = Number(timing.totalDurationMs ?? 0);
  const minDuration = Number(manifest.durationBudget?.minMs ?? 55_000);
  const maxDuration = Number(manifest.durationBudget?.maxMs ?? 70_000);
  if (duration < minDuration || duration > maxDuration) {
    failures.push(
      `Expected duration between ${String(minDuration)}ms and ${String(
        maxDuration,
      )}ms, saw ${String(duration)}ms.`,
    );
  }

  const segmentIds = new Set(segments.map((segment) => segment.id));
  for (const boundary of segmentBoundaries) {
    if (!segmentIds.has(boundary.segmentId)) {
      failures.push(`Timing boundary references unknown segment ${boundary.segmentId}.`);
    }
    if (!(Number(boundary.endMs) > Number(boundary.startMs))) {
      failures.push(`Timing boundary ${boundary.segmentId} has a non-positive duration.`);
    }
  }
  for (const phrase of timing.phraseTimings ?? []) {
    if (!segmentIds.has(phrase.segmentId)) {
      failures.push(`Phrase timing ${phrase.id} references unknown segment ${phrase.segmentId}.`);
    }
    if (!(Number(phrase.endMs) > Number(phrase.startMs))) {
      failures.push(`Phrase timing ${phrase.id} has a non-positive duration.`);
    }
  }
  for (const word of timing.wordTimings ?? []) {
    if (!segmentIds.has(word.segmentId)) {
      failures.push(`Word timing ${word.text} references unknown segment ${word.segmentId}.`);
    }
  }
  if (
    !timing.bookmarkResumeTarget?.segmentId ||
    !segmentIds.has(timing.bookmarkResumeTarget.segmentId)
  ) {
    failures.push("Bookmark/resume target does not reference a known segment.");
  }

  const spokenText = segments.map((segment) => segment.normalizedSpokenText).join(" ");
  if (spokenText.includes(required.citationToken ?? "[^gm1]")) {
    failures.push("Normalized spoken text still contains the citation token.");
  }
  if (!speechPlan.citationPolicy?.expectedHandling) {
    failures.push("Speech plan does not declare expected citation policy handling.");
  }
  if ((speechPlan.pronunciationOverrides ?? []).length === 0) {
    failures.push("Speech plan does not declare pronunciation overrides.");
  }

  return {
    coverage: {
      citationPolicy: speechPlan.citationPolicy?.mode ?? "unknown",
      durationMs: duration,
      longSentenceCount: longSentences.length,
      modeledTransitionCount: timing.segmentTransitions?.length ?? 0,
      paragraphTransitions: paragraphCount(sampleText) > 1,
      phraseTimingCount: timing.phraseTimings?.length ?? 0,
      pronunciationOverrides: speechPlan.pronunciationOverrides?.length ?? 0,
      segmentCount: segments.length,
      shortSentenceCount: shortSentences.length,
      wordTimingCount: timing.wordTimings?.length ?? 0,
    },
    failures,
    status: failures.length === 0 ? "passed" : "failed",
  };
}

export function buildGoldenMinuteSyncFixture(fixture) {
  const { manifest, speechPlan, timing } = fixture;
  const boundaryBySegment = new Map(
    (timing.segmentBoundaries ?? []).map((boundary) => [boundary.segmentId, boundary]),
  );
  const segmentWordOffsets = new Map();
  let offset = 0;
  const nodes = (speechPlan.segments ?? []).map((segment) => {
    const boundary = boundaryBySegment.get(segment.id);
    segmentWordOffsets.set(segment.id, offset);
    const words = tokenize(segment.normalizedSpokenText);
    offset += words.length;
    return {
      durationMs: Number(boundary.endMs) - Number(boundary.startMs),
      nodeId: segment.id,
      phraseWordCount: segment.kind === "heading" ? 3 : 5,
      startMs: Number(boundary.startMs),
      text: segment.normalizedSpokenText,
    };
  });
  const observations = (timing.observations ?? []).map((observation) => {
    const wordOffset = segmentWordOffsets.get(observation.segmentId) ?? 0;
    return {
      audioTimeMs: observation.audioTimeMs,
      highlightedNodeId: observation.segmentId,
      highlightedWordIndex: wordOffset + Number(observation.localWordIndex ?? 0),
      id: observation.id,
      observedHighlightTimeMs: observation.observedHighlightTimeMs,
      runtimeState: observation.expectedState,
      scrollJumpPx: observation.scrollJumpPx ?? 0,
    };
  });
  return {
    expectedLevel: "word",
    id: manifest.id,
    kind: "golden-minute-end-to-end",
    nodes,
    observations,
    sampleDurationMs: 250,
    timingSource: timing.timingSource ?? "local-mock-baseline",
    title: manifest.title,
  };
}

export function evaluateGoldenMinuteSync(fixture) {
  const result = evaluateReadAlongSyncFixtures({
    fixtures: [buildGoldenMinuteSyncFixture(fixture)],
    thresholds: GOLDEN_MINUTE_THRESHOLDS,
  });
  return {
    ...result,
    schemaVersion: "golden-minute-sync-results.v1",
  };
}

export function evaluateGoldenMinuteFluency(fixture, browserResult = {}) {
  const durationSec = Number(fixture.timing.totalDurationMs ?? 0) / 1000;
  const spokenWordCount = (fixture.speechPlan.segments ?? []).reduce(
    (total, segment) => total + wordCount(segment.normalizedSpokenText ?? ""),
    0,
  );
  const wordsPerMinute = durationSec > 0 ? Math.round((spokenWordCount / durationSec) * 60) : 0;
  const visualActiveSegments = browserResult.segmentTransitionState?.uniqueActiveSegments ?? 0;
  const generatedSegments = browserResult.audioState?.readySegments ?? 0;
  const modeledTransitions = fixture.timing.segmentTransitions?.length ?? 0;
  const hasModeledHandoffEvidence =
    generatedSegments >= 2 &&
    modeledTransitions >= 2 &&
    Boolean(browserResult.segmentTransitionState?.seekTargetObserved) &&
    Boolean(browserResult.segmentTransitionState?.resumeTargetObserved);
  const checks = [
    {
      actual: durationSec,
      id: "duration",
      passed: durationSec >= 55 && durationSec <= 70,
      target: "55-70 seconds",
    },
    {
      actual: wordsPerMinute,
      id: "speech-rate",
      passed: wordsPerMinute >= 120 && wordsPerMinute <= 180,
      target: "120-180 words per minute",
    },
    {
      actual: fixture.speechPlan.pauseModel?.naturalPauseMarkers?.length ?? 0,
      id: "natural-pauses",
      passed: (fixture.speechPlan.pauseModel?.naturalPauseMarkers?.length ?? 0) >= 1,
      target: "at least one modeled natural pause",
    },
    {
      actual: `${String(visualActiveSegments)} visual / ${String(
        generatedSegments,
      )} generated / ${String(modeledTransitions)} modeled`,
      id: "segment-handoff",
      passed: visualActiveSegments >= 2 || hasModeledHandoffEvidence,
      target:
        "at least two visible active segments, or generated segments plus modeled boundary evidence",
    },
  ];
  return {
    checks,
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    summary: {
      durationSec,
      spokenWordCount,
      wordsPerMinute,
    },
  };
}

export function renderGoldenMinuteReport(document) {
  const lines = [
    "# Golden Minute E2E",
    "",
    `Status: **${document.status.toUpperCase()}**`,
    `Generated: ${document.generatedAt}`,
    "",
    "## Fixture",
    "",
    `- Sample: \`${document.fixture.samplePath}\``,
    `- Duration: ${String(document.fixture.coverage.durationMs)} ms`,
    `- Narration segments: ${String(document.fixture.coverage.segmentCount)}`,
    `- Phrase timings: ${String(document.fixture.coverage.phraseTimingCount)}`,
    `- Word timing samples: ${String(document.fixture.coverage.wordTimingCount)}`,
    `- Citation policy: ${document.fixture.coverage.citationPolicy}`,
    "",
    "## Drift Metrics",
    "",
    `- Median word drift: ${String(document.sync.metrics.medianWordDriftMs)} ms`,
    `- P95 word drift: ${String(document.sync.metrics.p95WordDriftMs)} ms`,
    `- Max phrase drift: ${String(document.sync.metrics.maxPhraseDriftMs)} ms`,
    `- Wrong-node highlights: ${String(document.sync.metrics.wrongNodeCount)}`,
    `- Stale highlights: ${String(document.sync.metrics.staleHighlightCount)}`,
    "",
    "## Audio State",
    "",
    `- Provider: ${document.browser.audioState.provider}`,
    `- Job status: ${document.browser.audioState.jobStatus}`,
    `- Duration: ${String(document.browser.audioState.durationMs)} ms`,
    `- Ready segments: ${String(document.browser.audioState.readySegments)}`,
    `- Cloud dependency: ${String(document.browser.audioState.cloudDependency)}`,
    "",
    "## Segment Transition State",
    "",
    `- Observed active segments: ${String(
      document.browser.segmentTransitionState.uniqueActiveSegments,
    )}`,
    `- Generated segments ready: ${String(document.browser.audioState.readySegments)}`,
    `- Modeled boundary transitions: ${String(document.fixture.coverage.modeledTransitionCount)}`,
    `- Seek target observed: ${String(document.browser.segmentTransitionState.seekTargetObserved)}`,
    `- Resume target observed: ${String(
      document.browser.segmentTransitionState.resumeTargetObserved,
    )}`,
    "",
    "## Fluency Rubric",
    "",
    "| Check | Status | Actual | Target |",
    "| --- | --- | ---: | --- |",
  ];
  for (const check of document.fluency.checks) {
    lines.push(
      `| ${check.id} | ${check.passed ? "PASS" : "FAIL"} | ${String(check.actual)} | ${check.target} |`,
    );
  }
  lines.push("", "## Screenshots", "");
  for (const screenshot of document.screenshots) {
    lines.push(`- ${screenshot}`);
  }
  const failures = [
    ...document.fixture.failures,
    ...document.sync.timeline.flatMap((row) => row.failures),
    ...document.browser.failures,
    ...document.fluency.checks
      .filter((check) => !check.passed)
      .map((check) => `${check.id} failed: ${String(check.actual)} vs ${check.target}`),
  ];
  if (failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of failures) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function paragraphCount(markdown) {
  return markdown
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("#") && !part.startsWith("[^")).length;
}

function sentences(text) {
  return text
    .replaceAll(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function wordCount(text) {
  return tokenize(text).length;
}

function tokenize(text) {
  return (
    String(text ?? "")
      .trim()
      .match(/\S+/g) ?? []
  );
}
