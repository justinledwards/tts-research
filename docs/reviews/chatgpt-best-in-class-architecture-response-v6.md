REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH
Linear creation may proceed: NO.

1. Router-return analysis still silently chooses a prefix

Paths: backend/cmd/flow-route-inventory/main.go:463-523, backend/cmd/flow-route-inventory/main_test.go:130-142

Reproduction: The supplied /same, /different, /same if / else if / else probe now correctly rejects as ambiguous. Focused discover tests using the following equivalent control-flow forms do not:

Go
func api(app *fiber.App, different bool) fiber.Router {
	router := app.Group("/same")
	if different {
		router = app.Group("/different")
	}
	return router
}
func routes(app *fiber.App, different bool) {
	api(app, different).Get("/x", nil)
}
Go
func api(app *fiber.App, different bool) fiber.Router {
	switch {
	case different:
		return app.Group("/different")
	}
	return app.Group("/same")
}
Go
func api(app *fiber.App, different bool) fiber.Router {
	for different {
		return app.Group("/different")
	}
	return app.Group("/same")
}

Observed: All three fixtures are accepted without an ambiguity or unresolved-control-flow error and emit GET /same/x. At runtime, each has a reachable GET /different/x path. evaluateFunctionReturn discards branch-local receiver assignments and silently ignores SwitchStmt and ForStmt.

Expected: Any reachable conflicting prefix must reject as ambiguous. Unsupported control flow that can affect a returned Fiber receiver must reject rather than be skipped.

Bounded repair: Make return evaluation path-sensitive, merge receiver environments after conditional assignments, and explicitly traverse all relevant terminating/control-flow statements. For any statement whose effect on the returned receiver is not modeled, fail closed. Add the three fixtures above as negative tests.

2. Nonexecuting text can still satisfy exact-case transition evidence

Paths: scripts/validate-flow-registry.mjs:368-397, scripts/validate-flow-registry.mjs:465-524

Reproduction: With marker FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry, the exported scanners were called on these sources:

JavaScript
// test("target", () => {
//   flowAssert("FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry");
// });
JavaScript
const text = 'test("target", () => { flowAssert("FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry"); })';
Go
// func TestTarget(t *testing.T) {
//     flowAssert(t, "FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry")
// }
JavaScript
test("target", () => {
  const value =
    /flowAssert("FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry")/;
  void value;
});
JavaScript
test("target", () => {
  const value = {
    unused() {
      flowAssert("FLOW_ASSERT:APP-BOOT-001:APP-BOOT-001:T01:entry");
    },
  };
  void value;
});

The same acceptance occurs for a block-commented declaration, a Go raw string containing a fake test, and an uninstantiated class method.

Observed: executableCaseBodies finds the fake target/TestTarget cases inside comments and strings. The extracted body loses the surrounding lexical context, after which caseHasFlowAssertion returns true. It also returns true for the regular-expression literal and uninvoked object/class methods.

Expected: Comments, strings, regular-expression literals, commented/stringified test declarations, and calls under uninvoked function or method bodies must never establish executable transition coverage.

Bounded repair: Parse the complete JS/TS/TSX and Go source into ASTs. Enumerate actual test declarations from AST nodes, then accept only call-expression nodes in the cited case’s directly executed body, excluding nested function, class-method, object-method, and other deferred-execution ancestors. Add every reproduction above as a negative fixture.

3. The archive is not a self-contained source-of-truth worktree

Paths: pnpm-workspace.yaml, pnpm-lock.yaml, docs/flows/manifest.json, _review/file-list.txt, and the archive payload

Reproduction:

JavaScript
const discoveredRoutes = [
  ...new Set(manifest.flows.flatMap((flow) => flow.routePatterns)),
].sort();

await validateFlowRegistry(manifest, {
  discoveredRoutes,
  repoRoot: process.cwd(),
});

Observed: Canonical validation stops with:

flow APP-FIRST-RUN-001 missing evidence frontend/src/features/intake/intakeWizardModel.test.ts

pnpm-workspace.yaml and the lockfile both declare a frontend importer, but these workspace entry-point files are absent:

frontend/package.json
frontend/src/App.tsx

Nine manifest-cited evidence files are absent:

frontend/src/BundlePanelsHelpers.test.tsx
frontend/src/VoiceSourceAnalysisPanel.test.tsx
frontend/src/api.test.ts
frontend/src/features/cinema/model.test.tsx
frontend/src/features/command-palette/commandPaletteHelpers.test.ts
frontend/src/features/intake/intakeWizardModel.test.ts
frontend/src/features/navigation/model.test.ts
frontend/src/features/playback/playbackSurfaceRules.test.ts
frontend/src/features/preferences/model.test.ts

Twenty-three source paths containing 33 required-symbol bindings are absent:

