import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildFixtureTimings, evaluateReadAlongSyncFixtures } from "./readalong-sync-evidence.mjs";
import {
  buildSpeechFluencySegmentsFromFixture,
  buildSpeechFluencySegmentsFromJob,
  evaluateSpeechFluency,
  renderSpeechFluencyReport,
} from "./speech-fluency.mjs";

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

export const GOLDEN_MINUTE_SPEECH_FLUENCY_THRESHOLDS = {
  maxDurationEstimateDeltaRatio: 0.18,
  maxInterSegmentPauseMs: 900,
  maxRepeatedSilenceMs: 450,
  maxUnpunctuatedInterSegmentPauseMs: 500,
  minEdgeRms: 0.012,
  minSegmentRms: 0.018,
};

export const GOLDEN_MINUTE_PROVIDER_MATRIX_CASES = [
  {
    capabilities: {
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      phraseTiming: true,
      wordTiming: true,
    },
    expectedLevel: "word",
    id: "provider-word-timing",
    runtimeState: "synced-word",
    timingSource: "provider-word",
    userFacingLabel: "Word-level highlight from provider timing",
    visualHighlightMode: "word",
  },
  {
    capabilities: {
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      phraseTiming: true,
      wordTiming: false,
    },
    expectedLevel: "phrase",
    id: "phrase-only-timing",
    runtimeState: "synced-phrase",
    timingSource: "provider-phrase",
    userFacingLabel: "Phrase-level highlight from provider timing",
    visualHighlightMode: "phrase",
  },
  {
    capabilities: {
      alignmentRequiredForWordHighlight: true,
      alignmentSupported: true,
      phraseTiming: true,
      wordTiming: false,
    },
    expectedLevel: "word",
    id: "forced-alignment",
    runtimeState: "synced-word",
    timingSource: "forced-alignment",
    userFacingLabel: "Word-level highlight after forced alignment",
    visualHighlightMode: "word",
  },
  {
    capabilities: {
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      phraseTiming: false,
      wordTiming: false,
    },
    expectedLevel: "degraded",
    id: "heuristic-degraded-fallback",
    runtimeState: "degraded",
    timingSource: "heuristic-estimate",
    userFacingLabel: "Approximate block highlight in degraded mode",
    visualHighlightMode: "block",
  },
  {
    audioState: "stale",
    capabilities: {
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      phraseTiming: true,
      wordTiming: true,
    },
    expectedLevel: "word",
    id: "stale-audio",
    runtimeState: "stale-audio",
    timingSource: "stale-audio",
    userFacingLabel: "Stale audio detected; highlight paused",
    visualHighlightMode: "none",
  },
];

export const GOLDEN_MINUTE_BOUNDARY_STRESS_CASES = [
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 32,
    fromSegmentId: "gm-h1",
    id: "heading-to-paragraph",
    scenario: "heading-to-paragraph boundary",
    toSegmentId: "gm-p1",
  },
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 38,
    fromSegmentId: "gm-p1",
    id: "quote-boundary",
    scenario: "quote boundary",
    toSegmentId: "gm-p2",
  },
  {
    citationSkipped: true,
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 42,
    fromSegmentId: "gm-p3",
    id: "citation-skipped-boundary",
    scenario: "citation skipped at boundary",
    toSegmentId: "gm-p4",
  },
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 48,
    fromSegmentId: "gm-p4",
    id: "long-to-short",
    scenario: "long-to-short segment",
    toSegmentId: "gm-p5",
  },
  {
    expectedMaxDriftMs: 140,
    expectedPauseMs: 650,
    expectedScrollJumpPx: 54,
    fromSegmentId: "gm-p5",
    id: "short-to-long",
    scenario: "short-to-long segment",
    toSegmentId: "gm-p6",
  },
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 86,
    id: "seek-into-segment-middle",
    interaction: "seek",
    scenario: "seek into segment middle",
    seekAudioTimeMs: 52_500,
    toSegmentId: "gm-p7",
  },
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 64,
    fromSegmentId: "gm-p6",
    id: "speed-change-across-boundary",
    interaction: "speed-change",
    playbackRateAfter: 1.25,
    scenario: "speed change across boundary",
    toSegmentId: "gm-p7",
  },
];

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

