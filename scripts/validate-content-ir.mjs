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
const readalongSidecarKinds = [
  "source-envelope.v1",
  "source-revision.v1",
  "extraction-revision.v1",
  "reading-unit-manifest.v1",
  "readalong-manifest.v1",
  "audio-artifact.v1",
  "artifact-compatibility.v1",
  "repair-overlay.v1",
  "revision-map.v1",
  "promotion-crosswalk.v1",
  "source-manifest-event.v1",
  "durable-progress.v1",
  "resume-resolution.v1",
  "sync-fidelity-decision.v1",
];
for (const kind of readalongSidecarKinds) {
  schemaPaths[kind] = path.join(schemaDir, `${kind}.schema.json`);
}
const goldenDir = path.join(repoRoot, "backend/internal/contentir/testdata/golden");
const contractDir = process.env.TTS_RESEARCH_CONTRACT_DIR
  ? path.resolve(process.env.TTS_RESEARCH_CONTRACT_DIR)
  : path.join(repoRoot, "fixtures/contracts");
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
for (const kind of readalongSidecarKinds) {
  ajv.addSchema(schemas[kind], `${kind}.schema.json`);
}
const validate = ajv.compile(schemas.contentIR);
const validators = {
  contentIR: validate,
  fragmentTiming: ajv.compile(schemas.fragmentTiming),
  highlightMap: ajv.compile(schemas.highlightMap),
  highlightMapV2: ajv.compile(schemas.highlightMapV2),
  locatorEnvelope: ajv.compile(schemas.locatorEnvelope),
  speechPlan: ajv.compile(schemas.speechPlan),
  tokenTiming: ajv.compile(schemas.tokenTiming),
  ...Object.fromEntries(readalongSidecarKinds.map((kind) => [kind, ajv.compile(schemas[kind])])),
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
  ...Object.fromEntries(readalongSidecarKinds.map((kind) => [kind, 0])),
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
    const sidecarKind = readalongSidecarKinds.find((kind) => file.endsWith(`.${kind}.json`));
    if (!sidecarKind) {
      throw new Error(`${file} is not a recognized contract fixture.`);
    }
    contractCounts[sidecarKind] += 1;
    if (!validators[sidecarKind](payload)) {
      throw new Error(
        `${file} failed ${sidecarKind} validation:\n${ajv.errorsText(validators[sidecarKind].errors)}`,
      );
    }
  }
}

validateReadalongSidecarSemantics(contractPayloads);

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
  "SourceEnvelope",
  "SourceRevision",
  "ExtractionRevision",
  "ReadingUnitManifest",
  "ReadalongManifest",
  "AudioArtifact",
  "ArtifactCompatibility",
  "RepairOverlay",
  "RevisionMap",
  "PromotionCrosswalk",
  "SourceManifestEvent",
  "DurableProgress",
  "ResumeResolution",
  "SyncFidelityDecision",
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