frontend/src/AppShell.tsx
frontend/src/BundlePanels.tsx
frontend/src/MarkdownRenderer.tsx
frontend/src/activityFooter.ts
frontend/src/appVoiceCloningHelpers.ts
frontend/src/features/accessibility/liveStatus.tsx
frontend/src/features/cinema/model.ts
frontend/src/features/cinema/utils/cinemaTransportBarHelpers.ts
frontend/src/features/command-palette/commandPaletteHelpers.ts
frontend/src/features/context-panel/contextPanelModel.ts
frontend/src/features/health-report/model.ts
frontend/src/features/help/model.ts
frontend/src/features/intake/intakeWizardModel.ts
frontend/src/features/intake/sourceTypeModel.ts
frontend/src/features/layout/overlayManager.ts
frontend/src/features/operational-status/operationalStatus.ts
frontend/src/features/performance/index.ts
frontend/src/features/playback/audioGenerationPipeline.ts
frontend/src/features/playback/generatedAudioLifecycle.ts
frontend/src/features/playback/playbackState.ts
frontend/src/features/playback/playbackSurfaceRules.ts
frontend/src/features/policy/model.ts
frontend/src/features/preferences/model.ts

Repository tests/configuration also reference absent fixtures:

fixtures/golden-minute/manifest.json
fixtures/contracts/readalong-current.readalong-manifest.v1.json
fixtures/sync/manifest.json

The archive and _review/file-list.txt agree with each other at 1,001 source files; therefore this is a source-closure failure, not merely a ZIP/file-list mismatch.

Expected: The archive designated as the source of truth must contain every workspace importer, imported entry point, manifest-cited evidence file, required-symbol source, and checked-in test fixture needed to reproduce canonical validation.

Bounded repair: Regenerate the archive from a complete, non-sparse worktree. Add a packaging gate that recursively checks pnpm workspace importers, local imports, manifest evidence paths, required-symbol source paths, and repository test/config fixture references, and rejects the archive if any referenced path is absent.

4. The claimed exact worktree patch is corrupt and incomplete

Paths: _review/git-diff.patch:313, _review/git-status.txt

Reproduction:

Bash
git apply --reverse --check --whitespace=error-all _review/git-diff.patch

Observed:

error: corrupt patch at line 313

Line 313 contains a capture truncation marker:

... [OUTPUT TRUNCATED - 1675105 chars omitted out of 1725105 total] ...

The patch contains only four diff --git headers, while _review/git-status.txt records 12 modified files. The patch omits these eight modified paths:

docs/flows/README.md
docs/flows/application-ux.md
docs/flows/content-audio-reader.md
docs/flows/manifest.json
docs/flows/runtime-data-security.md
docs/performance.md
docs/project-management/linear/tts-research-best-in-class-batch-draft.json
docs/project-management/linear/tts-research-best-in-class-batch-draft.md

Expected: The provenance patch must contain the complete byte-exact dirty-worktree delta and reverse-apply cleanly to the archived postimage.

Bounded repair: Regenerate _review/git-diff.patch directly from Git using an uncapped binary-safe command such as git diff --binary --no-ext-diff. Before packaging, require successful reverse-apply checking and exact modified-path parity between the patch and _review/git-status.txt.

5. Source-symbol reconciliation accepts commented and stringified pseudo-declarations

Paths: scripts/validate-flow-registry.mjs:273-300, scripts/validate-flow-registry.mjs:527-543

Reproduction: A temporary frontend source contained:

TypeScript
/*
export type FakeState = { value: string };
*/

const source = `
export const FakeStatus = "not a declaration";
`;

A temporary Go source contained:

Go
/*
type FakePhase struct{}
*/

discoverStateSymbols was run with those directories as discovery roots. A focused test-only export of the otherwise unchanged sourceDeclaresSymbol helper was used to check the same symbols.

Observed: Discovery returns FakeState, FakeStatus, and FakePhase as implementation symbols. sourceDeclaresSymbol also returns true for each pseudo-declaration. A required state declaration can therefore be removed from executable source, retained only in a comment or literal, and still satisfy reconciliation.

Expected: Only actual TypeScript/TSX and Go declaration nodes may satisfy discovered or required state-symbol checks.

Bounded repair: Replace both raw-source regular-expression checks with AST-based declaration discovery. Add block-comment, template-literal, raw-string, and ordinary-string negative fixtures for both discovery and required-declaration validation.

6. The pre-creation/null-binding contract is not enforced atomically

Paths: scripts/validate-linear-batch.mjs:161-218, scripts/validate-linear-batch.mjs:230-385, scripts/validate-linear-batch.mjs:599-618

Reproduction:

JavaScript
packet.issues[0].linear = {
  id: "fake-id",
  url: "fake-url",
};

validatePacket(packet, benches, flowManifest, flowCoverage);

Independently:

JavaScript
packet.capacitySnapshot.newIssuesCreatedNow = 1;
packet.capacitySnapshot.activeUnarchivedAfter = 1;
packet.capacitySnapshot.compliant = true;

validatePacket(packet, benches, flowManifest, flowCoverage);

Observed: Both mutations are accepted. In both cases, renderMarkdown still emits the hard-coded statement:

No Linear item was created or mutated by this packet update.

Expected: While status is candidate_pending_chatgpt_v6_recheck, every issue’s linear binding must be exactly null, newIssuesCreatedNow must be 0, and activeUnarchivedAfter must equal activeUnarchivedBefore. Markdown must not assert zero mutation independently of validated packet state.

Bounded repair: Add candidate-status assertions for exact null bindings and zero creation/mutation arithmetic. Derive the generated statement from validated fields rather than hard-coding it, and add both mutations as rejection tests.