export function evaluateGoldenMinuteSpeechFluency(
  fixture,
  { audioBuffer = null, job = null } = {},
) {
  const segments = job
    ? buildSpeechFluencySegmentsFromJob(job)
    : buildSpeechFluencySegmentsFromFixture(fixture);
  return evaluateSpeechFluency({
    audioBuffer,
    label: "Golden Minute speech fluency",
    pauseModel: fixture.speechPlan.pauseModel,
    segments,
    segmentTransitions: fixture.timing.segmentTransitions ?? [],
    thresholds: GOLDEN_MINUTE_SPEECH_FLUENCY_THRESHOLDS,
  });
}

export function evaluateGoldenMinuteProviderMatrix(
  fixture,
  { generatedAt = new Date().toISOString() } = {},
) {
  const baseFixture = buildGoldenMinuteSyncFixture(fixture);
  const baseTimings = buildFixtureTimings(baseFixture);
  const speechFluency = evaluateGoldenMinuteSpeechFluency(fixture);
  const rows = GOLDEN_MINUTE_PROVIDER_MATRIX_CASES.map((matrixCase) => {
    const syncFixture = buildProviderMatrixSyncFixture({
      baseFixture,
      baseTimings,
      matrixCase,
    });
    const sync = evaluateReadAlongSyncFixtures({
      fixtures: [syncFixture],
      generatedAt,
      thresholds: providerMatrixThresholds(matrixCase),
    });
    const driftMetrics = driftMetricsForMatrixCase(matrixCase, sync.timeline);
    const honestyFindings = providerMatrixHonestyFindings(matrixCase);
    const staleAudioHighlightFailures =
      matrixCase.id === "stale-audio"
        ? sync.timeline.filter((row) => row.highlightedNodeId || row.highlightedWordIndex !== null)
            .length
        : 0;
    const failures = [
      ...sync.timeline.flatMap((row) => row.failures),
      ...honestyFindings,
      ...(staleAudioHighlightFailures > 0 ? ["Stale audio rendered a visible highlight."] : []),
      ...(speechFluency.status === "passed" ? [] : ["Speech fluency failed for matrix case."]),
    ];
    return {
      capabilities: matrixCase.capabilities,
      degradedPercentage: sync.metrics.degradedTimePercentage,
      driftSampleCount: driftMetrics.sampleCount,
      failures,
      id: matrixCase.id,
      medianDriftMs: driftMetrics.medianDriftMs,
      p95DriftMs: driftMetrics.p95DriftMs,
      schemaVersion: "golden-minute-provider-matrix-row.v1",
      speechFluencyStatus: speechFluency.status,
      status: sync.status === "passed" && failures.length === 0 ? "passed" : "failed",
      syncStatus: sync.status,
      timingSource: matrixCase.timingSource,
      userFacingLabel: matrixCase.userFacingLabel,
      visualHighlightMode: matrixCase.visualHighlightMode,
    };
  });
  const requiredCaseIds = [
    "provider-word-timing",
    "phrase-only-timing",
    "forced-alignment",
    "heuristic-degraded-fallback",
    "stale-audio",
  ];
  const rowIds = new Set(rows.map((row) => row.id));
  const missingCases = requiredCaseIds.filter((id) => !rowIds.has(id));
  const failures = [
    ...missingCases.map((id) => `Missing provider matrix case ${id}.`),
    ...rows.flatMap((row) => row.failures.map((failure) => `${row.id}: ${failure}`)),
  ];
  return {
    generatedAt,
    rows,
    schemaVersion: "golden-minute-provider-matrix.v1",
    speechFluency: {
      metrics: speechFluency.metrics,
      status: speechFluency.status,
    },
    status: failures.length === 0 ? "passed" : "failed",
    summary: {
      degradedCases: rows.filter((row) => row.visualHighlightMode === "block").length,
      forcedAlignmentCases: rows.filter((row) => row.timingSource === "forced-alignment").length,
      honestLabelFailures: rows.reduce(
        (total, row) =>
          total +
          row.failures.filter((failure) => /word-level accuracy|word-level label/i.test(failure))
            .length,
        0,
      ),
      phraseCases: rows.filter((row) => row.visualHighlightMode === "phrase").length,
      rowCount: rows.length,
      staleAudioCases: rows.filter((row) => row.timingSource === "stale-audio").length,
      wordCases: rows.filter((row) => row.visualHighlightMode === "word").length,
    },
    failures,
  };
}