function validateReadalongSidecarSemantics(contractPayloads) {
  const byKind = new Map(readalongSidecarKinds.map((kind) => [kind, []]));
  const byId = new Map();
  const highlightMapById = new Map();
  const speechPlanById = new Map();
  for (const [file, payload] of contractPayloads) {
    if (payload.schemaVersion === "speech-plan.v1") {
      speechPlanById.set(payload.id, { file, payload });
    }
    if (payload.schemaVersion === "highlight-map.v2") {
      highlightMapById.set(payload.generatedAudioId, { file, payload });
    }
    if (!byKind.has(payload.schemaVersion)) {
      continue;
    }
    byKind.get(payload.schemaVersion).push({ file, payload });
    const id = sidecarIdentity(payload);
    if (id) {
      byId.set(id, { file, payload });
    }
  }

  const issues = [];
  for (const { file, payload } of byKind.get("source-envelope.v1")) {
    const currentRevision = requireReference(
      issues,
      file,
      "currentRevisionId",
      payload.currentRevisionId,
      byId,
      "source-revision.v1",
    );
    if (currentRevision) {
      requireSameValue(
        issues,
        file,
        `currentRevisionId ${payload.currentRevisionId} sourceId`,
        currentRevision.payload.sourceId,
        payload.sourceId,
      );
    }
    if (payload.promotedToSourceId) {
      requireReference(
        issues,
        file,
        "promotedToSourceId",
        payload.promotedToSourceId,
        byId,
        "source-envelope.v1",
      );
    }
  }
  for (const { file, payload } of byKind.get("source-revision.v1")) {
    requireReference(issues, file, "sourceId", payload.sourceId, byId, "source-envelope.v1");
    for (const field of ["supersedesRevisionId", "supersededByRevisionId"]) {
      if (payload[field]) {
        requireReference(issues, file, field, payload[field], byId, "source-revision.v1");
      }
    }
    if (payload.repairOverlayId) {
      requireReference(
        issues,
        file,
        "repairOverlayId",
        payload.repairOverlayId,
        byId,
        "repair-overlay.v1",
      );
    }
  }
  for (const { file, payload } of byKind.get("extraction-revision.v1")) {
    requireSourceRevisionBinding(issues, file, payload, byId);
  }
  for (const { file, payload } of byKind.get("reading-unit-manifest.v1")) {
    requireSourceRevisionBinding(issues, file, payload, byId);
    requireReference(
      issues,
      file,
      "extractionRevisionId",
      payload.extractionRevisionId,
      byId,
      "extraction-revision.v1",
    );
  }
  for (const { file, payload } of byKind.get("readalong-manifest.v1")) {
    requireSourceRevisionBinding(issues, file, payload, byId);
    requireReference(
      issues,
      file,
      "extractionRevisionId",
      payload.extractionRevisionId,
      byId,
      "extraction-revision.v1",
    );
    requireReference(
      issues,
      file,
      "readingUnitManifestId",
      payload.readingUnitManifestId,
      byId,
      "reading-unit-manifest.v1",
    );
    validateReadalongManifestReferences(issues, file, payload, {
      byId,
      highlightMapById,
      speechPlanById,
    });
    if (payload.supersededByManifestId) {
      requireReference(
        issues,
        file,
        "supersededByManifestId",
        payload.supersededByManifestId,
        byId,
        "readalong-manifest.v1",
      );
    }
  }
  for (const { file, payload } of byKind.get("audio-artifact.v1")) {
    requireSourceRevisionBinding(issues, file, payload, byId);
    requireReference(
      issues,
      file,
      "extractionRevisionId",
      payload.extractionRevisionId,
      byId,
      "extraction-revision.v1",
    );
    requireReference(
      issues,
      file,
      "readalongManifestId",
      payload.readalongManifestId,
      byId,
      "readalong-manifest.v1",
    );
    if (payload.replacedByArtifactId) {
      requireReference(
        issues,
        file,
        "replacedByArtifactId",
        payload.replacedByArtifactId,
        byId,
        "audio-artifact.v1",
      );
    }
  }
  for (const { file, payload } of byKind.get("artifact-compatibility.v1")) {
    requireSourceRevisionBinding(issues, file, payload, byId);
    const artifact = requireReference(
      issues,
      file,
      "artifactId",
      payload.artifactId,
      byId,
      "audio-artifact.v1",
    )?.payload;
    const targetRevision = requireReference(
      issues,
      file,
      "targetSourceRevisionId",
      payload.targetSourceRevisionId,
      byId,
      "source-revision.v1",
    )?.payload;
    if (artifact) {
      requireSameValue(
        issues,
        file,
        `${payload.artifactId} sourceId`,
        artifact.sourceId,
        payload.sourceId,
      );
      requireSameValue(
        issues,
        file,
        `${payload.artifactId} sourceRevisionId`,
        artifact.sourceRevisionId,
        payload.sourceRevisionId,
      );
    }
    if (targetRevision) {
      requireSameValue(
        issues,
        file,
        `targetSourceRevisionId ${payload.targetSourceRevisionId} sourceId`,
        targetRevision.sourceId,
        payload.sourceId,
      );
    }
  }
  for (const { file, payload } of byKind.get("repair-overlay.v1")) {
    requireSourceRevisionBinding(issues, file, payload, byId);
    requireReference(
      issues,
      file,
      "targetRevisionId",
      payload.targetRevisionId,
      byId,
      "source-revision.v1",
    );
  }
  for (const { file, payload } of byKind.get("revision-map.v1")) {
    requireReference(issues, file, "sourceId", payload.sourceId, byId, "source-envelope.v1");
    const fromRevision = requireReference(
      issues,
      file,
      "fromSourceRevisionId",
      payload.fromSourceRevisionId,
      byId,
      "source-revision.v1",
    )?.payload;
    const toRevision = requireReference(
      issues,
      file,
      "toSourceRevisionId",
      payload.toSourceRevisionId,
      byId,
      "source-revision.v1",
    )?.payload;
    if (fromRevision) {
      requireSameValue(
        issues,
        file,
        `fromSourceRevisionId ${payload.fromSourceRevisionId} sourceId`,
        fromRevision.sourceId,
        payload.sourceId,
      );
    }
    if (toRevision) {
      requireSameValue(
        issues,
        file,
        `toSourceRevisionId ${payload.toSourceRevisionId} sourceId`,
        toRevision.sourceId,
        payload.sourceId,
      );
    }
    if (payload.overlayId) {
      requireReference(issues, file, "overlayId", payload.overlayId, byId, "repair-overlay.v1");
    }
  }
  for (const { file, payload } of byKind.get("promotion-crosswalk.v1")) {
    requireReference(
      issues,
      file,
      "fromSourceId",
      payload.fromSourceId,
      byId,
      "source-envelope.v1",
    );
    requireReference(issues, file, "toSourceId", payload.toSourceId, byId, "source-envelope.v1");
    const fromManifest = requireReference(
      issues,
      file,
      "fromManifestId",
      payload.fromManifestId,
      byId,
      "readalong-manifest.v1",
    )?.payload;
    const toManifest = requireReference(
      issues,
      file,
      "toManifestId",
      payload.toManifestId,
      byId,
      "readalong-manifest.v1",
    )?.payload;
    if (fromManifest) {
      requireSameValue(
        issues,
        file,
        `fromManifestId ${payload.fromManifestId} sourceId`,
        fromManifest.sourceId,
        payload.fromSourceId,
      );
    }
    if (toManifest) {
      requireSameValue(
        issues,
        file,
        `toManifestId ${payload.toManifestId} sourceId`,
        toManifest.sourceId,
        payload.toSourceId,
      );
    }
    validatePromotionCrosswalkMappings(issues, file, payload, {
      byId,
      fromManifest,
      highlightMapById,
      toManifest,
    });
  }
  for (const { file, payload } of byKind.get("source-manifest-event.v1")) {
    requireReference(issues, file, "sourceId", payload.sourceId, byId, "source-envelope.v1");
    validateSourceManifestEventSubject(issues, file, payload, byId);
    if (payload.snapshotAvailable && !payload.snapshotManifestId) {
      issues.push(`${file} snapshotAvailable=true requires snapshotManifestId`);
    }
    if (payload.snapshotManifestId) {
      const snapshotManifest = requireReference(
        issues,
        file,
        "snapshotManifestId",
        payload.snapshotManifestId,
        byId,
        "readalong-manifest.v1",
      )?.payload;
      if (snapshotManifest) {
        requireSameValue(
          issues,
          file,
          `snapshotManifestId ${payload.snapshotManifestId} sourceId`,
          snapshotManifest.sourceId,
          payload.sourceId,
        );
      }
    }
  }
  for (const { file, payload } of byKind.get("durable-progress.v1")) {
    requireSourceRevisionBinding(issues, file, payload, byId);
    const manifest = requireReference(
      issues,
      file,
      "readalongManifestId",
      payload.readalongManifestId,
      byId,
      "readalong-manifest.v1",
    )?.payload;
    validateProgressContext(issues, file, payload, { byId, manifest });
  }
  for (const { file, payload } of byKind.get("resume-resolution.v1")) {
    requireReference(issues, file, "sourceId", payload.sourceId, byId, "source-envelope.v1");
    const progress = requireReference(
      issues,
      file,
      "progressId",
      payload.progressId,
      byId,
      "durable-progress.v1",
    )?.payload;
    const resolvedManifest = requireReference(
      issues,
      file,
      "resolvedReadalongManifestId",
      payload.resolvedReadalongManifestId,
      byId,
      "readalong-manifest.v1",
    )?.payload;
    const revisionMap = payload.revisionMapId
      ? requireReference(
          issues,
          file,
          "revisionMapId",
          payload.revisionMapId,
          byId,
          "revision-map.v1",
        )?.payload
      : undefined;
    const staleProgress = payload.staleProgressId
      ? requireReference(
          issues,
          file,
          "staleProgressId",
          payload.staleProgressId,
          byId,
          "durable-progress.v1",
        )?.payload
      : undefined;
    const retryArtifact = payload.retryArtifactId
      ? requireReference(
          issues,
          file,
          "retryArtifactId",
          payload.retryArtifactId,
          byId,
          "audio-artifact.v1",
        )?.payload
      : undefined;
    validateResumeResolutionContext(issues, file, payload, {
      progress,
      resolvedManifest,
      retryArtifact,
      revisionMap,
      staleProgress,
    });
  }
  for (const { file, payload } of byKind.get("sync-fidelity-decision.v1")) {
    requireSourceRevisionBinding(issues, file, payload, byId);
    requireReference(
      issues,
      file,
      "readalongManifestId",
      payload.readalongManifestId,
      byId,
      "readalong-manifest.v1",
    );
    requireReference(
      issues,
      file,
      "audioArtifactId",
      payload.audioArtifactId,
      byId,
      "audio-artifact.v1",
    );
    validateSyncFidelityDecision(issues, file, payload, { byId, highlightMapById });
  }
  validateEventSequences(issues, byKind.get("source-manifest-event.v1"));
  if (issues.length > 0) {
    throw new Error(`Readalong sidecar semantic validation failed:\n${issues.join("\n")}`);
  }
}

