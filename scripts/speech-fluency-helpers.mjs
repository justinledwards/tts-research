export const DEFAULT_SPEECH_FLUENCY_THRESHOLDS = {
  maxDurationEstimateDeltaRatio: 0.18,
  maxInterSegmentPauseMs: 900,
  maxRepeatedSilenceMs: 450,
  maxUnpunctuatedInterSegmentPauseMs: 500,
  minEdgeRms: 0.012,
  minSegmentRms: 0.018,
  sampleRate: 16_000,
  silenceAmplitude: 0.006,
};

export function buildSpeechFluencySegmentsFromFixture(fixture) {
  const segmentById = new Map(
    (fixture.speechPlan.segments ?? []).map((segment) => [segment.id, segment]),
  );
  return (fixture.timing.segmentBoundaries ?? []).map((boundary) => {
    const segment = segmentById.get(boundary.segmentId) ?? {};
    const startMs = Number(boundary.startMs ?? 0);
    const endMs = Number(boundary.endMs ?? startMs);
    const text = segment.normalizedSpokenText ?? "";
    return {
      id: boundary.segmentId,
      expectedDurationMs: Math.max(1, endMs - startMs),
      generatedDurationMs: Math.max(1, endMs - startMs),
      kind: segment.kind ?? "segment",
      sourceLocator: segment.sourceLocator ?? null,
      startMs,
      text,
    };
  });
}

export function buildSpeechFluencySegmentsFromJob(job) {
  const jobSegments = job?.segments ?? [];
  const durations = job?.audioSegmentDurationsMs ?? [];
  let cursorMs = 0;
  return jobSegments.map((segment, index) => {
    const text = segment.text ?? "";
    const generatedDurationMs = Math.max(
      1,
      Number(durations[index] ?? segment.durationMs ?? estimateMockSpeechDurationMs(text)),
    );
    const output = {
      id: `job-segment-${String(segment.index ?? index + 1)}`,
      expectedDurationMs: estimateMockSpeechDurationMs(text),
      generatedDurationMs,
      kind: "generated",
      sourceLocator: null,
      startMs: cursorMs,
      text,
    };
    cursorMs += generatedDurationMs;
    return output;
  });
}

export function evaluateSpeechFluency({
  audioBuffer = null,
  generatedAt = new Date().toISOString(),
  label = "Speech fluency",
  pauseModel = {},
  segments,
  segmentTransitions = [],
  thresholds = {},
} = {}) {
  const effectiveThresholds = { ...DEFAULT_SPEECH_FLUENCY_THRESHOLDS, ...thresholds };
  const normalizedSegments = normalizeSegments(segments ?? []);
  const parsedAudio = audioBuffer ? parsePCM16WAV(audioBuffer) : null;
  const pcm =
    parsedAudio?.pcm ?? buildSyntheticSpeechPCM(normalizedSegments, effectiveThresholds.sampleRate);
  const sampleRate = parsedAudio?.sampleRate ?? effectiveThresholds.sampleRate;
  const segmentReports = normalizedSegments.map((segment) =>
    analyzeSegment({ pcm, sampleRate, segment, thresholds: effectiveThresholds }),
  );
  const seamReports = analyzeSeams({
    pcm,
    sampleRate,
    segmentReports,
    segmentTransitions,
    thresholds: effectiveThresholds,
  });
  const metrics = summarizeSpeechFluency(segmentReports, seamReports);
  const checks = speechFluencyChecks(metrics, effectiveThresholds);
  const failures = [
    ...checks.filter((check) => !check.passed).map((check) => check.failure),
    ...segmentReports.flatMap((segment) => segment.findings.map((finding) => finding.message)),
    ...seamReports.flatMap((seam) => seam.findings.map((finding) => finding.message)),
  ];

  return {
    audio: {
      durationMs: Math.round((pcm.length / sampleRate) * 1000),
      source: parsedAudio ? "generated-wav" : "local-synthetic-baseline",
    },
    checks,
    generatedAt,
    label,
    metrics,
    pauseModel: {
      defaultCommaPauseMs: pauseModel.defaultCommaPauseMs ?? null,
      defaultSentencePauseMs: pauseModel.defaultSentencePauseMs ?? null,
      naturalPauseMarkers: pauseModel.naturalPauseMarkers ?? [],
      paragraphTransitionPauseMs: pauseModel.paragraphTransitionPauseMs ?? null,
    },
    schemaVersion: "speech-fluency-report.v1",
    seamReports,
    segmentReports,
    status: failures.length === 0 ? "passed" : "failed",
    thresholds: effectiveThresholds,
  };
}

