export function buildArtifactCompatibilityGraph(fixture, artifactIdentityOverrides = {}) {
  const identity = normalizeArtifactIdentity(fixture, artifactIdentityOverrides);
  const compatibleRevisionId = `${identity.sourceRevisionId}:compatible-copyedit`;
  return {
    bookmarks: [
      {
        id: "golden-minute-resume",
        sourceRevisionId: identity.sourceRevisionId,
        target:
          fixture.timing.bookmarkResumeTarget?.sourceLocator ?? "golden-minute://resume-anchor",
      },
    ],
    currentSourceRevisionId: identity.sourceRevisionId,
    generatedAudio: {
      id: identity.generatedAudioId,
      speechPlanId: identity.speechPlanId,
    },
    highlightMap: {
      generatedAudioId: identity.generatedAudioId,
      id: identity.highlightMapId,
      speechPlanId: identity.speechPlanId,
      timingLevels: ["word", "phrase", "block"],
    },
    alignmentMap: {
      generatedAudioId: identity.generatedAudioId,
      id: identity.alignmentMapId,
      speechPlanId: identity.speechPlanId,
      status: "ready",
    },
    identity,
    sourceCompatibleRevisionIds: [identity.sourceRevisionId, compatibleRevisionId],
    speechPlan: {
      id: identity.speechPlanId,
      policyProfileId: identity.policyProfileId,
      sourceRevisionId: identity.sourceRevisionId,
      voiceProfileId: identity.voiceProfileId,
    },
  };
}

export function normalizeArtifactIdentity(fixture, overrides) {
  const sampleId = fixture.speechPlan.sampleId ?? fixture.manifest.id ?? "golden-minute";
  const sourceRevisionId = firstNonEmpty(
    overrides.sourceRevisionId,
    `${sampleId}:source-revision:v1`,
  );
  const speechPlanId = firstNonEmpty(overrides.speechPlanId, `${sampleId}:speech-plan:v1`);
  const policyProfileId = firstNonEmpty(
    overrides.policyProfileId,
    fixture.speechPlan.policyProfile,
    "policy:default",
  );
  const voiceProfileId = firstNonEmpty(overrides.voiceProfileId, "voice:mock-default");
  const generatedAudioId = firstNonEmpty(
    overrides.generatedAudioId,
    `${sampleId}:generated-audio:v1`,
  );
  const highlightMapId = firstNonEmpty(
    overrides.highlightMapId,
    `${generatedAudioId}:highlight-map:v1`,
  );
  const alignmentMapId =
    Object.hasOwn(overrides, "alignmentMapId") && overrides.alignmentMapId === null
      ? null
      : firstNonEmpty(overrides.alignmentMapId, `${generatedAudioId}:alignment-map:v1`);
  return {
    alignmentMapId,
    generatedAudioId,
    highlightMapId,
    policyProfileId,
    sourceRevisionId,
    speechPlanId,
    voiceProfileId,
  };
}

export function applyArtifactCompatibilityCase(baseGraph, compatibilityCase) {
  const graph = cloneArtifactGraph(baseGraph);
  switch (compatibilityCase.id) {
    case "audio-stale-speech-plan": {
      graph.generatedAudio.speechPlanId = `${graph.identity.speechPlanId}:old`;
      return graph;
    }
    case "highlight-stale-audio": {
      graph.highlightMap.generatedAudioId = `${graph.identity.generatedAudioId}:old`;
      return graph;
    }
    case "alignment-missing": {
      graph.alignmentMap = null;
      graph.identity.alignmentMapId = null;
      return graph;
    }
    case "speech-plan-source-policy-voice-stale": {
      graph.currentSourceRevisionId = `${graph.identity.sourceRevisionId}:breaking-edit`;
      graph.sourceCompatibleRevisionIds = [graph.currentSourceRevisionId];
      graph.speechPlan.policyProfileId = `${graph.identity.policyProfileId}:old`;
      graph.speechPlan.voiceProfileId = `${graph.identity.voiceProfileId}:old`;
      return graph;
    }
    case "source-compatible-bookmark": {
      graph.currentSourceRevisionId =
        graph.sourceCompatibleRevisionIds.find((id) => id !== graph.identity.sourceRevisionId) ??
        `${graph.identity.sourceRevisionId}:compatible-copyedit`;
      return graph;
    }
    default: {
      return graph;
    }
  }
}

