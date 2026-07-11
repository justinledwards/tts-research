import { execFile, execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";

const execFileAsync = promisify(execFile);

function formatJson(value, filePath) {
  return execFileSync("pnpm", ["exec", "biome", "format", "--stdin-file-path", filePath], {
    cwd: repoRoot,
    encoding: "utf8",
    input: `${JSON.stringify(value, null, 2)}\n`,
    maxBuffer: 16 * 1024 * 1024,
  });
}
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "docs/flows/manifest.json");
const reportPath = path.join(repoRoot, "docs/flows/coverage-report.json");

function fail(message) {
  throw new Error(message);
}

function requireCondition(condition, message) {
  if (!condition) fail(message);
}

function requireNonEmpty(value, label) {
  requireCondition(Array.isArray(value) && value.length > 0, `${label} must be non-empty`);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) (seen.has(value) ? repeated : seen).add(value);
  return [...repeated].sort();
}

export function structuralFlowSignature(flow) {
  const stateAliases = new Map(flow.states.map((state, index) => [state.id, `S${index}`]));
  const transitionById = new Map(flow.transitions.map((transition) => [transition.id, transition]));
  const normalizeText = (value) => {
    let normalized = String(value);
    for (const token of [flow.id, flow.id.replaceAll("-", "_"), flow.title])
      normalized = normalized.replaceAll(token, "<FLOW>");
    return normalized;
  };
  return JSON.stringify({
    architectureFamily: flow.architectureFamily,
    sharedSubgraphs: [...flow.sharedSubgraphs].sort(),
    states: flow.states.map(({ label, kind, authority, uiObservable }) => ({
      label: normalizeText(label),
      kind,
      authority,
      uiObservable: normalizeText(uiObservable),
    })),
    semanticRoles: Object.fromEntries(
      Object.entries(flow.semanticRoles)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([role, stateId]) => [role, stateAliases.get(stateId)]),
    ),
    transitions: flow.transitions
      .map(({ from, to, branch, event, guard }) => ({
        from: stateAliases.get(from),
        to: stateAliases.get(to),
        branch,
        event: normalizeText(event),
        guard: normalizeText(guard),
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    decisions: flow.requiredDecisions.map((decision) => ({
      name: decision.name,
      state: stateAliases.get(decision.state),
      outcomes: decision.outcomes.map((outcome) => {
        const transition = transitionById.get(outcome.transitionId);
        return {
          name: outcome.name,
          branch: transition?.branch,
          to: stateAliases.get(transition?.to),
        };
      }),
    })),
    cancellationPhases: flow.cancellationPolicy.cancellablePhases
      .map((stateId) => stateAliases.get(stateId))
      .sort(),
    retryIdentity: normalizeText(flow.retryPolicy.identity),
    commitEffects: flow.commitPoints.map(({ state, effect, rollback }) => ({
      state: stateAliases.get(state),
      effect: normalizeText(effect),
      rollback: normalizeText(rollback),
    })),
    semanticInvariants: flow.semanticInvariants.map(normalizeText),
  });
}

function mermaidText(value) {
  return String(value).replaceAll('"', "'").replaceAll("\n", " ").trim();
}

export function renderMermaid(flow) {
  const entryStates = flow.states.filter(({ id }) => id === flow.semanticRoles?.requestCaptured);
  const terminalStates = flow.states.filter(({ kind }) => kind.startsWith("terminal-"));
  const lines = ["stateDiagram-v2"];
  for (const state of flow.states)
    lines.push(`  state "${mermaidText(state.label)}" as ${state.id}`);
  for (const state of entryStates) lines.push(`  [*] --> ${state.id}`);
  for (const transition of flow.transitions) {
    lines.push(
      `  ${transition.from} --> ${transition.to}: ${mermaidText(transition.event)} [${mermaidText(transition.guard)}] / ${transition.branch}`,
    );
  }
  for (const state of terminalStates) lines.push(`  ${state.id} --> [*]`);
  return `${lines.join("\n")}\n`;
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderFlowDocuments(manifest) {
  return Object.fromEntries(
    manifest.documents.map((document) => {
      const flows = manifest.flows.filter(({ documentPath }) => documentPath === document.path);
      const sections = flows.map((flow) => {
        const routes =
          flow.routePatterns.length === 0
            ? "- none"
            : flow.routePatterns.map((route) => `- \`${route}\``).join("\n");
        const states = flow.states
          .map(
            (state) =>
              `| \`${state.id}\` | ${markdownCell(state.label)} | \`${state.kind}\` | \`${state.authority}\` | ${markdownCell(state.uiObservable)} |`,
          )
          .join("\n");
        const transitions = flow.transitions
          .map(
            (transition) =>
              `| \`${transition.id}\` | \`${transition.from}\` | \`${transition.to}\` | ${markdownCell(transition.event)} | ${markdownCell(transition.guard)} | \`${transition.branch}\` |`,
          )
          .join("\n");
        const evidence = flow.testEvidence
          .map((entry) => {
            const cases = entry.testCases
              .map(
                (testCase) =>
                  `  - \`${testCase.name}\` — transitions: ${testCase.transitionIds.length === 0 ? "none (source anchor only)" : testCase.transitionIds.map((transitionId) => `\`${transitionId}\``).join(", ")}`,
              )
              .join("\n");
            return `- \`${entry.path}\` — ${entry.proves}\n${cases}`;
          })
          .join("\n");
        const plannedEvidence =
          flow.plannedEvidence.length === 0
            ? "- none"
            : flow.plannedEvidence
                .map(
                  (entry) =>
                    `- ${entry.transitionIds.map((transitionId) => `\`${transitionId}\``).join(", ")} → \`${entry.ownerIssue}\`; verify with \`${entry.verificationCommand}\` — ${entry.reason}`,
                )
                .join("\n");
        const semanticRoles = Object.entries(flow.semanticRoles)
          .map(([role, stateId]) => `- \`${role}\` → \`${stateId}\``)
          .join("\n");
        const decisions = flow.requiredDecisions
          .map(
            (decision) =>
              `- **${decision.name}** at \`${decision.state}\`: ${decision.outcomes.map((outcome) => `\`${outcome.name}\` → \`${outcome.transitionId}\``).join(", ")}`,
          )
          .join("\n");
        const invariants = flow.semanticInvariants.map((invariant) => `- ${invariant}`).join("\n");
        return [
          `## ${flow.id} — ${flow.title}`,
          "",
          `- Primary owner: \`${flow.primaryOwner}\``,
          `- Architecture family: \`${flow.architectureFamily}\``,
          `- Shared subgraphs: ${flow.sharedSubgraphs.map((subgraph) => `\`${subgraph}\``).join(", ")}`,
          `- Secondary owners: ${flow.secondaryOwners.length === 0 ? "none" : flow.secondaryOwners.map((owner) => `\`${owner}\``).join(", ")}`,
          `- Shared concerns: ${flow.sharedConcerns.map((concern) => `\`${concern}\``).join(", ")}`,
          "",
          "### Route ownership",
          "",
          routes,
          "",
          "### State contract",
          "",
          "| State | Label | Kind | Authority | UI observable |",
          "| --- | --- | --- | --- | --- |",
          states,
          "",
          "### Semantic roles",
          "",
          semanticRoles,
          "",
          "### Required decisions",
          "",
          decisions.length === 0 ? "- none" : decisions,
          "",
          "### Family and flow invariants",
          "",
          invariants,
          "",
          "### Transitions",
          "",
          "| ID | From | To | Event | Guard | Branch |",
          "| --- | --- | --- | --- | --- | --- |",
          transitions,
          "",
          "### Evidence",
          "",
          evidence,
          "",
          "### Planned transition evidence",
          "",
          plannedEvidence,
          "",
          "### Mermaid",
          "",
          "```mermaid",
          flow.diagram.trimEnd(),
          "```",
        ].join("\n");
      });
      return [
        document.path,
        [
          `# ${document.title}`,
          "",
          document.description,
          "",
          "Generated from `manifest.json` by `pnpm validate:flows`; do not hand-edit.",
          "",
          ...sections,
          "",
        ].join("\n"),
      ];
    }),
  );
}

