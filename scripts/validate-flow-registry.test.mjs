import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  caseHasFlowAssertion,
  discoverDirectRoutes,
  discoverStateSymbols,
  executableCaseBodies,
  renderMermaid,
  sourceDeclaresSymbol,
  validateFlowRegistry,
} from "./validate-flow-registry.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "docs/flows/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const discoveredRoutes = await discoverDirectRoutes(repoRoot);
const clone = () => structuredClone(manifest);

function manifestWithCoveredEvidence(relativePath, testName) {
  const candidate = clone();
  const flow = candidate.flows.find((entry) =>
    entry.plannedEvidence.some(({ transitionIds }) => transitionIds.length > 0),
  );
  const planned = flow.plannedEvidence.find(({ transitionIds }) => transitionIds.length > 0);
  const transitionId = planned.transitionIds[0];
  planned.transitionIds = planned.transitionIds.filter((id) => id !== transitionId);
  flow.plannedEvidence = flow.plannedEvidence.filter(
    ({ transitionIds }) => transitionIds.length > 0,
  );
  flow.testEvidence.push({
    path: relativePath,
    proves: "adversarial canonical-runner selection fixture",
    testCases: [{ name: testName, transitionIds: [transitionId] }],
  });
  return { candidate, flow, transitionId };
}

async function withRepositoryFixture(relativePath, source, callback, cleanupDirectory = false) {
  const absolutePath = path.join(repoRoot, relativePath);
  await assert.rejects(() => readFile(absolutePath, "utf8"), { code: "ENOENT" });
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source);
  try {
    await callback();
  } finally {
    await rm(cleanupDirectory ? path.dirname(absolutePath) : absolutePath, {
      recursive: cleanupDirectory,
      force: true,
    });
  }
}

test("canonical flow registry validates current routes, states, evidence, and semantics", async () => {
  await assert.doesNotReject(() => validateFlowRegistry(clone(), { discoveredRoutes, repoRoot }));
});

test("TypeScript AST evidence accepts only direct calls in actual test callbacks", () => {
  const marker = "FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry";
  const source = [
    `import { describe, test, test as importedAlias } from "node:test";`,
    `// test("line-comment fake", () => { flowAssert("${marker}"); });`,
    `/* test("block-comment fake", () => { flowAssert("${marker}"); }); */`,
    `const ordinary = 'test("ordinary-string fake", () => { flowAssert("${marker}"); })';`,
    `const template = \`test("template fake", () => { flowAssert("${marker}"); })\`;`,
    `const helper = () => { flowAssert("${marker}"); };`,
    `function hidden() { test("nested declaration fake", () => { flowAssert("${marker}"); }); }`,
    `test("target", () => {`,
    `  // flowAssert("${marker}");`,
    `  /* flowAssert("${marker}"); */`,
    `  const text = 'flowAssert("${marker}")';`,
    `  const templateText = \`flowAssert("${marker}")\`;`,
    `  const regex = /flowAssert\\("${marker}"\\)/;`,
    `  const local = () => { flowAssert("${marker}"); };`,
    `  function nested() { flowAssert("${marker}"); }`,
    `  const object = { unused() { flowAssert("${marker}"); } };`,
    `  class Deferred { unused() { flowAssert("${marker}"); } }`,
    `  void text; void templateText; void regex; void local; void nested; void object; void Deferred;`,
    `});`,
    `describe("suite", () => { test("direct", () => { flowAssert("${marker}"); }); });`,
    `importedAlias("imported alias", () => { flowAssert("${marker}"); });`,
    `test("sibling", () => { flowAssert("${marker}"); });`,
  ].join("\n");
  const bodies = executableCaseBodies("scripts/fixture.test.mjs", source);
  for (const name of [
    "line-comment fake",
    "block-comment fake",
    "ordinary-string fake",
    "template fake",
    "nested declaration fake",
  ])
    assert.equal(bodies.has(name), false, name);
  assert.equal(
    caseHasFlowAssertion("scripts/fixture.test.mjs", bodies.get("target"), marker),
    false,
  );
  assert.equal(
    caseHasFlowAssertion("scripts/fixture.test.mjs", bodies.get("direct"), marker),
    true,
  );
  assert.equal(
    caseHasFlowAssertion("scripts/fixture.test.mjs", bodies.get("imported alias"), marker),
    true,
  );
  assert.equal(
    caseHasFlowAssertion("scripts/fixture.test.mjs", bodies.get("sibling"), marker),
    true,
  );
});

