import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_JSON_PATH,
  DEFAULT_MARKDOWN_PATH,
  loadInputs,
  PROVENANCE_MANIFEST_PATH,
  renderMarkdown,
  run,
  validatePacket as validatePacketImpl,
} from "./validate-linear-batch.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const CANONICAL_INPUTS = await loadInputs(ROOT);

function validatePacket(
  packet,
  benches,
  flowManifest = null,
  flowCoverage = null,
  sourceEvidence = CANONICAL_INPUTS.sourceEvidence,
) {
  return validatePacketImpl(packet, benches, flowManifest, flowCoverage, sourceEvidence);
}

function validateLoaded(inputs, packet = inputs.packet, sourceEvidence = inputs.sourceEvidence) {
  return validatePacket(
    packet,
    inputs.benches,
    inputs.flowManifest,
    inputs.flowCoverage,
    sourceEvidence,
  );
}

function expectPacketMutationRejected(inputs, mutate, expectedError) {
  const mutation = structuredClone(inputs.packet);
  mutate(mutation);
  assert.throws(() => validateLoaded(inputs, mutation), expectedError);
}

async function createRunFixture() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "linear-batch-run-"));
  const descriptors = CANONICAL_INPUTS.sourceEvidence.provenanceManifest.artifacts;
  const fixturePaths = [
    DEFAULT_JSON_PATH,
    DEFAULT_MARKDOWN_PATH,
    "benches/thresholds.json",
    "docs/flows/manifest.json",
    "docs/flows/coverage-report.json",
    "docs/project-management/linear/tts-research-project-setup.manifest.json",
    PROVENANCE_MANIFEST_PATH,
    descriptors.capacitySnapshot.path,
    descriptors.existingIssues.path,
    descriptors.completedArchive.path,
  ];
  await Promise.all(
    fixturePaths.map(async (relativePath) => {
      const destination = path.join(temporaryRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(ROOT, relativePath), destination);
    }),
  );
  return temporaryRoot;
}

async function writeFixturePacket(root, packet) {
  await Promise.all([
    writeFile(path.join(root, DEFAULT_JSON_PATH), `${JSON.stringify(packet, null, 2)}\n`),
    writeFile(
      path.join(root, DEFAULT_MARKDOWN_PATH),
      renderMarkdown(packet, CANONICAL_INPUTS.benches),
    ),
  ]);
}

test("canonical packet validates and generated Markdown is in parity", async () => {
  const inputs = await loadInputs(ROOT);
  const { packet, benches } = inputs;
  assert.doesNotThrow(() => validateLoaded(inputs));
  const markdown = await readFile(path.join(ROOT, DEFAULT_MARKDOWN_PATH), "utf8");
  const rendered = renderMarkdown(packet, benches);
  assert.equal(markdown, rendered);
  assert(!rendered.includes("undefined"), "generated Markdown must not contain unresolved values");
  for (const [path, value] of [
    ["packet.measurementContracts.runtimeStartup.discardedWarmupRuns", "1"],
    ["packet.measurementContracts.runtimeStartup.measuredRuns", "10"],
    ["packet.measurementContracts.runtimeStartup.maxCoefficientOfVariation", "0.25"],
    ["packet.measurementContracts.runtimeStartup.maxFailures", "0"],
  ])
    assert(rendered.includes(`\`${path}\`: \`${value}\``), `missing concrete threshold ${path}`);
  await assert.doesNotReject(run({ root: ROOT }));
});

