import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function createRunContext({ kind, outputDir: configuredOutputDir, rootDir }) {
  const startedAt = new Date();
  const runId = startedAt.toISOString().replaceAll(/[:.]/g, "-");
  const outputDir =
    configuredOutputDir ??
    process.env.VALIDATE_LOCAL_OUTPUT_DIR ??
    path.join(rootDir, "output", "validate-local", "latest");
  const logsDir = path.join(outputDir, "logs");
  const artifactsDir = path.join(outputDir, "artifacts");

  await rm(outputDir, { force: true, recursive: true });
  await mkdir(logsDir, { recursive: true });
  await mkdir(artifactsDir, { recursive: true });

  return {
    artifactsDir,
    kind,
    logsDir,
    outputDir,
    rootDir,
    runId,
    stepIndex: 0,
    summary: {
      schemaVersion: "validate-local.summary.v1",
      kind,
      runId,
      rootDir,
      outputDir,
      status: "running",
      startedAt: startedAt.toISOString(),
      endedAt: null,
      durationMs: 0,
      steps: [],
      reports: {},
    },
  };
}

export async function runCommandStep(context, step) {
  const index = nextStepIndex(context);
  const logPath = path.join(context.logsDir, `${String(index).padStart(2, "0")}-${step.id}.log`);
  const commandText = formatCommand(step.command, step.args ?? []);
  const startedAt = new Date();
  const result = {
    id: step.id,
    title: step.title,
    type: "command",
    status: "running",
    command: commandText,
    cwd: step.cwd ?? context.rootDir,
    logPath,
    startedAt: startedAt.toISOString(),
    endedAt: null,
    durationMs: 0,
    exitCode: null,
    metrics: null,
    thresholds: [],
    artifacts: step.artifacts ?? {},
    error: null,
  };
  context.summary.steps.push(result);

  const logStream = createWriteStream(logPath, { flags: "a" });
  logStream.write(`# ${step.title}\n`);
  logStream.write(`$ ${commandText}\n\n`);

  const child = spawn(step.command, step.args ?? [], {
    cwd: step.cwd ?? context.rootDir,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? "0",
      ...(step.env ?? {}),
    },
    shell: false,
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    logStream.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    logStream.write(chunk);
  });

  const exitCode = await new Promise((resolve) => {
    child.once("error", (error) => {
      logStream.write(`\nProcess error: ${error.message}\n`);
      result.error = error.message;
      resolve(1);
    });
    child.once("close", resolve);
  });

  logStream.end();
  const endedAt = new Date();
  result.endedAt = endedAt.toISOString();
  result.durationMs = endedAt.getTime() - startedAt.getTime();
  result.exitCode = exitCode;
  result.status = exitCode === 0 ? "passed" : "failed";
  if (exitCode !== 0 && !result.error) {
    result.error = `Command exited with ${String(exitCode)}.`;
  }
  return result;
}

export async function runCallbackStep(context, step, callback) {
  const index = nextStepIndex(context);
  const logPath = path.join(context.logsDir, `${String(index).padStart(2, "0")}-${step.id}.log`);
  const startedAt = new Date();
  const result = {
    id: step.id,
    title: step.title,
    type: "callback",
    status: "running",
    command: step.command ?? step.id,
    cwd: context.rootDir,
    logPath,
    startedAt: startedAt.toISOString(),
    endedAt: null,
    durationMs: 0,
    exitCode: null,
    metrics: null,
    thresholds: [],
    artifacts: {},
    error: null,
  };
  context.summary.steps.push(result);

  const lines = [`# ${step.title}`, ""];
  const log = (line = "") => {
    const text = String(line);
    lines.push(text);
    process.stdout.write(`${text}\n`);
  };

  try {
    const callbackResult = await callback({ log });
    result.metrics = callbackResult?.metrics ?? null;
    result.thresholds = callbackResult?.thresholds ?? [];
    result.artifacts = callbackResult?.artifacts ?? {};
    if (callbackResult?.output) {
      for (const line of String(callbackResult.output).split("\n")) {
        if (line.length > 0) {
          lines.push(line);
        }
      }
    }
    const failedThreshold = result.thresholds.some((threshold) => threshold.passed === false);
    result.exitCode = failedThreshold ? 1 : 0;
    result.status = failedThreshold ? "failed" : "passed";
    if (failedThreshold) {
      result.error = "One or more thresholds failed.";
    }
  } catch (error) {
    result.status = "failed";
    result.exitCode = 1;
    result.error = error instanceof Error ? error.message : String(error);
    lines.push("");
    lines.push(result.error);
  }

  const endedAt = new Date();
  result.endedAt = endedAt.toISOString();
  result.durationMs = endedAt.getTime() - startedAt.getTime();
  await writeFile(logPath, `${lines.join("\n")}\n`);
  return result;
}

