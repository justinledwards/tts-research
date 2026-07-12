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

test("HTML adapter stable unit identity survives append insertions", () => {
  const baseHTML = `<!doctype html><html><body><main>
    <h1 id="stable-heading">Stable Heading</h1>
    <p id="alpha">Alpha paragraph.</p>
    <p id="beta">Beta paragraph.</p>
  </main></body></html>`;
  const appendedHTML = `<!doctype html><html><body><main>
    <h1 id="stable-heading">Stable Heading</h1>
    <p id="alpha">Alpha paragraph.</p>
    <p id="beta">Beta paragraph.</p>
    <p id="gamma">Gamma paragraph.</p>
  </main></body></html>`;

  const base = emitHTMLAdapter(baseHTML, {
    href: "stable.html",
    sourceId: "html-stable",
    sourceName: "stable.html",
  });
  const appended = emitHTMLAdapter(appendedHTML, {
    href: "stable.html",
    sourceId: "html-stable",
    sourceName: "stable.html",
  });

  for (const fragment of ["stable-heading", "alpha", "beta"]) {
    const before = htmlNodeByFragment(base, fragment);
    const after = htmlNodeByFragment(appended, fragment);
    assert.equal(after.nodeId, before.nodeId, fragment);
    assert.equal(after.orderKey, before.orderKey, fragment);
    assert.equal(after.metadata.fingerprint, before.metadata.fingerprint, fragment);
    assert.equal(after.provenance.sourceId, "html-stable");
    assert.equal(after.provenance.locator.html.fragment, fragment);
  }
  assertSortedSparseOrderKeys(appended.document.nodes);
});

test("HTML adapter stable unit identity survives sibling insertion", () => {
  const base = emitHTMLAdapter(
    `<!doctype html><html><body><main>
      <h1 id="stable-heading">Stable Heading</h1>
      <p id="alpha">Alpha paragraph.</p>
      <p id="beta">Beta paragraph.</p>
    </main></body></html>`,
    { href: "stable.html", sourceId: "html-stable", sourceName: "stable.html" },
  );
  const inserted = emitHTMLAdapter(
    `<!doctype html><html><body><main>
      <h1 id="stable-heading">Stable Heading</h1>
      <p id="alpha">Alpha paragraph.</p>
      <p id="inserted">Inserted paragraph.</p>
      <p id="beta">Beta paragraph.</p>
    </main></body></html>`,
    { href: "stable.html", sourceId: "html-stable", sourceName: "stable.html" },
  );

  for (const fragment of ["stable-heading", "alpha", "beta"]) {
    const before = htmlNodeByFragment(base, fragment);
    const after = htmlNodeByFragment(inserted, fragment);
    assert.equal(after.nodeId, before.nodeId, fragment);
    assert.equal(after.metadata.fingerprint, before.metadata.fingerprint, fragment);
  }
  assertSortedSparseOrderKeys(inserted.document.nodes);
});

test("HTML adapter uniquifies duplicate explicit id and name node IDs", () => {
  const html = `<!doctype html><html><body><main>
    <p id="dup">First duplicate id paragraph.</p>
    <p id="dup">Second duplicate id paragraph.</p>
    <p name="dup">Third duplicate name paragraph.</p>
  </main></body></html>`;
  const emitted = emitHTMLAdapter(html, {
    href: "duplicates.html",
    sourceId: "html-duplicates",
    sourceName: "duplicates.html",
  });
  const repeat = emitHTMLAdapter(html, {
    href: "duplicates.html",
    sourceId: "html-duplicates",
    sourceName: "duplicates.html",
  });

  const nodes = emitted.document.nodes;
  assert.deepEqual(
    nodes.map((node) => node.provenance.locator.html.fragment),
    ["dup", "dup-2", "dup-3"],
  );
  assert.deepEqual(
    nodes.map((node) => node.nodeId),
    ["dup", "dup-2", "dup-3"],
  );
  assert.equal(new Set(nodes.map((node) => node.nodeId)).size, nodes.length);
  assert.deepEqual(
    repeat.document.nodes.map((node) => node.nodeId),
    nodes.map((node) => node.nodeId),
  );
});

