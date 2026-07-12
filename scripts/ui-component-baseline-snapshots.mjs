#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.UI_COMPONENT_BASELINE_OUTPUT_DIR ??
  path.join(rootDir, "output", "ui-component-baseline", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");

const modes = [
  { id: "light", label: "Light", theme: "light" },
  { id: "dark", label: "Dark", theme: "dark" },
  { id: "theatre", label: "Theatre", theme: "theatre" },
  { highContrast: true, id: "high-contrast", label: "High Contrast", theme: "light" },
];

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify({ error: message, status: "failed" }, null, 2)}\n`,
  ).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
  const screenshots = [];
  try {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: { height: 900, width: 1280 } });
      await page.setContent(renderBaselineHtml(mode), { waitUntil: "load" });
      const screenshotPath = path.join(screenshotsDir, `${mode.id}.png`);
      await page.screenshot({ fullPage: true, path: screenshotPath });
      screenshots.push(screenshotPath);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  await writeFile(path.join(outputDir, "index.html"), renderBaselineHtml(modes[0]));
  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        modes: modes.map((mode) => mode.id),
        schemaVersion: "ui-component-baseline.v1",
        screenshots,
        status: "passed",
      },
      null,
      2,
    )}\n`,
  );
  console.log(`UI component baseline snapshots written to ${outputDir}`);
}

function renderBaselineHtml(mode) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Voice Studio UI Component Baseline</title>
    <style>
      ${baselineCss()}
    </style>
  </head>
  <body data-theme="${mode.theme}" data-contrast="${mode.highContrast ? "high" : "normal"}">
    <main class="page">
      <header class="header">
        <div>
          <p class="eyebrow">${mode.label} Baseline</p>
          <h1>Voice Studio Component Baseline</h1>
          <p class="muted">Semantic layers, buttons, chips, panels, disabled states, and Theatre share one token system.</p>
        </div>
        <button class="button primary">Create & Listen</button>
      </header>
      <section class="grid roles">
        <article class="panel shell"><p class="eyebrow">App shell</p><h3>Chrome</h3><p class="muted">Navigation and global frame.</p></article>
        <article class="panel workbench"><p class="eyebrow">Workbench</p><h3>Active workspace</h3><p class="muted">Main task context.</p></article>
        <article class="panel work-surface"><p class="eyebrow">Work surface</p><h3>Primary task</h3><p class="muted">Current editing or creation area.</p></article>
        <article class="panel inspector"><p class="eyebrow">Inspector</p><h3>Secondary detail</h3><p class="muted">Context and diagnostics.</p></article>
        <article class="panel management"><p class="eyebrow">Management</p><h3>Settings</h3><p class="muted">Configuration and maintenance.</p></article>
        <article class="panel status-strip"><p class="eyebrow">Recovery strip</p><h3>Status</h3><p class="muted">Attention and next action.</p></article>
      </section>
      <section class="grid two">
        <article class="panel">
          <p class="eyebrow">Buttons</p>
          <div class="row">
            <button class="button primary">Primary</button>
            <button class="button secondary">Secondary</button>
            <button class="button soft">Preview</button>
            <button class="button warning">Warning</button>
            <button class="button ghost">Ghost</button>
            <button class="button destructive">Cancel</button>
            <button class="button secondary" disabled data-disabled-reason="Select a ready source first.">Disabled</button>
          </div>
        </article>
        <article class="panel">
          <p class="eyebrow">Modes</p>
          <div class="segmented" role="group" aria-label="Stage">
            <button class="button mode">Intake</button>
            <button class="button mode selected">Review</button>
            <button class="button mode">Preview</button>
            <button class="button mode">Teleprompt</button>
          </div>
        </article>
        <article class="panel">
          <p class="eyebrow">Toggles</p>
          <label class="toggle">
            <span><strong>High contrast</strong><small>Reader preference, saved locally.</small></span>
            <input type="checkbox" ${mode.highContrast ? "checked" : ""} />
          </label>
          <label class="toggle">
            <span><strong>Arrival playback</strong><small>Play completed audio as it arrives.</small></span>
            <input type="checkbox" checked />
          </label>
        </article>
        <article class="panel pinned">
          <p class="eyebrow">Status</p>
          <div class="row">
            <span class="chip selected">Selected</span>
            <span class="chip metadata">Metadata</span>
            <span class="chip success">Ready</span>
            <span class="chip warning">Pending</span>
            <span class="chip danger">Failed</span>
            <span class="chip pinned">Pinned</span>
            <span class="chip disabled">Disabled</span>
          </div>
        </article>
      </section>
      <section class="drawer-preview">
        <aside class="drawer">
          <header>
            <div>
              <p class="eyebrow">Drawer</p>
              <h2>Studio Settings</h2>
            </div>
            <button class="button ghost">Close</button>
          </header>
          <article class="panel">
            <p class="eyebrow">Panel</p>
            <h3>Run</h3>
            <p class="muted">Shared panel padding, border, focus, disabled, selected, and pinned states.</p>
          </article>
        </aside>
      </section>
    </main>
  </body>
