#!/usr/bin/env node
import process from "node:process";
import { emitEPUBAdapterFromFile } from "./emit_ir.js";

async function main() {
  const payload = JSON.parse(await readStdin());
  const sourcePath = String(payload.sourcePath ?? "");
  if (!sourcePath) {
    throw new Error("sourcePath is required for EPUB adapter.");
  }
  const result = await emitEPUBAdapterFromFile(sourcePath, {
    generatedAt: payload.generatedAt,
    projectId: payload.projectId,
    sourceId: payload.sourceId,
    sourceName: payload.sourceName,
    sourceType: payload.sourceType,
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