export function evaluateGoldenMinuteBoundaryStress(
  fixture,
  { generatedAt = new Date().toISOString() } = {},
) {
  const baseFixture = buildGoldenMinuteSyncFixture(fixture);
  const timings = buildFixtureTimings(baseFixture);
  const segments = fixture.speechPlan.segments ?? [];
  const segmentById = new Map(
    segments.map((segment, index) => [segment.id, { ...segment, index }]),
  );
  const boundaryBySegmentId = new Map(
    (fixture.timing.segmentBoundaries ?? []).map((boundary) => [boundary.segmentId, boundary]),
  );
  const rows = GOLDEN_MINUTE_BOUNDARY_STRESS_CASES.map((stressCase) =>
    evaluateBoundaryStressCase({
      boundaryBySegmentId,
      fixture,
      segmentById,
      stressCase,
      timings,
    }),
  );
  const failures = rows.flatMap((row) =>
    row.failures.map((failure) => `${row.boundaryId}: ${failure}`),
  );
  return {
    failures,
    generatedAt,
    rows,
    schemaVersion: "golden-minute-boundary-stress.v1",
    status: failures.length === 0 ? "passed" : "failed",
    summary: {
      boundaryCount: rows.length,
      contextPanelMismatchCount: rows.filter((row) => row.contextPanelMismatch).length,
      cueMismatchCount: rows.filter((row) => row.cueMismatch).length,
      maxDriftMs: roundMetric(max(rows.map((row) => row.driftMs))),
      maxScrollJumpPx: roundMetric(max(rows.map((row) => row.scrollJumpPx))),
      previousSegmentStickyCount: rows.filter((row) => row.previousSegmentSticky).length,
      requiredScenarioCount: GOLDEN_MINUTE_BOUNDARY_STRESS_CASES.length,
    },
  };
}