export function renderFlowReadme(manifest, report) {
  return `# TTS-Research application flow registry

Status: \`${manifest.status}\`

This registry is the canonical candidate architecture map for **${report.flowCount} primary flows**. The current Go AST inventory contains **${report.directRouteCount} HTTP routes** with exactly one declared primary flow owner and **${report.requiredStateSymbolCount} required implementation-state symbols**.

## Canonical and generated files

- \`manifest.json\` — canonical contracts, ownership, state machines, trust boundaries, and evidence claims.
${manifest.documents.map(({ path }) => `- \`${path}\` — generated state tables, transition tables, and Mermaid diagrams.`).join("\n")}
- \`coverage-report.json\` — generated exact counts and inventory summary.

\`pnpm validate:flows\` fails on semantic schema violations, universal normalized templates, route/state/evidence drift, or byte drift in any generated document, README, or report. \`pnpm validate:flows -- --write\` regenerates derived artifacts only after the canonical contracts pass validation.

## Approval status

The candidate remains blocked from Linear creation until the archive-first ChatGPT gate returns \`AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH\`. Passing repository validators does not substitute for that advisory gate or PO verification.
`;
}

async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(entryPath)));
    else files.push(entryPath);
  }
  return files;
}

function tsScriptKind(relativePath) {
  if (relativePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (relativePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (relativePath.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function parseTsSource(relativePath, source) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    tsScriptKind(relativePath),
  );
  requireCondition(
    sourceFile.parseDiagnostics.length === 0,
    `cannot parse ${relativePath}: ${sourceFile.parseDiagnostics
      .map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, " "))
      .join("; ")}`,
  );
  return sourceFile;
}

function hasExportModifier(node) {
  return Boolean(node.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword));
}

function bindingNames(name, result) {
  if (ts.isIdentifier(name)) {
    result.push(name.text);
    return;
  }
  for (const element of name.elements)
    if (!ts.isOmittedExpression(element)) bindingNames(element.name, result);
}

function tsDeclarations(sourceFile) {
  const declarations = [];
  for (const statement of sourceFile.statements) {
    const exported = hasExportModifier(statement);
    if (ts.isTypeAliasDeclaration(statement))
      declarations.push({ name: statement.name.text, kind: "type", exported });
    else if (ts.isInterfaceDeclaration(statement))
      declarations.push({ name: statement.name.text, kind: "interface", exported });
    else if (ts.isEnumDeclaration(statement))
      declarations.push({ name: statement.name.text, kind: "enum", exported });
    else if (ts.isClassDeclaration(statement) && statement.name)
      declarations.push({ name: statement.name.text, kind: "class", exported });
    else if (ts.isFunctionDeclaration(statement) && statement.name)
      declarations.push({ name: statement.name.text, kind: "function", exported });
    else if (ts.isVariableStatement(statement)) {
      const kind =
        statement.declarationList.flags & ts.NodeFlags.Const
          ? "const"
          : statement.declarationList.flags & ts.NodeFlags.Let
            ? "let"
            : "var";
      for (const declaration of statement.declarationList.declarations) {
        const names = [];
        bindingNames(declaration.name, names);
        for (const name of names) declarations.push({ name, kind, exported });
      }
    }
  }
  return declarations;
}

const goAstCache = new Map();

function goCacheKey(relativePath, source) {
  return `${relativePath}\0${source}`;
}

function parseGoSource(relativePath, source) {
  const key = goCacheKey(relativePath, source);
  if (goAstCache.has(key)) return goAstCache.get(key);
  const stdout = execFileSync(
    "go",
    ["run", "./cmd/flow-symbol-inventory", "--stdin-path", relativePath],
    {
      cwd: path.join(repoRoot, "backend"),
      encoding: "utf8",
      input: source,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const inventory = JSON.parse(stdout);
  requireCondition(
    inventory.schemaVersion === "tts-research.go-source-inventory.v1" &&
      inventory.files.length === 1,
    "unexpected Go source-inventory schema",
  );
  goAstCache.set(key, inventory.files[0]);
  return inventory.files[0];
}

const repositoryGoAstCache = new Map();

async function parseRepositoryGoSource(root, relativePath, source) {
  const key = `${path.resolve(root)}\0${goCacheKey(relativePath, source)}`;
  if (repositoryGoAstCache.has(key)) return repositoryGoAstCache.get(key);
  const { stdout } = await execFileAsync(
    "go",
    ["run", "./cmd/flow-symbol-inventory", "--root", root, "--file", relativePath],
    { cwd: path.join(repoRoot, "backend"), maxBuffer: 16 * 1024 * 1024 },
  );
  const inventory = JSON.parse(stdout);
  requireCondition(
    inventory.schemaVersion === "tts-research.go-source-inventory.v1" &&
      inventory.files.length <= 1,
    "unexpected Go source-inventory schema",
  );
  const result = inventory.files[0];
  repositoryGoAstCache.set(key, result);
  return result;
}

async function parseGoFiles(root, filesWithSource) {
  const uncached = filesWithSource.filter(
    ({ relativePath, source }) => !goAstCache.has(goCacheKey(relativePath, source)),
  );
  if (uncached.length === 0) return;
  const { stdout } = await execFileAsync(
    "go",
    [
      "run",
      "./cmd/flow-symbol-inventory",
      "--root",
      root,
      ...uncached.flatMap(({ relativePath }) => ["--file", relativePath]),
    ],
    { cwd: path.join(repoRoot, "backend"), maxBuffer: 16 * 1024 * 1024 },
  );
  const inventory = JSON.parse(stdout);
  requireCondition(
    inventory.schemaVersion === "tts-research.go-source-inventory.v1",
    "unexpected Go source-inventory schema",
  );
  const byPath = new Map(inventory.files.map((file) => [file.path, file]));
  for (const { relativePath, source } of uncached) {
    requireCondition(
      Boolean(byPath.get(relativePath)),
      `Go source inventory omitted ${relativePath}`,
    );
    goAstCache.set(goCacheKey(relativePath, source), byPath.get(relativePath));
  }
}

export async function discoverStateSymbols(root = repoRoot, policy) {
  const symbols = [];
  const goFiles = [];
  for (const relativeRoot of policy.roots) {
    const absoluteRoot = path.join(root, relativeRoot);
    for (const file of await walkFiles(absoluteRoot)) {
      const extension = path.extname(file);
      const frontend = policy.frontendExtensions.includes(extension);
      const backend = policy.backendExtensions.includes(extension);
      if (!frontend && !backend) continue;
      if (
        policy.excludeTestFiles &&
        (file.endsWith(".test.ts") || file.endsWith(".test.tsx") || file.endsWith("_test.go"))
      )
        continue;
      const relativePath = path.relative(root, file).split(path.sep).join("/");
      const source = await readFile(file, "utf8");
      if (backend) {
        goFiles.push({ relativePath, source });
        continue;
      }
      for (const declaration of tsDeclarations(parseTsSource(relativePath, source))) {
        if (
          declaration.exported &&
          ["type", "interface", "enum", "const", "class"].includes(declaration.kind) &&
          /^[A-Z]/.test(declaration.name) &&
          policy.exportedNameSuffixes.some((suffix) => declaration.name.endsWith(suffix))
        )
          symbols.push(`${relativePath}#${declaration.name}`);
      }
    }
  }
  await parseGoFiles(root, goFiles);
  for (const { relativePath, source } of goFiles) {
    const inventory = goAstCache.get(goCacheKey(relativePath, source));
    for (const declaration of inventory.declarations) {
      if (
        declaration.kind === "type" &&
        /^[A-Z]/.test(declaration.name) &&
        policy.exportedNameSuffixes.some((suffix) => declaration.name.endsWith(suffix))
      )
        symbols.push(`${relativePath}#${declaration.name}`);
    }
  }
  return [...new Set(symbols)].sort();
}

function literalTestName(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

const tsRunnerExports = new Map([
  [
    "node:test",
    new Map([
      ...["test", "it"].map((name) => [name, "test"]),
      ...["describe", "suite"].map((name) => [name, "suite"]),
    ]),
  ],
  [
    "vitest",
    new Map([
      ...["test", "it"].map((name) => [name, "test"]),
      ...["describe", "suite"].map((name) => [name, "suite"]),
    ]),
  ],
]);

function deferredTsNode(node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  );
}

function tsFunctionScope(node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function tsLexicalScope(node) {
  return (
    ts.isSourceFile(node) || ts.isBlock(node) || ts.isCatchClause(node) || tsFunctionScope(node)
  );
}

function nearestTsScope(node, predicate) {
  for (let current = node.parent; current; current = current.parent)
    if (predicate(current)) return current;
  return undefined;
}

function collectTsBindings(sourceFile) {
  const scopes = new Map([[sourceFile, new Map()]]);
  const add = (scope, name, runnerKind = undefined) => {
    if (!scope) return;
    const bindings = scopes.get(scope) ?? new Map();
    if (bindings.has(name)) bindings.set(name, undefined);
    else bindings.set(name, runnerKind);
    scopes.set(scope, bindings);
  };
  const addNames = (scope, name, runnerKind) => {
    const names = [];
    bindingNames(name, names);
    for (const binding of names) add(scope, binding, runnerKind);
  };
  const visit = (node) => {
    if (tsLexicalScope(node) && !scopes.has(node)) scopes.set(node, new Map());
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const exports = tsRunnerExports.get(node.moduleSpecifier.text);
      const clause = node.importClause;
      if (clause?.name) {
        add(
          sourceFile,
          clause.name.text,
          node.moduleSpecifier.text === "node:test" ? "test" : undefined,
        );
      }
      if (clause?.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            const importedName = (element.propertyName ?? element.name).text;
            add(sourceFile, element.name.text, exports?.get(importedName));
          }
        } else {
          add(sourceFile, clause.namedBindings.name.text);
        }
      }
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      const declarationList = node.parent;
      const blockScoped = Boolean(declarationList.flags & ts.NodeFlags.BlockScoped);
      addNames(
        nearestTsScope(
          node,
          blockScoped
            ? (scope) => ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isCatchClause(scope)
            : (scope) => ts.isSourceFile(scope) || tsFunctionScope(scope),
        ),
        node.name,
      );
    } else if (ts.isParameter(node)) {
      addNames(nearestTsScope(node, tsFunctionScope), node.name);
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      add(
        nearestTsScope(node, (scope) => ts.isSourceFile(scope) || ts.isBlock(scope)),
        node.name.text,
      );
    } else if (ts.isFunctionExpression(node) && node.name) {
      add(node, node.name.text);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      addNames(node, node.variableDeclaration.name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return scopes;
}

function canonicalTsEvidencePath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (normalized !== relativePath || normalized.includes("../") || normalized.startsWith("/"))
    return false;
  // These are the exact includes used by the root/package scripts and the frontend's
  // default Vitest include (frontend/vite.config.ts does not override `test.include`).
  if (/^scripts\/(?:[^/]+\/)*[^/]+\.test\.mjs$/.test(normalized)) return true;
  if (/^adapters\/(?:[^/]+\/)*[^/]+\.test\.js$/.test(normalized)) return true;
  if (/^packages\/(?:schema|sdk-ts|cli)\/test\/[^/]+\.test\.mjs$/.test(normalized)) return true;
  return (
    normalized.startsWith("frontend/") &&
    !/(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(normalized) &&
    /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function configuredTsRunnerKind(relativePath, name) {
  if (!relativePath.startsWith("frontend/") || !canonicalTsEvidencePath(relativePath))
    return undefined;
  if (name === "test" || name === "it") return "test";
  if (name === "describe" || name === "suite") return "suite";
  return undefined;
}

function resolvedTsRunnerKind(identifier, relativePath, scopes) {
  for (let current = identifier.parent; current; current = current.parent) {
    const bindings = scopes.get(current);
    if (bindings?.has(identifier.text)) return bindings.get(identifier.text);
  }
  return configuredTsRunnerKind(relativePath, identifier.text);
}

function tsStaticValue(expression) {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  )
    expression = expression.expression;
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return { known: true, value: true };
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return { known: true, value: false };
  if (expression.kind === ts.SyntaxKind.NullKeyword) return { known: true, value: null };
  if (ts.isNumericLiteral(expression)) return { known: true, value: Number(expression.text) };
  if (ts.isStringLiteralLike(expression)) return { known: true, value: expression.text };
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const operand = tsStaticValue(expression.operand);
    return operand.known ? { known: true, value: !operand.value } : { known: false };
  }
  if (ts.isBinaryExpression(expression)) {
    const left = tsStaticValue(expression.left);
    const operator = expression.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken && left.known && !left.value)
      return { known: true, value: left.value };
    if (operator === ts.SyntaxKind.BarBarToken && left.known && left.value)
      return { known: true, value: left.value };
    const right = tsStaticValue(expression.right);
    if (!left.known || !right.known) return { known: false };
    switch (operator) {
      case ts.SyntaxKind.AmpersandAmpersandToken:
        return { known: true, value: left.value && right.value };
      case ts.SyntaxKind.BarBarToken:
        return { known: true, value: left.value || right.value };
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
      case ts.SyntaxKind.EqualsEqualsToken:
        return { known: true, value: left.value === right.value };
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsToken:
        return { known: true, value: left.value !== right.value };
      case ts.SyntaxKind.LessThanToken:
        return { known: true, value: left.value < right.value };
      case ts.SyntaxKind.LessThanEqualsToken:
        return { known: true, value: left.value <= right.value };
      case ts.SyntaxKind.GreaterThanToken:
        return { known: true, value: left.value > right.value };
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return { known: true, value: left.value >= right.value };
    }
  }
  return { known: false };
}

function tsStaticBool(expression) {
  const result = tsStaticValue(expression);
  return result.known ? Boolean(result.value) : undefined;
}

function reachableTsStatements(statements, visitExpression) {
  for (const statement of statements) {
    if (!reachableTsStatement(statement, visitExpression)) return false;
  }
  return true;
}

function reachableTsStatement(statement, visitExpression) {
  if (ts.isBlock(statement)) return reachableTsStatements(statement.statements, visitExpression);
  if (ts.isExpressionStatement(statement)) {
    visitExpression(statement.expression);
    return true;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations)
      if (declaration.initializer) visitExpression(declaration.initializer);
    return true;
  }
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
    if (statement.expression) visitExpression(statement.expression);
    return false;
  }
  if (ts.isIfStatement(statement)) {
    visitExpression(statement.expression);
    const condition = tsStaticBool(statement.expression);
    if (condition === true) return reachableTsStatement(statement.thenStatement, visitExpression);
    if (condition === false)
      return statement.elseStatement
        ? reachableTsStatement(statement.elseStatement, visitExpression)
        : true;
    const thenContinues = reachableTsStatement(statement.thenStatement, visitExpression);
    const elseContinues = statement.elseStatement
      ? reachableTsStatement(statement.elseStatement, visitExpression)
      : true;
    return thenContinues || elseContinues;
  }
  if (ts.isBreakStatement(statement) || ts.isContinueStatement(statement)) return false;
  if (
    ts.isEmptyStatement(statement) ||
    ts.isDebuggerStatement(statement) ||
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  )
    return true;
  // Loops, switches, try/catch/finally, labels, and with-statements need path-sensitive
  // semantics. Stop the proof here rather than accepting a declaration or assertion they may block.
  return false;
}

function visitReachableTsExpression(node, onCall) {
  if (deferredTsNode(node)) return;
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.AmpersandAmpersandToken ||
      operator === ts.SyntaxKind.BarBarToken
    ) {
      visitReachableTsExpression(node.left, onCall);
      const left = tsStaticBool(node.left);
      if (
        left === undefined ||
        (operator === ts.SyntaxKind.AmpersandAmpersandToken && left) ||
        (operator === ts.SyntaxKind.BarBarToken && !left)
      )
        visitReachableTsExpression(node.right, onCall);
      return;
    }
  }
  if (ts.isConditionalExpression(node)) {
    visitReachableTsExpression(node.condition, onCall);
    const condition = tsStaticBool(node.condition);
    if (condition !== false) visitReachableTsExpression(node.whenTrue, onCall);
    if (condition !== true) visitReachableTsExpression(node.whenFalse, onCall);
    return;
  }
  if (ts.isCallExpression(node)) onCall(node);
  ts.forEachChild(node, (child) => visitReachableTsExpression(child, onCall));
}

