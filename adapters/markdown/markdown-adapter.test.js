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
