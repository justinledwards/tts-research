#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  buildCommandMoreCrossAudit,
  renderCommandMoreCrossAuditMarkdown,
} from "./command-more-cross-audit.mjs";
import {
  complexityActionsFor,
  isPrimaryComplexityAction,
  isReachableDrawerSheetAction,
} from "./e2e-surface-complexity-budget-helpers.mjs";
import {
  CINEMA_MORE_ACTION_BUDGETS,
  CINEMA_MORE_PRIMARY_LABELS,
  CINEMA_MORE_REQUIRED_SECTIONS,
  parseProviderProfileArg,
  providerProfileEngines,
  providerProfileSummary,
  resolveProviderProfile,
  UI_ACTION_AUDIT_SEVERITIES,
  UI_ACTION_AUDIT_THRESHOLDS,
} from "./e2e-ui-action-audit-config.mjs";
import {
  buildActionInventory,
  exerciseAction,
  summarizeDuplicates,
} from "./e2e-ui-action-matrix.mjs";
import { renderDeadControlsReport, renderDuplicatesReport } from "./e2e-ui-dead-controls.mjs";
import {
  collectOverlayCollisionReport,
  renderOverlayCollisionReport,
  summarizeOverlayCollisionReports,
} from "./overlay-collision-audit.mjs";
import {
  classifyDuplicateGroups,
  summarizeDuplicateClassifications,
} from "./ui-action-duplicate-waivers.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.UI_ACTION_AUDIT_OUTPUT_DIR ??
  path.join(rootDir, "output", "ui-action-audit", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const summaryPath =
  process.env.UI_ACTION_AUDIT_SUMMARY_PATH ?? path.join(outputDir, "summary.json");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const jobTimeoutMs = Number.parseInt(process.env.E2E_JOB_TIMEOUT_MS ?? "180000", 10);
const activeProjectKey = "tts-active-project-id";
const quickMode = process.env.UI_ACTION_AUDIT_QUICK === "1";
const maxActions = Number.parseInt(process.env.UI_ACTION_AUDIT_MAX_ACTIONS ?? "0", 10);
const workerLimit = Number.parseInt(process.env.UI_ACTION_AUDIT_WORKER_LIMIT ?? "0", 10);
const resolvedWorkerLimit =
  Number.isFinite(workerLimit) && workerLimit > 0 ? workerLimit : quickMode ? 2 : 3;
const actionTimeoutMs = Number.parseInt(
  process.env.UI_ACTION_AUDIT_ACTION_TIMEOUT_MS ?? "8000",
  10,
);
const failOnFindings = process.env.UI_ACTION_AUDIT_FAIL_ON_FINDINGS === "1";
const inventoryOnly = process.env.UI_ACTION_AUDIT_INVENTORY_ONLY === "1";
const scenarioFilter = parseScenarioFilter(process.env.UI_ACTION_AUDIT_SCENARIOS);
let providerProfile = null;

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";
let runSummary = null;

async function main() {
  providerProfile = resolveProviderProfile(parseProviderProfileArg(process.argv.slice(2)));
  const startAt = Date.now();
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  runSummary = {
    appBaseUrl,
    apiBaseUrl,
    generatedAt: new Date(startAt).toISOString(),
    completedAt: null,
    durationMs: null,
    profile: {
      actionTimeoutMs,
      inventoryOnly,
      jobTimeoutMs,
      maxActions,
      providerProfile: providerProfile ? providerProfile.id : "runtime",
      quickMode,
      scenarioCount: null,
      workerLimit: resolvedWorkerLimit,
    },
    outputDir,
    scenarioFilter: scenarioFilter ? [...scenarioFilter] : [],
    schemaVersion: "ui-action-audit-summary.v1",
    startedAt: new Date(startAt).toISOString(),
    status: "running",
    summaryPath,
  };
  const fixtures = await ensureFixtures();
  const services = useExistingServers
    ? null
    : await measurePhase(runSummary, "serviceStartup", () => startLocalServices());
  if (services) {
    apiBaseUrl = services.apiBaseUrl;
    appBaseUrl = services.appBaseUrl;
  }
  const serviceRuntime = services
    ? (() => {
        const { stop: _stop, ...rest } = services;
        return rest;
      })()
    : null;
  runSummary = {
    ...runSummary,
    appBaseUrl,
    apiBaseUrl,
    services: services
      ? {
          mode: "managed",
          ...serviceRuntime,
        }
      : {
          apiBaseUrl,
          appBaseUrl,
          mode: "existing",
        },
  };

  try {
    await assertServerReady();
    const { chromium } = await loadPlaywright();

    const seed = await measurePhase(runSummary, "seed", () => seedAuditData(fixtures));
    const scenarios = await measurePhase(runSummary, "scenarioGeneration", () =>
      filterScenarios(createScenarios(seed), scenarioFilter),
    );
    runSummary.profile.scenarioCount = scenarios.length;
    runSummary.scenarioTimings = [];

    const actions = [];
    const results = [];
    const screenshots = [];
    const surfaceComplexity = [];

    if (!inventoryOnly && shouldRunTraversal(scenarioFilter)) {
      const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
      try {
        const traversal = await measurePhase(runSummary, "workspaceTraversal", async () => {
          return runWorkspaceStageTraversal(browser, seed);
        });
        results.push(traversal.result);
        screenshots.push(...traversal.screenshots);
      } finally {
        await browser.close();
      }
    }

    const scenarioPlan = scenarios.map((scenario, index) => ({ index, scenario }));
    const scenarioResults = await measurePhase(runSummary, "actionReplay", () =>
      runScenarioBatches({
        chromium,
        maxActions,
        runSummary,
        scenarioPlan,
        workerLimit: resolvedWorkerLimit,
        inventoryOnly,
      }),
    );
    for (const scenarioResult of scenarioResults) {
      if (!scenarioResult) {
        continue;
      }
      const {
        actions: scenarioActions,
        screenshots: scenarioScreenshots,
        results: scenarioReplayResults,
      } = scenarioResult;
      actions.push(...scenarioActions);
      results.push(...scenarioReplayResults);
      screenshots.push(...scenarioScreenshots);
      if (scenarioResult.surfaceComplexity) {
        surfaceComplexity.push(scenarioResult.surfaceComplexity);
      }
    }

    const generatedAt = new Date().toISOString();
    const duplicates = summarizeDuplicates(actions);
    const duplicateClassification = summarizeDuplicateClassifications(duplicates);
    const overlayCollisionReports = surfaceComplexity
      .map((complexity) => complexity.overlayCollision)
      .filter(Boolean);
    const overlayCollisionSummary = summarizeOverlayCollisionReports(overlayCollisionReports);
    const websiteExtractionQualityDocument = websiteExtractionQualityDocumentFromSeed(
      seed,
      generatedAt,
    );
    const inventoryDocument = {
      actions,
      appBaseUrl,
      apiBaseUrl,
      commandMoreCrossAudit: null,
      duplicates,
      duplicateClassification,
      duplicateWaiverRegistry: duplicateClassification.duplicateWaiverRegistry,
      generatedAt,
      schemaVersion: "ui-action-inventory.v1",
      providerProfile: providerProfile ? providerProfileSummary(providerProfile) : null,
      scenarios: scenarios.map((scenario) => ({
        description: scenario.description,
        id: scenario.id,
        label: scenario.label,
        surface: scenario.surface,
      })),
      screenshots,
      surfaceComplexity,
      summary: summarizeInventory(actions),
    };
    inventoryDocument.commandMoreCrossAudit = buildCommandMoreCrossAudit({
      actionInventory: inventoryDocument,
      generatedAt,
    });
    const resultsDocument = {
      generatedAt,
      results,
      schemaVersion: "ui-action-results.v1",
      status: inventoryOnly
        ? "inventory-only"
        : summarizeResults(results).failed === 0
          ? "passed"
          : "completed-with-findings",
      summary: summarizeResults(results),
    };
    const overlayCollisionDocument = {
      generatedAt,
      reports: overlayCollisionReports,
      schemaVersion: "overlay-collisions.v1",
      summary: overlayCollisionSummary,
    };
    const gateFindings = summarizeGateFindings({
      actions,
      duplicates,
      providerProfile,
      requireAllSurfaces: !scenarioFilter,
      results,
      scenarios,
      surfaceComplexity,
    });
    const reviewGate = summarizeUiActionReviewGate({
      actions,
      duplicates,
      duplicateClassification,
      gateFindings,
      inventoryOnly,
      providerProfile,
      resultsStatus: resultsDocument.status,
    });
    const hardDuplicateFailure = duplicateClassification.unclassified > 0;
    const hardProviderProfileFailure = gateFindings.providerProfileCoverageFindings.length > 0;
    const status =
      hardDuplicateFailure || hardProviderProfileFailure
        ? "failed"
        : !inventoryOnly && gateFindings.total > 0 && failOnFindings
          ? "failed"
          : reviewGate.status === "not-review-complete" && resultsDocument.status === "passed"
            ? "completed-with-findings"
            : resultsDocument.status;
    resultsDocument.reviewGate = reviewGate;
    resultsDocument.status =
      status === "failed" && (hardDuplicateFailure || hardProviderProfileFailure)
        ? "failed"
        : status;

    await writeFile(
      path.join(outputDir, "action-inventory.json"),
      `${JSON.stringify(inventoryDocument, null, 2)}\n`,
    );
    await writeFile(
      path.join(outputDir, "action-results.json"),
      `${JSON.stringify(resultsDocument, null, 2)}\n`,
    );
    await writeFile(
      path.join(outputDir, "dead-controls.md"),
      renderDeadControlsReport({ actions, generatedAt, results }),
    );
    await writeFile(
      path.join(outputDir, "duplicates.md"),
      renderDuplicatesReport({ duplicates, generatedAt }),
    );
    await writeFile(
      path.join(outputDir, "website-extraction-quality.json"),
      `${JSON.stringify(websiteExtractionQualityDocument, null, 2)}\n`,
    );
    await writeFile(
      path.join(outputDir, "command-more-matrix.json"),
      `${JSON.stringify(inventoryDocument.commandMoreCrossAudit, null, 2)}\n`,
    );
    await writeFile(
      path.join(outputDir, "command-more-matrix.md"),
      renderCommandMoreCrossAuditMarkdown(inventoryDocument.commandMoreCrossAudit),
    );
    await writeFile(
      path.join(outputDir, "overlay-collisions.json"),
      `${JSON.stringify(overlayCollisionDocument, null, 2)}\n`,
    );
    await writeFile(
      path.join(outputDir, "overlay-collisions.md"),
      renderOverlayCollisionReport({ generatedAt, reports: overlayCollisionReports }),
    );
    await writeFile(
      path.join(outputDir, "reviewer-summary.md"),
      renderReviewerSummary({
        actions,
        duplicates,
        generatedAt,
        inventoryOnly,
        outputDir,
        providerProfile,
        reviewGate,
        results,
        scenarioFilterActive: Boolean(scenarioFilter),
        scenarios,
        screenshots,
        surfaceComplexity,
        websiteExtractionQuality: websiteExtractionQualityDocument.quality,
      }),
    );
    runSummary = {
      ...runSummary,
      appBaseUrl,
      apiBaseUrl,
      completedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - startAt),
      failed: summarizeResults(results).failed,
      phaseTimings: {
        ...(runSummary.phaseTimings ?? {}),
        totalMs: Math.max(0, Date.now() - startAt),
      },
      resultSummary: summarizeResults(results),
      scenarioSummary: summarizeInventory(actions),
      status,
      summaries: {
        gateFindings,
        duplicateClassification,
        providerProfile: providerProfile ? providerProfileSummary(providerProfile) : null,
        inventory: {
          actionCount: actions.length,
          scenarioCount: scenarios.length,
          screenshotCount: screenshots.length,
        },
        results: {
          scenarioResults: scenarioResults.length,
          total: summarizeResults(results).total,
        },
        overlayCollisions: overlayCollisionSummary,
        reviewGate,
      },
      reviewGate,
      providerProfile: providerProfile ? providerProfileSummary(providerProfile) : null,
      websiteExtractionQuality: websiteExtractionQualityDocument.quality,
    };
    await writeSummary(runSummary);

    console.log(`UI action audit ${runSummary.status}. Reports written to ${outputDir}`);
    if (
      hardDuplicateFailure ||
      hardProviderProfileFailure ||
      (failOnFindings && gateFindings.total > 0)
    ) {
      process.exitCode = 1;
    }
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

function clampWorkerCount(value) {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(Math.min(value, 10));
}

async function measurePhase(summary, name, fn) {
  const startedAt = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Math.max(0, Date.now() - startedAt);
    summary.phaseTimings = {
      ...(summary.phaseTimings ?? {}),
      [name]: durationMs,
    };
  }
}

async function runScenarioBatches({
  chromium,
  inventoryOnly: inventoryMode,
  maxActions: actionLimit,
  runSummary: scenarioRunSummary,
  scenarioPlan,
  workerLimit: rawWorkerLimit,
}) {
  if (scenarioPlan.length === 0) {
    return [];
  }
  const workersToStart = clampWorkerCount(Math.min(rawWorkerLimit, scenarioPlan.length));
  const results = Array(scenarioPlan.length);
  let nextIndex = 0;
  const runWorker = async () => {
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    try {
      while (nextIndex < scenarioPlan.length) {
        const planIndex = nextIndex++;
        const plan = scenarioPlan[planIndex];
        if (!plan) {
          continue;
        }
        const scenarioStartedAt = Date.now();
        const scenarioResult = await runScenarioTaskSafely(browser, plan.scenario, {
          inventoryOnly: inventoryMode,
          maxActions: actionLimit,
        });
        const durationMs = Math.max(0, Date.now() - scenarioStartedAt);
        scenarioRunSummary.scenarioTimings[plan.index] = {
          actionCount: scenarioResult.actions.length,
          durationMs,
          scenarioExecutionMs: durationMs,
          index: plan.index,
          replayResults: scenarioResult.results.length,
          scenarioId: plan.scenario.id,
          status: scenarioResult.status ?? "completed",
        };
        results[plan.index] = {
          ...scenarioResult,
          durationMs,
        };
      }
    } finally {
      await browser.close();
    }
  };
  await Promise.all(Array.from({ length: workersToStart }, runWorker));
  return results;
}

async function runScenarioTaskSafely(browser, scenario, options) {
  try {
    return await runScenarioTask(browser, scenario, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const screenshot = path.join(screenshotsDir, `${scenario.id}-inventory-failure.png`);
    return {
      actions: [],
      results: [
        {
          actionId: `scenario:${scenario.id}`,
          activationMode: "inventory",
          error: message,
          label: scenario.label,
          outcome: "scenario inventory failed",
          passed: false,
          reason: message,
          scenarioId: scenario.id,
          screenshot,
          status: "failed",
          surface: scenario.surface,
        },
      ],
      screenshots: [screenshot],
      scenarioId: scenario.id,
      status: "failed",
      surfaceComplexity: null,
    };
  }
}

async function runScenarioTask(browser, scenario, options) {
  console.log(`[ui-actions] inventory ${scenario.id}`);
  const scenarioInventory = await inventoryScenario(browser, scenario);
  const screenshots = [scenarioInventory.screenshot];
  if (options.inventoryOnly) {
    return {
      actions: scenarioInventory.actions,
      results: [],
      screenshots,
      scenarioId: scenario.id,
      surfaceComplexity: scenarioInventory.surfaceComplexity,
    };
  }
  const runnableActions =
    options.maxActions > 0
      ? scenarioInventory.actions.slice(0, options.maxActions)
      : scenarioInventory.actions;
  const actionResults = [];
  for (const [index, action] of runnableActions.entries()) {
    const activationModes =
      action.disabled || action.destructive ? ["keyboard"] : ["pointer", "keyboard"];
    for (const activationMode of activationModes) {
      console.log(
        `[ui-actions] replay ${scenario.id} ${String(index + 1)}/${String(
          runnableActions.length,
        )} ${activationMode}: ${action.label}`,
      );
      actionResults.push(await exerciseScenarioAction(browser, scenario, action, activationMode));
    }
  }
  return {
    actions: scenarioInventory.actions,
    results: actionResults,
    screenshots,
    scenarioId: scenario.id,
    surfaceComplexity: scenarioInventory.surfaceComplexity,
  };
}

async function writeSummary(summary) {
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        ...summary,
        phaseTimings: {
          ...(summary.phaseTimings ?? {}),
          totalMs: Math.max(0, Date.now() - Date.parse(summary.startedAt)),
        },
      },
      null,
      2,
    )}\n`,
  );
}

function parseScenarioFilter(value) {
  const ids = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

function filterScenarios(scenarios, filter) {
  if (!filter) {
    return scenarios;
  }
  const filtered = scenarios.filter((scenario) => filter.has(scenario.id));
  if (filtered.length === 0 && !filter.has("workspace-stage-traversal")) {
    throw new Error(`No UI action audit scenarios matched: ${[...filter].join(", ")}`);
  }
  return filtered;
}

function shouldRunTraversal(filter) {
  return !filter || filter.has("workspace-stage-traversal");
}

async function installProviderProfileRoutes(page, { nonPersistedMutations = true } = {}) {
  if (nonPersistedMutations) {
    await installNonPersistedVoiceJobMutationRoutes(page);
  }
  if (!providerProfile) {
    return;
  }
  const engines = providerProfileEngines(providerProfile);
  await page.route("**/api/tts-engines", async (route) => {
    await route.fulfill({
      body: `${JSON.stringify(engines)}\n`,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
      },
      status: 200,
    });
  });
}

async function installBrowserVoiceJobReadRoutes(page) {
  await page.route("**/api/voice-jobs/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      (url.pathname.endsWith("/audio") || url.pathname.endsWith("/audio/partial"))
    ) {
      await route.fulfill({
        body: syntheticAuditWav(),
        contentType: "audio/wav",
        status: 200,
      });
      return;
    }
    if (request.method() !== "GET" || url.pathname.endsWith("/events")) {
      await route.fallback();
      return;
    }
    if (url.pathname.endsWith("/highlight-map")) {
      await route.fulfill({
        body: JSON.stringify(auditHighlightMap(url.pathname)),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (url.pathname.endsWith("/highlight-map-v2")) {
      await route.fulfill({
        body: JSON.stringify(auditHighlightMapV2(url.pathname)),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    const response = await safeRouteFetch(route);
    if (!response) {
      return;
    }
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("application/json")) {
      await route.fulfill({ response });
      return;
    }
    const payload = await response.json();
    await route.fulfill({
      body: JSON.stringify(patchBrowserVoiceJobs(payload)),
      contentType: "application/json",
      status: response.status(),
    });
  });
}

async function installNonPersistedVoiceJobMutationRoutes(page) {
  await page.route("**/api/voice-jobs", async (route) => {
    if (route.request().method() !== "POST") {
      const response = await safeRouteFetch(route);
      if (!response) {
        return;
      }
      const contentType = response.headers()["content-type"] ?? "";
      if (!contentType.includes("application/json")) {
        await route.fulfill({ response });
        return;
      }
      const payload = await response.json();
      await route.fulfill({
        body: JSON.stringify(patchBrowserVoiceJobs(payload)),
        contentType: "application/json",
        status: response.status(),
      });
      return;
    }
    await route.fulfill({
      body: JSON.stringify(auditVoiceJobFromRequest(route.request().postData(), {})),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/source-preps/*/voice-jobs", async (route) => {
    if (route.request().method() !== "POST") {
      const response = await safeRouteFetch(route);
      if (!response) {
        return;
      }
      const payload = await response.json();
      await route.fulfill({
        body: JSON.stringify(patchBrowserVoiceJobs(payload)),
        contentType: "application/json",
        status: response.status(),
      });
      return;
    }
    const preparedSourceId = sourcePrepIdFromPath(route.request().url());
    await route.fulfill({
      body: JSON.stringify(
        auditVoiceJobFromRequest(route.request().postData(), { preparedSourceId }),
      ),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/book-sources/*/voice-jobs", async (route) => {
    if (route.request().method() !== "POST") {
      const response = await safeRouteFetch(route);
      if (!response) {
        return;
      }
      const payload = await response.json();
      await route.fulfill({
        body: JSON.stringify(patchBrowserVoiceJobs(payload)),
        contentType: "application/json",
        status: response.status(),
      });
      return;
    }
    const bookSourceId = bookSourceIdFromPath(route.request().url());
    await route.fulfill({
      body: JSON.stringify(auditVoiceJobFromRequest(route.request().postData(), { bookSourceId })),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/voice-jobs/ui-action-audit-created-job/events", async (route) => {
    const job = auditVoiceJobFromRequest(null, {});
    await route.fulfill({
      body: `data: ${JSON.stringify(job)}\n\n`,
      contentType: "text/event-stream",
      status: 200,
    });
  });
  await page.route("**/api/voice-jobs/ui-action-audit-created-job", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify(patchBrowserVoiceJob(auditVoiceJobFromRequest(null, {}))),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/voice-jobs/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.endsWith("/cancel")) {
      await route.fulfill({
        body: JSON.stringify({
          ...patchBrowserVoiceJob(auditVoiceJobFromRequest(null, {})),
          id: decodeURIComponent(url.pathname.split("/")[3] ?? "ui-action-audit-created-job"),
          progress: {
            activeStage: "cancelled",
            currentSegment: 0,
            detail: "UI action audit cancelled the non-persisted generation request.",
            message: "Generation cancelled",
            totalSegments: 1,
          },
          status: "cancelled",
          terminalReason: "cancelled",
        }),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      (url.pathname.endsWith("/audio") || url.pathname.endsWith("/audio/partial"))
    ) {
      await route.fulfill({
        body: syntheticAuditWav(),
        contentType: "audio/wav",
        status: 200,
      });
      return;
    }
    if (request.method() !== "GET" || url.pathname.endsWith("/events")) {
      await route.fallback();
      return;
    }
    if (url.pathname === "/api/voice-jobs/ui-action-audit-created-job") {
      await route.fulfill({
        body: JSON.stringify(patchBrowserVoiceJob(auditVoiceJobFromRequest(null, {}))),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (url.pathname.endsWith("/highlight-map")) {
      await route.fulfill({
        body: JSON.stringify(auditHighlightMap(url.pathname)),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (url.pathname.endsWith("/highlight-map-v2")) {
      await route.fulfill({
        body: JSON.stringify(auditHighlightMapV2(url.pathname)),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    const response = await safeRouteFetch(route);
    if (!response) {
      return;
    }
    const contentType = response.headers()["content-type"] ?? "";
    if (!contentType.includes("application/json")) {
      await route.fulfill({ response });
      return;
    }
    const payload = await response.json();
    await route.fulfill({
      body: JSON.stringify(patchBrowserVoiceJobs(payload)),
      contentType: "application/json",
      status: response.status(),
    });
  });
}

async function safeRouteFetch(route) {
  try {
    return await route.fetch();
  } catch (error) {
    if (isClosedRouteError(error)) {
      return null;
    }
    throw error;
  }
}

function isClosedRouteError(error) {
  return /Target page, context or browser has been closed/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

function patchBrowserVoiceJobs(payload) {
  return Array.isArray(payload) ? payload.map(patchBrowserVoiceJob) : patchBrowserVoiceJob(payload);
}

function patchBrowserVoiceJob(job) {
  if (!job || typeof job !== "object") {
    return job;
  }
  const hasAudio =
    job.status === "completed" ||
    Number(job.audioReadySegments ?? 0) > 0 ||
    Boolean(job.audioUrl || job.audioPartialUrl);
  if (!hasAudio) {
    return job;
  }
  return {
    ...job,
    audioPartialUrl: job.audioPartialUrl ? auditWavDataUrl() : job.audioPartialUrl,
    audioUrl: auditWavDataUrl(),
    contentType: "audio/wav",
  };
}

function auditHighlightMap(pathname) {
  const jobId = decodeURIComponent(pathname.split("/")[3] ?? "ui-action-audit-job");
  return {
    fragments: [],
    generatedAt: "2026-06-13T10:00:00.000Z",
    jobId,
    schemaVersion: "highlight-map.v1",
    status: "partial",
    summary: {
      fallbackMode: "phrase",
      fragmentCount: 0,
      primaryLevel: "phrase",
      tokenCount: 0,
    },
    tokens: [],
  };
}

function auditHighlightMapV2(pathname) {
  const jobId = decodeURIComponent(pathname.split("/")[3] ?? "ui-action-audit-job");
  return {
    entries: [],
    generatedAt: "2026-06-13T10:00:00.000Z",
    generatedAudioId: jobId,
    jobId,
    schemaVersion: "highlight-map.v2",
    speechPlanId: jobId,
    summary: {
      coveragePct: 0,
      fallbackMode: "phrase",
      primaryLevel: "phrase",
      timingSources: ["generated"],
      wordCount: 0,
    },
    timingLevels: ["phrase"],
  };
}

async function installTemporarySourceFixtureRoutes(page) {
  const fixtures = temporarySourceFixtures();
  const sourceById = new Map(fixtures.sources.map((source) => [source.id, source]));
  const envelopeFor = (source) => ({
    projectId: "",
    scope: "temporary",
    source,
    sourceOwner: "temporary",
    temporarySourceId: source.temporarySourceId,
  });
  await page.route("**/api/temporary-sources", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        body: JSON.stringify(fixtures.sources.map(envelopeFor)),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/temporary-sources/jobs", async (route) => {
    await route.fulfill({
      body: JSON.stringify(fixtures.jobs),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/temporary-sources/storage/summary", async (route) => {
    await route.fulfill({
      body: JSON.stringify(fixtures.storage),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/temporary-sources/*/cleanup", async (route) => {
    const id = temporarySourceIdFromPath(route.request().url());
    const source = sourceById.get(id) ?? fixtures.sources[0];
    const payload = JSON.parse(route.request().postData() || "{}");
    const action = payload.action ?? "discardNow";
    const updatedSource =
      action === "removeGeneratedAudioOnly"
        ? {
            ...source,
            status: "stale",
            title: `${source.title} · audio removed`,
            updatedAt: "2026-06-13T10:05:00Z",
          }
        : action === "extendSession"
          ? {
              ...source,
              expiresAt: "2099-01-08T00:00:00Z",
              updatedAt: "2026-06-13T10:05:00Z",
            }
          : null;
    await route.fulfill({
      body: JSON.stringify({
        action,
        bytesRemoved: 0,
        message:
          action === "removeAllTemporaryArtifacts"
            ? "Temporary artifacts were removed. Project sources are unchanged."
            : "Temporary source fixture cleanup completed. Project sources are unchanged.",
        source: updatedSource,
        status: updatedSource?.status ?? "expired",
        temporarySourceId: source.id,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/source-preps/*/speech-policy/preview", async (route) => {
    const sourceId = sourcePrepIdFromPath(route.request().url());
    const source = sourceById.get(sourceId);
    await route.fulfill({
      body: JSON.stringify(
        source ? temporaryPreparedSourceFixture(source) : { error: "source not found" },
      ),
      contentType: "application/json",
      status: source ? 200 : 404,
    });
  });
  await page.route("**/api/temporary-sources/*/reopen", async (route) => {
    const id = temporarySourceIdFromPath(route.request().url());
    const source = sourceById.get(id);
    await route.fulfill({
      body: JSON.stringify(source ? envelopeFor(source) : { error: "temporary fixture not found" }),
      contentType: "application/json",
      status: source ? 200 : 404,
    });
  });
  await page.route("**/api/temporary-sources/*/promote", async (route) => {
    const id = temporarySourceIdFromPath(route.request().url());
    await route.fulfill({
      body: JSON.stringify({
        id: `promoted-${id}`,
        projectId: "default",
        sourceName: "Promoted temporary fixture",
        status: "ready",
        temporarySourceId: "",
        title: "Promoted temporary fixture",
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/temporary-sources/*", async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;
    if (
      pathname.endsWith("/jobs") ||
      pathname.endsWith("/storage/summary") ||
      pathname.endsWith("/cleanup") ||
      pathname.endsWith("/reopen") ||
      pathname.endsWith("/promote")
    ) {
      await route.fallback();
      return;
    }
    const id = temporarySourceIdFromPath(route.request().url());
    const source = sourceById.get(id);
    if (method === "GET" || method === "POST") {
      if (source) {
        await route.fulfill({
          body: JSON.stringify(envelopeFor(source)),
          contentType: "application/json",
          status: 200,
        });
        return;
      }
      await route.fulfill({
        body: JSON.stringify({ error: "temporary source fixture not found" }),
        contentType: "application/json",
        status: 404,
      });
      return;
    }
    if (method === "DELETE") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fallback();
  });
}

function temporarySourceIdFromPath(url) {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\/api\/temporary-sources\/([^/]+)/);
  return decodeURIComponent(match?.[1] ?? "");
}

function sourcePrepIdFromPath(url) {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\/api\/source-preps\/([^/]+)/);
  return decodeURIComponent(match?.[1] ?? "");
}

function bookSourceIdFromPath(url) {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\/api\/book-sources\/([^/]+)/);
  return decodeURIComponent(match?.[1] ?? "");
}

function auditVoiceJobFromRequest(rawRequest, { bookSourceId = "", preparedSourceId = "" } = {}) {
  const request = rawRequest ? JSON.parse(rawRequest) : {};
  const now = "2026-06-13T10:00:00.000Z";
  const text = String(request.text ?? "UI action audit generated narration.");
  return {
    adaptiveMode: Boolean(request.adaptiveMode),
    audioPartialUrl: "",
    audioReadySegments: 0,
    audioUrl: "",
    bookSourceId,
    contentType: "audio/wav",
    createdAt: now,
    durationMs: 0,
    engineOptions: request.engineOptions ?? {},
    error: "",
    failureKind: "",
    id: "ui-action-audit-created-job",
    inputText: text,
    optimizedText: text,
    performanceMode: request.performanceMode ?? "balanced",
    pipelineOptions: request.pipelineOptions ?? {},
    preparedSourceId,
    progress: {
      activeStage: "queued",
      currentSegment: 0,
      detail: "UI action audit received a non-persisted generation request.",
      message: "Generation queued",
      totalSegments: 1,
    },
    projectId: request.projectId ?? "default",
    provider: "mock",
    retries: {
      attempts: 0,
      currentSegment: 0,
      maxRetries: 1,
      segmentAttempts: 0,
      totalSegments: 1,
    },
    runMode: request.runMode ?? "checkedMaster",
    selectedBlockIds: request.selectedBlockIds ?? [],
    segments: [{ index: 1, status: "pending", text }],
    speechPolicyOverrides: request.speechPolicyOverrides ?? {},
    speechPolicyProfile: request.speechPolicyProfile ?? "Enterprise",
    stages: {
      checker: "pending",
      optimization: "pending",
      synthesis: "pending",
    },
    status: "queued",
    terminalReason: "",
    ttsEngine: request.ttsEngine ?? "auto",
    ttsLanguage: request.ttsLanguage ?? "",
    ttsVoice: request.ttsVoice ?? "",
    updatedAt: now,
    voice: request.ttsVoice ?? "audit voice",
    voiceCheck: {
      complete: false,
      needsResume: false,
      provider: "mock",
      reason: "Audit fixture job has not generated audio.",
      similarity: 0,
      transcript: "",
    },
    voiceId: request.voiceId ?? "",
    voiceProfileId: request.voiceProfileId ?? "",
  };
}

function temporaryPreparedSourceFixture(source) {
  return {
    ...source,
    projectId: "",
    sourceOwner: "temporary",
    status: "ready",
    temporarySourceId: source.id,
  };
}

function temporarySourceFixtures() {
  const sources = [
    temporarySourceFixture({
      id: "temp-article",
      kind: "text",
      sourceName: "Temporary Article Fixture",
      status: "previewable",
      title: "Temporary Article Fixture",
    }),
    temporarySourceFixture({
      id: "temp-url",
      kind: "url",
      sourceContentType: "text/html",
      sourceName: "Temporary Webpage Fixture",
      sourceUrl: "https://example.test/temporary-evidence",
      status: "previewable",
      title: "Temporary Webpage Fixture",
    }),
    temporarySourceFixture({
      id: "temp-file",
      kind: "file",
      sourceBytes: 1024,
      sourceContentType: "text/markdown",
      sourceName: "temporary-fixture.md",
      status: "reviewable",
      title: "Temporary File Fixture",
    }),
    temporarySourceFixture({
      id: "temp-audio-ready",
      artifacts: [
        {
          bytes: 4096,
          createdAt: "2026-06-13T10:00:00Z",
          expiresAt: "2099-01-01T00:00:00Z",
          id: "audio",
          kind: "audio",
          scope: "temporary",
          url: "/api/temporary-sources/temp-audio-ready/artifacts/audio",
        },
      ],
      kind: "text",
      sourceName: "Temporary Audio Ready Fixture",
      status: "audio_ready",
      title: "Temporary Audio Ready Fixture",
    }),
    temporarySourceFixture({
      error: "Provider unavailable for temporary generation.",
      id: "temp-failed",
      kind: "text",
      sourceName: "Temporary Failed Fixture",
      sourceReadiness: {
        detail: "Provider unavailable for temporary generation.",
        failureStage: "policyPreparation",
        retryAction: "Retry temporary generation",
        state: "failed",
      },
      status: "failed",
      title: "Temporary Failed Fixture",
    }),
    temporarySourceFixture({
      error:
        "This temporary source expired. Recovery metadata remains, but generated artifacts were cleaned.",
      expiresAt: "2020-01-01T00:00:00Z",
      id: "temp-expired",
      kind: "text",
      sourceName: "Temporary Expired Fixture",
      status: "expired",
      title: "Temporary Expired Fixture",
    }),
    temporarySourceFixture({
      id: "temp-promoted",
      kind: "text",
      promotedProjectId: "project-fixture",
      promotedSourceId: "source-promoted-fixture",
      promotionStatus: "promoted",
      sourceName: "Temporary Promoted Fixture",
      status: "promoted",
      title: "Temporary Promoted Fixture",
    }),
  ];
  const jobs = [
    temporaryVoiceJobFixture({
      id: "job-temp-audio-ready",
      status: "completed",
      temporarySourceId: "temp-audio-ready",
    }),
    temporaryVoiceJobFixture({
      error: "Provider unavailable for temporary generation.",
      id: "job-temp-failed",
      status: "failed",
      temporarySourceId: "temp-failed",
    }),
  ];
  const sourceBytes = sources.reduce((total, source) => total + (source.sourceBytes || 2048), 0);
  const audioBytes = 4096;
  return {
    jobs,
    sources,
    storage: {
      artifactBytes: audioBytes,
      artifactTypeBytes: { audio: audioBytes },
      audioBytes,
      expiredCount: sources.filter((source) => source.status === "expired").length,
      generatingCount: sources.filter((source) => source.status === "generating").length,
      progressBytes: 256,
      sessions: sources.map((source) => ({
        audioBytes: source.id === "temp-audio-ready" ? audioBytes : 0,
        bytes: (source.sourceBytes || 2048) + (source.id === "temp-audio-ready" ? audioBytes : 0),
        sourceBytes: source.sourceBytes || 2048,
        status: source.status,
        temporarySourceId: source.id,
        title: source.title,
      })),
      sourceBytes,
      temporaryCount: sources.length,
      totalBytes: sourceBytes + audioBytes + 256,
      updatedAt: "2026-06-13T10:00:00Z",
    },
  };
}

function temporarySourceFixture(overrides = {}) {
  const id = overrides.id ?? "temp-article";
  const now = "2026-06-13T10:00:00Z";
  const expiresAt = overrides.expiresAt ?? "2099-01-01T00:00:00Z";
  const title = overrides.title ?? "Temporary Article Fixture";
  const text =
    "Temporary narration fixture text for action evidence. It stays session scoped until a reviewer explicitly keeps it in a project.";
  return {
    artifacts: [
      {
        bytes: 2048,
        createdAt: now,
        expiresAt,
        id: "source",
        kind: "extraction",
        scope: "temporary",
        url: `/api/temporary-sources/${id}/artifacts`,
      },
      ...(overrides.artifacts ?? []),
    ],
    blockCount: 1,
    blocks: [
      {
        endOffset: text.length,
        id: `${id}-block-1`,
        index: 0,
        kind: "body",
        segments: [{ endOffset: text.length, index: 0, startOffset: 0, text }],
        speechPolicy: {
          explanation: "Fixture block is spoken by default.",
          mode: "speak",
          profile: "default",
        },
        sourceText: text,
        speakMode: "speak",
        spokenText: text,
        startOffset: 0,
        text,
      },
    ],
    bookmarks: [],
    createdAt: now,
    error: overrides.error ?? "",
    expiresAt,
    id,
    kind: overrides.kind ?? "text",
    lastAccessedAt: now,
    metadata: {
      fixture: "ui-action-audit-temporary-source",
      ownership: "temporary",
      ...(overrides.metadata ?? {}),
    },
    playbackProgress: { currentTimeMs: 0, durationMs: 0, updatedAt: now },
    projectId: "",
    promotedProjectId: overrides.promotedProjectId ?? "",
    promotedSourceId: overrides.promotedSourceId ?? "",
    promotionStatus: overrides.promotionStatus ?? "notPromoted",
    reviewNotes: ["Fixture review note remains temporary until Keep in project."],
    scope: "temporary",
    segmentCount: overrides.status === "audio_ready" ? 1 : 0,
    sourceBytes: overrides.sourceBytes ?? text.length,
    sourceContentType: overrides.sourceContentType ?? "text/plain",
    sourceName: overrides.sourceName ?? title,
    sourceOwner: "temporary",
    sourceReadiness: overrides.sourceReadiness ?? {
      confidence: "high",
      detail: "Temporary source fixture is ready for review.",
      sourceType: overrides.kind === "url" ? "webpage" : "document",
      state: "ready",
      structureLabel: "Article",
      title,
    },
    sourceSpeechPolicyProfile: "default",
    sourceSpeechPolicyOverrides: {},
    sourceUrl: overrides.sourceUrl ?? "",
    speechText: text,
    status: overrides.status ?? "previewable",
    temporarySourceId: id,
    text,
    title,
    updatedAt: now,
    warnings: [],
    wordCount: 17,
  };
}

function temporaryVoiceJobFixture({ error = "", id, status, temporarySourceId }) {
  return {
    bookSourceId: "",
    createdAt: "2026-06-13T10:00:00Z",
    durationMs: status === "completed" ? 1200 : 0,
    error,
    id,
    preparedSourceId: "",
    progress: status === "completed" ? 1 : 0,
    progressTargetId: `temporary-source:${temporarySourceId}`,
    scope: "temporary",
    status,
    temporarySourceId,
    updatedAt: "2026-06-13T10:00:00Z",
  };
}

async function inventoryScenario(browser, scenario) {
  const context = await browser.newContext({
    storageState: scenario.storageState,
    viewport: scenario.viewport ?? { height: 980, width: 1440 },
  });
  const page = await context.newPage();
  await installProviderProfileRoutes(page);
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  try {
    await scenario.open(page);
    await assertNoPageIssues(issues);
    await assertNoLegacyWorkspaceLayoutControls(page, scenario);
    const actions = await buildActionInventory(page, scenario);
    const surfaceComplexity = await collectSurfaceComplexity(page, scenario, actions);
    const screenshot = path.join(screenshotsDir, `${scenario.id}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    return { actions, screenshot, surfaceComplexity };
  } catch (error) {
    const screenshot = path.join(screenshotsDir, `${scenario.id}-inventory-failure.png`);
    await page.screenshot({ fullPage: true, path: screenshot }).catch(() => {});
    throw error;
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    await context.close();
  }
}

