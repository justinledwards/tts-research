#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  blockingPageIssues,
  collectPageIssues,
  loadPlaywright,
  prepareOutputDir,
  startLocalServices,
  writeJson,
} from "./e2e-browser-qa-helpers.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_RESPONSIVE_OUTPUT_DIR ??
  path.join(rootDir, "output", "accessibility", "latest", "responsive-snapshots");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

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
    appBaseUrl = services.appBaseUrl;
  }

  try {
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const results = [];
    try {
      for (const viewport of viewports) {
        results.push(await captureViewport(browser, viewport));
      }
    } finally {
      await browser.close();
    }
    const failures = results.filter((result) => !result.passed).length;
    const document = {
      appBaseUrl,
      generatedAt: new Date().toISOString(),
      results,
      schemaVersion: "responsive-snapshots.v1",
      status: failures === 0 ? "passed" : "failed",
      summary: {
        failures,
        screenshots: results.length * 2,
        viewports: results.length,
      },
    };
    await writeJson(path.join(outputDir, "responsive-results.json"), document);
    console.log(`Responsive snapshots ${document.status}. Reports written to ${outputDir}`);
    process.exitCode = document.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function captureViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
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

    const layout = await page.evaluate(() => ({
      bodyText: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 400) ?? "",
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 4,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      visibleDialogCount: Array.from(document.querySelectorAll("[role='dialog']")).filter(
        (element) =>
          element instanceof HTMLElement &&
          element.offsetParent !== null &&
          element.getClientRects().length > 0,
      ).length,
    }));
    const issues = blockingPageIssues(pageIssues);
    return {
      id: viewport.id,
      issues,
      layout,
      passed: !layout.horizontalOverflow && issues.length === 0 && layout.bodyText.length > 0,
      screenshots,
      viewport,
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
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }
    if (!(await locator.isVisible().catch(() => false))) {
      continue;
    }
    await locator.click();
    await page.waitForTimeout(250);
    return;
  }
}
