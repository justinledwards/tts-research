import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CONTENT_IR_SCHEMA_VERSION,
  HIGHLIGHT_MAP_V2_SCHEMA_VERSION,
  SOURCE_ENVELOPE_SCHEMA_VERSION,
  SYNC_FIDELITY_DECISION_SCHEMA_VERSION,
  detectSchemaKind,
  schemaBundle,
  validateContentIR,
  validateDetectedSchema,
  validateHighlightMapV2,
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
];

test("exports schema constants and bundle entries", () => {
  assert.equal(CONTENT_IR_SCHEMA_VERSION, "content-ir.v1");
  assert.equal(HIGHLIGHT_MAP_V2_SCHEMA_VERSION, "highlight-map.v2");
  assert.equal(SOURCE_ENVELOPE_SCHEMA_VERSION, "source-envelope.v1");
  assert.equal(SYNC_FIDELITY_DECISION_SCHEMA_VERSION, "sync-fidelity-decision.v1");
  assert.ok(schemaBundle.schemas["content-ir.v1"]);
  assert.ok(schemaBundle.schemas["highlight-map.v1"]);
  assert.ok(schemaBundle.schemas["highlight-map.v2"]);
  for (const kind of sidecarKinds) {
    assert.ok(schemaBundle.schemas[kind], `${kind} should be in the schema bundle`);
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
