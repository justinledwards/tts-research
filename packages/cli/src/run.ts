import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSpeechPlanFromContentIR,
  validateDetectedSchema,
  validationErrorsText,
  VoiceStudioClient,
  type ContentIRDocument,
  type FragmentTimingArtifact,
  type HighlightMap,
  type SchemaKind,
  type TokenTimingArtifact,
} from "@tts-research/sdk-ts";

interface ParsedArgs {
  flags: Map<string, string | boolean>;
  positionals: string[];
}

interface GlobalOptions {
  apiUrl: string;
  json: boolean;
}

const defaultApiUrl = "http://127.0.0.1:8080";

export async function runVoiceStudioCli(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const { args, globals } = parseGlobalOptions(argv);
  const [command, subcommand, ...rest] = args;
  if (command === "import") {
    await runImport(restWithSubcommand(subcommand, rest), globals);
    return;
  }
  if (command === "ir" && subcommand === "validate") {
    await runIRValidate(rest, globals);
    return;
  }
  if (command === "speech-plan" && subcommand === "build") {
    await runSpeechPlanBuild(rest, globals);
    return;
  }
  if (command === "timing" && subcommand === "inspect") {
    await runTimingInspect(rest, globals);
    return;
  }
  if (command === "bundle" && subcommand === "export") {
    await runBundleExport(rest, globals);
    return;
  }
  throw new Error(`Unknown command: ${args.join(" ")}`);
}

async function runImport(argv: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(argv);
  const projectId = stringFlag(parsed, "project", true);
  const filePath = stringFlag(parsed, "file", false);
  const url = stringFlag(parsed, "url", false);
  const kind = (stringFlag(parsed, "kind", false) || "auto") as "auto" | "prepared" | "book";
  if (!filePath && !url) {
    throw new Error("voice-studio import requires --file or --url.");
  }
  if (filePath && url) {
    throw new Error("voice-studio import accepts only one of --file or --url.");
  }

  const client = new VoiceStudioClient({ baseUrl: globals.apiUrl });
  const resolvedKind = resolveImportKind(kind, filePath, url);
  let result: unknown;
  if (url) {
    result =
      resolvedKind === "book"
        ? await client.importBookSourceFromUrl(projectId, url)
        : await client.importPreparedSource(projectId, { kind: "url", url });
  } else if (resolvedKind === "book") {
    const bytes = await readFile(requiredString(filePath, "--file"));
    const filename = path.basename(requiredString(filePath, "--file"));
    result = await client.importBookSourceFile(projectId, {
      file: new Blob([bytes]),
      filename,
    });
  } else {
    const text = await readFile(requiredString(filePath, "--file"), "utf8");
    result = await client.importPreparedSource(projectId, {
      kind: "file",
      sourceBytes: Buffer.byteLength(text),
      sourceName: path.basename(requiredString(filePath, "--file")),
      text,
    });
  }
  writeOutput(result, globals.json, "Import complete.");
}

async function runIRValidate(argv: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(argv);
  const inputPath = parsed.positionals[0];
  if (!inputPath) {
    throw new Error("voice-studio ir validate requires a JSON file path.");
  }
  const payload = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const schema = stringFlag(parsed, "schema", false) as SchemaKind | undefined;
  const result = schema
    ? validateDetectedOrForced(payload, schema)
    : validateDetectedSchema(payload);
  if (!result.valid) {
    const message = validationErrorsText(result.errors);
    if (globals.json) {
      writeOutput({ errors: result.errors, path: inputPath, valid: false }, true);
      process.exitCode = 1;
      return;
    }
    throw new Error(`Schema validation failed: ${message}`);
  }
  writeOutput(
    { kind: result.kind ?? schema, path: inputPath, valid: true },
    globals.json,
    "Schema valid.",
  );
}

async function runSpeechPlanBuild(argv: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(argv);
  const inputPath = parsed.positionals[0];
  if (!inputPath) {
    throw new Error("voice-studio speech-plan build requires a Content IR JSON file.");
  }
  const outputPath = stringFlag(parsed, "out", true);
  const generatedAt = stringFlag(parsed, "generated-at", false);
  const document = JSON.parse(await readFile(inputPath, "utf8")) as ContentIRDocument;
  const plan = buildSpeechPlanFromContentIR(document, { generatedAt });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
  writeOutput(
    { out: outputPath, segments: plan.segments.length },
    globals.json,
    `Wrote ${outputPath}.`,
  );
}

async function runTimingInspect(argv: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(argv);
  const jobId = stringFlag(parsed, "job", false);
  const highlightMapPath = stringFlag(parsed, "highlight-map", false);
  const fragmentsPath = stringFlag(parsed, "fragments", false);
  const tokensPath = stringFlag(parsed, "tokens", false);
  let highlightMap: HighlightMap | undefined;
  let fragments: FragmentTimingArtifact | undefined;
  let tokens: TokenTimingArtifact | undefined;

  if (jobId) {
    const client = new VoiceStudioClient({ baseUrl: globals.apiUrl });
    highlightMap = await client.getHighlightMap(jobId);
    fragments = await client.getFragmentTiming(jobId);
    tokens = await client.getTokenTiming(jobId);
  } else if (highlightMapPath) {
    highlightMap = JSON.parse(await readFile(highlightMapPath, "utf8")) as HighlightMap;
  } else if (fragmentsPath && tokensPath) {
    fragments = JSON.parse(await readFile(fragmentsPath, "utf8")) as FragmentTimingArtifact;
    tokens = JSON.parse(await readFile(tokensPath, "utf8")) as TokenTimingArtifact;
  } else {
    throw new Error(
      "voice-studio timing inspect requires --job, --highlight-map, or --fragments with --tokens.",
    );
  }

  const summary = summarizeTiming(highlightMap, fragments, tokens);
  writeOutput(summary, globals.json, formatTimingSummary(summary));
}