async function assertNoLegacyWorkspaceLayoutControls(page, scenario) {
  const legacyControls = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      if (
        typeof element.checkVisibility === "function" &&
        !element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      return true;
    };
    return [
      ['[data-segmented-control="rail-mode"]', "legacy rail mode segmented control"],
      ['[data-testid="ui-action-activity-footer-open"]', "legacy footer expand control"],
      ['[data-testid="ui-action-activity-footer-toggle"]', "legacy footer density toggle"],
      ['[data-testid="ui-action-activity-footer-full"]', "legacy footer full control"],
      ['[data-testid="ui-action-activity-footer-compact"]', "legacy footer compact control"],
      ['[data-testid="ui-action-activity-footer-collapsed"]', "legacy footer collapsed control"],
    ].flatMap(([selector, label]) =>
      [...document.querySelectorAll(selector)].filter(visible).map(() => label),
    );
  });
  assert(
    legacyControls.length === 0,
    `${scenario.id} rendered duplicate panel-level layout controls: ${legacyControls.join(", ")}`,
  );
}

async function collectSurfaceComplexity(page, scenario, actions) {
  const domMetrics = await page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      if (
        typeof element.checkVisibility === "function" &&
        !element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      let current = element;
      while (current instanceof HTMLElement) {
        const style = window.getComputedStyle(current);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          current.getAttribute("aria-hidden") === "true"
        ) {
          return false;
        }
        current = current.parentElement;
      }
      return true;
    };
    const visibleDialogs = [
      ...document.querySelectorAll("[role='dialog'][aria-modal='true']"),
    ].filter(visible);
    const activeRoot = visibleDialogs[visibleDialogs.length - 1] ?? document;
    const queryVisible = (selector) => {
      const matches =
        activeRoot instanceof Element && activeRoot.matches(selector) ? [activeRoot] : [];
      return [...matches, ...activeRoot.querySelectorAll(selector)].filter(visible);
    };
    const countVisible = (selector) => queryVisible(selector).length;
    return {
      activeModesTabs: countVisible(
        "[aria-selected='true'], [aria-pressed='true'], [data-state='active']",
      ),
      chipsBadges: countVisible(
        "[data-status-chip], [data-testid*='chip' i], [data-testid*='badge' i], [class*='chip' i], [class*='badge' i]",
      ),
      expandedPolicySourceDetails: countVisible("[data-cinema-expanded-source-detail]"),
      footerRows: countVisible("[data-cinema-footer-row]"),
      headerLines: countVisible("[data-cinema-header-line]"),
      inlineDisplaySettings: countVisible("[data-cinema-display-popover]"),
      modeControlGroups: countVisible("[data-cinema-mode-control-group]"),
      panelsOpenByDefault: countVisible(
        "[role='dialog'], [data-testid*='panel' i], [data-testid*='drawer' i], [data-testid*='sheet' i], details[open]",
      ),
      panelCount: countVisible("[data-cinema-inspector-dock], [data-cinema-mobile-sheet]"),
      primaryPlaybackGroups: countVisible("[data-cinema-primary-playback-group]"),
      sourceIdentitySummaries: countVisible("[data-source-identity-summary]"),
      visibleBadges: countVisible("[data-status-chip]"),
    };
  });
  const overlayCollision = await collectOverlayCollisionReport(page);
  const complexityActions = complexityActionsFor(actions);
  const labels = new Map();
  let labelLength = 0;
  let reachableDrawersSheets = 0;
  for (const action of complexityActions) {
    const label = action.visibleLabel || action.label || "";
    if (label) {
      labels.set(label, (labels.get(label) ?? 0) + 1);
    }
    labelLength += String(action.accessibleName || action.label || "").length;
    if (isReachableDrawerSheetAction(action)) {
      reachableDrawersSheets += 1;
    }
  }
  const visibleActions = complexityActions.length;
  return {
    budgetKey: scenario.id,
    description: scenario.description,
    id: scenario.id,
    label: scenario.label,
    metrics: {
      activeModesTabs: domMetrics.activeModesTabs,
      averageAccessibleLabelLength:
        visibleActions > 0 ? Math.round(labelLength / visibleActions) : 0,
      chipsBadges: domMetrics.chipsBadges,
      destructiveActions: complexityActions.filter((action) => action.destructive).length,
      disabledActions: complexityActions.filter((action) => action.disabled).length,
      duplicatedVisibleLabels: [...labels.values()].filter((count) => count > 1).length,
      expandedPolicySourceDetails: domMetrics.expandedPolicySourceDetails,
      footerRows: domMetrics.footerRows,
      headerLines: domMetrics.headerLines,
      inlineDisplaySettings: domMetrics.inlineDisplaySettings,
      modeControlGroups: domMetrics.modeControlGroups,
      overlayCollisions: overlayCollision.summary.failures,
      overlayProtectedTargets: overlayCollision.summary.protectedTargets,
      panelsOpenByDefault: domMetrics.panelsOpenByDefault,
      panelCount: domMetrics.panelCount,
      primaryPlaybackGroups: domMetrics.primaryPlaybackGroups,
      primaryActions: complexityActions.filter(isPrimaryComplexityAction).length,
      reachableDrawersSheets,
      sourceIdentitySummaries: domMetrics.sourceIdentitySummaries,
      visibleBadges: domMetrics.visibleBadges,
      visibleActions,
    },
    overlayCollision,
    surface: scenario.surface,
  };
}

