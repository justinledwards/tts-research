#!/usr/bin/env node

import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedAt = new Date().toISOString();
const gateDir =
  process.env.ACCESSIBILITY_GATE_DIR ?? path.join(rootDir, "output", "accessibility", "latest");
const manualQaSource =
  process.env.ACCESSIBILITY_MANUAL_QA_SOURCE ??
  path.join(rootDir, "docs", "reader-accessibility-qa.md");
const accessibilityAuditOutputDir =
  process.env.ACCESSIBILITY_AUDIT_OUTPUT_DIR ?? process.env.E2E_ACCESSIBILITY_OUTPUT_DIR ?? gateDir;
const responsiveOutputDir =
  process.env.ACCESSIBILITY_RESPONSIVE_OUTPUT_DIR ??
  process.env.E2E_RESPONSIVE_OUTPUT_DIR ??
  path.join(gateDir, "responsive-snapshots");
const accessibilityFindingsSource =
  process.env.E2E_ACCESSIBILITY_FINDINGS_PATH ??
  path.join(accessibilityAuditOutputDir, "a11y-findings.json");
const accessibilityResultsSource =
  process.env.E2E_ACCESSIBILITY_RESULTS_PATH ??
  path.join(accessibilityAuditOutputDir, "accessibility-results.json");
const responsiveResultsSource =
  process.env.E2E_RESPONSIVE_RESULTS_PATH ??
  path.join(responsiveOutputDir, "responsive-results.json");
const responsiveScreenshotsSource =
  process.env.E2E_RESPONSIVE_SCREENSHOTS_PATH ??
  path.join(path.dirname(responsiveResultsSource), "screenshots");

const requiredChecks = [
  { id: "keyboard-only-path", label: "Keyboard-only path" },
  { id: "screen-reader-landmarks", label: "Screen-reader landmarks" },
  { id: "visible-focus", label: "Visible focus" },
  { id: "focus-restore", label: "Focus restore" },
  { id: "shortcut-suppression-inside-inputs", label: "Shortcut suppression inside inputs" },
  { id: "reduced-motion", label: "Reduced motion" },
  { id: "high-contrast", label: "High contrast" },
  { id: "text-scale", label: "Text scale" },
  { id: "line-spacing", label: "Line spacing" },
  { id: "measure-control", label: "Measure control" },
  { id: "touch-target", label: "Touch target size" },
  { id: "mobile-bottom-sheet", label: "Mobile bottom sheet reachability" },
  { id: "viewport-1920", label: "1920x1080/taskbar ergonomics" },
  { id: "viewport-narrow", label: "<1024 px narrow layout" },
  { id: "viewport-constrained", label: "1024-1180 px constrained desktop" },
  { id: "viewport-wide", label: ">1180 px desktop" },
  { id: "keyboard-inaccessible", label: "No control is keyboard-inaccessible" },
  {
    id: "hidden-mobile-actions",
    label: "No hidden mobile action lacks keyboard/touch path",
  },
  {
    id: "focus-return-to-invoking-controls",
    label: "Focus returns to invoking controls after sheets/modals close",
  },
  {
    id: "motion-contrast-combo",
    label: "High contrast and reduced motion work together",
  },
  {
    id: "touch-target-44",
    label: "Critical controls meet 44x44 target",
  },
];

const knownWaivers = parseKnownWaivers();

await mkdir(gateDir, { recursive: true });

await writeGateManualQa(gateDir, manualQaSource, requiredChecks, knownWaivers);
const findings = await resolveFindings();
await writeFile(path.join(gateDir, "a11y-findings.json"), `${JSON.stringify(findings, null, 2)}\n`);
await collectResponsiveArtifacts(gateDir, responsiveResultsSource, responsiveScreenshotsSource);

console.log(`Accessibility package artifacts written to ${gateDir}`);
console.log(`manual-qa: ${path.join(gateDir, "manual-qa.md")}`);
console.log(`findings: ${path.join(gateDir, "a11y-findings.json")}`);
console.log(`responsive: ${path.join(gateDir, "responsive-snapshots")}`);

async function resolveFindings() {
  const findingsFromAudit = await readJsonIfExists(accessibilityFindingsSource);
  if (findingsFromAudit) {
    return {
      ...findingsFromAudit,
      generatedAt: findingsFromAudit.generatedAt ?? generatedAt,
      gate: {
        command: "validate:local",
        requiredChecks,
        knownWaivers,
        generatedAt,
        source: {
          accessibilityResults: accessibilityResultsSource,
          responsiveResults: responsiveResultsSource,
          a11yFindingsSource: accessibilityFindingsSource,
        },
      },
    };
  }

  const accessibilityResults = await readJsonIfExists(accessibilityResultsSource);
  if (!accessibilityResults) {
    return fallbackFindings(accessibilityResults);
  }

  const allIssues = (accessibilityResults.results ?? []).flatMap(
    (result) => result.scan?.issues ?? [],
  );
  const warningCounts = countByRuleId(allIssues.filter((issue) => issue.severity === "warning"));

  return {
    generatedAt,
    schemaVersion: "a11y-findings.v1",
    status: accessibilityResults.status ?? "unknown",
    scanner: accessibilityResults.scanner ?? "local-equivalent-dom-audit",
    appBaseUrl: accessibilityResults.appBaseUrl,
    apiBaseUrl: accessibilityResults.apiBaseUrl,
    summary: {
      controls: accessibilityResults.summary?.controls ?? 0,
      failures: accessibilityResults.summary?.failures ?? 0,
      scenarios: accessibilityResults.results?.length ?? 0,
      warnings: accessibilityResults.summary?.warnings ?? 0,
      browserIssues:
        accessibilityResults.summary?.browserIssues ??
        (accessibilityResults.results ?? []).reduce(
          (total, result) => total + (result.browserIssues?.length ?? 0),
          0,
        ),
      missingPrimaryLandmarks:
        accessibilityResults.results?.reduce(
          (total, result) => total + (result.landmarks?.missingPrimaryLandmarks?.length ?? 0),
          0,
        ) ?? 0,
    },
    findings: {
      scenarioResults: (accessibilityResults.results ?? []).map((result) => ({
        id: result.id,
        label: result.label,
        status:
          result.scan?.failCount === 0 && (result.browserIssues?.length ?? 0) === 0
            ? "passed"
            : "failed",
        focusAfterTab: result.focusedAfterTab,
        browserIssues: result.browserIssues?.length ?? 0,
        landmarkSummary: result.landmarks?.landmarks ?? {},
        missingPrimaryLandmarks: result.landmarks?.missingPrimaryLandmarks ?? [],
      })),
      warningCounts: Object.entries(warningCounts).map(([ruleId, count]) => ({ ruleId, count })),
      warnings: allIssues.filter((issue) => issue.severity === "warning"),
      failures: allIssues.filter((issue) => issue.severity === "fail"),
    },
    gate: {
      command: "validate:local",
      requiredChecks,
      knownWaivers,
      source: {
        accessibilityResults: accessibilityResultsSource,
        responsiveResults: responsiveResultsSource,
        a11yFindingsSource: accessibilityFindingsSource,
      },
      generatedAt,
    },
  };
}

