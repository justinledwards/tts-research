#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_JSON_PATH =
  "docs/project-management/linear/tts-research-best-in-class-batch-draft.json";
export const DEFAULT_MARKDOWN_PATH =
  "docs/project-management/linear/tts-research-best-in-class-batch-draft.md";
const BENCH_THRESHOLDS_PATH = "benches/thresholds.json";
const FLOW_MANIFEST_PATH = "docs/flows/manifest.json";
const FLOW_COVERAGE_PATH = "docs/flows/coverage-report.json";
const PROJECT_SETUP_PATH =
  "docs/project-management/linear/tts-research-project-setup.manifest.json";
export const PROVENANCE_MANIFEST_PATH =
  "docs/project-management/linear/tts-research-linear-provenance.manifest.json";
const CANDIDATE_STATUS = "candidate_pending_chatgpt_v8_recheck";
const CANDIDATE_DISPOSITION = "create_after_chatgpt_agreement";
const REQUIRED_PEER_MARKER = "AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH";
const EXPECTED_PROJECT_ID = "010252d0-b34c-473d-82f2-05bc4d7bc685";
const EXPECTED_TEAM_ID = "cdc92ef0-dc69-47b5-8896-312dbc1e2d93";
const REQUIRED_AUTHORIZATION_GATES = {
  freshCapacityCheckPassed: false,
  repositoryValidationPassed: false,
  trackedReviewArchiveAttached: false,
  approvalMarkerReceived: false,
  immediatePreMutationCapacityRecheckPassed: false,
};
const REQUIRED_CREATION_GATES = [
  "Fresh project-scoped Linear API capacity snapshot shows zero active unarchived issues, no next page, and twenty available slots.",
  "`pnpm validate:flows`, canonical Linear packet parity, relevant tests, formatting, lint, typecheck, `git diff --check`, and full `pnpm check` pass on current bytes.",
  "A tracked-source-only archive containing exact artifacts is attached to the correct TTS-Research ChatGPT project conversation.",
  "ChatGPT returns the exact agreement marker as the first line of its final assistant message.",
  "The PO rechecks capacity immediately before mutation and creates only the strict eligible prefix.",
];
const BIC_02_ROOT_GO_COMMAND = "mise exec -- go -C backend test ./... -timeout=180s";
const BIC_20_GIT_COMMANDS = [
  "git diff --check",
  'test -z "$(git status --porcelain=v1 --untracked-files=all)"',
  "git fetch --prune",
  "git rev-parse --verify '@{upstream}' >/dev/null",
  'test "$(git rev-parse HEAD)" = "$(git rev-parse \'@{upstream}\')"',
];
const BIC_20_GIT_NEGATIVE_FIXTURES = [
  "dirty tracked file",
  "untracked file",
  "no upstream",
  "ahead",
  "behind",
];
const RELATIONSHIPS = new Set([
  "extends",
  "documents-existing",
  "supersedes",
  "depends-on",
  "no-overlap",
]);
const REQUIRED_ISSUE_ARRAYS = [
  "acceptanceCriteria",
  "inScope",
  "outOfScope",
  "flowIds",
  "families",
  "routePatterns",
  "stateSymbols",
  "existingIssueLinks",
  "verificationCommands",
  "artifactPaths",
  "thresholds",
  "negativeTests",
  "rollbackExpectations",
  "requiredPOChecks",
  "dependencies",
];
const FRONTEND_POST_CHANGE_IDS = Array.from(
  { length: 7 },
  (_, index) => `BIC-${String(index + 11).padStart(2, "0")}`,
);
const FRONTEND_POST_CHANGE_COMMANDS = [
  "mise exec -- pnpm bench:frontend-performance",
  "mise exec -- pnpm validate:local:frontend-performance",
];
const FRONTEND_POST_CHANGE_THRESHOLDS = [
  "benches.measurementProtocol.minMeasuredRuns",
  "benches.frontendBundle.maxInitialJsRawBytes",
  "benches.frontendBundle.maxInitialJsGzipBytes",
  "benches.frontendBundle.maxInitialCssGzipBytes",
  "benches.interactionAcknowledgement.maxVisibleActionAcknowledgementP95Ms",
  "benches.readAlongRuntime.maxLongTaskCount",
  "benches.lowResource.browserCpuThrottleRate",
  "benches.uxEvidence.viewportWidthsPx",
];
const FINAL_PERFORMANCE_COMMANDS = [
  "mise exec -- pnpm bench:startup",
  "mise exec -- pnpm bench:runtime-resources",
  ...FRONTEND_POST_CHANGE_COMMANDS,
];

function atPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNonnegativeSafeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative safe integer`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stateTypeCounts(issues) {
  return Object.fromEntries(
    [...issues]
      .map((issue) => issue.state?.type)
      .sort()
      .reduce((counts, stateType) => {
        assert(
          typeof stateType === "string" && stateType.length > 0,
          "source issue state type missing",
        );
        counts.set(stateType, (counts.get(stateType) ?? 0) + 1);
        return counts;
      }, new Map()),
  );
}

function repoArtifactPath(root, artifactPath, label) {
  assert(typeof artifactPath === "string" && artifactPath.length > 0, `${label} must be a path`);
  assert(!path.isAbsolute(artifactPath), `${label} must be repository-relative`);
  const normalized = path.normalize(artifactPath);
  assert(
    normalized !== ".." && !normalized.startsWith(`..${path.sep}`),
    `${label} must stay inside the repository`,
  );
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, normalized);
  assert(
    resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`),
    `${label} must stay inside the repository`,
  );
  return resolved;
}

function list(values) {
  return values.length === 0 ? ["- none"] : values.map((value) => `- ${value}`);
}

function inline(values) {
  return values.length === 0 ? "none" : values.map((value) => `\`${value}\``).join(", ");
}

function resolveThresholdValue(key, packet, benches) {
  if (key.startsWith("benches.")) return atPath(benches, key.slice("benches.".length));
  if (key.startsWith("packet.measurementContracts."))
    return atPath(packet, key.slice("packet.".length));
  return atPath(packet.thresholdCatalog, key.replace(/^packet\./, ""));
}

function renderThreshold(key, packet, benches) {
  const value = resolveThresholdValue(key, packet, benches);
  assert(value !== undefined && value !== null, `unresolved threshold ${key}`);
  return `- \`${key}\`: \`${JSON.stringify(value)}\``;
}

function renderLinks(links) {
  return links.flatMap((link) => [
    `- \`${link.identifier}\` — \`${link.relationship}\`: ${link.rationale}`,
  ]);
}