function validatePromotionCrosswalkMappings(
  issues,
  file,
  crosswalk,
  { byId, fromManifest, highlightMapById, toManifest },
) {
  const mappingValidators = {
    sourceRevisionIds: (id, side) =>
      validateMappedManifestReference(
        issues,
        file,
        crosswalk,
        id,
        side,
        byId,
        "source-revision.v1",
        "sourceRevisionId",
      ),
    extractionRevisionIds: (id, side) =>
      validateMappedManifestReference(
        issues,
        file,
        crosswalk,
        id,
        side,
        byId,
        "extraction-revision.v1",
        "extractionRevisionId",
      ),
    readingUnitManifestIds: (id, side) =>
      validateMappedManifestReference(
        issues,
        file,
        crosswalk,
        id,
        side,
        byId,
        "reading-unit-manifest.v1",
        "readingUnitManifestId",
      ),
    readalongManifestIds: (id, side) =>
      validateMappedManifestReference(
        issues,
        file,
        crosswalk,
        id,
        side,
        byId,
        "readalong-manifest.v1",
        "manifestId",
      ),
    readingUnitIds: (id, side) =>
      validateMappedReadingUnit(issues, file, crosswalk, id, side, { fromManifest, toManifest }),
    audioArtifactIds: (id, side) => {
      const target = validateMappedReference(
        issues,
        file,
        crosswalk,
        id,
        side,
        byId,
        "audio-artifact.v1",
      );
      const expectedManifestId =
        side === "from" ? crosswalk.fromManifestId : crosswalk.toManifestId;
      if (target) {
        requireSameValue(
          issues,
          file,
          `identityMappings.audioArtifactIds ${side} ${id} readalongManifestId`,
          target.payload.readalongManifestId,
          expectedManifestId,
        );
      }
    },
    highlightMapIds: (id, side) => {
      const target = highlightMapById.get(id)?.payload;
      const expectedSourceId = side === "from" ? crosswalk.fromSourceId : crosswalk.toSourceId;
      const expectedManifest = side === "from" ? fromManifest : toManifest;
      if (!target) {
        issues.push(
          `${file} identityMappings.highlightMapIds ${side} ${id} does not resolve to a HighlightMap v2 generatedAudioId`,
        );
        return;
      }
      requireSameValue(
        issues,
        file,
        `identityMappings.highlightMapIds ${side} ${id} sourceId`,
        target.sourceId,
        expectedSourceId,
      );
      if (!(expectedManifest?.highlightMapIds ?? []).includes(id)) {
        issues.push(
          `${file} identityMappings.highlightMapIds ${side} ${id} is not owned by ${expectedManifest?.manifestId ?? "missing manifest"}`,
        );
      }
    },
    progressIds: (id, side) => {
      const target = validateMappedReference(
        issues,
        file,
        crosswalk,
        id,
        side,
        byId,
        "durable-progress.v1",
      );
      const expectedManifestId =
        side === "from" ? crosswalk.fromManifestId : crosswalk.toManifestId;
      if (target) {
        requireSameValue(
          issues,
          file,
          `identityMappings.progressIds ${side} ${id} readalongManifestId`,
          target.payload.readalongManifestId,
          expectedManifestId,
        );
      }
    },
    repairOverlayIds: (id, side) =>
      validateMappedReference(issues, file, crosswalk, id, side, byId, "repair-overlay.v1"),
  };
  for (const [family, mappings] of Object.entries(crosswalk.identityMappings ?? {})) {
    const validateMappedId = mappingValidators[family];
    if (!validateMappedId) {
      continue;
    }
    for (const mapping of mappings ?? []) {
      validateMappedId(mapping.from, "from");
      validateMappedId(mapping.to, "to");
    }
  }
}