export function renderSpeechFluencyReport(report) {
  const lines = [
    "# Speech Fluency Evidence",
    "",
    `Status: **${report.status.toUpperCase()}**`,
    `Generated: ${report.generatedAt}`,
    `Audio source: ${report.audio.source}`,
    "",
    "## Summary",
    "",
    `- Segments: ${String(report.metrics.segmentCount)}`,
    `- Inter-segment seams: ${String(report.metrics.seamCount)}`,
    `- Max inter-segment pause: ${formatMs(report.metrics.maxInterSegmentPauseMs)}`,
    `- Max duration estimate delta: ${formatPercent(report.metrics.maxDurationEstimateDeltaRatio)}`,
    `- Clipped starts: ${String(report.metrics.clippedStartCount)}`,
    `- Clipped ends: ${String(report.metrics.clippedEndCount)}`,
    `- Silent segments: ${String(report.metrics.silentSegmentCount)}`,
    `- Excessive pauses: ${String(report.metrics.excessivePauseCount)}`,
    `- Repeated silence findings: ${String(report.metrics.repeatedSilenceCount)}`,
    "",
    "## Checks",
    "",
    "| Check | Status | Actual | Target |",
    "| --- | --- | ---: | --- |",
  ];
  for (const check of report.checks) {
    lines.push(
      `| ${check.id} | ${check.passed ? "PASS" : "FAIL"} | ${String(check.actual)} | ${check.target} |`,
    );
  }
  lines.push(
    "",
    "## Segment Details",
    "",
    "| Segment | Duration | Estimate | First 200ms RMS | Last 200ms RMS | Longest silence | Findings |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
  );
  for (const segment of report.segmentReports) {
    lines.push(
      `| ${escapeMarkdown(segment.id)} | ${formatMs(segment.generatedDurationMs)} | ${formatMs(
        segment.expectedDurationMs,
      )} | ${formatNumber(segment.energy.first200msRms)} | ${formatNumber(
        segment.energy.last200msRms,
      )} | ${formatMs(segment.energy.longestSilenceMs)} | ${findingsLabel(segment.findings)} |`,
    );
  }
  lines.push(
    "",
    "## Segment Seams",
    "",
    "| Seam | Pause | Allowed | Punctuation | Findings |",
    "| --- | ---: | ---: | --- | --- |",
  );
  for (const seam of report.seamReports) {
    lines.push(
      `| ${escapeMarkdown(seam.id)} | ${formatMs(seam.interSegmentPauseMs)} | ${formatMs(
        seam.allowedPauseMs,
      )} | ${escapeMarkdown(seam.punctuationClass)} | ${findingsLabel(seam.findings)} |`,
    );
  }
  const failures = [
    ...report.segmentReports.flatMap((segment) =>
      segment.findings.map((finding) => finding.message),
    ),
    ...report.seamReports.flatMap((seam) => seam.findings.map((finding) => finding.message)),
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

export function estimateMockSpeechDurationMs(text) {
  const runeCount = [...String(text ?? "")].length;
  return Math.min(12_000, 800 + runeCount * 35);
}

export function buildSyntheticSpeechWAV(
  segments,
  sampleRate = DEFAULT_SPEECH_FLUENCY_THRESHOLDS.sampleRate,
) {
  const pcm = buildSyntheticSpeechPCM(normalizeSegments(segments), sampleRate);
  return buildPCM16WAV(pcm, sampleRate);
}

export function parsePCM16WAV(bufferLike) {
  const buffer = Buffer.isBuffer(bufferLike)
    ? bufferLike
    : Buffer.from(bufferLike instanceof ArrayBuffer ? bufferLike : new Uint8Array(bufferLike));
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Expected a PCM RIFF/WAVE buffer.");
  }
  let cursor = 12;
  let sampleRate = 0;
  let channelCount = 0;
  let bitsPerSample = 0;
  let data = null;
  while (cursor + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", cursor, cursor + 4);
    const chunkSize = buffer.readUInt32LE(cursor + 4);
    cursor += 8;
    if (cursor + chunkSize > buffer.length) {
      throw new Error("WAV chunk exceeds file length.");
    }
    if (chunkId === "fmt ") {
      const audioFormat = buffer.readUInt16LE(cursor);
      if (audioFormat !== 1) {
        throw new Error("Only PCM WAV audio is supported.");
      }
      channelCount = buffer.readUInt16LE(cursor + 2);
      sampleRate = buffer.readUInt32LE(cursor + 4);
      bitsPerSample = buffer.readUInt16LE(cursor + 14);
    } else if (chunkId === "data") {
      data = buffer.subarray(cursor, cursor + chunkSize);
    }
    cursor += chunkSize + (chunkSize % 2);
  }
  if (!data || sampleRate <= 0 || channelCount <= 0 || bitsPerSample !== 16) {
    throw new Error("WAV buffer is missing 16-bit PCM fmt/data chunks.");
  }
  const pcm = new Float64Array(Math.floor(data.length / (channelCount * 2)));
  for (let frame = 0; frame < pcm.length; frame += 1) {
    let sampleTotal = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      sampleTotal += data.readInt16LE((frame * channelCount + channel) * 2) / 32768;
    }
    pcm[frame] = sampleTotal / channelCount;
  }
  return { channelCount, pcm, sampleRate };
}

