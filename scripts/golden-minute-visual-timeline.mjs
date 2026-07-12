export function buildGoldenMinuteVisualTimeline({
  checkpoints = [],
  generatedAt = new Date().toISOString(),
  modeledSegmentTransitions = [],
  sampleIntervalSec = null,
  sync = null,
  traceArtifacts = {},
} = {}) {
  const normalizedCheckpoints = checkpoints.map(normalizeCheckpoint);
  const segmentHandoffs = buildSegmentHandoffs(normalizedCheckpoints);
  const visualHighlightTimeline = normalizedCheckpoints.map((checkpoint) => ({
    audioTimeSec: checkpoint.audioTimeSec,
    highlightMode: checkpoint.highlightMode,
    label: checkpoint.label,
    nodeId: checkpoint.nodeId,
    phraseText: checkpoint.phraseText,
    text: checkpoint.text,
    visible: checkpoint.visible,
    wordIndex: checkpoint.wordIndex,
  }));
  const audioCurrentTimeTimeline = normalizedCheckpoints.map((checkpoint) => ({
    audioTimeSec: checkpoint.audioTimeSec,
    label: checkpoint.label,
    paused: checkpoint.audioPaused,
    playbackRate: checkpoint.playbackRate,
  }));
  const driftTimeline = (sync?.timeline ?? []).map((row) => ({
    audioTimeMs: row.audioTimeMs,
    expectedLevel: row.expectedLevel,
    expectedNodeId: row.expectedNodeId,
    expectedWordIndex: row.expectedWordIndex,
    fixtureId: row.fixtureId,
    highlightedNodeId: row.highlightedNodeId,
    highlightedWordIndex: row.highlightedWordIndex,
    observationId: row.observationId,
    phraseDriftMs: row.phraseDriftMs,
    runtimeState: row.runtimeState,
    wordDriftMs: row.wordDriftMs,
  }));
  const requiredEventLabels = ["seek", "resume", "speed-change"];
  const coveredEvents = Object.fromEntries(
    requiredEventLabels.map((event) => [
      event,
      normalizedCheckpoints.some((checkpoint) =>
        event === "speed-change"
          ? checkpoint.label.startsWith("speed-change-") &&
            !checkpoint.label.includes("unavailable")
          : checkpoint.label.includes(event),
      ),
    ]),
  );
  const visibleCount = normalizedCheckpoints.filter((checkpoint) => checkpoint.visible).length;
  return {
    audioCurrentTimeTimeline,
    checkpoints: normalizedCheckpoints,
    driftTimeline,
    generatedAt,
    modeledSegmentTransitions: modeledSegmentTransitions.map(normalizeModeledTransition),
    sampleIntervalSec,
    schemaVersion: "golden-minute-visual-timeline.v1",
    segmentHandoffs,
    summary: {
      checkpointCount: normalizedCheckpoints.length,
      coveredEvents,
      driftSampleCount: driftTimeline.length,
      highlightVisibleCount: visibleCount,
      highlightVisiblePercentage:
        normalizedCheckpoints.length > 0
          ? Math.round((visibleCount / normalizedCheckpoints.length) * 100)
          : 0,
      segmentHandoffCount: segmentHandoffs.length,
      speedChangeObserved: normalizedCheckpoints.some(
        (checkpoint) =>
          checkpoint.label.startsWith("speed-change-") &&
          !checkpoint.label.includes("unavailable") &&
          checkpoint.playbackRate !== null &&
          checkpoint.playbackRate !== 1,
      ),
      uniqueActiveSegments: new Set(
        normalizedCheckpoints
          .map((checkpoint) => checkpoint.nodeId)
          .filter((nodeId) => typeof nodeId === "string" && nodeId.length > 0),
      ).size,
    },
    traceArtifacts,
    visualHighlightTimeline,
  };
}