function renderLinearMutationStatement(packet) {
  const capacity = packet.capacitySnapshot;
  const boundIssueCount = packet.issues.filter((issue) => issue.linear !== null).length;
  const activeDelta = capacity.activeUnarchivedAfter - capacity.activeUnarchivedBefore;
  if (boundIssueCount === 0 && capacity.newIssuesCreatedNow === 0 && activeDelta === 0) {
    return "No Linear item was created or mutated by this packet update. BIC-00 is not an active issue; project/milestone closeout owns parent tracking.";
  }
  return `Linear mutation state from this packet: ${capacity.newIssuesCreatedNow} new issue(s), active-unarchived delta ${activeDelta}, ${boundIssueCount} issue binding(s). BIC-00 is not an active issue; project/milestone closeout owns parent tracking.`;
}

function renderIssue(issue, packet, benches) {
  return [
    `## ${issue.localId} — ${issue.title}`,
    "",
    `- Kind: \`${issue.kind}\``,
    `- Status: \`${issue.status}\``,
    `- Creation disposition: \`${issue.creationDisposition}\``,
    `- Primary owner surface: \`${issue.primaryOwnerSurface}\``,
    `- Depends on: ${inline(issue.dependencies)}`,
    `- Families: ${inline(issue.families)}`,
    `- Flow IDs: ${inline(issue.flowIds)}`,
    `- Completed-first-batch behavior: ${issue.completedFirstBatchBehavior}`,
    "",
    "### Acceptance criteria",
    "",
    ...list(issue.acceptanceCriteria),
    "",
    "### In scope",
    "",
    ...list(issue.inScope),
    "",
    "### Out of scope",
    "",
    ...list(issue.outOfScope),
    "",
    "### Route patterns",
    "",
    ...list(issue.routePatterns.map((value) => `\`${value}\``)),
    "",
    "### State symbols",
    "",
    ...list(issue.stateSymbols.map((value) => `\`${value}\``)),
    "",
    "### Existing issue reconciliation",
    "",
    ...renderLinks(issue.existingIssueLinks),
    "",
    "### Verification commands",
    "",
    ...list(issue.verificationCommands.map((value) => `\`${value}\``)),
    "",
    "### Artifact paths",
    "",
    ...list(issue.artifactPaths.map((value) => `\`${value}\``)),
    "",
    "### Thresholds",
    "",
    ...issue.thresholds.map((key) => renderThreshold(key, packet, benches)),
    "",
    "### Negative tests",
    "",
    ...list(issue.negativeTests),
    "",
    "### Rollback expectations",
    "",
    ...list(issue.rollbackExpectations),
    "",
    "### Required PO checks",
    "",
    ...list(issue.requiredPOChecks),
    "",
  ];
}

