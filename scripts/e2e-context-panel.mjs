#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  blockingPageIssues,
  collectPageIssues,
  createQaProject,
  gotoApp,
  loadPlaywright,
  prepareOutputDir,
  projectStorageState,
  startLocalServices,
  workspaceQaText,
  writeJson,
} from "./e2e-browser-qa-helpers.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_CONTEXT_PANEL_OUTPUT_DIR ??
  path.join(rootDir, "output", "context-panel", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const contextTabIds = ["overview", "review", "diagnostics", "policy", "history"];

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "context-panel-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "context-panel-e2e.v1",
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
    const project = await createQaProject(
      apiBaseUrl,
      `Context Panel QA ${new Date().toISOString()}`,
    );
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const screenshots = [];
    let result;
    try {
      result = await runContextPanelAudit(browser, project.id, screenshots);
    } finally {
      await browser.close();
    }
    const document = {
      appBaseUrl,
      generatedAt: new Date().toISOString(),
      result,
      schemaVersion: "context-panel-e2e.v1",
      status: result.passed ? "passed" : "failed",
      summary: {
        failures: result.failures.length,
        panels: result.panels.length,
        screenshots: screenshots.length,
        tabVisits: result.tabVisits.length,
      },
    };
    await writeJson(path.join(outputDir, "context-panel-results.json"), document);
    await writeFile(path.join(outputDir, "context-panel-report.md"), renderReport(document));
    console.log(`Context panel E2E ${document.status}. Reports written to ${outputDir}`);
    process.exitCode = document.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function runContextPanelAudit(browser, projectId, screenshots) {
  const uiMemory = JSON.stringify({
    cinema: {
      book: { activePanelId: null, mode: "read", pinnedPanelId: null },
      document: { activePanelId: null, mode: "read", pinnedPanelId: null },
      website: { activePanelId: null, mode: "read", pinnedPanelId: null },
    },
    rememberLastProject: true,
    rememberLayout: true,
    rememberPanelPins: false,
    rememberReaderPreferences: true,
    rememberTelepromptReturnTarget: true,
    rememberTheme: true,
    version: 1,
    workspace: {
      layoutMode: "full",
      projectLayoutModes: { [projectId]: "full" },
      reviewPanes: {},
      telepromptReturnStages: {},
    },
  });
  const context = await browser.newContext({
    storageState: projectStorageState(
      appBaseUrl,
      projectId,
      {
        sourceMode: "text",
        stage: "review",
        text: workspaceQaText(),
      },
      { "tts-ui-memory": uiMemory },
    ),
    viewport: { height: 980, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const pageIssues = collectPageIssues(page);
  const failures = [];
  const capture = async (name) => {
    const screenshot = path.join(screenshotsDir, `${name}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
  };

  try {
    await gotoApp(page, appBaseUrl);
    const reviewAction = page.getByRole("button", { exact: true, name: "Review" });
    if (await reviewAction.isVisible().catch(() => false)) {
      await reviewAction.click();
    }
    await page.getByText("Revision Panel").first().waitFor();
    await page.locator("[data-context-panel-surface]").first().waitFor();
    await capture("context-panel-review");

    const tabVisits = [];
    for (const surface of await visiblePanelSurfaces(page)) {
      for (const tabId of contextTabIds) {
        const tab = page.getByTestId(`context-panel-${surface}-${tabId}`).first();
        if (!(await tab.isVisible().catch(() => false))) {
          continue;
        }
        await tab.click();
        await page.waitForTimeout(100);
        const snapshot = await activePanelSnapshot(page, surface, tabId);
        tabVisits.push(snapshot);
        const duplicateKeys = duplicateSectionKeys(snapshot.sections);
        if (duplicateKeys.length > 0) {
          failures.push(
            `${surface} ${tabId} duplicates section kinds/titles: ${duplicateKeys.join(", ")}.`,
          );
        }
        failures.push(...contextPanelGuardrailFailures(snapshot));
      }
    }
    await capture("context-panel-tabs");

    const panels = await collectPanels(page);
    failures.push(...panelOwnershipFailures(panels));
    failures.push(...reviewDiagnosticsDuplicationFailures(tabVisits));
    if (await hasDiagnosticsInNormalReadState(page)) {
      failures.push("Diagnostics context panel appeared in a normal Cinema Read state.");
    }
    const surfaces = new Set(panels.map((panel) => panel.surface));
    if (!surfaces.has("Review")) {
      failures.push("Review context panel was not visible in Review stage.");
    }
    if (!surfaces.has("Workspace")) {
      failures.push("Workspace context panel was not visible in the full right rail.");
    }
    const reviewTabs = new Set(
      tabVisits.filter((visit) => visit.surface === "Review").map((visit) => visit.tabId),
    );
    for (const requiredTab of ["review", "policy", "diagnostics", "history"]) {
      if (!reviewTabs.has(requiredTab)) {
        failures.push(`Review context panel did not expose ${requiredTab} tab.`);
      }
    }
    const issues = blockingPageIssues(pageIssues);
    if (issues.length > 0) {
      failures.push(...issues);
    }

    return {
      failures,
      panels,
      passed: failures.length === 0,
      tabVisits,
    };
  } finally {
    await context.close();
  }
}

async function visiblePanelSurfaces(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-context-panel-surface]"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => element.getAttribute("data-context-panel-surface"))
      .filter(Boolean),
  );
}

async function collectPanels(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-context-panel-surface]"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => ({
        surface: element.getAttribute("data-context-panel-surface") ?? "Unknown",
        title: element.querySelector("h3")?.textContent?.trim() ?? "",
        visibleSections: Array.from(element.querySelectorAll("[data-context-section-kind]")).map(
          (section) => ({
            allowedSurfaces:
              section.getAttribute("data-context-section-allowed-surfaces")?.split(",") ?? [],
            debugOnly: section.getAttribute("data-context-section-debug-only") === "true",
            emptyState: section.getAttribute("data-context-section-empty-state") ?? "",
            kind: section.getAttribute("data-context-section-kind") ?? "",
            owner: section.getAttribute("data-context-section-owner") ?? "",
            panelId: section.getAttribute("data-context-section-panel-id") ?? "",
            relevance: section.getAttribute("data-context-section-relevance") ?? "",
            title: section.querySelector("h4")?.textContent?.trim() ?? "",
          }),
        ),
      })),
  );
}

async function activePanelSnapshot(page, surface, tabId) {
  return page.evaluate(
    ({ panelSurface, panelTabId }) => {
      const panel = Array.from(document.querySelectorAll("[data-context-panel-surface]")).find(
        (element) => element.getAttribute("data-context-panel-surface") === panelSurface,
      );
      return {
        sections: panel
          ? Array.from(panel.querySelectorAll("[data-context-section-kind]")).map((section) => ({
              allowedSurfaces:
                section.getAttribute("data-context-section-allowed-surfaces")?.split(",") ?? [],
              debugOnly: section.getAttribute("data-context-section-debug-only") === "true",
              emptyState: section.getAttribute("data-context-section-empty-state") ?? "",
              kind: section.getAttribute("data-context-section-kind") ?? "",
              owner: section.getAttribute("data-context-section-owner") ?? "",
              panelId: section.getAttribute("data-context-section-panel-id") ?? "",
              relevance: section.getAttribute("data-context-section-relevance") ?? "",
              text: section.textContent?.replace(/\s+/g, " ").trim() ?? "",
              title: section.querySelector("h4")?.textContent?.trim() ?? "",
            }))
          : [],
        surface: panelSurface,
        tabId: panelTabId,
      };
    },
    { panelSurface: surface, panelTabId: tabId },
  );
}

function duplicateSectionKeys(sections) {
  const seen = new Set();
  const duplicates = new Set();
  for (const section of sections) {
    const key = `${section.kind}:${section.title}`;
    if (seen.has(key)) {
      duplicates.add(key);
    }
    seen.add(key);
  }
  return [...duplicates];
}

async function hasDiagnosticsInNormalReadState(page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        "[data-cinema-inspector-mode='read'] [data-context-panel-active-tab='diagnostics']",
      ),
    ).some((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }),
  );
}

function contextPanelGuardrailFailures(snapshot) {
  const failures = [];
  for (const section of snapshot.sections) {
    const label = `${snapshot.surface} ${snapshot.tabId} ${section.title || section.kind}`;
    if (!section.owner) {
      failures.push(`${label} is missing context panel owner metadata.`);
    }
    if (!section.relevance) {
      failures.push(`${label} is missing a relevance predicate.`);
    }
    if (!section.emptyState) {
      failures.push(`${label} is missing empty-state copy.`);
    }
    if (section.panelId !== snapshot.tabId) {
      failures.push(`${label} has panel id ${section.panelId} but rendered in ${snapshot.tabId}.`);
    }
    if (section.allowedSurfaces.length > 0 && !section.allowedSurfaces.includes(snapshot.surface)) {
      failures.push(
        `${label} is only allowed on ${section.allowedSurfaces.join(", ")} but rendered on ${
          snapshot.surface
        }.`,
      );
    }
    if (snapshot.tabId !== "diagnostics" && section.debugOnly) {
      failures.push(`${label} is debug-only but rendered outside Diagnostics.`);
    }
    if (snapshot.tabId === "diagnostics" && !section.debugOnly) {
      failures.push(`${label} is in Diagnostics but is not marked debug-only.`);
    }
    if (section.text.length === 0 && !section.emptyState) {
      failures.push(`${label} is empty without empty-state copy.`);
    }
  }
  return failures;
}

function panelOwnershipFailures(panels) {
  const failures = [];
  for (const panel of panels) {
    for (const section of panel.visibleSections) {
      const label = `${panel.surface} ${section.title || section.kind}`;
      if (!section.allowedSurfaces.includes(panel.surface)) {
        failures.push(`${label} rendered outside its allowed context-panel surface.`);
      }
      if (!section.owner || !section.relevance || !section.emptyState) {
        failures.push(`${label} is missing ownership, relevance, or empty-state metadata.`);
      }
    }
  }
  return failures;
}

function reviewDiagnosticsDuplicationFailures(tabVisits) {
  const failures = [];
  const visitsBySurface = new Map();
  for (const visit of tabVisits) {
    if (!visitsBySurface.has(visit.surface)) {
      visitsBySurface.set(visit.surface, new Map());
    }
    visitsBySurface.get(visit.surface).set(visit.tabId, visit.sections);
  }
  for (const [surface, visits] of visitsBySurface) {
    const reviewSections = visits.get("review") ?? [];
    const diagnosticsSections = visits.get("diagnostics") ?? [];
    const reviewKeys = new Set(reviewSections.map((section) => `${section.kind}:${section.title}`));
    const duplicated = diagnosticsSections
      .map((section) => `${section.kind}:${section.title}`)
      .filter((key) => reviewKeys.has(key));
    if (duplicated.length > 0) {
      failures.push(
        `${surface} duplicates Review and Diagnostics section data: ${duplicated.join(", ")}.`,
      );
    }
  }
  return failures;
}

function renderReport(document) {
  const lines = [
    "# Context Panel E2E",
    "",
    `Status: **${document.status.toUpperCase()}**`,
    `Generated: ${document.generatedAt}`,
    "",
    "## Panels",
    "",
  ];
  for (const panel of document.result.panels) {
    lines.push(`- ${panel.surface}: ${panel.title}`);
  }
  lines.push("", "## Tab Visits", "", `Visited tabs: ${String(document.summary.tabVisits)}`);
  if (document.result.failures.length > 0) {
    lines.push("", "## Findings", "");
    for (const failure of document.result.failures) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
