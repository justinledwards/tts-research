import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  CONTENT_IR_SCHEMA_VERSION,
  detectSchemaKind,
  schemaBundle,
  validateContentIR,
  validateDetectedSchema,
} from "../dist/index.js";

test("exports schema constants and bundle entries", () => {
  assert.equal(CONTENT_IR_SCHEMA_VERSION, "content-ir.v1");
  assert.ok(schemaBundle.schemas["content-ir.v1"]);
  assert.ok(schemaBundle.schemas["highlight-map.v1"]);
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
