# ChatGPT TTS best-in-class architecture response v2

- Verdict: `REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH`
- Project: `tts-research` (`g-p-6a4c3396e3948191a15f9959895179d7`)
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a5085c1-6258-83eb-b672-cd4b6e9b9629
- Model: GPT-5.6 Sol / Pro
- Archive: `tts-best-in-class-v2-dirty-20260710T053753Z.zip`
- Archive SHA-256: `b526512f9671c879b0cd97c46a97ca2afcce741e7cc732be28cd08a98f3d17c3`
- Archive bytes: `22570772`
- Archive entries: `1299`
- Local response source: `/tmp/tts-bic-v2-assistant-response.txt`

---

REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH

1. Source-access proof

The supplied archive was reviewed as the sole source of truth.

SHA-256: b526512f9671c879b0cd97c46a97ca2afcce741e7cc732be28cd08a98f3d17c3

Size: 22,570,772 bytes

Entries: 1,299

_review/metadata.json records branch niklas/voice-studio-follow-up, ahead by three commits, with a dirty worktree assembled from tracked and intentional untracked non-ignored files.

Flow manifest

From docs/flows/manifest.json:

JSON
"schemaVersion": "tts-research.flow-registry.v1"
"status": "candidate_semantically_validated"

Exact flow IDs include:

APP-BOOT-001
SRC-MANIFEST-001
SYNC-FIDELITY-001

The manifest declares 39 flows, five stable primary-owner values, five required state kinds, seven required transition-branch classes, three state-authority values, 33 required implementation-state symbols, and 11 shared concerns.

Coverage report

From docs/flows/coverage-report.json:

JSON
"flowCount": 39
"directRouteCount": 123
"uniqueRouteOwnerCount": 123
"requiredStateSymbolCount": 33
"evidenceReferenceCount": 40

Exact owner counts are:

JSON
"experience": 12
"project-data": 6
"runtime-platform": 4
"source-data": 5
"speech-audio": 12
Canonical thresholds

From benches/thresholds.json:

startup.maxWarmApiHttpReadyP95Ms = 5000
uxEvidence.maxDominantTasksPerSurface = 1
frontendBundle.maxInitialJsGzipBytes = 160000
readerTiming.maxAppColdUsableMs = 2200
maintainability.maxFinalAppTsxLinesExclusive = 2000

The declared reference class is local-cpu-modest-v1: 4–8 logical CPUs, at least 16 GiB memory, SSD storage, and no required GPU. The protocol requires one discarded warm-up, at least ten measured runs, and p50/p95/max.

Required issue titles and dependencies

From docs/project-management/linear/tts-research-best-in-class-batch-draft.json:

Issue	Exact title	Exact dependencies
BIC-01	Exact-command lean CPU startup and HTTP readiness	[]
BIC-03	Fail-closed semantic flow registry and coverage report	[]
BIC-11	App.tsx extraction phase 1: shell and shared state	["BIC-04","BIC-18","BIC-19"]
BIC-18	Runtime startup and resource performance gate	["BIC-01","BIC-02"]
BIC-19	Frontend performance, accessibility, and visual evidence gate	["BIC-03"]
BIC-20	Final evidence-only best-in-class closeout	["BIC-01","BIC-02","BIC-03","BIC-04","BIC-05","BIC-06","BIC-07","BIC-08","BIC-09","BIC-10","BIC-11","BIC-12","BIC-13","BIC-14","BIC-15","BIC-16","BIC-17","BIC-18","BIC-19"]

The packet contains exactly BIC-01 through BIC-20, with no BIC-00.

Validator and negative-test inspection

I independently ran the archive-local validators that do not require the excluded dependency trees:

node scripts/validate-flow-registry.mjs
→ passed: 39 flows; 123 exact route owners; 33 required symbols; 40 evidence references

node --test scripts/validate-flow-registry.test.mjs
→ 5/5 passed

node scripts/validate-linear-batch.mjs
→ passed: 20 issues; DAG, cap, schema, thresholds, reconciliation, and Markdown parity valid

node --test scripts/validate-linear-batch.test.mjs
→ 3/3 passed

I also inspected scripts/validate-flow-registry.mjs and its tests rather than relying on those success messages. Adversarial copies of the archive produced the following results:

Mutation	Actual result
Corrupt a Mermaid node label in docs/flows/application-ux.md	Validator still passed
Assign one implementation-state symbol to two flows	Validator still passed
Replace a required and declared symbol with frontend/src/does-not-exist.ts#GhostState	Validator still passed
Replace flow test evidence with unrelated existing package.json	Validator still passed
Add a Go app.Get(path, …) route using a variable instead of a string literal	Validator still passed

Those passes establish the principal blockers below.

2. Blocker matrix
ID	Exact path/symbol/issue	Concrete blocker	Required repair
1	docs/flows/manifest.json; especially APP_FIRST_RUN_001_SUCCEEDED, PREVIEW_001_SUCCEEDED, PLAYBACK_001_SUCCEEDED, and UI_MEMORY_001_*	The 39 flows are domain-labeled but still generated from one universal machine. Every flow has exactly nine states and twelve transitions. Normalizing flow-specific IDs yields one state-kind sequence, one authority sequence, and one edge/branch topology. Nine generic guards occur in every flow, and every commit point uses the same rollback sentence. Material semantics are consequently collapsed or incorrect.	Model domain milestones and decisions as actual states and branches. At minimum: separate first-readable from first-playable; make Preview accept/change/skip explicit; represent Playback active/paused/completed/exited/interrupted/stale/superseded states; correct browser-owned UI-memory authority. Add semantic invariants and a normalized-template negative test, while allowing genuinely shared subgraphs.
2	scripts/validate-flow-registry.mjs#validateFlowRegistry; docs/flows/application-ux.md:5, content-audio-reader.md:5, runtime-data-security.md:5	All three documents claim that Mermaid metadata, nodes, labels, and edges are checked for exact semantic parity. The validator never reads any of those files. It checks only the manifest, discovered routes, evidence-path existence, and coverage-report bytes. Rendered-flow drift therefore passes.	Generate all three documents deterministically from the manifest and compare exact output, or parse them and validate one-and-only-one diagram per flow, metadata, states, authority, kinds, transitions, guards, and prose contracts. Add missing/extra/edited-diagram negative tests.
3	scripts/validate-flow-registry.mjs:177-191,223-231; declaredSymbols, requiredStateSymbols, testEvidence	State and evidence governance is fail-open. The map records multiple symbol owners but never rejects them. A required symbol is only checked against another string in the manifest; the file and symbol need not exist. Evidence needs only a non-empty free-text claim and an existing file. scripts/start-port-env.test.mjs, for example, tests port resolution but is asserted to prove all APP-BOOT success/failure/retry/cancellation semantics; the Playback evidence file only tests floating-player visibility.	Require exactly one primary owner per implementation symbol, resolve every file and exported Go/TypeScript symbol, and reject duplicate or undiscovered state ownership. Evidence must identify executable test cases or machine-readable assertions that actually cover the claimed branches. Add duplicate-owner, missing-symbol, unrelated-evidence, and unproved-branch tests.
4	scripts/validate-flow-registry.mjs#discoverDirectRoutes; routePattern at line 9	Current string-literal registrations are matched exactly, but future route governance is bypassable. Discovery scans only top-level non-test backend/internal/httpapi/*.go files with a regex for app.Get/Post/Put/Patch/Delete("literal", …). A valid variable-based registration was invisible to the validator.	Use Go AST or generated router metadata over the intended package tree. Reject any route registration that cannot be statically classified, including variable/helper registrations, nested registration files, and newly introduced route forms. Add adversarial route-discovery tests.
5	docs/flows/README.md:5,7,31	The registry README still says there are 34 flows, says the pack does not claim exact route ownership, and says mapping of 123 routes and state constants is unproven. That directly contradicts the manifest, coverage report, and repaired-candidate claims. The validator does not cover this file.	Update or generate the README from the canonical manifest/report and include it in freshness validation.
6	BIC-03 versus BIC-04–BIC-10 in the canonical JSON	BIC-03 owns all 39 flows, all 123 routes, 77 listed state symbols, Mermaid semantics, commit/retry/cancel/cleanup behavior, and evidence paths. Yet BIC-04–BIC-10 depend on it and are then tasked with making those same domain contracts specific and complete. This duplicates scope and requires the full domain result before the domain issues that produce it.	Restrict BIC-03 to schema, stable enums, generator/parser, inventory mechanisms, deterministic reporting, and adversarial validator fixtures. Let BIC-04–BIC-10 own their domain contracts. Enforce final 39-flow/123-route integrated closure after those issues and again in BIC-20.
7	BIC-11–BIC-17, BIC-20; scripts/validate-linear-batch.mjs:262-278; root package.json#scripts.check	The architecture says every later issue reruns each affected performance gate, but BIC-11–BIC-17 run only validate:flows and pnpm check. BIC-20 does not run any BIC-18/BIC-19 benchmark command. Root pnpm check is only format, lint, typecheck, and tests. The packet validator checks that BIC-18/19 are dependency ancestors, not that post-change measurements or fresh exact-hash artifacts exist. Several issue threshold lists also omit canonical keys named by their own acceptance criteria.	Add the affected frontend/runtime benchmark commands and artifacts to each product issue. BIC-20 must rerun all BIC-18 and BIC-19 gates on final bytes. Validate required command presence, complete threshold-key coverage, commit/hash binding, raw-artifact freshness, and failure counts; add negative tests removing each requirement.
3. Flow/ownership verdict
A. Domain-specific flow behavior

