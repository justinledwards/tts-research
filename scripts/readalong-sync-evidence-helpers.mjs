export function normalizeFixture(fixture) {
  return {
    expectedLevel: "word",
    maxScrollJumpPx: 480,
    phraseWordCount: 4,
    sampleDurationMs: 250,
    waivers: [],
    ...fixture,
  };
}

export function buildFixtureTimings(fixture) {
  const blocks = [];
  const words = [];
  const phrases = [];
  let wordIndex = 0;
  let phraseIndex = 0;
  for (const node of fixture.nodes ?? []) {
    if (!nodeIsSpeakable(node)) {
      continue;
    }
    const nodeText = nodeSpeechText(node);
    const nodeWords = tokenize(nodeText);
    const nodeStartMs = node.startMs;
    const nodeEndMs = node.startMs + node.durationMs;
    blocks.push({
      endMs: nodeEndMs,
      nodeId: node.nodeId,
      speechMode: nodeSpeechMode(node),
      startMs: nodeStartMs,
      text: nodeText,
    });
    const wordDurationMs = Math.max(1, Math.floor(node.durationMs / Math.max(1, nodeWords.length)));
    const phraseWordCount = node.phraseWordCount ?? fixture.phraseWordCount ?? 4;
    for (const [localIndex, word] of nodeWords.entries()) {
      const startMs = node.startMs + localIndex * wordDurationMs;
      const endMs =
        localIndex === nodeWords.length - 1
          ? node.startMs + node.durationMs
          : startMs + wordDurationMs;
      words.push({
        endMs,
        nodeId: node.nodeId,
        startMs,
        text: word,
        wordIndex,
      });
      wordIndex += 1;
    }
    for (let offset = 0; offset < nodeWords.length; offset += phraseWordCount) {
      const first = words.find(
        (word) =>
          word.nodeId === node.nodeId && word.wordIndex >= wordIndex - nodeWords.length + offset,
      );
      const last = words.find(
        (word) =>
          word.nodeId === node.nodeId &&
          word.wordIndex ===
            Math.min(wordIndex - 1, wordIndex - nodeWords.length + offset + phraseWordCount - 1),
      );
      if (first && last) {
        phrases.push({
          endMs: last.endMs,
          nodeId: node.nodeId,
          phraseIndex,
          startMs: first.startMs,
          wordEndIndex: last.wordIndex,
          wordStartIndex: first.wordIndex,
        });
        phraseIndex += 1;
      }
    }
  }
  return { blocks, phrases, words };
}

export function evaluateFixture(fixture) {
  const timings = buildFixtureTimings(fixture);
  const timeline = fixture.observations.map((observation, index) =>
    evaluateObservation(fixture, timings, observation, index),
  );
  const wordDrifts = timeline
    .map((row) => row.wordDriftMs)
    .filter((value) => typeof value === "number");
  const phraseDrifts = timeline
    .map((row) => row.phraseDriftMs)
    .filter((value) => typeof value === "number");
  const failures = timeline.flatMap((row) => row.failures);
  return {
    file: fixture.file,
    id: fixture.id,
    kind: fixture.kind,
    metrics: {
      maxPhraseDriftMs: roundMetric(max(phraseDrifts)),
      medianWordDriftMs: roundMetric(percentile(wordDrifts, 50)),
      p95WordDriftMs: roundMetric(percentile(wordDrifts, 95)),
      sampleCount: timeline.length,
      wordDriftSampleCount: wordDrifts.length,
    },
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    timeline,
    timingSource: fixture.timingSource,
    title: fixture.title,
  };
}

