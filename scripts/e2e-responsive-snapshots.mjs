#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
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
import {
  collectOverlayCollisionReport,
  renderOverlayCollisionReport,
  summarizeOverlayCollisionReports,
} from "./overlay-collision-audit.mjs";
import { instrumentScreenshotState, writeScreenshotStateArtifacts } from "./screenshot-state.mjs";

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
const telepromptTheatreFixtureText =
  "Teleprompt Theatre responsive fixture. This presenter cue should remain readable in fullscreen fallback mode. The next cue verifies operator preview spacing and status.";

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "overlay-collisions.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    reports: [],
    schemaVersion: "overlay-collisions.v1",
    status: "failed",
    summary: { failures: 1, reports: 0 },
  }).catch(() => {});
  await writeFile(
    path.join(outputDir, "overlay-collisions.md"),
    `# Overlay Collision Report\n\nResponsive snapshot capture failed before collision data could be collected.\n\n${message}\n`,
  ).catch(() => {});
  await writeJson(path.join(outputDir, "responsive-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    results: [],
    schemaVersion: "responsive-snapshots.v1",
    status: "failed",
    summary: {
      failures: 1,
      layoutFailures: 0,
      overlayCollisionFailures: 1,
      screenshotStateMismatches: 0,
      screenshots: 0,
      telepromptTheatreFailures: 0,
      viewports: 0,
      websiteCalmReadFailures: 0,
    },
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
    const telepromptTheatreJob = await seedTelepromptTheatreJob(telepromptTheatreProject.id);
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const results = [];
    try {
      for (const viewport of viewports) {
        results.push(
          await captureViewport(browser, viewport, websiteCalmFixture, {
            job: telepromptTheatreJob,
            projectId: telepromptTheatreProject.id,
            text: telepromptTheatreFixtureText,
          }),
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
    document.failureSummaries = results.flatMap((result) => [
      ...(result.quickListen?.failures ?? []).map((summary) => ({
        owner: "quick-listen",
        route: `${result.viewport.id}:temporary:paste-review`,
        summary,
      })),
      ...(result.websiteCalmRead?.failures ?? []).map((summary) => ({
        owner: "website-cinema",
        route: `${result.viewport.id}:temporary:website-cinema`,
        summary,
      })),
      ...(result.telepromptTheatre?.failures ?? []).map((summary) => ({
        owner: "teleprompt",
        route: `${result.viewport.id}:temporary:teleprompt-theatre`,
        summary,
      })),
      ...(result.layout?.failures ?? []).map((summary) => ({
        owner: "responsive-layout",
        route: `${result.viewport.id}:workspace-settings`,
        summary,
      })),
    ]);
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

async function captureViewport(browser, viewport, websiteCalmFixture, telepromptTheatreFixture) {
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
    const quickListen =
      viewport.id === "phone-390" ? await verifyPhoneQuickListenCreation(browser, viewport) : null;

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
      telepromptTheatreFixture,
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
    const performanceEvidence = await collectResponsivePerformanceEvidence(page, viewport, {
      phase: "workspace-layout",
    });
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
        (quickListen?.summary.failures ?? 0) === 0 &&
        websiteCalmRead.summary.failures === 0 &&
        telepromptTheatre.summary.failures === 0,
      quickListen,
      performanceEvidence,
      screenshots,
      telepromptTheatre,
      viewport,
      websiteCalmRead,
    };
  } finally {
    await context.close();
  }
}

async function collectResponsivePerformanceEvidence(page, viewport, detail = {}) {
  const metrics = await page
    .evaluate(() => globalThis.__ttsResearchPerformance?.metrics ?? [])
    .catch(() => []);
  return {
    metricCount: metrics.length,
    metrics,
    schemaVersion: "responsive-performance-evidence.v1",
    sourceScript: "scripts/e2e-responsive-snapshots.mjs",
    unit: "ms",
    viewport: { height: viewport.height, id: viewport.id, width: viewport.width },
    ...detail,
  };
}

async function verifyPhoneQuickListenCreation(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const failures = [];
  try {
    await page.goto(appBaseUrl);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("ui-action-quick-listen-open").filter({ visible: true }).first().click();
    await page.getByRole("dialog", { name: "Quick Listen" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Paste" }).click();
    await page
      .locator("textarea")
      .first()
      .fill(
        "Temporary phone narration fixture. Quick Listen should accept pasted article text from a narrow viewport and keep recovery actions reachable.",
      );
    const temporarySourceResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/temporary-sources") && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Review first" }).click();
    const response = await temporarySourceResponse;
    if (!response.ok()) {
      failures.push(
        `Phone Quick Listen temporary source API returned ${String(response.status())}.`,
      );
    }
    const temporarySource = await response.json().catch(() => null);
    if (
      !temporarySource ||
      temporarySource.sourceOwner !== "temporary" ||
      !temporarySource.temporarySourceId
    ) {
      failures.push("Phone Quick Listen did not create a temporary source session.");
    }
    await page
      .getByRole("dialog", { name: "Quick Listen" })
      .waitFor({
        state: "hidden",
        timeout: 5_000,
      })
      .catch(async () => {
        await page
          .getByRole("dialog", { name: "Quick Listen" })
          .getByRole("button", { name: "Close" })
          .click();
      });
    const metrics = await page.evaluate(() => ({
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
      visibleDialogCount: Array.from(document.querySelectorAll("[role='dialog']")).filter(
        (element) =>
          element instanceof HTMLElement &&
          element.offsetParent !== null &&
          element.getClientRects().length > 0,
      ).length,
    }));
    if (metrics.hasHorizontalOverflow) {
      failures.push("Phone Quick Listen temporary creation produced horizontal overflow.");
    }
    return {
      failures,
      metrics,
      summary: {
        failures: failures.length,
        status: failures.length === 0 ? "passed" : "failed",
      },
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    const closeButton = page
      .getByRole("dialog", { name: "Quick Listen" })
      .getByRole("button", { name: "Close" });
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click().catch(() => {});
    }
    return {
      failures,
      metrics: null,
      summary: {
        failures: failures.length,
        status: "failed",
      },
    };
  } finally {
    await context.close();
  }
}

async function captureTelepromptTheatreScenario(browser, viewport, fixture) {
  const context = await browser.newContext({
    storageState: projectStorageState(appBaseUrl, fixture.projectId, {
      jobId: fixture.job.id,
      sourceMode: "text",
      stage: "preview",
      text: fixture.text,
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
    await ensureTelepromptTheatreAudio(page);
    await pinWorkspaceInspector(page);
    await page.getByTestId("ui-action-teleprompt-enter-theatre").click();
    await page
      .getByTestId("teleprompt-theatre")
      .waitFor({ timeout: 15_000 })
      .catch(async () => {
        const stageAction = page.getByTestId("workspace-stage-action-openTheatre").first();
        if (await stageAction.isVisible().catch(() => false)) {
          await stageAction.click();
        } else {
          await page.getByTestId("workspace-stage-theatre").click();
        }
        await page.getByTestId("teleprompt-theatre").waitFor();
      });
    await page.getByTestId("ui-action-teleprompt-operator-preview").click();
    await page.getByTestId("ui-action-teleprompt-theatre-config-preset-lowVision").click();
    const screenshot = path.join(screenshotsDir, `${viewport.id}-teleprompt-theatre.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    const metrics = await page.evaluate(() => {
      const visible = (element) =>
        element instanceof HTMLElement &&
        element.getAttribute("aria-hidden") !== "true" &&
        !element.closest("[aria-hidden='true']") &&
        element.offsetParent !== null &&
        element.getClientRects().length > 0;
      const rectFor = (element) => {
        const rect = element?.getBoundingClientRect();
        if (!rect) {
          return null;
        }
        return {
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
        };
      };
      const overlapArea = (left, right) => {
        if (!left || !right) {
          return 0;
        }
        const width = Math.max(
          0,
          Math.min(left.right, right.right) - Math.max(left.left, right.left),
        );
        const height = Math.max(
          0,
          Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
        );
        return width * height;
      };
      const theatre = document.querySelector("[data-testid='teleprompt-theatre']");
      const cue = document.querySelector("[data-testid='teleprompt-theatre-current-cue']");
      const cueRect = rectFor(cue);
      const openCinema = document.querySelector(
        "[data-testid='ui-action-teleprompt-theatre-open-cinema']",
      );
      const transportRect = rectFor(
        document.querySelector("[data-teleprompt-theatre-control-zone='transport']"),
      );
      const controlZones = [
        ...document.querySelectorAll(
          "[data-focused-theatre-chrome], [data-teleprompt-theatre-control-zone]",
        ),
      ]
        .filter(visible)
        .map((element) => ({
          label:
            element.getAttribute("data-teleprompt-theatre-control-zone") ??
            element.getAttribute("data-testid") ??
            "theatre-chrome",
          rect: rectFor(element),
        }));
      const overlapFailures = controlZones
        .map((zone) => ({
          area: overlapArea(cueRect, zone.rect),
          label: zone.label,
        }))
        .filter((zone) => zone.area > 8)
        .map((zone) => `${zone.label} overlaps cue by ${String(zone.area)}px`);
      const text = cue?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!visible(openCinema)) {
        overlapFailures.push("Open Cinema is not visible in Theatre controls");
      }
      if (transportRect && transportRect.height > Math.min(window.innerHeight * 0.22, 190)) {
        overlapFailures.push("Theatre transport controls exceed the compact height budget");
      }
      return {
        cueRect,
        hasTheatre: theatre !== null,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
        overlapFailures,
        textLength: text.length,
        viewportHeight: window.innerHeight,
      };
    });
    const failures = [
      ...blockingPageIssues(pageIssues),
      ...(metrics.hasTheatre ? [] : ["Teleprompt Theatre did not render."]),
      ...(metrics.textLength > 0 ? [] : ["Teleprompt Theatre current cue was empty."]),
      ...(metrics.horizontalOverflow ? ["Teleprompt Theatre created horizontal overflow."] : []),
      ...(metrics.overlapFailures ?? []).map(
        (failure) => `Teleprompt Theatre cue/control overlap: ${failure}.`,
      ),
      ...(metrics.cueRect && metrics.cueRect.height >= metrics.viewportHeight * 0.28
        ? []
        : ["Teleprompt Theatre cue area was too small for presenter readability."]),
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

async function ensureTelepromptTheatreAudio(page) {
  const openTheatreAction = page.getByTestId("workspace-stage-action-openTheatre").first();
  if (await openTheatreAction.isVisible().catch(() => false)) {
    return;
  }
  const createButton = page.getByTestId("workspace-stage-action-createAndListen").first();
  if (!(await createButton.isVisible().catch(() => false))) {
    return;
  }
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/voice-jobs") && response.request().method() === "POST",
  );
  await createButton.click();
  const response = await responsePromise;
  const createdJob = await response.json();
  await waitForResponsiveVoiceJob(createdJob.id);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
}

async function seedTelepromptTheatreJob(projectId) {
  const job = await apiJson(apiBaseUrl, "/api/voice-jobs", {
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
      projectId,
      runMode: "draftPreview",
      sourceKind: "text",
      text: telepromptTheatreFixtureText,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return waitForResponsiveVoiceJob(job.id);
}

async function waitForResponsiveVoiceJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const job = await apiJson(apiBaseUrl, `/api/voice-jobs/${jobId}`);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(`Job ${jobId} ended as ${job.status}: ${job.error ?? "no error"}`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
  throw new Error(`Timed out waiting for responsive snapshot job ${jobId}`);
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
