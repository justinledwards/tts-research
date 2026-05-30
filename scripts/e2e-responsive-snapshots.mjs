#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  blockingPageIssues,
  collectPageIssues,
  createQaProject,
  projectStorageState,
  loadPlaywright,
  prepareOutputDir,
  startLocalServices,
  writeJson,
} from "./e2e-browser-qa-helpers.mjs";
import { instrumentScreenshotState, writeScreenshotStateArtifacts } from "./screenshot-state.mjs";
import {
  collectOverlayCollisionReport,
  renderOverlayCollisionReport,
  summarizeOverlayCollisionReports,
} from "./overlay-collision-audit.mjs";
import {
  collectWebsiteCalmReadMetrics,
  compareWebsiteReadMetrics,
  evaluateWebsiteCalmReadMetrics,
  openPreparedCinemaOverlay,
  openWebsiteDetailsForComparison,
  preparedCinemaOverlaySelector,
  seedWebsiteCalmReadFixture,
  switchVisibleCinemaMode,
  websiteReadCalmBudget,
} from "./e2e-responsive-snapshots-helpers.mjs";

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
const minInteractiveSize = 44;

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
    const websiteCalmFixture = await seedWebsiteCalmReadFixture({ apiBaseUrl, appBaseUrl });
    const telepromptTheatreProject = await createQaProject(
      apiBaseUrl,
      `Teleprompt Theatre Responsive QA ${new Date().toISOString()}`,
    );
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const results = [];
    try {
      for (const viewport of viewports) {
        results.push(
          await captureViewport(browser, viewport, websiteCalmFixture, telepromptTheatreProject.id),
        );
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
    const telepromptTheatreFailures = results.reduce(
      (count, result) => count + result.telepromptTheatre.summary.failures,
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
        screenshotStateMismatches: stateMismatches,
        screenshots: results.reduce((count, result) => count + result.screenshots.length, 0),
        telepromptTheatreFailures,
        viewports: results.length,
        websiteCalmReadFailures,
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

async function captureViewport(browser, viewport, websiteCalmFixture, telepromptTheatreProjectId) {
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
    const telepromptTheatre = await captureTelepromptTheatreScenario(
      browser,
      viewport,
      telepromptTheatreProjectId,
    );
    screenshots.push(telepromptTheatre.screenshot);

    const layout = await page.evaluate((minimumInteractiveSize) => {
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
        const declaredHitTargetMin = Number.parseFloat(
          element.getAttribute("data-hit-target-min") ?? "",
        );
        const compactHitTarget = element.classList.contains("vs-compact-hit-target")
          ? minimumInteractiveSize
          : 0;
        const hitTargetMin = Math.max(
          Number.isFinite(declaredHitTargetMin) ? declaredHitTargetMin : 0,
          compactHitTarget,
        );
        const allowedHeight = Math.max(element.clientHeight, hitTargetMin);
        const allowedWidth = Math.max(element.clientWidth, hitTargetMin);
        if (element.scrollWidth <= allowedWidth + 1 && element.scrollHeight <= allowedHeight + 1) {
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
    }, minInteractiveSize);
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
      passed:
        layoutPassed &&
        websiteCalmRead.summary.failures === 0 &&
        telepromptTheatre.summary.failures === 0,
      screenshots,
      telepromptTheatre,
      viewport,
      websiteCalmRead,
    };
  } finally {
    await context.close();
  }
}

async function captureTelepromptTheatreScenario(browser, viewport, projectId) {
  const context = await browser.newContext({
    storageState: projectStorageState(appBaseUrl, projectId, {
      sourceMode: "text",
      stage: "preview",
      text: "Teleprompt Theatre responsive fixture. This presenter cue should remain readable in fullscreen fallback mode. The next cue verifies operator preview spacing and status.",
    }),
    viewport,
  });
  const page = await context.newPage();
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
  page.setDefaultTimeout(60_000);
  const pageIssues = collectPageIssues(page);
  try {
    await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByTestId("workspace-stage-action-openTeleprompt").click();
    await page.getByTestId("teleprompt-studio").waitFor();
    await pinWorkspaceInspector(page);
    await page.getByTestId("ui-action-teleprompt-enter-theatre").click();
    await page.getByTestId("teleprompt-theatre").waitFor();
    await page.getByTestId("ui-action-teleprompt-operator-preview").click();
    await page.getByTestId("ui-action-teleprompt-theatre-config-preset-lowVision").click();
    const screenshot = path.join(screenshotsDir, `${viewport.id}-teleprompt-theatre.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    const metrics = await page.evaluate(() => {
      const theatre = document.querySelector("[data-testid='teleprompt-theatre']");
      const cue = document.querySelector("[data-testid='teleprompt-theatre-current-cue']");
      const text = cue?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return {
        hasTheatre: theatre !== null,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
        textLength: text.length,
      };
    });
    const failures = [
      ...blockingPageIssues(pageIssues),
      ...(metrics.hasTheatre ? [] : ["Teleprompt Theatre did not render."]),
      ...(metrics.textLength > 0 ? [] : ["Teleprompt Theatre current cue was empty."]),
      ...(metrics.horizontalOverflow ? ["Teleprompt Theatre created horizontal overflow."] : []),
    ];
    return {
      failures,
      metrics,
      screenshot,
      summary: {
        failures: failures.length,
        status: failures.length === 0 ? "passed" : "failed",
      },
    };
  } finally {
    await context.close();
  }
}

async function pinWorkspaceInspector(page) {
  const menu = await openWorkspaceLayoutMenu(page);
  await menu.getByTestId("ui-action-workspace-layout-custom-contextInspector-pinned").click();
  await closeWorkspaceLayoutMenu(page);
}

async function openWorkspaceLayoutMenu(page) {
  const menus = page.getByTestId("ui-action-workspace-layout-menu");
  const count = await menus.count();
  for (let index = 0; index < count; index += 1) {
    const summary = menus.nth(index).locator("summary");
    if (await summary.isVisible()) {
      await summary.click();
      return menus.nth(index);
    }
  }
  throw new Error("Visible workspace layout menu was not found.");
}

async function closeWorkspaceLayoutMenu(page) {
  await page.evaluate(() => {
    document
      .querySelectorAll('[data-testid="ui-action-workspace-layout-menu"][open]')
      .forEach((element) => {
        element.removeAttribute("open");
      });
  });
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
    await openPreparedCinemaOverlay(page, "Website Cinema", appBaseUrl);
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