function tsExecutableCases(relativePath, source) {
  const sourceFile = parseTsSource(relativePath, source);
  const scopes = collectTsBindings(sourceFile);
  const candidates = [];
  const visitRegistrationExpression = (expression) => {
    if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) return;
    const runnerKind = resolvedTsRunnerKind(expression.expression, relativePath, scopes);
    if (runnerKind === "test") {
      const name = expression.arguments[0] && literalTestName(expression.arguments[0]);
      const callback = expression.arguments[1];
      if (
        name !== undefined &&
        callback &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      )
        candidates.push({ name, callback });
      return;
    }
    if (runnerKind === "suite") {
      const callback = [...expression.arguments]
        .reverse()
        .find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
      if (!callback) return;
      if (ts.isBlock(callback.body))
        reachableTsStatements(callback.body.statements, visitRegistrationExpression);
      else visitRegistrationExpression(callback.body);
    }
  };
  reachableTsStatements(sourceFile.statements, visitRegistrationExpression);
  const cases = new Map();
  const duplicateNames = new Set();
  for (const candidate of candidates) {
    if (cases.has(candidate.name)) duplicateNames.add(candidate.name);
    cases.set(candidate.name, { kind: "typescript", callback: candidate.callback });
  }
  for (const name of duplicateNames) cases.delete(name);
  return cases;
}

