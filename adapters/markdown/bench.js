#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { parseMarkdown } from "./parse.js";
import { emitMarkdownAdapter } from "./emit_ir.js";
import { transformMarkdownAst } from "./transform.js";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  process.stderr.write("Usage: pnpm bench:markdown <file.md> [...more.md]\n");
  process.exitCode = 1;
} else {
  for (const filePath of paths) {
    const source = await readFile(filePath, "utf8");
    const parseStart = performance.now();
    const parsed = parseMarkdown(source);
    const parseMs = performance.now() - parseStart;

    const transformStart = performance.now();
    const transformed = transformMarkdownAst(parsed.tree, source, {
      parseWarnings: parsed.warnings,
    });
    const transformMs = performance.now() - transformStart;

    const emitStart = performance.now();
    const emitted = emitMarkdownAdapter(source, { sourceName: filePath });
    const emitMs = performance.now() - emitStart;

    console.log(
      JSON.stringify(
        {
          blocks: emitted.blocks.length,
          bytes: Buffer.byteLength(source),
          emitMs: roundMs(emitMs),
          file: filePath,
          nodes: transformed.nodes.length,
          parseMs: roundMs(parseMs),
          transformMs: roundMs(transformMs),
          warnings: emitted.warnings,
        },
        null,
        2,
      ),
    );
  }
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}