async function runBundleExport(argv: string[], globals: GlobalOptions): Promise<void> {
  const parsed = parseArgs(argv);
  const projectId = parsed.positionals[0];
  if (!projectId) {
    throw new Error("voice-studio bundle export requires a project id.");
  }
  const requestedOut = stringFlag(parsed, "out", false);
  const client = new VoiceStudioClient({ baseUrl: globals.apiUrl });
  const bundle = await client.exportProjectBundle(projectId);
  const outputPath = requestedOut || bundle.filename || `${projectId}.voice-studio.zip`;
  await writeFile(outputPath, bundle.data);
  writeOutput(
    { bytes: bundle.data.byteLength, contentType: bundle.contentType, out: outputPath },
    globals.json,
    `Wrote ${outputPath}.`,
  );
}

function parseGlobalOptions(argv: string[]): { args: string[]; globals: GlobalOptions } {
  const args: string[] = [];
  let apiUrl = process.env.VOICE_STUDIO_API_URL ?? defaultApiUrl;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--api-url") {
      apiUrl = requiredString(argv[index + 1], "--api-url");
      index += 1;
    } else if (value === "--json") {
      json = true;
    } else {
      args.push(value);
    }
  }
  return { args, globals: { apiUrl, json } };
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
      continue;
    }
    flags.set(key, next);
    index += 1;
  }
  return { flags, positionals };
}

function stringFlag(parsed: ParsedArgs, key: string, required: true): string;
function stringFlag(parsed: ParsedArgs, key: string, required: false): string | undefined;
function stringFlag(parsed: ParsedArgs, key: string, required: boolean): string | undefined {
  const value = parsed.flags.get(key);
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (required) {
    throw new Error(`Missing required --${key}.`);
  }
  return undefined;
}

function restWithSubcommand(subcommand: string | undefined, rest: string[]): string[] {
  return subcommand ? [subcommand, ...rest] : rest;
}

function resolveImportKind(
  kind: "auto" | "prepared" | "book",
  filePath: string | undefined,
  url: string | undefined,
): "prepared" | "book" {
  if (kind !== "auto") {
    return kind;
  }
  const name = (filePath || url || "").toLowerCase();
  return /\.(docx|epub|html?|pdf|png|jpe?g|webp|zip)(?:[?#].*)?$/.test(name) ? "book" : "prepared";
}

function validateDetectedOrForced(payload: unknown, schema: SchemaKind) {
  const result = validateDetectedSchema(payload);
  if (result.kind && result.kind !== schema) {
    return {
      errors: [
        {
          instancePath: "",
          keyword: "schema",
          message: `detected ${result.kind}, expected ${schema}`,
          params: {},
          schemaPath: "",
        },
      ],
      kind: result.kind,
      valid: false,
    };
  }
  return result;
}

function summarizeTiming(
  highlightMap: HighlightMap | undefined,
  fragments: FragmentTimingArtifact | undefined,
  tokens: TokenTimingArtifact | undefined,
) {
  return {
    durationMs: highlightMap?.durationMs ?? fragments?.durationMs ?? tokens?.durationMs ?? 0,
    fragmentCount: highlightMap?.fragments.length ?? fragments?.fragments.length ?? 0,
    jobId: highlightMap?.jobId ?? fragments?.jobId ?? tokens?.jobId,
    lowConfidence: highlightMap?.summary.lowConfidence ?? fragments?.drift.lowConfidence ?? false,
    mode: highlightMap?.mode,
    source: highlightMap?.source ?? fragments?.source ?? tokens?.source,
    status: highlightMap?.status ?? fragments?.status ?? tokens?.status ?? "unknown",
    tokenCount: highlightMap?.tokens.length ?? tokens?.tokens.length ?? 0,
    warnings: highlightMap?.warnings ?? fragments?.warnings ?? tokens?.warnings ?? [],
  };
}

function formatTimingSummary(summary: ReturnType<typeof summarizeTiming>): string {
  const mode = summary.mode ? `, mode=${summary.mode}` : "";
  return `Timing ${summary.status}: fragments=${summary.fragmentCount.toString()}, tokens=${summary.tokenCount.toString()}, source=${summary.source ?? "unknown"}${mode}.`;
}

function writeOutput(payload: unknown, json: boolean, text?: string): void {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (text) {
    console.log(text);
  }
}

function requiredString(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`voice-studio

Commands:
  voice-studio import --project <id> --file <path>|--url <url> [--kind auto|prepared|book] [--json]
  voice-studio ir validate <path> [--schema <kind>] [--json]
  voice-studio speech-plan build <content-ir.json> --out <path> [--generated-at <iso>] [--json]
  voice-studio timing inspect (--job <id>|--highlight-map <path>|--fragments <path> --tokens <path>) [--json]
  voice-studio bundle export <projectId> --out <path> [--json]

Global:
  --api-url <url>    Defaults to VOICE_STUDIO_API_URL or ${defaultApiUrl}
`);
}
