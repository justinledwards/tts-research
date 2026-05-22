#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
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
  process.env.E2E_ACCESSIBILITY_OUTPUT_DIR ??
  path.join(rootDir, "output", "accessibility", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const findingsPath =
  process.env.E2E_ACCESSIBILITY_FINDINGS_PATH ?? path.join(outputDir, "a11y-findings.json");

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
    const scan = await scanPageAccessibility(page);
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

async function scanPageAccessibility(page) {
  return page.evaluate(() => {
    const visible = (element) =>
      element instanceof HTMLElement &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[aria-hidden='true']") &&
      element.offsetParent !== null &&
      element.getClientRects().length > 0;
    const normalize = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
    const labelledByText = (element) =>
      normalize(
        element
          .getAttribute("aria-labelledby")
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" "),
      );
    const labelsText = (element) => {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        return normalize(Array.from(element.labels ?? [], (label) => label.textContent).join(" "));
      }
      return "";
    };
    const accessibleName = (element) =>
      normalize(
        element.getAttribute("aria-label") ||
          labelledByText(element) ||
          labelsText(element) ||
          element.textContent ||
          element.getAttribute("title") ||
          element.getAttribute("placeholder"),
      );
    const roleFor = (element) => {
      const explicit = element.getAttribute("role");
      if (explicit) {
        return explicit;
      }
      const tagName = element.tagName.toLowerCase();
      if (tagName === "button") {
        return "button";
      }
      if (tagName === "select") {
        return "combobox";
      }
      if (tagName === "a" && element.hasAttribute("href")) {
        return "link";
      }
      if (element instanceof HTMLInputElement) {
        if (element.type === "checkbox") {
          return "checkbox";
        }
        if (element.type === "radio") {
          return "radio";
        }
        return "textbox";
      }
      if (element instanceof HTMLTextAreaElement) {
        return "textbox";
      }
      return null;
    };
    const disabledReason = (element) =>
      normalize(
        element.getAttribute("data-disabled-reason") ||
          element.getAttribute("data-ui-disabled-reason") ||
          element.getAttribute("title") ||
          "",
      );
    const selector = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='switch']",
      "[role='tab']",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const controls = Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const disabled =
          element.disabled === true || element.getAttribute("aria-disabled") === "true";
        return {
          accessibleName: accessibleName(element),
          disabled,
          disabledReason: disabled ? disabledReason(element) : "",
          height: rect.height,
          id:
            element.getAttribute("data-testid") ||
            element.id ||
            `${element.tagName.toLowerCase()}-${String(index)}`,
          role: roleFor(element),
          visibleLabel: normalize(element.textContent || labelsText(element)),
          width: rect.width,
        };
      });
    const issues = [];
    for (const control of controls) {
      const name = control.accessibleName || control.visibleLabel;
      if (!name) {
        issues.push({
          controlId: control.id,
          detail: "Interactive control has no visible or programmatic name.",
          ruleId: "control-name",
          severity: "fail",
        });
      }
      if (control.disabled && !control.disabledReason) {
        issues.push({
          controlId: control.id,
          detail: "Disabled control does not expose a reason.",
          ruleId: "disabled-reason",
          severity: "fail",
        });
      }
      if (control.width < 44 || control.height < 44) {
        issues.push({
          controlId: control.id,
          detail: `Touch target is ${Math.round(control.width)} x ${Math.round(control.height)} px.`,
          ruleId: "touch-target",
          severity: "warning",
        });
      }
      if (!control.role) {
        issues.push({
          controlId: control.id,
          detail: "Interactive control has no explicit or implicit role.",
          ruleId: "control-role",
          severity: "warning",
        });
      }
    }
    for (const image of Array.from(document.images).filter(visible)) {
      if (!image.hasAttribute("alt")) {
        issues.push({
          controlId: image.currentSrc || image.src || "image",
          detail: "Visible images need alt text, even when empty for decorative images.",
          ruleId: "image-alt",
          severity: "fail",
        });
      }
    }
    const liveRegionCount = document.querySelectorAll("[aria-live], [role='status']").length;
    if (liveRegionCount === 0) {
      issues.push({
        controlId: "document",
        detail: "No live status region was found for asynchronous reader or generation updates.",
        ruleId: "live-region",
        severity: "warning",
      });
    }
    return {
      controls,
      controlCount: controls.length,
      failCount: issues.filter((issue) => issue.severity === "fail").length,
      issues,
      liveRegionCount,
      warningCount: issues.filter((issue) => issue.severity === "warning").length,
    };
  });
}