No. The repair replaces the old generic words with domain nouns, but the canonical machines are still one template.

Every flow follows the same normalized structure:

requested → validated → running → committed → succeeded
                ↓          ↓          ↓
              failed ←─────┘        canceled
                ↓
            recovering → running or canceled

running → canceling → canceled

The following guards are each used once in all 39 flows:

validation or authorization fails
commit preconditions still hold
bounded operation returns an error
commit point has not been crossed
processes stopped and temporary data handled
failure class is retryable or has a safe fallback
user declines retry
authoritative committed state is current
commit is retained and only future work stops

Specific unresolved semantic failures include:

APP-FIRST-RUN-001: its commit effect is “a source or explicit skip choice is persisted,” its terminal success is “first playable prefix reached,” and the connecting event is “show readable content before optional audio.” A skip choice cannot imply a playable prefix, and the first-readable and first-playable milestones are collapsed.

PREVIEW-001: “accept,” “change,” and “skip” appear inside a terminal-state label and event sentence, but there are no corresponding decision states or branches. Generation/playability is still conflated with the subsequent user decision.

PLAYBACK-001: the transition event says to distinguish active, paused, completed, exited, canceled, interrupted, stale, and superseded, but none of those are represented as distinct states. Encoding a required state vocabulary in an event label does not create a state machine.

UI-MEMORY-001: the implementation symbol is frontend browser storage in frontend/src/features/preferences/model.ts#UiMemoryState, with loadUiMemory and saveUiMemory; nevertheless validation, migration, commit, failure, and cancellation are all marked backend-authoritative.

The four exact denied phrases in genericLabelsDenied prevent reuse of the previous wording, but do not prevent a newly worded universal template.

B. Exact, fail-closed ownership

Current literal-route parity passes; future governing ownership does not.

The current manifest exactly covers the 123 routes discovered by the validator’s narrow string-literal regex, one time each. Coverage-report freshness is also correctly byte-compared.

That does not extend to the full ownership claim:

New route registrations can be invisible.

Required state symbols need not exist.

A symbol can have multiple primary flow owners.

Undeclared implementation states are not discovered.

Evidence references establish file existence, not branch proof.

Rendered diagrams can drift from the canonical manifest undetected.

Therefore the answer to B is no.

4. UX/progressive-availability verdict

The prose architecture is materially repaired.

docs/architecture/best-in-class-ux-performance.md now states:

Choose or create → add source → show first readable content → confirm or adjust scope
→ optional audition → start first playable prefix → read/listen while remaining work
continues → repair/resume/export

The canonical packet is even more explicit:

Create/open project → acquire the first readable source prefix → read immediately
→ synthesize the first narratable prefix on lean CPU → progressively replace
partial/degraded state with verified audio and alignment; full extraction, audition,
optional capability activation, and full-job completion never block an already
available earlier stage.

The surface-state matrix also preserves readable content during processing, capability unavailability, reconnecting, interruption, cancellation, and audio/alignment degradation.