async function exerciseScenarioAction(browser, scenario, action, activationMode) {
  const context = await browser.newContext({
    storageState: scenario.storageState,
    viewport: scenario.viewport ?? { height: 980, width: 1440 },
  });
  const page = await context.newPage();
  await installProviderProfileRoutes(page);
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  try {
    await scenario.open(page);
    page.setDefaultTimeout(actionTimeoutMs);
    const result = await exerciseAction(page, action, { activationMode });
    result.browserIssues = await pageIssuesForReport(issues);
    if (result.browserIssues.length > 0 && result.passed) {
      return {
        ...result,
        outcome: "browser issue after activation",
        passed: false,
        reason: result.browserIssues.join("; "),
        status: "failed",
      };
    }
    return result;
  } catch (error) {
    const screenshot = path.join(
      screenshotsDir,
      `${scenario.id}-${action.actionId}-failure.png`.replaceAll(/[^a-zA-Z0-9._/-]/g, "-"),
    );
    await page.screenshot({ fullPage: true, path: screenshot }).catch(() => {});
    return {
      accessibleName: action.accessibleName,
      actionClass: action.actionClass,
      actionId: action.actionId,
      activationMode,
      destructive: action.destructive,
      error: error instanceof Error ? error.message : String(error),
      expectedTransition: action.expectedTransition,
      label: action.label,
      outcome: "scenario replay failed",
      passed: false,
      scenarioId: scenario.id,
      screenshot,
      status: "failed",
      surface: action.surface,
      visibleLabel: action.visibleLabel,
    };
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    await context.close();
  }
}

async function seedAuditData(fixtures) {
  const project = await apiJson("/api/projects", {
    body: JSON.stringify({ name: `UI Action Audit ${new Date().toISOString()}` }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert(project.id, "Project creation did not return an id.");

  let pdfBook = await uploadBook(project.id, fixtures.pdf);
  const pdfScope = pickNarrationScope(pdfBook);
  pdfBook = await confirmBookSourceReadinessForAudit(pdfBook, pdfScope, "Born Digital Fixture");
  const pdfText = await scopeText(pdfBook.id, pdfScope);

  let docxBook = await uploadBook(project.id, fixtures.docx);
  const docxScope = pickNarrationScope(docxBook);
  docxBook = await confirmBookSourceReadinessForAudit(docxBook, docxScope, "Iota DOCX Fixture");
  const docxText = await scopeText(docxBook.id, docxScope);
  const docxJob = await waitForJob(
    (await createBookNarrationJob(project.id, docxBook.id, docxScope)).id,
  );

  let epubBook = await uploadBook(project.id, fixtures.epub);
  const epubScope = pickNarrationScope(epubBook);
  epubBook = await confirmBookSourceReadinessForAudit(epubBook, epubScope, "Iota EPUB Fixture");
  const epubText = await scopeText(epubBook.id, epubScope);
  const epubJob = await waitForJob(
    (await createBookNarrationJob(project.id, epubBook.id, epubScope)).id,
  );

  let markdownSource = await uploadPreparedSource(project.id, fixtures.markdown);
  markdownSource = await confirmPreparedSourceReadinessForAudit(markdownSource, "Citations");
  const markdownBlockIds = selectedPreparedBlockIds(markdownSource);
  const markdownJob = await waitForJob(
    (await createPreparedNarrationJob(project.id, markdownSource.id, markdownBlockIds)).id,
  );

  const websiteFixture = await startWebsiteFixtureServer();
  let websiteSource;
  let websiteJob;
  try {
    websiteSource = await apiJson(`/api/projects/${project.id}/source-preps`, {
      body: JSON.stringify({ kind: "url", url: websiteFixture.url }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    assertWebsiteExtractionQuality(websiteSource);
    websiteSource = await confirmPreparedSourceReadinessForAudit(websiteSource, "Website Fixture");
    websiteJob = await waitForJob(
      (
        await createPreparedNarrationJob(
          project.id,
          websiteSource.id,
          selectedPreparedBlockIds(websiteSource),
          "url",
        )
      ).id,
    );
  } finally {
    await websiteFixture.stop();
  }

  return {
    docx: { book: docxBook, job: docxJob, scope: docxScope, text: docxText },
    epub: { book: epubBook, job: epubJob, scope: epubScope, text: epubText },
    markdown: { job: markdownJob, source: markdownSource },
    pdf: { book: pdfBook, scope: pdfScope, text: pdfText },
    projectId: project.id,
    website: { job: websiteJob, source: websiteSource },
  };
}

function createScenarios(seed) {
  const workspaceText = workspaceAuditText();
  return [
    {
      description: "PDF Book source before a narration job exists.",
      id: "book-pdf-pre-audio",
      label: "PDF book source, pre-audio",
      open: (page) => openBookPanel(page, seed.pdf.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.pdf.scope,
        bookSourceId: seed.pdf.book.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.pdf.text,
      }),
      surface: "BookCinema",
    },
    {
      description: "DOCX Book Cinema with generated audio ready.",
      id: "book-docx-audio-ready",
      label: "DOCX book source, audio ready",
      open: (page) => openBookCinemaOverlay(page, seed.docx.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.docx.scope,
        bookSourceId: seed.docx.book.id,
        jobId: seed.docx.job.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.docx.text,
      }),
      surface: "BookCinema",
    },
    {
      description: "Book Cinema More menu opened from the focus mode toolbar.",
      id: "book-more-menu",
      label: "Book Cinema More menu",
      open: (page) => openBookCinemaMoreMenu(page, seed.docx.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.docx.scope,
        bookSourceId: seed.docx.book.id,
        jobId: seed.docx.job.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.docx.text,
      }),
      surface: "BookCinema",
    },
    {
      description: "EPUB Book Cinema with generated audio ready.",
      id: "book-epub-audio-ready",
      label: "EPUB book source, audio ready",
      open: (page) => openBookCinemaOverlay(page, seed.epub.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.epub.scope,
        bookSourceId: seed.epub.book.id,
        jobId: seed.epub.job.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.epub.text,
      }),
      surface: "BookCinema",
    },
    {
      description: "Document Cinema for a Markdown source with citations.",
      id: "document-cinema",
      label: "Markdown document source with citations",
      open: (page) => openPreparedCinemaOverlay(page, "Document Cinema"),
      storageState: projectStorageState(seed.projectId, {
        jobId: seed.markdown.job.id,
        preparedSourceId: seed.markdown.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "intake",
        text: seed.markdown.source.speechText ?? seed.markdown.source.text ?? "",
      }),
      surface: "DocumentCinema",
    },
    {
      description: "Document Cinema More menu opened from the focus mode toolbar.",
      id: "document-more-menu",
      label: "Document Cinema More menu",
      open: (page) => openPreparedCinemaMoreMenu(page, "Document Cinema", "DocumentCinema"),
      storageState: projectStorageState(seed.projectId, {
        jobId: seed.markdown.job.id,
        preparedSourceId: seed.markdown.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "intake",
        text: seed.markdown.source.speechText ?? seed.markdown.source.text ?? "",
      }),
      surface: "DocumentCinema",
    },
    {
      description: "Website Cinema for a local website fixture.",
      id: "website-cinema",
      label: "Website source",
      open: (page) => openPreparedCinemaOverlay(page, "Website Cinema"),
      storageState: projectStorageState(seed.projectId, {
        jobId: seed.website.job.id,
        preparedSourceId: seed.website.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "intake",
        text: seed.website.source.speechText ?? seed.website.source.text ?? "",
      }),
      surface: "WebsiteCinema",
    },
    {
      description: "Website Cinema More menu opened from the focus mode toolbar.",
      id: "website-more-menu",
      label: "Website Cinema More menu",
      open: (page) => openPreparedCinemaMoreMenu(page, "Website Cinema", "WebsiteCinema"),
      storageState: projectStorageState(seed.projectId, {
        jobId: seed.website.job.id,
        preparedSourceId: seed.website.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "intake",
        text: seed.website.source.speechText ?? seed.website.source.text ?? "",
      }),
      surface: "WebsiteCinema",
    },
    {
      description: "Book Cinema read mode with inspector pinned open.",
      id: "pinned-inspector",
      label: "Pinned inspector",
      open: (page) => openPinnedInspector(page, seed.epub.scope),
      storageState: projectStorageState(
        seed.projectId,
        {
          bookScope: seed.epub.scope,
          bookSourceId: seed.epub.book.id,
          jobId: seed.epub.job.id,
          sourceMode: "book",
          stage: "intake",
          text: seed.epub.text,
        },
        {
          "tts-ui-memory": JSON.stringify({
            cinema: { book: { mode: "inspect", pinnedPanelId: "source" } },
            rememberLayout: true,
            rememberPanelPins: true,
          }),
        },
      ),
      surface: "BookCinema",
    },
    {
      description: "Settings drawer opened from the workspace.",
      id: "settings-open",
      label: "Settings open",
      open: openSettings,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "Settings",
    },
    {
      description: "Settings drawer opened to UI memory controls.",
      id: "settings-ui-memory",
      label: "Settings UI memory",
      open: openSettingsUiMemory,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "UI Memory",
    },
    {
      description: "Settings drawer opened to the source and speech-policy controls.",
      id: "settings-speech-policy",
      label: "Settings speech policy",
      open: (page) => openSettingsGroup(page, "Sources"),
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "Speech Policy",
    },
    {
      description: "Command palette opened from the product bar.",
      id: "command-palette",
      label: "Command palette",
      open: openCommandPalette,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "Command Palette",
    },
    ...(providerProfile
      ? [
          {
            description:
              "Command palette searched for provider-gated capability actions under the active test profile.",
            id: "command-palette-provider-capabilities",
            label: "Command palette provider capabilities",
            open: openProviderCapabilityCommandPalette,
            storageState: projectStorageState(seed.projectId, {
              sourceMode: "text",
              stage: "intake",
              text: workspaceText,
            }),
            surface: "Command Palette",
          },
        ]
      : []),
    {
      description: "Command Center opened from the workspace rail.",
      id: "project-dashboard",
      label: "Command Center",
      open: openProjectDashboard,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "review",
        text: workspaceText,
      }),
      surface: "Command Center",
    },
    {
      description: "Command Center Temporary Work shelf with deterministic temporary fixtures.",
      id: "command-center-temporary-work",
      label: "Command Center Temporary Work",
      open: openCommandCenterTemporaryWork,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "review",
        text: workspaceText,
      }),
      surface: "Command Center",
    },
    {
      description: "Quick Listen recent temporary sources with active and blocked fixture states.",
      id: "quick-listen-temporary-recent",
      label: "Quick Listen temporary recent",
      open: openQuickListenTemporaryRecent,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "Quick Listen",
    },
    {
      description: "Voice dashboard opened from the workspace rail.",
      id: "voice-dashboard",
      label: "Voice dashboard",
      open: openVoiceDashboard,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "review",
        text: workspaceText,
      }),
      surface: "Voice Dashboard",
    },
    {
      description: "Preview mini-player controls after audio creation.",
      id: "preview-mini-player",
      label: "Preview mini-player",
      open: openPreviewMiniPlayer,
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.epub.scope,
        bookSourceId: seed.epub.book.id,
        jobId: seed.epub.job.id,
        sourceMode: "book",
        stage: "preview",
        text: seed.epub.text,
      }),
      surface: "Preview mini-player",
    },
    {
      description: "Mobile/narrow Book Cinema More bottom sheet.",
      id: "mobile-more-sheet",
      label: "Mobile More sheet",
      open: (page) => openMobileMoreSheet(page, seed.epub.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.epub.scope,
        bookSourceId: seed.epub.book.id,
        jobId: seed.epub.job.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.epub.text,
      }),
      surface: "Mobile/narrow More sheet",
      viewport: { height: 844, width: 390 },
    },
    workspaceScenario(seed.projectId, "workspace-intake", "Intake", "Intake", workspaceText),
    workspaceScenario(seed.projectId, "workspace-review", "Review", "Review", workspaceText),
    workspaceScenario(seed.projectId, "workspace-preview", "Preview", "Preview", workspaceText),
    {
      description: "Workspace Preview with active long-form audio generation.",
      id: "workspace-preview-generation-running",
      label: "Workspace Preview generation running",
      open: (page) => openPreviewGenerationRunning(page, seed.website.job, seed.website.source),
      storageState: projectStorageState(seed.projectId, {
        jobId: auditScenarioVoiceJobId(seed.website.job.id, "running"),
        preparedSourceId: seed.website.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "preview",
        text: seed.website.source.speechText ?? seed.website.source.text ?? "",
      }),
      surface: "Preview",
    },
    {
      description: "Workspace Preview with a retryable full-audio generation failure.",
      id: "workspace-preview-generation-failed",
      label: "Workspace Preview generation failed",
      open: (page) =>
        openPreviewGenerationFailedRecovery(page, seed.website.job, seed.website.source),
      storageState: projectStorageState(seed.projectId, {
        jobId: auditScenarioVoiceJobId(seed.website.job.id, "failed"),
        preparedSourceId: seed.website.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "preview",
        text: seed.website.source.speechText ?? seed.website.source.text ?? "",
      }),
      surface: "Preview",
    },
    {
      description: "Workspace Preview with completed audio and one ASR segment review warning.",
      id: "workspace-preview-asr-warning",
      label: "Workspace Preview ASR warning",
      open: (page) => openPreviewAsrWarning(page, seed.website.job, seed.website.source),
      storageState: projectStorageState(seed.projectId, {
        jobId: auditScenarioVoiceJobId(seed.website.job.id, "asr-warning"),
        preparedSourceId: seed.website.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "preview",
        text: seed.website.source.speechText ?? seed.website.source.text ?? "",
      }),
      surface: "Preview",
    },
    {
      description: "Workspace Preview audition 404 recovery.",
      id: "workspace-preview-audition-404",
      label: "Workspace Preview audition recovery",
      open: openPreviewAudition404Recovery,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "preview",
        text: workspaceText,
      }),
      surface: "Preview",
    },
    {
      description: "Teleprompt stage reached from workspace review.",
      id: "workspace-teleprompt",
      label: "Workspace Teleprompt",
      open: openTeleprompt,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "review",
        text: workspaceText,
      }),
      surface: "Teleprompt",
    },
    {
      description: "Teleprompt Theatre presenter overlay reached from workspace review.",
      id: "workspace-teleprompt-theatre",
      label: "Workspace Teleprompt Theatre",
      open: openTelepromptTheatre,
      storageState: projectStorageState(seed.projectId, {
        jobId: seed.epub.job.id,
        sourceMode: "text",
        stage: "review",
        text: workspaceText,
      }),
      surface: "Teleprompt",
    },
  ];
}

