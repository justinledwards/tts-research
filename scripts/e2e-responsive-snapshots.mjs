#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  apiJson,
  blockingPageIssues,
  collectPageIssues,
  createQaProject,
  loadPlaywright,
  prepareOutputDir,
  projectStorageState,
  startLocalServices,
  writeJson,
} from "./e2e-browser-qa-helpers.mjs";
import { instrumentScreenshotState, writeScreenshotStateArtifacts } from "./screenshot-state.mjs";
import {
  collectOverlayCollisionReport,
  renderOverlayCollisionReport,
  summarizeOverlayCollisionReports,
} from "./overlay-collision-audit.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_RESPONSIVE_OUTPUT_DIR ??
  path.join(rootDir, "output", "accessibility", "latest", "responsive-snapshots");
const screenshotStateDir =
  process.env.E2E_SCREENSHOT_STATE_OUTPUT_DIR ??
  path.join(rootDir, "output", "screenshots", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";
const screenshotStateRecords = [];
const preparedCinemaOverlaySelector =
  "[role='dialog'][aria-labelledby='prepared-source-cinema-title']";

const websiteReadCalmBudget = {
  maxExpandedPolicySourceDetails: 0,
  maxFooterRows: 3,
  maxHeaderLines: 3,
  maxInlineDisplaySettings: 0,
  maxModeControlGroups: 1,
  maxPanelCount: 0,
  maxPrimaryPlaybackGroups: 1,
  maxSourceIdentitySummaries: 1,
  maxVisibleActions: 16,
  maxVisibleBadges: 2,
};

const viewports = [
  { height: 844, id: "phone-390", width: 390 },
  { height: 820, id: "constrained-1100", width: 1100 },
  { height: 980, id: "desktop-1440", width: 1440 },
  { height: 1080, id: "desktop-1920-taskbar", width: 1920 },
];

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "responsive-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "responsive-snapshots.v1",
    status: "failed",
  }).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  await prepareOutputDir(outputDir, screenshotsDir);
  const services = useExistingServers
    ? null
    : await startLocalServices({ artifactDir: outputDir, rootDir });
  if (services) {
    apiBaseUrl = services.apiBaseUrl;
    appBaseUrl = services.appBaseUrl;
  }

  try {
    const websiteCalmFixture = await seedWebsiteCalmReadFixture();
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const results = [];
    try {
      for (const viewport of viewports) {
        results.push(await captureViewport(browser, viewport, websiteCalmFixture));
      }
    } finally {
      await browser.close();
    }
    const failures = results.filter((result) => !result.passed).length;
    const layoutFailures = results.filter((result) => !result.layoutPassed).length;
    const websiteCalmReadFailures = results.reduce(
      (count, result) => count + result.websiteCalmRead.summary.failures,
      0,
    );
    const overlayCollisionReports = results.map((result) => result.overlayCollision);
    const overlayCollisionSummary = summarizeOverlayCollisionReports(overlayCollisionReports);
    const screenshotState = await writeScreenshotStateArtifacts({
      outputDir: screenshotStateDir,
      records: screenshotStateRecords,
      rootDir,
    });
    const stateMismatches = screenshotState.summary.mismatches;
    const document = {
      appBaseUrl,
      generatedAt: new Date().toISOString(),
      results,
      schemaVersion: "responsive-snapshots.v1",
      status: failures === 0 ? "passed" : "failed",
      summary: {
        failures: failures + stateMismatches,
        layoutFailures,
        overlayCollisionFailures: overlayCollisionSummary.failures,
        websiteCalmReadFailures,
        screenshotStateMismatches: stateMismatches,
        screenshots: results.reduce((count, result) => count + result.screenshots.length, 0),
        viewports: results.length,
      },
    };
    document.screenshotState = {
      manifest: path.join(screenshotStateDir, "manifest.json"),
      mismatches: path.join(screenshotStateDir, "state-mismatches.md"),
      summary: screenshotState.summary,
    };
    document.overlayCollisions = {
      report: path.join(outputDir, "overlay-collisions.md"),
      results: path.join(outputDir, "overlay-collisions.json"),
      summary: overlayCollisionSummary,
    };
    document.status = document.summary.failures === 0 ? "passed" : "failed";
    await writeJson(path.join(outputDir, "overlay-collisions.json"), {
      generatedAt: document.generatedAt,
      reports: overlayCollisionReports,
      schemaVersion: "overlay-collisions.v1",
      summary: overlayCollisionSummary,
    });
    await writeFile(
      path.join(outputDir, "overlay-collisions.md"),
      renderOverlayCollisionReport({
        generatedAt: document.generatedAt,
        reports: overlayCollisionReports,
      }),
    );
    await writeJson(path.join(outputDir, "responsive-results.json"), document);
    console.log(`Responsive snapshots ${document.status}. Reports written to ${outputDir}`);
    process.exitCode = document.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function captureViewport(browser, viewport, websiteCalmFixture) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
  page.setDefaultTimeout(60_000);
  const pageIssues = collectPageIssues(page);
  const screenshots = [];
  try {
    await page.goto(appBaseUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("body");
    const workspaceScreenshot = path.join(screenshotsDir, `${viewport.id}-workspace.png`);
    await page.screenshot({ fullPage: false, path: workspaceScreenshot });
    screenshots.push(workspaceScreenshot);

    await openSettingsIfAvailable(page);
    const settingsScreenshot = path.join(screenshotsDir, `${viewport.id}-settings.png`);
    await page.screenshot({ fullPage: false, path: settingsScreenshot });
    screenshots.push(settingsScreenshot);

    const websiteCalmRead = await captureWebsiteCalmReadScenario(
      browser,
      viewport,
      websiteCalmFixture,
    );
    screenshots.push(websiteCalmRead.screenshot);

    const layout = await page.evaluate(() => {
      const normalize = (value) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();
      const visible = (element) =>
        element instanceof HTMLElement &&
        element.getAttribute("aria-hidden") !== "true" &&
        !element.closest("[aria-hidden='true']") &&
        element.offsetParent !== null &&
        element.getClientRects().length > 0;
      const compactControlFailures = Array.from(
        document.querySelectorAll("[data-compact-control='rail-toggle']"),
      ).flatMap((element) => {
        if (!visible(element)) {
          return [];
        }
        const visibleLabel = normalize(element.textContent);
        const controlId =
          element.getAttribute("data-testid") ||
          element.getAttribute("data-compact-control-id") ||
          "compact-rail-control";
        const failures = [];
        if (visibleLabel.length <= 1) {
          failures.push(`${controlId}: collapsed rail control uses a one-letter visible label`);
        }
        if (!normalize(element.getAttribute("aria-label"))) {
          failures.push(`${controlId}: collapsed rail control has no aria-label`);
        }
        if (!normalize(element.getAttribute("title"))) {
          failures.push(`${controlId}: collapsed rail control has no tooltip/title`);
        }
        if (!normalize(element.getAttribute("data-command-id"))) {
          failures.push(`${controlId}: collapsed rail control has no command id`);
        }
        return failures;
      });
      const clippedControlFailures = Array.from(
        document.querySelectorAll("[data-segmented-option], [data-rail-mode-option]"),
      ).flatMap((element) => {
        if (!visible(element)) {
          return [];
        }
        const visibleLabel = normalize(element.textContent);
        if (!visibleLabel) {
          return [];
        }
        if (
          element.scrollWidth <= element.clientWidth + 1 &&
          element.scrollHeight <= element.clientHeight + 1
        ) {
          return [];
        }
        const controlId =
          element.getAttribute("data-testid") ||
          element.getAttribute("data-segmented-option") ||
          "segmented-control-option";
        return [`${controlId}: segmented control label appears clipped: ${visibleLabel}`];
      });
      return {
        bodyText: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 400) ?? "",
        clippedControlFailures,
        compactControlFailures,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
        visibleDialogCount: Array.from(document.querySelectorAll("[role='dialog']")).filter(visible)
          .length,
      };
    });
    const overlayCollision = await collectOverlayCollisionReport(page);
    const issues = blockingPageIssues(pageIssues);
    const layoutPassed =
      !layout.horizontalOverflow &&
      layout.compactControlFailures.length === 0 &&
      layout.clippedControlFailures.length === 0 &&
      issues.length === 0 &&
      layout.bodyText.length > 0 &&
      overlayCollision.summary.failures === 0;
    return {
      id: viewport.id,
      issues,
      layout,
      layoutPassed,
      overlayCollision,
      passed: layoutPassed && websiteCalmRead.summary.failures === 0,
      screenshots,
      viewport,
      websiteCalmRead,
    };
  } finally {
    await context.close();
  }
}

