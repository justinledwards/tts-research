import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFrontendBundle,
  compareFrontendBundleBudgets,
  formatFrontendBundleReport,
} from "./frontend-performance.mjs";

test("analyzes initial graph, async app chunks, and lazy diagram vendors", async () => {
  const distDir = await mkdtemp(path.join(tmpdir(), "tts-frontend-bundle-"));
  await mkdir(path.join(distDir, ".vite"), { recursive: true });
  await mkdir(path.join(distDir, "assets"), { recursive: true });
  await writeFile(
    path.join(distDir, ".vite", "manifest.json"),
    JSON.stringify({
      "src/main.tsx": {
        file: "assets/index.js",
        css: ["assets/index.css"],
        imports: ["_react.js"],
        isEntry: true,
      },
      "_react.js": {
        file: "assets/react.js",
      },
      "src/BookCinemaPanel.tsx": {
        file: "assets/BookCinemaPanel.js",
        imports: ["_react.js"],
        isDynamicEntry: true,
        src: "src/BookCinemaPanel.tsx",
      },
      "_mermaid.js": {
        file: "assets/mermaid.core.js",
        isDynamicEntry: true,
      },
    }),
  );
  await writeFile(path.join(distDir, "assets", "index.js"), "console.log('entry');");
  await writeFile(path.join(distDir, "assets", "index.css"), "body{color:#111}");
  await writeFile(path.join(distDir, "assets", "react.js"), "export const react = true;");
  await writeFile(path.join(distDir, "assets", "BookCinemaPanel.js"), "export const panel = true;");
  await writeFile(path.join(distDir, "assets", "mermaid.core.js"), "export const mermaid = true;");

  const metrics = await analyzeFrontendBundle(distDir);

  assert.equal(metrics.entryFiles[0], "assets/index.js");
  assert.equal(
    metrics.initialFiles.some((file) => file.file === "assets/react.js"),
    true,
  );
  assert.equal(
    metrics.asyncChunks.some((file) => file.file === "assets/BookCinemaPanel.js"),
    true,
  );
  assert.equal(metrics.diagramVendorLazy, true);
  assert.equal(metrics.bookCinemaMarkdownRendererLazy, true);
  assert.deepEqual(metrics.initialForbiddenImports, []);
  assert.equal(metrics.largestAsyncAppChunk.file, "assets/BookCinemaPanel.js");
});

test("compares configured bundle budgets and formats threshold output", () => {
  const metrics = {
    diagramVendorInitialFiles: [],
    diagramVendorLazy: true,
    initialCssGzipBytes: 12_000,
    initialCssRawBytes: 60_000,
    initialJsGzipBytes: 140_000,
    initialJsRawBytes: 500_000,
    initialForbiddenImports: [],
    initialForbiddenImportsClear: true,
    largestAsyncAppChunk: {
      file: "assets/BookCinemaPanel.js",
      gzipBytes: 40_000,
      rawBytes: 80_000,
    },
    largestAsyncAppChunkGzipBytes: 40_000,
    bookCinemaMarkdownRendererLazy: true,
    bookCinemaStaticImports: ["assets/react.js"],
  };

  const comparisons = compareFrontendBundleBudgets(metrics, {
    maxInitialCssGzipBytes: 14_000,
    maxInitialJsGzipBytes: 160_000,
    maxInitialJsRawBytes: 520_000,
    maxLargestAsyncAppChunkGzipBytes: 110_000,
    requireBookCinemaMarkdownRendererLazy: true,
    requireDiagramVendorLazy: true,
    requireNoForbiddenInitialImports: true,
  });
  const report = formatFrontendBundleReport(metrics, comparisons);

  assert.equal(
    comparisons.every((comparison) => comparison.passed),
    true,
  );
  assert.match(report, /Frontend bundle performance/);
  assert.match(report, /PASS initialJsGzipBytes/);
  assert.match(report, /PASS bookCinemaMarkdownRendererLazy/);
});
