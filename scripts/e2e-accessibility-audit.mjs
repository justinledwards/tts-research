#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  renderReport,
  scanPageAccessibility,
  scanPageLandmarks,
  summarize,
  toFindingsDocument,
} from "./e2e-accessibility-helpers.mjs";
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
  process.env.E2E_ACCESSIBILITY_OUTPUT_DIR ??
  path.join(rootDir, "output", "accessibility", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const findingsPath =
  process.env.E2E_ACCESSIBILITY_FINDINGS_PATH ?? path.join(outputDir, "a11y-findings.json");
const minInteractiveSize = 44;

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "accessibility-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "accessibility-audit.v1",
    status: "failed",
  }).catch(() => {});
  await writeJson(findingsPath, {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "a11y-findings.v1",
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
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const scenarios = [
      {
        colorScheme: "light",
        id: "desktop-default",
        label: "Desktop default",
        reducedMotion: "no-preference",
        settings: null,
        viewport: { height: 980, width: 1440 },
      },
      {
        colorScheme: "dark",
        id: "phone-high-contrast-reduced-motion",
        label: "Phone high contrast and reduced motion",
        reducedMotion: "reduce",
        settings: {
          highContrast: true,
          lineSpacing: "spacious",
          measure: "narrow",
          reducedMotion: true,
          textScale: "giant",
        },
        viewport: { height: 844, width: 390 },
      },
    ];
    const results = [];
    const screenshots = [];
    try {
      for (const scenario of scenarios) {
        const result = await runScenario(browser, scenario);
        results.push(result);
        screenshots.push(result.screenshot);
      }
    } finally {
      await browser.close();
    }

    const summary = summarize(results);
    const document = {
      appBaseUrl,
      apiBaseUrl,
      generatedAt: new Date().toISOString(),
      results,
      schemaVersion: "accessibility-audit.v1",
      screenshots,
      status: summary.failures === 0 ? "passed" : "failed",
      summary,
      scanner: "local-equivalent-dom-audit",
    };
    await writeJson(path.join(outputDir, "accessibility-results.json"), document);
    await writeJson(findingsPath, toFindingsDocument(document));
    await writeFile(path.join(outputDir, "accessibility-report.md"), renderReport(document));
    console.log(`Accessibility audit ${document.status}. Reports written to ${outputDir}`);
    process.exitCode = document.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function runScenario(browser, scenario) {
  const context = await browser.newContext({
    colorScheme: scenario.colorScheme,
    reducedMotion: scenario.reducedMotion,
    viewport: scenario.viewport,
  });
  if (scenario.settings) {
    await context.addInitScript((settings) => {
      window.localStorage.setItem("tts-reader-accessibility-v1", JSON.stringify(settings));
    }, scenario.settings);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const pageIssues = collectPageIssues(page);
  try {
    await page.goto(appBaseUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("body");
    await page.keyboard.press("Tab");
    const focusedAfterTab = await page.evaluate(() =>
      document.activeElement instanceof HTMLElement
        ? document.activeElement.outerText ||
          document.activeElement.getAttribute("aria-label") ||
          document.activeElement.tagName
        : null,
    );
    const scan = await scanPageAccessibility(page, minInteractiveSize);
    const landmarks = await page.evaluate(scanPageLandmarks);
    const screenshot = path.join(screenshotsDir, `${scenario.id}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    return {
      ...scenario,
      browserIssues: blockingPageIssues(pageIssues),
      focusedAfterTab,
      landmarks,
      scan,
      screenshot,
    };
  } finally {
    await context.close();
  }
}
