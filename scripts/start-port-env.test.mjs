import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolver = path.join(repoRoot, "scripts/start-port-env.sh");

function resolvePorts(environment) {
  const command = [
    `source ${JSON.stringify(resolver)}`,
    "resolve_start_ports",
    'printf "%s|%s|%s" "$BACKEND_PORT" "$FRONTEND_PORT" "$VITE_API_BASE_URL"',
  ].join("; ");
  return spawnSync("bash", ["-c", command], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...environment },
  });
}

test("API_PORT and PORT aliases resolve the exact custom-port contract", () => {
  const result = resolvePorts({ API_PORT: "8087", PORT: "5174" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "8087|5174|http://localhost:8087");
});

test("explicit backend/frontend values outrank aliases", () => {
  const result = resolvePorts({
    API_PORT: "8087",
    BACKEND_PORT: "9000",
    FRONTEND_PORT: "6000",
    PORT: "5174",
    START_EXPLICIT_BACKEND_PORT: "1",
    START_EXPLICIT_FRONTEND_PORT: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "9000|6000|http://localhost:9000");
});

test("invalid ports fail before service launch", async () => {
  const result = resolvePorts({ API_PORT: "70000", PORT: "5174" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected 1-65535/);

  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  assert.match(packageJson.scripts["start:local"], /KOKORO_DEVICE=cpu/);
  assert.match(packageJson.scripts["start:local"], /QWEN_ASR_DEVICE=cpu/);
});
