#!/usr/bin/env node
import process from "node:process";
import { emitHTMLAdapter, emitHTMLAdapterFromFile } from "./emit_ir.js";

async function main() {
  const payload = JSON.parse(await readStdin());
  const source = typeof payload.source === "string" ? payload.source : undefined;
  const options = {
    generatedAt: payload.generatedAt,
    href: payload.href,
    projectId: payload.projectId,
    sourceId: payload.sourceId,
    sourceName: payload.sourceName,
    sourceType: payload.sourceType,
    sourceUrl: payload.sourceUrl,
  };
  const result =
    source === undefined
      ? await emitHTMLAdapterFromFile(String(payload.sourcePath ?? ""), options)
      : emitHTMLAdapter(source, options);
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
