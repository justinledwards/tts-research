import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildFixtureTimings, evaluateReadAlongSyncFixtures } from "./readalong-sync-evidence.mjs";
import {
  buildSpeechFluencySegmentsFromFixture,
  buildSpeechFluencySegmentsFromJob,
  evaluateSpeechFluency,
  renderSpeechFluencyReport,
} from "./speech-fluency.mjs";
import {
  GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_CASES,
  GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS,
  GOLDEN_MINUTE_ARTIFACT_IDENTITY_FIELDS,
  GOLDEN_MINUTE_BOUNDARY_STRESS_CASES,
  GOLDEN_MINUTE_PROVIDER_MATRIX_CASES,
  GOLDEN_MINUTE_SPEECH_FLUENCY_THRESHOLDS,
  GOLDEN_MINUTE_THRESHOLDS,
} from "./golden-minute-fixture-constants.mjs";
import {
  applyArtifactCompatibilityCase,
  buildArtifactCompatibilityGraph,
  buildProviderMatrixSyncFixture,
  driftMetricsForMatrixCase,
  evaluateArtifactCompatibilityCase,
  evaluateBoundaryStressCase,
  escapeMarkdown,
  formatNumber,
  formatBoundaryWord,
  max,
  paragraphCount,
  providerMatrixHonestyFindings,
  providerMatrixThresholds,
  roundMetric,
  sentences,
  tokenize,
  wordCount,
} from "./golden-minute-fixture-helpers.mjs";
export {
  GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_CASES,
  GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS,
  GOLDEN_MINUTE_ARTIFACT_IDENTITY_FIELDS,
  GOLDEN_MINUTE_BOUNDARY_STRESS_CASES,
  GOLDEN_MINUTE_PROVIDER_MATRIX_CASES,
  GOLDEN_MINUTE_SPEECH_FLUENCY_THRESHOLDS,
  GOLDEN_MINUTE_THRESHOLDS,
} from "./golden-minute-fixture-constants.mjs";

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
      thresholds: providerMatrixThresholds(matrixCase, GOLDEN_MINUTE_THRESHOLDS),
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

export function evaluateGoldenMinuteArtifactCompatibility(
  fixture,
  { artifactIdentity = {}, generatedAt = new Date().toISOString() } = {},
) {
  const baseGraph = buildArtifactCompatibilityGraph(fixture, artifactIdentity);
  const rows = GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_CASES.map((compatibilityCase) =>
    evaluateArtifactCompatibilityCase(
      applyArtifactCompatibilityCase(baseGraph, compatibilityCase),
      {
        compatibilityCase,
        compatibilityLabels: GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS,
      },
    ),
  );
  const failures = rows.flatMap((row) =>
    row.failures.map((failure) => `${row.caseId}: ${failure}`),
  );
  const identityFieldFailures = rows.flatMap((row) =>
    GOLDEN_MINUTE_ARTIFACT_IDENTITY_FIELDS.filter(
      (field) =>
        !(field in row.artifactIdentity) ||
        row.artifactIdentity[field] === undefined ||
        row.artifactIdentity[field] === "",
    ).map((field) => `${row.caseId}: missing artifact identity field ${field}.`),
  );
  return {
    failures: [...failures, ...identityFieldFailures],
    generatedAt,
    identityFields: GOLDEN_MINUTE_ARTIFACT_IDENTITY_FIELDS,
    rows,
    schemaVersion: "golden-minute-artifact-compatibility.v1",
    status: failures.length === 0 && identityFieldFailures.length === 0 ? "passed" : "failed",
    summary: {
      alignmentMissingCases: rows.filter((row) =>
        row.uiLabels.includes(GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.alignmentMissing),
      ).length,
      audioReadyCases: rows.filter((row) =>
        row.uiLabels.includes(GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.audioReady),
      ).length,
      audioStaleCases: rows.filter((row) =>
        row.uiLabels.includes(GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.audioStale),
      ).length,
      blockedWordHighlightCases: rows.filter((row) => !row.wordHighlightAllowed).length,
      highlightStaleCases: rows.filter((row) =>
        row.uiLabels.includes(GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.highlightStale),
      ).length,
      regenerateRequiredCases: rows.filter((row) =>
        row.uiLabels.includes(GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.regenerateRequired),
      ).length,
      rowCount: rows.length,
      sourceCompatibleBookmarkCases: rows.filter(
        (row) => row.bookmarkState === "source-compatible-survived",
      ).length,
    },
    uiLabels: Object.values(GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS),
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

export function renderGoldenMinuteArtifactCompatibilityReport(compatibility) {
  const lines = [
    "# Golden-Minute Artifact Compatibility",
    "",
    `Status: **${compatibility.status.toUpperCase()}**`,
    `Generated: ${compatibility.generatedAt}`,
    "",
    "## Identity Model",
    "",
    `- Fields: ${compatibility.identityFields.map((field) => `\`${field}\``).join(", ")}`,
    "",
    "## Summary",
    "",
    `- Cases: ${String(compatibility.summary.rowCount)}`,
    `- Blocked word-highlight cases: ${String(compatibility.summary.blockedWordHighlightCases)}`,
    `- Regenerate-required cases: ${String(compatibility.summary.regenerateRequiredCases)}`,
    `- Source-compatible bookmarks: ${String(compatibility.summary.sourceCompatibleBookmarkCases)}`,
    "",
    "## Compatibility Cases",
    "",
    "| Case | Gate | UI labels | Word highlight | Failed checks | Bookmark state | Status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of compatibility.rows) {
    lines.push(
      `| ${escapeMarkdown(row.caseId)} | ${escapeMarkdown(row.gateStatus)} | ${escapeMarkdown(
        row.uiLabels.join(", "),
      )} | ${row.wordHighlightAllowed ? "allowed" : "blocked"} | ${String(
        row.compatibilityChecks.filter((check) => !check.passed).length,
      )} | ${escapeMarkdown(row.bookmarkState)} | ${row.status} |`,
    );
  }
  lines.push(
    "",
    "## Check Details",
    "",
    "| Case | Check | Expected | Observed | Result |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const row of compatibility.rows) {
    for (const check of row.compatibilityChecks) {
      lines.push(
        `| ${escapeMarkdown(row.caseId)} | ${escapeMarkdown(check.label)} | ${escapeMarkdown(
          check.expected,
        )} | ${escapeMarkdown(check.observed)} | ${check.passed ? "PASS" : "BLOCK"} |`,
      );
    }
  }
  if (compatibility.failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of compatibility.failures) {
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
  if (document.artifactCompatibility) {
    lines.push(
      "",
      "## Artifact Compatibility",
      "",
      `- Status: ${document.artifactCompatibility.status}`,
      `- Report: ${document.artifactCompatibility.path}`,
      `- Blocked word-highlight cases: ${String(
        document.artifactCompatibility.summary.blockedWordHighlightCases,
      )}`,
      `- Regenerate-required cases: ${String(
        document.artifactCompatibility.summary.regenerateRequiredCases,
      )}`,
      `- Labels: ${document.artifactCompatibility.uiLabels.join(", ")}`,
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
    ...(document.artifactCompatibility?.failures ?? []),
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