export function renderGoldenMinuteVisualTimeline(timeline) {
  const lines = [
    "# Golden-Minute Visual Timeline",
    "",
    `Generated: ${timeline.generatedAt}`,
    `Trace capture: ${timeline.traceArtifacts.enabled ? "enabled" : "disabled"}`,
    `Sample interval: ${
      timeline.sampleIntervalSec === null
        ? "checkpoint-only"
        : `${String(timeline.sampleIntervalSec)}s`
    }`,
    "",
    "## Summary",
    "",
    `- Checkpoints: ${String(timeline.summary.checkpointCount)}`,
    `- Highlight visible: ${String(timeline.summary.highlightVisibleCount)} / ${String(
      timeline.summary.checkpointCount,
    )} (${String(timeline.summary.highlightVisiblePercentage)}%)`,
    `- Unique active segments: ${String(timeline.summary.uniqueActiveSegments)}`,
    `- Segment handoffs: ${String(timeline.summary.segmentHandoffCount)}`,
    `- Drift samples: ${String(timeline.summary.driftSampleCount)}`,
    `- Seek covered: ${String(timeline.summary.coveredEvents.seek)}`,
    `- Resume covered: ${String(timeline.summary.coveredEvents.resume)}`,
    `- Speed-change covered: ${String(timeline.summary.coveredEvents["speed-change"])}`,
    `- Speed-change observed: ${String(timeline.summary.speedChangeObserved)}`,
  ];
  if (timeline.traceArtifacts.tracePath || timeline.traceArtifacts.videoPath) {
    lines.push(
      "",
      "## Trace Artifacts",
      "",
      `- Playwright trace: ${timeline.traceArtifacts.tracePath ?? "not captured"}`,
      `- Video: ${timeline.traceArtifacts.videoPath ?? "not captured"}`,
      `- Sampled screenshots: ${timeline.traceArtifacts.sampledScreenshotDir ?? "not captured"}`,
    );
  }
  lines.push(
    "",
    "## Segment Handoffs",
    "",
    "| Checkpoint | Audio time | From | To |",
    "| --- | ---: | --- | --- |",
  );
  if (timeline.segmentHandoffs.length === 0) {
    lines.push("| No visual handoff detected | - | - | - |");
  } else {
    for (const handoff of timeline.segmentHandoffs) {
      lines.push(
        `| ${escapeMarkdown(handoff.label)} | ${formatSeconds(handoff.audioTimeSec)} | ${escapeMarkdown(
          handoff.fromNodeId ?? "-",
        )} | ${escapeMarkdown(handoff.toNodeId ?? "-")} |`,
      );
    }
  }
  lines.push(
    "",
    "## Modeled Segment Boundaries",
    "",
    "| Boundary | Audio time | Expected max gap |",
    "| --- | ---: | ---: |",
  );
  if (timeline.modeledSegmentTransitions.length === 0) {
    lines.push("| No modeled boundaries | - | - |");
  } else {
    for (const transition of timeline.modeledSegmentTransitions) {
      lines.push(
        `| ${escapeMarkdown(transition.fromSegmentId)} to ${escapeMarkdown(
          transition.toSegmentId,
        )} | ${formatMsAsSeconds(transition.boundaryMs)} | ${formatNullableMs(
          transition.expectedMaxGapMs,
        )} |`,
      );
    }
  }
  lines.push(
    "",
    "## Checkpoints",
    "",
    "| Checkpoint | Audio | Highlight | Scroll | Visible | Screenshot |",
    "| --- | ---: | --- | ---: | --- | --- |",
  );
  for (const checkpoint of timeline.checkpoints) {
    lines.push(
      `| ${escapeMarkdown(checkpoint.label)} | ${formatSeconds(
        checkpoint.audioTimeSec,
      )} | ${escapeMarkdown(checkpointHighlightLabel(checkpoint))} | ${String(
        checkpoint.scroll.y,
      )} | ${String(checkpoint.visible)} | ${escapeMarkdown(checkpoint.screenshot ?? "-")} |`,
    );
  }
  lines.push(
    "",
    "## Drift Timeline",
    "",
    "| Observation | Audio ms | Runtime | Word drift | Phrase drift |",
    "| --- | ---: | --- | ---: | ---: |",
  );
  for (const row of timeline.driftTimeline.slice(0, 12)) {
    lines.push(
      `| ${escapeMarkdown(row.observationId)} | ${String(row.audioTimeMs)} | ${escapeMarkdown(
        row.runtimeState,
      )} | ${formatNullableMs(row.wordDriftMs)} | ${formatNullableMs(row.phraseDriftMs)} |`,
    );
  }
  if (timeline.driftTimeline.length > 12) {
    lines.push(`| ... ${String(timeline.driftTimeline.length - 12)} more | - | - | - | - |`);
  }
  lines.push("");
  return lines.join("\n");
}

