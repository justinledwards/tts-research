import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import JSZip from "jszip";
import { emitHTMLAdapter, emitHTMLAdapterFromFile } from "./emit_ir.js";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const adapterDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(adapterDir, "../..");
const hnFixturePath = path.join(repoRoot, "fixtures/adapter-corpus/hn-thread.html");

const articleHTML = `<!doctype html>
<html lang="sv" dir="ltr">
  <head>
    <title>HTML Fixture Title</title>
    <meta name="description" content="A compact adapter fixture" />
  </head>
  <body>
    <nav>Skip navigation</nav>
    <main>
      <article>
        <h1 id="top-story">Top Story</h1>
        <p lang="en">Lead paragraph with <a href="/topic">a link</a>.</p>
        <figure>
          <img src="photo.jpg" alt="A river beside a city quay" />
          <figcaption>River caption with useful context.</figcaption>
        </figure>
        <table><tr><th>Metric</th><td>Value</td></tr></table>
        <span class="commtext">Nested HN-style comment text.</span>
      </article>
    </main>
  </body>
</html>`;

test("HTML adapter emits semantic blocks with fragments, lang, alt text, and captions", () => {
  const emitted = emitHTMLAdapter(articleHTML, {
    href: "https://example.test/news",
    sourceId: "html-fixture",
    sourceName: "article.html",
  });

  assert.equal(emitted.document.schemaVersion, "content-ir.v1");
  assert.equal(emitted.document.metadata.lang, "sv");
  assert.equal(emitted.capabilities.features.semanticBlocks, true);

  const nodes = emitted.document.nodes;
  assert(nodes.some((node) => node.kind === "heading" && node.nodeId === "top-story"));
  assert(nodes.some((node) => node.kind === "image" && node.displayText.includes("river")));
  assert(nodes.some((node) => node.kind === "caption" && node.displayText.includes("caption")));
  assert(
    nodes.some((node) => node.kind === "table" && node.speech.policyHint.mode === "summarize"),
  );
  assert(nodes.some((node) => node.kind === "quote" && node.displayText.includes("HN-style")));
  assert.equal(nodes[1].lang, "en");
  assert.equal(nodes[0].provenance.locator.type, "html");
  assert.equal(nodes[0].provenance.locator.html.href, "https://example.test/news");
  assert.equal(nodes[0].provenance.locator.html.fragment, "top-story");
});

test("HTML adapter can read simple zipped HTML packages", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "tts-html-adapter-"));
  const sourcePath = path.join(tempDir, `fixture-${Date.now().toString()}.zip`);
  const zip = new JSZip();
  zip.file("assets/ignored.txt", "ignore");
  zip.file("index.html", articleHTML);
  await writeFile(sourcePath, await zip.generateAsync({ type: "nodebuffer" }));

  const emitted = await emitHTMLAdapterFromFile(sourcePath, { sourceId: "zip-fixture" });

  assert.equal(emitted.document.sourceName, "index.html");
  assert(emitted.document.nodes.length >= 5);
  assert.equal(emitted.document.nodes[0].provenance.locator.html.href, "index.html");
});

test("HTML adapter extracts HN-style comments inside layout tables", async () => {
  const emitted = emitHTMLAdapter(await readFile(hnFixturePath, "utf8"), {
    href: "https://news.ycombinator.com/item?id=1",
    sourceName: "hn-thread.html",
  });

  assert(
    emitted.document.nodes.some(
      (node) => node.kind === "quote" && node.displayText.includes("Top-level comment"),
    ),
  );
  assert(
    emitted.document.nodes.some(
      (node) => node.kind === "quote" && node.displayText.includes("Nested reply"),
    ),
  );
  assert(!emitted.document.nodes.some((node) => node.kind === "table"));
});