export function executableCaseBodies(relativePath, source) {
  if (!relativePath.endsWith(".go")) {
    if (!canonicalTsEvidencePath(relativePath)) return new Map();
    return tsExecutableCases(relativePath, source);
  }
  if (!relativePath.endsWith("_test.go")) return new Map();
  return goExecutableCases(parseGoSource(relativePath, source));
}

function goExecutableCases(inventoryFile) {
  const cases = new Map();
  const duplicates = new Set();
  for (const testCase of inventoryFile?.tests ?? []) {
    if (cases.has(testCase.name)) duplicates.add(testCase.name);
    cases.set(testCase.name, { kind: "go", markers: new Set(testCase.flowAssertions) });
  }
  for (const name of duplicates) cases.delete(name);
  return cases;
}

async function repositoryExecutableCaseBodies(root, relativePath, source) {
  if (!relativePath.endsWith(".go")) {
    if (!canonicalTsEvidencePath(relativePath)) return { selected: false, cases: new Map() };
    return { selected: true, cases: tsExecutableCases(relativePath, source) };
  }
  if (!relativePath.endsWith("_test.go")) return { selected: false, cases: new Map() };
  const inventoryFile = await parseRepositoryGoSource(root, relativePath, source);
  return {
    selected: Boolean(inventoryFile),
    cases: goExecutableCases(inventoryFile),
  };
}