function validateMappedReference(issues, file, crosswalk, id, side, byId, expectedSchemaVersion) {
  const target = requireReference(
    issues,
    file,
    `identityMappings ${side} ${id}`,
    id,
    byId,
    expectedSchemaVersion,
  );
  const expectedSourceId = side === "from" ? crosswalk.fromSourceId : crosswalk.toSourceId;
  if (target?.payload.sourceId) {
    requireSameValue(
      issues,
      file,
      `identityMappings ${side} ${id} sourceId`,
      target.payload.sourceId,
      expectedSourceId,
    );
  }
  return target;
}

function validateMappedManifestReference(
  issues,
  file,
  crosswalk,
  id,
  side,
  byId,
  expectedSchemaVersion,
  manifestField,
) {
  const target = validateMappedReference(
    issues,
    file,
    crosswalk,
    id,
    side,
    byId,
    expectedSchemaVersion,
  );
  const manifest =
    side === "from"
      ? byId.get(crosswalk.fromManifestId)?.payload
      : byId.get(crosswalk.toManifestId)?.payload;
  if (target && manifest) {
    requireSameValue(
      issues,
      file,
      `identityMappings ${side} ${id} ${manifestField}`,
      id,
      manifest[manifestField],
    );
  }
  return target;
}

function validateMappedReadingUnit(
  issues,
  file,
  crosswalk,
  id,
  side,
  { fromManifest, toManifest },
) {
  const manifest = side === "from" ? fromManifest : toManifest;
  const expectedSourceId = side === "from" ? crosswalk.fromSourceId : crosswalk.toSourceId;
  if (!manifest) {
    issues.push(
      `${file} identityMappings.readingUnitIds ${side} ${id} cannot resolve without ${side} manifest`,
    );
    return;
  }
  requireSameValue(
    issues,
    file,
    `identityMappings.readingUnitIds ${side} ${id} manifest sourceId`,
    manifest.sourceId,
    expectedSourceId,
  );
  if (!manifestContainsUnit(manifest, id)) {
    issues.push(
      `${file} identityMappings.readingUnitIds ${side} ${id} does not resolve inside ${manifest.manifestId}`,
    );
  }
}