export async function finalizeRun(context) {
  const endedAt = new Date();
  const failed = context.summary.steps.some((step) => step.status !== "passed");
  context.summary.status = failed ? "failed" : "passed";
  context.summary.endedAt = endedAt.toISOString();
  context.summary.durationMs = endedAt.getTime() - Date.parse(context.summary.startedAt);
  context.summary.degradedStates = summarizeRunDegradedStates(context.summary.steps);
  context.summary.reports = {
    json: path.join(context.outputDir, "summary.json"),
    markdown: path.join(context.outputDir, "report.md"),
    html: path.join(context.outputDir, "report.html"),
  };

  const markdown = renderMarkdownReport(context.summary);
  const html = renderHTMLReport(context.summary, markdown);
  await writeFile(context.summary.reports.json, `${JSON.stringify(context.summary, null, 2)}\n`);
  await writeFile(context.summary.reports.markdown, markdown);
  await writeFile(context.summary.reports.html, html);
  return context.summary;
}

export function renderThresholdTable(thresholds) {
  if (!thresholds?.length) {
    return "No thresholds.";
  }
  return thresholds
    .map((item) => {
      const status = item.passed ? "PASS" : "FAIL";
      return `${status} ${item.metric}: ${formatMetricValue(item.actual)} ${item.operator} ${formatMetricValue(item.expected)}`;
    })
    .join("\n");
}