test("v9 lifecycle constants and no-creation state are exact and unconditional", async () => {
  const inputs = await loadInputs(ROOT);
  for (const [mutate, expectedError] of [
    [(packet) => (packet.status = "approved"), /status must be exactly/],
    [(packet) => (packet.issues[0].status = "created"), /BIC-01: status must be exactly/],
    [
      (packet) => (packet.issues[0].creationDisposition = "create_now"),
      /BIC-01: creationDisposition must be exactly/,
    ],
    [(packet) => (packet.requiredPeerMarker = "WRONG"), /requiredPeerMarker must be exactly/],
    [
      (packet) => (packet.creationPlan.requiresApprovalMarker = "WRONG"),
      /creationPlan.requiresApprovalMarker must be exactly/,
    ],
    [
      (packet) => (packet.creationPlan.authorizationGates.approvalMarkerReceived = true),
      /authorizationGates must contain the exact canonical gates, all false/,
    ],
    [
      (packet) => (packet.creationPlan.authorizationGates.repositoryValidationPassed = "false"),
      /authorizationGates must contain the exact canonical gates, all false/,
    ],
    [
      (packet) => delete packet.creationPlan.authorizationGates.trackedReviewArchiveAttached,
      /authorizationGates must contain the exact canonical gates, all false/,
    ],
    [(packet) => (packet.projectId = "wrong-project"), /projectId.*project setup manifest/],
    [(packet) => (packet.teamId = "wrong-team"), /teamId.*project setup manifest/],
    [(packet) => (packet.creationGates = []), /creationGates must exactly match/],
    [
      (packet) => {
        packet.status = "approved";
        packet.issues[0].linear = { id: "fake", url: "fake" };
        packet.capacitySnapshot.newIssuesCreatedNow = 1;
        packet.capacitySnapshot.activeUnarchivedAfter =
          packet.capacitySnapshot.activeUnarchivedBefore + 1;
        packet.capacitySnapshot.compliant = true;
      },
      /status must be exactly/,
    ],
  ])
    expectPacketMutationRejected(inputs, mutate, expectedError);

  for (const gate of Object.keys(inputs.packet.creationPlan.authorizationGates))
    expectPacketMutationRejected(
      inputs,
      (packet) => (packet.creationPlan.authorizationGates[gate] = true),
      /authorizationGates must contain the exact canonical gates, all false/,
    );
});

test("v9 capacity snapshot provenance, pagination, and arithmetic fail closed", async () => {
  const inputs = await loadInputs(ROOT);
  for (const [mutate, expectedError] of [
    [
      (packet) => {
        packet.capacitySnapshot.activeUnarchivedBefore = -1;
        packet.capacitySnapshot.activeUnarchivedAfter = -1;
      },
      /activeUnarchivedBefore must be a nonnegative safe integer/,
    ],
    [(packet) => (packet.capacitySnapshot.hasNextPage = true), /hasNextPage must be exactly false/],
    [
      (packet) =>
        (packet.capacitySnapshot.repoArtifact =
          "docs/project-management/linear/does-not-exist.json"),
      /repoArtifact must match the canonical provenance path/,
    ],
    [
      (packet) =>
        (packet.capacitySnapshot.requiresParentFreshApiVerificationBeforeCreation = false),
      /fresh parent API verification before creation must remain mandatory/,
    ],
    [
      (packet) => packet.creationPlan.eligiblePrefix.pop(),
      /eligible prefix must exactly equal available capacity/,
    ],
  ])
    expectPacketMutationRejected(inputs, mutate, expectedError);

  const malformedEvidence = structuredClone(inputs.sourceEvidence);
  malformedEvidence.capacityArtifact.availableSlots -= 1;
  assert.throws(
    () => validateLoaded(inputs, inputs.packet, malformedEvidence),
    /capacity source exact availableSlots mismatch/,
  );
});