function validateProgressContext(issues, file, progress, { byId, manifest }) {
  if (manifest) {
    requireSameValue(
      issues,
      file,
      `readalongManifestId ${progress.readalongManifestId} sourceId`,
      manifest.sourceId,
      progress.sourceId,
    );
    requireSameValue(
      issues,
      file,
      `readalongManifestId ${progress.readalongManifestId} sourceRevisionId`,
      manifest.sourceRevisionId,
      progress.sourceRevisionId,
    );
    if (!manifestContainsUnit(manifest, progress.position?.unitId)) {
      issues.push(
        `${file} position.unitId ${progress.position?.unitId} does not resolve inside readalongManifestId ${progress.readalongManifestId}`,
      );
    }
  }
  if (progress.locatorEnvelope?.sourceId) {
    requireSameValue(
      issues,
      file,
      "locatorEnvelope.sourceId",
      progress.locatorEnvelope.sourceId,
      progress.sourceId,
    );
  }
  if (progress.audioArtifactId) {
    const artifact = requireReference(
      issues,
      file,
      "audioArtifactId",
      progress.audioArtifactId,
      byId,
      "audio-artifact.v1",
    )?.payload;
    if (artifact) {
      requireSameValue(
        issues,
        file,
        `${progress.audioArtifactId} sourceId`,
        artifact.sourceId,
        progress.sourceId,
      );
      requireSameValue(
        issues,
        file,
        `${progress.audioArtifactId} sourceRevisionId`,
        artifact.sourceRevisionId,
        progress.sourceRevisionId,
      );
      requireSameValue(
        issues,
        file,
        `${progress.audioArtifactId} readalongManifestId`,
        artifact.readalongManifestId,
        progress.readalongManifestId,
      );
    }
  }
}

function validateResumeResolutionContext(
  issues,
  file,
  resolution,
  { progress, resolvedManifest, retryArtifact, revisionMap, staleProgress },
) {
  if (progress) {
    requireSameValue(
      issues,
      file,
      `progressId ${resolution.progressId} sourceId`,
      progress.sourceId,
      resolution.sourceId,
    );
  }
  if (resolvedManifest) {
    requireSameValue(
      issues,
      file,
      `resolvedReadalongManifestId ${resolution.resolvedReadalongManifestId} sourceId`,
      resolvedManifest.sourceId,
      resolution.sourceId,
    );
  }
  if (resolution.resolvedLocatorEnvelope?.sourceId) {
    requireSameValue(
      issues,
      file,
      "resolvedLocatorEnvelope.sourceId",
      resolution.resolvedLocatorEnvelope.sourceId,
      resolution.sourceId,
    );
  }
  if (revisionMap) {
    requireSameValue(
      issues,
      file,
      `revisionMapId ${resolution.revisionMapId} sourceId`,
      revisionMap.sourceId,
      resolution.sourceId,
    );
  }
  if (staleProgress) {
    requireSameValue(
      issues,
      file,
      `staleProgressId ${resolution.staleProgressId} sourceId`,
      staleProgress.sourceId,
      resolution.sourceId,
    );
  }
  if (retryArtifact) {
    requireSameValue(
      issues,
      file,
      `retryArtifactId ${resolution.retryArtifactId} sourceId`,
      retryArtifact.sourceId,
      resolution.sourceId,
    );
    if (resolvedManifest) {
      requireSameValue(
        issues,
        file,
        `retryArtifactId ${resolution.retryArtifactId} readalongManifestId`,
        retryArtifact.readalongManifestId,
        resolvedManifest.manifestId,
      );
    }
  }
}

function manifestContainsUnit(manifest, unitId) {
  if (typeof unitId !== "string") {
    return false;
  }
  return (manifest.unitIds ?? []).includes(unitId);
}