function normalizeSegments(segments) {
  let cursorMs = 0;
  return segments.map((segment, index) => {
    const generatedDurationMs = Math.max(
      1,
      Number(segment.generatedDurationMs ?? segment.durationMs ?? 0),
    );
    const startMs = Number.isFinite(segment.startMs) ? Number(segment.startMs) : cursorMs;
    cursorMs = startMs + generatedDurationMs;
    const text = String(segment.text ?? "");
    return {
      ...segment,
      id: String(segment.id ?? `segment-${String(index + 1)}`),
      expectedDurationMs: Math.max(
        1,
        Number(segment.expectedDurationMs ?? estimateMockSpeechDurationMs(text)),
      ),
      generatedDurationMs,
      punctuationClass: punctuationClassForText(text),
      startMs,
      text,
    };
  });
}

function analyzeSegment({ pcm, sampleRate, segment, thresholds }) {
  const startFrame = frameForMs(segment.startMs, sampleRate);
  const endFrame = frameForMs(segment.startMs + segment.generatedDurationMs, sampleRate);
  const edgeFrames = frameForMs(200, sampleRate);
  const firstRms = rms(pcm, startFrame, Math.min(endFrame, startFrame + edgeFrames));
  const lastRms = rms(pcm, Math.max(startFrame, endFrame - edgeFrames), endFrame);
  const segmentRms = rms(pcm, startFrame, endFrame);
  const longestSilenceMs = longestSilenceMsForRange(
    pcm,
    startFrame,
    endFrame,
    sampleRate,
    thresholds.silenceAmplitude,
  );
  const firstSampleAbs = Math.abs(pcm[startFrame] ?? 0);
  const lastSampleAbs = Math.abs(pcm[Math.max(startFrame, endFrame - 1)] ?? 0);
  const durationDeltaRatio =
    Math.abs(segment.generatedDurationMs - segment.expectedDurationMs) / segment.expectedDurationMs;
  const findings = [];
  if (segmentRms < thresholds.minSegmentRms) {
    findings.push(finding("silent-segment", `${segment.id} is silent or near-silent.`));
  }
  if (firstRms < thresholds.minEdgeRms) {
    findings.push(finding("low-start-energy", `${segment.id} first 200 ms has too little energy.`));
  }
  if (lastRms < thresholds.minEdgeRms) {
    findings.push(finding("low-end-energy", `${segment.id} last 200 ms has too little energy.`));
  }
  if (firstSampleAbs > thresholds.minEdgeRms * 1.5) {
    findings.push(finding("clipped-start", `${segment.id} starts abruptly at non-zero energy.`));
  }
  if (lastSampleAbs > thresholds.minEdgeRms * 1.5) {
    findings.push(finding("clipped-end", `${segment.id} ends abruptly at non-zero energy.`));
  }
  if (longestSilenceMs > thresholds.maxRepeatedSilenceMs) {
    findings.push(
      finding(
        "repeated-silence",
        `${segment.id} has ${formatMs(longestSilenceMs)} of repeated silence.`,
      ),
    );
  }
  if (durationDeltaRatio > thresholds.maxDurationEstimateDeltaRatio) {
    findings.push(
      finding(
        "duration-outlier",
        `${segment.id} duration differs from estimate by ${formatPercent(durationDeltaRatio)}.`,
      ),
    );
  }
  return {
    durationDeltaRatio,
    energy: {
      first200msRms: roundMetric(firstRms),
      firstSampleAbs: roundMetric(firstSampleAbs),
      last200msRms: roundMetric(lastRms),
      lastSampleAbs: roundMetric(lastSampleAbs),
      longestSilenceMs,
      segmentRms: roundMetric(segmentRms),
    },
    expectedDurationMs: segment.expectedDurationMs,
    findings,
    generatedDurationMs: segment.generatedDurationMs,
    id: segment.id,
    punctuationClass: segment.punctuationClass,
    startMs: segment.startMs,
    textPreview: segment.text.slice(0, 120),
  };
}