export function renderMarkdown(packet, benches) {
  const capacity = packet.capacitySnapshot;
  const eligible = packet.creationPlan.eligiblePrefix;
  const lines = [
    "<!-- Generated by scripts/validate-linear-batch.mjs; edit the canonical JSON, not this file. -->",
    "",
    "# TTS-Research best-in-class implementation/evidence batch — canonical draft",
    "",
    `Status: \`${packet.status}\``,
    "",
    `Proposed implementation/evidence issues: **${packet.proposedCount} / ${packet.activeCap} cap**`,
    "",
    `Required advisory peer marker: \`${packet.requiredPeerMarker}\``,
    "",
    renderLinearMutationStatement(packet),
    "",
    "## Progressive product spine",
    "",
    packet.progressiveProductSpine,
    "",
    "## Creation gates",
    "",
    ...packet.creationGates.map((value) => `- ${value}`),
    "",
    `Required creation-plan approval marker: \`${packet.creationPlan.requiresApprovalMarker}\``,
    "",
    "### Machine-readable authorization state",
    "",
    ...Object.entries(packet.creationPlan.authorizationGates).map(
      ([gate, value]) => `- \`${gate}\`: \`${value}\``,
    ),
    "",
    "Every authorization gate is false; this candidate does not authorize a Linear mutation.",
    "",
    "## Capacity snapshot",
    "",
    `- Observed at: \`${capacity.observedAt}\``,
    `- Verification mode: \`${capacity.verificationMode}\``,
    `- Active unarchived before: \`${capacity.activeUnarchivedBefore}\``,
    `- New issues created now: \`${capacity.newIssuesCreatedNow}\``,
    `- Active unarchived after: \`${capacity.activeUnarchivedAfter}\``,
    `- Cap: \`${capacity.cap}\``,
    `- Compliant: \`${capacity.compliant}\``,
    `- Has next page: \`${capacity.hasNextPage}\``,
    `- Repo artifact: \`${capacity.repoArtifact}\``,
    `- Fresh parent API verification before creation: \`${capacity.requiresParentFreshApiVerificationBeforeCreation}\``,
    "",
    `Eligible prefix at this snapshot: ${inline(eligible)}. All remain repo-local staged drafts until every creation gate passes.`,
    "",
    "## Completed-first-batch preservation contract",
    "",
    ...packet.completedFirstBatchPolicy.rules.map((value) => `- ${value}`),
    "",
    `Completed/archive evidence: ${inline(packet.completedFirstBatchPolicy.archiveArtifacts)}`,
    "",
    "## Existing issue reconciliation",
    "",
    ...packet.existingIssueReconciliation.mappings.flatMap((mapping) => [
      `- **${mapping.localId}**: ${mapping.links
        .map((link) => `\`${link.identifier}\` (\`${link.relationship}\`)`)
        .join(", ")}`,
    ]),
    "",
    "## Ordered issues",
    "",
    ...packet.issues.flatMap((issue) => renderIssue(issue, packet, benches)),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

function reachableDependencies(issuesById, localId, seen = new Set()) {
  for (const dependency of issuesById.get(localId).dependencies) {
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    reachableDependencies(issuesById, dependency, seen);
  }
  return seen;
}

export function validatePacket(
  packet,
  benches,
  flowManifest = null,
  flowCoverage = null,
  sourceEvidence = null,
) {
  assert(sourceEvidence, "canonical Linear provenance evidence is required");
  assert(packet.schemaVersion === "tts-research.linear-batch.v1", "unexpected schemaVersion");
  assert(packet.status === CANDIDATE_STATUS, `status must be exactly ${CANDIDATE_STATUS}`);
  assert(packet.activeCap === 20, "activeCap must be 20");
  assert(packet.proposedCount === 20, "proposedCount must be 20");
  assert(packet.issues.length === 20, "packet must contain exactly 20 issues");
  assert(!packet.issues.some((issue) => issue.localId === "BIC-00"), "BIC-00 must not be active");
  const expectedProjectId = sourceEvidence.projectSetup?.project?.id;
  const expectedTeamId = sourceEvidence.projectSetup?.team?.id;
  assert(
    expectedProjectId === EXPECTED_PROJECT_ID && packet.projectId === expectedProjectId,
    "projectId must exactly match the project setup manifest",
  );
  assert(
    expectedTeamId === EXPECTED_TEAM_ID && packet.teamId === expectedTeamId,
    "teamId must exactly match the project setup manifest",
  );
  assert(
    packet.requiredPeerMarker === REQUIRED_PEER_MARKER,
    `requiredPeerMarker must be exactly ${REQUIRED_PEER_MARKER}`,
  );
  assert(
    JSON.stringify(packet.creationGates) === JSON.stringify(REQUIRED_CREATION_GATES),
    "creationGates must exactly match the canonical candidate gates",
  );
  assert(
    packet.creationPlan?.requiresApprovalMarker === REQUIRED_PEER_MARKER,
    `creationPlan.requiresApprovalMarker must be exactly ${REQUIRED_PEER_MARKER}`,
  );
  assert(
    JSON.stringify(packet.creationPlan.authorizationGates) ===
      JSON.stringify(REQUIRED_AUTHORIZATION_GATES),
    "creationPlan.authorizationGates must contain the exact canonical gates, all false",
  );
  assert(
    Object.values(packet.creationPlan.authorizationGates).every((value) => value === false),
    "every creation authorization gate must be exactly false",
  );
  for (const issue of packet.issues) {
    assert(
      issue.status === CANDIDATE_STATUS,
      `${issue.localId}: status must be exactly ${CANDIDATE_STATUS}`,
    );
    assert(
      issue.creationDisposition === CANDIDATE_DISPOSITION,
      `${issue.localId}: creationDisposition must be exactly ${CANDIDATE_DISPOSITION}`,
    );
    assert(
      issue.linear === null,
      `${issue.localId}: candidate Linear binding must be exactly null`,
    );
  }
  const measurement = packet.measurementContracts;
  assert(
    measurement && typeof measurement === "object",
    "measurementContracts must be first-class",
  );
  const expectedMachineClasses = [
    {
      id: "runtime-reference-cpu",
      osClass: "linux-or-wsl2-x86_64",
      minLogicalCpu: 4,
      minMemoryMiB: 8192,
      gpuAllowed: false,
      browser: null,
    },
    {
      id: "frontend-reference-chromium",
      osClass: "linux-or-wsl2-x86_64",
      minLogicalCpu: 4,
      minMemoryMiB: 8192,
      gpuAllowed: false,
      browser: "chromium",
      cpuThrottleRate: 1,
    },
    {
      id: "frontend-low-resource-chromium",
      osClass: "linux-or-wsl2-x86_64",
      minLogicalCpu: 2,
      minMemoryMiB: 4096,
      gpuAllowed: false,
      browser: "chromium",
      cpuThrottleRate: 4,
    },
  ];
  assert(
    JSON.stringify(measurement.machineClasses) === JSON.stringify(expectedMachineClasses),
    "measurementContracts must define the exact canonical machine classes",
  );
  const expectedContracts = {
    runtimeStartup: {
      machineClassIds: ["runtime-reference-cpu"],
      cacheBuildStates: ["cold-post-edit-clean-build", "warm-cache-no-rebuild"],
      requiredBindings: [
        "exactSourceHash",
        "machineClassId",
        "command",
        "environment",
        "cacheBuildState",
        "startedAt",
        "finishedAt",
      ],
    },
    frontend: {
      machineClassIds: ["frontend-reference-chromium", "frontend-low-resource-chromium"],
      cacheBuildStates: ["cold-production-build", "warm-static-assets"],
      requiredBindings: [
        "exactSourceHash",
        "machineClassId",
        "command",
        "environment",
        "cacheBuildState",
        "browserVersion",
        "viewport",
        "startedAt",
        "finishedAt",
      ],
    },
  };
  for (const [name, contract] of Object.entries({
    runtimeStartup: measurement.runtimeStartup,
    frontend: measurement.frontend,
  })) {
    const expected = expectedContracts[name];
    assert(contract.discardedWarmupRuns === 1, `${name}: exactly one discarded warmup required`);
    assert(contract.measuredRuns >= 10, `${name}: at least ten measured runs required`);
    assert(
      JSON.stringify(contract.statistics) ===
        JSON.stringify(["p50", "p95", "max", "coefficientOfVariation"]),
      `${name}: exact p50/p95/max/CV statistics required`,
    );
    assert(
      contract.maxCoefficientOfVariation > 0 && contract.maxCoefficientOfVariation <= 0.25,
      `${name}: coefficient-of-variation limit must be <= 0.25`,
    );
    assert(contract.maxFailures === 0, `${name}: measured failures must be zero`);
    assert(
      JSON.stringify(contract.machineClassIds) === JSON.stringify(expected.machineClassIds),
      `${name}: exact machine class bindings required`,
    );
    assert(
      JSON.stringify(contract.cacheBuildStates) === JSON.stringify(expected.cacheBuildStates),
      `${name}: exact nonempty cache/build states required`,
    );
    assert(
      JSON.stringify(contract.requiredBindings) === JSON.stringify(expected.requiredBindings),
      `${name}: exact artifact bindings required`,
    );
    assert(
      JSON.stringify(contract.requiredArtifacts) ===
        JSON.stringify(["rawSamples", "summary", "runManifest"]),
      `${name}: exact raw/summary/run-manifest artifacts required`,
    );
  }
  assert(
    measurement.freshness.postChangeIssueBytesRequired === true &&
      measurement.freshness.finalBatchBytesRequired === true &&
      measurement.freshness.staleArtifactReuseAllowed === false,
    "measurement freshness must require post-change/final bytes and prohibit stale reuse",
  );

  const expectedIds = Array.from(
    { length: 20 },
    (_, index) => `BIC-${String(index + 1).padStart(2, "0")}`,
  );
  assert(
    JSON.stringify(packet.issues.map((issue) => issue.localId)) === JSON.stringify(expectedIds),
    "issues must be ordered BIC-01 through BIC-20",
  );

  const issuesById = new Map(packet.issues.map((issue) => [issue.localId, issue]));
  for (const issue of packet.issues) {
    assert(issue.title && issue.kind && issue.status, `${issue.localId}: missing identity fields`);
    assert(issue.primaryOwnerSurface, `${issue.localId}: missing primaryOwnerSurface`);
    assert(issue.completedFirstBatchBehavior, `${issue.localId}: missing preservation contract`);
    for (const field of REQUIRED_ISSUE_ARRAYS) {
      assert(Array.isArray(issue[field]), `${issue.localId}: ${field} must be an array`);
      const ownershipField = ["flowIds", "routePatterns", "stateSymbols"].includes(field);
      if (field !== "dependencies" && !ownershipField) {
        assert(issue[field].length > 0, `${issue.localId}: ${field} must not be empty`);
      }
    }
    assert(
      new Set(issue.acceptanceCriteria).size === issue.acceptanceCriteria.length,
      `${issue.localId}: duplicate acceptance criterion`,
    );
    for (const dependency of issue.dependencies) {
      assert(issuesById.has(dependency), `${issue.localId}: unknown dependency ${dependency}`);
      assert(dependency !== issue.localId, `${issue.localId}: self dependency`);
    }
    for (const link of issue.existingIssueLinks) {
      assert(link.identifier && link.rationale, `${issue.localId}: incomplete existing issue link`);
      assert(RELATIONSHIPS.has(link.relationship), `${issue.localId}: invalid relationship`);
    }
    for (const key of issue.thresholds) {
      const value = resolveThresholdValue(key, packet, benches);
      assert(
        value !== undefined && value !== null,
        `${issue.localId}: unresolved threshold ${key}`,
      );
    }
  }

  const measurementIssueContracts = [
    ["runtimeStartup", ["BIC-01", "BIC-18", "BIC-20"]],
    [
      "frontend",
      [
        ...Array.from({ length: 7 }, (_, index) => `BIC-${String(index + 11).padStart(2, "0")}`),
        "BIC-19",
        "BIC-20",
      ],
    ],
  ];
  const measurementArtifacts = {
    runtimeStartup: {
      "BIC-01": [
        "output/bic/bic-01/startup-runtime.raw.json",
        "output/bic/bic-01/startup-runtime.summary.json",
        "output/bic/bic-01/startup-runtime.run-manifest.json",
      ],
      "BIC-18": [
        "output/bic/bic-18/runtime-performance.raw.json",
        "output/bic/bic-18/runtime-performance.summary.json",
        "output/bic/bic-18/runtime-performance.run-manifest.json",
      ],
      "BIC-20": [
        "output/bic/bic-20/runtime-performance-final.raw.json",
        "output/bic/bic-20/runtime-performance-final.json",
        "output/bic/bic-20/runtime-performance-final.run-manifest.json",
      ],
    },
    frontend: {
      ...Object.fromEntries(
        Array.from({ length: 7 }, (_, index) => {
          const localId = `BIC-${String(index + 11).padStart(2, "0")}`;
          const directory = `output/bic/${localId.toLowerCase()}`;
          return [
            localId,
            [
              `${directory}/frontend-performance-post-change.raw.json`,
              `${directory}/frontend-performance-post-change.json`,
              `${directory}/frontend-performance.run-manifest.json`,
            ],
          ];
        }),
      ),
      "BIC-19": [
        "output/bic/bic-19/frontend-performance.raw.json",
        "output/bic/bic-19/frontend-performance.summary.json",
        "output/bic/bic-19/frontend-performance.run-manifest.json",
      ],
      "BIC-20": [
        "output/bic/bic-20/frontend-performance-final.raw.json",
        "output/bic/bic-20/frontend-performance-final.json",
        "output/bic/bic-20/frontend-performance-final.run-manifest.json",
      ],
    },
  };
  for (const [contractName, issueIds] of measurementIssueContracts) {
    const thresholdPrefix = `packet.measurementContracts.${contractName}.`;
    for (const issueId of issueIds) {
      const issue = issuesById.get(issueId);
      for (const field of [
        "discardedWarmupRuns",
        "measuredRuns",
        "maxCoefficientOfVariation",
        "maxFailures",
      ])
        assert(
          issue.thresholds.includes(`${thresholdPrefix}${field}`),
          `${issueId}: missing ${contractName} threshold ${field}`,
        );
      const acceptance = issue.acceptanceCriteria.join(" ");
      assert(/machine class/i.test(acceptance), `${issueId}: missing machine-class acceptance`);
      assert(
        /exact post-change source hash/i.test(acceptance),
        `${issueId}: missing exact post-change hash binding`,
      );
      assert(
        /p50\/p95\/max\/CV/.test(acceptance),
        `${issueId}: missing variance statistics acceptance`,
      );
      assert(/zero failures/i.test(acceptance), `${issueId}: missing zero-failure acceptance`);
      const artifacts = issue.artifactPaths;
      assert(
        artifacts.some((value) => value.endsWith(".raw.json")),
        `${issueId}: missing raw measurement artifact`,
      );
      assert(
        artifacts.some((value) => value.endsWith(".run-manifest.json")),
        `${issueId}: missing run-manifest artifact`,
      );
      assert(
        artifacts.some(
          (value) =>
            value.endsWith(".summary.json") ||
            (/performance/.test(value) &&
              value.endsWith(".json") &&
              !/\.raw\.json$|\.run-manifest\.json$/.test(value)),
        ),
        `${issueId}: missing summary measurement artifact`,
      );
      for (const artifact of measurementArtifacts[contractName][issueId])
        assert(
          artifacts.includes(artifact),
          `${issueId}: missing exact ${contractName} artifact ${artifact}`,
        );
    }
  }
  const finalAcceptance = issuesById.get("BIC-20").acceptanceCriteria.join(" ");
  assert(
    /exact final batch bytes/i.test(finalAcceptance) &&
      /stale baseline or prior-issue artifacts are prohibited/i.test(finalAcceptance),
    "BIC-20 must require fresh final-byte reruns and prohibit stale artifacts",
  );

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    assert(!visiting.has(id), `dependency cycle at ${id}`);
    visiting.add(id);
    for (const dependency of issuesById.get(id).dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of expectedIds) visit(id);

  assert(
    !issuesById.get("BIC-03").dependencies.includes("BIC-01"),
    "BIC-03 must not depend on startup",
  );
  const registryInfrastructure = issuesById.get("BIC-03");
  assert(
    registryInfrastructure.flowIds.length === 0 &&
      registryInfrastructure.routePatterns.length === 0 &&
      registryInfrastructure.stateSymbols.length === 0,
    "BIC-03 must own registry infrastructure, not domain flows, routes, or state symbols",
  );
  assert(
    registryInfrastructure.outOfScope.some((value) => /BIC-04 through BIC-10/.test(value)),
    "BIC-03 must defer final domain semantics to BIC-04 through BIC-10",
  );
  for (let index = 11; index <= 17; index += 1) {
    const id = `BIC-${String(index).padStart(2, "0")}`;
    const reachable = reachableDependencies(issuesById, id);
    assert(
      reachable.has("BIC-18") && reachable.has("BIC-19"),
      `${id}: BIC-18/19 baselines must precede work`,
    );
  }
  for (const id of FRONTEND_POST_CHANGE_IDS) {
    const issue = issuesById.get(id);
    for (const command of FRONTEND_POST_CHANGE_COMMANDS) {
      assert(issue.verificationCommands.includes(command), `${id}: missing post-change ${command}`);
    }
    for (const threshold of FRONTEND_POST_CHANGE_THRESHOLDS) {
      assert(issue.thresholds.includes(threshold), `${id}: missing post-change ${threshold}`);
    }
    assert(
      issue.artifactPaths.some((value) =>
        value.endsWith("frontend-performance-post-change.json"),
      ) &&
        issue.artifactPaths.some((value) =>
          value.endsWith("frontend-performance-post-change.raw.json"),
        ),
      `${id}: missing post-change frontend raw/summary artifacts`,
    );
    const acceptanceText = issue.acceptanceCriteria.join(" ");
    assert(/exact source hash/i.test(acceptanceText), `${id}: missing exact-source-hash binding`);
    assert(/zero measured failures/i.test(acceptanceText), `${id}: missing zero-failure contract`);
  }
  const finalDependencies = new Set(issuesById.get("BIC-20").dependencies);
  for (const id of expectedIds.slice(0, 19)) {
    assert(finalDependencies.has(id), `BIC-20 must directly depend on ${id}`);
  }
  assert(issuesById.get("BIC-20").kind === "evidence", "BIC-20 must be evidence-only");
  assert(
    issuesById.get("BIC-20").inScope.every((value) => !/\b(fix|implement|repair)\b/i.test(value)),
    "BIC-20 inScope may not contain repair work",
  );
  const finalIssue = issuesById.get("BIC-20");
  for (const command of FINAL_PERFORMANCE_COMMANDS) {
    assert(finalIssue.verificationCommands.includes(command), `BIC-20: missing final ${command}`);
  }
  for (const threshold of new Set([
    ...issuesById.get("BIC-18").thresholds,
    ...issuesById.get("BIC-19").thresholds,
    ...FRONTEND_POST_CHANGE_THRESHOLDS,
  ])) {
    assert(finalIssue.thresholds.includes(threshold), `BIC-20: missing final ${threshold}`);
  }
  for (const artifact of [
    "runtime-performance-final.json",
    "runtime-performance-final.raw.json",
    "frontend-performance-final.json",
    "frontend-performance-final.raw.json",
    "exact-source-hash.txt",
  ]) {
    assert(
      finalIssue.artifactPaths.some((value) => value.endsWith(artifact)),
      `BIC-20: missing final ${artifact}`,
    );
  }
  const finalAcceptanceText = finalIssue.acceptanceCriteria.join(" ");
  assert(
    /exact final source hash/i.test(finalAcceptanceText),
    "BIC-20: missing final hash binding",
  );
  assert(
    /zero measured failures/i.test(finalAcceptanceText),
    "BIC-20: missing final zero-failure contract",
  );

  const startupIssue = issuesById.get("BIC-01");
  assert(
    startupIssue.verificationCommands.includes("mise exec -- pnpm bench:startup"),
    "BIC-01: missing exact artifact-producing command mise exec -- pnpm bench:startup",
  );
  assert(
    issuesById.get("BIC-02").verificationCommands.includes(BIC_02_ROOT_GO_COMMAND),
    "BIC-02: missing root-runnable Go verification command",
  );
  for (const command of BIC_20_GIT_COMMANDS)
    assert(
      finalIssue.verificationCommands.includes(command),
      `BIC-20: missing exact Git closeout command ${command}`,
    );
  const finalNegativeText = finalIssue.negativeTests.join(" ");
  for (const fixture of BIC_20_GIT_NEGATIVE_FIXTURES)
    assert(
      finalNegativeText.includes(fixture),
      `BIC-20: missing Git closeout negative fixture ${fixture}`,
    );

  const snapshot = packet.capacitySnapshot;
  for (const field of [
    "activeUnarchivedBefore",
    "newIssuesCreatedNow",
    "activeUnarchivedAfter",
    "cap",
  ])
    assertNonnegativeSafeInteger(snapshot[field], `capacitySnapshot.${field}`);
  assert(snapshot.hasNextPage === false, "capacitySnapshot.hasNextPage must be exactly false");
  assert(
    snapshot.requiresParentFreshApiVerificationBeforeCreation === true,
    "fresh parent API verification before creation must remain mandatory",
  );
  assert(
    snapshot.newIssuesCreatedNow === 0,
    "candidate capacity snapshot newIssuesCreatedNow must be exactly 0",
  );
  assert(
    snapshot.activeUnarchivedAfter === snapshot.activeUnarchivedBefore,
    "candidate capacity snapshot must not change active unarchived count",
  );
  assert(
    snapshot.activeUnarchivedAfter ===
      snapshot.activeUnarchivedBefore + snapshot.newIssuesCreatedNow,
    "capacity snapshot arithmetic mismatch",
  );
  assert(
    snapshot.compliant === snapshot.activeUnarchivedAfter <= snapshot.cap,
    "capacity compliant flag mismatch",
  );
  assert(snapshot.cap === packet.activeCap, "capacity cap mismatch");
  const available = snapshot.cap - snapshot.activeUnarchivedBefore;
  assertNonnegativeSafeInteger(available, "capacitySnapshot available slots");
  assert(
    packet.creationPlan.eligiblePrefix.length === Math.min(available, packet.issues.length),
    "eligible prefix must exactly equal available capacity",
  );
  assert(
    packet.creationPlan.eligiblePrefix.every((id, index) => id === expectedIds[index]),
    "eligible issues must be a strict prefix",
  );
  const provenance = sourceEvidence.provenanceManifest;
  assert(
    provenance?.schemaVersion === "tts-research.linear-provenance.v1",
    "Linear provenance manifest schema mismatch",
  );
  assert(
    provenance.target?.project?.id === EXPECTED_PROJECT_ID &&
      provenance.target?.team?.id === EXPECTED_TEAM_ID,
    "Linear provenance manifest target mismatch",
  );
  assert(
    sourceEvidence.projectSetup?.schemaVersion === "linear-project-setup.v1" &&
      sourceEvidence.projectSetup?.project?.id === EXPECTED_PROJECT_ID &&
      sourceEvidence.projectSetup?.team?.id === EXPECTED_TEAM_ID,
    "project setup schema or target mismatch",
  );

  const capacityDescriptor = provenance.artifacts?.capacitySnapshot;
  const capacity = sourceEvidence.capacityArtifact;
  assert(capacity && capacityDescriptor, "capacity source artifact is required");
  assert(
    snapshot.repoArtifact === capacityDescriptor.path &&
      sourceEvidence.capacityArtifactPath === capacityDescriptor.path,
    "capacitySnapshot.repoArtifact must match the canonical provenance path",
  );
  assert(
    capacity.schemaVersion === capacityDescriptor.schemaVersion,
    "capacity source schema mismatch",
  );
  assert(
    capacity.capturedAt === capacityDescriptor.capturedAt &&
      capacity.capturedAt === snapshot.observedAt,
    "capacity source capture timestamp mismatch",
  );
  assert(capacity.source === capacityDescriptor.source, "capacity source query mismatch");
  assert(
    capacity.project?.id === packet.projectId &&
      capacity.project?.name === provenance.target.project.name,
    "capacity source project mismatch",
  );
  assert(
    capacity.activeDefinition ===
      "unarchived issue whose state.type is neither completed nor canceled",
    "capacity source active definition mismatch",
  );
  for (const [field, expected] of Object.entries(capacityDescriptor.expectedCounts))
    assert(capacity[field] === expected, `capacity source exact ${field} mismatch`);
  assert(
    Array.isArray(capacity.issues) && capacity.unarchivedTotal === capacity.issues.length,
    "capacity source unarchivedTotal arithmetic mismatch",
  );
  assert(capacity.cap === snapshot.cap, "capacity source cap mismatch");
  assert(
    capacity.activeUnarchivedBefore === snapshot.activeUnarchivedBefore &&
      capacity.newIssuesCreatedNow === snapshot.newIssuesCreatedNow &&
      capacity.activeUnarchivedAfter === snapshot.activeUnarchivedAfter,
    "capacity source counts mismatch",
  );
  assert(capacity.hasNextPage === false, "capacity source hasNextPage must be exactly false");
  assert(
    capacity.availableSlots === capacity.cap - capacity.activeUnarchivedBefore,
    "capacity source availableSlots arithmetic mismatch",
  );
  assert(capacity.availableSlots === available, "capacity source availableSlots mismatch");
  assert(capacity.compliant === snapshot.compliant, "capacity source compliant flag mismatch");
  assert(
    snapshot.verificationMode ===
      "Linear GraphQL project-scoped issues(includeArchived:false), paginated",
    "capacitySnapshot.verificationMode mismatch",
  );

  const reconciliation = new Map(
    packet.existingIssueReconciliation.mappings.map((mapping) => [mapping.localId, mapping.links]),
  );
  assert(reconciliation.size === 20, "existingIssueReconciliation must map all 20 issues");
  for (const issue of packet.issues) {
    assert(
      JSON.stringify(reconciliation.get(issue.localId)) ===
        JSON.stringify(issue.existingIssueLinks),
      `${issue.localId}: reconciliation drift`,
    );
  }
  const existingDescriptor = provenance.artifacts?.existingIssues;
  assert(existingDescriptor, "existing-issue provenance descriptor is required");
  assert(
    packet.existingIssueReconciliation.sourceArtifact === existingDescriptor.path &&
      sourceEvidence.existingIssuesArtifactPath === existingDescriptor.path,
    "existingIssueReconciliation sourceArtifact must match the canonical provenance path",
  );
  const source = sourceEvidence.existingIssuesArtifact;
  assert(
    source?.schemaVersion === existingDescriptor.schemaVersion,
    "existing-issue schema mismatch",
  );
  assert(
    source.capturedAt === existingDescriptor.capturedAt,
    "existing-issue capture timestamp mismatch",
  );
  assert(source.source === existingDescriptor.source, "existing-issue source query mismatch");
  assert(source.projectId === packet.projectId, "existing-issue source project mismatch");
  assert(
    source.issueCount === existingDescriptor.expectedCounts.issueCount &&
      source.issueCount === source.issues?.length,
    "existing-issue issueCount mismatch",
  );
  const actualStateCounts = stateTypeCounts(source.issues);
  assert(
    JSON.stringify(source.stateTypeCounts) ===
      JSON.stringify(existingDescriptor.expectedCounts.stateTypeCounts) &&
      JSON.stringify(source.stateTypeCounts) === JSON.stringify(actualStateCounts),
    "existing-issue stateTypeCounts mismatch",
  );
  const actualArchivedCount = source.issues.filter((issue) => Boolean(issue.archivedAt)).length;
  assert(
    source.archivedCount === existingDescriptor.expectedCounts.archivedCount &&
      source.archivedCount === actualArchivedCount,
    "existing-issue archivedCount mismatch",
  );
  const byIdentifier = new Map();
  const existingIds = new Set();
  for (const existing of source.issues) {
    assert(
      existing.id && !existingIds.has(existing.id),
      `${existing.identifier}: duplicate source id`,
    );
    existingIds.add(existing.id);
    const matches = byIdentifier.get(existing.identifier) ?? [];
    matches.push(existing);
    byIdentifier.set(existing.identifier, matches);
  }
  for (const issue of packet.issues) {
    for (const link of issue.existingIssueLinks) {
      const matches = byIdentifier.get(link.identifier) ?? [];
      assert(
        matches.length === 1,
        `${link.identifier}: identifier must resolve exactly once in the existing-issue source artifact`,
      );
      const existing = matches[0];
      assert(
        existing.state?.type === "completed",
        `${link.identifier}: source issue must be completed`,
      );
      assert(existing.archivedAt, `${link.identifier}: source issue must be archived`);
      assert(
        ["extends", "documents-existing", "supersedes", "no-overlap"].includes(link.relationship),
        `${link.identifier}: relationship ${link.relationship} is incompatible with completed evidence`,
      );
    }
  }

  const completedDescriptor = provenance.artifacts?.completedArchive;
  const completed = sourceEvidence.completedArchiveArtifact;
  assert(completedDescriptor && completed, "completed archive provenance is required");
  assert(
    sourceEvidence.completedArchiveArtifactPath === completedDescriptor.path,
    "completed archive must match the canonical provenance path",
  );
  assert(
    JSON.stringify(packet.completedFirstBatchPolicy.archiveArtifacts) ===
      JSON.stringify([existingDescriptor.path, completedDescriptor.path]),
    "completedFirstBatchPolicy.archiveArtifacts must match canonical provenance paths",
  );
  assert(
    completed.schemaVersion === completedDescriptor.schemaVersion,
    "completed archive schema mismatch",
  );
  assert(
    completed.exportedAt === completedDescriptor.exportedAt,
    "completed archive export timestamp mismatch",
  );
  assert(completed.purpose === completedDescriptor.purpose, "completed archive purpose mismatch");
  assert(
    completed.project?.id === packet.projectId &&
      completed.project?.name === provenance.target.project.name,
    "completed archive project mismatch",
  );
  assert(
    JSON.stringify(completed.counts) === JSON.stringify(completedDescriptor.expectedCounts),
    "completed archive exact counts mismatch",
  );
  assert(
    completed.counts.completedUnarchived ===
      completed.counts.safeToArchive + completed.counts.skippedUnsafe,
    "completed archive completedUnarchived arithmetic mismatch",
  );
  assert(
    completed.counts.safeToArchive === completed.issues?.length,
    "completed archive safeToArchive arithmetic mismatch",
  );
  assert(
    completed.counts.skippedUnsafe === completed.skippedUnsafe?.length,
    "completed archive skippedUnsafe arithmetic mismatch",
  );
  for (const archivedSource of completed.issues) {
    assert(
      archivedSource.project?.id === packet.projectId,
      `${archivedSource.identifier}: completed project mismatch`,
    );
    assert(
      archivedSource.team?.id === packet.teamId,
      `${archivedSource.identifier}: completed team mismatch`,
    );
    assert(
      archivedSource.state?.type === "completed",
      `${archivedSource.identifier}: completed state mismatch`,
    );
    assert(
      archivedSource.completedAt && archivedSource.archivedAt === null,
      `${archivedSource.identifier}: completed archive pre-archive timestamps mismatch`,
    );
    const postArchiveMatches = byIdentifier.get(archivedSource.identifier) ?? [];
    assert(
      postArchiveMatches.length === 1 &&
        postArchiveMatches[0].id === archivedSource.id &&
        Boolean(postArchiveMatches[0].archivedAt),
      `${archivedSource.identifier}: completed archive post-archive reconciliation mismatch`,
    );
  }

  if (flowManifest) {
    const flowById = new Map(flowManifest.flows.map((flow) => [flow.id, flow]));
    const transitionIds = flowManifest.flows.flatMap((flow) =>
      flow.transitions.map(({ id }) => id),
    );
    const coveredTransitionIds = flowManifest.flows.flatMap((flow) =>
      flow.testEvidence.flatMap((entry) =>
        entry.testCases.flatMap(({ transitionIds: caseTransitionIds }) => caseTransitionIds),
      ),
    );
    const plannedTransitionIds = flowManifest.flows.flatMap((flow) =>
      flow.plannedEvidence.flatMap(({ transitionIds: plannedIds }) => plannedIds),
    );
    const coveredSet = new Set(coveredTransitionIds);
    const plannedSet = new Set(plannedTransitionIds);
    const overlapCount = [...coveredSet].filter((id) => plannedSet.has(id)).length;
    const classifiedSet = new Set([...coveredSet, ...plannedSet]);
    const unclassifiedCount = transitionIds.filter((id) => !classifiedSet.has(id)).length;
    const registryThresholds = packet.thresholdCatalog.flowRegistry;
    assert(
      registryThresholds.expectedTransitionCount === transitionIds.length,
      "packet flowRegistry expectedTransitionCount must equal canonical manifest transitions",
    );
    assert(
      registryThresholds.maxUnsupportedCoveredTransitionClaims === 0,
      "packet flowRegistry maxUnsupportedCoveredTransitionClaims must be zero",
    );
    assert(
      registryThresholds.maxUnclassifiedTransitionEvidence === 0,
      "packet flowRegistry maxUnclassifiedTransitionEvidence must be zero",
    );
    assert(overlapCount === 0, "covered and planned transition evidence must not overlap");
    assert(unclassifiedCount === 0, "every canonical transition must be classified");
    assert(flowCoverage, "flow coverage report is required");
    const expectedCoverage = {
      schemaVersion: "tts-research.flow-coverage.v2",
      transitionCount: transitionIds.length,
      coveredTransitionClaimCount: coveredTransitionIds.length,
      plannedTransitionEvidenceCount: plannedTransitionIds.length,
      transitionEvidenceOverlapCount: overlapCount,
      unsupportedCoveredTransitionClaimCount: 0,
      unclassifiedTransitionCount: unclassifiedCount,
    };
    for (const [field, expected] of Object.entries(expectedCoverage))
      assert(
        flowCoverage[field] === expected,
        `flow coverage report drift for ${field}: expected ${expected}, got ${flowCoverage[field]}`,
      );
    assert(
      flowCoverage.unsupportedCoveredTransitionClaimCount <=
        registryThresholds.maxUnsupportedCoveredTransitionClaims,
      "flow coverage unsupported covered transition claims exceed packet threshold",
    );
    assert(
      flowCoverage.unclassifiedTransitionCount <=
        registryThresholds.maxUnclassifiedTransitionEvidence,
      "flow coverage unclassified transitions exceed packet threshold",
    );
    assert(
      JSON.stringify(packet.ownershipContract?.fields) ===
        JSON.stringify(["flowIds", "routePatterns", "stateSymbols"]),
      "ownershipContract must define the three exclusive ownership fields",
    );
    const exactOwnership = [
      ["flowIds", flowManifest.flows.map(({ id }) => id)],
      ["routePatterns", flowManifest.flows.flatMap((flow) => flow.routePatterns)],
      ["stateSymbols", flowManifest.requiredStateSymbols.map(({ symbol }) => symbol)],
    ];
    for (const [field, canonicalValues] of exactOwnership) {
      const assigned = packet.issues.flatMap((issue) => issue[field]);
      assert(
        new Set(assigned).size === assigned.length,
        `${field}: issue ownership must not overlap`,
      );
      assert(
        JSON.stringify([...assigned].sort()) ===
          JSON.stringify([...new Set(canonicalValues)].sort()),
        `${field}: issues must exactly own the canonical inventory once`,
      );
    }
    const startupOwner = issuesById.get("BIC-01");
    assert(
      JSON.stringify(startupOwner.flowIds) === JSON.stringify(["APP-BOOT-001"]) &&
        startupOwner.routePatterns.length === 0 &&
        startupOwner.stateSymbols.length === 0,
      "BIC-01 must exclusively own only APP-BOOT flow semantics",
    );
    for (const planned of flowById.get("APP-BOOT-001").plannedEvidence)
      assert(planned.ownerIssue === "BIC-01", "APP-BOOT planned evidence must be owned by BIC-01");
    const domainIssueIds = new Set(
      Array.from({ length: 7 }, (_, index) => `BIC-${String(index + 4).padStart(2, "0")}`),
    );
    const domainIssues = packet.issues.filter((issue) => domainIssueIds.has(issue.localId));
    const assignedFlowIds = domainIssues.flatMap((issue) => issue.flowIds);
    assert(
      new Set(assignedFlowIds).size === assignedFlowIds.length,
      "BIC-04–10 flow ownership must not overlap",
    );
    const expectedDomainFlowIds = flowManifest.flows
      .map(({ id }) => id)
      .filter((id) => id !== "APP-BOOT-001")
      .sort();
    assert(
      JSON.stringify([...assignedFlowIds].sort()) === JSON.stringify(expectedDomainFlowIds),
      "BIC-04–10 must exactly own every non-startup canonical flow",
    );
    for (const issue of domainIssues) {
      const flows = issue.flowIds.map((id) => flowById.get(id));
      assert(flows.every(Boolean), `${issue.localId}: unknown canonical flow id`);
      const expectedRoutes = [...new Set(flows.flatMap((flow) => flow.routePatterns))].sort();
      const expectedSymbols = [
        ...new Set(
          flows.flatMap((flow) => [...flow.frontendStateSymbols, ...flow.backendStateSymbols]),
        ),
      ].sort();
      assert(
        JSON.stringify([...issue.routePatterns].sort()) === JSON.stringify(expectedRoutes),
        `${issue.localId}: canonical route scope drift`,
      );
      assert(
        JSON.stringify([...issue.stateSymbols].sort()) === JSON.stringify(expectedSymbols),
        `${issue.localId}: canonical state-symbol scope drift`,
      );
      for (const flow of flows)
        for (const planned of flow.plannedEvidence)
          assert(
            planned.ownerIssue === issue.localId,
            `${flow.id}: planned evidence owner drift (${planned.ownerIssue} != ${issue.localId})`,
          );
    }
    const allDomainRoutes = [
      ...new Set(domainIssues.flatMap((issue) => issue.routePatterns)),
    ].sort();
    const allCanonicalRoutes = [
      ...new Set(flowManifest.flows.flatMap((flow) => flow.routePatterns)),
    ].sort();
    assert(
      JSON.stringify(allDomainRoutes) === JSON.stringify(allCanonicalRoutes),
      "BIC-04–10 route scopes must exactly cover the canonical route inventory",
    );
    const allDomainSymbols = [
      ...new Set(domainIssues.flatMap((issue) => issue.stateSymbols)),
    ].sort();
    const allCanonicalSymbols = flowManifest.requiredStateSymbols
      .map(({ symbol }) => symbol)
      .sort();
    assert(
      JSON.stringify(allDomainSymbols) === JSON.stringify(allCanonicalSymbols),
      "BIC-04–10 state scopes must exactly cover the canonical state inventory",
    );
  }
}

async function loadProvenanceArtifact(root, descriptor, label) {
  assert(descriptor && typeof descriptor === "object", `${label} descriptor is required`);
  assert(
    typeof descriptor.sha256 === "string" && /^[0-9a-f]{64}$/.test(descriptor.sha256),
    `${label} descriptor must contain a lowercase SHA-256`,
  );
  const artifactPath = repoArtifactPath(root, descriptor.path, `${label} provenance path`);
  const bytes = await readFile(artifactPath);
  assert(sha256(bytes) === descriptor.sha256, `${label} SHA-256 mismatch at ${descriptor.path}`);
  return { artifact: JSON.parse(bytes.toString("utf8")), artifactPath: descriptor.path };
}

export async function loadInputs(root = process.cwd()) {
  const [packet, benches, flowManifest, flowCoverage, projectSetup, provenanceManifest] =
    await Promise.all([
      readFile(path.join(root, DEFAULT_JSON_PATH), "utf8").then(JSON.parse),
      readFile(path.join(root, BENCH_THRESHOLDS_PATH), "utf8").then(JSON.parse),
      readFile(path.join(root, FLOW_MANIFEST_PATH), "utf8").then(JSON.parse),
      readFile(path.join(root, FLOW_COVERAGE_PATH), "utf8").then(JSON.parse),
      readFile(path.join(root, PROJECT_SETUP_PATH), "utf8").then(JSON.parse),
      readFile(path.join(root, PROVENANCE_MANIFEST_PATH), "utf8").then(JSON.parse),
    ]);
  const descriptors = provenanceManifest.artifacts;
  assert(
    descriptors && typeof descriptors === "object",
    "provenance artifact descriptors required",
  );
  const [capacitySource, existingIssuesSource, completedArchiveSource] = await Promise.all([
    loadProvenanceArtifact(root, descriptors.capacitySnapshot, "capacity artifact"),
    loadProvenanceArtifact(root, descriptors.existingIssues, "existing-issues artifact"),
    loadProvenanceArtifact(root, descriptors.completedArchive, "completed-archive artifact"),
  ]);
  const sourceEvidence = {
    projectSetup,
    provenanceManifest,
    capacityArtifact: capacitySource.artifact,
    capacityArtifactPath: capacitySource.artifactPath,
    existingIssuesArtifact: existingIssuesSource.artifact,
    existingIssuesArtifactPath: existingIssuesSource.artifactPath,
    completedArchiveArtifact: completedArchiveSource.artifact,
    completedArchiveArtifactPath: completedArchiveSource.artifactPath,
  };
  return { packet, benches, flowManifest, flowCoverage, sourceEvidence };
}

export async function run({ root = process.cwd(), write = false } = {}) {
  const { packet, benches, flowManifest, flowCoverage, sourceEvidence } = await loadInputs(root);
  validatePacket(packet, benches, flowManifest, flowCoverage, sourceEvidence);
  const rendered = renderMarkdown(packet, benches);
  const markdownPath = path.join(root, DEFAULT_MARKDOWN_PATH);
  if (write) {
    await writeFile(markdownPath, rendered);
    return { mode: "write", issueCount: packet.issues.length, markdownPath };
  }
  const existing = await readFile(markdownPath, "utf8");
  assert(
    existing === rendered,
    `${DEFAULT_MARKDOWN_PATH} is not in parity; run node scripts/validate-linear-batch.mjs --write`,
  );
  return { mode: "check", issueCount: packet.issues.length, markdownPath };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  run({ write: process.argv.includes("--write") })
    .then((result) => {
      console.log(
        `linear batch ${result.mode} passed: ${result.issueCount} issues; DAG, cap, schema, thresholds, reconciliation, and Markdown parity valid`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