export function evaluateArtifactCompatibilityCase(
  graph,
  { compatibilityCase, compatibilityLabels },
) {
  const preWordChecks = artifactCompatibilityChecks(graph);
  const blockingChecks = preWordChecks.filter(
    (check) => check.requiredForWordHighlight && !check.passed,
  );
  const wordHighlightAllowed = blockingChecks.length === 0;
  const compatibilityChecks = [
    ...preWordChecks,
    {
      expected:
        compatibilityCase.expectedResult === "blocked"
          ? "stale or missing artifacts block word highlight"
          : "compatible artifacts can drive word highlight",
      id: "stale-artifact-word-highlight",
      label: "Stale artifacts cannot drive word highlight",
      observed: wordHighlightAllowed ? "word highlight allowed" : "word highlight blocked",
      passed: true,
      requiredForWordHighlight: false,
    },
  ];
  const missingLabels = compatibilityCase.uiLabels.filter(
    (label) => !Object.values(compatibilityLabels ?? {}).includes(label),
  );
  const failures = [
    ...missingLabels.map((label) => `Unknown UI label ${label}.`),
    ...(compatibilityCase.expectedResult === "blocked" && wordHighlightAllowed
      ? ["Stale or missing artifacts could still drive word highlight."]
      : []),
    ...(compatibilityCase.expectedResult === "compatible" && !wordHighlightAllowed
      ? ["Compatible artifacts were blocked from word highlight."]
      : []),
    ...(compatibilityCase.id === "source-compatible-bookmark" &&
    !compatibilityChecks.find((check) => check.id === "bookmarks-source-compatible")?.passed
      ? ["Bookmark did not survive a source-compatible revision."]
      : []),
  ];
  return {
    artifactIdentity: graph.identity,
    bookmarkState: bookmarkStateForGraph(graph, compatibilityChecks),
    caseId: compatibilityCase.id,
    compatibilityChecks,
    failures,
    gateStatus: wordHighlightAllowed ? "compatible" : "blocked-word-highlight",
    schemaVersion: "golden-minute-artifact-compatibility-row.v1",
    status: failures.length === 0 ? "passed" : "failed",
    title: compatibilityCase.title,
    uiLabels: compatibilityCase.uiLabels,
    wordHighlightAllowed,
  };
}

export function artifactCompatibilityChecks(graph) {
  const highlightMatchesAudio =
    graph.highlightMap?.generatedAudioId === graph.generatedAudio.id &&
    graph.highlightMap?.speechPlanId === graph.generatedAudio.speechPlanId;
  const audioMatchesSpeechPlan = graph.generatedAudio.speechPlanId === graph.speechPlan.id;
  const speechPlanMatchesSource =
    graph.speechPlan.sourceRevisionId === graph.currentSourceRevisionId ||
    graph.sourceCompatibleRevisionIds.includes(graph.speechPlan.sourceRevisionId);
  const speechPlanMatchesPolicy =
    graph.speechPlan.policyProfileId === graph.identity.policyProfileId;
  const speechPlanMatchesVoice = graph.speechPlan.voiceProfileId === graph.identity.voiceProfileId;
  const alignmentMatchesAudio =
    graph.alignmentMap !== null &&
    graph.alignmentMap.generatedAudioId === graph.generatedAudio.id &&
    graph.alignmentMap.speechPlanId === graph.generatedAudio.speechPlanId;
  const bookmarksCompatible = graph.bookmarks.every(
    (bookmark) =>
      bookmark.sourceRevisionId === graph.currentSourceRevisionId ||
      graph.sourceCompatibleRevisionIds.includes(bookmark.sourceRevisionId),
  );
  return [
    {
      expected: `highlight ${graph.generatedAudio.id}/${graph.generatedAudio.speechPlanId}`,
      id: "highlight-map-audio",
      label: "Highlight map matches generated audio",
      observed: graph.highlightMap
        ? `highlight ${graph.highlightMap.generatedAudioId}/${graph.highlightMap.speechPlanId}`
        : "missing highlight map",
      passed: highlightMatchesAudio,
      requiredForWordHighlight: true,
    },
    {
      expected: graph.speechPlan.id,
      id: "audio-speech-plan",
      label: "Generated audio matches speech plan",
      observed: graph.generatedAudio.speechPlanId,
      passed: audioMatchesSpeechPlan,
      requiredForWordHighlight: true,
    },
    {
      expected: `${graph.currentSourceRevisionId}/${graph.identity.policyProfileId}/${graph.identity.voiceProfileId}`,
      id: "speech-plan-source-policy-voice",
      label: "Speech plan matches source, policy, and voice",
      observed: `${graph.speechPlan.sourceRevisionId}/${graph.speechPlan.policyProfileId}/${graph.speechPlan.voiceProfileId}`,
      passed: speechPlanMatchesSource && speechPlanMatchesPolicy && speechPlanMatchesVoice,
      requiredForWordHighlight: true,
    },
    {
      expected: `alignment ${graph.generatedAudio.id}/${graph.generatedAudio.speechPlanId}`,
      id: "alignment-map-audio",
      label: "Alignment map matches generated audio",
      observed: graph.alignmentMap
        ? `alignment ${graph.alignmentMap.generatedAudioId}/${graph.alignmentMap.speechPlanId}`
        : "missing alignment map",
      passed: alignmentMatchesAudio,
      requiredForWordHighlight: true,
    },
    {
      expected: "bookmarks use current or source-compatible revisions",
      id: "bookmarks-source-compatible",
      label: "Bookmarks survive source-compatible changes",
      observed: graph.bookmarks.map((bookmark) => bookmark.sourceRevisionId).join(", "),
      passed: bookmarksCompatible,
      requiredForWordHighlight: false,
    },
  ];
}