export function renderMarkdownReport(summary) {
  const lines = [
    `# ${summary.kind} report`,
    "",
    `Status: **${summary.status.toUpperCase()}**`,
    `Run: \`${summary.runId}\``,
    `Started: ${summary.startedAt}`,
    `Duration: ${formatDuration(summary.durationMs)}`,
    "",
    "## Steps",
    "",
    "| Step | Status | Duration | Log |",
    "| --- | --- | ---: | --- |",
  ];

  for (const step of summary.steps) {
    const log = path.relative(summary.outputDir, step.logPath);
    lines.push(
      `| ${escapeMarkdown(step.title)} | ${step.status.toUpperCase()} | ${formatDuration(
        step.durationMs,
      )} | [log](${encodeURI(log)}) |`,
    );
  }

  lines.push("", "## Degraded States", "", renderDegradedStatesMarkdown(summary.degradedStates));
  lines.push("", "## QA Report Artifacts", "", renderArtifactsMarkdown(summary));

  for (const step of summary.steps.filter((item) => item.thresholds?.length || item.metrics)) {
    lines.push("", `## ${step.title}`, "");
    if (step.metrics) {
      lines.push("```json", JSON.stringify(step.metrics, null, 2), "```", "");
    }
    if (step.thresholds?.length) {
      lines.push("```text", renderThresholdTable(step.thresholds), "```");
    }
    if (step.metrics?.degradedStates) {
      lines.push("", renderDegradedStatesMarkdown(step.metrics.degradedStates));
    }
  }

  const failedSteps = summary.steps.filter((step) => step.status !== "passed");
  if (failedSteps.length > 0) {
    lines.push("", "## Failures", "");
    for (const step of failedSteps) {
      lines.push(`- ${step.title}: ${step.error ?? "failed; see log"}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function renderDegradedStatesMarkdown(degradedStates) {
  if (!degradedStates?.total) {
    return "Degraded states: none.";
  }
  const lines = [`Degraded states: ${String(degradedStates.total)}`];
  for (const item of degradedStates.items ?? []) {
    lines.push(
      `- ${item.name} (${item.surface}, ${item.kind}): ${formatDegradedDetail(item.detail)}`,
    );
  }
  return lines.join("\n");
}

function formatDegradedDetail(detail) {
  const entries = Object.entries(detail ?? {}).filter(([, value]) => value !== null);
  if (entries.length === 0) {
    return "recorded";
  }
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

export function renderHTMLReport(summary, markdown) {
  const title = `${summary.kind} report`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <style>
    body { color: #1f2937; font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f8fafc; }
    main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 56px; }
    h1, h2 { color: #111827; }
    .status { display: inline-flex; border-radius: 999px; padding: 4px 10px; font-weight: 700; background: ${summary.status === "passed" ? "#dcfce7" : "#fee2e2"}; color: ${summary.status === "passed" ? "#166534" : "#991b1b"}; }
    table { border-collapse: collapse; width: 100%; background: white; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
    th { background: #f3f4f6; }
    .section { margin-top: 28px; }
    .passed { color: #166534; font-weight: 700; }
    .failed { color: #991b1b; font-weight: 700; }
    .muted { color: #6b7280; }
    pre { background: #111827; border-radius: 8px; color: #e5e7eb; overflow: auto; padding: 14px; }
    a { color: #c2410c; }
  </style>
</head>
<body>
<main>
  <h1>${escapeHTML(title)}</h1>
  <p><span class="status">${summary.status.toUpperCase()}</span></p>
  <p><strong>Run:</strong> <code>${escapeHTML(summary.runId)}</code><br><strong>Started:</strong> ${escapeHTML(summary.startedAt)}<br><strong>Duration:</strong> ${escapeHTML(formatDuration(summary.durationMs))}</p>
  <h2>Steps</h2>
  <table>
    <thead><tr><th>Step</th><th>Status</th><th>Duration</th><th>Log</th></tr></thead>
    <tbody>
      ${summary.steps
        .map((step) => {
          const log = path.relative(summary.outputDir, step.logPath);
          return `<tr><td>${escapeHTML(step.title)}</td><td>${escapeHTML(
            step.status.toUpperCase(),
          )}</td><td>${escapeHTML(formatDuration(step.durationMs))}</td><td><a href="${escapeHTML(
            encodeURI(log),
          )}">log</a></td></tr>`;
        })
        .join("\n")}
    </tbody>
  </table>
  <section class="section">
    <h2>Degraded States</h2>
    ${renderDegradedStatesHTML(summary.degradedStates)}
  </section>
  <section class="section">
    <h2>QA Report Artifacts</h2>
    ${renderArtifactsHTML(summary)}
  </section>
  <section class="section">
    <h2>Step Details</h2>
    ${renderStepDetailsHTML(summary)}
  </section>
  <h2>Markdown Source</h2>
  <pre>${escapeHTML(markdown)}</pre>