async function collectResponsiveArtifacts(gateRootDir, resultsSource, screenshotsSource) {
  const responsiveGateDir = path.join(gateRootDir, "responsive-snapshots");
  await mkdir(responsiveGateDir, { recursive: true });
  const responsiveResultsTarget = path.join(responsiveGateDir, "responsive-results.json");
  const results = await readJsonIfExists(resultsSource);
  if (results) {
    await writeFile(responsiveResultsTarget, `${JSON.stringify(results, null, 2)}\n`);
  } else {
    await writeFile(
      responsiveResultsTarget,
      `${JSON.stringify(
        {
          generatedAt,
          generatedFromSource: resultsSource,
          schemaVersion: "responsive-snapshots.v1",
          status: "failed",
          summary: {
            failures: 1,
            screenshots: 0,
            viewports: 0,
          },
        },
        null,
        2,
      )}\n`,
    );
  }

  if (await isDirectory(screenshotsSource)) {
    const screenshotsTarget = path.join(responsiveGateDir, "screenshots");
    await cp(screenshotsSource, screenshotsTarget, { recursive: true, force: true });
  }
}

async function writeGateManualQa(gateRootDir, sourcePath, checks, waivers) {
  const source = await readTextIfExists(sourcePath);
  const lines = [
    source?.trim() ? source.trim() : "# Accessibility Manual QA Note",
    "",
    "## UPSILON Manual QA Checklist",
    "",
    `Generated: ${generatedAt}`,
    "",
    "### Required Manual Checks",
    ...checks.map((check) => `- [ ] ${check.label}`),
    "",
    "### Known Waived Issues",
  ];
  if (waivers.length === 0) {
    lines.push("- No known waivers accepted in this gate run.");
  } else {
    lines.push(
      ...waivers.map(
        (waiver) =>
          `- [${waiver.id}] ${waiver.description} (Owner: ${waiver.owner}; Reason: ${waiver.reason})`,
      ),
    );
  }
  await writeFile(path.join(gateRootDir, "manual-qa.md"), `${lines.join("\n")}\n`);
}

function fallbackFindings(resultSource = null) {
  return {
    generatedAt,
    schemaVersion: "a11y-findings.v1",
    status: "failed",
    scanner: "local-equivalent-dom-audit",
    source: resultSource ?? {},
    summary: {
      controls: 0,
      failures: 1,
      scenarios: 0,
      warnings: 0,
      browserIssues: 0,
      missingPrimaryLandmarks: 0,
    },
    findings: {
      scenarioResults: [],
      warningCounts: [],
      warnings: [],
      failures: [
        {
          controlId: "accessibility-script",
          detail: `Unable to load accessibility audit source: ${accessibilityFindingsSource}.`,
          ruleId: "missing-findings-source",
          severity: "fail",
        },
      ],
    },
    gate: {
      command: "validate:local",
      requiredChecks,
      knownWaivers,
      source: {
        accessibilityResults: accessibilityResultsSource,
        responsiveResults: responsiveResultsSource,
        a11yFindingsSource: accessibilityFindingsSource,
      },
      generatedAt,
    },
  };
}

function countByRuleId(issues) {
  const counts = new Map();
  for (const issue of issues) {
    const key = issue?.ruleId ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts.entries());
}

async function readJsonIfExists(value) {
  try {
    return JSON.parse(await readFile(value, "utf8"));
  } catch {
    return null;
  }
}

async function readTextIfExists(value) {
  try {
    return await readFile(value, "utf8");
  } catch {
    return "";
  }
}

async function isDirectory(value) {
  try {
    const info = await stat(value);
    return info.isDirectory();
  } catch {
    return false;
  }
}

function parseKnownWaivers() {
  const env = process.env.ACCESSIBILITY_KNOWN_WAIVERS_JSON;
  if (!env) {
    return [
      {
        id: "none",
        description: "No known waived issues for this gate run.",
        owner: "Accessibility QA owner",
        reason: "No issue is currently waived for release.",
      },
    ];
  }
  try {
    const parsed = JSON.parse(env);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [
      {
        id: "invalid-waivers-config",
        description: "Unable to parse ACCESSIBILITY_KNOWN_WAIVERS_JSON",
        owner: "Accessibility QA owner",
        reason: "Fix CI/local waiver JSON format.",
      },
    ];
  }
}