function analyzeSeams({ pcm, sampleRate, segmentReports, segmentTransitions, thresholds }) {
  const transitionByBoundary = new Map(
    segmentTransitions.map((transition) => [
      `${transition.fromSegmentId}->${transition.toSegmentId}`,
      transition,
    ]),
  );
  const seams = [];
  for (let index = 0; index < segmentReports.length - 1; index += 1) {
    const left = segmentReports[index];
    const right = segmentReports[index + 1];
    const transition = transitionByBoundary.get(`${left.id}->${right.id}`);
    const boundaryMs = left.startMs + left.generatedDurationMs;
    const interSegmentPauseMs = silenceAroundBoundaryMs(
      pcm,
      frameForMs(boundaryMs, sampleRate),
      sampleRate,
      thresholds.silenceAmplitude,
    );
    const punctuationClass = left.punctuationClass;
    const allowedPauseMs =
      Number(transition?.expectedMaxGapMs) ||
      (punctuationClass === "none"
        ? thresholds.maxUnpunctuatedInterSegmentPauseMs
        : thresholds.maxInterSegmentPauseMs);
    const findings = [];
    if (interSegmentPauseMs > allowedPauseMs) {
      findings.push(
        finding(
          "excessive-pause",
          `${left.id}->${right.id} has ${formatMs(interSegmentPauseMs)} pause; allowed ${formatMs(
            allowedPauseMs,
          )}.`,
        ),
      );
    }
    seams.push({
      allowedPauseMs,
      boundaryMs,
      findings,
      fromSegmentId: left.id,
      id: `${left.id}->${right.id}`,
      interSegmentPauseMs,
      punctuationClass,
      toSegmentId: right.id,
    });
  }
  return seams;
}

function summarizeSpeechFluency(segmentReports, seamReports) {
  return {
    clippedEndCount: countFindings(segmentReports, "clipped-end"),
    clippedStartCount: countFindings(segmentReports, "clipped-start"),
    excessivePauseCount: countFindings(seamReports, "excessive-pause"),
    maxDurationEstimateDeltaRatio: roundMetric(
      Math.max(0, ...segmentReports.map((segment) => segment.durationDeltaRatio)),
    ),
    maxInterSegmentPauseMs: Math.max(0, ...seamReports.map((seam) => seam.interSegmentPauseMs)),
    repeatedSilenceCount: countFindings(segmentReports, "repeated-silence"),
    seamCount: seamReports.length,
    segmentCount: segmentReports.length,
    silentSegmentCount: countFindings(segmentReports, "silent-segment"),
  };
}

function speechFluencyChecks(metrics, thresholds) {
  return [
    {
      actual: metrics.clippedStartCount,
      failure: "One or more segments have clipped starts.",
      id: "no-clipped-starts",
      passed: metrics.clippedStartCount === 0,
      target: "0 clipped starts",
    },
    {
      actual: metrics.clippedEndCount,
      failure: "One or more segments have clipped ends.",
      id: "no-clipped-ends",
      passed: metrics.clippedEndCount === 0,
      target: "0 clipped ends",
    },
    {
      actual: metrics.silentSegmentCount,
      failure: "One or more segments are silent.",
      id: "no-silent-segments",
      passed: metrics.silentSegmentCount === 0,
      target: "0 silent segments",
    },
    {
      actual: metrics.repeatedSilenceCount,
      failure: "One or more segments have repeated silence.",
      id: "no-repeated-silence",
      passed: metrics.repeatedSilenceCount === 0,
      target: "0 repeated-silence findings",
    },
    {
      actual: metrics.excessivePauseCount,
      failure: "One or more segment seams have excessive pauses.",
      id: "no-excessive-seam-pauses",
      passed: metrics.excessivePauseCount === 0,
      target: "0 excessive seam pauses",
    },
    {
      actual: formatPercent(metrics.maxDurationEstimateDeltaRatio),
      failure: "One or more segment durations are outliers.",
      id: "duration-estimate-conformance",
      passed: metrics.maxDurationEstimateDeltaRatio <= thresholds.maxDurationEstimateDeltaRatio,
      target: `<= ${formatPercent(thresholds.maxDurationEstimateDeltaRatio)} max delta`,
    },
  ];
}