test("v9 provenance metadata, counts, states, and archive arithmetic are exact", async () => {
  const inputs = await loadInputs(ROOT);
  for (const [mutate, expectedError] of [
    [
      (evidence) => (evidence.capacityArtifact.schemaVersion = "wrong"),
      /capacity source schema mismatch/,
    ],
    [
      (evidence) => (evidence.capacityArtifact.capturedAt = "2026-07-10T00:00:00Z"),
      /capacity source capture timestamp mismatch/,
    ],
    [
      (evidence) => (evidence.capacityArtifact.source = "substituted query"),
      /capacity source query mismatch/,
    ],
    [
      (evidence) => (evidence.existingIssuesArtifact.schemaVersion = "wrong"),
      /existing-issue schema mismatch/,
    ],
    [
      (evidence) => (evidence.existingIssuesArtifact.capturedAt = "2026-07-10T00:00:00Z"),
      /existing-issue capture timestamp mismatch/,
    ],
    [
      (evidence) => (evidence.existingIssuesArtifact.source = "substituted query"),
      /existing-issue source query mismatch/,
    ],
    [
      (evidence) => (evidence.existingIssuesArtifact.issueCount -= 1),
      /existing-issue issueCount mismatch/,
    ],
    [
      (evidence) => (evidence.existingIssuesArtifact.stateTypeCounts.completed -= 1),
      /existing-issue stateTypeCounts mismatch/,
    ],
    [
      (evidence) => (evidence.existingIssuesArtifact.archivedCount -= 1),
      /existing-issue archivedCount mismatch/,
    ],
    [
      (evidence) => (evidence.completedArchiveArtifact.schemaVersion = 2),
      /completed archive schema mismatch/,
    ],
    [
      (evidence) => (evidence.completedArchiveArtifact.exportedAt = "2026-07-10T00:00:00Z"),
      /completed archive export timestamp mismatch/,
    ],
    [
      (evidence) => (evidence.completedArchiveArtifact.counts.safeToArchive -= 1),
      /completed archive exact counts mismatch/,
    ],
  ]) {
    const evidence = structuredClone(inputs.sourceEvidence);
    mutate(evidence);
    assert.throws(() => validateLoaded(inputs, inputs.packet, evidence), expectedError);
  }
});