function normalizeCheckpoint(checkpoint, index) {
  return {
    audioPaused: Boolean(checkpoint.audioPaused),
    audioTimeSec:
      typeof checkpoint.audioTimeSec === "number" && Number.isFinite(checkpoint.audioTimeSec)
        ? Math.round(checkpoint.audioTimeSec * 1000) / 1000
        : null,
    elapsedMs:
      typeof checkpoint.elapsedMs === "number" && Number.isFinite(checkpoint.elapsedMs)
        ? Math.round(checkpoint.elapsedMs)
        : null,
    highlightMode: checkpoint.highlightMode ?? "unknown",
    index,
    label: checkpoint.label ?? `checkpoint-${String(index + 1)}`,
    nodeId: checkpoint.nodeId ?? null,
    phraseText: checkpoint.phraseText ?? null,
    playbackRate:
      typeof checkpoint.playbackRate === "number" && Number.isFinite(checkpoint.playbackRate)
        ? checkpoint.playbackRate
        : null,
    rect: checkpoint.rect ?? null,
    screenshot: checkpoint.screenshot ?? null,
    scroll: {
      documentHeight: checkpoint.scroll?.documentHeight ?? null,
      viewportHeight: checkpoint.scroll?.viewportHeight ?? null,
      x: checkpoint.scroll?.x ?? 0,
      y: checkpoint.scroll?.y ?? 0,
    },
    text: checkpoint.text ?? "",
    visible: Boolean(checkpoint.visible),
    wordIndex: checkpoint.wordIndex ?? null,
  };
}

function normalizeModeledTransition(transition) {
  return {
    boundaryMs:
      typeof transition.boundaryMs === "number" && Number.isFinite(transition.boundaryMs)
        ? transition.boundaryMs
        : null,
    expectedMaxGapMs:
      typeof transition.expectedMaxGapMs === "number" &&
      Number.isFinite(transition.expectedMaxGapMs)
        ? transition.expectedMaxGapMs
        : null,
    fromSegmentId: transition.fromSegmentId ?? "-",
    toSegmentId: transition.toSegmentId ?? "-",
  };
}

function buildSegmentHandoffs(checkpoints) {
  const handoffs = [];
  let previous = null;
  for (const checkpoint of checkpoints) {
    if (!checkpoint.nodeId) {
      continue;
    }
    if (previous && previous.nodeId !== checkpoint.nodeId) {
      handoffs.push({
        audioTimeSec: checkpoint.audioTimeSec,
        fromLabel: previous.label,
        fromNodeId: previous.nodeId,
        label: checkpoint.label,
        toNodeId: checkpoint.nodeId,
      });
    }
    previous = checkpoint;
  }
  return handoffs;
}

function checkpointHighlightLabel(checkpoint) {
  const identity = checkpoint.wordIndex
    ? `${checkpoint.nodeId ?? "unknown"} word ${checkpoint.wordIndex}`
    : (checkpoint.nodeId ?? "no active node");
  const text = checkpoint.text || checkpoint.phraseText || "";
  return text ? `${identity}: ${text.slice(0, 80)}` : identity;
}

function formatSeconds(value) {
  return typeof value === "number" ? value.toFixed(2) : "-";
}

function formatNullableMs(value) {
  return typeof value === "number" ? String(value) : "-";
}

function formatMsAsSeconds(value) {
  return typeof value === "number" ? (value / 1000).toFixed(2) : "-";
}

function escapeMarkdown(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}
