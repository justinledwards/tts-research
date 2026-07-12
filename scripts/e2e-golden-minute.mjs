#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createQaProject,
  loadPlaywright,
  prepareOutputDir,
  startLocalServices,
  writeJson,
} from "./e2e-browser-qa-helpers.mjs";
import {
  captureSyncEvidence,
  readPositiveNumber,
  runGoldenMinuteFlow,
} from "./e2e-golden-minute-helpers.mjs";
import {
  evaluateGoldenMinuteArtifactCompatibility,
  evaluateGoldenMinuteBoundaryStress,
  evaluateGoldenMinuteFluency,
  evaluateGoldenMinuteSpeechFluency,
  evaluateGoldenMinuteSync,
  loadGoldenMinuteFixture,
  renderGoldenMinuteArtifactCompatibilityReport,
  renderGoldenMinuteBoundaryReport,
  renderGoldenMinuteReport,
  renderSpeechFluencyReport,
  validateGoldenMinuteFixture,
} from "./golden-minute-fixture.mjs";
import {
  buildGoldenMinuteVisualTimeline,
  renderGoldenMinuteVisualTimeline,
} from "./golden-minute-visual-timeline.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliArgs = new Set(process.argv.slice(2));
const outputDir =
  process.env.E2E_GOLDEN_MINUTE_OUTPUT_DIR ??
  path.join(rootDir, "output", "golden-minute", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const visualTimelineScreenshotsDir = path.join(outputDir, "visual-timeline", "screenshots");
const videosDir = path.join(outputDir, "videos");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const traceCaptureEnabled =
  cliArgs.has("--trace") || cliArgs.has("--trace=1") || process.env.E2E_GOLDEN_MINUTE_TRACE === "1";
const visualSampleIntervalSec = readPositiveNumber(
  process.env.E2E_GOLDEN_MINUTE_VISUAL_SAMPLE_SECONDS,
  2,
);
const visualSampleCount = Math.max(
  1,
  Math.round(readPositiveNumber(process.env.E2E_GOLDEN_MINUTE_VISUAL_SAMPLE_COUNT, 3)),
);

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "golden-minute-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "golden-minute-e2e.v1",
    status: "failed",
  }).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  await prepareOutputDir(outputDir, screenshotsDir);
  if (traceCaptureEnabled) {
    await mkdir(visualTimelineScreenshotsDir, { recursive: true });
    await mkdir(videosDir, { recursive: true });
  }
  const fixture = await loadGoldenMinuteFixture(rootDir);
  const fixtureValidation = validateGoldenMinuteFixture(fixture);
  const sync = evaluateGoldenMinuteSync(fixture);
  const services = useExistingServers
    ? null
    : await startLocalServices({ artifactDir: outputDir, rootDir });
  if (services) {
    apiBaseUrl = services.apiBaseUrl;
    appBaseUrl = services.appBaseUrl;
  }

  try {
    const project = await createQaProject(
      apiBaseUrl,
      `Golden Minute QA ${new Date().toISOString()}`,
    );
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const screenshots = [];
    let browserResult;
    try {
      await captureSyncEvidence(browser, fixture, sync, screenshots, { screenshotsDir });
      browserResult = await runGoldenMinuteFlow(browser, fixture, project.id, screenshots, {
        apiBaseUrl,
        appBaseUrl,
        outputDir,
        rootDir,
        screenshotsDir,
        sampleCount: visualSampleCount,
        sampleIntervalMs: Math.round(visualSampleIntervalSec * 1000),
        traceCaptureEnabled,
        videosDir,
        visualTimelineScreenshotsDir,
      });
    } finally {
      await browser.close();
    }
    const fluency = evaluateGoldenMinuteFluency(fixture, browserResult);
    const speechFluency = evaluateGoldenMinuteSpeechFluency(fixture, {
      audioBuffer: browserResult.audioState.audioBuffer,
      job: browserResult.audioState.job,
    });
    const generatedAt = new Date().toISOString();
    const boundaryStress = evaluateGoldenMinuteBoundaryStress(fixture, { generatedAt });
    const boundaryStressPath = path.join(outputDir, "segment-boundary-report.md");
    const artifactCompatibility = evaluateGoldenMinuteArtifactCompatibility(fixture, {
      artifactIdentity: browserResult.artifactIdentity,
      generatedAt,
    });
    const artifactCompatibilityPath = path.join(outputDir, "artifact-compatibility-report.md");
    const failures = [
      ...fixtureValidation.failures,
      ...(sync.status === "passed" ? [] : ["Golden minute sync baseline failed."]),
      ...browserResult.failures,
      ...(fluency.status === "passed" ? [] : ["Golden minute fluency rubric failed."]),
      ...(speechFluency.status === "passed" ? [] : ["Golden minute speech fluency report failed."]),
      ...(boundaryStress.status === "passed"
        ? []
        : ["Golden minute segment boundary stress failed."]),
      ...(artifactCompatibility.status === "passed"
        ? []
        : ["Golden minute artifact compatibility failed."]),
    ];
    delete browserResult.audioState.audioBuffer;
    delete browserResult.audioState.job;
    const visualTimeline = buildGoldenMinuteVisualTimeline({
      checkpoints: browserResult.segmentTransitionState.activeSamples,
      generatedAt,
      modeledSegmentTransitions: fixture.timing.segmentTransitions ?? [],
      sampleIntervalSec: traceCaptureEnabled ? visualSampleIntervalSec : null,
      sync,
      traceArtifacts: browserResult.traceArtifacts,
    });
    const document = {
      appBaseUrl,
      browser: browserResult,
      fixture: {
        coverage: fixtureValidation.coverage,
        failures: fixtureValidation.failures,
        samplePath: path.relative(rootDir, fixture.paths.sample),
        speechPlanPath: path.relative(rootDir, fixture.paths.expectedSpeechPlan),
        status: fixtureValidation.status,
        timingPath: path.relative(rootDir, fixture.paths.expectedTiming),
      },
      boundaryStress: {
        ...boundaryStress,
        path: path.relative(rootDir, boundaryStressPath),
      },
      artifactCompatibility: {
        ...artifactCompatibility,
        path: path.relative(rootDir, artifactCompatibilityPath),
      },
      fluency,
      generatedAt,
      schemaVersion: "golden-minute-e2e.v1",
      screenshots: screenshots.map((screenshot) => path.relative(rootDir, screenshot)),
      speechFluency,
      status: failures.length === 0 ? "passed" : "failed",
      summary: {
        browserFailures: browserResult.failures.length,
        driftMedianMs: sync.metrics.medianWordDriftMs,
        driftP95Ms: sync.metrics.p95WordDriftMs,
        durationMs: fixtureValidation.coverage.durationMs,
        boundaryStressStatus: boundaryStress.status,
        boundaryCount: boundaryStress.summary.boundaryCount,
        artifactCompatibilityStatus: artifactCompatibility.status,
        artifactCompatibilityBlockedWordHighlightCases:
          artifactCompatibility.summary.blockedWordHighlightCases,
        speechFluencyStatus: speechFluency.status,
        readySegments: browserResult.audioState.readySegments,
        screenshots: screenshots.length,
        segmentTransitions: browserResult.segmentTransitionState.uniqueActiveSegments,
        visualTimelineCheckpoints: visualTimeline.summary.checkpointCount,
      },
      sync,
      visualTimeline: {
        audioTimelinePath: path.relative(
          rootDir,
          path.join(outputDir, "audio-current-time-timeline.json"),
        ),
        driftTimelinePath: path.relative(rootDir, path.join(outputDir, "drift-timeline.json")),
        highlightVisiblePercentage: visualTimeline.summary.highlightVisiblePercentage,
        path: path.relative(rootDir, path.join(outputDir, "visual-timeline.md")),
        status:
          visualTimeline.summary.coveredEvents.seek &&
          visualTimeline.summary.coveredEvents.resume &&
          visualTimeline.summary.coveredEvents["speed-change"] &&
          visualTimeline.summary.segmentHandoffCount > 0
            ? "passed"
            : "needs-review",
        visualTimelinePath: path.relative(
          rootDir,
          path.join(outputDir, "visual-highlight-timeline.json"),
        ),
      },
    };
    await writeJson(path.join(outputDir, "golden-minute-results.json"), document);
    await writeJson(path.join(outputDir, "golden-minute-sync.json"), sync);
    await writeJson(path.join(outputDir, "drift-timeline.json"), visualTimeline.driftTimeline);
    await writeJson(
      path.join(outputDir, "audio-current-time-timeline.json"),
      visualTimeline.audioCurrentTimeTimeline,
    );
    await writeJson(
      path.join(outputDir, "visual-highlight-timeline.json"),
      visualTimeline.visualHighlightTimeline,
    );
    await writeJson(path.join(outputDir, "visual-timeline.json"), visualTimeline);
    await writeJson(path.join(outputDir, "speech-fluency-report.json"), speechFluency);
    await writeJson(path.join(outputDir, "segment-boundary-report.json"), boundaryStress);
    await writeJson(
      path.join(outputDir, "artifact-compatibility-report.json"),
      artifactCompatibility,
    );
    await writeFile(boundaryStressPath, renderGoldenMinuteBoundaryReport(boundaryStress));
    await writeFile(
      artifactCompatibilityPath,
      renderGoldenMinuteArtifactCompatibilityReport(artifactCompatibility),
    );
    await writeFile(
      path.join(outputDir, "visual-timeline.md"),
      renderGoldenMinuteVisualTimeline(visualTimeline),
    );
    await writeFile(
      path.join(outputDir, "speech-fluency-report.md"),
      renderSpeechFluencyReport(speechFluency),
    );
    await writeFile(
      path.join(outputDir, "golden-minute-report.md"),
      renderGoldenMinuteReport(document),
    );
    console.log(`Golden minute E2E ${document.status}. Reports written to ${outputDir}`);
    process.exitCode = document.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}