function validateReadalongManifestReferences(
  issues,
  file,
  manifest,
  { byId, highlightMapById, speechPlanById },
) {
  for (const unitId of manifest.unitIds ?? []) {
    const readingUnitManifest = byId.get(manifest.readingUnitManifestId)?.payload;
    const unit = (readingUnitManifest?.units ?? []).find(
      (candidate) => candidate.unitId === unitId,
    );
    if (!unit) {
      issues.push(
        `${file} unitIds entry ${unitId} does not resolve inside readingUnitManifestId ${manifest.readingUnitManifestId}`,
      );
      continue;
    }
    requireSameValue(
      issues,
      file,
      `unit ${unitId} sourceId`,
      readingUnitManifest.sourceId,
      manifest.sourceId,
    );
    requireSameValue(
      issues,
      file,
      `unit ${unitId} sourceRevisionId`,
      readingUnitManifest.sourceRevisionId,
      manifest.sourceRevisionId,
    );
    requireSameValue(
      issues,
      file,
      `unit ${unitId} extractionRevisionId`,
      readingUnitManifest.extractionRevisionId,
      manifest.extractionRevisionId,
    );
  }
  for (const speechPlanId of manifest.speechPlanIds ?? []) {
    const speechPlan = speechPlanById.get(speechPlanId)?.payload;
    if (!speechPlan) {
      issues.push(
        `${file} speechPlanIds entry ${speechPlanId} does not resolve to a speech-plan.v1 fixture`,
      );
      continue;
    }
    requireSameValue(
      issues,
      file,
      `speechPlanIds entry ${speechPlanId} sourceId`,
      speechPlan.sourceId,
      manifest.sourceId,
    );
  }
  requireArrayReferences(
    issues,
    file,
    manifest,
    "audioArtifactIds",
    byId,
    "audio-artifact.v1",
    (target) => {
      requireSameValue(
        issues,
        file,
        `${target.payload.artifactId} sourceId`,
        target.payload.sourceId,
        manifest.sourceId,
      );
      requireSameValue(
        issues,
        file,
        `${target.payload.artifactId} sourceRevisionId`,
        target.payload.sourceRevisionId,
        manifest.sourceRevisionId,
      );
      requireSameValue(
        issues,
        file,
        `${target.payload.artifactId} readalongManifestId`,
        target.payload.readalongManifestId,
        manifest.manifestId,
      );
    },
  );
  for (const highlightMapId of manifest.highlightMapIds ?? []) {
    const target = highlightMapById.get(highlightMapId);
    if (!target) {
      issues.push(
        `${file} highlightMapIds entry ${highlightMapId} does not resolve to a HighlightMap v2 generatedAudioId`,
      );
      continue;
    }
    requireSameValue(
      issues,
      file,
      `${highlightMapId} sourceId`,
      target.payload.sourceId,
      manifest.sourceId,
    );
  }
  requireArrayReferences(
    issues,
    file,
    manifest,
    "artifactCompatibilityIds",
    byId,
    "artifact-compatibility.v1",
    (target) => {
      requireSameValue(
        issues,
        file,
        `${target.payload.compatibilityId} sourceId`,
        target.payload.sourceId,
        manifest.sourceId,
      );
      requireSameValue(
        issues,
        file,
        `${target.payload.compatibilityId} targetSourceRevisionId`,
        target.payload.targetSourceRevisionId,
        manifest.sourceRevisionId,
      );
      if (!manifest.audioArtifactIds.includes(target.payload.artifactId)) {
        issues.push(
          `${file} artifactCompatibilityIds entry ${target.payload.compatibilityId} artifactId ${target.payload.artifactId} is not owned by this manifest`,
        );
      }
    },
  );
  requireArrayReferences(
    issues,
    file,
    manifest,
    "syncFidelityDecisionIds",
    byId,
    "sync-fidelity-decision.v1",
    (target) => {
      requireSameValue(
        issues,
        file,
        `${target.payload.decisionId} sourceId`,
        target.payload.sourceId,
        manifest.sourceId,
      );
      requireSameValue(
        issues,
        file,
        `${target.payload.decisionId} sourceRevisionId`,
        target.payload.sourceRevisionId,
        manifest.sourceRevisionId,
      );
      requireSameValue(
        issues,
        file,
        `${target.payload.decisionId} readalongManifestId`,
        target.payload.readalongManifestId,
        manifest.manifestId,
      );
    },
  );
  requireArrayReferences(
    issues,
    file,
    manifest,
    "progressIds",
    byId,
    "durable-progress.v1",
    (target) => {
      requireSameValue(
        issues,
        file,
        `${target.payload.progressId} sourceId`,
        target.payload.sourceId,
        manifest.sourceId,
      );
      requireSameValue(
        issues,
        file,
        `${target.payload.progressId} sourceRevisionId`,
        target.payload.sourceRevisionId,
        manifest.sourceRevisionId,
      );
      requireSameValue(
        issues,
        file,
        `${target.payload.progressId} readalongManifestId`,
        target.payload.readalongManifestId,
        manifest.manifestId,
      );
    },
  );
  requireArrayReferences(
    issues,
    file,
    manifest,
    "repairOverlayIds",
    byId,
    "repair-overlay.v1",
    (target) => {
      const matchesRevision =
        target.payload.sourceRevisionId === manifest.sourceRevisionId ||
        target.payload.targetRevisionId === manifest.sourceRevisionId;
      requireSameValue(
        issues,
        file,
        `${target.payload.overlayId} sourceId`,
        target.payload.sourceId,
        manifest.sourceId,
      );
      if (!matchesRevision) {
        issues.push(
          `${file} repair overlay ${target.payload.overlayId} does not touch manifest sourceRevisionId ${manifest.sourceRevisionId}`,
        );
      }
    },
  );
}

