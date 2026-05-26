import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const repoRoot = process.cwd();
const schemaDir = path.join(repoRoot, "backend/internal/contentir/schema");
const schemaPaths = {
  contentIR: path.join(schemaDir, "content-ir.v1.schema.json"),
  fragmentTiming: path.join(schemaDir, "fragment-timing.v1.schema.json"),
  highlightMap: path.join(schemaDir, "highlight-map.v1.schema.json"),
  highlightMapV2: path.join(schemaDir, "highlight-map.v2.schema.json"),
  locatorEnvelope: path.join(schemaDir, "locator-envelope.v1.schema.json"),
  speechPlan: path.join(schemaDir, "speech-plan.v1.schema.json"),
  tokenTiming: path.join(schemaDir, "token-timing.v1.schema.json"),
};
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

const schemas = Object.fromEntries(
  await Promise.all(
    Object.entries(schemaPaths).map(async ([kind, schemaPath]) => [
      kind,
      JSON.parse(await readFile(schemaPath, "utf8")),
    ]),
  ),
);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schemas.contentIR, "content-ir.v1.schema.json");
ajv.addSchema(schemas.locatorEnvelope, "locator-envelope.v1.schema.json");
ajv.addSchema(schemas.speechPlan, "speech-plan.v1.schema.json");
ajv.addSchema(schemas.fragmentTiming, "fragment-timing.v1.schema.json");
ajv.addSchema(schemas.tokenTiming, "token-timing.v1.schema.json");
ajv.addSchema(schemas.highlightMap, "highlight-map.v1.schema.json");
ajv.addSchema(schemas.highlightMapV2, "highlight-map.v2.schema.json");
const validate = ajv.compile(schemas.contentIR);
const validators = {
  contentIR: validate,
  fragmentTiming: ajv.compile(schemas.fragmentTiming),
  highlightMap: ajv.compile(schemas.highlightMap),
  highlightMapV2: ajv.compile(schemas.highlightMapV2),
  locatorEnvelope: ajv.compile(schemas.locatorEnvelope),
  speechPlan: ajv.compile(schemas.speechPlan),
  tokenTiming: ajv.compile(schemas.tokenTiming),
};

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

const contractPayloads = new Map(
  await Promise.all(
    contractFiles.map(async (file) => [
      file,
      JSON.parse(await readFile(path.join(contractDir, file), "utf8")),
    ]),
  ),
);
const contentIRBySourceId = new Map();
const speechPlanById = new Map();
for (const [file, payload] of contractPayloads) {
  if (file.endsWith(".content-ir.v1.json")) {
    contentIRBySourceId.set(payload.sourceId, payload);
  } else if (file.endsWith(".speech-plan.v1.json")) {
    speechPlanById.set(payload.id, payload);
  }
}