test("TypeScript AST evidence rejects unreachable assertions and non-runner registrations", () => {
  const marker = "FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry";
  const source = [
    `import { describe, test } from "node:test";`,
    `test("after return", () => { return; flowAssert("${marker}"); });`,
    `test("after throw", () => { throw new Error("stop"); flowAssert("${marker}"); });`,
    `test("if false", () => { if (false) { flowAssert("${marker}"); } });`,
    `test("both branches terminate", () => { if (condition) { return; } else { throw new Error("stop"); } flowAssert("${marker}"); });`,
    `test("unsupported before assertion", () => { while (condition) {} flowAssert("${marker}"); });`,
    `test("reachable branch", () => { if (condition) { flowAssert("${marker}"); } });`,
    `describe("registration return", () => { return; test("registration after return", () => { flowAssert("${marker}"); }); });`,
    `if (false) { test("registration if false", () => { flowAssert("${marker}"); }); }`,
    `describe("shadow scope", () => { const test = (...args) => void args; test("shadowed inner", () => { flowAssert("${marker}"); }); });`,
    `describe("unsupported registration", () => { while (condition) {} test("registration after unsupported", () => { flowAssert("${marker}"); }); });`,
  ].join("\n");
  const bodies = executableCaseBodies("scripts/fixture.test.mjs", source);
  for (const name of [
    "registration after return",
    "registration if false",
    "shadowed inner",
    "registration after unsupported",
  ])
    assert.equal(bodies.has(name), false, name);
  for (const name of [
    "after return",
    "after throw",
    "if false",
    "both branches terminate",
    "unsupported before assertion",
  ])
    assert.equal(
      caseHasFlowAssertion("scripts/fixture.test.mjs", bodies.get(name), marker),
      false,
      name,
    );
  assert.equal(
    caseHasFlowAssertion("scripts/fixture.test.mjs", bodies.get("reachable branch"), marker),
    true,
  );

  const shadowedGlobal = [
    `const test = (...args) => void args;`,
    `test("shadowed configured global", () => { flowAssert("${marker}"); });`,
  ].join("\n");
  assert.equal(
    executableCaseBodies("frontend/src/fixture.test.ts", shadowedGlobal).has(
      "shadowed configured global",
    ),
    false,
  );
  const configuredGlobal = `it("configured global", () => { flowAssert("${marker}"); });`;
  const globalBodies = executableCaseBodies("frontend/src/fixture.test.ts", configuredGlobal);
  assert.equal(globalBodies.has("configured global"), true);
  assert.equal(
    caseHasFlowAssertion(
      "frontend/src/fixture.test.ts",
      globalBodies.get("configured global"),
      marker,
    ),
    true,
  );
});

test("Go AST evidence rejects comments, strings, and nested function literals", () => {
  const marker = "FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry";
  const goSource = `package sample
import "testing"
// func TestLineFake(t *testing.T) { flowAssert(t, "${marker}") }
/* func TestBlockFake(t *testing.T) { flowAssert(t, "${marker}") } */
var ordinary = "func TestOrdinaryFake(t *testing.T) {}"
var raw = \`func TestRawFake(t *testing.T) { flowAssert(t, "${marker}") }\`
func helper(t *testing.T) { flowAssert(t, "${marker}") }
func TestTarget(t *testing.T) {
  // flowAssert(t, "${marker}")
  /* flowAssert(t, "${marker}") */
  text := "flowAssert(t, '${marker}')"
  rawText := \`flowAssert(t, "${marker}")\`
  local := func() { flowAssert(t, "${marker}") }
  t.Log(text, rawText, local)
}
func TestDirect(t *testing.T) { flowAssert(t, "${marker}") }
func TestAfterReturn(t *testing.T) { return; flowAssert(t, "${marker}") }
func TestIfFalse(t *testing.T) { if false { flowAssert(t, "${marker}") } }
func TestBothBranchesTerminate(t *testing.T) {
  if condition { return } else { panic("stop") }
  flowAssert(t, "${marker}")
}
func TestUnsupportedBeforeAssertion(t *testing.T) {
  for condition {}
  flowAssert(t, "${marker}")
}
func TestReachableBranch(t *testing.T) { if condition { flowAssert(t, "${marker}") } }
`;
  const goBodies = executableCaseBodies("fixture_test.go", goSource);
  for (const name of ["TestLineFake", "TestBlockFake", "TestOrdinaryFake", "TestRawFake"])
    assert.equal(goBodies.has(name), false, name);
  assert.equal(caseHasFlowAssertion("fixture_test.go", goBodies.get("TestTarget"), marker), false);
  assert.equal(caseHasFlowAssertion("fixture_test.go", goBodies.get("TestDirect"), marker), true);
  for (const name of [
    "TestAfterReturn",
    "TestIfFalse",
    "TestBothBranchesTerminate",
    "TestUnsupportedBeforeAssertion",
  ])
    assert.equal(caseHasFlowAssertion("fixture_test.go", goBodies.get(name), marker), false, name);
  assert.equal(
    caseHasFlowAssertion("fixture_test.go", goBodies.get("TestReachableBranch"), marker),
    true,
  );
});