export function caseHasFlowAssertion(_relativePath, body, marker) {
  if (!body) return false;
  if (body.kind === "go") return body.markers.has(marker);
  if (body.kind !== "typescript") return false;
  let found = false;
  const visitExpression = (expression) => {
    visitReachableTsExpression(expression, (call) => {
      if (
        ts.isIdentifier(call.expression) &&
        call.expression.text === "flowAssert" &&
        call.arguments.length === 1 &&
        literalTestName(call.arguments[0]) === marker
      )
        found = true;
    });
  };
  if (ts.isBlock(body.callback.body))
    reachableTsStatements(body.callback.body.statements, visitExpression);
  else visitExpression(body.callback.body);
  return found;
}

export async function sourceDeclaresSymbol(root, symbol) {
  const separator = symbol.lastIndexOf("#");
  if (separator <= 0 || separator === symbol.length - 1) return false;
  const relativePath = symbol.slice(0, separator);
  const name = symbol.slice(separator + 1);
  const source = await readFile(path.join(root, relativePath), "utf8").catch(() => "");
  if (!source) return false;
  const declarations = relativePath.endsWith(".go")
    ? parseGoSource(relativePath, source).declarations
    : tsDeclarations(parseTsSource(relativePath, source));
  return declarations.some((declaration) => declaration.name === name);
}

export async function discoverDirectRoutes(root = repoRoot) {
  const backendRoot = path.join(root, "backend");
  const { stdout } = await execFileAsync(
    "go",
    ["run", "./cmd/flow-route-inventory", "--root", "internal/httpapi"],
    { cwd: backendRoot, maxBuffer: 4 * 1024 * 1024 },
  );
  const inventory = JSON.parse(stdout);
  requireCondition(
    inventory.schemaVersion === "tts-research.route-inventory.v2",
    "unexpected Go route-inventory schema",
  );
  const routes = inventory.routes.map(({ method, path: routePath }) => `${method} ${routePath}`);
  requireCondition(
    duplicates(routes).length === 0,
    `duplicate direct Go route registration: ${duplicates(routes).join(", ")}`,
  );
  return routes.sort();
}

async function evidenceExists(root, relativePath) {
  try {
    return (await stat(path.join(root, relativePath))).isFile();
  } catch {
    return false;
  }
}