async function runWorkspaceStageTraversal(browser, seed) {
  console.log("[ui-actions] traversal workspace-stage-parity");
  const context = await browser.newContext({
    storageState: projectStorageState(seed.projectId, {
      bookScope: seed.pdf.scope,
      bookSourceId: seed.pdf.book.id,
      sourceMode: "book",
      stage: "intake",
      text: seed.pdf.text,
    }),
    viewport: { height: 980, width: 1440 },
  });
  const page = await context.newPage();
  await installProviderProfileRoutes(page, { nonPersistedMutations: false });
  await installBrowserVoiceJobReadRoutes(page);
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const screenshots = [];
  const capture = async (name) => {
    const screenshot = path.join(screenshotsDir, `${name}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
  };
  try {
    await gotoApp(page);
    await capture("workspace-stage-00-intake-before");
    await openWorkspaceIntakeStage(page);
    await capture("workspace-stage-01-intake-after");
    await openIntakeDestination(page);
    await page.getByTestId("intake-wizard-open-book-cinema").waitFor();
    await selectBookScope(page, seed.pdf.scope);
    await capture("workspace-stage-02-source-selected");
    await page.getByTestId("intake-wizard-open-review").click();
    await page.getByText("Revision Panel").first().waitFor();
    await selectWorkspaceLayout(page, "Full");
    await assertWorkspaceReviewRepairLayout(page);
    await page.getByTestId("ui-action-project-dashboard-open-rail").click();
    await page.getByRole("dialog", { name: "Command Center" }).waitFor();
    await capture("workspace-stage-03-project-command-center");
    await page.getByTestId("ui-action-command-center-return").click();
    await page.getByRole("dialog", { name: "Command Center" }).waitFor({ state: "detached" });
    await page.getByTestId("ui-action-voice-dashboard-open-rail").click();
    await page.getByRole("dialog", { name: "Command Center" }).waitFor();
    await capture("workspace-stage-03-voice-command-center");
    await page.getByTestId("ui-action-command-center-return").click();
    await page.getByRole("dialog", { name: "Command Center" }).waitFor({ state: "detached" });
    await page.getByTestId("revision-tab-blocks").click();
    await page.getByTestId("revision-select-visible").check();
    await page.getByTestId("ui-action-revision-batch-approve").click();
    await page
      .getByTestId("revision-status-message")
      .getByText(/approved/i)
      .waitFor();
    await page.getByTestId("revision-tab-overview").click();
    await assertWorkspaceReviewRepairLayout(page);
    await capture("workspace-stage-03-review-after");
    await page.getByTestId("workspace-stage-action-previewSpeech").click();
    await page.getByText("Spoken Form").first().waitFor();
    await page.getByText("Policy Notes").first().waitFor();
    await page
      .getByText(/Default voice|Default mock narrator/)
      .first()
      .waitFor({ state: "attached" });
    await assertWorkspacePreviewEmptyLayout(page);
    await clickPreviewMiniPlayerIfReady(page);
    await clickIfEnabledTestId(page, "ui-action-preview-local-next");
    await clickIfEnabledTestId(page, "ui-action-preview-local-previous");
    await selectIfEnabledTestId(page, "ui-action-preview-local-speed", "1.25");
    await capture("workspace-stage-04-preview-after");
    await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
    await page.getByText("Teleprompt Studio").first().waitFor();
    await page.getByTestId("teleprompt-current-cue-stage").first().waitFor();
    const presetMenu = page.locator("[data-teleprompt-preset-menu='display']").first();
    await presetMenu.evaluate((element) => {
      if (element instanceof HTMLDetailsElement) {
        element.open = true;
      }
    });
    await page.getByTestId("ui-action-teleprompt-preset-largeText").scrollIntoViewIfNeeded();
    await page.getByTestId("ui-action-teleprompt-preset-largeText").click();
    await page.getByTestId("ui-action-teleprompt-mirror").scrollIntoViewIfNeeded();
    await page.getByTestId("ui-action-teleprompt-mirror").click();
    await page.getByTestId("ui-action-teleprompt-preset-highContrast").scrollIntoViewIfNeeded();
    await page.getByTestId("ui-action-teleprompt-preset-highContrast").click();
    await page
      .getByText(/Default voice|Default mock narrator/)
      .first()
      .waitFor({ state: "attached" });
    await capture("workspace-stage-05-teleprompt-after");
    await page.getByTestId("ui-action-teleprompt-cue-drawer").click();
    await page
      .getByTestId("ui-action-teleprompt-back-preview")
      .evaluate((element) => element.click());
    await page.getByText("Spoken Form").first().waitFor();
    await capture("workspace-stage-06-back-preview-after");

    if (await isEnabledTestId(page, "workspace-stage-action-createAndListen")) {
      const createResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/voice-jobs") && response.request().method() === "POST",
      );
      await page.getByTestId("workspace-stage-action-createAndListen").click();
      const response = await createResponse;
      assert(response.ok(), `Create & Listen failed with ${String(response.status())}`);
      const createdJob = await response.json();
      if (createdJob?.id) {
        await waitForJob(createdJob.id);
      }
      await clickPreviewMiniPlayerIfReady(page);
      await capture("workspace-stage-07-create-listen-after");
      await page.getByTestId("workspace-stage-action-openCinema").click();
      await cinemaOverlay(page).waitFor({ state: "visible" });
      await cinemaOverlay(page)
        .getByText(/Book Cinema|Document Cinema|Cinema/i)
        .first()
        .waitFor();
    } else {
      await capture("workspace-stage-07-create-listen-gated");
    }

    const screenshot = path.join(screenshotsDir, "workspace-stage-traversal.png");
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
    await assertNoPageIssues(issues);
    return {
      result: {
        accessibleName: "Full stage traversal",
        actionClass: "navigation",
        actionId: "workspace-stage-traversal",
        activationMode: "scripted",
        destructive: false,
        expectedTransition: "full stage traversal",
        label: "Intake → Review → Preview → Teleprompt → Preview → Create & Listen → Cinema",
        outcome: "stage context preserved through full traversal",
        passed: true,
        scenarioId: "workspace-stage-traversal",
        status: "passed",
        surface: "Workspace",
        visibleLabel: "Full stage traversal",
      },
      screenshots,
    };
  } catch (error) {
    const screenshot = path.join(screenshotsDir, "workspace-stage-traversal-failure.png");
    await page.screenshot({ fullPage: true, path: screenshot }).catch(() => {});
    screenshots.push(screenshot);
    throw error;
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    await context.close();
  }
}

function workspaceScenario(projectId, id, label, surface, text) {
  return {
    description: `Workspace ${label} stage controls.`,
    id,
    label: `Workspace ${label}`,
    open: (page) => openWorkspaceStage(page, label),
    storageState: projectStorageState(projectId, {
      sourceMode: "text",
      stage: label.toLowerCase(),
      text,
    }),
    surface,
  };
}

async function openWorkspaceStage(page, label) {
  await gotoApp(page);
  const button =
    label === "Preview"
      ? page.getByTestId("workspace-stage-preview")
      : label === "Review"
        ? page.getByTestId("workspace-stage-review")
        : page.getByRole("button", { exact: true, name: label }).first();
  if (
    (await button.isVisible().catch(() => false)) &&
    (await button.isEnabled().catch(() => false))
  ) {
    await button.click();
  }
  if (label === "Intake") {
    await page
      .getByText(/Voice Studio|Guided Intake|Narrate a book|Read a document/i)
      .first()
      .waitFor();
  } else if (label === "Review") {
    await page
      .getByText(/Revision Panel|Source Review|Block Review/i)
      .first()
      .waitFor();
  } else if (label === "Preview") {
    await waitForAnyVisibleTestId(page, [
      "workspace-stage-action-createAndListen",
      "workspace-stage-action-openTeleprompt",
      "ui-action-preview-local-play",
    ]);
    if (
      await page
        .getByTestId("preview-generated-audio-empty-state")
        .isVisible()
        .catch(() => false)
    ) {
      await assertWorkspacePreviewEmptyLayout(page);
    }
  } else {
    await page.getByText("Teleprompt Studio").first().waitFor();
  }
}

async function selectWorkspaceLayout(page, label) {
  const menu = page.getByTestId("ui-action-workspace-layout-menu").first();
  await menu.locator("summary").click();
  await page.getByRole("button", { exact: true, name: `${label} workspace layout` }).click();
}

async function assertWorkspaceReviewRepairLayout(page) {
  await page.getByTestId("revision-guided-repair-queue").waitFor({ state: "visible" });
  await page.getByTestId("revision-selected-block-editor").waitFor({ state: "visible" });
  const report = await page.evaluate(() => {
    const failures = [];
    const visible = (element) =>
      element instanceof HTMLElement &&
      element.offsetParent !== null &&
      element.getClientRects().length > 0 &&
      !element.closest("[aria-hidden='true']");
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!visible(element)) {
        failures.push(`${selector} is not visible`);
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const overlapArea = (left, right) =>
      Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
      Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const editor = rectFor("[data-testid='revision-selected-block-editor']");
    const queue = rectFor("[data-testid='revision-guided-repair-queue']");
    const approve = rectFor("[data-testid='ui-action-revision-block-approve']");
    const nextIssue = rectFor("[data-testid='ui-action-revision-block-next-issue']");
    const footerElement = document.querySelector("[data-testid='narration-status-strip']");
    const footer = visible(footerElement) ? footerElement.getBoundingClientRect() : null;
    if (editor && queue && overlapArea(editor, queue) > 64) {
      failures.push("Review queue overlaps the selected repair editor");
    }
    if (footer) {
      for (const [label, rect] of [
        ["Approve", approve],
        ["Next issue", nextIssue],
      ]) {
        if (rect && overlapArea(rect, footer) > 0) {
          failures.push(`${label} repair action overlaps the status strip`);
        }
      }
    }
    if (document.querySelector("[data-testid='localized-review-playback-toolbar']")) {
      failures.push("Review playback toolbar is visible before checked audio is available");
    }
    return failures;
  });
  if (report.length > 0) {
    throw new Error(`Workspace review repair layout failed: ${report.join("; ")}`);
  }
}

async function assertWorkspacePreviewEmptyLayout(page) {
  const generatedAudioEmptyState = page.getByTestId("preview-generated-audio-empty-state");
  await generatedAudioEmptyState.scrollIntoViewIfNeeded();
  await generatedAudioEmptyState.waitFor({ state: "visible" });
  await page.getByTestId("workspace-stage-action-createAndListen").waitFor({ state: "visible" });
  const report = await page.evaluate(() => {
    const failures = [];
    const visible = (element) =>
      element instanceof HTMLElement &&
      element.offsetParent !== null &&
      element.getClientRects().length > 0 &&
      !element.closest("[aria-hidden='true']");
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!visible(element)) {
        failures.push(`${selector} is not visible`);
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const overlapArea = (left, right) =>
      Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
      Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const audition = rectFor("[data-testid='preview-audition-panel']");
    const generated = rectFor("[data-testid='preview-generated-audio-panel']");
    const placeholder = rectFor("[data-testid='preview-generated-audio-empty-state']");
    const create = rectFor("[data-testid='workspace-stage-action-createAndListen']");
    const footerElement = document.querySelector("[data-testid='narration-status-strip']");
    const footer = visible(footerElement) ? footerElement.getBoundingClientRect() : null;
    if (audition && generated && overlapArea(audition, generated) > 64) {
      failures.push("Preview audition panel overlaps generated-audio placeholder");
    }
    if (footer) {
      for (const [label, rect] of [
        ["Create & Listen", create],
        ["Generated audio placeholder", placeholder],
      ]) {
        if (rect && overlapArea(rect, footer) > 0) {
          failures.push(`${label} overlaps the status strip`);
        }
      }
    }
    if (visible(document.querySelector("[data-testid='localized-preview-playback-toolbar']"))) {
      failures.push("Preview playback toolbar is visible before generated audio is available");
    }
    return failures;
  });
  if (report.length > 0) {
    throw new Error(`Workspace preview empty layout failed: ${report.join("; ")}`);
  }
}

async function assertWorkspacePreviewGenerationRunningLayout(page) {
  const cockpit = page.getByTestId("preview-generation-cockpit");
  await cockpit.scrollIntoViewIfNeeded();
  await cockpit.waitFor({ state: "visible" });
  await page.getByTestId("ui-action-preview-cancel-run").waitFor({ state: "visible" });
  await page
    .getByText(/review warnings, generation continues/i)
    .first()
    .waitFor();
  await page
    .getByText(/Issue · Audio working|Job ·/i)
    .first()
    .waitFor();
  const generatedPanelText =
    (await page.getByTestId("preview-generated-audio-panel").textContent()) ?? "";
  if (!/Audio is being prepared|Ready segments|Partially ready/i.test(generatedPanelText)) {
    throw new Error("Preview generated-audio panel does not describe active generation progress.");
  }
  const report = await page.evaluate(() => {
    const failures = [];
    const visible = (element) =>
      element instanceof HTMLElement &&
      element.offsetParent !== null &&
      element.getClientRects().length > 0 &&
      !element.closest("[aria-hidden='true']");
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!visible(element)) {
        failures.push(`${selector} is not visible`);
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const overlapArea = (left, right) =>
      Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
      Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const topChrome = rectFor("header");
    const stageStepper = rectFor("[data-testid='workspace-stage-stepper']");
    const cockpit = rectFor("[data-testid='preview-generation-cockpit']");
    const manual = rectFor("[data-testid='preview-manual-reading-secondary']");
    const preflight = rectFor("[data-testid='preview-generation-preflight-summary']");
    const generated = rectFor("[data-testid='preview-generated-audio-panel']");
    const inspector = rectFor("[data-overlay-owner='right-rail']");
    const cancelRun = rectFor("[data-testid='ui-action-preview-cancel-run']");
    const footerElement = document.querySelector("[data-testid='narration-status-strip']");
    const footer = visible(footerElement) ? footerElement.getBoundingClientRect() : null;
    const inspectorText =
      document.querySelector("[data-context-panel-surface='Workspace']")?.textContent ?? "";
    const reviewCardText = [
      document.querySelector("[data-testid='workspace-stage-review']")?.textContent ?? "",
      document.body.textContent ?? "",
    ].join(" ");
    if (!/Audio working|Queue|Job/i.test(inspectorText)) {
      failures.push("Preview inspector does not show active audio/job context");
    }
    if (/Cue ·|Cue detail/i.test(inspectorText)) {
      failures.push("Preview inspector defaults to cropped cue text during generation");
    }
    if (!/generation continues|Needs repair|review warning/i.test(reviewCardText)) {
      failures.push("Review warning stage is not represented during active generation");
    }
    for (const [label, left, right] of [
      ["top chrome/stage map", topChrome, stageStepper],
      ["stage map/generation cockpit", stageStepper, cockpit],
      ["generation cockpit/manual reading", cockpit, manual],
      ["manual reading/preflight", manual, preflight],
      ["preflight/generated audio", preflight, generated],
    ]) {
      if (left && right && overlapArea(left, right) > 64) {
        failures.push(`${label} overlaps in active-generation Preview`);
      }
    }
    if (footer) {
      for (const [label, rect] of [
        ["Cancel Run", cancelRun],
        ["Generation cockpit", cockpit],
        ["Inspector", inspector],
      ]) {
        if (rect && overlapArea(rect, footer) > 0) {
          failures.push(`${label} overlaps the status strip`);
        }
      }
    }
    return failures;
  });
  if (report.length > 0) {
    throw new Error(`Workspace preview active-generation layout failed: ${report.join("; ")}`);
  }
}

async function assertWorkspacePreviewGenerationFailedRecoveryLayout(page) {
  const cockpit = page.getByTestId("preview-generation-cockpit");
  const cockpitVisible = await cockpit
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!cockpitVisible) {
    await assertWorkspacePreviewAudioRebuildRecoveryLayout(page);
    return;
  }
  await cockpit.scrollIntoViewIfNeeded();
  const generatedAudioPanel = page.getByTestId("preview-generated-audio-panel");
  await generatedAudioPanel.scrollIntoViewIfNeeded();
  await generatedAudioPanel.waitFor({ state: "visible" });
  const retryGenerationLabel = /Retry (?:generation|full narration)/i;
  await page.getByRole("button", { name: retryGenerationLabel }).first().waitFor();
  const retryReachable = await page
    .getByRole("button", { name: retryGenerationLabel })
    .evaluateAll((buttons) =>
      buttons.some(
        (button) =>
          button instanceof HTMLButtonElement &&
          !button.disabled &&
          button.getAttribute("aria-disabled") !== "true",
      ),
    );
  if (!retryReachable) {
    throw new Error("Retry generation is not reachable in Preview failed-generation recovery.");
  }
  const generatedAudioPanelText =
    (await page.getByTestId("preview-generated-audio-panel").textContent()) ?? "";
  if (
    !/Audio needs retry|Retry generation|Retry full narration|Ready prefix|Ready segments/i.test(
      generatedAudioPanelText,
    )
  ) {
    throw new Error("Preview generated-audio panel does not describe retry recovery.");
  }
  await page
    .getByText(/Issue · Generation failed/i)
    .first()
    .waitFor();
  const report = await page.evaluate(() => {
    const failures = [];
    const visible = (element) =>
      element instanceof HTMLElement &&
      element.offsetParent !== null &&
      element.getClientRects().length > 0 &&
      !element.closest("[aria-hidden='true']");
    const rectFor = (selector, required = true) => {
      const element = document.querySelector(selector);
      if (!visible(element)) {
        if (required) {
          failures.push(`${selector} is not visible`);
        }
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const overlapArea = (left, right) =>
      Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
      Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const cockpit = rectFor("[data-testid='preview-generation-cockpit']");
    const manual = rectFor("[data-testid='preview-manual-reading-secondary']");
    const preflight = rectFor("[data-testid='preview-generation-preflight-summary']");
    const generated = rectFor("[data-testid='preview-generated-audio-panel']");
    const placeholder = rectFor("[data-testid='preview-generated-audio-empty-state']", false);
    const playback = rectFor("[data-testid='localized-preview-playback-toolbar']", false);
    const inspector = rectFor("[data-overlay-owner='right-rail']");
    const footerElement = document.querySelector("[data-testid='narration-status-strip']");
    const footer = visible(footerElement) ? footerElement.getBoundingClientRect() : null;
    const inspectorText =
      document.querySelector("[data-context-panel-surface='Workspace']")?.textContent ?? "";
    if (!/Issue · Generation failed/i.test(inspectorText)) {
      failures.push("Preview inspector does not show generation failure context");
    }
    if (!/Queue/i.test(inspectorText)) {
      failures.push("Preview inspector is missing recovery issue or queue context");
    }
    if (/Cue ·|Cue detail/i.test(inspectorText)) {
      failures.push("Preview inspector still defaults to cue text in failed generation state");
    }
    for (const [label, left, right] of [
      ["generation cockpit/manual reading", cockpit, manual],
      ["manual reading/preflight", manual, preflight],
      ["preflight/generated audio", preflight, generated],
    ]) {
      if (left && right && overlapArea(left, right) > 64) {
        failures.push(`${label} overlaps in failed-generation Preview`);
      }
    }
    if (footer && inspector && overlapArea(inspector, footer) > 64) {
      failures.push("Preview recovery inspector overlaps the status strip");
    }
    if (footer && cockpit && overlapArea(cockpit, footer) > 0) {
      failures.push("Preview recovery cockpit overlaps the status strip");
    }
    for (const [label, rect] of [
      ["Generated-audio recovery placeholder", placeholder],
      ["Generated-audio recovery playback", playback],
      ["Generated-audio recovery panel", generated],
    ]) {
      if (footer && rect && overlapArea(rect, footer) > 0) {
        failures.push(`${label} overlaps the status strip`);
      }
    }
    return failures;
  });
  if (report.length > 0) {
    throw new Error(
      `Workspace preview failed-generation recovery layout failed: ${report.join("; ")}`,
    );
  }
}

async function assertWorkspacePreviewAudioRebuildRecoveryLayout(page) {
  const generatedAudioPanel = page.getByTestId("preview-generated-audio-panel");
  await generatedAudioPanel.scrollIntoViewIfNeeded();
  await generatedAudioPanel.waitFor({ state: "visible" });
  await page
    .getByText(/Audio needs rebuild|Playback is unavailable/i)
    .first()
    .waitFor();
  await page
    .getByText(/Audio does not match the current source, voice, policy, or scope/i)
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: /Open diagnostics/i })
    .first()
    .waitFor();
}

async function assertWorkspacePreviewAsrWarningLayout(page) {
  const generatedAudioPanel = page.getByTestId("preview-generated-audio-panel");
  await generatedAudioPanel.scrollIntoViewIfNeeded();
  await generatedAudioPanel.waitFor({ state: "visible" });
  await page.getByTestId("localized-preview-playback-toolbar").waitFor({ state: "visible" });
  await page
    .getByText(/Audio generated with 1 segment needing audio review/i)
    .first()
    .waitFor();
  await page
    .getByText(/Audio review/i)
    .first()
    .waitFor();
  const retryVisible = await page
    .getByRole("button", { name: /Retry (?:generation|full narration)/i })
    .first()
    .isVisible()
    .catch(() => false);
  if (retryVisible) {
    throw new Error("Retry generation is visible for completed audio with ASR review warnings.");
  }
  const report = await page.evaluate(() => {
    const failures = [];
    const visible = (element) =>
      element instanceof HTMLElement &&
      element.offsetParent !== null &&
      element.getClientRects().length > 0 &&
      !element.closest("[aria-hidden='true']");
    const rectFor = (selector) => {
      const element = document.querySelector(selector);
      if (!visible(element)) {
        failures.push(`${selector} is not visible`);
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const overlapArea = (left, right) =>
      Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
      Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const generated = rectFor("[data-testid='preview-generated-audio-panel']");
    const toolbar = rectFor("[data-testid='localized-preview-playback-toolbar']");
    const inspector = rectFor("[data-overlay-owner='right-rail']");
    const footerElement = document.querySelector("[data-testid='narration-status-strip']");
    const footer = visible(footerElement) ? footerElement.getBoundingClientRect() : null;
    const pageText = document.body.textContent ?? "";
    const inspectorText =
      document.querySelector("[data-context-panel-surface='Workspace']")?.textContent ?? "";
    if (!/Audio generated with 1 segment needing audio review/i.test(pageText)) {
      failures.push("Preview does not surface completed-audio ASR review warning");
    }
    if (/Retry (?:generation|full narration)/i.test(pageText)) {
      failures.push("Completed-audio ASR warning is presented as retry-generation recovery");
    }
    if (!/Audio review|Segment 13|segment warning/i.test(inspectorText)) {
      failures.push("Preview inspector does not show ASR audio review context");
    }
    if (!/Audio generated with 1 segment needing audio review\./i.test(inspectorText)) {
      failures.push("Preview inspector does not show the full ASR review explanation");
    }
    if (/generated wit\.\.\.|completed with\s*\.\.\./i.test(inspectorText)) {
      failures.push("Preview inspector truncates ASR warning copy with an ellipsis");
    }
    if (/Cue ·|Cue detail/i.test(inspectorText)) {
      failures.push("Preview inspector defaults to cropped cue text for ASR warning fixture");
    }
    if (generated && toolbar && overlapArea(generated, toolbar) <= 0) {
      failures.push("Generated audio playback toolbar is not embedded in the generated panel");
    }
    if (footer) {
      for (const [label, rect] of [
        ["Generated audio panel", generated],
        ["Inspector", inspector],
      ]) {
        if (rect && overlapArea(rect, footer) > 0) {
          failures.push(`${label} overlaps the status strip`);
        }
      }
    }
    return failures;
  });
  if (report.length > 0) {
    throw new Error(`Workspace preview ASR warning layout failed: ${report.join("; ")}`);
  }
}

async function clickPreviewMiniPlayerIfReady(page) {
  const player = page.getByTestId("global-preview-player");
  if (await player.isVisible().catch(() => false)) {
    await clickIfEnabledTestId(page, "ui-action-preview-mini-segment");
    await selectIfEnabledTestId(page, "ui-action-preview-mini-speed", "1.25");
    return;
  }
  await clickIfEnabledTestId(page, "ui-action-preview-local-play");
  await selectIfEnabledTestId(page, "ui-action-preview-local-speed", "1.25");
}

async function openPreviewGenerationRunning(page, job, source) {
  const runningJob = runningPreviewGenerationJob(job);
  const warningSource = preparedSourceWithReviewWarningsForGenerationFixture(source);
  await page.route("**/api/voice-jobs/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname === `/api/voice-jobs/${runningJob.id}`) {
      await route.fulfill({
        body: JSON.stringify(runningJob),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/voice-jobs/${runningJob.id}/events`
    ) {
      await route.fulfill({
        body: `data: ${JSON.stringify(runningJob)}\n\n`,
        contentType: "text/event-stream",
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/source-preps/*/voice-jobs", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify([runningJob]),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/projects/*/source-preps", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const sources = await response.json();
    const patchedSources = Array.isArray(sources)
      ? sources.map((item) => (item.id === warningSource.id ? warningSource : item))
      : sources;
    await route.fulfill({
      body: JSON.stringify(patchedSources),
      contentType: "application/json",
      status: response.status(),
    });
  });
  await gotoApp(page);
  await assertWorkspacePreviewGenerationRunningLayout(page);
}

async function openPreviewGenerationFailedRecovery(page, job, source) {
  const cleanSource = cleanPreparedSourceForGenerationFailedFixture(source);
  const failedJob = failedPreviewGenerationJob(job, cleanSource);
  await page.route("**/api/voice-jobs/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname === `/api/voice-jobs/${failedJob.id}`) {
      await route.fulfill({
        body: JSON.stringify(failedJob),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/voice-jobs/${failedJob.id}/events`
    ) {
      await route.fulfill({
        body: `data: ${JSON.stringify(failedJob)}\n\n`,
        contentType: "text/event-stream",
        status: 200,
      });
      return;
    }
    if (
      route.request().method() === "POST" &&
      url.pathname === `/api/voice-jobs/${failedJob.id}/retry`
    ) {
      await route.fulfill({
        body: JSON.stringify(failedJob),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/source-preps/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/source-preps/${cleanSource.id}`
    ) {
      await route.fulfill({
        body: JSON.stringify(cleanSource),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/source-preps/*/voice-jobs", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify([failedJob]),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/projects/*/source-preps", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const sources = await response.json();
    const patchedSources = Array.isArray(sources)
      ? sources.map((item) => (item.id === cleanSource.id ? cleanSource : item))
      : sources;
    await route.fulfill({
      body: JSON.stringify(patchedSources),
      contentType: "application/json",
      status: response.status(),
    });
  });
  await gotoApp(page);
  await assertWorkspacePreviewGenerationFailedRecoveryLayout(page);
}

async function openPreviewAsrWarning(page, job, source) {
  const cleanSource = cleanPreparedSourceForGenerationFailedFixture(source);
  const warnedJob = completedPreviewAsrWarningJob(job, cleanSource);
  await page.route("**/api/voice-jobs/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET" && url.pathname === `/api/voice-jobs/${warnedJob.id}`) {
      await route.fulfill({
        body: JSON.stringify(warnedJob),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/voice-jobs/${warnedJob.id}/events`
    ) {
      await route.fulfill({
        body: `data: ${JSON.stringify(warnedJob)}\n\n`,
        contentType: "text/event-stream",
        status: 200,
      });
      return;
    }
    if (
      route.request().method() === "GET" &&
      (url.pathname === `/api/voice-jobs/${warnedJob.id}/audio` ||
        url.pathname === `/api/voice-jobs/${warnedJob.id}/audio/partial`)
    ) {
      await route.fulfill({
        body: syntheticAuditWav(),
        contentType: "audio/wav",
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/source-preps/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/source-preps/${cleanSource.id}`
    ) {
      await route.fulfill({
        body: JSON.stringify(cleanSource),
        contentType: "application/json",
        status: 200,
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/source-preps/*/voice-jobs", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify([warnedJob]),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/projects/*/source-preps", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const sources = await response.json();
    const patchedSources = Array.isArray(sources)
      ? sources.map((item) => (item.id === cleanSource.id ? cleanSource : item))
      : sources;
    await route.fulfill({
      body: JSON.stringify(patchedSources),
      contentType: "application/json",
      status: response.status(),
    });
  });
  await gotoApp(page);
  await assertWorkspacePreviewAsrWarningLayout(page);
}

async function openPreviewAudition404Recovery(page) {
  await openWorkspaceStage(page, "Preview");
  await page.route("**/api/voice-previews", async (route) => {
    await route.fulfill({
      body: "Cannot POST /api/voice-previews",
      contentType: "text/plain",
      headers: { "x-e2e-expected-error": "preview-audition-404" },
      status: 404,
    });
  });
  await waitForEnabledTestId(page, "ui-action-preview-audition-voice");
  await page.getByTestId("ui-action-preview-audition-voice").click();
  await page.getByText(/Audition could not find the current project or preview route/i).waitFor();
  await assertWorkspacePreviewEmptyLayout(page);
}

function runningPreviewGenerationJob(job) {
  const totalSegments = Math.max(
    70,
    job.retries?.totalSegments ?? 0,
    job.progress?.totalSegments ?? 0,
    job.segments?.length ?? 0,
  );
  const readySegments = Math.min(6, totalSegments);
  const currentSegment = Math.min(readySegments + 1, totalSegments);
  return {
    ...job,
    audioReadySegments: readySegments,
    audioUrl: "",
    audioPartialUrl: `/api/voice-jobs/${job.id}/audio/partial`,
    error: "",
    failureKind: "",
    id: auditScenarioVoiceJobId(job.id, "running"),
    progress: {
      ...job.progress,
      activeStage: "synthesizing",
      currentSegment,
      detail: `${readySegments.toString()}/${totalSegments.toString()} segments can play; pending segments will unlock as generation continues.`,
      message: `Generating segment ${currentSegment.toString()} of ${totalSegments.toString()}`,
      totalSegments,
    },
    retries: {
      ...job.retries,
      currentSegment,
      segmentAttempts: 1,
      totalSegments,
    },
    retriable: true,
    segments: Array.from({ length: totalSegments }).map((_, index) => ({
      index: index + 1,
      status: index < readySegments ? "ready" : index === readySegments ? "running" : "pending",
      text: `Segment ${String(index + 1)}`,
    })),
    status: "synthesizing",
    terminalReason: "",
  };
}

function failedPreviewGenerationJob(job, source) {
  const speechBlocks = (source.blocks ?? []).filter((block) => block.speakMode !== "skip");
  const selectedBlockIds = speechBlocks.map((block) => block.id).filter(Boolean);
  const segmentTexts =
    speechBlocks.length > 0
      ? speechBlocks.map((block, index) =>
          String(block.spokenText || block.text || `Segment ${String(index + 1)}`).trim(),
        )
      : ["Failed generation fixture."];
  const totalSegments = Math.max(1, segmentTexts.length);
  const readySegments = Math.min(1, totalSegments);
  const inputText = segmentTexts.join("\n\n");
  return {
    ...job,
    audioReadySegments: readySegments,
    audioPartialUrl: "",
    audioUrl: "",
    completedAt: "",
    durationMs: 0,
    error: "Provider failed while creating audio.",
    failureKind: "engine",
    id: auditScenarioVoiceJobId(job.id, "failed"),
    inputText,
    optimizedText: inputText,
    performanceMode: "throughput",
    progress: {
      ...job.progress,
      activeStage: "failed",
      currentSegment: readySegments + 1,
      detail: "Provider failed while creating audio.",
      message: "Generation failed",
      totalSegments,
    },
    retries: {
      ...job.retries,
      currentSegment: readySegments + 1,
      totalSegments,
    },
    retriable: true,
    selectedBlockIds,
    segments: segmentTexts.map((text, index) => ({
      index: index + 1,
      reason: index < readySegments ? "ok" : "provider_failed",
      status: index < readySegments ? "ready" : "failed",
      text,
    })),
    speechPolicyOverrides: {},
    speechPolicyProfile: "Enterprise",
    status: "failed",
    terminalReason: "provider_failed",
    ttsEngine: "auto",
    ttsLanguage: "a",
    ttsVoice: "af_heart",
    updatedAt: auditFreshJobTimestamp(source),
    voiceId: "",
    voiceProfileId: "",
  };
}

function completedPreviewAsrWarningJob(job, source) {
  const speechBlocks = (source.blocks ?? []).filter((block) => block.speakMode !== "skip");
  const selectedBlockIds = speechBlocks.map((block) => block.id).filter(Boolean);
  const segmentTexts =
    speechBlocks.length > 0
      ? speechBlocks.map((block, index) =>
          String(block.spokenText || block.text || `Segment ${String(index + 1)}`).trim(),
        )
      : ["Audio review warning fixture."];
  const totalSegments = Math.max(1, segmentTexts.length);
  const warningIndex = Math.min(12, totalSegments - 1);
  const warning =
    "ASR validation exhausted; audio kept for review: ASR transcript did not sufficiently match and did not look like a clean cutoff";
  return {
    ...job,
    audioReadySegments: totalSegments,
    audioPartialUrl: "",
    audioUrl: `data:audio/wav;base64,${syntheticAuditWav().toString("base64")}`,
    error: "",
    failureKind: "",
    id: auditScenarioVoiceJobId(job.id, "asr-warning"),
    inputText: segmentTexts.join("\n\n"),
    optimizedText: segmentTexts.join("\n\n"),
    performanceMode: "balanced",
    progress: {
      ...job.progress,
      activeStage: "done",
      currentSegment: totalSegments,
      detail: "Audio generated with 1 segment needing audio review.",
      message: "Completed with audio review warnings",
      totalSegments,
    },
    qualityReport: {
      averageLatencyMs: 90,
      averageSimilarity: 0.91,
      enabled: true,
      preprocessChangedPct: 0,
      reason: "completed with 1 segment review warning(s); 1 segment(s) need audio review",
      referenceProfile: false,
      retryCount: 2,
      segmentCount: totalSegments,
      unverifiedSegmentCount: 1,
      warningCount: 1,
    },
    retries: {
      ...job.retries,
      currentSegment: totalSegments,
      segmentAttempts: Math.max(job.retries?.segmentAttempts ?? 0, totalSegments + 1),
      totalSegments,
    },
    retriable: false,
    selectedBlockIds,
    segments: Array.from({ length: totalSegments }).map((_, index) => ({
      attempts: index === warningIndex ? 2 : 1,
      index: index + 1,
      reason:
        index === warningIndex
          ? "ASR transcript did not sufficiently match and did not look like a clean cutoff"
          : "ok",
      similarity: index === warningIndex ? 0.42 : 0.97,
      status: "ready",
      text: segmentTexts[index] ?? `Segment ${String(index + 1)}`,
      warnings: index === warningIndex ? [warning] : [],
    })),
    stages: {
      ...job.stages,
      checker: "done",
      optimization: "done",
      synthesis: "done",
    },
    speechPolicyOverrides: {},
    speechPolicyProfile: "Enterprise",
    status: "completed",
    terminalReason: "",
    completedAt: auditFreshJobTimestamp(source),
    ttsVoice: "af_heart",
    ttsEngine: "auto",
    ttsLanguage: "a",
    updatedAt: auditFreshJobTimestamp(source),
    voiceId: "",
    voiceProfileId: "",
    runMode: "checkedMaster",
    voiceCheck: {
      ...job.voiceCheck,
      complete: true,
      needsResume: false,
      reason: "completed with 1 segment review warning(s); 1 segment(s) need audio review",
      similarity: 0.91,
    },
  };
}

function auditFreshJobTimestamp(source = null) {
  const sourceTime = Date.parse(source?.updatedAt ?? "");
  const base = Number.isFinite(sourceTime) ? sourceTime : Date.parse("2099-01-01T00:00:00Z");
  return new Date(base + 60_000).toISOString();
}

function auditScenarioVoiceJobId(baseId, scenarioId) {
  return `${baseId}-${scenarioId}`;
}

function auditWavDataUrl() {
  return `data:audio/wav;base64,${syntheticAuditWav().toString("base64")}`;
}

function syntheticAuditWav() {
  const sampleRate = 16_000;
  const durationSeconds = 1;
  const frameCount = sampleRate * durationSeconds;
  const dataSize = frameCount * 2;
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
  for (let index = 0; index < frameCount; index += 1) {
    const sample = Math.round(Math.sin((index / sampleRate) * 2 * Math.PI * 440) * 1200);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }
  return buffer;
}

function preparedSourceWithReviewWarningsForGenerationFixture(source) {
  return {
    ...cleanPreparedSourceForGenerationFailedFixture(source),
    blocks: (source.blocks ?? []).map((block, index) => ({
      ...block,
      confidence: index === 0 ? 0.62 : 1,
      warnings:
        index === 0 ? ["Verify pronunciation before final approval."] : (block.warnings ?? []),
    })),
  };
}

function cleanPreparedSourceForGenerationFailedFixture(source) {
  return {
    ...source,
    blocks: (source.blocks ?? []).map((block) => ({
      ...block,
      confidence: 1,
      normalisations: [],
      pronunciations: [],
      speakMode: "speak",
      speechPolicy: {
        ...block.speechPolicy,
        element: "spoken",
        explanation: "",
        mode: "speak",
      },
      warnings: [],
    })),
    sourceReadiness: {
      ...(source.sourceReadiness ?? {}),
      confirmedFields: ["title", "sourceType", "language", "structure"],
      detail: "Source metadata and structure are confirmed for Preview.",
      language: "en",
      preparedAt: auditFreshJobTimestamp(source),
      sourceType: "document",
      state: "ready",
      structureLabel: "Document",
      title: source.title ?? source.sourceName ?? "Website Fixture",
    },
    status: "ready",
    warnings: [],
  };
}

async function clickIfEnabledTestId(page, testId) {
  const control = page.getByTestId(testId).first();
  if (
    (await control.isVisible().catch(() => false)) &&
    (await control.isEnabled().catch(() => false))
  ) {
    await control.click();
  }
}

async function selectIfEnabledTestId(page, testId, value) {
  const control = page.getByTestId(testId).first();
  if (
    (await control.isVisible().catch(() => false)) &&
    (await control.isEnabled().catch(() => false))
  ) {
    await control.selectOption(value);
  }
}

async function openSettings(page) {
  await gotoApp(page);
  await page.getByRole("button", { exact: true, name: "Open settings" }).click();
  await page.getByText("Studio Settings").first().waitFor();
}

async function openSettingsGroup(page, groupLabel) {
  await openSettings(page);
  await page.getByRole("button", { name: new RegExp(`^${groupLabel}`) }).click();
  await page.getByText("Speech policy wizard").first().waitFor();
}

async function openSettingsUiMemory(page) {
  await openSettings(page);
  await page
    .getByRole("button", { name: /^Reader/ })
    .first()
    .click();
  await page.getByTestId("ui-memory-preferences").waitFor();
}

async function openCommandPalette(page) {
  await gotoApp(page);
  await page.getByTestId("ui-action-command-palette-open").first().click();
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
}

async function openProviderCapabilityCommandPalette(page) {
  await openCommandPalette(page);
  await page.locator("#command-palette-search").fill("word highlight");
  await page
    .getByRole("option", { name: /Use word highlight.*does not support word timing/i })
    .waitFor();
}

async function openProjectDashboard(page) {
  await openWorkspaceStage(page, "Review");
  await selectWorkspaceLayout(page, "Full");
  await page.getByTestId("ui-action-project-dashboard-open-rail").click();
  await page.getByRole("dialog", { name: "Command Center" }).waitFor();
}

async function openCommandCenterTemporaryWork(page) {
  await installTemporarySourceFixtureRoutes(page);
  await openProjectDashboard(page);
  await page.getByTestId("ui-action-command-center-section-temporary").click();
  await page.getByTestId("temporary-source-card-temp-article").waitFor({ state: "visible" });
}

async function openQuickListenTemporaryRecent(page) {
  await installTemporarySourceFixtureRoutes(page);
  await gotoApp(page);
  await page.getByTestId("ui-action-quick-listen-open").filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Listen" });
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Recent" }).click();
  await page.getByTestId("quick-listen-temporary-source-temp-article").waitFor({
    state: "visible",
  });
}

async function openVoiceDashboard(page) {
  await openWorkspaceStage(page, "Review");
  await selectWorkspaceLayout(page, "Full");
  await page.getByTestId("ui-action-voice-dashboard-open-rail").click();
  await page.getByRole("dialog", { name: "Command Center" }).waitFor();
}

async function openPreviewMiniPlayer(page) {
  await openWorkspaceStage(page, "Preview");
  if (
    !(await page
      .getByTestId("global-preview-player")
      .isVisible()
      .catch(() => false)) &&
    !(await page
      .getByTestId("ui-action-preview-local-play")
      .isVisible()
      .catch(() => false)) &&
    (await isEnabledTestId(page, "workspace-stage-action-createAndListen"))
  ) {
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/voice-jobs") && response.request().method() === "POST",
    );
    await page.getByTestId("workspace-stage-action-createAndListen").click();
    const response = await createResponse;
    assert(response.ok(), `Create & Listen failed with ${String(response.status())}`);
    const createdJob = await response.json();
    if (createdJob?.id) {
      await waitForJob(createdJob.id);
    }
  }
  await waitForAnyVisibleTestId(page, ["global-preview-player", "ui-action-preview-local-play"]);
  await clickPreviewMiniPlayerIfReady(page);
}

async function openMobileMoreSheet(page, scope) {
  await openBookCinemaOverlay(page, scope);
  const overlay = cinemaOverlay(page);
  await overlay.getByRole("button", { exact: true, name: "More" }).first().click();
  const sheet = page
    .locator("[data-cinema-mobile-sheet], [role='dialog']")
    .filter({ hasText: /Focus|Settings|Source|More/i })
    .first();
  await sheet.waitFor();
  await assertMobileMoreSheet(overlay, sheet);
}

async function assertMobileMoreSheet(overlay, sheet) {
  const report = await sheet.evaluate((sheetElement) => {
    const visibleControls = [...sheetElement.querySelectorAll("button, select, [role='button']")]
      .filter((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((control) =>
        String(control.getAttribute("aria-label") || control.textContent || "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    const tabLabels = [...sheetElement.querySelectorAll("button")]
      .map((button) =>
        String(button.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    return {
      hasDisplayControls:
        sheetElement.querySelector("[data-cinema-mobile-display-controls]") !== null,
      tabLabels,
      visibleControls,
    };
  });
  const footerVisible = await overlay
    .locator("[data-cinema-transport-footer]")
    .evaluate((footer) => {
      const rect = footer.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && footer.offsetParent !== null;
    });
  const primaryControlsVisible = await overlay
    .locator("[data-cinema-primary-playback-group] button")
    .evaluateAll((controls) =>
      controls.some((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && control.offsetParent !== null;
      }),
    );
  const failures = [];
  if (report.visibleControls.length === 0) {
    failures.push("Mobile More sheet opened without visible actions.");
  }
  for (const expected of ["Source", "Structure", "Narration"]) {
    if (!report.tabLabels.some((label) => label.includes(expected))) {
      failures.push(`Mobile More sheet is missing ${expected}.`);
    }
  }
  if (!report.hasDisplayControls) {
    failures.push("Mobile More sheet did not preserve display controls.");
  }
  if (!footerVisible || !primaryControlsVisible) {
    failures.push("Mobile More sheet hid the Cinema transport controls.");
  }
  if (failures.length > 0) {
    throw new Error(failures.join(" "));
  }
}

async function openTeleprompt(page) {
  await openWorkspaceStage(page, "Preview");
  await waitForEnabledTestId(page, "workspace-stage-action-openTeleprompt");
  await page.getByTestId("workspace-stage-action-openTeleprompt").click();
  await page.getByText("Teleprompt Studio").first().waitFor();
  await page.getByTestId("ui-action-teleprompt-open-cinema").waitFor({ state: "visible" });
  await page.getByTestId("ui-action-teleprompt-enter-theatre").waitFor({ state: "visible" });
  await page.getByTestId("ui-action-teleprompt-local-previous-cue").waitFor({ state: "visible" });
  await page.getByTestId("teleprompt-status-message").waitFor({ state: "visible" });
}

async function openTelepromptTheatre(page) {
  await openTeleprompt(page);
  await page.getByTestId("ui-action-teleprompt-enter-theatre").click();
  const theatre = page.getByTestId("teleprompt-theatre");
  await theatre.waitFor();
  await theatre.hover();
  const backToPreview = page.getByTestId("ui-action-teleprompt-theatre-back-preview");
  if (!(await backToPreview.isVisible().catch(() => false))) {
    await page.getByTestId("ui-action-teleprompt-theatre-toggle-controls").click();
  }
  await backToPreview.waitFor({ state: "visible" });
}

async function waitForEnabledTestId(page, testId) {
  await page.getByTestId(testId).waitFor({ state: "visible" });
  await page.waitForFunction(
    (id) => {
      const element = document.querySelector(`[data-testid="${CSS.escape(id)}"]`);
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      if (
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        return !element.disabled;
      }
      return element.getAttribute("aria-disabled") !== "true";
    },
    testId,
    { timeout: 15_000 },
  );
}

async function waitForAnyVisibleTestId(page, testIds, timeout = 15_000) {
  await page.waitForFunction(
    (ids) =>
      ids.some((id) => {
        const element = document.querySelector(`[data-testid="${CSS.escape(id)}"]`);
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      }),
    testIds,
    { timeout },
  );
}

async function isEnabledTestId(page, testId) {
  return page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${CSS.escape(id)}"]`);
    if (!(element instanceof HTMLElement)) {
      return false;
    }
    if (
      element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return !element.disabled;
    }
    return element.getAttribute("aria-disabled") !== "true";
  }, testId);
}

async function openBookPanel(page, scope) {
  await gotoApp(page);
  await openWorkspaceIntakeStage(page);
  await openIntakeDestination(page);
  await page.getByTestId("intake-wizard-open-book-cinema").waitFor();
  await selectBookScope(page, scope);
}

async function openBookCinemaOverlay(page, scope) {
  await openBookPanel(page, scope);
  await page.getByTestId("intake-wizard-open-book-cinema").click();
  await cinemaOverlay(page).waitFor({ state: "visible" });
}

async function openBookCinemaMoreMenu(page, scope) {
  await openBookCinemaOverlay(page, scope);
  const overlay = cinemaOverlay(page);
  await openCinemaMoreMenu(page, overlay);
  await assertCinemaMoreMenu(page, overlay, "BookCinema");
}

async function openPreparedCinemaMoreMenu(page, expectedLabel, surface) {
  await openPreparedCinemaOverlay(page, expectedLabel);
  const overlay = cinemaOverlay(page);
  await openCinemaMoreMenu(page, overlay);
  await assertCinemaMoreMenu(page, overlay, surface);
}

async function openCinemaMoreMenu(page, overlay) {
  await overlay
    .getByRole("button", {
      name: /^(Open Cinema More menu|Cinema More menu\. Active operator mode: Diagnostics|Diagnostics)$/,
    })
    .click();
  await overlay.locator("#cinema-more-menu").waitFor();
  await page.waitForTimeout(100);
}

async function assertCinemaMoreMenu(page, overlay, surface) {
  const budget = CINEMA_MORE_ACTION_BUDGETS.get(surface) ?? { max: 10, min: 1 };
  const report = await overlay.locator("#cinema-more-menu").evaluate(
    (menu, context) => {
      const normalize = (value) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();
      const menuRoot = menu;
      const actions = [...menuRoot.querySelectorAll("[data-cinema-more-action-id]")].map(
        (action) => {
          const label = normalize(action.getAttribute("aria-label") || action.textContent);
          return {
            commandId: action.getAttribute("data-command-id") ?? "",
            disabled:
              action.matches(":disabled") ||
              action.getAttribute("aria-disabled") === "true" ||
              action.getAttribute("disabled") !== null,
            disabledReason:
              action.getAttribute("data-cinema-more-disabled-reason") ??
              action.getAttribute("data-disabled-reason") ??
              "",
            id: action.getAttribute("data-cinema-more-action-id") ?? "",
            kind: action.getAttribute("data-cinema-more-action-kind") ?? "",
            label,
            owner: action.getAttribute("data-ui-action-owner") ?? "",
            primaryProxy: action.getAttribute("data-cinema-more-primary-proxy") ?? "",
            role: action.getAttribute("role") ?? "",
            section: action.getAttribute("data-cinema-more-section-id") ?? "",
            shortcutHint: action.getAttribute("data-cinema-more-shortcut-hint") ?? "",
          };
        },
      );
      const sections = [...menu.querySelectorAll("[data-cinema-more-section]")].map(
        (section) => section.getAttribute("data-cinema-more-section") ?? "",
      );
      const primaryCandidates =
        menuRoot
          .closest("[role='dialog']")
          ?.querySelectorAll(
            "[data-cinema-mode-control-group] button, [data-cinema-primary-playback-group] button, [data-testid='ui-action-cinema-display-settings']",
          ) ?? [];
      const visiblePrimaryLabels = [
        ...new Set(
          [...primaryCandidates]
            .filter((control) => !menuRoot.contains(control) && control.offsetParent !== null)
            .map((control) => normalize(control.getAttribute("aria-label") || control.textContent)),
        ),
      ];
      const visiblePrimarySet = new Set(visiblePrimaryLabels);
      const expectedPrimarySet = new Set(context.primaryLabels);
      const expectedCommandIds = new Map([
        ["open-inspector", "cinema:source:inspector"],
        ["source-details", "cinema:source:details"],
        ["create-audio", "cinema:audio:create"],
        ["retry-audio", "cinema:audio:retry"],
        ["reader-settings", "settings:field:readerPreferences"],
        ["theatre-mode", "cinema:theatre:open"],
        ["return-review", "cinema:workflow:return-review"],
        ["return-preview", "cinema:workflow:return-preview"],
        ["keep-temporary-source", "cinema:temporary:keep"],
        ["discard-temporary-source", "cinema:temporary:discard"],
        ["policy-internals", "cinema:advanced:policy-internals"],
        ["source-internals", "cinema:advanced:source-internals"],
        ["diagnostics", "cinema:advanced:diagnostics"],
        ["timing-map", "cinema:advanced:timing-map"],
        ["alignment-repair", "cinema:advanced:alignment-repair"],
        ["command-palette", "command.palette"],
        ["keyboard-shortcuts", "shortcuts:open"],
        ["help-guide", "help:open"],
      ]);
      return {
        actionCount: actions.length,
        commandMismatches: actions.filter((action) => {
          const expected = expectedCommandIds.get(action.id);
          if (!expected) {
            return false;
          }
          return action.commandId !== expected;
        }),
        emptySections: sections.filter(
          (section) => !actions.some((action) => action.section === section),
        ),
        duplicatePrimaryControls: actions.filter(
          (action) =>
            !action.primaryProxy &&
            expectedPrimarySet.has(action.label) &&
            visiblePrimarySet.has(action.label),
        ),
        helpActionsMissingShortcuts: actions.filter(
          (action) => action.section === "help-shortcuts" && !action.shortcutHint,
        ),
        missingAdvancedModeIds: actions.filter(
          (action) => (action.kind === "advanced" || action.kind === "diagnostics") && !action.id,
        ),
        missingDisabledReasons: actions.filter(
          (action) => action.disabled && !action.disabledReason,
        ),
        missingLabels: actions.filter((action) => !action.label),
        missingOwners: actions.filter((action) => !action.owner),
        sections,
        visiblePrimaryLabels,
      };
    },
    {
      primaryLabels: [...CINEMA_MORE_PRIMARY_LABELS],
    },
  );
  const failures = [];
  if (report.actionCount === 0) {
    failures.push("Cinema More opened an empty menu.");
  }
  if (report.actionCount < budget.min || report.actionCount > budget.max) {
    failures.push(
      `Cinema More on ${surface} exposed ${String(report.actionCount)} actions outside budget ${String(
        budget.min,
      )}-${String(budget.max)}.`,
    );
  }
  for (const section of CINEMA_MORE_REQUIRED_SECTIONS) {
    if (!report.sections.includes(section)) {
      failures.push(`Cinema More menu did not expose the ${section} section.`);
    }
  }
  if (report.emptySections.length > 0) {
    failures.push(`Cinema More empty sections: ${report.emptySections.join(", ")}.`);
  }
  if (report.missingOwners.length > 0) {
    failures.push(
      `Cinema More actions missing owners: ${report.missingOwners
        .map((action) => action.id || action.role)
        .join(", ")}.`,
    );
  }
  if (report.missingLabels.length > 0) {
    failures.push("Cinema More contains actions without readable labels.");
  }
  if (report.missingDisabledReasons.length > 0) {
    failures.push(
      `Cinema More disabled actions missing reasons: ${report.missingDisabledReasons
        .map((action) => action.id || action.label)
        .join(", ")}.`,
    );
  }
  if (report.helpActionsMissingShortcuts.length > 0) {
    failures.push(
      `Cinema More help actions missing shortcut hints: ${report.helpActionsMissingShortcuts
        .map((action) => action.id || action.label)
        .join(", ")}.`,
    );
  }
  if (report.duplicatePrimaryControls.length > 0) {
    failures.push(
      `Cinema More duplicates nearby primary controls without proxy metadata: ${report.duplicatePrimaryControls
        .map((action) => action.label)
        .join(", ")}.`,
    );
  }
  if (report.commandMismatches.length > 0) {
    failures.push(
      `Cinema More command mismatches: ${report.commandMismatches
        .map((action) => `${action.id}:${action.commandId}`)
        .join(", ")}.`,
    );
  }
  if (report.missingAdvancedModeIds.length > 0) {
    failures.push("Cinema More advanced action exists without an advanced mode id.");
  }
  await overlay.locator("#cinema-more-menu [role^='menuitem']").first().focus();
  await page.keyboard.press("Escape");
  await overlay.locator("#cinema-more-menu").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("data-testid") === "ui-action-cinema-more-menu",
    null,
    { timeout: 5000 },
  );
  const activeTestId = await page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? "",
  );
  if (activeTestId !== "ui-action-cinema-more-menu") {
    failures.push("Cinema More did not return focus to the trigger after Escape.");
  }
  await overlay.getByTestId("ui-action-cinema-more-menu").press("ArrowDown");
  await overlay.locator("#cinema-more-menu").waitFor();
  await page.waitForFunction(
    () => Boolean(document.activeElement?.getAttribute("data-cinema-more-action-id")),
    null,
    { timeout: 5000 },
  );
  const focusedAction = await page.evaluate(
    () => document.activeElement?.getAttribute("data-cinema-more-action-id") ?? "",
  );
  if (!focusedAction) {
    failures.push("Cinema More keyboard activation did not move focus into the menu.");
  }
  if (failures.length > 0) {
    throw new Error(failures.join(" "));
  }
}

async function openPinnedInspector(page, scope) {
  await openBookCinemaOverlay(page, scope);
  const overlay = cinemaOverlay(page);
  await overlay.getByRole("button", { exact: true, name: "Inspect" }).click();
  await clickContextPanelTab(overlay, /Overview|Source/);
  const pin = overlay.getByRole("button", { exact: true, name: "Pin" }).first();
  if (await pin.isVisible().catch(() => false)) {
    await pin.click();
  }
  await overlay.getByRole("button", { exact: true, name: "Read" }).click();
}

async function clickContextPanelTab(overlay, name) {
  const tab = overlay.getByRole("tab", { name }).first();
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await overlay.getByRole("button", { name }).first().click();
}

async function openPreparedCinemaOverlay(page, expectedLabel) {
  await gotoApp(page);
  await openWorkspaceIntakeStage(page);
  await openIntakeDestination(page);
  await page
    .getByRole("button", { name: new RegExp(`Open ${escapeRegex(expectedLabel)}`) })
    .first()
    .click();
  await cinemaOverlay(page).getByText(expectedLabel).first().waitFor();
}

async function openWorkspaceIntakeStage(page) {
  const guidedIntake = page.getByText("Guided Intake").first();
  if (!(await guidedIntake.isVisible().catch(() => false))) {
    const intakeStageButton = page.getByTestId("workspace-stage-intake");
    if (await intakeStageButton.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await intakeStageButton.click();
    } else {
      const exactIntakeButton = page.getByRole("button", { exact: true, name: "Intake" }).first();
      if (await exactIntakeButton.isVisible({ timeout: 15_000 }).catch(() => false)) {
        await exactIntakeButton.click();
      } else {
        await page
          .getByRole("button", { name: /^Intake\b/ })
          .first()
          .click();
      }
    }
  }
  await guidedIntake.waitFor();
}

async function openIntakeDestination(page) {
  await page.getByText("Guided Intake").first().waitFor();
  await page.getByTestId("intake-step-destination").click();
}

async function gotoApp(page) {
  await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByText("Voice Studio").first().waitFor({ state: "visible", timeout: 120_000 });
}

function cinemaOverlay(page) {
  return page
    .locator(
      '[role="dialog"][aria-labelledby="book-cinema-title"], [role="dialog"][aria-labelledby="prepared-source-cinema-title"]',
    )
    .first();
}

async function selectBookScope(page, scope) {
  const key = scopeKey(scope);
  const select = page.locator(`select:has(option[value="${key}"])`).first();
  await select.waitFor({ state: "visible", timeout: 15_000 });
  await select.selectOption(key);
}

async function ensureFixtures() {
  const manifest = JSON.parse(
    await readFile(path.join(rootDir, "benches", "fixtures.json"), "utf8"),
  );
  const generatedDir = path.join(rootDir, manifest.e2e.generatedDir);
  await mkdir(generatedDir, { recursive: true });
  const markdown = path.join(rootDir, manifest.e2e.markdown);
  const pdf = path.join(rootDir, manifest.e2e.pdf);
  await assertFile(markdown, "Markdown UI action audit fixture");
  await assertFile(pdf, "PDF UI action audit fixture");
  const epub = path.join(generatedDir, "ui-action-audit.epub");
  const docx = path.join(generatedDir, "ui-action-audit.docx");
  await writeSyntheticEPUB(epub);
  await writeSyntheticDOCX(docx);
  return { docx, epub, markdown, pdf };
}

async function writeSyntheticEPUB(filePath) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" /></rootfiles></container>',
  );
  zip.file(
    "EPUB/package.opf",
    '<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Iota EPUB Fixture</dc:title><dc:creator>UI Action Audit</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" /><item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml" /></manifest><spine><itemref idref="chapter1" /></spine></package>',
  );
  zip.file(
    "EPUB/nav.xhtml",
    '<html><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Chapter One</a></li></ol></nav></body></html>',
  );
  zip.file(
    "EPUB/chapter1.xhtml",
    '<html lang="en"><head><title>Chapter One</title></head><body><h1>Chapter One</h1><p>The UI action audit reads this compact EPUB chapter aloud. It has enough clean prose for transport controls, bookmark controls, and inspector panels.</p><p>The second paragraph keeps the reader stage populated after seeking forward and returning to review.</p></body></html>',
  );
  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writeSyntheticDOCX(filePath) {
  const zip = new JSZip();
  zip.file(
    "docProps/core.xml",
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Iota DOCX Fixture</dc:title><dc:creator>UI Action Audit</dc:creator></cp:coreProperties>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p><w:p><w:r><w:t>The UI action audit reads this compact DOCX file aloud. It proves the Word adapter can feed Book Cinema from a generated fixture.</w:t></w:r></w:p><w:p><w:r><w:t>A final paragraph leaves enough words for playback, seeking, and resume controls.</w:t></w:r></w:p></w:body></w:document>',
  );
  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function startLocalServices() {
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const runtimeDir = path.join(outputDir, "runtime");
  await rm(runtimeDir, { recursive: true, force: true });
  await mkdir(runtimeDir, { recursive: true });
  const backendLog = path.join(outputDir, "backend.log");
  const frontendLog = path.join(outputDir, "frontend.log");
  const backendEnv = {
    ALIGNMENT_ENABLED: "0",
    BACKEND_PORT: String(backendPort),
    BONSAI_PRELOAD: "0",
    FRONTEND_PORT: String(frontendPort),
    LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE: "0",
    QWEN_ASR_PRELOAD: "0",
    TTS_PROVIDER: "mock",
    VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR: "0",
    VOICE_BOOK_SOURCE_DATA_DIR: path.join(runtimeDir, "book-sources"),
    VOICE_CHECKER_PROVIDER: "mock",
    VOICE_JOB_DATA_DIR: path.join(runtimeDir, "jobs"),
    VOICE_OPTIMIZER_PROVIDER: "rules",
    VOICE_PLAYBACK_SESSION_DATA_DIR: path.join(runtimeDir, "playback-sessions"),
    VOICE_PROFILE_DATA_DIR: path.join(runtimeDir, "voice-profiles"),
    VOICE_PROFILE_SOURCE_DATA_DIR: path.join(runtimeDir, "voice-profile-sources"),
    VOICE_PROGRESS_DATA_DIR: path.join(runtimeDir, "progress"),
    VOICE_PROJECT_DATA_DIR: path.join(runtimeDir, "projects"),
    VOICE_SOURCE_PREP_DATA_DIR: path.join(runtimeDir, "source-preps"),
    VOICE_SOURCE_URL_ALLOW_PRIVATE: "1",
  };
  const frontendEnv = {
    BACKEND_PORT: String(backendPort),
    FRONTEND_PORT: String(frontendPort),
    VITE_API_BASE_URL: `http://127.0.0.1:${String(backendPort)}`,
  };

  const backend = spawnLogged("go", ["run", "./cmd/api"], {
    cwd: path.join(rootDir, "backend"),
    env: backendEnv,
    logPath: backendLog,
  });
  const frontend = spawnLogged(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"],
    {
      cwd: path.join(rootDir, "frontend"),
      env: frontendEnv,
      logPath: frontendLog,
    },
  );

  const service = {
    backendLog,
    frontendLog,
    apiBaseUrl: `http://127.0.0.1:${String(backendPort)}`,
    appBaseUrl: `http://127.0.0.1:${String(frontendPort)}`,
    stop: async () => {
      await Promise.allSettled([stopProcess(frontend), stopProcess(backend)]);
    },
  };
  try {
    await waitForHTTP(`${service.apiBaseUrl}/api/projects`, "backend");
    await waitForHTTP(service.appBaseUrl, "frontend");
  } catch (error) {
    await service.stop();
    throw error;
  }
  return service;
}

function spawnLogged(command, args, { cwd, env, logPath }) {
  const stream = createWriteStream(logPath, { flags: "a" });
  stream.write(`$ ${command} ${args.join(" ")}\n\n`);
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => stream.write(chunk));
  child.stderr.on("data", (chunk) => stream.write(chunk));
  child.once("close", (code) => {
    stream.write(`\n[process exited ${String(code)}]\n`);
    stream.end();
  });
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    child.kill("SIGTERM");
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  await Promise.race([onceClose(child), sleep(5000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function onceClose(child) {
  return new Promise((resolve) => {
    child.once("close", resolve);
  });
}

async function waitForHTTP(url, label) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until the local service is listening.
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Unable to allocate a local port."));
        }
      });
    });
  });
}

async function startWebsiteFixtureServer() {
  const html = `<!doctype html>
<html lang="en">
  <head><title>Website Cinema UI Action Fixture</title></head>
  <body>
    <header><nav>Home Features Search Instagram Subscribe</nav></header>
    <main>
      <article class="article-body">
        <h1>Website Cinema UI Action Fixture</h1>
        <p>This local website article gives the action audit a stable source.</p>
        <h2>Readable Section</h2>
        <p>Bookmarks, review panels, generated audio diagnostics, and source provenance should remain discoverable.</p>
        <aside class="newsletter">Navigation, adverts, and boilerplate should be easy to inspect but quiet in read mode.</aside>
        <p>The final article paragraph confirms Website Cinema starts with article body text.</p>
      </article>
    </main>
    <footer>Facebook Instagram Privacy Terms</footer>
  </body>
</html>`;
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Unable to start website fixture server.");
  return {
    stop: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
    url: `http://127.0.0.1:${String(address.port)}/fixture.html`,
  };
}

async function uploadBook(projectId, filePath) {
  const bytes = await readFile(filePath);
  const body = new FormData();
  body.set("file", new Blob([bytes]), path.basename(filePath));
  const book = await apiJson(`/api/projects/${projectId}/book-sources`, {
    body,
    method: "POST",
  });
  assert(book.status === "ready", `${path.basename(filePath)} source is not ready: ${book.status}`);
  return book;
}

async function confirmBookSourceReadinessForAudit(book, scope, fallbackTitle) {
  return apiJson(`/api/book-sources/${book.id}/readiness/confirm`, {
    body: JSON.stringify({
      language: "en",
      sourceType: "book",
      speechPolicyProfile: "balanced",
      structureLabel: scopeLabel(scope),
      title: book.title ?? fallbackTitle,
      voiceProfileId: "default",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function uploadPreparedSource(projectId, filePath) {
  const bytes = await readFile(filePath);
  const body = new FormData();
  body.set("file", new Blob([bytes], { type: "text/markdown" }), path.basename(filePath));
  const source = await apiJson(`/api/projects/${projectId}/source-preps`, {
    body,
    method: "POST",
  });
  assert(source.status === "ready", `Prepared source is not ready: ${source.status}`);
  return source;
}

async function confirmPreparedSourceReadinessForAudit(source, fallbackTitle) {
  return apiJson(`/api/source-preps/${source.id}/readiness/confirm`, {
    body: JSON.stringify({
      language: "en",
      sourceType: "document",
      speechPolicyProfile: "balanced",
      structureLabel: "Document",
      title: source.title ?? fallbackTitle,
      voiceProfileId: "default",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function createBookNarrationJob(projectId, bookSourceId, bookScope) {
  return apiJson(`/api/book-sources/${bookSourceId}/voice-jobs`, {
    body: JSON.stringify({
      bookScope,
      bookSourceId,
      performanceMode: "throughput",
      pipelineOptions: {
        arrivalPlayback: true,
        asrCheck: false,
        autoRetry: false,
        qualityReport: false,
        textPreprocess: false,
        voiceClone: false,
      },
      projectId,
      runMode: "draftPreview",
      text: "",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function createPreparedNarrationJob(
  projectId,
  preparedSourceId,
  selectedBlockIds,
  sourceKind = "file",
) {
  return apiJson(`/api/source-preps/${preparedSourceId}/voice-jobs`, {
    body: JSON.stringify({
      performanceMode: "throughput",
      pipelineOptions: {
        arrivalPlayback: true,
        asrCheck: false,
        autoRetry: false,
        qualityReport: false,
        textPreprocess: false,
        voiceClone: false,
      },
      preparedSourceId,
      progressTargetId: `prepared:${preparedSourceId}`,
      projectId,
      runMode: "draftPreview",
      selectedBlockIds,
      sourceKind,
      text: "",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  try {
    while (Date.now() - startedAt < jobTimeoutMs) {
      const job = await apiJson(`/api/voice-jobs/${jobId}`);
      if (job.status === "completed") {
        return job;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(`Job ${jobId} ended as ${job.status}: ${job.error ?? "no error"}`);
      }
      await sleep(500);
    }
    throw new Error(`Timed out waiting for job ${jobId}`);
  } finally {
    if (runSummary) {
      const waitMs = Math.max(0, Date.now() - startedAt);
      const phaseTimings = runSummary.phaseTimings ?? {};
      runSummary.phaseTimings = {
        ...phaseTimings,
        jobWaitMs: (phaseTimings.jobWaitMs ?? 0) + waitMs,
      };
    }
  }
}

async function scopeText(bookSourceId, scope) {
  const content = await apiJson(`/api/book-sources/${bookSourceId}/scope?${scopeQuery(scope)}`);
  assert(content.text?.trim(), "Selected book scope has no text.");
  return content.text;
}

function selectedPreparedBlockIds(source) {
  const ids = (source.blocks ?? [])
    .filter((block) => block.speakMode !== "skip")
    .slice(0, 3)
    .map((block) => block.id);
  assert(ids.length > 0, "Prepared source has no narratable blocks.");
  return ids;
}

function pickNarrationScope(book) {
  const section =
    book.sections?.find((item) => item.isNarratable && (item.wordCount ?? 0) >= 8) ??
    book.sections?.find((item) => item.isNarratable);
  if (section) {
    return scopeFromSection(section);
  }
  const chapter =
    book.chapters?.find((item) => (item.wordCount ?? wordCount(item.text ?? "")) >= 8) ??
    book.chapters?.[0];
  if (chapter) {
    return {
      chapterIndex: chapter.index,
      label: chapter.title || `Chapter ${String(chapter.index)}`,
      type: "chapter",
    };
  }
  const page = book.pages?.find((item) => (item.wordCount ?? 0) >= 8) ?? book.pages?.[0];
  if (page) {
    return {
      label: `Page ${String(page.index)}`,
      pageEnd: page.index,
      pageStart: page.index,
      type: "pages",
    };
  }
  return { label: "Full book", type: "book" };
}

function scopeFromSection(section) {
  if (section.kind === "pages" || (section.pageStart && section.pageEnd && !section.chapterIndex)) {
    return {
      label: section.title,
      pageEnd: section.pageEnd ?? section.pageStart ?? 1,
      pageStart: section.pageStart ?? 1,
      type: "pages",
    };
  }
  return {
    chapterIndex: section.chapterIndex ?? section.index + 1,
    label: section.title,
    type: "chapter",
  };
}

function projectStorageState(projectId, projectState, extraLocalStorage = {}) {
  return {
    cookies: [],
    origins: [
      {
        localStorage: [
          { name: activeProjectKey, value: projectId },
          {
            name: `tts-project-state:${projectId}`,
            value: JSON.stringify({ ...projectState, updatedAt: new Date().toISOString() }),
          },
          ...Object.entries(extraLocalStorage).map(([name, value]) => ({ name, value })),
        ],
        origin: new URL(appBaseUrl).origin,
      },
    ],
  };
}

async function apiJson(pathname, init = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} failed: ${await response.text()}`);
  }
  return response.json();
}

async function assertServerReady() {
  await apiJson("/api/projects");
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `Playwright is required. Run pnpm install before this audit.\n${String(error)}`,
    );
  }
}

async function assertFile(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function scopeQuery(scope) {
  const query = new URLSearchParams();
  query.set("type", scope.type);
  if (scope.chapterIndex !== undefined) {
    query.set("chapterIndex", String(scope.chapterIndex));
  }
  if (scope.pageStart !== undefined) {
    query.set("pageStart", String(scope.pageStart));
  }
  if (scope.pageEnd !== undefined) {
    query.set("pageEnd", String(scope.pageEnd));
  }
  if (scope.label) {
    query.set("label", scope.label);
  }
  return query.toString();
}

function scopeKey(scope) {
  if (!scope) {
    return "book";
  }
  if (scope.type === "chapter") {
    return `chapter:${String(scope.chapterIndex ?? 1)}`;
  }
  if (scope.type === "pages") {
    return `pages:${String(scope.pageStart ?? 1)}-${String(scope.pageEnd ?? scope.pageStart ?? 1)}`;
  }
  return "book";
}

function scopeLabel(scope) {
  if (!scope) {
    return "Full book";
  }
  if (scope.label) {
    return scope.label;
  }
  if (scope.type === "chapter") {
    return `Chapter ${String(scope.chapterIndex ?? 1)}`;
  }
  if (scope.type === "pages") {
    const pageStart = String(scope.pageStart ?? 1);
    const pageEnd = String(scope.pageEnd ?? scope.pageStart ?? 1);
    return pageStart === pageEnd ? `Page ${pageStart}` : `Pages ${pageStart}-${pageEnd}`;
  }
  return "Full book";
}

function collectPageIssues(page) {
  const issues = [];
  const issueSet = new Set();
  const addIssue = (issue) => {
    if (issueSet.has(issue)) {
      return;
    }
    issueSet.add(issue);
    issues.push(issue);
  };
  void page
    .context()
    .newCDPSession(page)
    .then(async (client) => {
      await client.send("Runtime.enable");
      client.on("Runtime.consoleAPICalled", (event) => {
        const text = event.args.map((argument) => argument.value ?? "").join(" ");
        if (!/Maximum update depth exceeded/i.test(text)) {
          return;
        }
        const frames = event.stackTrace?.callFrames ?? [];
        const appFrames = frames.filter(
          (frame) =>
            frame.url.includes("/src/") ||
            frame.url.includes("/frontend/src/") ||
            frame.url.includes("/scripts/"),
        );
        const stackFrames = (appFrames.length > 0 ? appFrames : frames)
          .slice(0, 8)
          .map(
            (frame) =>
              `${frame.functionName || "<anonymous>"} (${frame.url}:${String(
                frame.lineNumber + 1,
              )}:${String(frame.columnNumber + 1)})`,
          );
        if (stackFrames.length > 0) {
          addIssue(`react-update-depth-stack:\n${stackFrames.join("\n")}`);
        }
      });
    })
    .catch(() => {});
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      const location = message.location();
      const locationSuffix =
        location.url && location.lineNumber > 0
          ? ` (${location.url}:${String(location.lineNumber)}:${String(location.columnNumber)})`
          : "";
      const text = `${message.text()}${locationSuffix}`;
      if (/^Failed to load resource:/i.test(text)) {
        return;
      }
      addIssue(`${message.type()}: ${text}`);
      if (/Maximum update depth exceeded/i.test(text)) {
        void Promise.all(message.args().map((argument) => argument.jsonValue().catch(() => null)))
          .then((values) => {
            const details = values
              .filter((value) => typeof value === "string" && value.trim())
              .map((value) => value.trim())
              .filter((value) => value !== message.text());
            for (const detail of details) {
              addIssue(`react-update-depth-detail: ${detail}`);
            }
          })
          .catch(() => {});
      }
    }
  });
  page.on("pageerror", (error) => {
    addIssue(`pageerror: ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      if (response.headers()["x-e2e-expected-error"] === "preview-audition-404") {
        return;
      }
      addIssue(`response ${String(response.status())}: ${response.url()}`);
    }
  });
  return issues;
}

async function assertNoPageIssues(issues) {
  const unexpected = await pageIssuesForReport(issues);
  assert(unexpected.length === 0, `Unexpected browser issues:\n${unexpected.join("\n")}`);
}

async function pageIssuesForReport(issues) {
  return issues.filter(
    (issue) => !/favicon|React DevTools|\/api\/voice-jobs\/[^/]+\/audio$/i.test(issue),
  );
}

function summarizeInventory(actions) {
  const stableIdCoverageBySurface = Object.fromEntries(
    [...new Set(actions.map((action) => action.surface))].map((surface) => {
      const surfaceActions = actions.filter((action) => action.surface === surface);
      return [surface, stableIdCoverageSummary(surfaceActions)];
    }),
  );
  return {
    advancedOperatorControls: actions.filter((action) => action.operatorAdvanced).length,
    capabilityGatedDisabled: actions.filter((action) => action.disabled && action.capabilityGated)
      .length,
    debugOperatorControls: actions.filter(
      (action) => action.operatorAdvanced && action.advancedModeId,
    ).length,
    destructive: actions.filter((action) => action.destructive).length,
    disabled: actions.filter((action) => action.disabled).length,
    explicitStableTestIds: actions.filter((action) => action.stableIdKind === "explicit-testid")
      .length,
    explicitStableActionIds: actions.filter(
      (action) => action.stableIdKind === "explicit-action-id",
    ).length,
    generatedStableActionIds: actions.filter((action) => action.stableIdKind === "generated-stable")
      .length,
    generatedUnstableActionIds: actions.filter(
      (action) => action.stableIdKind === "generated-unstable",
    ).length,
    missingStableTestIds: actions.filter((action) => !hasStableActionId(action)).length,
    stableIdCoverageBySurface,
    surfaces: Object.fromEntries(
      [...new Set(actions.map((action) => action.surface))].map((surface) => [
        surface,
        actions.filter((action) => action.surface === surface).length,
      ]),
    ),
    total: actions.length,
  };
}

function stableIdCoverageSummary(actions) {
  return {
    explicitActionId: actions.filter((action) => action.stableIdKind === "explicit-action-id")
      .length,
    explicitTestId: actions.filter((action) => action.stableIdKind === "explicit-testid").length,
    generatedStable: actions.filter((action) => action.stableIdKind === "generated-stable").length,
    generatedUnstable: actions.filter((action) => action.stableIdKind === "generated-unstable")
      .length,
    missingStableActionId: actions.filter((action) => !hasStableActionId(action)).length,
    total: actions.length,
  };
}

function hasStableActionId(action) {
  return action.hasStableActionId ?? action.hasStableTestId;
}

function summarizeResults(results) {
  return {
    failed: results.filter((result) => result.passed === false).length,
    passed: results.filter((result) => result.passed === true).length,
    skipped: results.filter((result) => result.status === "skipped").length,
    total: results.length,
  };
}

function summarizeGateFindings({
  actions,
  duplicates,
  providerProfile: activeProviderProfile = null,
  requireAllSurfaces = true,
  results,
  scenarios,
  surfaceComplexity = [],
}) {
  const classifiedDuplicates = classifyDuplicateGroups(duplicates);
  const duplicateClassification = summarizeDuplicateClassifications(classifiedDuplicates);
  const duplicateGroupsByCategory = (category) =>
    classifiedDuplicates.filter((duplicate) => duplicate.classification?.category === category);
  const requiredSurfaces = [
    "Workspace",
    "Intake",
    "Review",
    "Preview",
    "Teleprompt",
    "Book Cinema",
    "Document Cinema",
    "Website Cinema",
    "Settings",
    "Command Palette",
    "Command Center",
    "Voice Dashboard",
    "UI Memory",
  ];
  const normalizedSurfaces = new Set(
    [
      ...actions.map((action) => normalizeSurface(action.surface)),
      ...results.map((result) => normalizeSurface(result.surface)),
      ...scenarios.map((scenario) => normalizeSurface(scenario.surface)),
      ...scenarios.map((scenario) => normalizeSurface(scenario.label)),
    ].filter(Boolean),
  );
  const missingSurfaces = requireAllSurfaces
    ? requiredSurfaces.filter((surface) => !normalizedSurfaces.has(normalizeSurface(surface)))
    : [];
  const metadataFindings = actions.filter((action) => action.metadataIssues.length > 0);
  const failedResults = results.filter((result) => result.passed === false);
  const safeActions = actions.filter((action) => !action.disabled && !action.destructive);
  const resultKey = (result) => `${result.scenarioId}|${result.actionId}|${result.activationMode}`;
  const resultKeys = new Set(results.map(resultKey));
  const missingSafeActivations = safeActions.flatMap((action) =>
    ["pointer", "keyboard"]
      .filter((mode) => !resultKeys.has(`${action.scenarioId}|${action.actionId}|${mode}`))
      .map((mode) => ({ action, mode })),
  );
  const destructiveMissingConfirmation = actions.filter(
    (action) => action.destructive && !action.hasConfirmationAffordance,
  );
  const disabledWithoutReason = actions.filter(
    (action) => action.disabled && !action.disabledReason,
  );
  const capabilityGatedDisabled = actions.filter(
    (action) => action.disabled && action.capabilityGated,
  );
  const capabilityReasonMismatches = summarizeCapabilityReasonMismatches(capabilityGatedDisabled);
  const providerProfileCoverageFindings = summarizeProviderProfileCoverageFindings({
    capabilityGatedDisabled,
    providerProfile: activeProviderProfile,
  });
  const commandMoreCrossAudit = buildCommandMoreCrossAudit({
    actionInventory: { actions },
  });
  const overlayCollisionFindings = surfaceComplexity.flatMap(
    (complexity) => complexity.overlayCollision?.findings ?? [],
  );
  return {
    capabilityGatedDisabled,
    capabilityReasonMismatches,
    commandMoreCrossAudit,
    commandMoreCrossAuditFindings: commandMoreCrossAudit.findings,
    disabledWithoutReason,
    duplicates: classifiedDuplicates,
    duplicateClassification,
    needsConsolidationDuplicateGroups: duplicateGroupsByCategory("needs-consolidation"),
    overexposedDuplicateGroups: duplicateGroupsByCategory("overexposed"),
    unclassifiedDuplicateGroups: duplicateGroupsByCategory("unclassified"),
    waivedDuplicateGroups: classifiedDuplicates.filter((duplicate) =>
      duplicate.classification?.category?.startsWith("allowed-"),
    ),
    failedResults,
    metadataFindings,
    missingSafeActivations,
    missingSurfaces,
    overlayCollisionFindings,
    providerProfileCoverageFindings,
    destructiveMissingConfirmation,
    total:
      failedResults.length +
      metadataFindings.length +
      missingSafeActivations.length +
      missingSurfaces.length +
      overlayCollisionFindings.length +
      destructiveMissingConfirmation.length +
      disabledWithoutReason.length +
      capabilityReasonMismatches.length +
      providerProfileCoverageFindings.length +
      commandMoreCrossAudit.findings.length +
      duplicateClassification.unclassified,
  };
}

function summarizeCapabilityReasonMismatches(actions) {
  const byCommand = new Map();
  for (const action of actions) {
    if (!action.commandId || !action.disabledReason) {
      continue;
    }
    const item = byCommand.get(action.commandId) ?? {
      commandId: action.commandId,
      entries: [],
      reasons: new Set(),
      surfaces: new Set(),
    };
    item.entries.push(action);
    item.reasons.add(action.disabledReason);
    item.surfaces.add(action.surface);
    byCommand.set(action.commandId, item);
  }
  return [...byCommand.values()]
    .filter((item) => item.entries.length > 1 && item.reasons.size > 1)
    .map((item) => ({
      commandId: item.commandId,
      reasons: [...item.reasons].sort(),
      surfaces: [...item.surfaces].sort(),
    }));
}

function summarizeProviderProfileCoverageFindings({ capabilityGatedDisabled, providerProfile }) {
  if (!providerProfile || providerProfile.disabledCapabilities.length === 0) {
    return [];
  }
  if (capabilityGatedDisabled.length > 0) {
    return [];
  }
  return [
    {
      disabledCapabilities: providerProfile.disabledCapabilities,
      message: `${providerProfile.id} disables capabilities, but no provider-gated disabled controls were inventoried.`,
      providerProfile: providerProfile.id,
    },
  ];
}

function summarizeUiActionReviewGate({
  actions,
  duplicates,
  duplicateClassification = summarizeDuplicateClassifications(duplicates),
  gateFindings,
  inventoryOnly,
  resultsStatus,
}) {
  const missingStableTestIds = actions.filter((action) => !hasStableActionId(action)).length;
  const noOpControls = gateFindings.failedResults.filter((result) =>
    /no observable result/i.test(result.outcome ?? result.reason ?? ""),
  ).length;
  const failedActivations = gateFindings.failedResults.length - noOpControls;
  const findings = [
    reviewGateFinding({
      category: "failed-activations",
      count: failedActivations,
      threshold: 0,
      waiverRequired: true,
    }),
    reviewGateFinding({
      category: "no-op-controls",
      count: noOpControls,
      threshold: 0,
      waiverRequired: true,
    }),
    reviewGateFinding({
      category: "duplicate-groups",
      count: duplicates.length,
      severity: "informational",
      threshold: UI_ACTION_AUDIT_THRESHOLDS.duplicateGroups,
      waiverRequired: false,
    }),
    reviewGateFinding({
      category: "unclassified-duplicate-groups",
      count: duplicateClassification.unclassified,
      threshold: 0,
      waiverRequired: false,
    }),
    reviewGateFinding({
      category: "overexposed-duplicate-groups",
      count: duplicateClassification.overexposed,
      severity: duplicateClassification.overexposed > 0 ? "needs-review" : "informational",
      threshold: 0,
      waiverRequired: false,
    }),
    reviewGateFinding({
      category: "needs-consolidation-duplicate-groups",
      count: duplicateClassification.needsConsolidation,
      severity: duplicateClassification.needsConsolidation > 0 ? "needs-review" : "informational",
      threshold: 0,
      waiverRequired: false,
    }),
    reviewGateFinding({
      category: "classified-duplicate-waivers",
      count: duplicateClassification.waived,
      severity: duplicateClassification.waived > 0 ? "waived" : "informational",
      threshold: 0,
      waiverRequired: false,
    }),
    reviewGateFinding({
      category: "missing-stable-test-ids",
      count: missingStableTestIds,
      threshold: UI_ACTION_AUDIT_THRESHOLDS.missingStableTestIds,
      waiverRequired: true,
    }),
    reviewGateFinding({
      category: "command-more-cross-audit",
      count: gateFindings.commandMoreCrossAuditFindings?.length ?? 0,
      threshold: 0,
      waiverRequired: false,
    }),
  ];
  const blocking = findings.filter((finding) => finding.severity === "blocking").length;
  const needsReviewFindings = findings.filter((finding) => finding.severity === "needs-review");
  const needsReview =
    needsReviewFindings.length +
    (resultsStatus === "completed-with-findings" || inventoryOnly || gateFindings.total > 0
      ? 1
      : 0);
  return {
    duplicateClassification,
    findings,
    needsReview,
    schemaVersion: "ui-action-review-gate.v1",
    severityLevels: UI_ACTION_AUDIT_SEVERITIES,
    status: blocking > 0 || needsReview > 0 ? "not-review-complete" : "review-complete",
    summary: {
      blocking,
      informational: findings.filter((finding) => finding.severity === "informational").length,
      "needs-review": needsReview,
      waived: findings.filter((finding) => finding.severity === "waived").length,
    },
  };
}

function reviewGateFinding({ category, count, severity = null, threshold, waiverRequired }) {
  return {
    category,
    count,
    severity: severity ?? (count > threshold ? "blocking" : "informational"),
    threshold,
    waiverRequired,
  };
}

function renderReviewerSummary({
  actions,
  duplicates,
  generatedAt,
  inventoryOnly,
  outputDir,
  providerProfile: activeProviderProfile = null,
  reviewGate,
  results,
  scenarioFilterActive = false,
  scenarios,
  screenshots,
  surfaceComplexity = [],
  websiteExtractionQuality,
}) {
  const resultSummary = summarizeResults(results);
  const inventorySummary = summarizeInventory(actions);
  const findings = summarizeGateFindings({
    actions,
    duplicates,
    providerProfile: activeProviderProfile,
    requireAllSurfaces: !scenarioFilterActive,
    results,
    scenarios,
    surfaceComplexity,
  });
  const duplicateClassification =
    reviewGate?.duplicateClassification ?? findings.duplicateClassification;
  const status =
    inventoryOnly || findings.total > 0 || reviewGate?.status === "not-review-complete"
      ? "Not review-complete: UI action audit has findings or did not run activation replay."
      : scenarioFilterActive
        ? "Focused UI action audit passed for filtered scenarios."
        : "Review-complete: exhaustive UI action audit passed.";
  const lines = [
    "# UI action audit reviewer summary",
    "",
    `Generated: ${generatedAt}`,
    `Output directory: ${outputDir}`,
    "",
    `## Status`,
    "",
    status,
    `Review gate: ${reviewGate?.status ?? "missing"} (${formatReviewGateSeverities(reviewGate)})`,
    "",
    "## Artifact checklist",
    "",
    "- action-inventory.json: present",
    "- action-results.json: present",
    "- dead-controls.md: present",
    "- duplicates.md: present",
    "- overlay-collisions.json: present",
    "- overlay-collisions.md: present",
    "- command-more-matrix.json: present",
    "- command-more-matrix.md: present",
    "- website-extraction-quality.json: present",
    "- reviewer-summary.md: present",
    `- screenshots/: ${String(screenshots.length)} captured`,
    "",
    "## Coverage",
    "",
    `- Scenarios: ${String(scenarios.length)}`,
    `- Visible actions inventoried: ${String(inventorySummary.total)}`,
    `- Safe pointer/keyboard activation results: ${String(resultSummary.total)}`,
    `- Passed: ${String(resultSummary.passed)}`,
    `- Skipped destructive focus checks: ${String(resultSummary.skipped)}`,
    `- Failed/no-op/browser findings: ${String(resultSummary.failed)}`,
    `- Disabled controls: ${String(inventorySummary.disabled)}`,
    `- Capability-gated disabled controls: ${String(inventorySummary.capabilityGatedDisabled)}`,
    `- Provider profile: ${activeProviderProfile ? activeProviderProfile.id : "runtime"}`,
    `- Advanced/operator controls: ${String(inventorySummary.advancedOperatorControls)}`,
    `- Advanced/debug controls with mode metadata: ${String(
      inventorySummary.debugOperatorControls,
    )}`,
    `- Destructive controls: ${String(inventorySummary.destructive)}`,
    `- Website extraction confidence: ${websiteExtractionQuality?.extractionConfidence ?? "missing"}`,
    `- Website skipped chrome blocks: ${String(websiteExtractionQuality?.skippedBlockCount ?? 0)}`,
    "",
    "## Gate findings",
    "",
    `- Missing required surfaces: ${
      scenarioFilterActive
        ? "not evaluated for filtered scenario run"
        : formatFindingCount(findings.missingSurfaces.length)
    }`,
    `- Missing safe pointer/keyboard activations: ${formatFindingCount(
      findings.missingSafeActivations.length,
    )}`,
    `- Failed/no-op activations: ${formatFindingCount(findings.failedResults.length)}`,
    `- Metadata findings: ${formatFindingCount(findings.metadataFindings.length)}`,
    `- Disabled without reason: ${formatFindingCount(findings.disabledWithoutReason.length)}`,
    `- Capability-gated disabled controls: ${String(findings.capabilityGatedDisabled.length)}`,
    `- Capability reason mismatches: ${formatFindingCount(
      findings.capabilityReasonMismatches.length,
    )}`,
    `- Provider profile coverage findings: ${formatFindingCount(
      findings.providerProfileCoverageFindings.length,
    )}`,
    `- Command/More cross-audit findings: ${formatFindingCount(
      findings.commandMoreCrossAuditFindings.length,
    )}`,
    `- Destructive without confirmation: ${formatFindingCount(
      findings.destructiveMissingConfirmation.length,
    )}`,
    `- Duplicate groups: ${String(duplicates.length)}`,
    `- Unclassified duplicate groups: ${formatFindingCount(duplicateClassification.unclassified)}`,
    `- Overexposed duplicate groups: ${formatFindingCount(duplicateClassification.overexposed)}`,
    `- Needs-consolidation duplicate groups: ${formatFindingCount(
      duplicateClassification.needsConsolidation,
    )}`,
    `- Classified duplicate waivers: ${String(duplicateClassification.waived)}`,
    `- Overlay collisions: ${formatFindingCount(findings.overlayCollisionFindings.length)}`,
    "",
    "## Duplicate Categories",
    "",
    ...Object.entries(duplicateClassification.byCategory).map(
      ([category, count]) => `- ${category}: ${String(count)}`,
    ),
    "",
    "## Duplicate Burn-down",
    "",
    ...(duplicateClassification.burnDownIssues.length === 0
      ? ["No overexposed duplicate burn-down issues."]
      : duplicateClassification.burnDownIssues.map(
          (issue) =>
            `- ${issue.issue}: ${String(issue.count)} group(s), owner ${issue.owner}, review ${issue.reviewDate}`,
        )),
    "",
    "## Surface counts",
    "",
    ...Object.entries(inventorySummary.surfaces)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([surface, count]) => `- ${surface}: ${String(count)}`),
    "",
  ];
  if (findings.missingSurfaces.length > 0) {
    lines.push(
      "## Missing surfaces",
      "",
      ...findings.missingSurfaces.map((surface) => `- ${surface}`),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function websiteExtractionQualityDocumentFromSeed(seed, generatedAt) {
  const quality = seed.website.source.metadata?.websiteExtractionQuality ?? null;
  return {
    generatedAt,
    quality,
    schemaVersion: "website-extraction-quality.v1",
    skippedItems: seed.website.source.skippedItems ?? [],
    sourceId: seed.website.source.id,
    sourceUrl: seed.website.source.sourceUrl ?? seed.website.source.sourceName,
    status: quality ? "recorded" : "missing",
  };
}

function assertWebsiteExtractionQuality(source) {
  const quality = source.metadata?.websiteExtractionQuality;
  assert(quality, "Website source prep did not include extraction quality metadata.");
  assert(
    quality.extractionConfidence === "high" ||
      quality.extractionConfidence === "medium" ||
      quality.extractionConfidence === "low",
    "Website extraction confidence is missing.",
  );
  assert(quality.skippedBlockCount > 0, "Website fixture did not report skipped chrome blocks.");
  const openingBlockText =
    source.blocks?.find((block) => block.speakMode !== "skip")?.spokenText ?? "";
  assert(
    !/home features search|instagram subscribe/i.test(openingBlockText),
    `Website Cinema opening block contains page chrome: ${openingBlockText}`,
  );
}

function formatFindingCount(count) {
  return count === 0 ? "0" : `${String(count)} (see reports before leaving draft)`;
}

function formatReviewGateSeverities(reviewGate) {
  const summary = reviewGate?.summary ?? {};
  return UI_ACTION_AUDIT_SEVERITIES.map(
    (severity) => `${severity}=${String(summary[severity] ?? 0)}`,
  ).join(", ");
}

function normalizeSurface(value) {
  return String(value ?? "")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[\s/-]+/g, " ")
    .trim()
    .toLowerCase();
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function workspaceAuditText() {
  return "Adaptive workspace action-audit text. Review it, preview it, and open teleprompt controls.";
}

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  if (runSummary) {
    runSummary.generatedAt = new Date().toISOString();
    runSummary.status = "failed";
    runSummary.error = message;
    runSummary.durationMs = Math.max(0, Date.now() - Date.parse(runSummary.startedAt));
    runSummary.phaseTimings = runSummary.phaseTimings ?? {};
    runSummary.phaseTimings.totalMs = runSummary.durationMs;
    await writeSummary(runSummary).catch(() => {});
    await writeFile(
      path.join(outputDir, "action-results.json"),
      `${JSON.stringify(
        {
          error: message,
          generatedAt: new Date().toISOString(),
          schemaVersion: "ui-action-results.v1",
          status: "failed",
        },
        null,
        2,
      )}\n`,
    ).catch(() => {});
  }
  process.exitCode = 1;
});