test("v8 TypeScript static truthiness, casts, comparisons, and short-circuit branches fail closed", () => {
  const marker = "FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry";
  const source = [
    `import { test } from "node:test";`,
    `if (0) { test("registration under zero", () => { flowAssert("${marker}"); }); }`,
    `test("if zero", () => { if (0) { flowAssert("${marker}"); } });`,
    `test("cast false", () => { if (false as boolean) { flowAssert("${marker}"); } });`,
    `test("comparison false", () => { if (1 === 2) { flowAssert("${marker}"); } });`,
    `test("short circuit", () => { 0 && flowAssert("${marker}"); });`,
    `test("reachable comparison", () => { if (2 > 1) { flowAssert("${marker}"); } });`,
  ].join("\n");
  const bodies = executableCaseBodies("scripts/fixture.test.mjs", source);
  assert.equal(bodies.has("registration under zero"), false);
  for (const name of ["if zero", "cast false", "comparison false", "short circuit"])
    assert.equal(
      caseHasFlowAssertion("scripts/fixture.test.mjs", bodies.get(name), marker),
      false,
      name,
    );
  assert.equal(
    caseHasFlowAssertion("scripts/fixture.test.mjs", bodies.get("reachable comparison"), marker),
    true,
  );
});

test("v9 evidence selection follows exact canonical TypeScript runner includes", () => {
  const marker = "FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry";
  const source = `import { test } from "node:test"; test("fake", () => { flowAssert("${marker}"); });`;
  for (const relativePath of [
    "scripts/not-a-test.mjs",
    "scripts/fake.spec.mjs",
    "docs/fake.test.mjs",
    "packages/schema/test/deep/fake.test.mjs",
  ])
    assert.equal(executableCaseBodies(relativePath, source).size, 0, relativePath);
  for (const relativePath of [
    "scripts/real.test.mjs",
    "scripts/deep/real.test.mjs",
    "packages/schema/test/real.test.mjs",
  ])
    assert.equal(executableCaseBodies(relativePath, source).has("fake"), true, relativePath);

  const frontendSource = `it("configured global", () => { flowAssert("${marker}"); });`;
  assert.equal(
    executableCaseBodies("frontend/src/deep/real.spec.tsx", frontendSource).has(
      "configured global",
    ),
    true,
  );
});

test("full validator rejects TypeScript evidence outside exact canonical runner includes", async () => {
  const fixtures = [
    "docs/fake.test.mjs",
    "scripts/fake.spec.mjs",
    "packages/schema/test/deep/fake.test.mjs",
  ];
  for (const relativePath of fixtures) {
    const { candidate, flow, transitionId } = manifestWithCoveredEvidence(relativePath, "fake");
    const marker = `FLOW_ASSERT:${flow.id}:${transitionId}`;
    const source = `import { test } from "node:test"; test("fake", () => { flowAssert("${marker}"); });`;
    await withRepositoryFixture(
      relativePath,
      source,
      async () => {
        await assert.rejects(
          () => validateFlowRegistry(candidate, { discoveredRoutes, repoRoot }),
          new RegExp(
            `${relativePath.replaceAll("/", "\\/")} is not selected by a canonical test runner`,
          ),
        );
      },
      relativePath === "packages/schema/test/deep/fake.test.mjs",
    );
  }
});