function evaluateObservation(fixture, timings, observation, index) {
  const expectedWord = findTimingAt(timings.words, observation.audioTimeMs);
  const expectedPhrase = findTimingAt(timings.phrases, observation.audioTimeMs);
  const expectedBlock = findTimingAt(timings.blocks, observation.audioTimeMs);
  const expectedLevel = observation.expectedLevel ?? fixture.expectedLevel ?? "word";
  const runtimeState = observation.runtimeState ?? runtimeStateForObservation(fixture, observation);
  const sampleDurationMs = observation.sampleDurationMs ?? fixture.sampleDurationMs ?? 250;
  const highlightedWord = findHighlightedWord(timings.words, observation);
  const highlightedPhrase = findHighlightedPhrase(timings.phrases, observation, highlightedWord);
  const wordDriftMs =
    expectedLevel === "word" && highlightedWord
      ? Math.max(
          driftFromRange(observation.audioTimeMs, highlightedWord),
          typeof observation.observedHighlightTimeMs === "number"
            ? Math.abs(observation.observedHighlightTimeMs - observation.audioTimeMs)
            : 0,
        )
      : null;
  const phraseDriftMs =
    (expectedLevel === "phrase" || runtimeState === "resyncing") && highlightedPhrase
      ? Math.max(
          driftFromRange(observation.audioTimeMs, highlightedPhrase),
          typeof observation.observedHighlightTimeMs === "number"
            ? Math.abs(observation.observedHighlightTimeMs - observation.audioTimeMs)
            : 0,
        )
      : null;
  const issues = [];
  const failures = [];

  if (observation.audioState === "stale") {
    if (observation.highlightedNodeId || observation.highlightedWordIndex !== null) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "stale-highlight",
        issues,
        message: "Stale audio drove a visible highlight.",
      });
    }
  } else if (
    observation.highlightedNodeId &&
    expectedBlock &&
    observation.highlightedNodeId !== expectedBlock.nodeId
  ) {
    addIssue({
      failures,
      fixture,
      index,
      issue: "wrong-node",
      issues,
      message: `Wrong visible block: highlighted node ${observation.highlightedNodeId} instead of ${expectedBlock.nodeId}.`,
    });
  } else if (expectedLevel === "block") {
    if (!observation.highlightedNodeId) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "missed-highlight",
        issues,
        message: "Expected block-level highlight was missing.",
      });
    }
  } else if (expectedLevel === "word") {
    if (!highlightedWord) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "missed-highlight",
        issues,
        message: "Expected word-level highlight was missing.",
      });
    }
    if (highlightedWord && expectedWord && highlightedWord.nodeId !== expectedWord.nodeId) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "wrong-node",
        issues,
        message: `Highlighted node ${highlightedWord.nodeId} instead of ${expectedWord.nodeId}.`,
      });
    }
    if (
      highlightedWord &&
      expectedWord &&
      highlightedWord.nodeId === expectedWord.nodeId &&
      highlightedWord.wordIndex !== expectedWord.wordIndex
    ) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "wrong-word",
        issues,
        message: `Highlighted word ${String(highlightedWord.wordIndex)} instead of ${String(
          expectedWord.wordIndex,
        )}.`,
      });
    }
  } else if (expectedLevel === "phrase" && !highlightedPhrase) {
    addIssue({
      failures,
      fixture,
      index,
      issue: "missed-highlight",
      issues,
      message: "Expected phrase-level highlight was missing.",
    });
  }

  if ((observation.scrollJumpPx ?? 0) > (fixture.maxScrollJumpPx ?? 480)) {
    addIssue({
      failures,
      fixture,
      index,
      issue: "scroll-jump",
      issues,
      message: `Scroll jump ${String(observation.scrollJumpPx)}px exceeded budget.`,
    });
  }

  if (
    observation.expectedScrollTargetNodeId &&
    observation.observedScrollTargetNodeId !== observation.expectedScrollTargetNodeId
  ) {
    addIssue({
      failures,
      fixture,
      index,
      issue: "scroll-target",
      issues,
      message: `Scroll target ${observation.observedScrollTargetNodeId ?? "missing"} did not match ${observation.expectedScrollTargetNodeId}.`,
    });
  }

  return {
    audioState: observation.audioState ?? "ready",
    audioTimeMs: observation.audioTimeMs,
    expectedLevel,
    expectedNodeId:
      expectedWord?.nodeId ??
      expectedPhrase?.nodeId ??
      expectedBlock?.nodeId ??
      observation.expectedNodeId ??
      null,
    expectedPhraseIndex: expectedPhrase?.phraseIndex ?? null,
    expectedWordIndex: expectedWord?.wordIndex ?? null,
    failures,
    fixtureId: fixture.id,
    highlightedNodeId: observation.highlightedNodeId ?? null,
    highlightedPhraseIndex:
      highlightedPhrase?.phraseIndex ?? observation.highlightedPhraseIndex ?? null,
    highlightedWordIndex: highlightedWord?.wordIndex ?? observation.highlightedWordIndex ?? null,
    issues,
    observationId: observation.id ?? `${fixture.id}-${String(index + 1)}`,
    phraseDriftMs: phraseDriftMs === null ? null : roundMetric(phraseDriftMs),
    runtimeState,
    sampleDurationMs,
    scrollJumpPx: observation.scrollJumpPx ?? 0,
    scrollTargetNodeId: observation.observedScrollTargetNodeId ?? null,
    wordDriftMs: wordDriftMs === null ? null : roundMetric(wordDriftMs),
  };
}