async function openSettingsIfAvailable(page) {
  const candidates = [
    "[data-testid='ui-action-settings-open']",
    "button:has-text('Settings')",
    "button[aria-label*='Settings']",
  ];
  for (const selector of candidates) {
    const locator = page.locator(selector).filter({ visible: true }).first();
    if ((await locator.count()) === 0) {
      continue;
    }
    await locator.click();
    await page.getByText("Studio Settings").first().waitFor({ state: "visible" });
    await page.waitForFunction(
      () => {
        const text = document.body.innerText?.replace(/\s+/g, " ") ?? "";
        return (
          /Studio Settings/.test(text) &&
          !/Loading settings|Preparing this view locally/i.test(text)
        );
      },
      undefined,
      { timeout: 15_000 },
    );
    return;
  }
}

async function captureWebsiteCalmReadScenario(browser, viewport, fixture) {
  const context = await browser.newContext({ storageState: fixture.storageState, viewport });
  const page = await context.newPage();
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
  page.setDefaultTimeout(60_000);
  try {
    await openPreparedCinemaOverlay(page, "Website Cinema");
    await page.locator(preparedCinemaOverlaySelector).first().waitFor({ state: "visible" });
    await switchVisibleCinemaMode(page, "Read", "read");
    await page.waitForFunction(
      () => {
        const root = document.querySelector("[data-cinema-surface='website']");
        return (
          root?.getAttribute("data-cinema-focus-mode") === "read" &&
          root?.getAttribute("data-cinema-renderer-lifecycle") === "ready" &&
          document.querySelector("[data-website-read-mode-calm='true']") !== null &&
          !/Preparing this view locally|Taking longer than expected/i.test(
            document.body.textContent ?? "",
          )
        );
      },
      undefined,
      { timeout: 20_000 },
    );
    const screenshot = path.join(screenshotsDir, `${viewport.id}-website-cinema-calm-read.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    const beforeOpeningDetails = await collectWebsiteCalmReadMetrics(page);

    const detailsPath = await openWebsiteDetailsForComparison(page, viewport);
    const afterOpeningDetails = await collectWebsiteCalmReadMetrics(page);
    const failures = evaluateWebsiteCalmReadMetrics(beforeOpeningDetails);

    return {
      afterOpeningDetails,
      beforeOpeningDetails,
      budget: websiteReadCalmBudget,
      comparison: compareWebsiteReadMetrics(beforeOpeningDetails, afterOpeningDetails),
      comparisonDetailsPath: detailsPath,
      screenshot,
      summary: {
        failures: failures.length,
        status: failures.length === 0 ? "passed" : "failed",
      },
      failures,
    };
  } finally {
    await context.close();
  }
}

async function switchVisibleCinemaMode(page, label, expectedMode) {
  const currentMode = await page
    .locator("[data-cinema-surface='website']")
    .first()
    .evaluate((element) => element.getAttribute("data-cinema-focus-mode"))
    .catch(() => null);
  if (currentMode === expectedMode) {
    return true;
  }
  const button = page
    .locator(preparedCinemaOverlaySelector)
    .first()
    .getByRole("button", { exact: true, name: label })
    .filter({ visible: true })
    .first();
  if ((await button.count()) === 0) {
    return false;
  }
  await button.click();
  await page.waitForFunction(
    (mode) =>
      document
        .querySelector("[data-cinema-surface='website']")
        ?.getAttribute("data-cinema-focus-mode") === mode,
    expectedMode,
    { timeout: 10_000 },
  );
  return true;
}

async function openWebsiteDetailsForComparison(page, viewport) {
  const switchedToInspect = await switchVisibleCinemaMode(page, "Inspect", "inspect");
  if (switchedToInspect) {
    return "inspect-mode";
  }
  const moreButton = page
    .locator(preparedCinemaOverlaySelector)
    .first()
    .getByRole("button", { exact: true, name: "More" })
    .filter({ visible: true })
    .first();
  if ((await moreButton.count()) === 0) {
    return viewport.width < 1024 ? "mobile-details-unavailable" : "details-unavailable";
  }
  await moreButton.click();
  await page
    .locator("[data-cinema-mobile-sheet]")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
  return "mobile-more-sheet";
}

async function openPreparedCinemaOverlay(page, expectedLabel) {
  await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { exact: true, name: "Intake" }).click();
  await page.getByText("Guided Intake").first().waitFor();
  await page.getByTestId("intake-step-destination").click();
  await page
    .getByRole("button", { name: new RegExp(`Open ${escapeRegex(expectedLabel)}`) })
    .first()
    .click();
  await page.locator(preparedCinemaOverlaySelector).getByText(expectedLabel).first().waitFor();
}

async function collectWebsiteCalmReadMetrics(page) {
  return page.evaluate(() => {
    const normalize = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    const visible = (element) =>
      element instanceof HTMLElement &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[aria-hidden='true']") &&
      element.offsetParent !== null &&
      element.getClientRects().length > 0;
    const root = document.querySelector("[data-cinema-surface='website']");
    const queryVisible = (selector) =>
      root ? Array.from(root.querySelectorAll(selector)).filter(visible) : [];
    const actionSelector = [
      "button:not([aria-hidden='true'])",
      "select:not([aria-hidden='true'])",
      "summary:not([aria-hidden='true'])",
      "a[href]",
    ].join(",");
    return {
      expandedPolicySourceDetails: queryVisible("[data-cinema-expanded-source-detail]").length,
      focusMode: root?.getAttribute("data-cinema-focus-mode") ?? "unknown",
      footerRows: queryVisible("[data-cinema-footer-row]").length,
      headerLines: queryVisible("[data-cinema-header-line]").length,
      inlineDisplaySettings: queryVisible("[data-cinema-display-popover]").length,
      modeControlGroups: queryVisible("[data-cinema-mode-control-group]").length,
      panelCount: queryVisible("[data-cinema-inspector-dock], [data-cinema-mobile-sheet]").length,
      primaryPlaybackGroups: queryVisible("[data-cinema-primary-playback-group]").length,
      sourceIdentitySummaries: queryVisible("[data-source-identity-summary]").length,
      surface: root?.getAttribute("data-cinema-surface") ?? "unknown",
      visibleActions: queryVisible(actionSelector).filter(
        (element) =>
          normalize(element.textContent) || normalize(element.getAttribute("aria-label")),
      ).length,
      visibleBadges: queryVisible("[data-status-chip]").length,
      viewportWidth: window.innerWidth,
      websiteReadModeCalm: document.querySelector("[data-website-read-mode-calm='true']") !== null,
    };
  });
}

function evaluateWebsiteCalmReadMetrics(metrics) {
  const failures = [];
  const maximums = [
    ["visibleActions", metrics.visibleActions, websiteReadCalmBudget.maxVisibleActions],
    ["visibleBadges", metrics.visibleBadges, websiteReadCalmBudget.maxVisibleBadges],
    ["headerLines", metrics.headerLines, websiteReadCalmBudget.maxHeaderLines],
    ["footerRows", metrics.footerRows, websiteReadCalmBudget.maxFooterRows],
    ["panelCount", metrics.panelCount, websiteReadCalmBudget.maxPanelCount],
    [
      "primaryPlaybackGroups",
      metrics.primaryPlaybackGroups,
      websiteReadCalmBudget.maxPrimaryPlaybackGroups,
    ],
    [
      "sourceIdentitySummaries",
      metrics.sourceIdentitySummaries,
      websiteReadCalmBudget.maxSourceIdentitySummaries,
    ],
    ["modeControlGroups", metrics.modeControlGroups, websiteReadCalmBudget.maxModeControlGroups],
    [
      "inlineDisplaySettings",
      metrics.inlineDisplaySettings,
      websiteReadCalmBudget.maxInlineDisplaySettings,
    ],
    [
      "expandedPolicySourceDetails",
      metrics.expandedPolicySourceDetails,
      websiteReadCalmBudget.maxExpandedPolicySourceDetails,
    ],
  ];
  for (const [metric, actual, budget] of maximums) {
    if (actual > budget) {
      failures.push({ actual, budget, metric, reason: `${metric} exceeds calm read budget` });
    }
  }
  if (metrics.focusMode !== "read") {
    failures.push({ actual: metrics.focusMode, budget: "read", metric: "focusMode" });
  }
  if (metrics.surface !== "website") {
    failures.push({ actual: metrics.surface, budget: "website", metric: "surface" });
  }
  if (!metrics.websiteReadModeCalm) {
    failures.push({ actual: false, budget: true, metric: "websiteReadModeCalm" });
  }
  if (metrics.primaryPlaybackGroups !== 1) {
    failures.push({
      actual: metrics.primaryPlaybackGroups,
      budget: 1,
      metric: "primaryPlaybackGroups",
      reason: "Website read mode should expose exactly one primary playback group",
    });
  }
  if (metrics.sourceIdentitySummaries !== 1) {
    failures.push({
      actual: metrics.sourceIdentitySummaries,
      budget: 1,
      metric: "sourceIdentitySummaries",
      reason: "Website read mode should expose exactly one source identity summary",
    });
  }
  if (metrics.viewportWidth >= 1024 && metrics.modeControlGroups !== 1) {
    failures.push({
      actual: metrics.modeControlGroups,
      budget: 1,
      metric: "modeControlGroups",
      reason: "Desktop Website read mode should expose exactly one mode control group",
    });
  }
  return failures;
}

function compareWebsiteReadMetrics(beforeOpeningDetails, afterOpeningDetails) {
  const keys = [
    "visibleActions",
    "visibleBadges",
    "headerLines",
    "footerRows",
    "panelCount",
    "expandedPolicySourceDetails",
  ];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      {
        afterOpeningDetails: afterOpeningDetails[key],
        beforeOpeningDetails: beforeOpeningDetails[key],
        delta: afterOpeningDetails[key] - beforeOpeningDetails[key],
      },
    ]),
  );
}

async function seedWebsiteCalmReadFixture() {
  const project = await createQaProject(
    apiBaseUrl,
    `Website calm read ${new Date().toISOString()}`,
  );
  const fixtureServer = await startWebsiteCalmFixtureServer();
  let source;
  try {
    source = await apiJson(apiBaseUrl, `/api/projects/${project.id}/source-preps`, {
      body: JSON.stringify({ kind: "url", url: fixtureServer.url }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } finally {
    await fixtureServer.stop();
  }
  if (source.status !== "ready") {
    throw new Error(`Website calm read source is not ready: ${source.status}`);
  }
  const selectedBlockIds = (source.blocks ?? [])
    .filter((block) => block.speakMode !== "skip")
    .slice(0, 3)
    .map((block) => block.id);
  if (selectedBlockIds.length === 0) {
    throw new Error("Website calm read source has no narratable blocks.");
  }
  const jobRequest = await apiJson(apiBaseUrl, `/api/source-preps/${source.id}/voice-jobs`, {
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
      preparedSourceId: source.id,
      progressTargetId: `prepared:${source.id}`,
      projectId: project.id,
      runMode: "draftPreview",
      selectedBlockIds,
      sourceKind: "url",
      text: "",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const job = await waitForJob(jobRequest.id);
  return {
    job,
    source,
    storageState: projectStorageState(appBaseUrl, project.id, {
      jobId: job.id,
      preparedSourceId: source.id,
      sourceMode: "fileUrl",
      sourceType: "prepared",
      stage: "intake",
      text: source.speechText ?? source.text ?? "",
    }),
  };
}

async function startWebsiteCalmFixtureServer() {
  const html = `<!doctype html>
<html lang="en">
  <head><title>Website Cinema Calm Read Fixture</title></head>
  <body>
    <header><nav>Home Features Search Instagram Subscribe</nav></header>
    <main>
      <article class="article-body">
        <h1>Website Cinema Calm Read Fixture</h1>
        <p>This local article gives Website Cinema a stable calm-read source.</p>
        <h2>Readable Section</h2>
        <p>Source provenance, policy, display settings, and review details should stay discoverable without crowding read mode.</p>
        <aside class="newsletter">Newsletter prompts and navigation chrome should be inspectable but not narrated first.</aside>
        <p>The final article paragraph confirms the reader canvas remains the dominant surface.</p>
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
  if (!address || typeof address !== "object") {
    throw new Error("Unable to start Website Cinema calm read fixture server.");
  }
  return {
    stop: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
    url: `http://127.0.0.1:${String(address.port)}/fixture.html`,
  };
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const job = await apiJson(apiBaseUrl, `/api/voice-jobs/${jobId}`);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(`Job ${jobId} ended as ${job.status}: ${job.error ?? "no error"}`);
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
