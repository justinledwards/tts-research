import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  buildContractsContent,
  buildSchemaExportsContent,
  schemaFiles,
} from "./generate-contract-types-templates.mjs";

const repoRoot = process.cwd();
const schemaDir = path.join(repoRoot, "backend/internal/contentir/schema");
const packageSchemaDir = path.join(repoRoot, "packages/schema/schemas");
const pythonSchemaDir = path.join(repoRoot, "packages/sdk-py/src/voice_studio_sdk/schema_files");
const generatedContractsPath = path.join(repoRoot, "packages/schema/src/generated/contracts.ts");
const generatedSchemasPath = path.join(repoRoot, "packages/schema/src/generated/schemas.ts");
const bundlePath = path.join(repoRoot, "docs/contracts/schema-bundle.v1.json");
const snapshotDir = path.join(repoRoot, "fixtures/contracts/schema-snapshots");
const checkOnly = process.argv.includes("--check");

const schemas = Object.fromEntries(
  await Promise.all(
    schemaFiles.map(async ({ file, kind }) => [
      kind,
      JSON.parse(await readFile(path.join(schemaDir, file), "utf8")),
    ]),
  ),
);

const schemaBundle = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  name: "tts-research-contracts",
  version: "v1",
  schemas,
};

const contractsContent = buildContractsContent();
const schemaExports = buildSchemaExportsContent(schemas, schemaBundle);

const outputs = new Map([
  [generatedContractsPath, contractsContent],
  [generatedSchemasPath, schemaExports],
  [bundlePath, `${JSON.stringify(schemaBundle, null, 2)}\n`],
]);

for (const { file, kind } of schemaFiles) {
  const content = `${JSON.stringify(schemas[kind], null, 2)}\n`;
  outputs.set(path.join(snapshotDir, file), content);
  outputs.set(path.join(packageSchemaDir, file), content);
  outputs.set(path.join(pythonSchemaDir, file), content);
}

if (checkOnly) {
  const stale = [];
  for (const [target, rawContent] of outputs) {
    const nextContent = formatGenerated(target, rawContent);
    let current = "";
    try {
      current = await readFile(target, "utf8");
    } catch {
      stale.push(path.relative(repoRoot, target));
      continue;
    }
    if (current !== nextContent) {
      stale.push(path.relative(repoRoot, target));
    }
  }
  if (stale.length > 0) {
    throw new Error(`Generated contract outputs are stale:\n${stale.join("\n")}`);
  }
  console.log("Generated contract outputs are up to date.");
} else {
  for (const [target, rawContent] of outputs) {
    const nextContent = formatGenerated(target, rawContent);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, nextContent);
    console.log(`Generated ${path.relative(repoRoot, target)}`);
  }
}

function formatGenerated(target, content) {
  const result = spawnSync(
    "pnpm",
    ["exec", "biome", "format", "--stdin-file-path", path.relative(repoRoot, target)],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: content,
      maxBuffer: 30 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Unable to format ${target}`);
  }
  return result.stdout;
}