const contractCounts = {
  contentIR: 0,
  fragmentTiming: 0,
  highlightMap: 0,
  highlightMapV2: 0,
  locatorEnvelope: 0,
  speechPlan: 0,
  tokenTiming: 0,
};
for (const file of contractFiles) {
  const payload = contractPayloads.get(file);
  assertJSONRoundTrip(file, payload);
  if (file.endsWith(".content-ir.v1.json")) {
    contractCounts.contentIR += 1;
    if (!validators.contentIR(payload)) {
      throw new Error(
        `${file} failed Content IR v1 validation:\n${ajv.errorsText(validators.contentIR.errors)}`,
      );
    }
  } else if (file.endsWith(".locator-envelope.v1.json")) {
    contractCounts.locatorEnvelope += 1;
    if (!validators.locatorEnvelope(payload)) {
      throw new Error(
        `${file} failed locator envelope validation:\n${ajv.errorsText(validators.locatorEnvelope.errors)}`,
      );
    }
  } else if (file.endsWith(".speech-plan.v1.json")) {
    contractCounts.speechPlan += 1;
    if (!validators.speechPlan(payload)) {
      throw new Error(
        `${file} failed speech plan validation:\n${ajv.errorsText(validators.speechPlan.errors)}`,
      );
    }
  } else if (file.endsWith(".highlight-map.v1.json")) {
    contractCounts.highlightMap += 1;
    if (!validators.highlightMap(payload)) {
      throw new Error(
        `${file} failed highlight map validation:\n${ajv.errorsText(validators.highlightMap.errors)}`,
      );
    }
  } else if (file.endsWith(".highlight-map.v2.json")) {
    contractCounts.highlightMapV2 += 1;
    if (!validators.highlightMapV2(payload)) {
      throw new Error(
        `${file} failed HighlightMap v2 validation:\n${ajv.errorsText(validators.highlightMapV2.errors)}`,
      );
    }
    validateHighlightMapV2Semantics(file, payload, {
      contentIRBySourceId,
      speechPlanById,
    });
  } else if (file.endsWith(".fragment-timing.v1.json")) {
    contractCounts.fragmentTiming += 1;
    if (!validators.fragmentTiming(payload)) {
      throw new Error(
        `${file} failed fragment timing validation:\n${ajv.errorsText(validators.fragmentTiming.errors)}`,
      );
    }
  } else if (file.endsWith(".token-timing.v1.json")) {
    contractCounts.tokenTiming += 1;
    if (!validators.tokenTiming(payload)) {
      throw new Error(
        `${file} failed token timing validation:\n${ajv.errorsText(validators.tokenTiming.errors)}`,
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
  path.join(repoRoot, "packages/schema/src/generated/contracts.ts"),
  "utf8",
);
for (const expected of [
  "ContentIRDocument",
  "FragmentTimingArtifact",
  "HighlightMap",
  "HighlightMapV2",
  "LocatorEnvelope",
  "SpeechPlanDocument",
  "TokenTimingArtifact",
]) {
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

function validateHighlightMapV2Semantics(file, artifact, { contentIRBySourceId, speechPlanById }) {
  const issues = [];
  const contentIR = contentIRBySourceId.get(artifact.sourceId);
  const speechPlan = speechPlanById.get(artifact.speechPlanId);
  if (!contentIR) {
    issues.push(`sourceId ${artifact.sourceId} does not resolve to a Content IR fixture`);
  }
  if (!speechPlan) {
    issues.push(`speechPlanId ${artifact.speechPlanId} does not resolve to a Speech Plan fixture`);
  }
  const nodeById = new Map((contentIR?.nodes ?? []).map((node) => [node.nodeId, node]));
  validateHighlightMapV2Counts(issues, artifact);
  validateHighlightMapV2Ranges(issues, artifact);
  validateHighlightMapV2SourceBindings(issues, artifact, contentIR, nodeById, speechPlan);
  validateHighlightMapV2WordOverlap(issues, artifact);
  if (issues.length > 0) {
    throw new Error(`${file} failed HighlightMap v2 semantic validation:\n${issues.join("\n")}`);
  }
}

function validateHighlightMapV2Counts(issues, artifact) {
  const counts = { block: 0, phrase: 0, sentence: 0, word: 0 };
  for (const entry of artifact.entries) {
    counts[entry.level] += 1;
    if (entry.sourceId !== artifact.sourceId) {
      issues.push(`${entryLabel(entry)} sourceId differs from artifact sourceId`);
    }
    if (entry.scopeKey !== artifact.scopeKey) {
      issues.push(`${entryLabel(entry)} scopeKey differs from artifact scopeKey`);
    }
    if (entry.generatedAudioId !== artifact.generatedAudioId) {
      issues.push(`${entryLabel(entry)} generatedAudioId differs from artifact generatedAudioId`);
    }
    if (entry.speechPlanId !== artifact.speechPlanId) {
      issues.push(`${entryLabel(entry)} speechPlanId differs from artifact speechPlanId`);
    }
    if (!artifact.timingLevels.includes(entry.level)) {
      issues.push(`${entryLabel(entry)} level ${entry.level} is not declared in timingLevels`);
    }
  }
  const expected = {
    block: artifact.summary.blockCount,
    phrase: artifact.summary.phraseCount,
    sentence: artifact.summary.sentenceCount,
    word: artifact.summary.wordCount,
  };
  if (artifact.summary.entryCount !== artifact.entries.length) {
    issues.push(
      `summary entryCount ${artifact.summary.entryCount} does not match ${artifact.entries.length} entries`,
    );
  }
  for (const [level, count] of Object.entries(counts)) {
    if (count !== expected[level]) {
      issues.push(`summary ${level}Count ${expected[level]} does not match ${count} entries`);
    }
  }
}

function validateHighlightMapV2Ranges(issues, artifact) {
  let previousAudioStartMs = -1;
  for (const entry of artifact.entries) {
    validateTimingRange(issues, entry, "audio", entry.audioStartMs, entry.audioEndMs);
    validateTimingRange(
      issues,
      entry,
      "provider",
      entry.providerTimingStartMs,
      entry.providerTimingEndMs,
    );
    validateTimingRange(issues, entry, "aligned", entry.alignedStartMs, entry.alignedEndMs);
    if (entry.audioStartMs < previousAudioStartMs) {
      issues.push(`${entryLabel(entry)} audioStartMs is not monotonic`);
    }
    previousAudioStartMs = entry.audioStartMs;
    if (entry.audioEndMs > artifact.durationMs) {
      issues.push(`${entryLabel(entry)} audioEndMs exceeds artifact durationMs`);
    }
  }
}

function validateTimingRange(issues, entry, label, startMs, endMs) {
  if (startMs === null && endMs === null) {
    return;
  }
  if (startMs === null || endMs === null) {
    issues.push(`${entryLabel(entry)} ${label} timing must provide both start and end or neither`);
    return;
  }
  if (endMs < startMs) {
    issues.push(`${entryLabel(entry)} ${label} timing end is before start`);
  }
}

function validateHighlightMapV2SourceBindings(issues, artifact, contentIR, nodeById, speechPlan) {
  if (contentIR && contentIR.sourceId !== artifact.sourceId) {
    issues.push(`Content IR sourceId ${contentIR.sourceId} does not match ${artifact.sourceId}`);
  }
  for (const entry of artifact.entries) {
    const node = nodeById.get(entry.nodeId);
    if (!node) {
      issues.push(`${entryLabel(entry)} nodeId ${entry.nodeId} does not resolve to Content IR`);
      continue;
    }
    if (!locatorsEqual(entry.sourceLocator, node.provenance.locator)) {
      issues.push(`${entryLabel(entry)} sourceLocator does not match Content IR node locator`);
    }
    validateHighlightMapV2TextTrace(issues, entry, node, speechPlan);
  }
}

function validateHighlightMapV2TextTrace(issues, entry, node, speechPlan) {
  const sourceText = normalizeTraceText([node.displayText, node.normalisedText, entry.textQuote]);
  const speechTexts = (speechPlan?.segments ?? [])
    .filter((segment) => segment.nodeId === entry.nodeId)
    .map((segment) => segment.text);
  const spokenText = normalizeTraceText([
    node.speechText,
    ...speechTexts,
    entry.traceability?.spokenTextMatch ?? "",
  ]);
  if (
    !containsTraceText(sourceText, entry.rawText) &&
    !containsTraceText(sourceText, entry.textQuote)
  ) {
    issues.push(`${entryLabel(entry)} rawText/textQuote is not traceable to source text`);
  }
  if (!containsTraceText(sourceText, entry.normalizedText)) {
    issues.push(`${entryLabel(entry)} normalizedText is not traceable to source text`);
  }
  if (
    !containsTraceText(spokenText, entry.spokenText) &&
    !containsTraceText(sourceText, entry.spokenText) &&
    !entry.traceability?.policyTransform
  ) {
    issues.push(`${entryLabel(entry)} spokenText is not traceable to source or speech plan`);
  }
}

function validateHighlightMapV2WordOverlap(issues, artifact) {
  const wordsByFragment = new Map();
  for (const entry of artifact.entries) {
    if (entry.level !== "word") {
      continue;
    }
    const fragmentIndex = entry.fragmentIndex ?? 0;
    wordsByFragment.set(fragmentIndex, [...(wordsByFragment.get(fragmentIndex) ?? []), entry]);
  }
  for (const words of wordsByFragment.values()) {
    const sortedWords = [...words].sort((left, right) => left.audioStartMs - right.audioStartMs);
    for (let index = 1; index < sortedWords.length; index += 1) {
      const previous = sortedWords[index - 1];
      const current = sortedWords[index];
      if (
        current.audioStartMs < previous.audioEndMs &&
        !previous.allowsOverlap &&
        !current.allowsOverlap
      ) {
        issues.push(`${entryLabel(current)} overlaps another word in the same fragment`);
      }
    }
  }
}

function containsTraceText(haystack, needle) {
  const normalizedNeedle = normalizeTraceText([needle]);
  return normalizedNeedle.length === 0 || haystack.includes(normalizedNeedle);
}

function normalizeTraceText(values) {
  return values
    .join(" ")
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

function locatorsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function entryLabel(entry) {
  return entry.entryId ?? `${entry.level}:${entry.nodeId}`;
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