</main>
</body>
</html>
`;
}

export function summarizeRunDegradedStates(steps) {
  const items = [];
  for (const step of steps ?? []) {
    for (const item of step.metrics?.degradedStates?.items ?? []) {
      items.push({
        ...item,
        stepId: step.id,
        stepTitle: step.title,
      });
    }
  }
  const byName = {};
  const bySurface = {};
  for (const item of items) {
    byName[item.name] = (byName[item.name] ?? 0) + 1;
    bySurface[item.surface] = (bySurface[item.surface] ?? 0) + 1;
  }
  return {
    byName,
    bySurface,
    items,
    total: items.length,
  };
}

function renderDegradedStatesHTML(degradedStates) {
  if (!degradedStates?.total) {
    return '<p class="muted">Degraded states: none.</p>';
  }
  return `<table>
    <thead><tr><th>Name</th><th>Surface</th><th>Fixture</th><th>Step</th><th>Detail</th></tr></thead>
    <tbody>
      ${(degradedStates.items ?? [])
        .map(
          (item) =>
            `<tr><td>${escapeHTML(item.name)}</td><td>${escapeHTML(
              item.surface,
            )}</td><td>${escapeHTML(item.kind ?? "-")}</td><td>${escapeHTML(
              item.stepTitle ?? item.stepId ?? "-",
            )}</td><td>${escapeHTML(formatDegradedDetail(item.detail))}</td></tr>`,
        )
        .join("\n")}
    </tbody>
  </table>`;
}

function renderArtifactsMarkdown(summary) {
  const rows = summary.steps.flatMap((step) =>
    Object.entries(step.artifacts ?? {}).map(([name, artifactPath]) => ({
      name,
      path: artifactPath,
      step,
    })),
  );
  if (rows.length === 0) {
    return "No QA artifacts recorded.";
  }
  return [
    "| Step | Artifact | Path |",
    "| --- | --- | --- |",
    ...rows.map((row) => {
      const relativePath = path.relative(summary.outputDir, row.path);
      return `| ${escapeMarkdown(row.step.title)} | ${escapeMarkdown(row.name)} | [${escapeMarkdown(relativePath)}](${encodeURI(relativePath)}) |`;
    }),
  ].join("\n");
}

function renderArtifactsHTML(summary) {
  const rows = summary.steps.flatMap((step) =>
    Object.entries(step.artifacts ?? {}).map(([name, artifactPath]) => ({
      name,
      path: artifactPath,
      step,
    })),
  );
  if (rows.length === 0) {
    return '<p class="muted">No QA artifacts recorded.</p>';
  }
  return `<table>
    <thead><tr><th>Step</th><th>Artifact</th><th>Path</th></tr></thead>
    <tbody>
      ${rows
        .map((row) => {
          const relativePath = path.relative(summary.outputDir, row.path);
          return `<tr><td>${escapeHTML(row.step.title)}</td><td>${escapeHTML(
            row.name,
          )}</td><td><a href="${escapeHTML(encodeURI(relativePath))}">${escapeHTML(
            relativePath,
          )}</a></td></tr>`;
        })
        .join("\n")}
    </tbody>
  </table>`;
}

function renderStepDetailsHTML(summary) {
  const steps = summary.steps.filter((step) => step.thresholds?.length || step.metrics);
  if (steps.length === 0) {
    return '<p class="muted">No metric-bearing steps.</p>';
  }
  return steps
    .map((step) => {
      const thresholds = step.thresholds?.length
        ? `<table>
            <thead><tr><th>Status</th><th>Metric</th><th>Actual</th><th>Operator</th><th>Expected</th></tr></thead>
            <tbody>
              ${step.thresholds
                .map(
                  (item) =>
                    `<tr><td class="${item.passed ? "passed" : "failed"}">${
                      item.passed ? "PASS" : "FAIL"
                    }</td><td>${escapeHTML(item.metric)}</td><td>${escapeHTML(
                      formatMetricValue(item.actual),
                    )}</td><td>${escapeHTML(item.operator)}</td><td>${escapeHTML(
                      formatMetricValue(item.expected),
                    )}</td></tr>`,
                )
                .join("\n")}
            </tbody>
          </table>`
        : '<p class="muted">No thresholds.</p>';
      const degradedStates = step.metrics?.degradedStates
        ? renderDegradedStatesHTML(step.metrics.degradedStates)
        : "";
      const metrics = step.metrics
        ? `<pre>${escapeHTML(JSON.stringify(step.metrics, null, 2))}</pre>`
        : "";
      return `<section class="section"><h3>${escapeHTML(step.title)}</h3>${thresholds}${degradedStates}${metrics}</section>`;
    })
    .join("\n");
}

function nextStepIndex(context) {
  context.stepIndex += 1;
  return context.stepIndex;
}

function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@+-]+$/.test(text) ? text : JSON.stringify(text);
}

export function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return "0ms";
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs).toString()}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatMetricValue(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  return String(value);
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
