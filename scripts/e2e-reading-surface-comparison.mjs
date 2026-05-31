import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "output", "reading-surface", "latest");
const phase = resolvePhase(process.argv, process.env.READING_SURFACE_PHASE);
const screenshotDir = path.join(outputDir, phase);

const calmReadText =
  "This local article gives Website Cinema a stable calm-read source.\n\nSource provenance, policy, display settings, and review details should stay discoverable without crowding read mode.\n\nThe final article paragraph confirms the reader canvas remains the dominant surface.";

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  const demoSources = await loadDemoSources();
  const scenarios = buildScenarios(demoSources);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const metrics = [];
  try {
    for (const scenario of scenarios) {
      await page.setContent(renderScenarioHtml(scenario, phase));
      const screenshotPath = path.join(screenshotDir, `${scenario.id}.png`);
      await page.locator("[data-reading-comparison-stage]").screenshot({ path: screenshotPath });
      metrics.push(await collectMetrics(page, scenario, screenshotPath));
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    path.join(screenshotDir, "metrics.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), metrics, phase }, null, 2)}\n`,
  );
  await writeComparisonReport();
  console.log(
    `Reading surface ${phase} comparison written to ${path.relative(rootDir, outputDir)}`,
  );
}

function resolvePhase(argv, envPhase) {
  const flag = argv.find((value) => value.startsWith("--phase="));
  const value = flag ? flag.slice("--phase=".length) : envPhase;
  return value === "before" ? "before" : "after";
}

async function loadDemoSources() {
  const file = await readFile(
    path.join(rootDir, "frontend", "src", "features", "demo", "demoSources.ts"),
    "utf8",
  );
  const sources = [];
  const sourcePattern =
    /\{\s*description:[\s\S]*?id:\s*"(?<id>[^"]+)"[\s\S]*?sampleText:\s*(?<text>"(?:\\.|[^"\\])*")/g;
  for (const match of file.matchAll(sourcePattern)) {
    if (!match.groups) {
      continue;
    }
    sources.push({
      id: match.groups.id,
      sampleText: JSON.parse(match.groups.text),
    });
  }
  return sources;
}

function buildScenarios(demoSources) {
  const byId = new Map(demoSources.map((source) => [source.id, source.sampleText]));
  const reviewText = byId.get("technical-markdown-document") ?? calmReadText;
  const previewText = byId.get("voice-comparison-sample") ?? calmReadText;
  const telepromptText = byId.get("teleprompt-script") ?? calmReadText;
  const theatreText = byId.get("website-article") ?? calmReadText;
  const cueBlocks = telepromptText.split(/\n\n+/).filter(Boolean);
  return [
    {
      id: "review",
      kind: "review",
      sourceText: reviewText,
      spokenText: stripMarkdown(reviewText),
      title: "Review",
    },
    {
      id: "preview",
      kind: "preview",
      sourceText: "Preview Player",
      spokenText: previewText,
      title: "Preview",
    },
    {
      cueBlocks,
      id: "teleprompt",
      kind: "teleprompt",
      sourceText: telepromptText,
      spokenText: cueBlocks[1] ?? cueBlocks[0] ?? telepromptText,
      title: "Teleprompt",
    },
    {
      id: "theatre",
      kind: "theatre",
      sourceText: "Website Cinema Calm Read Fixture",
      spokenText: theatreText,
      title: "Theatre",
    },
  ];
}

function renderScenarioHtml(scenario, phaseName) {
  const after = phaseName === "after";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(scenario.title)} Reading Surface</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #172033;
      --muted: #526071;
      --surface: #fbfcfd;
      --raised: #ffffff;
      --border: #d7dde5;
      --accent: #f97316;
      --reading-source-font-size: 15px;
      --reading-source-line-height: 1.55;
      --reading-source-measure: 82ch;
      --reading-spoken-font-size: 20px;
      --reading-spoken-line-height: 1.66;
      --reading-spoken-measure: 66ch;
      --reading-cue-font-size: 40px;
      --reading-cue-line-height: 1.24;
      --reading-cue-measure: 42ch;
      --reading-theatre-font-size: clamp(42px, 6vw, 78px);
      --reading-theatre-line-height: 1.16;
      --reading-theatre-measure: 24ch;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: ${scenario.kind === "theatre" && after ? "#020617" : "#edf1f6"};
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    [data-reading-comparison-stage] {
      min-height: 900px;
      padding: ${scenario.kind === "theatre" ? "28px" : "32px"};
      background: ${scenario.kind === "theatre" && after ? "#020617" : "#edf1f6"};
    }
    .chrome {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      color: ${scenario.kind === "theatre" && after ? "#cbd5e1" : "var(--muted)"};
    }
    .button, .chip {
      border: 1px solid ${after ? "transparent" : "var(--border)"};
      border-radius: 8px;
      background: ${after ? "transparent" : "var(--raised)"};
      color: inherit;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    .grid {
      display: grid;
      gap: ${after ? "18px" : "12px"};
      grid-template-columns: ${scenario.kind === "review" ? "minmax(0, 0.8fr) minmax(0, 1fr)" : "1fr"};
    }
    .panel {
      border: ${after ? "0" : "1px solid var(--border)"};
      border-radius: ${after ? "6px" : "14px"};
      background: ${scenario.kind === "theatre" && after ? "#020617" : "var(--raised)"};
      box-shadow: ${after ? "none" : "0 18px 44px rgb(15 23 42 / 0.12)"};
      padding: ${after ? "20px" : "18px"};
    }
    .surface {
      max-width: ${after ? "min(100%, var(--measure))" : "min(100%, 96ch)"};
      margin-inline: auto;
      color: var(--surface-ink, var(--ink));
      font-size: ${after ? "var(--font-size)" : "16px"};
      font-weight: ${after ? "470" : "420"};
      line-height: ${after ? "var(--line-height)" : "1.48"};
      letter-spacing: 0;
      overflow-wrap: normal;
      text-wrap: pretty;
    }
    .source {
      --font-size: var(--reading-source-font-size);
      --line-height: var(--reading-source-line-height);
      --measure: var(--reading-source-measure);
      --surface-ink: #263244;
    }
    .spoken {
      --font-size: var(--reading-spoken-font-size);
      --line-height: var(--reading-spoken-line-height);
      --measure: var(--reading-spoken-measure);
      --surface-ink: #111827;
    }
    .cue {
      --font-size: var(--reading-cue-font-size);
      --line-height: var(--reading-cue-line-height);
      --measure: var(--reading-cue-measure);
      --surface-ink: #111827;
      font-weight: 620;
    }
    .theatre {
      --font-size: var(--reading-theatre-font-size);
      --line-height: var(--reading-theatre-line-height);
      --measure: var(--reading-theatre-measure);
      --surface-ink: #f8fafc;
      font-weight: 700;
      text-align: center;
    }
    .active {
      background: #fff7ed;
      box-shadow: ${after ? "-0.2rem 0 0 var(--accent)" : "0 0 0 1px #fed7aa"};
      padding: ${after ? "0.35em 0.75em" : "0.75em"};
    }
    .cue-list {
      display: grid;
      gap: ${after ? "18px" : "10px"};
    }
    .cue-item {
      border: ${after ? "0" : "1px solid var(--border)"};
      border-radius: ${after ? "6px" : "12px"};
      background: ${after ? "transparent" : "var(--raised)"};
      padding: ${after ? "14px 16px" : "14px"};
    }
    .word-active {
      border-radius: 0.18em;
      background: ${after ? "#fb923c" : "#fef3c7"};
      color: ${after ? "#111827" : "inherit"};
      padding: 0 0.12em;
      text-shadow: ${after ? "0 0 0.2em rgb(255 255 255 / 0.4)" : "none"};
    }
  </style>
</head>
<body>
  <main data-reading-comparison-stage>
    <div class="chrome" data-chrome>
      <strong>${escapeHtml(scenario.title)} ${phaseName}</strong>
      <span>
        <span class="chip" data-chrome>Source</span>
        <span class="chip" data-chrome>Spoken</span>
        <span class="button" data-chrome>Play</span>
      </span>
    </div>
    ${renderScenarioBody(scenario)}
  </main>
</body>
</html>`;
}

function renderScenarioBody(scenario) {
  if (scenario.kind === "review") {
    return `<section class="grid">
      <article class="panel">
        <h2>Source display</h2>
        <p class="surface source" data-reading-kind="source">${escapeHtml(scenario.sourceText)}</p>
      </article>
      <article class="panel">
        <h2>Spoken form</h2>
        <p class="surface spoken active" data-reading-active data-reading-kind="spoken">${escapeHtml(
          scenario.spokenText,
        )}</p>
      </article>
    </section>`;
  }
  if (scenario.kind === "preview") {
    return `<section class="panel">
      <p class="surface spoken active" data-reading-active data-reading-kind="spoken">${escapeHtml(
        scenario.spokenText,
      )}</p>
    </section>`;
  }
  if (scenario.kind === "teleprompt") {
    return `<section class="cue-list">
      ${scenario.cueBlocks
        .map((block, index) => {
          const active = index === 1 || (scenario.cueBlocks.length === 1 && index === 0);
          return `<article class="cue-item ${active ? "active" : ""}" ${
            active ? "data-reading-active" : ""
          }>
            <p class="surface cue" data-reading-kind="cue">${escapeHtml(block)}</p>
          </article>`;
        })
        .join("")}
    </section>`;
  }
  return `<section class="panel">
    <p class="surface theatre" data-reading-active data-reading-kind="theatre">${withActiveWord(
      scenario.spokenText,
    )}</p>
  </section>`;
}

async function collectMetrics(page, scenario, screenshotPath) {
  const raw = await page
    .locator("[data-reading-active]")
    .first()
    .evaluate((element) => {
      const target = element.matches("[data-reading-kind]")
        ? element
        : (element.querySelector("[data-reading-kind]") ?? element);
      const effectiveBackgroundColor = (node) => {
        let current = node;
        while (current) {
          const color = getComputedStyle(current).backgroundColor;
          if (!color.endsWith(", 0)") && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
            return color;
          }
          current = current.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const style = getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      const frame = document
        .querySelector("[data-reading-comparison-stage]")
        ?.getBoundingClientRect();
      const chrome = document.querySelectorAll("[data-chrome]").length;
      const borders = [...document.querySelectorAll("*")].filter((candidate) => {
        const candidateStyle = getComputedStyle(candidate);
        return (
          candidateStyle.borderTopStyle !== "none" &&
          Number.parseFloat(candidateStyle.borderTopWidth) > 0
        );
      }).length;
      const activeWord = target.querySelector(".word-active")?.getBoundingClientRect();
      const chProbe = document.createElement("span");
      chProbe.style.cssText =
        "position:absolute;visibility:hidden;pointer-events:none;inline-size:1ch;";
      chProbe.textContent = "0";
      target.append(chProbe);
      const chPx = chProbe.getBoundingClientRect().width || Number.parseFloat(style.fontSize) * 0.5;
      chProbe.remove();
      return {
        activeCueVisible:
          rect.height > 0 &&
          rect.width > 0 &&
          rect.top >= 0 &&
          rect.bottom <= (frame?.bottom ?? window.innerHeight),
        activeWordVisible:
          activeWord === undefined ||
          (activeWord.height > 0 && activeWord.width > 0 && activeWord.top >= 0),
        backgroundColor: effectiveBackgroundColor(target),
        borderCount: borders,
        chromeCount: chrome,
        color: style.color,
        fontSizePx: Number.parseFloat(style.fontSize),
        lineHeightPx: Number.parseFloat(style.lineHeight),
        measureCh: rect.width / chPx,
        measurePx: rect.width,
      };
    });
  return {
    activeCueVisible: raw.activeCueVisible,
    activeWordVisible: raw.activeWordVisible,
    contrast: contrastRatio(raw.color, raw.backgroundColor),
    fontSizePx: Math.round(raw.fontSizePx),
    lineHeightRatio: round(raw.lineHeightPx / raw.fontSizePx),
    measureCh: Math.round(raw.measureCh),
    phase,
    screenshot: path.relative(outputDir, screenshotPath),
    surface: scenario.id,
    visibleChromeCount: raw.borderCount + raw.chromeCount,
  };
}

async function writeComparisonReport() {
  const beforeMetrics = await readMetrics("before");
  const afterMetrics = await readMetrics("after");
  const surfaces = ["review", "preview", "teleprompt", "theatre"];
  const lines = [
    "# Reading Surface Comparison",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Surface | Before | After | Metrics |",
    "| --- | --- | --- | --- |",
  ];
  for (const surface of surfaces) {
    const before = beforeMetrics.get(surface);
    const after = afterMetrics.get(surface);
    lines.push(
      `| ${surface} | ${screenshotLink(before)} | ${screenshotLink(after)} | ${metricsSummary(
        before,
        after,
      )} |`,
    );
  }
  await writeFile(path.join(outputDir, "comparison.md"), `${lines.join("\n")}\n`);
}

async function readMetrics(name) {
  try {
    const content = await readFile(path.join(outputDir, name, "metrics.json"), "utf8");
    const parsed = JSON.parse(content);
    return new Map((parsed.metrics ?? []).map((metric) => [metric.surface, metric]));
  } catch {
    return new Map();
  }
}

function screenshotLink(metric) {
  return metric ? `![${metric.surface} ${metric.phase}](${metric.screenshot})` : "Not captured";
}

function metricsSummary(before, after) {
  const metric = after ?? before;
  if (!metric) {
    return "Not captured";
  }
  const beforePrefix = before
    ? `Before ${before.measureCh}ch, ${before.fontSizePx}px, ${before.contrast}:1 contrast, chrome ${before.visibleChromeCount}. `
    : "";
  const afterPrefix = after
    ? `After ${after.measureCh}ch, ${after.fontSizePx}px, ${after.contrast}:1 contrast, chrome ${after.visibleChromeCount}. `
    : "";
  return `${beforePrefix}${afterPrefix}Active cue ${metric.activeCueVisible ? "visible" : "not visible"}, active word ${metric.activeWordVisible ? "visible" : "not visible"}.`;
}

function stripMarkdown(value) {
  return value
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/^#+\s*/gm, "")
    .replaceAll(/^[-*]\s*/gm, "")
    .trim();
}

function withActiveWord(value) {
  const escaped = escapeHtml(value);
  return escaped.replace(
    /\b(reader|article|speech|source)\b/i,
    '<span class="word-active">$1</span>',
  );
}

function contrastRatio(foreground, background) {
  const fg = rgbFromCss(foreground);
  const bg = rgbFromCss(background);
  if (!fg || !bg || bg.alpha === 0) {
    return 0;
  }
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return round((lighter + 0.05) / (darker + 0.05));
}

function rgbFromCss(value) {
  const match = value.match(
    /rgba?\((?<r>[\d.]+),\s*(?<g>[\d.]+),\s*(?<b>[\d.]+)(?:,\s*(?<a>[\d.]+))?\)/,
  );
  if (!match?.groups) {
    return null;
  }
  return {
    alpha: match.groups.a === undefined ? 1 : Number.parseFloat(match.groups.a),
    blue: Number.parseFloat(match.groups.b),
    green: Number.parseFloat(match.groups.g),
    red: Number.parseFloat(match.groups.r),
  };
}

function relativeLuminance({ red, green, blue }) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function round(value) {
  return Number(value.toFixed(2));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

await main();