function requireArrayReferences(
  issues,
  file,
  owner,
  field,
  byId,
  expectedSchemaVersion,
  validateTarget,
) {
  for (const value of owner[field] ?? []) {
    const target = requireReference(
      issues,
      file,
      `${field} entry`,
      value,
      byId,
      expectedSchemaVersion,
    );
    if (target) {
      validateTarget?.(target);
    }
  }
}

function validateSourceManifestEventSubject(issues, file, event, byId) {
  const expectedSubjectRefs = {
    source_revision_created: { sourceRevisionId: "source-revision.v1" },
    extraction_revision_updated: { extractionRevisionId: "extraction-revision.v1" },
    reading_unit_manifest_written: { readingUnitManifestId: "reading-unit-manifest.v1" },
    readalong_manifest_written: { readalongManifestId: "readalong-manifest.v1" },
    audio_artifact_updated: {
      readalongManifestId: "readalong-manifest.v1",
      audioArtifactId: "audio-artifact.v1",
    },
    artifact_interrupted_retriable: {
      readalongManifestId: "readalong-manifest.v1",
      audioArtifactId: "audio-artifact.v1",
    },
    progress_updated: { progressId: "durable-progress.v1" },
    repair_overlay_created: { repairOverlayId: "repair-overlay.v1" },
    promotion_crosswalk_created: { promotionCrosswalkId: "promotion-crosswalk.v1" },
  };
  const expected = expectedSubjectRefs[event.eventType] ?? {};
  for (const [field, kind] of Object.entries(expected)) {
    requireReference(issues, file, `subject.${field}`, event.subject?.[field], byId, kind);
  }
  for (const [field, kind] of Object.entries({
    sourceRevisionId: "source-revision.v1",
    extractionRevisionId: "extraction-revision.v1",
    readingUnitManifestId: "reading-unit-manifest.v1",
    readalongManifestId: "readalong-manifest.v1",
    audioArtifactId: "audio-artifact.v1",
    progressId: "durable-progress.v1",
    repairOverlayId: "repair-overlay.v1",
    promotionCrosswalkId: "promotion-crosswalk.v1",
  })) {
    if (event.subject?.[field]) {
      const target = requireReference(
        issues,
        file,
        `subject.${field}`,
        event.subject[field],
        byId,
        kind,
      );
      if (target?.payload.sourceId) {
        requireSameValue(
          issues,
          file,
          `subject.${field} sourceId`,
          target.payload.sourceId,
          event.sourceId,
        );
      }
      if (target?.payload.schemaVersion === "promotion-crosswalk.v1") {
        const includesEventSource =
          target.payload.fromSourceId === event.sourceId ||
          target.payload.toSourceId === event.sourceId;
        if (!includesEventSource) {
          issues.push(
            `${file} subject.${field} ${event.subject[field]} does not include event sourceId ${event.sourceId}`,
          );
        }
      }
    }
  }
}

