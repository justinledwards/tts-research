import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { emitMarkdownAdapter } from "./emit_ir.js";
import { parseMarkdown, snapshotAst } from "./parse.js";

const adapterDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(adapterDir, "../..");
const fixtureDir = path.join(repoRoot, "fixtures/markdown");
const snapshotDir = path.join(adapterDir, "__snapshots__");

test("markdown adapter AST snapshots", async () => {
  for (const fixture of await markdownFixtures()) {
    const source = await readFile(path.join(fixtureDir, fixture), "utf8");
    const parsed = parseMarkdown(source, { includeParseErrors: true });
    await assertSnapshot(`${fixture}.ast.json`, snapshotAst(parsed.tree));
  }
});

test("markdown adapter IR snapshots", async () => {
  for (const fixture of await markdownFixtures()) {
    const source = await readFile(path.join(fixtureDir, fixture), "utf8");
    const emitted = emitMarkdownAdapter(source, {
      includeDocument: true,
      sourceId: fixture.replace(/\.md$/, ""),
      sourceName: fixture,
    });
    delete emitted.ast;
    await assertSnapshot(`${fixture}.ir.json`, emitted);
  }
});

test("embedded constructs remain explicit", async () => {
  const source = await readFile(path.join(fixtureDir, "mdx-myst.md"), "utf8");
  const emitted = emitMarkdownAdapter(source);
  assert(emitted.blocks.some((block) => block.kind === "embedded"));
  assert(emitted.blocks.some((block) => block.kind === "admonition"));
  assert(!emitted.blocks.some((block) => block.spokenText.includes("<Chart")));
});

test("deep research references sections are skipped by default", async () => {
  const source = await readFile(path.join(fixtureDir, "deep-research-references.md"), "utf8");
  const emitted = emitMarkdownAdapter(source);
  const referenceBlocks = emitted.blocks.filter((block) => block.kind === "reference");
  assert.equal(referenceBlocks.length, 2);
  assert(referenceBlocks.every((block) => block.speakMode === "skip"));
  assert(referenceBlocks.every((block) => block.spokenText === ""));
  assert(referenceBlocks.some((block) => block.text === "References"));
  assert(referenceBlocks.some((block) => block.text.includes("opentelemetry.io")));

  const spokenDefault = emitted.blocks
    .filter((block) => block.speakMode !== "skip")
    .map((block) => block.spokenText)
    .join(" ");
  assert(!spokenDefault.includes("opentelemetry.io"));
  assert(spokenDefault.includes("The narrative section should remain available for speech."));
  assert(
    spokenDefault.includes("This paragraph follows the reference list and should still be spoken."),
  );
  assert.equal(
    emitted.blocks.find((block) => block.text.includes("This paragraph follows"))?.kind,
    "body",
  );
});

test("reference-only cue leaks stay non-speaking", async () => {
  const source = await readFile(path.join(fixtureDir, "reference-cue-leaks.md"), "utf8");
  const emitted = emitMarkdownAdapter(source);
  const spokenDefault = emitted.blocks
    .filter((block) => block.speakMode !== "skip")
    .map((block) => block.spokenText)
    .join(" ");

  assert(spokenDefault.includes("Narrative introduction with a useful link and citation."));
  assert(spokenDefault.includes("After the reference section, normal narration resumes."));
  assert(!spokenDefault.includes("opentelemetry"));
  assert(!spokenDefault.includes("Shneiderman"));
  assert(!spokenDefault.includes("turn14image"));
  assert(!/\b6\b/.test(spokenDefault));

  const numericReference = emitted.blocks.find((block) => block.text.includes("[6]("));
  assert.equal(numericReference?.kind, "reference");
  assert.equal(numericReference?.speakMode, "skip");
  assert.equal(numericReference?.spokenText, "");

  const imageToken = emitted.blocks.find((block) => block.text.includes("turn14image2"));
  assert.equal(imageToken?.kind, "artifact_token");
  assert.equal(imageToken?.speakMode, "skip");
  assert.equal(imageToken?.spokenText, "");
});

test("markdown stable unit identity survives append insertions", () => {
  const base = emitMarkdownAdapter("# Stable\n\nAlpha paragraph.\n\nBeta paragraph.", {
    includeDocument: true,
    sourceId: "markdown-stable",
    sourceName: "stable.md",
  });
  const appended = emitMarkdownAdapter(
    "# Stable\n\nAlpha paragraph.\n\nBeta paragraph.\n\nAppended paragraph.",
    {
      includeDocument: true,
      sourceId: "markdown-stable",
      sourceName: "stable.md",
    },
  );

  for (const text of ["# Stable", "Alpha paragraph.", "Beta paragraph."]) {
    const before = nodeByText(base, text);
    const after = nodeByText(appended, text);
    assert.equal(after.nodeId, before.nodeId, text);
    assert.equal(after.orderKey, before.orderKey, text);
    assert.equal(after.metadata.fingerprint, before.metadata.fingerprint, text);
    assert.equal(after.provenance.sourceId, "markdown-stable");
    assert.equal(after.provenance.locator.type, "markdown");
  }
  assertSortedSparseOrderKeys(appended.document.nodes);
});

test("markdown stable unit identity survives unrelated middle insertion", () => {
  const base = emitMarkdownAdapter("# Stable\n\nAlpha paragraph.\n\nBeta paragraph.", {
    includeDocument: true,
    sourceId: "markdown-stable",
    sourceName: "stable.md",
  });
  const inserted = emitMarkdownAdapter(
    "# Stable\n\nAlpha paragraph.\n\nInserted paragraph.\n\nBeta paragraph.",
    {
      includeDocument: true,
      sourceId: "markdown-stable",
      sourceName: "stable.md",
    },
  );

  for (const text of ["# Stable", "Alpha paragraph.", "Beta paragraph."]) {
    const before = nodeByText(base, text);
    const after = nodeByText(inserted, text);
    assert.equal(after.nodeId, before.nodeId, text);
    assert.equal(after.metadata.fingerprint, before.metadata.fingerprint, text);
  }
  assertSortedSparseOrderKeys(inserted.document.nodes);
});

function nodeByText(emitted, text) {
  const node = emitted.document.nodes.find((item) => item.displayText === text);
  assert(node, `missing node for ${text}`);
  return node;
}

function assertSortedSparseOrderKeys(nodes) {
  const keys = nodes.map((node) => Number.parseInt(node.orderKey, 10));
  assert(keys.every(Number.isFinite), "order keys should be numeric strings");
  assert.deepEqual(
    [...keys].sort((left, right) => left - right),
    keys,
    "order keys should preserve reading order",
  );
  assert(
    keys.slice(1).every((key, index) => key - keys[index] > 1),
    "order keys should be sparse",
  );
}

async function markdownFixtures() {
  return (await readdir(fixtureDir)).filter((file) => file.endsWith(".md")).sort();
}

async function assertSnapshot(name, value) {
  const snapshotPath = path.join(snapshotDir, name);
  const actual = `${JSON.stringify(value, null, 2)}\n`;
  if (process.env.UPDATE_MARKDOWN_SNAPSHOTS === "1") {
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotPath, actual);
    return;
  }
  const expected = await readFile(snapshotPath, "utf8");
  assert.deepEqual(JSON.parse(actual), JSON.parse(expected), name);
}
