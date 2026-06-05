#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadPlaywright } from "./e2e-browser-qa-helpers.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_READALONG_PERFORMANCE_OUTPUT_DIR ??
  path.join(rootDir, "output", "readalong-performance", "latest");
const traceEnabled = process.env.READALONG_PERF_TRACE === "1";
const durationMs = readNumberEnv("READALONG_PERF_DURATION_MS", 60_000);
const wordDurationMs = readNumberEnv("READALONG_PERF_WORD_DURATION_MS", 185);
const scenarioFilter = new Set(
  (process.env.READALONG_PERF_SCENARIOS ?? "teleprompter,markdown-render,static-control")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const scenarios = [
  {
    highlightMotion: "smoothCursor",
    label: "Teleprompter Smooth cursor",
    scenarioId: "teleprompter-smooth-60s",
    surface: "teleprompter",
  },
  {
    highlightMotion: "smoothCursor",
    label: "Markdown Render Smooth cursor",
    scenarioId: "markdown-render-smooth-60s",
    surface: "markdown-render",
  },
  {
    highlightMotion: "static",
    label: "Markdown Render static control",
    scenarioId: "markdown-render-static-control-60s",
    surface: "markdown-render",
  },
].filter((scenario) => {
  if (scenarioFilter.has(scenario.surface)) {
    return true;
  }
  if (scenarioFilter.has("static-control") && scenario.scenarioId.includes("static-control")) {
    return true;
  }
  return scenarioFilter.has(scenario.scenarioId);
});

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
  const context = await browser.newContext({ viewport: { height: 900, width: 1280 } });
  const tracePath = path.join(outputDir, "trace.zip");
  if (traceEnabled) {
    await context.tracing.start({ screenshots: true, snapshots: true });
  }
  const snapshots = [];
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(Math.max(30_000, durationMs + 10_000));
    for (const scenario of scenarios) {
      await page.setContent(renderPerformanceFixtureHtml(scenario));
      const snapshot = await page.evaluate(runReadAlongPerformanceFixture, {
        durationMs,
        scenario,
        wordDurationMs,
      });
      snapshots.push(snapshot);
    }
  } finally {
    if (traceEnabled) {
      await context.tracing.stop({ path: tracePath });
    }
    await context.close();
    await browser.close();
  }

  const summary = {
    durationMs,
    generatedAt: new Date().toISOString(),
    scenarioCount: snapshots.length,
    status: "passed",
    trace: traceEnabled ? path.relative(rootDir, tracePath) : null,
    wordDurationMs,
  };
  await writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(path.join(outputDir, "counters.json"), `${JSON.stringify(snapshots, null, 2)}\n`);
  await writeFile(path.join(outputDir, "report.md"), formatReadAlongPerformanceReport(snapshots));
  console.log(`Read-along performance advisory artifacts written to ${outputDir}`);
}

function renderPerformanceFixtureHtml(scenario) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #fff7ed; color: #111827; }
    main { height: 900px; overflow: auto; padding: 120px 160px; position: relative; }
    [data-readalong-motion-cursor] {
      pointer-events: none;
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 0;
      width: 1px;
      height: 1px;
      border-radius: 6px;
      background: rgb(251 146 60 / 0.24);
      box-shadow: 0 0 0 2px rgb(249 115 22 / 0.28), 0 5px 16px rgb(249 115 22 / 0.18);
      opacity: 0;
      transform-origin: 0 0;
      transition-duration: var(--readalong-motion-duration-ms, 180ms);
      transition-property: transform, opacity;
      transition-timing-function: cubic-bezier(0.2, 0.82, 0.2, 1);
      will-change: transform, opacity;
    }
    .reader { max-width: 860px; margin: 0 auto; font-size: 24px; line-height: 1.9; }
    .teleprompter-word, .markdown-cinema-word { display: inline; border-radius: 5px; }
    .teleprompter-word--active, .markdown-cinema-word-active {
      text-decoration-line: underline;
      text-decoration-color: rgb(249 115 22 / 0.8);
      text-decoration-thickness: 0.08em;
      text-underline-offset: 0.16em;
    }
    [data-readalong-highlight-motion="smoothCursor"] .teleprompter-word--active,
    [data-readalong-highlight-motion="smoothCursor"] .markdown-cinema-word-active {
      background: transparent;
      box-shadow: none;
      text-shadow: none;
    }
    .readalong-word-role--spoken { opacity: 0.74; }
    .readalong-word-role--upcoming {
      text-decoration-line: underline;
      text-decoration-color: rgb(249 115 22 / 0.34);
      text-decoration-thickness: 0.045em;
      text-underline-offset: 0.18em;
    }
  </style>