test("HTML adapter no-explicit-id identity survives unrelated sibling insertion", () => {
  const base = emitHTMLAdapter(
    `<!doctype html><html><body><main>
      <h1 id="stable-heading">Stable Heading</h1>
      <p>Alpha paragraph without an explicit identifier.</p>
      <p>Beta target paragraph without an explicit identifier.</p>
    </main></body></html>`,
    { href: "stable-no-id.html", sourceId: "html-stable-no-id", sourceName: "stable-no-id.html" },
  );
  const inserted = emitHTMLAdapter(
    `<!doctype html><html><body><main>
      <h1 id="stable-heading">Stable Heading</h1>
      <p>Alpha paragraph without an explicit identifier.</p>
      <p>Inserted unrelated paragraph without an explicit identifier.</p>
      <p>Beta target paragraph without an explicit identifier.</p>
    </main></body></html>`,
    { href: "stable-no-id.html", sourceId: "html-stable-no-id", sourceName: "stable-no-id.html" },
  );

  const before = htmlNodeByText(base, "Beta target paragraph without an explicit identifier.");
  const after = htmlNodeByText(inserted, "Beta target paragraph without an explicit identifier.");
  assert.equal(after.nodeId, before.nodeId);
  assert.equal(after.metadata.fingerprint, before.metadata.fingerprint);
  assert.equal(after.provenance.locator.html.fragment, before.provenance.locator.html.fragment);
});

test("HTML adapter no-explicit-id identity survives slug-colliding preceding sibling insertion", () => {
  const targetText = "Beta target paragraph without an explicit identifier.";
  const base = emitHTMLAdapter(
    `<!doctype html><html><body><main>
      <h1 id="stable-heading">Stable Heading</h1>
      <p>Alpha paragraph without an explicit identifier.</p>
      <p>${targetText}</p>
    </main></body></html>`,
    { href: "stable-no-id.html", sourceId: "html-stable-no-id", sourceName: "stable-no-id.html" },
  );
  const inserted = emitHTMLAdapter(
    `<!doctype html><html><body><main>
      <h1 id="stable-heading">Stable Heading</h1>
      <p>Alpha paragraph without an explicit identifier.</p>
      <p>Beta target paragraph without an explicit identifier?</p>
      <p>${targetText}</p>
    </main></body></html>`,
    { href: "stable-no-id.html", sourceId: "html-stable-no-id", sourceName: "stable-no-id.html" },
  );

  const before = htmlNodeByText(base, targetText);
  const after = htmlNodeByText(inserted, targetText);
  assert.equal(after.nodeId, before.nodeId);
  assert.equal(after.metadata.fingerprint, before.metadata.fingerprint);
  assert.equal(
    before.provenance.locator.html.fragment,
    "beta-target-paragraph-without-an-explicit-identifier",
  );
  assert.equal(
    after.provenance.locator.html.fragment,
    "beta-target-paragraph-without-an-explicit-identifier-2",
  );
});

function htmlNodeByFragment(emitted, fragment) {
  const node = emitted.document.nodes.find(
    (item) => item.provenance.locator.html.fragment === fragment,
  );
  assert(node, `missing HTML node for ${fragment}`);
  return node;
}

function htmlNodeByText(emitted, text) {
  const node = emitted.document.nodes.find((item) => item.displayText === text);
  assert(node, `missing HTML node for text ${text}`);
  return node;
}

function assertSortedSparseOrderKeys(nodes) {
  const keys = nodes.map((node) => Number.parseInt(node.orderKey, 10));
  assert(keys.every(Number.isFinite), "order keys should be numeric strings");
  assert.deepEqual(
    [...keys].sort((left, right) => left - right),
    keys,
  );
  assert(keys.slice(1).every((key, index) => key - keys[index] > 1));
}