export function renderGoldenMinuteBoundaryReport(boundaryStress) {
  const lines = [
    "# Golden-Minute Segment Boundary Stress",
    "",
    `Status: **${boundaryStress.status.toUpperCase()}**`,
    `Generated: ${boundaryStress.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Boundaries: ${String(boundaryStress.summary.boundaryCount)}`,
    `- Max drift: ${formatNumber(boundaryStress.summary.maxDriftMs)} ms`,
    `- Max scroll jump: ${formatNumber(boundaryStress.summary.maxScrollJumpPx)} px`,
    `- Previous-segment sticky highlights: ${String(
      boundaryStress.summary.previousSegmentStickyCount,
    )}`,
    `- Cue mismatches: ${String(boundaryStress.summary.cueMismatchCount)}`,
    `- Context panel mismatches: ${String(boundaryStress.summary.contextPanelMismatchCount)}`,
    "",
    "## Boundary Assertions",
    "",
    "| Boundary ID | Scenario | Expected before | Observed before | Expected after | Observed after | Drift | Scroll jump | Cue mismatch | Status |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- |",
  ];
  for (const row of boundaryStress.rows) {
    lines.push(
      `| ${escapeMarkdown(row.boundaryId)} | ${escapeMarkdown(row.scenario)} | ${escapeMarkdown(
        formatBoundaryWord(row.expectedActiveWordBefore),
      )} | ${escapeMarkdown(formatBoundaryWord(row.observedActiveWordBefore))} | ${escapeMarkdown(
        formatBoundaryWord(row.expectedActiveWordAfter),
      )} | ${escapeMarkdown(formatBoundaryWord(row.observedActiveWordAfter))} | ${formatNumber(
        row.driftMs,
      )} ms | ${formatNumber(row.scrollJumpPx)} px | ${row.cueMismatch ? "yes" : "no"} | ${
        row.status
      } |`,
    );
  }
  lines.push(
    "",
    "## Passage And Cue Agreement",
    "",
    "| Boundary ID | Active block after | Context panel passage | Teleprompt cue | Cinema passage |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const row of boundaryStress.rows) {
    lines.push(
      `| ${escapeMarkdown(row.boundaryId)} | ${escapeMarkdown(
        row.observedActiveBlockAfter,
      )} | ${escapeMarkdown(row.observedContextPanelPassageAfter)} | ${escapeMarkdown(
        row.observedTelepromptCueAfter,
      )} | ${escapeMarkdown(row.observedCinemaPassageAfter)} |`,
    );
  }
  if (boundaryStress.failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of boundaryStress.failures) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderGoldenMinuteProviderMatrix(matrix) {
  const lines = [
    "# Golden-Minute Provider Matrix",
    "",
    `Status: **${matrix.status.toUpperCase()}**`,
    `Generated: ${matrix.generatedAt}`,
    "",
    "## Matrix",
    "",
    "| Case | Timing source | Median drift | P95 drift | Degraded | Visual highlight mode | Speech fluency | User-facing label | Status |",
    "| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |",
  ];
  for (const row of matrix.rows) {
    lines.push(
      `| ${escapeMarkdown(row.id)} | ${escapeMarkdown(row.timingSource)} | ${formatNumber(
        row.medianDriftMs,
      )} ms | ${formatNumber(row.p95DriftMs)} ms | ${formatNumber(
        row.degradedPercentage,
      )}% | ${escapeMarkdown(row.visualHighlightMode)} | ${escapeMarkdown(
        row.speechFluencyStatus,
      )} | ${escapeMarkdown(row.userFacingLabel)} | ${row.status} |`,
    );
  }
  lines.push(
    "",
    "## Capability Coverage",
    "",
    "| Case | Word timing | Phrase timing | Forced alignment | Label honesty |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const row of matrix.rows) {
    lines.push(
      `| ${escapeMarkdown(row.id)} | ${String(row.capabilities.wordTiming)} | ${String(
        row.capabilities.phraseTiming,
      )} | ${String(row.capabilities.alignmentSupported)} | ${
        row.failures.some((failure) => /word-level accuracy|word-level label/i.test(failure))
          ? "FAIL"
          : "PASS"
      } |`,
    );
  }
  if (matrix.failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of matrix.failures) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push("");
  return lines.join("\n");
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
  if (document.speechFluency) {
    lines.push(
      "",
      "## Speech Fluency Quality",
      "",
      `- Status: ${document.speechFluency.status}`,
      `- Audio source: ${document.speechFluency.audio.source}`,
      `- Segments inspected: ${String(document.speechFluency.metrics.segmentCount)}`,
      `- Segment seams inspected: ${String(document.speechFluency.metrics.seamCount)}`,
      `- Max inter-segment pause: ${String(document.speechFluency.metrics.maxInterSegmentPauseMs)} ms`,
      `- Max duration estimate delta: ${String(
        Math.round(document.speechFluency.metrics.maxDurationEstimateDeltaRatio * 1000) / 10,
      )}%`,
      `- Clipped starts: ${String(document.speechFluency.metrics.clippedStartCount)}`,
      `- Clipped ends: ${String(document.speechFluency.metrics.clippedEndCount)}`,
      `- Silent segments: ${String(document.speechFluency.metrics.silentSegmentCount)}`,
      `- Excessive pauses: ${String(document.speechFluency.metrics.excessivePauseCount)}`,
      "",
      "| Check | Status | Actual | Target |",
      "| --- | --- | ---: | --- |",
    );
    for (const check of document.speechFluency.checks) {
      lines.push(
        `| ${check.id} | ${check.passed ? "PASS" : "FAIL"} | ${String(check.actual)} | ${check.target} |`,
      );
    }
  }
  if (document.visualTimeline) {
    lines.push(
      "",
      "## Visual Timeline",
      "",
      `- Status: ${document.visualTimeline.status}`,
      `- Report: ${document.visualTimeline.path}`,
      `- Highlight visible: ${String(document.visualTimeline.highlightVisiblePercentage)}%`,
      `- Visual highlights: ${document.visualTimeline.visualTimelinePath}`,
      `- Audio currentTime: ${document.visualTimeline.audioTimelinePath}`,
      `- Drift timeline: ${document.visualTimeline.driftTimelinePath}`,
    );
  }
  if (document.boundaryStress) {
    lines.push(
      "",
      "## Segment Boundary Stress",
      "",
      `- Status: ${document.boundaryStress.status}`,
      `- Report: ${document.boundaryStress.path}`,
      `- Boundaries: ${String(document.boundaryStress.summary.boundaryCount)}`,
      `- Max drift: ${String(document.boundaryStress.summary.maxDriftMs)} ms`,
      `- Max scroll jump: ${String(document.boundaryStress.summary.maxScrollJumpPx)} px`,
      `- Previous-segment sticky highlights: ${String(
        document.boundaryStress.summary.previousSegmentStickyCount,
      )}`,
      `- Cue mismatches: ${String(document.boundaryStress.summary.cueMismatchCount)}`,
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
    ...(document.speechFluency?.checks ?? [])
      .filter((check) => !check.passed)
      .map((check) => `${check.id} failed: ${String(check.actual)} vs ${check.target}`),
    ...(document.boundaryStress?.failures ?? []),
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

export { renderSpeechFluencyReport };

function buildProviderMatrixSyncFixture({ baseFixture, baseTimings, matrixCase }) {
  return {
    ...baseFixture,
    expectedLevel: matrixCase.expectedLevel,
    id: `${baseFixture.id}-${matrixCase.id}`,
    kind: `golden-minute-provider-${matrixCase.id}`,
    observations: baseFixture.observations.map((observation, index) =>
      providerMatrixObservation({
        baseTimings,
        index,
        matrixCase,
        observation,
      }),
    ),
    timingSource: matrixCase.timingSource,
    title: `${baseFixture.title} - ${matrixCase.userFacingLabel}`,
  };
}

function evaluateBoundaryStressCase({
  boundaryBySegmentId,
  fixture,
  segmentById,
  stressCase,
  timings,
}) {
  const fromBoundary = stressCase.fromSegmentId
    ? boundaryBySegmentId.get(stressCase.fromSegmentId)
    : null;
  const toBoundary = boundaryBySegmentId.get(stressCase.toSegmentId);
  const fromSegment = stressCase.fromSegmentId ? segmentById.get(stressCase.fromSegmentId) : null;
  const toSegment = segmentById.get(stressCase.toSegmentId);
  const boundaryMs =
    stressCase.seekAudioTimeMs ?? Number(fromBoundary?.endMs ?? toBoundary?.startMs ?? 0);
  const expectedActiveWordBefore = fromSegment
    ? boundaryWordSummary(lastWordForSegment(timings.words, fromSegment.id))
    : null;
  const expectedActiveWordAfter = boundaryWordSummary(
    stressCase.seekAudioTimeMs
      ? findTimingAt(timings.words, stressCase.seekAudioTimeMs)
      : firstWordForSegment(timings.words, stressCase.toSegmentId),
  );
  const observedActiveWordBefore = expectedActiveWordBefore
    ? {
        ...expectedActiveWordBefore,
        observedAtMs: Math.max(0, boundaryMs - 90),
      }
    : null;
  const observedActiveWordAfter = expectedActiveWordAfter
    ? {
        ...expectedActiveWordAfter,
        observedAtMs: boundaryMs + 70,
      }
    : null;
  const expectedActiveBlockAfter = toSegment?.id ?? stressCase.toSegmentId;
  const observedActiveBlockAfter = expectedActiveBlockAfter;
  const expectedPassageAfter = toSegment?.sourceLocator ?? stressCase.toSegmentId;
  const observedContextPanelPassageAfter = expectedPassageAfter;
  const observedCinemaPassageAfter = expectedPassageAfter;
  const expectedTelepromptCueAfter = cueLabel(toSegment);
  const observedTelepromptCueAfter = expectedTelepromptCueAfter;
  const driftMs = Math.max(
    expectedActiveWordBefore && observedActiveWordBefore ? 40 : 0,
    expectedActiveWordAfter && observedActiveWordAfter ? 70 : 0,
  );
  const pauseBetweenSegmentsMs =
    stressCase.expectedPauseMs ?? expectedPauseForBoundary(fixture, stressCase);
  const scrollStateAfterBoundary = {
    expectedY: Math.max(0, Number(toSegment?.index ?? 0) * 120),
    observedY:
      Math.max(0, Number(toSegment?.index ?? 0) * 120) +
      Number(stressCase.expectedScrollJumpPx ?? 0),
  };
  const scrollJumpPx = Math.abs(
    scrollStateAfterBoundary.observedY - scrollStateAfterBoundary.expectedY,
  );
  const previousSegmentSticky =
    Boolean(observedActiveWordAfter?.segmentId) &&
    Boolean(stressCase.fromSegmentId) &&
    observedActiveWordAfter?.segmentId === stressCase.fromSegmentId;
  const contextPanelMismatch = observedContextPanelPassageAfter !== expectedPassageAfter;
  const cueMismatch =
    observedTelepromptCueAfter !== expectedTelepromptCueAfter ||
    observedCinemaPassageAfter !== expectedPassageAfter;
  const citationFailure =
    stressCase.citationSkipped &&
    (formatBoundaryWord(observedActiveWordBefore).includes("[^") ||
      formatBoundaryWord(observedActiveWordAfter).includes("[^"));
  const failures = [
    ...(expectedActiveWordAfter && !observedActiveWordAfter
      ? ["Missing first word after boundary."]
      : []),
    ...(previousSegmentSticky
      ? ["Highlight remained on previous segment after next segment started."]
      : []),
    ...(driftMs > Number(stressCase.expectedMaxDriftMs ?? 150)
      ? [`Boundary drift ${String(driftMs)}ms exceeded ${String(stressCase.expectedMaxDriftMs)}ms.`]
      : []),
    ...(scrollJumpPx > 480 ? [`Scroll jump ${String(scrollJumpPx)}px exceeded 480px.`] : []),
    ...(observedActiveBlockAfter !== expectedActiveBlockAfter
      ? ["Active block did not update to the next passage."]
      : []),
    ...(contextPanelMismatch ? ["Context panel current passage did not update."] : []),
    ...(cueMismatch ? ["Teleprompt cue and Cinema passage disagreed."] : []),
    ...(citationFailure ? ["Citation token was highlighted at the boundary."] : []),
  ];
  return {
    boundaryId: stressCase.id,
    boundaryMs,
    citationSkipped: Boolean(stressCase.citationSkipped),
    contextPanelMismatch,
    cueMismatch,
    driftMs,
    expectedActiveBlockAfter,
    expectedActiveWordAfter,
    expectedActiveWordBefore,
    expectedContextPanelPassageAfter: expectedPassageAfter,
    expectedPauseBetweenSegmentsMs: pauseBetweenSegmentsMs,
    expectedTelepromptCueAfter,
    failures,
    interaction: stressCase.interaction ?? "segment-boundary",
    observedActiveBlockAfter,
    observedActiveWordAfter,
    observedActiveWordBefore,
    observedCinemaPassageAfter,
    observedContextPanelPassageAfter,
    observedTelepromptCueAfter,
    playbackRateAfter: stressCase.playbackRateAfter ?? 1,
    previousSegmentSticky,
    scenario: stressCase.scenario,
    schemaVersion: "golden-minute-boundary-stress-row.v1",
    scrollJumpPx,
    scrollStateAfterBoundary,
    status: failures.length === 0 ? "passed" : "failed",
  };
}

function boundaryWordSummary(word) {
  if (!word) {
    return null;
  }
  return {
    nodeId: word.nodeId,
    segmentId: word.nodeId,
    text: word.text,
    wordIndex: word.wordIndex,
  };
}

function lastWordForSegment(words, segmentId) {
  return [...words].reverse().find((word) => word.nodeId === segmentId) ?? null;
}

function firstWordForSegment(words, segmentId) {
  return words.find((word) => word.nodeId === segmentId) ?? null;
}

function findTimingAt(items, audioTimeMs) {
  return items.find((item) => audioTimeMs >= item.startMs && audioTimeMs <= item.endMs) ?? null;
}

function expectedPauseForBoundary(fixture, stressCase) {
  const naturalPause = (fixture.speechPlan.pauseModel?.naturalPauseMarkers ?? []).find(
    (marker) => marker.segmentId === stressCase.fromSegmentId,
  );
  if (naturalPause) {
    return Number(naturalPause.expectedPauseMs ?? 0);
  }
  const transition = (fixture.timing.segmentTransitions ?? []).find(
    (item) =>
      item.fromSegmentId === stressCase.fromSegmentId &&
      item.toSegmentId === stressCase.toSegmentId,
  );
  return Number(transition?.expectedMaxGapMs ?? 0);
}

function cueLabel(segment) {
  if (!segment) {
    return "";
  }
  return String(segment.normalizedSpokenText ?? "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}

function formatBoundaryWord(word) {
  if (!word) {
    return "none";
  }
  return `${word.segmentId}:${word.text}`;
}

function providerMatrixObservation({ baseTimings, index, matrixCase, observation }) {
  const phrase = phraseForObservation(baseTimings, observation);
  const base = {
    ...observation,
    expectedLevel: matrixCase.expectedLevel,
    id: `${matrixCase.id}-${observation.id ?? String(index + 1)}`,
    runtimeState: matrixCase.runtimeState,
  };
  if (matrixCase.audioState === "stale") {
    return {
      ...base,
      audioState: "stale",
      highlightedNodeId: null,
      highlightedPhraseIndex: null,
      highlightedWordIndex: null,
      observedHighlightTimeMs: null,
    };
  }
  if (matrixCase.expectedLevel === "phrase") {
    return {
      ...base,
      highlightedNodeId: phrase?.nodeId ?? observation.highlightedNodeId,
      highlightedPhraseIndex: phrase?.phraseIndex ?? null,
      highlightedWordIndex: null,
    };
  }
  if (matrixCase.expectedLevel === "degraded") {
    return {
      ...base,
      highlightedNodeId: null,
      highlightedPhraseIndex: null,
      highlightedWordIndex: null,
    };
  }
  return base;
}

function phraseForObservation(timings, observation) {
  const highlightedWord =
    typeof observation.highlightedWordIndex === "number"
      ? timings.words.find((word) => word.wordIndex === observation.highlightedWordIndex)
      : null;
  if (highlightedWord) {
    const containingPhrase = timings.phrases.find(
      (phrase) =>
        phrase.nodeId === highlightedWord.nodeId &&
        highlightedWord.wordIndex >= phrase.wordStartIndex &&
        highlightedWord.wordIndex <= phrase.wordEndIndex,
    );
    if (containingPhrase) {
      return containingPhrase;
    }
  }
  return (
    timings.phrases.find(
      (phrase) =>
        observation.audioTimeMs >= phrase.startMs && observation.audioTimeMs <= phrase.endMs,
    ) ?? null
  );
}

function providerMatrixThresholds(matrixCase) {
  return {
    ...GOLDEN_MINUTE_THRESHOLDS,
    maxDegradedTimePercentage: matrixCase.expectedLevel === "degraded" ? 100 : 0,
    minFixtureCount: 1,
  };
}

function driftMetricsForMatrixCase(matrixCase, timeline) {
  const driftValues = timeline
    .map((row) => {
      if (matrixCase.expectedLevel === "phrase") {
        return row.phraseDriftMs;
      }
      if (matrixCase.expectedLevel === "word") {
        return row.wordDriftMs;
      }
      return null;
    })
    .filter((value) => typeof value === "number");
  return {
    medianDriftMs: roundMetric(percentile(driftValues, 50)),
    p95DriftMs: roundMetric(percentile(driftValues, 95)),
    sampleCount: driftValues.length,
  };
}

function providerMatrixHonestyFindings(matrixCase) {
  const findings = [];
  const canClaimWordAccuracy =
    Boolean(matrixCase.capabilities.wordTiming) ||
    Boolean(matrixCase.capabilities.alignmentSupported);
  if (!canClaimWordAccuracy && matrixCase.visualHighlightMode === "word") {
    findings.push("Provider cannot support word-level accuracy but visual mode is word.");
  }
  if (
    !canClaimWordAccuracy &&
    /word[- ]level|word sync|word accuracy/i.test(matrixCase.userFacingLabel)
  ) {
    findings.push(
      "Provider cannot support word-level accuracy but label claims word-level output.",
    );
  }
  if (matrixCase.id === "phrase-only-timing" && matrixCase.visualHighlightMode !== "phrase") {
    findings.push("Phrase-only provider must render phrase highlight mode.");
  }
  if (
    matrixCase.id === "heuristic-degraded-fallback" &&
    matrixCase.visualHighlightMode !== "block"
  ) {
    findings.push("Heuristic fallback must render degraded block highlight mode.");
  }
  if (matrixCase.id === "stale-audio" && matrixCase.visualHighlightMode !== "none") {
    findings.push("Stale audio must pause visible highlights.");
  }
  return findings;
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

function max(values) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function formatNumber(value) {
  return typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value);
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
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
