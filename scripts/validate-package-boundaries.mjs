import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const packageRoot = path.join(repoRoot, "packages");
const packageFiles = await collectFiles(packageRoot);
const forbiddenPatterns = [
  /\bbackend\/internal\b/,
  /\bfrontend\/src\b/,
  /from\s+["'][.]{2}\/[.]{2}\/backend\//,
  /from\s+["'][.]{2}\/[.]{2}\/frontend\//,
  /from\s+["'][.]{2}\/[.]{2}\/[.]{2}\/backend\//,
  /from\s+["'][.]{2}\/[.]{2}\/[.]{2}\/frontend\//,
];

const failures = [];
for (const file of packageFiles) {
  const source = await readFile(file, "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      failures.push(`${path.relative(repoRoot, file)} matches ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Package boundary violations:\n${failures.join("\n")}`);
}

console.log(`Package boundaries validated across ${packageFiles.length.toString()} files.`);

async function collectFiles(root) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["dist", "node_modules", "__pycache__"].includes(entry.name)) {
        continue;
      }
      output.push(...(await collectFiles(fullPath)));
    } else if (/\.(?:js|mjs|py|ts)$/.test(entry.name)) {
      output.push(fullPath);
    }
  }
  return output;
}
