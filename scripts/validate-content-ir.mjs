import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const schemaPath = path.join(
  repoRoot,
  "backend/internal/contentir/schema/content-ir.v1.schema.json",
);
const goldenDir = path.join(repoRoot, "backend/internal/contentir/testdata/golden");
const adapterFiles = [
  "backend/internal/pipeline/prepared_source_to_ir.go",
  "backend/internal/pipeline/book_source_to_ir.go",
  "backend/internal/pipeline/ir_to_legacy_models.go",
];

const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const goldenFiles = (await readdir(goldenDir)).filter((file) => file.endsWith(".json")).sort();
if (goldenFiles.length === 0) {
  throw new Error("No Content IR golden fixtures found.");
}

for (const file of goldenFiles) {
  const fullPath = path.join(goldenDir, file);
  const payload = JSON.parse(await readFile(fullPath, "utf8"));
  if (!validate(payload)) {
    throw new Error(`${file} failed schema validation:\n${ajv.errorsText(validate.errors)}`);
  }
}

for (const adapterFile of adapterFiles) {
  const source = await readFile(path.join(repoRoot, adapterFile), "utf8");
  for (const fn of findGoFunctions(source)) {
    const nonblankLines = fn.body.split("\n").filter((line) => line.trim().length > 0).length;
    const complexity = mappingComplexity(fn.body);
    if (nonblankLines > 90) {
      throw new Error(`${adapterFile}:${fn.name} has ${nonblankLines} nonblank lines; max is 90.`);
    }
    if (complexity > 12) {
      throw new Error(`${adapterFile}:${fn.name} has complexity ${complexity}; max is 12.`);
    }
  }
}

console.log(
  `Validated ${goldenFiles.length.toString()} Content IR fixtures and ${adapterFiles.length.toString()} adapter files.`,
);

function findGoFunctions(source) {
  const functions = [];
  const pattern = /^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/gm;
  let match = pattern.exec(source);
  while (match !== null) {
    const openIndex = source.indexOf("{", match.index);
    if (openIndex < 0) {
      continue;
    }
    const closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex < 0) {
      continue;
    }
    functions.push({
      name: match[1],
      body: source.slice(openIndex + 1, closeIndex),
    });
    pattern.lastIndex = closeIndex + 1;
    match = pattern.exec(source);
  }
  return functions;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function mappingComplexity(body) {
  const cleaned = body
    .replaceAll(/"([^"\\]|\\.)*"/g, '""')
    .replaceAll(/`[^`]*`/g, "``")
    .replaceAll(/\/\/.*$/gm, "")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "");
  const keywordMatches = cleaned.match(/\b(if|for|switch|case|default)\b/g) ?? [];
  const logicalMatches = cleaned.match(/&&|\|\|/g) ?? [];
  return keywordMatches.length + logicalMatches.length;
}