test("run({root}) rejects packet-declared substitutions for every provenance artifact", async () => {
  const descriptors = CANONICAL_INPUTS.sourceEvidence.provenanceManifest.artifacts;
  const cases = [
    {
      descriptor: descriptors.capacitySnapshot,
      alternate: "docs/project-management/linear/substituted-capacity.json",
      mutate: (packet, alternate) => (packet.capacitySnapshot.repoArtifact = alternate),
      error: /capacitySnapshot.repoArtifact must match the canonical provenance path/,
    },
    {
      descriptor: descriptors.existingIssues,
      alternate: "docs/project-management/linear/substituted-existing.json",
      mutate: (packet, alternate) =>
        (packet.existingIssueReconciliation.sourceArtifact = alternate),
      error: /existingIssueReconciliation sourceArtifact must match the canonical provenance path/,
    },
    {
      descriptor: descriptors.completedArchive,
      alternate: "docs/project-management/linear/substituted-completed-archive.json",
      mutate: (packet, alternate) =>
        (packet.completedFirstBatchPolicy.archiveArtifacts[1] = alternate),
      error: /completedFirstBatchPolicy.archiveArtifacts must match canonical provenance paths/,
    },
  ];
  for (const fixtureCase of cases) {
    const temporaryRoot = await createRunFixture();
    try {
      const alternatePath = path.join(temporaryRoot, fixtureCase.alternate);
      await mkdir(path.dirname(alternatePath), { recursive: true });
      await copyFile(path.join(ROOT, fixtureCase.descriptor.path), alternatePath);
      const packet = structuredClone(CANONICAL_INPUTS.packet);
      fixtureCase.mutate(packet, fixtureCase.alternate);
      await writeFixturePacket(temporaryRoot, packet);
      await assert.rejects(run({ root: temporaryRoot }), fixtureCase.error);
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  }
});

test("run({root}) rejects canonical provenance bytes that do not match SHA-256", async () => {
  const temporaryRoot = await createRunFixture();
  try {
    const capacityPath = path.join(
      temporaryRoot,
      CANONICAL_INPUTS.sourceEvidence.provenanceManifest.artifacts.capacitySnapshot.path,
    );
    await writeFile(capacityPath, `${await readFile(capacityPath, "utf8")}\n`);
    await assert.rejects(run({ root: temporaryRoot }), /capacity artifact SHA-256 mismatch/);
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});

test("v9 reconciliation identifiers must resolve in authoritative source artifacts", async () => {
  const inputs = await loadInputs(ROOT);
  expectPacketMutationRejected(
    inputs,
    (packet) => {
      for (const issue of packet.issues)
        for (const link of issue.existingIssueLinks) link.identifier = "QQP-999999";
      for (const mapping of packet.existingIssueReconciliation.mappings)
        for (const link of mapping.links) link.identifier = "QQP-999999";
    },
    /QQP-999999: identifier must resolve exactly once in the existing-issue source artifact/,
  );
});

test("v8 BIC-01 owns the exact startup benchmark producing command", async () => {
  const inputs = await loadInputs(ROOT);
  expectPacketMutationRejected(
    inputs,
    (packet) => {
      const issue = packet.issues.find(({ localId }) => localId === "BIC-01");
      issue.verificationCommands = issue.verificationCommands.filter(
        (command) => command !== "mise exec -- pnpm bench:startup",
      );
    },
    /BIC-01: missing exact artifact-producing command mise exec -- pnpm bench:startup/,
  );
});

test("v8 BIC-02 Go verification command is root-runnable", async () => {
  const inputs = await loadInputs(ROOT);
  expectPacketMutationRejected(
    inputs,
    (packet) => {
      const issue = packet.issues.find(({ localId }) => localId === "BIC-02");
      issue.verificationCommands = issue.verificationCommands.map((command) =>
        command === "mise exec -- go -C backend test ./... -timeout=180s"
          ? "go test ./... -timeout=180s"
          : command,
      );
    },
    /BIC-02: missing root-runnable Go verification command/,
  );
});

test("v8 BIC-20 requires exact clean-worktree, upstream, fetch, and equality gates", async () => {
  const inputs = await loadInputs(ROOT);
  const requiredCommands = [
    "git diff --check",
    'test -z "$(git status --porcelain=v1 --untracked-files=all)"',
    "git fetch --prune",
    "git rev-parse --verify '@{upstream}' >/dev/null",
    'test "$(git rev-parse HEAD)" = "$(git rev-parse \'@{upstream}\')"',
  ];
  for (const command of requiredCommands)
    expectPacketMutationRejected(
      inputs,
      (packet) => {
        const issue = packet.issues.find(({ localId }) => localId === "BIC-20");
        issue.verificationCommands = issue.verificationCommands.filter(
          (value) => value !== command,
        );
      },
      /BIC-20: missing exact Git closeout command/,
    );

  for (const fixture of ["dirty tracked file", "untracked file", "no upstream", "ahead", "behind"])
    expectPacketMutationRejected(
      inputs,
      (packet) => {
        const issue = packet.issues.find(({ localId }) => localId === "BIC-20");
        issue.negativeTests = issue.negativeTests.filter((value) => !value.includes(fixture));
      },
      /BIC-20: missing Git closeout negative fixture/,
    );
});

test("validator rejects BIC-00 and dependency/cap drift", async () => {
  const { packet, benches } = await loadInputs(ROOT);
  const withParent = structuredClone(packet);
  withParent.issues[0].localId = "BIC-00";
  assert.throws(() => validatePacket(withParent, benches), /BIC-00/);

  const wrongCapacity = structuredClone(packet);
  wrongCapacity.capacitySnapshot.activeUnarchivedAfter = 1;
  assert.throws(
    () => validatePacket(wrongCapacity, benches),
    /candidate capacity snapshot must not change active unarchived count/,
  );

  const wrongDependency = structuredClone(packet);
  wrongDependency.issues.find((issue) => issue.localId === "BIC-11").dependencies = ["BIC-04"];
  assert.throws(() => validatePacket(wrongDependency, benches), /BIC-18\/19/);
});

test("candidate validator rejects a non-null Linear binding", async () => {
  const { packet, benches } = await loadInputs(ROOT);
  const mutation = structuredClone(packet);
  mutation.issues[0].linear = { id: "fake-id", url: "fake-url" };
  assert.throws(
    () => validatePacket(mutation, benches),
    /BIC-01: candidate Linear binding must be exactly null/,
  );
});

test("candidate validator rejects creation arithmetic even when marked compliant", async () => {
  const { packet, benches } = await loadInputs(ROOT);
  const mutation = structuredClone(packet);
  mutation.capacitySnapshot.newIssuesCreatedNow = 1;
  mutation.capacitySnapshot.activeUnarchivedAfter = 1;
  mutation.capacitySnapshot.compliant = true;
  assert.throws(
    () => validatePacket(mutation, benches),
    /candidate capacity snapshot newIssuesCreatedNow must be exactly 0/,
  );
  assert.doesNotMatch(
    renderMarkdown(mutation, benches),
    /No Linear item was created or mutated by this packet update/,
  );
});

test("validator rejects missing post-change and final-byte performance evidence", async () => {
  const { packet, benches } = await loadInputs(ROOT);

  const domainLeak = structuredClone(packet);
  domainLeak.issues
    .find((issue) => issue.localId === "BIC-03")
    .routePatterns.push("GET /api/projects");
  assert.throws(() => validatePacket(domainLeak, benches), /registry infrastructure/);

  const missingPostChangeCommand = structuredClone(packet);
  missingPostChangeCommand.issues.find((issue) => issue.localId === "BIC-11").verificationCommands =
    missingPostChangeCommand.issues
      .find((issue) => issue.localId === "BIC-11")
      .verificationCommands.filter(
        (command) => command !== "mise exec -- pnpm bench:frontend-performance",
      );
  assert.throws(() => validatePacket(missingPostChangeCommand, benches), /post-change/);

  const missingPostChangeThreshold = structuredClone(packet);
  missingPostChangeThreshold.issues.find((issue) => issue.localId === "BIC-14").thresholds =
    missingPostChangeThreshold.issues
      .find((issue) => issue.localId === "BIC-14")
      .thresholds.filter(
        (threshold) => threshold !== "benches.frontendBundle.maxInitialJsGzipBytes",
      );
  assert.throws(() => validatePacket(missingPostChangeThreshold, benches), /post-change/);

  const missingPostChangeRaw = structuredClone(packet);
  missingPostChangeRaw.issues.find((issue) => issue.localId === "BIC-17").artifactPaths =
    missingPostChangeRaw.issues
      .find((issue) => issue.localId === "BIC-17")
      .artifactPaths.filter((artifact) => !artifact.endsWith("post-change.raw.json"));
  assert.throws(
    () => validatePacket(missingPostChangeRaw, benches),
    /missing raw measurement artifact/,
  );

  const missingFinalCommand = structuredClone(packet);
  missingFinalCommand.issues.find((issue) => issue.localId === "BIC-20").verificationCommands =
    missingFinalCommand.issues
      .find((issue) => issue.localId === "BIC-20")
      .verificationCommands.filter((command) => command !== "mise exec -- pnpm bench:startup");
  assert.throws(() => validatePacket(missingFinalCommand, benches), /missing final/);

  const missingFinalHash = structuredClone(packet);
  missingFinalHash.issues.find((issue) => issue.localId === "BIC-20").acceptanceCriteria =
    missingFinalHash.issues
      .find((issue) => issue.localId === "BIC-20")
      .acceptanceCriteria.map((criterion) =>
        criterion.replace("exact final source hash", "source"),
      );
  assert.throws(() => validatePacket(missingFinalHash, benches), /final hash/);
});

test("validator rejects weak measurement contracts and stale evidence", async () => {
  const { packet, benches } = await loadInputs(ROOT);

  const missingClass = structuredClone(packet);
  missingClass.measurementContracts.machineClasses.pop();
  assert.throws(() => validatePacket(missingClass, benches), /exact canonical machine classes/);

  const tooFewRuns = structuredClone(packet);
  tooFewRuns.measurementContracts.runtimeStartup.measuredRuns = 5;
  assert.throws(() => validatePacket(tooFewRuns, benches), /at least ten measured runs/);

  const excessiveVariance = structuredClone(packet);
  excessiveVariance.measurementContracts.frontend.maxCoefficientOfVariation = 0.5;
  assert.throws(() => validatePacket(excessiveVariance, benches), /coefficient-of-variation limit/);

  const missingBinding = structuredClone(packet);
  missingBinding.measurementContracts.runtimeStartup.requiredBindings =
    missingBinding.measurementContracts.runtimeStartup.requiredBindings.filter(
      (binding) => binding !== "exactSourceHash",
    );
  assert.throws(() => validatePacket(missingBinding, benches), /exact artifact bindings/);

  for (const [contractName, binding] of [
    ["runtimeStartup", "startedAt"],
    ["runtimeStartup", "finishedAt"],
    ["frontend", "browserVersion"],
    ["frontend", "viewport"],
  ]) {
    const mutation = structuredClone(packet);
    mutation.measurementContracts[contractName].requiredBindings = mutation.measurementContracts[
      contractName
    ].requiredBindings.filter((value) => value !== binding);
    assert.throws(() => validatePacket(mutation, benches), /exact artifact bindings/);
  }

  for (const contractName of ["runtimeStartup", "frontend"]) {
    const missingClassBinding = structuredClone(packet);
    missingClassBinding.measurementContracts[contractName].machineClassIds = [];
    assert.throws(
      () => validatePacket(missingClassBinding, benches),
      /exact machine class bindings/,
    );

    const missingCacheState = structuredClone(packet);
    missingCacheState.measurementContracts[contractName].cacheBuildStates = [];
    assert.throws(
      () => validatePacket(missingCacheState, benches),
      /exact nonempty cache\/build states/,
    );
  }

  const placeholderClass = structuredClone(packet);
  placeholderClass.measurementContracts.machineClasses =
    placeholderClass.measurementContracts.machineClasses
      .filter(({ id }) => id !== "runtime-reference-cpu")
      .concat({
        id: "placeholder",
        osClass: "unknown",
        minLogicalCpu: 1,
        minMemoryMiB: 1,
        gpuAllowed: false,
        browser: null,
      });
  placeholderClass.measurementContracts.runtimeStartup.machineClassIds = [];
  assert.throws(() => validatePacket(placeholderClass, benches), /exact canonical machine classes/);

  for (const contractName of ["runtime", "frontend"]) {
    const missingFinalContractManifest = structuredClone(packet);
    const finalIssue = missingFinalContractManifest.issues.find(
      ({ localId }) => localId === "BIC-20",
    );
    finalIssue.artifactPaths = finalIssue.artifactPaths.filter(
      (value) => value !== `output/bic/bic-20/${contractName}-performance-final.run-manifest.json`,
    );
    assert.throws(
      () => validatePacket(missingFinalContractManifest, benches),
      new RegExp(
        `missing exact ${contractName === "runtime" ? "runtimeStartup" : "frontend"} artifact`,
      ),
    );
  }

  const staleAllowed = structuredClone(packet);
  staleAllowed.measurementContracts.freshness.staleArtifactReuseAllowed = true;
  assert.throws(() => validatePacket(staleAllowed, benches), /measurement freshness/);

  const missingManifest = structuredClone(packet);
  const bic11 = missingManifest.issues.find(({ localId }) => localId === "BIC-11");
  bic11.artifactPaths = bic11.artifactPaths.filter(
    (value) => !value.endsWith(".run-manifest.json"),
  );
  assert.throws(
    () => validatePacket(missingManifest, benches),
    /BIC-11: missing run-manifest artifact/,
  );

  const staleFinal = structuredClone(packet);
  const bic20 = staleFinal.issues.find(({ localId }) => localId === "BIC-20");
  bic20.acceptanceCriteria = bic20.acceptanceCriteria.filter(
    (criterion) => !/exact final batch bytes/.test(criterion),
  );
  assert.throws(() => validatePacket(staleFinal, benches), /fresh final-byte reruns/);
});

test("validator rejects canonical flow/route/state scope drift", async () => {
  const { packet, benches, flowManifest, flowCoverage } = await loadInputs(ROOT);
  const routeDrift = structuredClone(packet);
  const routeOwner = routeDrift.issues.find(
    (issue) => issue.localId >= "BIC-04" && issue.localId <= "BIC-10" && issue.routePatterns.length,
  );
  routeOwner.routePatterns.pop();
  assert.throws(
    () => validatePacket(routeDrift, benches, flowManifest, flowCoverage),
    /routePatterns: issues must exactly own the canonical inventory once/,
  );

  const stateDrift = structuredClone(packet);
  const stateOwner = stateDrift.issues.find(
    (issue) => issue.localId >= "BIC-04" && issue.localId <= "BIC-10" && issue.stateSymbols.length,
  );
  stateOwner.stateSymbols.pop();
  assert.throws(
    () => validatePacket(stateDrift, benches, flowManifest, flowCoverage),
    /stateSymbols: issues must exactly own the canonical inventory once/,
  );
});

test("validator rejects ownership overlap across all 20 issues", async () => {
  const { packet, benches, flowManifest, flowCoverage } = await loadInputs(ROOT);
  for (const field of ["flowIds", "routePatterns", "stateSymbols"]) {
    const overlap = structuredClone(packet);
    const source = overlap.issues.find((issue) => issue[field].length > 0);
    const target = overlap.issues.find(
      (issue) => issue.localId !== source.localId && issue[field].length === 0,
    );
    target[field].push(source[field][0]);
    assert.throws(
      () => validatePacket(overlap, benches, flowManifest, flowCoverage),
      new RegExp(`${field}: issue ownership must not overlap`),
    );
  }
});

test("validator rejects transition threshold and manifest/report drift", async () => {
  const { packet, benches, flowManifest, flowCoverage } = await loadInputs(ROOT);
  for (const [field, value, error] of [
    ["expectedTransitionCount", 676, /must equal canonical manifest transitions/],
    ["maxUnsupportedCoveredTransitionClaims", 1, /must be zero/],
    ["maxUnclassifiedTransitionEvidence", 1, /must be zero/],
  ]) {
    const mutation = structuredClone(packet);
    mutation.thresholdCatalog.flowRegistry[field] = value;
    assert.throws(() => validatePacket(mutation, benches, flowManifest, flowCoverage), error);
  }

  const reportDrift = structuredClone(flowCoverage);
  reportDrift.transitionCount -= 1;
  assert.throws(
    () => validatePacket(packet, benches, flowManifest, reportDrift),
    /flow coverage report drift for transitionCount/,
  );

  const manifestDrift = structuredClone(flowManifest);
  manifestDrift.flows[0].plannedEvidence[0].transitionIds.pop();
  assert.throws(
    () => validatePacket(packet, benches, manifestDrift, flowCoverage),
    /every canonical transition must be classified/,
  );
});

test("parity check fails closed on hand-edited Markdown", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "linear-batch-parity-"));
  try {
    await Promise.all([
      writeFile(
        path.join(temporaryRoot, "packet.json"),
        await readFile(path.join(ROOT, DEFAULT_JSON_PATH), "utf8"),
      ),
      writeFile(
        path.join(temporaryRoot, "thresholds.json"),
        await readFile(path.join(ROOT, "benches/thresholds.json"), "utf8"),
      ),
    ]);
    const { packet, benches } = await loadInputs(ROOT);
    assert.notEqual(
      `${renderMarkdown(packet, benches)}manual edit\n`,
      renderMarkdown(packet, benches),
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
});