export function renderSyncEvidenceHtml(fixture, timelineRows) {
  const timings = buildFixtureTimings(fixture);
  const rowMarkup = timelineRows
    .map((row) => renderObservationRow(row, timings, fixture))
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(fixture.title)}</title>
    <style>
      body {
        margin: 0;
        background: #f8fafc;
        color: #172033;
        font: 16px/1.5 system-ui, sans-serif;
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px;
      }
      section {
        border: 1px solid #d8dee9;
        border-radius: 8px;
        background: #fff;
        margin-bottom: 16px;
        padding: 16px;
      }
      .active {
        border-bottom: 3px solid #155e75;
        background: #dff6ff;
      }
      .phrase {
        outline: 2px solid #64748b;
        outline-offset: 2px;
      }
      .degraded {
        border: 1px dashed #b45309;
        background: #fffbeb;
      }
      .stale {
        color: #7c2d12;
      }
      .word {
        display: inline-block;
        margin-right: 4px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(fixture.title)}</h1>
      <p>${escapeHtml(fixture.kind)} · ${escapeHtml(fixture.timingSource)}</p>
      ${rowMarkup}
    </main>
  </body>
</html>`;
}

export function compareReadAlongSyncThresholds(metrics, thresholds) {
  const mappings = {
    maxDegradedTimePercentage: ["degradedTimePercentage", "<="],
    maxMedianWordDriftMs: ["medianWordDriftMs", "<="],
    maxMissedHighlightCount: ["missedHighlightCount", "<="],
    maxP95WordDriftMs: ["p95WordDriftMs", "<="],
    maxPhraseDriftMs: ["maxPhraseDriftMs", "<="],
    maxScrollJumpCount: ["scrollJumpCount", "<="],
    maxStaleHighlightCount: ["staleHighlightCount", "<="],
    maxWrongNodeCount: ["wrongNodeCount", "<="],
    maxWrongWordCount: ["wrongWordCount", "<="],
    minFixtureCount: ["fixtureCount", ">="],
  };
  return Object.entries(mappings).map(([threshold, [metric, operator]]) => {
    const actual = metrics[metric];
    const expected = thresholds[threshold];
    return {
      actual,
      expected,
      metric,
      operator,
      passed: operator === "<=" ? actual <= expected : actual >= expected,
      threshold,
    };
  });
}

export function countIssues(timeline, issue) {
  return timeline.filter((row) => row.issues.includes(issue)).length;
}

export function collectWaivers(fixtures) {
  return fixtures.flatMap((fixture) =>
    (fixture.waivers ?? []).map((waiver) => ({
      fixtureId: fixture.id,
      owner: waiver.owner ?? "unassigned",
      reason: waiver.reason ?? "No reason provided.",
    })),
  );
}

export function formatReadAlongSyncBenchmark(result) {
  return [
    "Read-along sync benchmark",
    `Status: ${result.status.toUpperCase()}`,
    `Fixtures: ${String(result.metrics.fixtureCount)}`,
    `Word drift: median=${formatNumber(result.metrics.medianWordDriftMs)}ms p95=${formatNumber(
      result.metrics.p95WordDriftMs,
    )}ms samples=${String(result.metrics.wordDriftSampleCount)}`,
    `Phrase drift: max=${formatNumber(result.metrics.maxPhraseDriftMs)}ms samples=${String(
      result.metrics.phraseDriftSampleCount,
    )}`,
    `Integrity: wrong-node=${String(result.metrics.wrongNodeCount)} missed=${String(
      result.metrics.missedHighlightCount,
    )} stale=${String(result.metrics.staleHighlightCount)} scroll-jumps=${String(
      result.metrics.scrollJumpCount,
    )}`,
    `Runtime: resync=${String(result.metrics.resyncCount)} degraded=${formatNumber(
      result.metrics.degradedTimePercentage,
    )}%`,
    "Thresholds:",
    ...result.comparisons.map(
      (comparison) =>
        `- ${comparison.passed ? "PASS" : "FAIL"} ${comparison.metric}: ${formatNumber(
          comparison.actual,
        )} ${comparison.operator} ${formatNumber(comparison.expected)}`,
    ),
  ].join("\n");
}

export function renderReadAlongSyncSummary(result) {
  const lines = [
    "# Read-along Sync Evidence",
    "",
    `Status: **${result.status.toUpperCase()}**`,
    `Generated: ${result.generatedAt}`,
    "",
    "## Metrics",
    "",
    `- Median word drift: ${formatNumber(result.metrics.medianWordDriftMs)} ms`,
    `- P95 word drift: ${formatNumber(result.metrics.p95WordDriftMs)} ms`,
    `- Max phrase drift: ${formatNumber(result.metrics.maxPhraseDriftMs)} ms`,
    `- Resync count: ${String(result.metrics.resyncCount)}`,
    `- Degraded time: ${formatNumber(result.metrics.degradedTimePercentage)}%`,
    `- Missed highlights: ${String(result.metrics.missedHighlightCount)}`,
    `- Wrong-node highlights: ${String(result.metrics.wrongNodeCount)}`,
    `- Scroll jumps: ${String(result.metrics.scrollJumpCount)}`,
    `- Stale highlights: ${String(result.metrics.staleHighlightCount)}`,
    "",
    "## Fixture Coverage",
    "",
    "| Fixture | Kind | Timing | Status | Word p95 | Phrase max | Issues |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
  ];
  for (const fixture of result.fixtureResults) {
    lines.push(
      `| ${escapeMarkdown(fixture.title)} | ${fixture.kind} | ${fixture.timingSource} | ${
        fixture.status
      } | ${formatNumber(fixture.metrics.p95WordDriftMs)} | ${formatNumber(
        fixture.metrics.maxPhraseDriftMs,
      )} | ${String(fixture.failures.length)} |`,
    );
  }
  lines.push("", "## Thresholds", "");
  for (const comparison of result.comparisons) {
    lines.push(
      `- ${comparison.passed ? "PASS" : "FAIL"} ${comparison.metric}: ${formatNumber(
        comparison.actual,
      )} ${comparison.operator} ${formatNumber(comparison.expected)}`,
    );
  }
  lines.push("", "## Waivers", "");
  if (result.waivers.length === 0) {
    lines.push("- None.");
  } else {
    for (const waiver of result.waivers) {
      lines.push(`- ${waiver.fixtureId}: ${waiver.reason} (owner: ${waiver.owner})`);
    }
  }
  if (result.screenshots?.length) {
    lines.push("", "## Browser Evidence", "");
    for (const screenshot of result.screenshots) {
      lines.push(`- ${screenshot}`);
    }
  }
  const failures = [
    ...result.timeline.flatMap((row) => row.failures),
    ...result.comparisons
      .filter((comparison) => !comparison.passed)
      .map(
        (comparison) =>
          `${comparison.metric} ${formatNumber(comparison.actual)} ${comparison.operator} ${formatNumber(
            comparison.expected,
          )}`,
      ),
  ];
  if (failures.length > 0) {
    lines.push("", "## Failures", "", ...failures.map((failure) => `- ${failure}`));
  }
  lines.push("");
  return lines.join("\n");
}

function runtimeStateForObservation(fixture, observation) {
  if (observation.audioState === "stale") {
    return "stale-audio";
  }
  if ((observation.expectedLevel ?? fixture.expectedLevel) === "degraded") {
    return "degraded";
  }
  if (observation.resync) {
    return "resyncing";
  }
  if ((observation.expectedLevel ?? fixture.expectedLevel) === "phrase") {
    return "synced-phrase";
  }
  return "synced-word";
}

function findHighlightedWord(words, observation) {
  if (observation.highlightedWordIndex === null || observation.highlightedWordIndex === undefined) {
    return null;
  }
  return (
    words.find(
      (word) =>
        word.wordIndex === observation.highlightedWordIndex &&
        (!observation.highlightedNodeId || word.nodeId === observation.highlightedNodeId),
    ) ?? null
  );
}

function findHighlightedPhrase(phrases, observation, highlightedWord) {
  if (
    observation.highlightedPhraseIndex !== undefined &&
    observation.highlightedPhraseIndex !== null
  ) {
    return (
      phrases.find((phrase) => phrase.phraseIndex === observation.highlightedPhraseIndex) ?? null
    );
  }
  if (highlightedWord) {
    return (
      phrases.find(
        (phrase) =>
          phrase.nodeId === highlightedWord.nodeId &&
          highlightedWord.wordIndex >= phrase.wordStartIndex &&
          highlightedWord.wordIndex <= phrase.wordEndIndex,
      ) ?? null
    );
  }
  return null;
}

function findTimingAt(items, audioTimeMs) {
  return items.find((item) => audioTimeMs >= item.startMs && audioTimeMs <= item.endMs) ?? null;
}

function driftFromRange(audioTimeMs, range) {
  if (audioTimeMs >= range.startMs && audioTimeMs <= range.endMs) {
    return 0;
  }
  return Math.min(Math.abs(audioTimeMs - range.startMs), Math.abs(audioTimeMs - range.endMs));
}

function addIssue({ failures, fixture, index, issue, issues, message }) {
  issues.push(issue);
  failures.push(`${fixture.id}#${String(index + 1)} ${issue}: ${message}`);
}

