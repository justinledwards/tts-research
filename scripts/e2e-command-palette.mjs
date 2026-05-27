#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildCommandMoreCrossAudit,
  contractCommandSearchQueries,
  renderCommandMoreCrossAuditMarkdown,
} from "./command-more-cross-audit.mjs";
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
  process.env.E2E_COMMAND_PALETTE_OUTPUT_DIR ??
  path.join(rootDir, "output", "command-palette", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

const requiredCategories = [
  "Navigation",
  "Project",
  "Source",
  "Voice",
  "Playback",
  "Review",
  "Teleprompt",
  "Settings",
  "Diagnostics",
];

const categoryQueries = {
  Diagnostics: "diagnostics",
  Navigation: "workspace",
  Playback: "create",
  Project: "project",
  Review: "bookmark",
  Settings: "settings",
  Source: "source",
  Teleprompt: "teleprompt",
  Voice: "voice",
};

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "command-palette-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "command-palette-e2e.v1",
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
      `Command Palette QA ${new Date().toISOString()}`,
    );
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const screenshots = [];
    let result;
    try {
      result = await runCommandPaletteAudit(browser, project.id, screenshots);
    } finally {
      await browser.close();
    }
    const document = {
      appBaseUrl,
      generatedAt: new Date().toISOString(),
      result,
      schemaVersion: "command-palette-e2e.v1",
      status: result.passed ? "passed" : "failed",
      summary: {
        categoriesCovered: result.categoriesCovered.length,
        commandsObserved: result.commandsObserved.length,
        crossAuditFindings: 0,
        disabledCommands: result.disabledCommands.length,
        failures: result.failures.length,
        screenshots: screenshots.length,
      },
    };
    const crossAudit = buildCommandMoreCrossAudit({ commandPaletteResults: document });
    document.crossAudit = crossAudit;
    document.summary.crossAuditFindings = crossAudit.findings.length;
    document.status = result.passed && crossAudit.status === "passed" ? "passed" : "failed";
    if (crossAudit.status !== "passed") {
      result.passed = false;
      result.failures.push(...crossAudit.findings.map((finding) => finding.message));
      document.summary.failures = result.failures.length;
    }
    await writeJson(path.join(outputDir, "command-palette-results.json"), document);
    await writeFile(path.join(outputDir, "command-palette-report.md"), renderReport(document));
    await writeJson(path.join(outputDir, "command-more-matrix.json"), crossAudit);
    await writeFile(
      path.join(outputDir, "command-more-matrix.md"),
      renderCommandMoreCrossAuditMarkdown(crossAudit),
    );
    console.log(`Command palette E2E ${document.status}. Reports written to ${outputDir}`);
    process.exitCode = document.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function runCommandPaletteAudit(browser, projectId, screenshots) {
  const context = await browser.newContext({
    storageState: projectStorageState(appBaseUrl, projectId, {
      sourceMode: "text",
      stage: "preview",
      text: workspaceQaText(),
    }),
    viewport: { height: 960, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const pageIssues = collectPageIssues(page);
  const commandsObserved = [];
  const disabledCommands = [];
  const categoriesCovered = new Set();
  const failures = [];
  const capture = async (name) => {
    const screenshot = path.join(screenshotsDir, `${name}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
  };

  try {
    await gotoApp(page, appBaseUrl);
    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await dialog.waitFor();
    await capture("command-palette-open");
    const initialInventory = await collectCommandInventory(dialog);
    commandsObserved.push(...initialInventory.commands);
    disabledCommands.push(...initialInventory.commands.filter((command) => command.disabled));
    for (const category of initialInventory.categories) {
      categoriesCovered.add(category);
    }

    for (const [category, query] of Object.entries(categoryQueries)) {
      const inventory = await searchPalette(page, dialog, query);
      commandsObserved.push(...inventory.commands);
      disabledCommands.push(...inventory.commands.filter((command) => command.disabled));
      if (inventory.categories.includes(category)) {
        categoriesCovered.add(category);
      } else {
        failures.push(`Missing ${category} category for query "${query}".`);
      }
    }
    await capture("command-palette-search");
    const diagnosticsInventory = await searchPalette(page, dialog, "advanced diagnostics");
    commandsObserved.push(...diagnosticsInventory.commands);
    disabledCommands.push(...diagnosticsInventory.commands.filter((command) => command.disabled));
    if (
      !diagnosticsInventory.commands.some((command) =>
        /Advanced: Diagnostics|Advanced: Timing map/i.test(command.title),
      )
    ) {
      failures.push("Command palette did not expose Cinema Advanced/Diagnostics commands.");
    }
    const telepromptTheatreInventory = await searchPalette(page, dialog, "teleprompt theatre");
    commandsObserved.push(...telepromptTheatreInventory.commands);
    disabledCommands.push(
      ...telepromptTheatreInventory.commands.filter((command) => command.disabled),
    );
    if (
      !telepromptTheatreInventory.commands.some((command) =>
        /Open Teleprompt Theatre/i.test(command.title),
      )
    ) {
      failures.push("Command palette did not expose Open Teleprompt Theatre.");
    }

    for (const { commandId, query } of contractCommandSearchQueries()) {
      if (commandId === "command.palette") {
        continue;
      }
      const inventory = await searchPalette(page, dialog, query);
      commandsObserved.push(...inventory.commands);
      disabledCommands.push(...inventory.commands.filter((command) => command.disabled));
      if (!inventory.commands.some((command) => command.id === commandId)) {
        failures.push(`Command palette did not expose ${commandId} for query "${query}".`);
      }
    }

    const disabledWithoutReason = disabledCommands.filter((command) => !command.reason);
    if (disabledWithoutReason.length > 0) {
      failures.push(
        `Disabled commands without visible reason: ${disabledWithoutReason
          .map((command) => command.title)
          .join(", ")}`,
      );
    }

    await searchPalette(page, dialog, "settings");
    const openSettings = dialog.getByRole("option", { name: /Open settings/i }).first();
    await openSettings.click();
    await page.getByText("Studio Settings").first().waitFor();
    await capture("command-palette-open-settings");

    await page.keyboard.press("Escape").catch(() => {});
    await page.keyboard.press("Control+K");
    await dialog.waitFor();
    await dialog.getByRole("button", { exact: true, name: "Shortcuts" }).click();
    await dialog.getByRole("heading", { exact: true, name: "Shortcut cheat sheet" }).waitFor();
    await capture("command-palette-shortcuts");
    await dialog.getByRole("button", { exact: true, name: "Customize in Settings" }).click();
    await page.getByText("Studio Settings").first().waitFor();
    await capture("command-palette-customize-shortcuts");

    const issues = blockingPageIssues(pageIssues);
    if (issues.length > 0) {
      failures.push(...issues);
    }
    for (const category of requiredCategories) {
      if (!categoriesCovered.has(category)) {
        failures.push(`Required category was not covered: ${category}.`);
      }
    }

    return {
      categoriesCovered: [...categoriesCovered].sort(),
      commandsObserved: uniqueCommands(commandsObserved),
      disabledCommands: uniqueCommands(disabledCommands),
      failures,
      passed: failures.length === 0,
    };
  } finally {
    await context.close();
  }
}

async function searchPalette(page, dialog, query) {
  const input = dialog.getByRole("combobox", { name: "Search commands" });
  await input.fill(query);
  await page.waitForTimeout(150);
  return collectCommandInventory(dialog);
}

async function collectCommandInventory(dialog) {
  return dialog.evaluate((element) => {
    const categories = Array.from(element.querySelectorAll("h3"))
      .map((heading) => heading.textContent?.trim() ?? "")
      .filter(Boolean);
    const commands = Array.from(element.querySelectorAll("button[role='option']")).map((button) => {
      const primary = button.children[0];
      const secondary = button.children[1];
      const title =
        primary?.children[0]?.textContent?.trim() ?? button.getAttribute("id") ?? "Unknown command";
      const detail = primary?.children[1]?.textContent?.trim() ?? "";
      const category = secondary?.lastElementChild?.textContent?.trim() ?? "Uncategorized";
      const disabled =
        button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true";
      const reason = disabled ? detail || button.getAttribute("title") || "" : "";
      return {
        category,
        disabled,
        id: button.getAttribute("data-command-id") ?? button.getAttribute("id") ?? "",
        reason,
        shortcutCommandId: button.getAttribute("data-shortcut-command-id") ?? "",
        owner: button.getAttribute("data-command-owner") ?? "",
        title,
      };
    });
    return { categories, commands };
  });
}

function uniqueCommands(commands) {
  const seen = new Set();
  const unique = [];
  for (const command of commands) {
    const key = `${command.id}:${command.title}:${command.category}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(command);
  }
  return unique;
}

function renderReport(document) {
  const lines = [
    "# Command Palette E2E",
    "",
    `Status: **${document.status.toUpperCase()}**`,
    `Generated: ${document.generatedAt}`,
    "",
    "## Coverage",
    "",
    `Categories: ${document.result.categoriesCovered.join(", ")}`,
    `Commands observed: ${String(document.summary.commandsObserved)}`,
    `Disabled commands: ${String(document.summary.disabledCommands)}`,
  ];
  if (document.result.failures.length > 0) {
    lines.push("", "## Findings", "");
    for (const failure of document.result.failures) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