function validateSyncFidelityDecision(issues, file, decision, { byId, highlightMapById }) {
  const evidence = decision.evidence ?? {};
  const manifest = byId.get(decision.readalongManifestId)?.payload;
  const highlightMap = decision.highlightMapId
    ? highlightMapById.get(decision.highlightMapId)?.payload
    : undefined;
  const highlightMapMatchesDecision =
    !!highlightMap &&
    highlightMap.sourceId === decision.sourceId &&
    (manifest?.highlightMapIds ?? []).includes(decision.highlightMapId);
  const exactEvidencePasses =
    evidence.sourceRevisionCurrent === true &&
    evidence.mappingValid === true &&
    evidence.timingConfidence === true &&
    evidence.lowResourceMode === false &&
    evidence.artifactCompatible === true &&
    highlightMapMatchesDecision;
  if (decision.highlightMapId && !highlightMap) {
    issues.push(
      `${file} highlightMapId ${decision.highlightMapId} does not resolve to a HighlightMap v2 generatedAudioId`,
    );
  }
  if (highlightMap) {
    requireSameValue(
      issues,
      file,
      `highlightMapId ${decision.highlightMapId} sourceId`,
      highlightMap.sourceId,
      decision.sourceId,
    );
    if (!manifest?.highlightMapIds?.includes(decision.highlightMapId)) {
      issues.push(
        `${file} highlightMapId ${decision.highlightMapId} is not owned by readalongManifestId ${decision.readalongManifestId}`,
      );
    }
  }
  if (decision.fidelity === "exact_word" && decision.exactAllowed !== true) {
    issues.push(`${file} exact_word fidelity must set exactAllowed=true`);
  }
  if (decision.fidelity !== "exact_word" && decision.exactAllowed !== false) {
    issues.push(`${file} non-exact fidelity must set exactAllowed=false`);
  }
  if (decision.exactAllowed === true && !exactEvidencePasses) {
    issues.push(
      `${file} exactAllowed=true requires current source revision, valid mapping, timing confidence, compatible artifact, lowResourceMode=false, and a valid highlightMapId`,
    );
  }
  const audioArtifact = byId.get(decision.audioArtifactId)?.payload;
  if (audioArtifact) {
    requireSameValue(
      issues,
      file,
      `${decision.audioArtifactId} sourceId`,
      audioArtifact.sourceId,
      decision.sourceId,
    );
    requireSameValue(
      issues,
      file,
      `${decision.audioArtifactId} sourceRevisionId`,
      audioArtifact.sourceRevisionId,
      decision.sourceRevisionId,
    );
    requireSameValue(
      issues,
      file,
      `${decision.audioArtifactId} readalongManifestId`,
      audioArtifact.readalongManifestId,
      decision.readalongManifestId,
    );
  }
}

function requireSameValue(issues, file, label, actual, expected) {
  if (actual !== expected) {
    issues.push(`${file} ${label} ${actual} does not match ${expected}`);
  }
}

function sidecarIdentity(payload) {
  const identityFieldByKind = {
    "source-envelope.v1": "sourceId",
    "source-revision.v1": "revisionId",
    "extraction-revision.v1": "extractionRevisionId",
    "reading-unit-manifest.v1": "manifestId",
    "readalong-manifest.v1": "manifestId",
    "audio-artifact.v1": "artifactId",
    "artifact-compatibility.v1": "compatibilityId",
    "repair-overlay.v1": "overlayId",
    "revision-map.v1": "revisionMapId",
    "promotion-crosswalk.v1": "crosswalkId",
    "source-manifest-event.v1": "eventId",
    "durable-progress.v1": "progressId",
    "resume-resolution.v1": "resolutionId",
    "sync-fidelity-decision.v1": "decisionId",
  };
  const field = identityFieldByKind[payload.schemaVersion];
  return typeof payload[field] === "string" ? payload[field] : undefined;
}

function requireSourceRevisionBinding(issues, file, payload, byId) {
  requireReference(issues, file, "sourceId", payload.sourceId, byId, "source-envelope.v1");
  const sourceRevision = requireReference(
    issues,
    file,
    "sourceRevisionId",
    payload.sourceRevisionId,
    byId,
    "source-revision.v1",
  )?.payload;
  if (sourceRevision) {
    requireSameValue(
      issues,
      file,
      `sourceRevisionId ${payload.sourceRevisionId} sourceId`,
      sourceRevision.sourceId,
      payload.sourceId,
    );
  }
  return sourceRevision;
}

function requireReference(issues, file, field, value, byId, expectedSchemaVersion) {
  if (typeof value !== "string" || value.length === 0) {
    issues.push(`${file} missing ${field}`);
    return undefined;
  }
  const target = byId.get(value);
  if (!target) {
    issues.push(`${file} ${field} ${value} does not resolve to ${expectedSchemaVersion}`);
    return undefined;
  }
  if (target.payload.schemaVersion !== expectedSchemaVersion) {
    issues.push(
      `${file} ${field} ${value} resolves to ${target.payload.schemaVersion}, expected ${expectedSchemaVersion}`,
    );
    return undefined;
  }
  return target;
}

function validateEventSequences(issues, events) {
  const bySource = new Map();
  for (const { file, payload } of events) {
    bySource.set(payload.sourceId, [...(bySource.get(payload.sourceId) ?? []), { file, payload }]);
  }
  for (const [sourceId, sourceEvents] of bySource) {
    const sorted = [...sourceEvents].sort(
      (left, right) => left.payload.sequence - right.payload.sequence,
    );
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].payload.sequence <= sorted[index - 1].payload.sequence) {
        issues.push(`${sorted[index].file} sequence is not strictly increasing for ${sourceId}`);
      }
    }
  }
}

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