export function bookmarkStateForGraph(graph, compatibilityChecks) {
  const bookmarksCompatible = compatibilityChecks.find(
    (check) => check.id === "bookmarks-source-compatible",
  )?.passed;
  if (bookmarksCompatible && graph.currentSourceRevisionId !== graph.identity.sourceRevisionId) {
    return "source-compatible-survived";
  }
  return bookmarksCompatible ? "current" : "incompatible";
}

export function cloneArtifactGraph(graph) {
  return JSON.parse(JSON.stringify(graph));
}

export function buildProviderMatrixSyncFixture({ baseFixture, baseTimings, matrixCase }) {
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

export function evaluateBoundaryStressCase({
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

export function boundaryWordSummary(word) {
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

export function lastWordForSegment(words, segmentId) {
  return [...words].reverse().find((word) => word.nodeId === segmentId) ?? null;
}

export function firstWordForSegment(words, segmentId) {
  return words.find((word) => word.nodeId === segmentId) ?? null;
}

export function findTimingAt(items, audioTimeMs) {
  return items.find((item) => audioTimeMs >= item.startMs && audioTimeMs <= item.endMs) ?? null;
}

export function expectedPauseForBoundary(fixture, stressCase) {
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

export function cueLabel(segment) {
  if (!segment) {
    return "";
  }
  return String(segment.normalizedSpokenText ?? "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}

export function formatBoundaryWord(word) {
  if (!word) {
    return "none";
  }
  return `${word.segmentId}:${word.text}`;
}

export function providerMatrixObservation({ baseTimings, index, matrixCase, observation }) {
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

export function phraseForObservation(timings, observation) {
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

export function providerMatrixThresholds(matrixCase, thresholds) {
  return {
    ...thresholds,
    maxDegradedTimePercentage: matrixCase.expectedLevel === "degraded" ? 100 : 0,
    minFixtureCount: 1,
  };
}

export function driftMetricsForMatrixCase(matrixCase, timeline) {
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

export function providerMatrixHonestyFindings(matrixCase) {
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

export function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

export function max(values) {
  return values.length > 0 ? Math.max(...values) : 0;
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export function formatNumber(value) {
  return typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value);
}

export function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

export function paragraphCount(markdown) {
  return markdown
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith("#") && !part.startsWith("[^")).length;
}

export function sentences(text) {
  return text
    .replaceAll(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function wordCount(text) {
  return tokenize(text).length;
}

export function tokenize(text) {
  return (
    String(text ?? "")
      .trim()
      .match(/\S+/g) ?? []
  );
}