function buildSyntheticSpeechPCM(segments, sampleRate) {
  const totalDurationMs = segments.reduce(
    (maxEnd, segment) => Math.max(maxEnd, segment.startMs + segment.generatedDurationMs),
    0,
  );
  const totalFrames = frameForMs(totalDurationMs, sampleRate);
  const pcm = new Float64Array(totalFrames);
  for (const [index, segment] of segments.entries()) {
    const startFrame = frameForMs(segment.startMs, sampleRate);
    const endFrame = frameForMs(segment.startMs + segment.generatedDurationMs, sampleRate);
    const fadeFrames = Math.max(1, frameForMs(24, sampleRate));
    const frequency = 180 + (index % 5) * 35;
    for (let frame = startFrame; frame < endFrame && frame < pcm.length; frame += 1) {
      const localFrame = frame - startFrame;
      const remaining = endFrame - frame - 1;
      const fade = Math.min(1, localFrame / fadeFrames, remaining / fadeFrames);
      const envelope = Math.max(0, fade);
      const phase = (2 * Math.PI * frequency * localFrame) / sampleRate;
      pcm[frame] = Math.sin(phase) * 0.22 * envelope;
    }
  }
  return pcm;
}

function buildPCM16WAV(pcm, sampleRate) {
  const dataSize = pcm.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < pcm.length; index += 1) {
    const value = Math.max(-1, Math.min(1, pcm[index] ?? 0));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
  }
  return buffer;
}

function frameForMs(ms, sampleRate) {
  return Math.max(0, Math.round((Number(ms) / 1000) * sampleRate));
}

function rms(pcm, startFrame, endFrame) {
  const start = Math.max(0, Math.min(pcm.length, startFrame));
  const end = Math.max(start, Math.min(pcm.length, endFrame));
  if (end <= start) {
    return 0;
  }
  let sumSquares = 0;
  for (let frame = start; frame < end; frame += 1) {
    sumSquares += (pcm[frame] ?? 0) ** 2;
  }
  return Math.sqrt(sumSquares / (end - start));
}

function longestSilenceMsForRange(pcm, startFrame, endFrame, sampleRate, threshold) {
  let longest = 0;
  let current = 0;
  for (let frame = Math.max(0, startFrame); frame < Math.min(pcm.length, endFrame); frame += 1) {
    if (Math.abs(pcm[frame] ?? 0) <= threshold) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return Math.round((longest / sampleRate) * 1000);
}

function silenceAroundBoundaryMs(pcm, boundaryFrame, sampleRate, threshold) {
  let before = 0;
  for (let frame = Math.min(pcm.length - 1, boundaryFrame - 1); frame >= 0; frame -= 1) {
    if (Math.abs(pcm[frame] ?? 0) > threshold) {
      break;
    }
    before += 1;
  }
  let after = 0;
  for (let frame = Math.max(0, boundaryFrame); frame < pcm.length; frame += 1) {
    if (Math.abs(pcm[frame] ?? 0) > threshold) {
      break;
    }
    after += 1;
  }
  return Math.round(((before + after) / sampleRate) * 1000);
}

function punctuationClassForText(text) {
  const trimmed = String(text ?? "").trim();
  if (/[.!?]["')\]]*$/.test(trimmed)) {
    return "sentence";
  }
  if (/[,;:]["')\]]*$/.test(trimmed)) {
    return "phrase";
  }
  return "none";
}

function countFindings(reports, code) {
  return reports.reduce(
    (total, report) => total + report.findings.filter((finding) => finding.code === code).length,
    0,
  );
}

function finding(code, message) {
  return { code, message, severity: "blocking" };
}

function findingsLabel(findings) {
  return findings.length === 0
    ? "OK"
    : findings.map((finding) => escapeMarkdown(finding.code)).join(", ");
}

function roundMetric(value) {
  return Math.round(Number(value ?? 0) * 1000) / 1000;
}

function formatNumber(value) {
  return Number(value ?? 0).toFixed(3);
}

function formatMs(value) {
  return `${Math.round(Number(value ?? 0)).toLocaleString()} ms`;
}

function formatPercent(value) {
  return `${Math.round(Number(value ?? 0) * 1000) / 10}%`;
}

function escapeMarkdown(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}