</html>`;
}

function baselineCss() {
  return `
    :root {
      --vs-bg: #f7f1e8;
      --vs-shell: #f7f1e8;
      --vs-workbench: #fbf7f1;
      --vs-surface: #f4eadc;
      --vs-raised: #fffdf9;
      --vs-management: #f1e4d4;
      --vs-inspector: #f9f1e7;
      --vs-status-strip: #fff4e6;
      --vs-metadata: #efe2d1;
      --vs-alert: #fff4f1;
      --vs-text: #17130f;
      --vs-muted: #6d5f52;
      --vs-border: #e4d5c2;
      --vs-border-strong: #d1b690;
      --vs-accent: #c2410c;
      --vs-accent-text: #fffaf5;
      --vs-soft: #fff3e5;
      --vs-soft-hover: #fee5ca;
      --vs-soft-text: #85340a;
      --vs-soft-border: #e3aa70;
      --vs-focus-ring: #b45309;
      --vs-focus-ring-soft: rgb(251 146 60 / 0.28);
      --vs-selected: #fff1df;
      --vs-selected-border: #d78337;
      --vs-selected-text: #7c2d12;
      --vs-pinned: #f7ead5;
      --vs-pinned-border: #b8894b;
      --vs-pinned-text: #5f3d14;
      --vs-disabled-bg: #eee3d4;
      --vs-disabled-text: #66584c;
      --vs-disabled-border: #d7c7b3;
      --vs-danger: #b42318;
      --vs-danger-soft: #fff1f0;
      --vs-danger-border: #df938b;
      --vs-success: #047857;
      --vs-success-soft: rgb(16 185 129 / 0.1);
      --vs-success-border: #96d8c5;
      --vs-warning: #763900;
      --vs-warning-soft: #fff2cc;
      --vs-warning-border: #d39b36;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    [data-theme="dark"] {
      color-scheme: dark;
      --vs-bg: #0d0b09;
      --vs-shell: #0d0b09;
      --vs-workbench: #14110e;
      --vs-surface: #231d17;
      --vs-raised: #1c1712;
      --vs-management: #211a14;
      --vs-inspector: #18130f;
      --vs-status-strip: #18130f;
      --vs-metadata: #2a221b;
      --vs-alert: #261613;
      --vs-text: #fff7ed;
      --vs-muted: #c7b29f;
      --vs-border: rgb(255 237 213 / 0.14);
      --vs-border-strong: rgb(255 237 213 / 0.2);
      --vs-accent: #fb923c;
      --vs-accent-text: #1e1208;
      --vs-soft: rgb(251 146 60 / 0.14);
      --vs-soft-hover: rgb(251 146 60 / 0.22);
      --vs-soft-text: #fed7aa;
      --vs-soft-border: rgb(251 146 60 / 0.44);
      --vs-focus-ring-soft: rgb(251 146 60 / 0.24);
      --vs-selected: rgb(249 115 22 / 0.18);
      --vs-selected-border: rgb(251 146 60 / 0.6);
      --vs-selected-text: #fed7aa;
      --vs-pinned: rgb(250 204 21 / 0.14);
      --vs-pinned-border: rgb(250 204 21 / 0.48);
      --vs-pinned-text: #fde68a;
      --vs-disabled-bg: #2d261f;
      --vs-disabled-text: #ad9b8b;
      --vs-disabled-border: #3b322b;
      --vs-danger: #fca5a5;
      --vs-danger-soft: rgb(239 68 68 / 0.16);
      --vs-danger-border: rgb(248 113 113 / 0.54);
      --vs-success: #6ee7b7;
      --vs-success-soft: rgb(16 185 129 / 0.16);
      --vs-success-border: rgb(52 211 153 / 0.52);
      --vs-warning: #fbbf24;
      --vs-warning-soft: rgb(245 158 11 / 0.18);
      --vs-warning-border: rgb(251 191 36 / 0.58);
    }
    [data-theme="theatre"] {
      color-scheme: dark;
      --vs-bg: #050505;
      --vs-shell: #050505;
      --vs-workbench: #050505;
      --vs-surface: rgb(255 247 237 / 0.08);
      --vs-raised: rgb(5 5 5 / 0.94);
      --vs-management: rgb(255 247 237 / 0.1);
      --vs-inspector: rgb(255 247 237 / 0.07);
      --vs-status-strip: rgb(5 5 5 / 0.96);
      --vs-metadata: rgb(255 247 237 / 0.09);
      --vs-alert: rgb(127 29 29 / 0.26);
      --vs-text: #fff7ed;
      --vs-muted: #d6c4b2;
      --vs-border: rgb(255 247 237 / 0.18);
      --vs-border-strong: rgb(251 146 60 / 0.56);
      --vs-accent: #fb923c;
      --vs-accent-text: #1f1308;
      --vs-soft: rgb(251 146 60 / 0.14);
      --vs-soft-hover: rgb(251 146 60 / 0.22);
      --vs-soft-text: #fed7aa;
      --vs-soft-border: rgb(251 146 60 / 0.44);
      --vs-selected: rgb(251 146 60 / 0.18);
      --vs-selected-border: rgb(251 146 60 / 0.6);
      --vs-selected-text: #fed7aa;
      --vs-pinned: rgb(250 204 21 / 0.14);
      --vs-pinned-border: rgb(250 204 21 / 0.48);
      --vs-pinned-text: #fde68a;
      --vs-disabled-bg: rgb(255 247 237 / 0.1);
      --vs-disabled-text: #cdbba9;
      --vs-disabled-border: rgb(255 247 237 / 0.14);
      --vs-danger: #fca5a5;
      --vs-danger-soft: rgb(239 68 68 / 0.16);
      --vs-danger-border: rgb(248 113 113 / 0.54);
      --vs-success: #86efac;
      --vs-success-soft: rgb(34 197 94 / 0.16);
      --vs-success-border: rgb(74 222 128 / 0.5);
      --vs-warning: #fde68a;
      --vs-warning-soft: rgb(245 158 11 / 0.2);
      --vs-warning-border: rgb(251 191 36 / 0.58);
    }
    [data-contrast="high"] {
      --vs-bg: #ffffff;
      --vs-surface: #ffffff;
      --vs-raised: #ffffff;
      --vs-text: #000000;
      --vs-muted: #1f2937;
      --vs-border: #000000;
      --vs-focus-ring: #000000;
      --vs-selected: #fff7ed;
      --vs-selected-border: #9a3412;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--vs-bg); color: var(--vs-text); }
    button, input { font: inherit; }
    .page { display: grid; gap: 24px; padding: 32px; }
    .header, .panel, .drawer { border: 1px solid var(--vs-border); background: var(--vs-raised); border-radius: 8px; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 20px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; }
    h2 { font-size: 18px; }
    h3 { margin-top: 8px; font-size: 16px; }
    .muted { color: var(--vs-muted); margin-top: 8px; line-height: 1.5; }
    .eyebrow { color: var(--vs-muted); font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
    .grid { display: grid; gap: 16px; }
    .roles { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .panel { padding: 16px; }
    .panel.shell { background: var(--vs-shell); }
    .panel.workbench { background: var(--vs-workbench); }
    .panel.work-surface { background: var(--vs-raised); }
    .panel.inspector { background: var(--vs-inspector); }
    .panel.management { border-color: var(--vs-border-strong); background: var(--vs-management); }
    .panel.status-strip { border-color: var(--vs-warning-border); background: var(--vs-status-strip); }
    .panel.pinned { border-color: var(--vs-pinned-border); background: var(--vs-pinned); }
    .button {
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--vs-border);
      border-radius: 6px;
      padding: 0 12px;
      font-size: 14px;
      font-weight: 700;
      background: var(--vs-raised);
      color: var(--vs-text);
    }
    .button:focus-visible, input:focus-visible {
      outline: 0;
      box-shadow: 0 0 0 2px var(--vs-bg), 0 0 0 4px var(--vs-focus-ring);
    }
    .button:disabled { cursor: not-allowed; border-color: var(--vs-disabled-border); background: var(--vs-disabled-bg); color: var(--vs-disabled-text); }
    .primary { background: var(--vs-accent); border-color: transparent; color: var(--vs-accent-text); }
    .soft { background: var(--vs-soft); border-color: var(--vs-soft-border); color: var(--vs-soft-text); }
    .warning { background: var(--vs-warning-soft); border-color: var(--vs-warning-border); color: var(--vs-warning); }
    .selected { background: var(--vs-selected); border-color: var(--vs-selected-border); color: var(--vs-selected-text); }
    .ghost { background: transparent; border-color: transparent; color: var(--vs-muted); }
    .destructive { background: var(--vs-danger-soft); border-color: var(--vs-danger-border); color: var(--vs-danger); }
    .segmented { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin-top: 14px; border: 1px solid var(--vs-border); border-radius: 6px; background: var(--vs-surface); padding: 4px; }
    .segmented .button { box-shadow: none; }
    .toggle { min-height: 44px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border: 1px solid var(--vs-border); border-radius: 6px; padding: 12px; margin-top: 12px; }
    .toggle small { display: block; margin-top: 4px; color: var(--vs-muted); }
    .toggle input { width: 20px; height: 20px; accent-color: var(--vs-accent); }
    .chip { display: inline-flex; align-items: center; border: 1px solid var(--vs-border); border-radius: 6px; padding: 6px 8px; font-size: 12px; font-weight: 700; }
    .chip.selected { background: var(--vs-selected); border-color: var(--vs-selected-border); color: var(--vs-selected-text); }
    .chip.metadata { background: var(--vs-metadata); border-color: var(--vs-border); color: var(--vs-muted); }
    .chip.success { background: var(--vs-success-soft); border-color: var(--vs-success-border); color: var(--vs-success); }
    .chip.warning { background: var(--vs-warning-soft); border-color: var(--vs-warning-border); color: var(--vs-warning); }
    .chip.danger { background: var(--vs-danger-soft); border-color: var(--vs-danger-border); color: var(--vs-danger); }
    .chip.pinned { background: var(--vs-pinned); border-color: var(--vs-pinned-border); color: var(--vs-pinned-text); }
    .chip.disabled { background: var(--vs-disabled-bg); border-color: var(--vs-disabled-border); color: var(--vs-disabled-text); }
    .drawer-preview { display: flex; justify-content: flex-end; min-height: 260px; border: 1px dashed var(--vs-border); border-radius: 8px; padding: 16px; }
    .drawer { width: 420px; box-shadow: 0 20px 42px rgb(15 23 42 / 0.12); }
    .drawer > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--vs-border); padding: 16px; }
    .drawer .panel { margin: 16px; }
    @media (max-width: 900px) {
      .roles, .two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .header { align-items: flex-start; flex-direction: column; }
    }
  `;
}