function tokenize(text) {
  return text.trim().match(/\S+/g) ?? [];
}

function nodeSpeechMode(node) {
  return String(node.speakMode ?? node.speechMode ?? "speak")
    .trim()
    .toLowerCase();
}

function nodeIsSpeakable(node) {
  const mode = nodeSpeechMode(node);
  return mode !== "skip" && mode !== "ondemand" && mode !== "on-demand";
}

function nodeIsSummarized(node) {
  const mode = nodeSpeechMode(node);
  return mode === "summarize" || mode === "summarise" || mode === "summary";
}

function nodeSpeechText(node) {
  return nodeIsSummarized(node)
    ? (node.spokenText ?? node.summaryText ?? node.text ?? "")
    : node.text;
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function max(values) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value) {
  return typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value);
}

function formatNullableMs(value) {
  return typeof value === "number" ? `${formatNumber(value)}ms` : "-";
}

function renderObservationRow(row, timings, fixture) {
  const highlightedPhrase =
    row.highlightedPhraseIndex === null
      ? null
      : (timings.phrases.find((phrase) => phrase.phraseIndex === row.highlightedPhraseIndex) ??
        null);
  const sourceId = row.fixtureId ?? row.observationId ?? "readalong-fixture";
  const wordsByNodeId = new Map();
  for (const word of timings.words) {
    const bucket = wordsByNodeId.get(word.nodeId) ?? [];
    bucket.push(word);
    wordsByNodeId.set(word.nodeId, bucket);
  }
  const nodesMarkup = (fixture.nodes ?? [])
    .map((node) => {
      if (!nodeIsSpeakable(node)) {
        return `<div class="visible-node skipped" data-visible-node-id="${escapeHtml(
          node.nodeId,
        )}" data-speech-mode="skip">${escapeHtml(node.text)}</div>`;
      }
      if (nodeIsSummarized(node)) {
        const active = row.highlightedNodeId === node.nodeId && row.expectedLevel === "block";
        const className = [
          "visible-node",
          "summary",
          active ? "active" : "",
          row.runtimeState === "degraded" ? "degraded" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<div class="${className}" data-sync-node-id="${escapeHtml(
          node.nodeId,
        )}" data-readalong-source-id="${escapeHtml(sourceId)}" data-readalong-node-id="${escapeHtml(
          node.nodeId,
        )}" data-readalong-timing-state="${escapeHtml(
          row.runtimeState,
        )}" data-source-word-id="${escapeHtml(
          `${sourceId}:${node.nodeId}:summary`,
        )}" data-sync-active="${active ? "true" : "false"}">${escapeHtml(node.text)}</div>`;
      }
      const wordsMarkup = (wordsByNodeId.get(node.nodeId) ?? [])
        .map((word) => {
          const phraseActive =
            highlightedPhrase &&
            word.nodeId === highlightedPhrase.nodeId &&
            word.wordIndex >= highlightedPhrase.wordStartIndex &&
            word.wordIndex <= highlightedPhrase.wordEndIndex;
          const wordActive =
            word.wordIndex === row.highlightedWordIndex &&
            (!row.highlightedNodeId || row.highlightedNodeId === word.nodeId);
          const active = wordActive || phraseActive;
          const className = [
            "word",
            active ? "active" : "",
            row.expectedLevel === "phrase" && active ? "phrase" : "",
            row.runtimeState === "degraded" ? "degraded" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `<span class="${className}" data-sync-node-id="${escapeHtml(
            word.nodeId,
          )}" data-readalong-source-id="${escapeHtml(sourceId)}" data-readalong-node-id="${escapeHtml(
            word.nodeId,
          )}" data-readalong-word-index="${String(
            word.wordIndex,
          )}" data-readalong-timing-state="${escapeHtml(
            row.runtimeState,
          )}" data-source-word-id="${escapeHtml(
            `${sourceId}:${word.nodeId}:${String(word.wordIndex)}`,
          )}" data-sync-word-index="${String(word.wordIndex)}" data-sync-active="${
            active ? "true" : "false"
          }">${escapeHtml(word.text)}</span>`;
        })
        .join(" ");
      return `<p class="visible-node" data-visible-node-id="${escapeHtml(
        node.nodeId,
      )}">${wordsMarkup}</p>`;
    })
    .join("\n");
  return `<section data-sync-observation-id="${escapeHtml(
    row.observationId,
  )}" data-sync-runtime-state="${escapeHtml(row.runtimeState)}" data-sync-expected-node="${escapeHtml(
    row.expectedNodeId ?? "",
  )}" data-sync-highlighted-node="${escapeHtml(row.highlightedNodeId ?? "")}">
  <h2>${escapeHtml(row.observationId)}</h2>
  <p class="${row.runtimeState === "stale-audio" ? "stale" : ""}">time=${String(
    row.audioTimeMs,
  )}ms · state=${escapeHtml(row.runtimeState)} · word drift=${formatNullableMs(
    row.wordDriftMs,
  )} · phrase drift=${formatNullableMs(row.phraseDriftMs)}</p>
  <div>${nodesMarkup || "No visible highlight expected."}</div>
</section>`;
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
