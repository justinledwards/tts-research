import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CONTENT_IR_SCHEMA_VERSION,
  detectSchemaKind,
  HIGHLIGHT_MAP_V2_SCHEMA_VERSION,
  READER_WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
  SOURCE_ENVELOPE_SCHEMA_VERSION,
  SYNC_FIDELITY_DECISION_SCHEMA_VERSION,
  schemaBundle,
  validateContentIR,
  validateDetectedSchema,
  validateHighlightMapV2,
  validateReaderWorkspaceSnapshot,
  validateSourceEnvelope,
  validateSyncFidelityDecision,
} from "../dist/index.js";

const sidecarKinds = [
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
  "reader_workspace_snapshot.v1",
];

test("exports schema constants and bundle entries", () => {
  assert.equal(CONTENT_IR_SCHEMA_VERSION, "content-ir.v1");
  assert.equal(HIGHLIGHT_MAP_V2_SCHEMA_VERSION, "highlight-map.v2");
  assert.equal(SOURCE_ENVELOPE_SCHEMA_VERSION, "source-envelope.v1");
  assert.equal(SYNC_FIDELITY_DECISION_SCHEMA_VERSION, "sync-fidelity-decision.v1");
  assert.equal(READER_WORKSPACE_SNAPSHOT_SCHEMA_VERSION, "reader_workspace_snapshot.v1");
  assert.ok(schemaBundle.schemas["content-ir.v1"]);
  assert.ok(schemaBundle.schemas["highlight-map.v1"]);
  assert.ok(schemaBundle.schemas["highlight-map.v2"]);
  for (const kind of sidecarKinds) {
    assert.ok(schemaBundle.schemas[kind], `${kind} should be in the schema bundle`);
  }
});

test("validates empty-project, source-only, and fully-bound reader workspace snapshots", async () => {
  for (const fixture of [
    "reader-workspace-snapshot.empty-project.v1.json",
    "reader-workspace-snapshot.source-only.v1.json",
    "reader-workspace-snapshot.fully-bound.v1.json",
  ]) {
    const payload = JSON.parse(
      await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), "utf8"),
    );
    assert.equal(detectSchemaKind(payload), "reader_workspace_snapshot.v1");
    assert.equal(validateReaderWorkspaceSnapshot(payload).valid, true, fixture);
    assert.equal(validateDetectedSchema(payload).valid, true, fixture);
  }
});

test("rejects partially populated reader workspace source identity", async () => {
  for (const fixture of [
    "reader-workspace-snapshot.partial-source-id.v1.json",
    "reader-workspace-snapshot.partial-source-revision.v1.json",
    "reader-workspace-snapshot.partial-source-hash.v1.json",
    "reader-workspace-snapshot.partial-source-missing-id.v1.json",
    "reader-workspace-snapshot.partial-source-missing-revision.v1.json",
    "reader-workspace-snapshot.partial-source-missing-hash.v1.json",
  ]) {
    const payload = JSON.parse(
      await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), "utf8"),
    );
    assert.equal(validateReaderWorkspaceSnapshot(payload).valid, false, fixture);
  }
});

test("rejects invalid reader workspace snapshot transport shapes", async () => {
  const emptyProject = JSON.parse(
    await readFile(
      new URL("./fixtures/reader-workspace-snapshot.empty-project.v1.json", import.meta.url),
      "utf8",
    ),
  );
  const sourceOnly = JSON.parse(
    await readFile(
      new URL("./fixtures/reader-workspace-snapshot.source-only.v1.json", import.meta.url),
      "utf8",
    ),
  );
  const fullyBound = JSON.parse(
    await readFile(
      new URL("./fixtures/reader-workspace-snapshot.fully-bound.v1.json", import.meta.url),
      "utf8",
    ),
  );
  const invalidPayloads = [
    { ...sourceOnly, unknown: true },
    { ...sourceOnly, projectRevision: -1 },
    { ...fullyBound, mediaManifestVersion: -1 },
    { ...fullyBound, timingRevision: -1 },
    { ...fullyBound, playbackCursorMs: -1 },
    { ...fullyBound, playbackRate: -1 },
    { ...sourceOnly, readMode: "playing" },
    { ...sourceOnly, runId: "run-1", runCompatibilityKey: null },
    { ...emptyProject, readMode: "readable" },
    { ...emptyProject, runId: "run-1", runCompatibilityKey: "compatibility-1" },
    { ...emptyProject, mediaManifestVersion: 0 },
    { ...emptyProject, timingRevision: 0 },
    { ...emptyProject, syncFidelity: null },
    { ...emptyProject, readerLocator: fullyBound.readerLocator },
    { ...emptyProject, playbackCursorMs: 0 },
    { ...emptyProject, playbackRate: null },
    { ...emptyProject, followPreference: false },
  ];
  for (const payload of invalidPayloads) {
    assert.equal(validateReaderWorkspaceSnapshot(payload).valid, false);
  }
});

test("validates a public Content IR fixture", async () => {
  const payload = JSON.parse(
    await readFile(
      new URL("../../../fixtures/contracts/markdown.content-ir.v1.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(detectSchemaKind(payload), "content-ir.v1");
  assert.equal(validateContentIR(payload).valid, true);
  assert.equal(validateDetectedSchema(payload).valid, true);
});

test("validates a public HighlightMap v2 fixture", async () => {
  const payload = JSON.parse(
    await readFile(
      new URL("../../../fixtures/contracts/markdown-word.highlight-map.v2.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(detectSchemaKind(payload), "highlight-map.v2");
  assert.equal(validateHighlightMapV2(payload).valid, true);
  assert.equal(validateDetectedSchema(payload).valid, true);
});

test("validates public readalong sidecar fixtures", async () => {
  const sourceEnvelope = JSON.parse(
    await readFile(
      new URL(
        "../../../fixtures/contracts/readalong-project.source-envelope.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(detectSchemaKind(sourceEnvelope), "source-envelope.v1");
  assert.equal(validateSourceEnvelope(sourceEnvelope).valid, true);
  assert.equal(validateDetectedSchema(sourceEnvelope).valid, true);

  const syncDecision = JSON.parse(
    await readFile(
      new URL(
        "../../../fixtures/contracts/readalong-exact.sync-fidelity-decision.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(detectSchemaKind(syncDecision), "sync-fidelity-decision.v1");
  assert.equal(validateSyncFidelityDecision(syncDecision).valid, true);
  assert.equal(validateDetectedSchema(syncDecision).valid, true);
});
