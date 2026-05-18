import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const repoRoot = process.cwd();
const schemaDir = path.join(repoRoot, "backend/internal/contentir/schema");
const schemaPath = path.join(schemaDir, "content-ir.v1.schema.json");
const locatorEnvelopeSchemaPath = path.join(schemaDir, "locator-envelope.v1.schema.json");
const speechPlanSchemaPath = path.join(schemaDir, "speech-plan.v1.schema.json");
const goldenDir = path.join(repoRoot, "backend/internal/contentir/testdata/golden");
const contractDir = path.join(repoRoot, "fixtures/contracts");
const adapterFiles = [
  "backend/internal/pipeline/prepared_source_to_ir.go",
  "backend/internal/pipeline/book_source_to_ir.go",
  "backend/internal/pipeline/ir_to_legacy_models.go",
];
const execFileAsync = promisify(execFile);

await execFileAsync(process.execPath, ["scripts/generate-contract-types.mjs", "--check"], {
  cwd: repoRoot,
});

const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const locatorEnvelopeSchema = JSON.parse(await readFile(locatorEnvelopeSchemaPath, "utf8"));
const speechPlanSchema = JSON.parse(await readFile(speechPlanSchemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema, "content-ir.v1.schema.json");
ajv.addSchema(locatorEnvelopeSchema, "locator-envelope.v1.schema.json");
ajv.addSchema(speechPlanSchema, "speech-plan.v1.schema.json");
const validate = ajv.compile(schema);
const validateLocatorEnvelope = ajv.compile(locatorEnvelopeSchema);
const validateSpeechPlan = ajv.compile(speechPlanSchema);

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
  assertJSONRoundTrip(file, payload);
}

const contractFiles = (await readdir(contractDir)).filter((file) => file.endsWith(".json")).sort();
if (contractFiles.length === 0) {
  throw new Error("No public contract fixtures found.");
}

const contractCounts = { contentIR: 0, locatorEnvelope: 0, speechPlan: 0 };
for (const file of contractFiles) {
  const fullPath = path.join(contractDir, file);
  const payload = JSON.parse(await readFile(fullPath, "utf8"));
  assertJSONRoundTrip(file, payload);
  if (file.endsWith(".content-ir.v1.json")) {
    contractCounts.contentIR += 1;
    if (!validate(payload)) {
      throw new Error(
        `${file} failed Content IR v1 validation:\n${ajv.errorsText(validate.errors)}`,
      );
    }
  } else if (file.endsWith(".locator-envelope.v1.json")) {
    contractCounts.locatorEnvelope += 1;
    if (!validateLocatorEnvelope(payload)) {
      throw new Error(
        `${file} failed locator envelope validation:\n${ajv.errorsText(validateLocatorEnvelope.errors)}`,
      );
    }
  } else if (file.endsWith(".speech-plan.v1.json")) {
    contractCounts.speechPlan += 1;
    if (!validateSpeechPlan(payload)) {
      throw new Error(
        `${file} failed speech plan validation:\n${ajv.errorsText(validateSpeechPlan.errors)}`,
      );
    }
  } else {
    throw new Error(`${file} is not a recognized contract fixture.`);
  }
}

for (const [kind, count] of Object.entries(contractCounts)) {
  if (count === 0) {
    throw new Error(`No ${kind} contract fixtures found.`);
  }
}

const generatedTypes = await readFile(
  path.join(repoRoot, "frontend/src/generated/contracts.ts"),
  "utf8",
);
for (const expected of ["ContentIRDocument", "LocatorEnvelope", "SpeechPlanDocument"]) {
  if (!generatedTypes.includes(`interface ${expected}`)) {
    throw new Error(
      `Generated contract types are missing ${expected}. Run pnpm generate:contracts.`,
    );
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
  `Validated ${goldenFiles.length.toString()} Content IR fixtures, ${contractFiles.length.toString()} public contract fixtures, and ${adapterFiles.length.toString()} adapter files.`,
);

function assertJSONRoundTrip(file, payload) {
  const encoded = JSON.stringify(payload);
  const decoded = JSON.parse(encoded);
  const reencoded = JSON.stringify(decoded);
  if (encoded !== reencoded) {
    throw new Error(`${file} failed JSON parse/stringify roundtrip.`);
  }
}

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