export async function validateFlowRegistry(
  manifest,
  { discoveredRoutes, repoRoot: root = repoRoot },
) {
  requireCondition(
    manifest.schemaVersion === "tts-research.flow-registry.v1",
    "unexpected flow registry schemaVersion",
  );
  requireCondition(
    manifest.status === "candidate_pending_chatgpt_v8_recheck",
    "unexpected flow registry status",
  );
  requireCondition(
    manifest.validationCommand === "pnpm validate:flows",
    "unexpected validation command",
  );
  requireCondition(
    Array.isArray(manifest.flows) && manifest.flows.length === 39,
    "expected exactly 39 primary flows",
  );
  requireCondition(
    Array.isArray(manifest.documents) && manifest.documents.length === 3,
    "expected exactly three generated flow documents",
  );
  const documentPaths = manifest.documents.map(({ path: documentPath }) => documentPath);
  requireCondition(
    duplicates(documentPaths).length === 0,
    `duplicate generated document path: ${duplicates(documentPaths).join(", ")}`,
  );
  for (const document of manifest.documents) {
    requireCondition(Boolean(document.title?.trim()), `document ${document.path} has no title`);
    requireCondition(
      Boolean(document.description?.trim()),
      `document ${document.path} has no description`,
    );
    requireCondition(
      path.basename(document.path) === document.path && document.path.endsWith(".md"),
      `unsafe generated document path ${document.path}`,
    );
  }

  const flowIds = manifest.flows.map(({ id }) => id);
  requireCondition(
    duplicates(flowIds).length === 0,
    `duplicate flow id: ${duplicates(flowIds).join(", ")}`,
  );
  const ownerEnum = new Set(manifest.governance.primaryOwnerEnum);
  const stateAuthorityEnum = new Set(manifest.governance.stateAuthorityEnum);
  const concernIds = new Set(manifest.sharedConcerns.map(({ id }) => id));
  requireCondition(
    Array.isArray(manifest.flowFamilies) && manifest.flowFamilies.length === 16,
    "expected exactly 16 declared architecture families",
  );
  const familyById = new Map(manifest.flowFamilies.map((family) => [family.id, family]));
  requireCondition(
    familyById.size === manifest.flowFamilies.length,
    "duplicate architecture family id",
  );
  const sharedSubgraphIds = new Set(manifest.sharedSubgraphs.map(({ id }) => id));
  requireCondition(sharedSubgraphIds.size === 2, "expected two declared shared subgraphs");
  const requiredKinds = new Set(manifest.governance.requiredStateKinds);
  const requiredBranches = manifest.governance.requiredTransitionBranches;
  const deniedLabels = manifest.governance.genericLabelsDenied.map((label) => label.toLowerCase());
  const ownedRoutes = [];
  const declaredSymbols = new Map();
  const stateCounts = [];
  const kindAuthoritySequences = [];
  const rollbackContracts = [];

  for (const flow of manifest.flows) {
    const prefix = `flow ${flow.id}`;
    requireCondition(
      documentPaths.includes(flow.documentPath),
      `${prefix} references unknown generated document ${flow.documentPath}`,
    );
    requireCondition(
      flow.diagram === renderMermaid(flow),
      `${prefix} Mermaid is stale; regenerate from canonical states/transitions`,
    );
    requireCondition(
      Number.isInteger(flow.version) && flow.version >= 1,
      `${prefix} version is invalid`,
    );
    requireCondition(ownerEnum.has(flow.primaryOwner), `${prefix} has unknown primary owner`);
    const family = familyById.get(flow.architectureFamily);
    requireCondition(Boolean(family), `${prefix} has unknown architecture family`);
    requireNonEmpty(flow.sharedSubgraphs, `${prefix} shared subgraphs`);
    for (const subgraph of flow.sharedSubgraphs)
      requireCondition(
        sharedSubgraphIds.has(subgraph),
        `${prefix} has unknown shared subgraph ${subgraph}`,
      );
    requireNonEmpty(flow.semanticInvariants, `${prefix} semantic invariants`);
    requireCondition(
      typeof flow.semanticRoles === "object" && flow.semanticRoles !== null,
      `${prefix} semantic roles must be an object`,
    );
    requireCondition(
      !flow.secondaryOwners.includes(flow.primaryOwner),
      `${prefix} repeats its primary owner as secondary`,
    );
    requireNonEmpty(flow.states, `${prefix} states`);
    requireNonEmpty(flow.transitions, `${prefix} transitions`);
    requireNonEmpty(flow.sharedConcerns, `${prefix} shared concerns`);
    requireCondition(
      Array.isArray(flow.trustBoundaries),
      `${prefix} trust boundaries must be an array`,
    );
    requireNonEmpty(flow.commitPoints, `${prefix} commit points`);
    requireNonEmpty(flow.testEvidence, `${prefix} test evidence`);

    const stateIds = flow.states.map(({ id }) => id);
    requireCondition(duplicates(stateIds).length === 0, `${prefix} has duplicate state ids`);
    const stateSet = new Set(stateIds);
    const requiredSemanticRoles = [
      "requestCaptured",
      "preconditionsChecked",
      "domainWorkActive",
      "durableEffectRecorded",
      "flowCompleted",
      "classifiedFailure",
      "cleanupInProgress",
      "canceledClean",
      "recoveryContextReady",
      ...family.requiredRoles,
    ];
    for (const role of requiredSemanticRoles)
      requireCondition(
        stateSet.has(flow.semanticRoles[role]),
        `${prefix} semantic role ${role} has no canonical state`,
      );
    requireCondition(
      duplicates(Object.values(flow.semanticRoles)).length === 0,
      `${prefix} semantic roles must map to distinct states`,
    );
    const stateKinds = new Set(flow.states.map(({ kind }) => kind));
    for (const kind of requiredKinds)
      requireCondition(stateKinds.has(kind), `${prefix} missing state kind ${kind}`);
    for (const state of flow.states) {
      requireCondition(
        stateAuthorityEnum.has(state.authority),
        `${prefix} state ${state.id} has invalid authority`,
      );
      requireCondition(
        Boolean(state.uiObservable?.trim()),
        `${prefix} state ${state.id} is not UI-observable`,
      );
      requireCondition(
        !deniedLabels.includes(state.label.trim().toLowerCase()),
        `${prefix} contains generic label ${state.label}`,
      );
    }

    const transitionIds = flow.transitions.map(({ id }) => id);
    requireCondition(
      transitionIds.every(
        (transitionId) =>
          typeof transitionId === "string" && transitionId.startsWith(`${flow.id}:T`),
      ),
      `${prefix} has invalid transition ids`,
    );
    requireCondition(
      duplicates(transitionIds).length === 0,
      `${prefix} has duplicate transition ids`,
    );
    const transitionById = new Map(
      flow.transitions.map((transition) => [transition.id, transition]),
    );
    for (const transition of flow.transitions) {
      requireCondition(
        stateSet.has(transition.from),
        `${prefix} transition has unknown from-state ${transition.from}`,
      );
      requireCondition(
        stateSet.has(transition.to),
        `${prefix} transition has unknown to-state ${transition.to}`,
      );
      requireCondition(
        Boolean(transition.guard?.trim()),
        `${prefix} transition ${transition.event} has no guard`,
      );
    }
    const branches = new Set(flow.transitions.map(({ branch }) => branch));
    for (const branch of requiredBranches)
      requireCondition(branches.has(branch), `${prefix} missing transition branch ${branch}`);
    requireNonEmpty(flow.requiredDecisions, `${prefix} required decisions`);
    for (const decision of flow.requiredDecisions) {
      requireCondition(
        stateSet.has(decision.state),
        `${prefix} decision ${decision.id} has unknown state`,
      );
      requireCondition(
        Array.isArray(decision.outcomes) && decision.outcomes.length >= 3,
        `${prefix} decision ${decision.id} must declare at least three outcomes`,
      );
      requireCondition(
        duplicates(decision.outcomes.map(({ name }) => name)).length === 0,
        `${prefix} decision ${decision.id} has duplicate outcome names`,
      );
      for (const outcome of decision.outcomes) {
        const transition = transitionById.get(outcome.transitionId);
        requireCondition(
          Boolean(transition) && transition.from === decision.state,
          `${prefix} decision ${decision.id} outcome ${outcome.name} is not bound to an outgoing transition`,
        );
      }
    }
    for (const concern of flow.sharedConcerns)
      requireCondition(
        concernIds.has(concern),
        `${prefix} references unknown shared concern ${concern}`,
      );
    for (const boundary of flow.trustBoundaries) {
      requireCondition(
        concernIds.has(boundary.concern),
        `${prefix} trust boundary references unknown concern ${boundary.concern}`,
      );
      requireCondition(
        Boolean(boundary.dataClass?.trim()),
        `${prefix} trust boundary has no data class`,
      );
      requireCondition(
        Boolean(boundary.direction?.trim()),
        `${prefix} trust boundary has no direction`,
      );
      requireCondition(Boolean(boundary.policy?.trim()), `${prefix} trust boundary has no policy`);
    }

    const flowText = JSON.stringify(flow).toLowerCase();
    for (const label of deniedLabels)
      requireCondition(!flowText.includes(label), `${prefix} contains generic label ${label}`);
    requireCondition(
      manifest.governance.primaryOwnerEnum.includes(flow.primaryOwner),
      `${prefix} primary owner is unstable`,
    );

    for (const route of flow.routePatterns) ownedRoutes.push({ route, owner: flow.id });
    for (const symbol of [...flow.frontendStateSymbols, ...flow.backendStateSymbols]) {
      const owners = declaredSymbols.get(symbol) ?? [];
      owners.push(flow.id);
      declaredSymbols.set(symbol, owners);
    }
    const coveredEvidenceTransitions = new Set();
    for (const evidence of flow.testEvidence) {
      requireCondition(
        Boolean(evidence.proves?.trim()),
        `${prefix} evidence ${evidence.path} has no proof statement`,
      );
      requireCondition(
        await evidenceExists(root, evidence.path),
        `${prefix} missing evidence ${evidence.path}`,
      );
      const evidenceSource = await readFile(path.join(root, evidence.path), "utf8");
      const { selected, cases: executableCases } = await repositoryExecutableCaseBodies(
        root,
        evidence.path,
        evidenceSource,
      );
      requireCondition(
        selected,
        `${prefix} evidence ${evidence.path} is not selected by a canonical test runner`,
      );
      requireNonEmpty(evidence.testCases, `${prefix} evidence ${evidence.path} test cases`);
      for (const testCase of evidence.testCases) {
        requireCondition(
          executableCases.has(testCase.name),
          `${prefix} evidence ${evidence.path} cites missing or ambiguous executable case ${testCase.name}`,
        );
        const caseBody = executableCases.get(testCase.name);
        requireCondition(
          Array.isArray(testCase.transitionIds),
          `${prefix} evidence case ${testCase.name} transitionIds must be an array`,
        );
        for (const transitionId of testCase.transitionIds) {
          requireCondition(
            transitionById.has(transitionId),
            `${prefix} evidence case ${testCase.name} claims unknown transition ${transitionId}`,
          );
          const marker = `FLOW_ASSERT:${flow.id}:${transitionId}`;
          requireCondition(
            caseHasFlowAssertion(evidence.path, caseBody, marker),
            `${prefix} evidence case ${testCase.name} lacks executable case-bound flowAssert for ${marker}`,
          );
          coveredEvidenceTransitions.add(transitionId);
        }
      }
    }
    requireCondition(
      Array.isArray(flow.plannedEvidence),
      `${prefix} planned evidence must be an array`,
    );
    const plannedEvidenceTransitions = new Set();
    for (const planned of flow.plannedEvidence) {
      requireNonEmpty(planned.transitionIds, `${prefix} planned transition evidence ids`);
      requireCondition(
        /^BIC-(?:01|0[4-9]|10)$/.test(planned.ownerIssue),
        `${prefix} planned transition evidence has invalid owner issue`,
      );
      requireCondition(
        Boolean(planned.verificationCommand?.trim()) && Boolean(planned.reason?.trim()),
        `${prefix} planned transition evidence lacks command or reason`,
      );
      for (const transitionId of planned.transitionIds) {
        requireCondition(
          transitionById.has(transitionId),
          `${prefix} plans unknown transition ${transitionId}`,
        );
        requireCondition(
          !coveredEvidenceTransitions.has(transitionId),
          `${prefix} transition ${transitionId} cannot be both covered and planned`,
        );
        plannedEvidenceTransitions.add(transitionId);
      }
    }
    requireCondition(
      JSON.stringify(
        [...new Set([...coveredEvidenceTransitions, ...plannedEvidenceTransitions])].sort(),
      ) === JSON.stringify([...transitionIds].sort()),
      `${prefix} evidence must classify every transition id as covered or planned`,
    );
    for (const commit of flow.commitPoints) {
      requireCondition(
        stateSet.has(commit.state),
        `${prefix} commit point has unknown state ${commit.state}`,
      );
      requireCondition(
        Boolean(commit.rollback?.trim()),
        `${prefix} commit point has no rollback contract`,
      );
      rollbackContracts.push(commit.rollback);
    }
    requireCondition(typeof flow.idempotency?.key === "string", `${prefix} has no idempotency key`);
    requireCondition(
      typeof flow.retryPolicy?.identity === "string",
      `${prefix} has no retry identity`,
    );
    requireNonEmpty(flow.cancellationPolicy?.cancellablePhases, `${prefix} cancellable phases`);
    const recoveryState = flow.semanticRoles.recoveryContextReady;
    const ordinaryCancelSources = [
      ...new Set(
        flow.transitions
          .filter(({ branch, from }) => branch === "cancel" && from !== recoveryState)
          .map(({ from }) => from),
      ),
    ].sort();
    const declaredCancellablePhases = [...flow.cancellationPolicy.cancellablePhases].sort();
    requireCondition(
      JSON.stringify(ordinaryCancelSources) === JSON.stringify(declaredCancellablePhases),
      `${prefix} cancellation phases must exactly equal ordinary cancel-edge sources`,
    );
    requireCondition(
      flow.cancellationPolicy.persistedState === flow.semanticRoles.canceledClean,
      `${prefix} cancellation persisted state must be canceledClean`,
    );
    stateCounts.push(flow.states.length);
    kindAuthoritySequences.push(
      JSON.stringify(flow.states.map(({ kind, authority }) => ({ kind, authority }))),
    );
  }

  requireCondition(
    new Set(stateCounts).size >= 4,
    "flow architectures must expose at least four distinct state counts",
  );
  requireCondition(
    new Set(kindAuthoritySequences).size >= 8,
    "flow architectures must expose at least eight distinct kind/authority sequences",
  );
  requireCondition(
    duplicates(rollbackContracts).length === 0,
    `commit rollback contracts must be flow-specific: ${duplicates(rollbackContracts).join(" | ")}`,
  );
  const flowById = new Map(manifest.flows.map((flow) => [flow.id, flow]));
  const requireRoles = (flowId, roles) => {
    const flow = flowById.get(flowId);
    for (const role of roles)
      requireCondition(
        Boolean(flow?.semanticRoles?.[role]),
        `${flowId} missing required semantic role ${role}`,
      );
  };
  const requireDecisionOutcomes = (flowId, decisionName, outcomes) => {
    const flow = flowById.get(flowId);
    const decision = flow?.requiredDecisions.find(({ name }) => name === decisionName);
    requireCondition(Boolean(decision), `${flowId} missing required decision ${decisionName}`);
    requireCondition(
      JSON.stringify(decision.outcomes.map(({ name }) => name).sort()) ===
        JSON.stringify([...outcomes].sort()),
      `${flowId} decision ${decisionName} has wrong outcomes`,
    );
  };
  requireRoles("APP-FIRST-RUN-001", [
    "firstReadable",
    "audioChoice",
    "firstPlayable",
    "audioSkipped",
  ]);
  requireDecisionOutcomes("APP-FIRST-RUN-001", "generate-change-skip", [
    "generate",
    "change",
    "skip",
  ]);
  requireRoles("PREVIEW-001", ["auditionReady", "reviewDecision", "changeRequested"]);
  requireDecisionOutcomes("PREVIEW-001", "accept-change-skip", ["accept", "change", "skip"]);
  requireRoles("PLAYBACK-001", [
    "mediaLoading",
    "playing",
    "paused",
    "interrupted",
    "stale",
    "superseded",
    "resumeDecision",
  ]);
  requireDecisionOutcomes("PLAYBACK-001", "resume-supersede-fail", ["resume", "supersede", "fail"]);
  requireCondition(
    flowById.get("UI-MEMORY-001").states.every(({ authority }) => authority === "frontend"),
    "UI-MEMORY-001 must remain frontend-authoritative",
  );

  const signatureOwners = new Map();
  for (const flow of manifest.flows) {
    const signature = structuralFlowSignature(flow);
    signatureOwners.set(signature, [...(signatureOwners.get(signature) ?? []), flow.id]);
  }
  const maxStructuralInstances =
    manifest.governance.normalizedTemplatePolicy?.maxFullFlowStructuralSignatureInstances;
  requireCondition(
    Number.isInteger(maxStructuralInstances) && maxStructuralInstances >= 1,
    "normalized template policy has invalid maxFullFlowStructuralSignatureInstances",
  );
  const structuralCollisions = [...signatureOwners.values()]
    .filter((owners) => owners.length > maxStructuralInstances)
    .sort((left, right) => right.length - left.length);
  requireCondition(
    structuralCollisions.length === 0,
    `universal normalized flow template collision: ${structuralCollisions
      .map((owners) => `${owners.length}x [${owners.join(", ")}]`)
      .join("; ")}`,
  );

  const routeNames = ownedRoutes.map(({ route }) => route);
  const duplicateOwners = duplicates(routeNames);
  requireCondition(
    duplicateOwners.length === 0,
    `duplicate route owner: ${duplicateOwners.join(", ")}`,
  );
  const discovered = [...discoveredRoutes].sort();
  const declared = [...routeNames].sort();
  requireCondition(
    JSON.stringify(declared) === JSON.stringify(discovered),
    "route inventory mismatch: manifest must exactly own current direct Go routes",
  );
  requireCondition(
    manifest.routeInventory.directHttpRoutesObserved === discovered.length,
    "stale directHttpRoutesObserved count",
  );

  const requiredSymbols = manifest.requiredStateSymbols.map(({ symbol }) => symbol);
  requireCondition(
    duplicates(requiredSymbols).length === 0,
    `duplicate required state symbol: ${duplicates(requiredSymbols).join(", ")}`,
  );
  for (const [symbol, owners] of declaredSymbols) {
    requireCondition(
      owners.length === 1,
      `state symbol must have exactly one primary flow owner: ${symbol} -> ${owners.join(", ")}`,
    );
  }
  requireCondition(
    JSON.stringify([...declaredSymbols.keys()].sort()) ===
      JSON.stringify([...requiredSymbols].sort()),
    "required state symbol inventory must exactly match per-flow ownership declarations",
  );
  const discoveredStateSymbols = await discoverStateSymbols(
    root,
    manifest.governance.stateSymbolDiscovery,
  );
  const unownedStateSymbols = discoveredStateSymbols.filter(
    (symbol) => !declaredSymbols.has(symbol),
  );
  requireCondition(
    unownedStateSymbols.length === 0,
    `unowned discovered state symbols: ${unownedStateSymbols.join(", ")}`,
  );

  for (const required of manifest.requiredStateSymbols) {
    requireCondition(
      flowIds.includes(required.primaryFlowId),
      `required state symbol has unknown flow ${required.primaryFlowId}`,
    );
    requireCondition(
      (declaredSymbols.get(required.symbol) ?? [])[0] === required.primaryFlowId,
      `required state symbol is not declared only by ${required.primaryFlowId}: ${required.symbol}`,
    );
    requireCondition(
      await sourceDeclaresSymbol(root, required.symbol),
      `state symbol source declaration is missing: ${required.symbol}`,
    );
  }

  const allTransitionIds = manifest.flows.flatMap((flow) => flow.transitions.map(({ id }) => id));
  const coveredTransitionIds = manifest.flows.flatMap((flow) =>
    flow.testEvidence.flatMap((entry) =>
      entry.testCases.flatMap(({ transitionIds }) => transitionIds),
    ),
  );
  const plannedTransitionIds = manifest.flows.flatMap((flow) =>
    flow.plannedEvidence.flatMap(({ transitionIds }) => transitionIds),
  );
  const coveredSet = new Set(coveredTransitionIds);
  const plannedSet = new Set(plannedTransitionIds);
  const transitionEvidenceOverlapCount = [...coveredSet].filter((id) => plannedSet.has(id)).length;
  const classifiedSet = new Set([...coveredSet, ...plannedSet]);

  return {
    schemaVersion: "tts-research.flow-coverage.v2",
    flowCount: manifest.flows.length,
    transitionCount: allTransitionIds.length,
    directRouteCount: discovered.length,
    uniqueRouteOwnerCount: new Set(routeNames).size,
    requiredStateSymbolCount: manifest.requiredStateSymbols.length,
    evidenceReferenceCount: manifest.flows.reduce((sum, flow) => sum + flow.testEvidence.length, 0),
    namedExecutableCaseCount: manifest.flows.reduce(
      (sum, flow) =>
        sum + flow.testEvidence.reduce((count, entry) => count + entry.testCases.length, 0),
      0,
    ),
    coveredTransitionClaimCount: coveredTransitionIds.length,
    plannedTransitionEvidenceCount: plannedTransitionIds.length,
    transitionEvidenceOverlapCount,
    unsupportedCoveredTransitionClaimCount: 0,
    unclassifiedTransitionCount: allTransitionIds.filter((id) => !classifiedSet.has(id)).length,
    primaryOwners: Object.fromEntries(
      [...ownerEnum]
        .sort()
        .map((owner) => [
          owner,
          manifest.flows.filter((flow) => flow.primaryOwner === owner).length,
        ]),
    ),
    flowIds: [...flowIds].sort(),
    routes: discovered,
  };
}

