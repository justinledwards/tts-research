#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_CONTRACT_JSON_PATH,
  DEFAULT_PEER_RESPONSE_PATH,
  EXPECTED_ISSUE_IDS,
  REQUIRED_PEER_MARKER,
  invariant,
  validateArchitectureContract,
} from "./validate-responsive-architecture.mjs";

export const DEFAULT_BATCH_JSON_PATH =
  "docs/project-management/linear/tts-research-responsive-architecture-batch-draft.json";
export const DEFAULT_BATCH_MARKDOWN_PATH =
  "docs/project-management/linear/tts-research-responsive-architecture-batch-draft.md";

const EXPECTED_PROJECT_ID = "010252d0-b34c-473d-82f2-05bc4d7bc685";
const EXPECTED_TEAM_ID = "cdc92ef0-dc69-47b5-8896-312dbc1e2d93";
const EXPECTED_FROZEN_PROVENANCE_SHA256 = {
  "docs/project-management/linear/tts-research-best-in-class-batch-draft.json":
    "1ae22003178761e60de4661d763f239a2c22e3ca4624e14a29d155b50eb264c0",
  "docs/project-management/linear/tts-research-best-in-class-batch-draft.md":
    "589d54b0534091bb2442d5d84a1c93df3a36d719c9a04c37e0dfa5e306187e7c",
};
const EXPECTED_ISSUE_AUTHORIZATION = {
  ownerAccepted: true,
  peerApproved: false,
  linearCreationAuthorized: false,
  productImplementationAuthorized: false,
};
const EXPECTED_DEPENDENCIES = {
  "RSP-01": [],
  "RSP-02": ["RSP-01"],
  "RSP-03": ["RSP-01", "RSP-02"],
  "RSP-04": ["RSP-01"],
  "RSP-05": ["RSP-01"],
  "RSP-06": ["RSP-04", "RSP-05"],
  "RSP-07": ["RSP-01", "RSP-04", "RSP-06"],
  "RSP-08": ["RSP-03", "RSP-06", "RSP-07"],
  "RSP-09": ["RSP-06", "RSP-07", "RSP-08"],
  "RSP-10": ["RSP-03", "RSP-04", "RSP-05", "RSP-06", "RSP-07", "RSP-09"],
  "RSP-11": ["RSP-01", "RSP-08"],
  "RSP-12": ["RSP-02", "RSP-03", "RSP-06", "RSP-07", "RSP-11"],
  "RSP-13": ["RSP-03", "RSP-08", "RSP-11"],
  "RSP-14": EXPECTED_ISSUE_IDS.slice(1, 13),
  "RSP-15": EXPECTED_ISSUE_IDS.slice(1, 14),
};

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function paragraphLines(value) {
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function capture(block, pattern, label) {
  const match = block.match(pattern);
  invariant(match, `Peer response is missing ${label}`);
  return match[1].trim();
}

export function extractExactPeerIssues(peerText) {
  invariant(
    peerText.split(/\r?\n/, 1)[0] === REQUIRED_PEER_MARKER,
    `Peer response must begin with ${REQUIRED_PEER_MARKER}`,
  );
  return EXPECTED_ISSUE_IDS.map((localId, index) => {
    const heading = `${localId} — `;
    const start = peerText.indexOf(heading);
    invariant(start >= 0, `Peer response is missing ${localId}`);
    const nextHeading = EXPECTED_ISSUE_IDS[index + 1]
      ? `${EXPECTED_ISSUE_IDS[index + 1]} — `
      : "DAG summary";
    const end = peerText.indexOf(nextHeading, start + heading.length);
    invariant(end > start, `Peer response is missing boundary after ${localId}`);
    const block = peerText.slice(start, end).trim();
    const title = block.slice(heading.length, block.indexOf("\n")).trim();
    const objective = capture(block, /^Objective: (.+?)\n\nIn scope:/ms, `${localId} objective`);
    const inScope = paragraphLines(
      capture(block, /In scope:\n\n(.+?)\n\nExplicit non-goals:/ms, `${localId} scope`),
    );
    const nonGoals = capture(
      block,
      /Explicit non-goals: (.+?)\n\nDependencies:/ms,
      `${localId} non-goals`,
    );
    const dependenciesStatement = capture(
      block,
      /Dependencies: (.+?)\n\nAcceptance tests\/probes:/ms,
      `${localId} dependencies`,
    );
    const acceptanceProbes = paragraphLines(
      capture(
        block,
        /Acceptance tests\/probes:\n\n(.+?)\n\nObservability evidence:/ms,
        `${localId} acceptance probes`,
      ),
    );
    const observabilityEvidence = capture(
      block,
      /Observability evidence: (.+?)\n\nRollback boundary:/ms,
      `${localId} observability evidence`,
    );
    const rollbackBoundary = capture(
      block,
      /Rollback boundary: (.+?)\n\nDependency-unblocked:/ms,
      `${localId} rollback boundary`,
    );
    const dependencyUnblockedStatement = capture(
      block,
      /Dependency-unblocked: (.+)$/ms,
      `${localId} dependency-unblocked status`,
    );
    return {
      localId,
      title,
      objective,
      inScope,
      scopeAndSymbols: inScope,
      nonGoals,
      dependenciesStatement,
      dependencies: EXPECTED_DEPENDENCIES[localId],
      acceptanceProbes,
      observabilityEvidence,
      rollbackBoundary,
      dependencyUnblockedStatement,
    };
  });
}

function visitDependencies(issuesById, id, visiting, visited) {
  if (visited.has(id)) return;
  invariant(!visiting.has(id), `dependency cycle at ${id}`);
  visiting.add(id);
  for (const dependency of issuesById.get(id).dependencies) {
    invariant(issuesById.has(dependency), `${id}: unknown dependency ${dependency}`);
    visitDependencies(issuesById, dependency, visiting, visited);
  }
  visiting.delete(id);
  visited.add(id);
}

export function validateResponsiveBatch(packet, architecture, peerText) {
  validateArchitectureContract(architecture, peerText);
  const exactIssues = extractExactPeerIssues(peerText);
  invariant(
    packet.schemaVersion === "tts-research.responsive-linear-batch.v1",
    "unexpected responsive batch schemaVersion",
  );
  invariant(
    packet.status === "owner_accepted_peer_pending_not_authorized",
    "replacement packet status must remain owner-accepted, Peer-pending, and unauthorized",
  );
  invariant(
    packet.architectureContractPath === DEFAULT_CONTRACT_JSON_PATH,
    "replacement packet must bind the canonical responsive architecture contract",
  );
  invariant(
    same(packet.source, architecture.source),
    "replacement packet source provenance must exactly mirror the architecture contract",
  );
  invariant(
    same(packet.ownerDecision, architecture.ownerDecision),
    "replacement packet owner decision must exactly mirror the architecture contract",
  );
  invariant(packet.projectId === EXPECTED_PROJECT_ID, "replacement packet projectId drift");
  invariant(packet.teamId === EXPECTED_TEAM_ID, "replacement packet teamId drift");
  invariant(
    same(packet.replacementFor, [
      "docs/project-management/linear/tts-research-best-in-class-batch-draft.json",
      "docs/project-management/linear/tts-research-best-in-class-batch-draft.md",
    ]),
    "replacement provenance paths drift",
  );
  invariant(
    packet.provenancePolicy ===
      "The BIC packet remains frozen provenance and is not rewritten or deleted.",
    "old BIC packet must remain frozen provenance",
  );
  invariant(
    same(packet.frozenProvenanceSha256, EXPECTED_FROZEN_PROVENANCE_SHA256),
    "old BIC provenance SHA-256 map drift",
  );
  invariant(packet.issueCount === 15, "replacement packet issueCount must be exactly 15");
  invariant(packet.issues?.length === 15, "replacement packet must contain exactly 15 issues");
  invariant(
    same(
      packet.issues.map(({ localId }) => localId),
      EXPECTED_ISSUE_IDS,
    ),
    "replacement issue IDs must be ordered exactly RSP-01 through RSP-15",
  );
  invariant(packet.issueIdRange === "RSP-01..RSP-15", "replacement issue range drift");
  invariant(
    same(packet.dag, EXPECTED_DEPENDENCIES),
    "replacement DAG must exactly match the Peer graph",
  );

  invariant(
    same(packet.authorization, architecture.authorization),
    "batch authorization must exactly mirror the architecture contract",
  );
  invariant(
    same(packet.authorization, {
      ownerAccepted: true,
      peerApproved: false,
      linearCreationAuthorized: false,
      productImplementationAuthorized: false,
      graphUnblockedIssues: ["RSP-01"],
      authorizedIssues: [],
    }),
    "ownerAccepted must be true while peerApproved, linearCreationAuthorized, and productImplementationAuthorized remain false",
  );
  const creation = packet.creationPlan;
  invariant(same(creation?.graphUnblockedIssues, ["RSP-01"]), "only RSP-01 may be graph-unblocked");
  invariant(
    same(creation?.eligibleForLinearCreation, []),
    "no issue is eligible for Linear creation",
  );
  invariant(
    same(creation?.eligibleForProductImplementation, []),
    "no issue is eligible for product implementation",
  );
  invariant(creation?.newIssuesCreatedNow === 0, "newIssuesCreatedNow must be zero");
  invariant(creation?.linearMutationPerformed === false, "Linear mutation must remain false");
  invariant(creation?.productMutationPerformed === false, "product mutation must remain false");

  const exactById = new Map(exactIssues.map((issue) => [issue.localId, issue]));
  const architectureBudgetIds = architecture.performanceContract.budgets.map(({ id }) => id);
  const issuesById = new Map(packet.issues.map((issue) => [issue.localId, issue]));
  for (const issue of packet.issues) {
    const exact = exactById.get(issue.localId);
    for (const field of [
      "title",
      "objective",
      "inScope",
      "scopeAndSymbols",
      "nonGoals",
      "dependenciesStatement",
      "dependencies",
      "acceptanceProbes",
      "observabilityEvidence",
      "rollbackBoundary",
      "dependencyUnblockedStatement",
    ]) {
      invariant(
        same(issue[field], exact[field]),
        `${issue.localId}: ${field} must exactly match the Peer response`,
      );
    }
    invariant(
      issue.architectureContractPath === DEFAULT_CONTRACT_JSON_PATH,
      `${issue.localId}: architecture contract path drift`,
    );
    invariant(
      Array.isArray(issue.performanceBudgetIds),
      `${issue.localId}: performanceBudgetIds must be an array`,
    );
    invariant(
      issue.performanceBudgetIds.every((id) => architectureBudgetIds.includes(id)),
      `${issue.localId}: unknown performance budget ID`,
    );
    invariant(
      typeof issue.observabilityEvidence === "string" && issue.observabilityEvidence.length > 0,
      `${issue.localId}: observability evidence is required`,
    );
    invariant(
      typeof issue.rollbackBoundary === "string" && issue.rollbackBoundary.length > 0,
      `${issue.localId}: rollback boundary is required`,
    );
    invariant(
      same(
        Object.fromEntries(
          Object.keys(EXPECTED_ISSUE_AUTHORIZATION).map((key) => [key, issue[key]]),
        ),
        EXPECTED_ISSUE_AUTHORIZATION,
      ),
      `${issue.localId}: all issue authorization gates must remain false`,
    );
    invariant(issue.linear === null, `${issue.localId}: Linear binding must remain null`);
    const expectedUnblocked = issue.localId === "RSP-01";
    invariant(
      issue.dependencyUnblocked === expectedUnblocked,
      `${issue.localId}: dependency-unblocked boolean drift`,
    );
    invariant(
      issue.status ===
        (expectedUnblocked
          ? "graph_unblocked_not_authorized"
          : "dependency_blocked_not_authorized"),
      `${issue.localId}: issue status drift`,
    );
  }

  invariant(
    same(issuesById.get("RSP-14").performanceBudgetIds, architectureBudgetIds),
    "RSP-14 must carry every responsive performance budget",
  );
  invariant(
    same(issuesById.get("RSP-15").performanceBudgetIds, architectureBudgetIds),
    "RSP-15 must retain every responsive performance budget through closeout",
  );
  invariant(
    issuesById
      .get("RSP-01")
      .acceptanceProbes.some((value) => value.includes("missing p50/p95/raw-artifact evidence")),
    "RSP-01 must fail closed on missing p50/p95/raw-artifact evidence",
  );
  invariant(
    issuesById
      .get("RSP-14")
      .acceptanceProbes.some((value) =>
        value.includes("No missing-result path is interpreted as a pass."),
      ),
    "RSP-14 must fail closed on missing results",
  );

  const visiting = new Set();
  const visited = new Set();
  for (const id of EXPECTED_ISSUE_IDS) visitDependencies(issuesById, id, visiting, visited);
  for (const issue of packet.issues) {
    const issueNumber = Number(issue.localId.slice(4));
    invariant(
      issue.dependencies.every((dependency) => Number(dependency.slice(4)) < issueNumber),
      `${issue.localId}: dependency must precede the issue`,
    );
  }
}

function bulletList(values) {
  return values.length === 0 ? ["- none"] : values.map((value) => `- ${value}`);
}

function inlineIds(values) {
  return values.length === 0 ? "none" : values.map((value) => `\`${value}\``).join(", ");
}

function renderIssue(issue) {
  return [
    `## ${issue.localId} — ${issue.title}`,
    "",
    `Status: \`${issue.status}\``,
    "",
    `Objective: ${issue.objective}`,
    "",
    `Dependencies: ${inlineIds(issue.dependencies)}`,
    "",
    `Peer dependency statement: ${issue.dependenciesStatement}`,
    "",
    `Dependency-unblocked: \`${issue.dependencyUnblocked}\` — ${issue.dependencyUnblockedStatement}`,
    "",
    `Owner accepted: \`${issue.ownerAccepted}\`; peer approved: \`${issue.peerApproved}\`; Linear creation authorized: \`${issue.linearCreationAuthorized}\`; product implementation authorized: \`${issue.productImplementationAuthorized}\`.`,
    "",
    "### In scope / symbols",
    "",
    ...bulletList(issue.inScope),
    "",
    "### Explicit non-goals",
    "",
    `- ${issue.nonGoals}`,
    "",
    "### Acceptance tests/probes",
    "",
    ...bulletList(issue.acceptanceProbes),
    "",
    "### Performance budget IDs",
    "",
    ...bulletList(issue.performanceBudgetIds.map((id) => `\`${id}\``)),
    "",
    "### Observability evidence",
    "",
    `- ${issue.observabilityEvidence}`,
    "",
    "### Rollback boundary",
    "",
    `- ${issue.rollbackBoundary}`,
    "",
    `Architecture contract: \`${issue.architectureContractPath}\``,
    "",
  ];
}

export function renderResponsiveBatchMarkdown(packet) {
  const authorization = packet.authorization;
  const lines = [
    "<!-- Generated by scripts/validate-responsive-linear-batch.mjs; edit the canonical JSON, not this file. -->",
    "",
    "# TTS-Research responsive architecture replacement issue packet",
    "",
    `Status: \`${packet.status}\``,
    "",
    `Issue graph: **${packet.issueCount} issues, ${packet.issueIdRange}**`,
    "",
    `Peer marker: \`${packet.source.requiredFirstLineMarker}\``,
    "",
    `Architecture contract: \`${packet.architectureContractPath}\``,
    "",
    "## No-authorization / no-mutation gate",
    "",
    `- \`ownerAccepted\`: \`${authorization.ownerAccepted}\``,
    `- \`peerApproved\`: \`${authorization.peerApproved}\``,
    `- \`linearCreationAuthorized\`: \`${authorization.linearCreationAuthorized}\``,
    `- \`productImplementationAuthorized\`: \`${authorization.productImplementationAuthorized}\``,
    `- Graph-unblocked issues: ${inlineIds(authorization.graphUnblockedIssues)}`,
    `- Authorized issues: ${inlineIds(authorization.authorizedIssues)}`,
    `- New Linear issues created now: \`${packet.creationPlan.newIssuesCreatedNow}\``,
    `- Linear mutation performed: \`${packet.creationPlan.linearMutationPerformed}\``,
    `- Product mutation performed: \`${packet.creationPlan.productMutationPerformed}\``,
    "",
    packet.creationPlan.note,
    "",
    "## Provenance and replacement rule",
    "",
    `- ${packet.provenancePolicy}`,
    ...packet.replacementFor.map((value) => `- Superseded active packet retained at \`${value}\`.`),
    ...Object.entries(packet.frozenProvenanceSha256).map(
      ([value, sha256]) => `- Frozen SHA-256 \`${sha256}\` for \`${value}\`.`,
    ),
    "",
    "## Exact DAG",
    "",
    ...packet.issues.map(
      (issue) => `- **${issue.localId}** depends on ${inlineIds(issue.dependencies)}.`,
    ),
    "",
    "## Ordered replacement issues",
    "",
    ...packet.issues.flatMap(renderIssue),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function loadResponsiveBatchInputs(root = process.cwd()) {
  const frozenPaths = Object.keys(EXPECTED_FROZEN_PROVENANCE_SHA256);
  const [packet, architecture, peerText, ...frozenBytes] = await Promise.all([
    readFile(path.join(root, DEFAULT_BATCH_JSON_PATH), "utf8").then(JSON.parse),
    readFile(path.join(root, DEFAULT_CONTRACT_JSON_PATH), "utf8").then(JSON.parse),
    readFile(path.join(root, DEFAULT_PEER_RESPONSE_PATH), "utf8"),
    ...frozenPaths.map((value) => readFile(path.join(root, value))),
  ]);
  return {
    packet,
    architecture,
    peerText,
    frozenProvenanceBytes: Object.fromEntries(
      frozenPaths.map((value, index) => [value, frozenBytes[index]]),
    ),
  };
}

export async function runResponsiveBatchValidation({ root = process.cwd(), write = false } = {}) {
  const { packet, architecture, peerText, frozenProvenanceBytes } =
    await loadResponsiveBatchInputs(root);
  validateResponsiveBatch(packet, architecture, peerText);
  for (const [value, bytes] of Object.entries(frozenProvenanceBytes)) {
    const actual = createHash("sha256").update(bytes).digest("hex");
    invariant(
      actual === EXPECTED_FROZEN_PROVENANCE_SHA256[value],
      `${value}: frozen provenance bytes changed`,
    );
  }
  const rendered = renderResponsiveBatchMarkdown(packet);
  const markdownPath = path.join(root, DEFAULT_BATCH_MARKDOWN_PATH);
  if (write) {
    await writeFile(markdownPath, rendered);
    return { mode: "write", issueCount: packet.issues.length };
  }
  const current = await readFile(markdownPath, "utf8");
  invariant(
    current === rendered,
    `${DEFAULT_BATCH_MARKDOWN_PATH} is not in parity; run node scripts/validate-responsive-linear-batch.mjs --write`,
  );
  return { mode: "check", issueCount: packet.issues.length };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runResponsiveBatchValidation({ write: process.argv.includes("--write") })
    .then(({ mode, issueCount }) => {
      console.log(
        `responsive Linear replacement ${mode} passed: ${issueCount} exact RSP issues; DAG, Peer parity, evidence, rollback, budgets, no-authorization, and Markdown parity valid`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
