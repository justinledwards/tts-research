#!/usr/bin/env node
import process from "node:process";
import { emitMarkdownAdapter } from "./emit_ir.js";

async function main() {
  const payload = JSON.parse(await readStdin());
  const source = typeof payload.source === "string" ? payload.source : "";
  const result = emitMarkdownAdapter(source, {
    generatedAt: payload.generatedAt,
    includeAst: Boolean(payload.includeAst),
    includeDocument: Boolean(payload.includeDocument),
    includeParseErrors: Boolean(payload.includeParseErrors),
    parseMode: payload.parseMode,
    projectId: payload.projectId,
    sourceId: payload.sourceId,
    sourceName: payload.sourceName,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", reject);
  });
}

main().catch((error) => {
  process.stderr.write(`${String(error.stack ?? error)}\n`);
  process.exitCode = 1;
});