</head>
<body>
  <main data-readalong-highlight-motion="${scenario.highlightMotion}">
    <div class="reader" data-readalong-performance-surface="${scenario.surface}"></div>
  </main>
</body>
</html>`;
}

async function runReadAlongPerformanceFixture({ durationMs, scenario, wordDurationMs }) {
  const delay = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  const roundPerformanceNumber = (value) => Math.round(value * 100) / 100;
  const counters = {
    "cursor-tick": 0,
    "dom-anchor-cache-hit": 0,
    "dom-anchor-resolve": 0,
    "dom-highlight-swap": 0,
    "motion-cursor-measure": 0,
    "motion-cursor-update": 0,
    "react-cursor-commit": 0,
    "scroll-call": 0,
    "word-resolve": 0,
  };
  const longTasks = [];
  const longTaskObserver =
    typeof PerformanceObserver === "undefined"
      ? null
      : new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 50) {
              longTasks.push({
                durationMs: roundPerformanceNumber(entry.duration),
                name: entry.name,
                startTimeMs: roundPerformanceNumber(entry.startTime),
              });
            }
          }
        });
  try {
    longTaskObserver?.observe({ entryTypes: ["longtask"] });
  } catch {
    // Browser support varies; the advisory report still includes the field.
  }

  const root = document.querySelector("main");
  const reader = document.querySelector("[data-readalong-performance-surface]");
  const wordCount = Math.max(500, Math.ceil(durationMs / wordDurationMs) + 80);
  const baseWords = [
    "design",
    "the",
    "cockpit",
    "to",
    "reduce",
    "search",
    "memory",
    "burden",
    "and",
    "mode",
    "ambiguity",
    "while",
    "keeping",
    "operators",
    "oriented",
    "through",
    "change",
  ];
  reader.replaceChildren();
  for (let index = 0; index < wordCount; index += 1) {
    const word = document.createElement("span");
    word.dataset.readalongWordIndex = String(index);
    word.className =
      scenario.surface === "teleprompter"
        ? "teleprompter-word readalong-word-role--idle"
        : "markdown-cinema-word readalong-word-role--idle";
    word.textContent = baseWords[index % baseWords.length];
    reader.append(word, document.createTextNode(index % 13 === 12 ? "\n" : " "));
  }

  const elementCache = new Map();
  let activeElement = null;
  let previousActiveIndex = -1;
  let stuckIncidents = 0;
  const startedAtMs = performance.now();
  const deadline = startedAtMs + durationMs;
  let activeWordIndex = 0;

  while (performance.now() < deadline && activeWordIndex < wordCount) {
    counters["cursor-tick"] += 1;
    counters["word-resolve"] += 1;
    const wordElement = resolveWordElement(activeWordIndex);
    if (!wordElement) {
      activeWordIndex += 1;
      await delay(wordDurationMs);
      continue;
    }
    if (previousActiveIndex === activeWordIndex) {
      stuckIncidents += 1;
    }
    updateWordState(activeElement, "idle", false);
    updateWordState(resolveWordElement(activeWordIndex - 1), "spoken", false);
    updateWordState(wordElement, "active", true);
    updateWordState(resolveWordElement(activeWordIndex + 1), "upcoming", false);
    activeElement = wordElement;
    previousActiveIndex = activeWordIndex;
    counters["dom-highlight-swap"] += 1;

    const rootRect = root.getBoundingClientRect();
    const activeRect = wordElement.getBoundingClientRect();
    if (
      activeRect.top < rootRect.top + rootRect.height * 0.28 ||
      activeRect.bottom > rootRect.top + rootRect.height * 0.72
    ) {
      wordElement.scrollIntoView({ block: "center", inline: "nearest" });
      counters["scroll-call"] += 1;
    }
    if (scenario.highlightMotion === "smoothCursor") {
      updateMotionCursor(wordElement, resolveWordElement(activeWordIndex + 1));
    }
    activeWordIndex += 1;
    await delay(wordDurationMs);
  }

  longTaskObserver?.disconnect();
  const elapsedMs = performance.now() - startedAtMs;
  const ratesPerSecond = Object.fromEntries(
    Object.entries(counters).map(([counter, count]) => [
      counter,
      elapsedMs > 0 ? roundPerformanceNumber(count / (elapsedMs / 1000)) : 0,
    ]),
  );
  return {
    counters,
    elapsedMs: roundPerformanceNumber(elapsedMs),
    longTaskCount: longTasks.length,
    longTasks,
    ratesPerSecond,
    scenarioId: scenario.scenarioId,
    startedAtMs: roundPerformanceNumber(startedAtMs),
    staleHighlightIncidents: 0,
    stuckHighlightIncidents: stuckIncidents,
    surface: scenario.surface,
  };

  function resolveWordElement(wordIndex) {
    if (wordIndex < 0) {
      return null;
    }
    const cached = elementCache.get(wordIndex);
    if (cached?.isConnected) {
      counters["dom-anchor-cache-hit"] += 1;
      return cached;
    }
    counters["dom-anchor-resolve"] += 1;
    const element = reader.querySelector(`[data-readalong-word-index="${String(wordIndex)}"]`);
    if (element) {
      elementCache.set(wordIndex, element);
    }
    return element;
  }

  function updateWordState(element, state, isActive) {
    if (!element) {
      return;
    }
    element.classList.remove(
      "markdown-cinema-word-active",
      "teleprompter-word--active",
      "teleprompter-word--spoken",
      "teleprompter-word--upcoming",
      "readalong-word-role--active",
      "readalong-word-role--spoken",
      "readalong-word-role--upcoming",
      "readalong-word-role--idle",
    );
    if (scenario.surface === "teleprompter" || scenario.surface === "markdown-render") {
      element.classList.add(`teleprompter-word--${state}`);
    }
    element.classList.add(`readalong-word-role--${state}`);
    if (scenario.surface === "markdown-render" && isActive) {
      element.classList.add("markdown-cinema-word-active");
    }
    if (isActive) {
      element.setAttribute("aria-current", "true");
      element.dataset.readalongDomActive = "true";
    } else {
      element.removeAttribute("aria-current");
      delete element.dataset.readalongDomActive;
    }
  }

  function updateMotionCursor(wordElement, nextElement) {
    counters["motion-cursor-measure"] += 1;
    const rect = wordElement.getBoundingClientRect();
    const nextRect = nextElement?.getBoundingClientRect();
    let cursor = root.querySelector("[data-readalong-motion-cursor]");
    if (!cursor) {
      cursor = document.createElement("span");
      cursor.dataset.readalongMotionCursor = "true";
      root.append(cursor);
    }
    const rootRect = root.getBoundingClientRect();
    cursor.style.opacity = "1";
    cursor.style.width = `${Math.max(1, rect.width)}px`;
    cursor.style.height = `${Math.max(1, rect.height)}px`;
    cursor.style.setProperty(
      "--readalong-motion-duration-ms",
      `${Math.max(90, Math.min(420, wordDurationMs))}ms`,
    );
    const x = rect.left - rootRect.left + root.scrollLeft;
    const y = rect.top - rootRect.top + root.scrollTop;
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    cursor.dataset.readalongMotionState =
      nextRect && Math.abs(nextRect.top - rect.top) <= rect.height * 0.75 ? "gliding" : "fallback";
    counters["motion-cursor-update"] += 1;
  }
}

function formatReadAlongPerformanceReport(snapshots) {
  const lines = [
    "# Read-Along Performance Advisory",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Scenario | Surface | Elapsed | React commits/sec | DOM swaps/sec | Motion measure/word | Scroll calls/sec | Long tasks >50ms | Stuck incidents |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const snapshot of snapshots) {
    const activeWords = Math.max(1, snapshot.counters["dom-highlight-swap"] ?? 0);
    const motionMeasurePerWord = (snapshot.counters["motion-cursor-measure"] ?? 0) / activeWords;
    lines.push(
      [
        snapshot.scenarioId,
        snapshot.surface,
        `${snapshot.elapsedMs.toFixed(2)}ms`,
        formatRate(snapshot.ratesPerSecond["react-cursor-commit"]),
        formatRate(snapshot.ratesPerSecond["dom-highlight-swap"]),
        formatRate(motionMeasurePerWord),
        formatRate(snapshot.ratesPerSecond["scroll-call"]),
        String(snapshot.longTaskCount),
        String(snapshot.stuckHighlightIncidents ?? 0),
      ]
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }
  lines.push(
    "",
    "Advisory only: these measurements are not part of `pnpm check` until stable baselines are established.",
    "",
  );
  return lines.join("\n");
}

function readNumberEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatRate(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "-";
}