async function main() {
  const write = process.argv.includes("--write");
  const sourceManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifest = structuredClone(sourceManifest);
  if (write) {
    for (const flow of manifest.flows) flow.diagram = renderMermaid(flow);
  }
  const report = await validateFlowRegistry(manifest, {
    discoveredRoutes: await discoverDirectRoutes(),
    repoRoot,
  });
  const renderedReport = formatJson(report, reportPath);
  const renderedManifest = formatJson(manifest, manifestPath);
  const renderedDocuments = renderFlowDocuments(manifest);
  const renderedReadme = renderFlowReadme(manifest, report);
  if (write) {
    await Promise.all([
      writeFile(manifestPath, renderedManifest),
      writeFile(reportPath, renderedReport),
      writeFile(path.join(repoRoot, "docs/flows/README.md"), renderedReadme),
      ...Object.entries(renderedDocuments).map(([documentPath, rendered]) =>
        writeFile(path.join(repoRoot, "docs/flows", documentPath), rendered),
      ),
    ]);
    console.log(
      `flow registry write passed: ${report.flowCount} flows; ${report.directRouteCount} routes; ${Object.keys(renderedDocuments).length} generated documents`,
    );
    return;
  }
  const [currentReport, currentReadme] = await Promise.all([
    readFile(reportPath, "utf8").catch(() => ""),
    readFile(path.join(repoRoot, "docs/flows/README.md"), "utf8").catch(() => ""),
  ]);
  requireCondition(
    currentReport === renderedReport,
    "flow coverage report is stale; run `node scripts/validate-flow-registry.mjs --write`",
  );
  requireCondition(
    currentReadme === renderedReadme,
    "flow README is stale; run `node scripts/validate-flow-registry.mjs --write`",
  );
  for (const [documentPath, rendered] of Object.entries(renderedDocuments)) {
    const current = await readFile(path.join(repoRoot, "docs/flows", documentPath), "utf8").catch(
      () => "",
    );
    requireCondition(
      current === rendered,
      `generated flow document ${documentPath} is stale; run \`node scripts/validate-flow-registry.mjs --write\``,
    );
  }
  console.log(
    `flow registry check passed: ${report.flowCount} flows; ${report.directRouteCount} exact route owners; ${report.requiredStateSymbolCount} required symbols; ${report.evidenceReferenceCount} evidence references; ${Object.keys(renderedDocuments).length} generated documents`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