test("full validator rejects GOOS and legacy-build-excluded Go evidence", async () => {
  if (process.platform !== "linux") return;
  const fixtures = [
    {
      path: "backend/internal/fake_windows_test.go",
      prefix: "",
      name: "TestWindowsFake",
    },
    {
      path: "backend/internal/fake_legacy_test.go",
      prefix: "// +build linux,!linux\n\n",
      name: "TestLegacyFake",
    },
  ];
  for (const fixture of fixtures) {
    const { candidate, flow, transitionId } = manifestWithCoveredEvidence(
      fixture.path,
      fixture.name,
    );
    const marker = `FLOW_ASSERT:${flow.id}:${transitionId}`;
    const source = `${fixture.prefix}package internal\nimport "testing"\nfunc ${fixture.name}(t *testing.T) { flowAssert(t, "${marker}") }\n`;
    await withRepositoryFixture(fixture.path, source, async () => {
      await assert.rejects(
        () => validateFlowRegistry(candidate, { discoveredRoutes, repoRoot }),
        new RegExp(
          `${fixture.path.replaceAll("/", "\\/")} is not selected by a canonical test runner`,
        ),
      );
    });
  }
});

test("state-symbol discovery and required checks use TypeScript and Go declarations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "flow-symbol-ast-"));
  try {
    await Promise.all([
      mkdir(path.join(root, "frontend"), { recursive: true }),
      mkdir(path.join(root, "backend"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        path.join(root, "frontend/states.ts"),
        [
          "export type RealState = { value: string };",
          'export const RealStatus = "ready";',
          "/* export interface BlockState { value: string } */",
          "const ordinary = 'export enum OrdinaryPhase { Ready }';",
          "const template = `export class TemplateState {}`;",
        ].join("\n"),
      ),
      writeFile(
        path.join(root, "frontend/view.tsx"),
        [
          'export interface ViewState { mode: "ready" }',
          'const ordinary = "export type TsxStringState = string";',
        ].join("\n"),
      ),
      writeFile(
        path.join(root, "backend/states.go"),
        [
          "package fixture",
          "type RealPhase struct{}",
          "/* type BlockPhase struct{} */",
          'var ordinary = "type OrdinaryStatus string"',
          "var raw = `type RawState struct{}`",
        ].join("\n"),
      ),
    ]);
    const policy = {
      roots: ["frontend", "backend"],
      frontendExtensions: [".ts", ".tsx"],
      backendExtensions: [".go"],
      exportedNameSuffixes: ["State", "Status", "Phase"],
      excludeTestFiles: false,
    };
    assert.deepEqual(await discoverStateSymbols(root, policy), [
      "backend/states.go#RealPhase",
      "frontend/states.ts#RealState",
      "frontend/states.ts#RealStatus",
      "frontend/view.tsx#ViewState",
    ]);
    for (const symbol of [
      "frontend/states.ts#BlockState",
      "frontend/states.ts#OrdinaryPhase",
      "frontend/states.ts#TemplateState",
      "frontend/view.tsx#TsxStringState",
      "backend/states.go#BlockPhase",
      "backend/states.go#OrdinaryStatus",
      "backend/states.go#RawState",
    ])
      assert.equal(await sourceDeclaresSymbol(root, symbol), false, symbol);
    for (const symbol of [
      "frontend/states.ts#RealState",
      "frontend/states.ts#RealStatus",
      "frontend/view.tsx#ViewState",
      "backend/states.go#RealPhase",
    ])
      assert.equal(await sourceDeclaresSymbol(root, symbol), true, symbol);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validator rejects unowned and duplicate route ownership", async () => {
  await assert.rejects(
    () =>
      validateFlowRegistry(clone(), {
        discoveredRoutes: [...discoveredRoutes, "GET /api/injected"],
        repoRoot,
      }),
    /route inventory mismatch/,
  );

  const duplicate = clone();
  duplicate.flows[1].routePatterns.push(duplicate.flows[0].routePatterns[0] ?? "GET /api/health");
  await assert.rejects(
    () => validateFlowRegistry(duplicate, { discoveredRoutes, repoRoot }),
    /duplicate route owner/,
  );
});

test("validator rejects generic labels and missing transition branches", async () => {
  const generic = clone();
  generic.flows[0].states[0].label = "perform bounded work";
  generic.flows[0].diagram = renderMermaid(generic.flows[0]);
  await assert.rejects(
    () => validateFlowRegistry(generic, { discoveredRoutes, repoRoot }),
    /generic label/,
  );

  const branchless = clone();
  branchless.flows[0].transitions = branchless.flows[0].transitions.filter(
    ({ branch }) => branch !== "cleanup",
  );
  branchless.flows[0].diagram = renderMermaid(branchless.flows[0]);
  await assert.rejects(
    () => validateFlowRegistry(branchless, { discoveredRoutes, repoRoot }),
    /missing transition branch cleanup/,
  );
});

test("validator rejects universal semantic templates and duplicate state owners", async () => {
  const universal = clone();
  const source = universal.flows[0];
  const cloneTargets = universal.flows
    .filter(
      (flow) =>
        ![source.id, "APP-FIRST-RUN-001", "PREVIEW-001", "PLAYBACK-001", "UI-MEMORY-001"].includes(
          flow.id,
        ),
    )
    .slice(0, 3);
  for (const target of cloneTargets) {
    const stateMap = new Map(
      source.states.map((state, index) => [
        state.id,
        `${target.id.replaceAll("-", "_")}_CLONE_${index}`,
      ]),
    );
    const transitionMap = new Map(
      source.transitions.map((transition, index) => [
        transition.id,
        `${target.id}:T${String(index + 1).padStart(2, "0")}:${transition.branch}`,
      ]),
    );
    target.title = source.title;
    target.architectureFamily = source.architectureFamily;
    target.sharedSubgraphs = structuredClone(source.sharedSubgraphs);
    target.states = source.states.map((state) => ({
      ...structuredClone(state),
      id: stateMap.get(state.id),
    }));
    target.semanticRoles = Object.fromEntries(
      Object.entries(source.semanticRoles).map(([role, stateId]) => [role, stateMap.get(stateId)]),
    );
    target.transitions = source.transitions.map((transition) => ({
      ...structuredClone(transition),
      id: transitionMap.get(transition.id),
      from: stateMap.get(transition.from),
      to: stateMap.get(transition.to),
    }));
    target.requiredDecisions = source.requiredDecisions.map((decision) => ({
      ...structuredClone(decision),
      state: stateMap.get(decision.state),
      outcomes: decision.outcomes.map((outcome) => ({
        ...outcome,
        transitionId: transitionMap.get(outcome.transitionId),
      })),
    }));
    target.semanticInvariants = source.semanticInvariants.map((invariant) =>
      invariant.replaceAll(source.id, target.id),
    );
    target.cancellationPolicy = {
      ...structuredClone(source.cancellationPolicy),
      cancellablePhases: source.cancellationPolicy.cancellablePhases.map((stateId) =>
        stateMap.get(stateId),
      ),
      persistedState: stateMap.get(source.cancellationPolicy.persistedState),
    };
    target.retryPolicy = {
      ...structuredClone(source.retryPolicy),
      identity: source.retryPolicy.identity.replaceAll(source.id, target.id),
    };
    target.commitPoints = source.commitPoints.map((commit) => ({
      ...structuredClone(commit),
      state: stateMap.get(commit.state),
      rollback: commit.rollback.replaceAll(source.id, target.id),
    }));
    target.testEvidence = target.testEvidence.map((entry) => ({
      ...entry,
      testCases: entry.testCases.map((testCase) => ({ ...testCase, transitionIds: [] })),
    }));
    target.plannedEvidence = [
      {
        transitionIds: target.transitions.map(({ id }) => id),
        ownerIssue: target.plannedEvidence[0]?.ownerIssue ?? "BIC-04",
        verificationCommand: "mise exec -- pnpm check",
        reason: "semantic clone fixture",
      },
    ];
    target.diagram = renderMermaid(target);
  }
  await assert.rejects(
    () => validateFlowRegistry(universal, { discoveredRoutes, repoRoot }),
    /universal normalized flow template collision/,
  );

  const duplicateOwner = clone();
  const owned = duplicateOwner.requiredStateSymbols[0];
  const target = duplicateOwner.flows.find((flow) => flow.id !== owned.primaryFlowId);
  const field = owned.symbol.startsWith("frontend/")
    ? "frontendStateSymbols"
    : "backendStateSymbols";
  target[field].push(owned.symbol);
  await assert.rejects(
    () => validateFlowRegistry(duplicateOwner, { discoveredRoutes, repoRoot }),
    /exactly one primary flow owner/,
  );
});

test("validator rejects unknown required state symbols", async () => {
  const unknown = clone();
  const missing = "frontend/src/does-not-exist.ts#MissingState";
  unknown.requiredStateSymbols.push({
    symbol: missing,
    primaryFlowId: unknown.flows[0].id,
  });
  unknown.flows[0].frontendStateSymbols.push(missing);
  await assert.rejects(
    () => validateFlowRegistry(unknown, { discoveredRoutes, repoRoot }),
    /state symbol source declaration is missing/,
  );
});

test("validator rejects missing domain decisions, cancellation drift, and UI-memory authority drift", async () => {
  const missingMilestone = clone();
  delete missingMilestone.flows.find(({ id }) => id === "APP-FIRST-RUN-001").semanticRoles
    .firstReadable;
  await assert.rejects(
    () => validateFlowRegistry(missingMilestone, { discoveredRoutes, repoRoot }),
    /semantic role firstReadable has no canonical state/,
  );

  const missingOutcome = clone();
  missingOutcome.flows.find(({ id }) => id === "PREVIEW-001").requiredDecisions[0].outcomes.pop();
  await assert.rejects(
    () => validateFlowRegistry(missingOutcome, { discoveredRoutes, repoRoot }),
    /must declare at least three outcomes/,
  );

  const cancellationDrift = clone();
  cancellationDrift.flows[0].cancellationPolicy.cancellablePhases.pop();
  await assert.rejects(
    () => validateFlowRegistry(cancellationDrift, { discoveredRoutes, repoRoot }),
    /cancellation phases must exactly equal ordinary cancel-edge sources/,
  );

  const authorityDrift = clone();
  authorityDrift.flows.find(({ id }) => id === "UI-MEMORY-001").states[0].authority = "backend";
  await assert.rejects(
    () => validateFlowRegistry(authorityDrift, { discoveredRoutes, repoRoot }),
    /UI-MEMORY-001 must remain frontend-authoritative/,
  );
});

test("validator rejects missing, stale, and unclassified evidence", async () => {
  const missing = clone();
  missing.flows[0].testEvidence[0].path = "missing/evidence.test.ts";
  await assert.rejects(
    () => validateFlowRegistry(missing, { discoveredRoutes, repoRoot }),
    /missing evidence/,
  );

  const staleCase = clone();
  staleCase.flows[0].testEvidence[0].testCases[0].name = "case that does not exist";
  await assert.rejects(
    () => validateFlowRegistry(staleCase, { discoveredRoutes, repoRoot }),
    /cites missing or ambiguous executable case/,
  );

  const unrelatedClaim = clone();
  const unrelatedFlow = unrelatedClaim.flows[0];
  const claimedTransition = unrelatedFlow.transitions[0].id;
  unrelatedFlow.testEvidence[0].testCases[0].transitionIds = [claimedTransition];
  unrelatedFlow.plannedEvidence[0].transitionIds =
    unrelatedFlow.plannedEvidence[0].transitionIds.filter(
      (transitionId) => transitionId !== claimedTransition,
    );
  await assert.rejects(
    () => validateFlowRegistry(unrelatedClaim, { discoveredRoutes, repoRoot }),
    /lacks executable case-bound flowAssert/,
  );

  const unclassified = clone();
  const flowWithPlan = unclassified.flows.find((flow) => flow.plannedEvidence.length > 0);
  flowWithPlan.plannedEvidence[0].transitionIds.pop();
  await assert.rejects(
    () => validateFlowRegistry(unclassified, { discoveredRoutes, repoRoot }),
    /classify every transition id/,
  );
});
