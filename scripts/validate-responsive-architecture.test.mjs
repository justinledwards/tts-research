import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_CONTRACT_JSON_PATH,
  DEFAULT_CONTRACT_MARKDOWN_PATH,
  DEFAULT_PEER_RESPONSE_PATH,
  renderArchitectureMarkdown,
  runArchitectureValidation,
  validateArchitectureContract,
} from "./validate-responsive-architecture.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const [CANONICAL_CONTRACT, PEER_TEXT] = await Promise.all([
  readFile(path.join(ROOT, DEFAULT_CONTRACT_JSON_PATH), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, DEFAULT_PEER_RESPONSE_PATH), "utf8"),
]);

function expectRejected(mutator, expectedError) {
  const mutation = structuredClone(CANONICAL_CONTRACT);
  mutator(mutation);
  assert.throws(() => validateArchitectureContract(mutation, PEER_TEXT), expectedError);
}

test("canonical responsive architecture validates and Markdown is generated in parity", async () => {
  assert.doesNotThrow(() => validateArchitectureContract(CANONICAL_CONTRACT, PEER_TEXT));
  const markdown = await readFile(path.join(ROOT, DEFAULT_CONTRACT_MARKDOWN_PATH), "utf8");
  assert.equal(markdown, renderArchitectureMarkdown(CANONICAL_CONTRACT));
  await assert.doesNotReject(runArchitectureValidation({ root: ROOT }));
});

test("adversarial terminal Cinema gate is rejected", () => {
  expectRejected((contract) => {
    contract.uxContract.cinema.availabilityDerivation =
      'sourceRevisionReady && generatedAudioLifecycle === "ready"';
  }, /Cinema availability must derive from source readiness, never terminal audio/);
});

test("adversarial second playback owner is rejected", () => {
  expectRejected((contract) => {
    contract.playbackContract.maxActiveControllersPerSession = 2;
  }, /exactly one playback controller is allowed/);
  expectRejected((contract) => {
    contract.playbackContract.maxAudioOwnersPerSession = 2;
  }, /exactly one audio owner is allowed/);
});

test("adversarial absent source revision binding is rejected", () => {
  expectRejected((contract) => {
    contract.narrationRunContract.bindingFields =
      contract.narrationRunContract.bindingFields.filter((field) => field !== "sourceRevisionId");
  }, /run binding must include exact immutable source\/configuration fields/);
  expectRejected((contract) => {
    contract.sourceContract.revisionIdentityFields = ["sourceId", "contentHash"];
  }, /source revision identity must require/);
});

test("adversarial unsequenced event stream is rejected", () => {
  expectRejected((contract) => {
    contract.eventContract.envelopeFields = contract.eventContract.envelopeFields.filter(
      (field) => field !== "sequence",
    );
  }, /event envelope must include exact sequenced revision-bound fields/);
  expectRejected((contract) => {
    contract.eventContract.monotonicPerRun = false;
  }, /event sequence must be monotonic per run/);
});

test("adversarial oversized source summary DTO is rejected", () => {
  expectRejected((contract) => {
    contract.sourceContract.summaryDto.maxRawBytes = 65537;
  }, /raw limit must be exactly 64 KiB/);
  expectRejected((contract) => {
    contract.sourceContract.summaryDto.forbiddenFields =
      contract.sourceContract.summaryDto.forbiddenFields.filter((field) => field !== "blocks");
  }, /summary DTO must forbid all detailed\/unbounded fields/);
});

test("missing performance budget and raw evidence binding fail closed", () => {
  expectRejected((contract) => {
    contract.performanceContract.budgets.pop();
  }, /all 20 responsive budgets are required/);
  expectRejected((contract) => {
    contract.performanceContract.requiredRawArtifactBindings =
      contract.performanceContract.requiredRawArtifactBindings.filter(
        (field) => field !== "sourceSha",
      );
  }, /raw performance evidence bindings are incomplete/);
});

test("review provenance and measured bootstrap bytes are exact", () => {
  expectRejected((contract) => {
    contract.source.peerResponseSha256 = "0".repeat(64);
  }, /Peer response SHA-256 drift/);
  expectRejected((contract) => {
    contract.source.reviewArchiveSha256 = "0".repeat(64);
  }, /reviewed archive SHA-256 drift/);
  expectRejected((contract) => {
    contract.currentBaseline.recordedPreparedSourceListBytes += 1;
  }, /prepared-source baseline bytes must match direct runtime evidence/);
});

test("owner acceptance cannot infer Peer, Linear, or product authorization", () => {
  expectRejected((contract) => {
    contract.authorization.ownerAccepted = false;
  }, /authorization must keep owner acceptance true/);
  for (const gate of [
    "peerApproved",
    "linearCreationAuthorized",
    "productImplementationAuthorized",
  ]) {
    expectRejected((contract) => {
      contract.authorization[gate] = true;
    }, /authorization must keep owner acceptance true/);
  }
});
