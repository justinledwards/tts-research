import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_CONTRACT_JSON_PATH,
  DEFAULT_PEER_RESPONSE_PATH,
} from "./validate-responsive-architecture.mjs";
import {
  DEFAULT_BATCH_JSON_PATH,
  DEFAULT_BATCH_MARKDOWN_PATH,
  extractExactPeerIssues,
  renderResponsiveBatchMarkdown,
  runResponsiveBatchValidation,
  validateResponsiveBatch,
} from "./validate-responsive-linear-batch.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const [CANONICAL_PACKET, ARCHITECTURE, PEER_TEXT] = await Promise.all([
  readFile(path.join(ROOT, DEFAULT_BATCH_JSON_PATH), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, DEFAULT_CONTRACT_JSON_PATH), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, DEFAULT_PEER_RESPONSE_PATH), "utf8"),
]);

function expectRejected(mutator, expectedError) {
  const packet = structuredClone(CANONICAL_PACKET);
  mutator(packet);
  assert.throws(() => validateResponsiveBatch(packet, ARCHITECTURE, PEER_TEXT), expectedError);
}

test("canonical replacement packet validates exact Peer fields and Markdown parity", async () => {
  const exactIssues = extractExactPeerIssues(PEER_TEXT);
  assert.equal(exactIssues.length, 15);
  assert.doesNotThrow(() => validateResponsiveBatch(CANONICAL_PACKET, ARCHITECTURE, PEER_TEXT));
  const markdown = await readFile(path.join(ROOT, DEFAULT_BATCH_MARKDOWN_PATH), "utf8");
  assert.equal(markdown, renderResponsiveBatchMarkdown(CANONICAL_PACKET));
  await assert.doesNotReject(runResponsiveBatchValidation({ root: ROOT }));
});

test("wrong issue count and wrong RSP IDs are rejected", () => {
  expectRejected((packet) => {
    packet.issues.pop();
    packet.issueCount = 14;
  }, /issueCount must be exactly 15/);
  expectRejected((packet) => {
    packet.issues[14].localId = "RSP-16";
  }, /issue IDs must be ordered exactly RSP-01 through RSP-15/);
});

test("wrong dependency DAG is rejected", () => {
  expectRejected((packet) => {
    packet.dag["RSP-08"] = ["RSP-03", "RSP-07"];
  }, /replacement DAG must exactly match the Peer graph/);
  expectRejected((packet) => {
    packet.issues.find(({ localId }) => localId === "RSP-10").dependencies.pop();
  }, /RSP-10: dependencies must exactly match the Peer response/);
});

test("exact objective, scope/symbol, non-goal, and acceptance Peer text cannot drift", () => {
  for (const [field, mutate] of [
    ["objective", (issue) => `${issue.objective} altered`],
    ["inScope", (issue) => issue.inScope.slice(1)],
    ["scopeAndSymbols", (issue) => issue.scopeAndSymbols.slice(1)],
    ["nonGoals", (issue) => `${issue.nonGoals} altered`],
    ["acceptanceProbes", (issue) => issue.acceptanceProbes.slice(1)],
  ]) {
    expectRejected(
      (packet) => {
        const issue = packet.issues[0];
        issue[field] = mutate(issue);
      },
      new RegExp(`RSP-01: ${field} must exactly match the Peer response`),
    );
  }
});

test("missing budgets, evidence, and rollback fail closed", () => {
  expectRejected((packet) => {
    packet.issues.find(({ localId }) => localId === "RSP-14").performanceBudgetIds.pop();
  }, /RSP-14 must carry every responsive performance budget/);
  expectRejected((packet) => {
    packet.issues.find(({ localId }) => localId === "RSP-05").observabilityEvidence = "";
  }, /RSP-05: observabilityEvidence must exactly match the Peer response/);
  expectRejected((packet) => {
    packet.issues.find(({ localId }) => localId === "RSP-07").rollbackBoundary = "";
  }, /RSP-07: rollbackBoundary must exactly match the Peer response/);
});

test("unauthorized Linear creation or product implementation is rejected", () => {
  expectRejected((packet) => {
    packet.authorization.ownerAccepted = false;
  }, /batch authorization must exactly mirror the architecture contract/);
  for (const gate of [
    "peerApproved",
    "linearCreationAuthorized",
    "productImplementationAuthorized",
  ]) {
    expectRejected((packet) => {
      packet.authorization[gate] = true;
    }, /batch authorization must exactly mirror the architecture contract/);
  }
  expectRejected((packet) => {
    packet.creationPlan.eligibleForLinearCreation = ["RSP-01"];
  }, /no issue is eligible for Linear creation/);
  expectRejected((packet) => {
    packet.creationPlan.newIssuesCreatedNow = 1;
    packet.creationPlan.linearMutationPerformed = true;
  }, /newIssuesCreatedNow must be zero/);
  expectRejected((packet) => {
    packet.issues[0].linear = { id: "fake", url: "fake" };
  }, /RSP-01: Linear binding must remain null/);
  expectRejected((packet) => {
    packet.issues[0].productImplementationAuthorized = true;
  }, /RSP-01: all issue authorization gates must remain false/);
});

test("only RSP-01 is graph-unblocked and it remains unauthorized", () => {
  assert.deepEqual(CANONICAL_PACKET.creationPlan.graphUnblockedIssues, ["RSP-01"]);
  assert.equal(CANONICAL_PACKET.issues[0].status, "graph_unblocked_not_authorized");
  assert.equal(CANONICAL_PACKET.issues[0].productImplementationAuthorized, false);
  assert.equal(CANONICAL_PACKET.issues[0].linearCreationAuthorized, false);
  expectRejected((packet) => {
    packet.issues[1].dependencyUnblocked = true;
  }, /RSP-02: dependency-unblocked boolean drift/);
});

test("old BIC packet remains an explicit frozen provenance surface", () => {
  assert.deepEqual(CANONICAL_PACKET.replacementFor, [
    "docs/project-management/linear/tts-research-best-in-class-batch-draft.json",
    "docs/project-management/linear/tts-research-best-in-class-batch-draft.md",
  ]);
  assert.match(CANONICAL_PACKET.provenancePolicy, /frozen provenance/);
  expectRejected((packet) => {
    packet.frozenProvenanceSha256[
      "docs/project-management/linear/tts-research-best-in-class-batch-draft.json"
    ] = "0".repeat(64);
  }, /old BIC provenance SHA-256 map drift/);
});