function summarize(results) {
  const failures = results.reduce(
    (total, result) => total + result.scan.failCount + result.browserIssues.length,
    0,
  );
  const warnings = results.reduce((total, result) => total + result.scan.warningCount, 0);
  return {
    controls: results.reduce((total, result) => total + result.scan.controlCount, 0),
    failures,
    scenarios: results.length,
    warnings,
  };
}

function scanPageLandmarks() {
  const countSelector = (selector) =>
    Array.from(document.querySelectorAll(selector)).filter(
      (element) => element instanceof HTMLElement && element.offsetParent !== null,
    ).length;
  const landmarks = {
    banner: countSelector("[role='banner'], header"),
    complementary: countSelector("[role='complementary'], aside"),
    contentinfo: countSelector("[role='contentinfo'], footer"),
    main: countSelector("[role='main'], main"),
    navigation: countSelector("[role='navigation'], nav"),
  };
  const missingPrimaryLandmarks = ["main", "navigation", "contentinfo"].filter(
    (key) => landmarks[key] === 0,
  );
  return { landmarks, missingPrimaryLandmarks };
}

function toFindingsDocument(document) {
  const allIssues = document.results.flatMap((result) => result.scan.issues);
  const browserIssueTotal = document.results.reduce(
    (total, result) => total + result.browserIssues.length,
    0,
  );
  const warningCounts = new Map();
  for (const issue of allIssues.filter((candidate) => candidate.severity === "warning")) {
    const count = warningCounts.get(issue.ruleId) ?? 0;
    warningCounts.set(issue.ruleId, count + 1);
  }

  return {
    generatedAt: document.generatedAt,
    schemaVersion: "a11y-findings.v1",
    status: document.status,
    scanner: document.scanner,
    appBaseUrl: document.appBaseUrl,
    apiBaseUrl: document.apiBaseUrl,
    summary: {
      controls: document.summary.controls,
      failures: document.summary.failures,
      scenarios: document.summary.scenarios,
      warnings: document.summary.warnings,
      browserIssues: browserIssueTotal,
      missingPrimaryLandmarks: document.results.reduce(
        (total, result) => total + result.landmarks.missingPrimaryLandmarks.length,
        0,
      ),
    },
    findings: {
      scenarioResults: document.results.map((result) => ({
        id: result.id,
        label: result.label,
        status:
          result.scan.failCount === 0 && result.browserIssues.length === 0 ? "passed" : "failed",
        focusAfterTab: result.focusedAfterTab,
        browserIssues: result.browserIssues.length,
        landmarkSummary: result.landmarks.landmarks,
        missingPrimaryLandmarks: result.landmarks.missingPrimaryLandmarks,
      })),
      warningCounts: [...warningCounts.entries()].map(([ruleId, count]) => ({
        count,
        ruleId,
      })),
      warnings: allIssues.filter((issue) => issue.severity === "warning"),
      failures: allIssues.filter((issue) => issue.severity === "fail"),
    },
  };
}

function renderReport(document) {
  const lines = [
    "# Accessibility Audit",
    "",
    `Generated: ${document.generatedAt}`,
    `Status: ${document.status}`,
    `Scanner: ${document.scanner}`,
    "",
    "## Summary",
    "",
    `- Scenarios: ${document.summary.scenarios}`,
    `- Controls checked: ${document.summary.controls}`,
    `- Failures: ${document.summary.failures}`,
    `- Warnings: ${document.summary.warnings}`,
    "",
    "## Findings",
    "",
  ];
  for (const result of document.results) {
    lines.push(`### ${result.label}`);
    lines.push(`- Viewport: ${result.viewport.width} x ${result.viewport.height}`);
    lines.push(`- Focus after first Tab: ${result.focusedAfterTab ?? "none"}`);
    lines.push(`- Browser issues: ${result.browserIssues.length}`);
    lines.push(
      `- Primary landmarks observed: main=${String(result.landmarks.landmarks.main)} nav=${String(
        result.landmarks.landmarks.navigation,
      )} contentinfo=${String(result.landmarks.landmarks.contentinfo)}`,
    );
    if (result.scan.issues.length === 0 && result.browserIssues.length === 0) {
      lines.push("- No findings.");
    } else {
      for (const issue of result.scan.issues.slice(0, 30)) {
        lines.push(`- ${issue.severity}: ${issue.ruleId} on ${issue.controlId} - ${issue.detail}`);
      }
      for (const issue of result.browserIssues) {
        lines.push(`- fail: browser issue - ${issue}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