However, the governing flow registry does not faithfully encode that spine. APP-FIRST-RUN-001 collapses readable and playable availability, while PREVIEW-001 folds optional audition decisions into a terminal success label. Thus:

Prose UX architecture: passes.

Machine-governed progressive architecture: does not pass.

Overall answer to C: no, until the canonical flow contracts preserve the same milestones and non-blocking branches.

5. Performance protocol verdict

The written measurement protocol is substantially credible and reproducible.

It provides:

a declared modest CPU/no-GPU machine class;

explicit build/cache lanes rather than ambiguous “cold” and “warm” labels;

one recorded discarded warm-up and at least ten measured runs;

nearest-rank p50, p95, and max;

successful-count and failure-count reporting;

automatic failure for any measured timeout, crash, missing mark, egress, cache mutation, or descendant leak, regardless of successful percentiles;

HTTP-level API and frontend readiness rather than socket listening;

project-create commit/readback and cleanup marks;

full descendant-process CPU/RSS accounting;

network-denied, empty-model-cache startup evidence;

no-GPU/CUDA evidence beyond merely setting an environment variable;

process-group shutdown under both SIGINT and SIGTERM;

separation of acknowledgement, authoritative state commit, and operation completion.

The threshold file is also a coherent numerical source of truth. The former CSS discrepancy is explicitly resolved at 15,000 gzip bytes.

The blocker is enforcement timing, not protocol prose. Baselines precede product work, but the packet does not require affected gates to be rerun by BIC-11–BIC-17 or on final BIC-20 bytes. Consequently the final product could regress after the accepted baseline and still satisfy the listed closeout commands.

Answer to D:

Protocol definition: yes.

Batch-level failure-counting and final-byte enforcement: no.

The single successful startup observation is useful feasibility evidence, but it is not a ten-run canonical benchmark and does not by itself prove absence of eager imports, implicit synchronization, egress, cache mutation, or descendant leaks. Those implementation debts are appropriately assigned to BIC-01 and BIC-02 rather than treated as separate packet scope.

6. Issue atomicity/DAG/cap/reconciliation verdict

Several structural repairs are correct:

Exactly 20 issues: BIC-01 through BIC-20.

No BIC-00.

The dependency graph is acyclic.

BIC-03 is independent of startup.

BIC-18 and BIC-19 are dependency ancestors of BIC-11 through BIC-17.

BIC-20 directly depends on all preceding 19 issues.

JSON/Markdown generation parity passes.

Capacity arithmetic is internally consistent: zero active before, zero created now, zero after, cap 20, all 20 eligible subject to the stated creation gates.

The reconciliation contains all 20 mappings. Every referenced QQP identifier exists in the archived issue snapshot, and all 20 unique referenced issues are recorded as Done and archived.

BIC-20 is explicitly evidence-only and excludes product repairs.

The graph nevertheless fails the requested atomic/evidence-ready bar for two reasons:

BIC-03 consumes the completed domain-contract outcome that BIC-04–BIC-10 are supposed to produce.

The performance dependency edges establish only pre-change baselines. They do not require post-change or final-byte measurements.

Answer to E:

DAG syntax, cap, BIC-00 removal, and archived-QQP reconciliation: pass.

Atomic scope and evidence freshness: fail.

Overall: not ready for issue creation.

7. Residual non-blocking risks

The local-cpu-modest-v1 range covers 4–8 logical CPUs, which may produce materially different absolute latency distributions. Every report should record the exact CPU model, logical/physical topology, governor, memory, storage, and virtualization state; comparisons should be stratified rather than pooled.

The named bench:startup, bench:runtime-resources, bench:frontend-performance, and validate:local:frontend-performance commands are packet targets rather than current root package.json scripts. That is acceptable only if the owning issues create them before they are used as acceptance or closeout commands.

The archive intentionally excludes dependency and build trees. I independently replayed the two validators and their eight focused tests, but did not independently replay the claimed full pnpm check, Go, adapter, PDF, and 774-test frontend runs from these dependency-excluded bytes.

The exact-command readiness observation does not resolve the already-scoped startup work in scripts/start.sh, including heavyweight import probes, possible dependency synchronization, listener-based fallback readiness, and complete process-tree termination. BIC-01 and BIC-02 correctly remain necessary.
