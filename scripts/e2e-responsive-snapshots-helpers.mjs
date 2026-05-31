#!/usr/bin/env node

import { createServer as createHttpServer } from "node:http";
import { apiJson, createQaProject, projectStorageState } from "./e2e-browser-qa-helpers.mjs";

export const preparedCinemaOverlaySelector =
  "[role='dialog'][aria-labelledby='prepared-source-cinema-title']";

export const websiteReadCalmBudget = {
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

export async function collectWebsiteCalmReadMetrics(page) {
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

export function evaluateWebsiteCalmReadMetrics(metrics) {
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

export function compareWebsiteReadMetrics(beforeOpeningDetails, afterOpeningDetails) {
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

export async function seedWebsiteCalmReadFixture({ apiBaseUrl, appBaseUrl }) {
  const project = await createQaProject(
    apiBaseUrl,
    `Website calm read ${new Date().toISOString()}`,
  );
  const fixtureServer = await startWebsiteCalmReadFixtureServer();
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
  const job = await waitForJob(apiBaseUrl, jobRequest.id);
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

export async function openPreparedCinemaOverlay(page, expectedLabel, appBaseUrl) {
  await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const intakeStage = page.getByTestId("workspace-stage-intake").first();
  if (await intakeStage.isVisible().catch(() => false)) {
    await intakeStage.click();
  } else {
    await page.getByRole("button", { name: /^Intake\b/ }).click();
  }
  await page.getByText("Guided Intake").first().waitFor();
  await page.getByTestId("intake-step-destination").click();
  await page
    .getByRole("button", { name: new RegExp(`Open ${escapeRegex(expectedLabel)}`) })
    .first()
    .click();
  await page.locator(preparedCinemaOverlaySelector).getByText(expectedLabel).first().waitFor();
}

export async function switchVisibleCinemaMode(page, label, expectedMode) {
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

export async function openWebsiteDetailsForComparison(page, viewport) {
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

function startWebsiteCalmReadFixtureServer() {
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
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Unable to start Website Cinema calm read fixture server."));
        return;
      }
      resolve({
        stop: () =>
          new Promise((serverResolve) => {
            server.close(serverResolve);
          }),
        url: `http://127.0.0.1:${String(address.port)}/fixture.html`,
      });
    });
  });
}

async function waitForJob(apiBaseUrl, jobId) {
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
