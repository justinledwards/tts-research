# ChatGPT TTS-Research best-in-class architecture review — v1

- Verdict: `REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH`
- Reviewed commit: `e97ff6f4932f4429939f1c278e1d4b8361ac6688`
- Archive: `tts-research-best-in-class-e97ff6f.zip`
- Archive SHA-256: `a091e1c49712bebbda3d780467cb318a782d83150191cdd117a207ae15562aa9`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a507a0f-4c24-83eb-b364-11aa84b1b4e2
- Extraction: last rendered `[data-message-author-role="assistant"]` innerText

## Exact peer response

REQUEST_CHANGES TTS BEST-IN-CLASS ARCHITECTURE BATCH

The architectural direction is sound, but the packet is not Linear-ready.

The 34 diagrams are generic placeholders, not credible application-flow contracts.

Static normalization of all Mermaid blocks found 34 diagrams but only one unique structure:

entry → preconditions valid? → perform bounded work → success/failure/cancel → generic recovery → retry/blocked

That template does not define domain states, authoritative state ownership, commit points, partial completion, retry identity, or real cancellation behavior. This contradicts the registry’s own completeness definition in docs/flows/README.md:16-26. The manifest governance requires retry and cancellation branches at docs/flows/manifest.json:8-15, but every flow entry contains only entry, success, failure, and recovery; there are no structured retry or cancellation contracts. Exact route ownership also remains explicitly unproven at docs/flows/README.md:28-32.

Exact packet edits:

Replace every generic Mermaid template with a domain-specific state machine. Each must show stable states, transient states, triggering events, guards, server-authoritative state, observable UI state, commit point, success terminals, failure classes, recovery targets, retry scope, cancellation phases, and cleanup.

Extend manifest.json with, at minimum: states, transitions, routePatterns, frontendStateSymbols, testEvidence, retryPolicy, cancellationPolicy, commitPoints, idempotency, trustBoundaries, and sharedConcerns.

Make the semantic validator reject generic nodes such as “preconditions valid?” and “perform bounded work,” missing branches, unknown owners, diagram/manifest drift, unmapped implementation states, and routes mapped zero or multiple times.

“Report-only” may be the initial development mode, but BIC-02 cannot close until the local validator fails closed. CI adoption may remain separate.

Remove the “complete 34-flow registry” claim from docs/architecture/best-in-class-ux-performance.md:71-75 and docs/flows/README.md:5-7 until the generated coverage report proves it.

The taxonomy omits major implemented product domains and incorrectly treats cross-cutting policies as primary flows.

At least these primary flows are missing:

Source-manifest synchronization and reconnect recovery. The repository has /api/source-manifest/events, /snapshot, and /events/stream, plus a frontend source-manifest store. The prior architecture already specifies snapshot-authoritative/event-advisory recovery in docs/architecture/source-reader-flow-invariants.md:90-101 and :143-147. JOB-EVENTS-001 is job-specific and cannot own this.

Speech-plan materialization and incremental segmentation. Policy resolution is not the same state machine as creating a versioned speech plan from the earliest narratable prefix. The repository exposes content and job speech-plan routes, and the existing architecture separates this concern at docs/architecture/source-reader-flow-invariants.md:64-75.

Sync-fidelity and alignment decisions. Highlight-map, token, fragment, and alignment routes have exact/phrase/block/audio-only/source-only degradation semantics. Those are explicitly modeled by SyncFidelityDecision at docs/architecture/source-reader-flow-invariants.md:157-201; they are not merely reader rendering.

Pronunciation lexicon lifecycle. Project and voice-profile lexicons have CRUD, import, export, precedence, validation, and destructive transitions across twelve direct routes. This is not sufficiently owned by generic policy or settings flows.

Capability acquisition and credential activation. Research-module cloning, provider capability activation, credential save/delete, model/tool setup, and explicit consent for network/model work are user-triggered lifecycle operations. Passive diagnostics cannot own download, authentication, cancellation, cleanup, and degraded fallback.

Exact packet edits:

Add primary IDs equivalent to SRC-MANIFEST-001, SPEECH-PLAN-001, SYNC-FIDELITY-001, LEXICON-001, and CAPABILITY-ACTIVATE-001.

Recompute the flow count from the validated ownership map. Do not preserve 34 as an architectural target.

Move ERROR-RECOVERY-001 and BOUNDARY-001 out of the primary-flow count. Represent them as declared shared concerns referenced by concrete flows. Split boundary policy into local-origin/auth, filesystem, subprocess, network egress, and credential/secret concerns.

Add shared concern records for accessibility, privacy, internationalization, performance telemetry, and operational status rather than leaving these implemented app domains unmapped.

Generate a matrix proving all 123 routes and relevant frontend/backend state symbols belong to exactly one primary flow, with any additional memberships declared only as shared concerns.

Several current flow boundaries, terminal states, owners, and cancellation claims are unsafe.

Examples in manifest.json show that the generic model has already produced incorrect semantics:

PRJ-LIFE-001 combines create, open, rename, delete, and restore, although deletion success is not a “durable active project” (:99-108). Destructive deletion has a different commit and undo contract.

SRC-TEMP-001 classifies normal expiry and user-requested discard as failures (:135-144).

PREVIEW-001 treats “approved preview configuration” as the success of audio generation, conflating system completion with a subsequent user decision (:183-192).

TELEPROMPT-001 defines its success as a return target rather than a usable presenter session (:195-204).

PLAYBACK-001 combines paused, an active resumable state, with completed, a terminal state (:303-312).

CINEMA-001 calls an ongoing focused session a terminal success (:315-324).

SETTINGS-001 combines ordinary preference persistence, capability availability, import, and destructive reset (:411-420).

ERROR-RECOVERY-001 has a non-accountable cross-functional owner, while recovery must remain owned by the flow that created the failure.

The owner enum has 29 values for 34 flows, most used once. That is a labeling scheme, not stable accountability.

The universal cancellation label, “cancel without hidden mutation,” is false for imports, source promotion, project deletion, job execution, persistence recovery, artifact replacement, target builds, and repair. Cancellation after a commit cannot promise rollback.

Exact packet edits:

Split non-destructive project lifecycle from project delete/restore.

Split preview creation/playback from the user’s accept/change/skip decision, or model them as explicit separate branches.

Split normal settings persistence from settings import/reset and capability activation.

Define active-session, paused, completed, exited, canceled, interrupted, stale, and superseded as distinct states for playback and reader modes.

For every asynchronous or destructive flow, add:

cancellable phases;

the commit point;

pre-commit rollback/temporary-artifact cleanup;

post-commit “stop future work” behavior;

persisted canceled/interrupted state;

process-group termination behavior;

idempotency/retry identity;

whether compatible partial artifacts are retained, quarantined, or removed.

Replace one-off owner labels with a small stable primaryOwner set and optional secondaryOwners. Promotion, for example, should have an accountable project-data owner with source-ingestion as secondary; recovery remains owned by its originating flow.

The UX spine and supplied visual evidence do not yet meet the stated best-in-class bar.

The current spine at docs/architecture/best-in-class-ux-performance.md:13-17 makes review, audition, and audio creation appear sequential prerequisites to reading. That conflicts with the existing progressive architecture: readable source content can appear before narration, and the earliest narratable prefix can synthesize before full extraction (docs/architecture/source-reader-flow-invariants.md:65-75, :137-151).

The supplied screenshots also show unresolved hierarchy failures:

phone-390-workspace.png repeats the same missing-source message and Intake action across the task card, stage list, and status footer.

constrained-1100-workspace.png and desktop-1440-workspace.png simultaneously expose a source rail, five workflow cards, guided intake, inspector, global navigation, and a large status footer. The inspector collapses into extremely narrow word wrapping at 1100 px.

phone-390-settings.png clips scope/context text in the header and forces a long form below competing navigation.

phone-390-teleprompt-theatre.png gives roughly half the viewport to controls and return actions, truncates the title, and displays oversized cue text with horizontal clipping.

“Polish” and “content-first” in BIC-11 through BIC-13 are not sufficiently testable to prevent another broad redesign.

Exact packet edits:

Revise the product spine to progressive availability, for example:
Choose/create → add source → show first readable content → confirm or adjust scope → optional audition → start first playable prefix → read/listen while remaining work continues → repair/resume/export.

Add a required state matrix for every core surface: empty, connecting, loading, processing, partial/readable, partial/playable, ready, degraded, capability-unavailable, reconnecting, stale, interrupted, canceling, canceled, failed, blocked, and restored.

Require visual evidence for relevant states at 390, 1100, 1440, and 1920 px—not only happy-path surface screenshots.

Make these existing repository contracts explicit acceptance criteria:

no horizontal overflow or clipped content;

one dominant task and no duplicated visible action labels;

diagnostics hidden by default on normal-user surfaces;

below 1024 px, use the shared sheet pattern rather than inspector rails;

minimum 44×44 px touch targets;

safe-area handling;

keyboard, pointer, touch, command-palette, and shortcut paths call the same actions;

focus entry, trap, visible focus, and restoration;

live-region announcements;

reduced-motion, high-contrast, text-scale, spacing, measure, zoom, and reflow checks;

controls never occlude reader or presenter content.

Replace generic recovery text with a copy contract that states: what happened, what was preserved, whether retry can duplicate work/cost/egress, the next safe action, and where optional diagnostics live. “Explicitly blocked with owner” is internal project language, not user recovery language.

The exact startup path still violates the proposed zero-eager-work contract, and bounded external work is not covered atomically.

The repaired port mapping and lean defaults are correct: scripts/start-port-env.sh:23-74 maps API_PORT/PORT, and scripts/mise-start.sh:190-223 disables Qwen preload, reference bootstrap, and FlashAttention installation for start:local.

However, the exact command still enters scripts/start.sh, where:

python_requirements_present imports numpy, soundfile, kokoro, and other configured modules during launch (scripts/start.sh:303-335). This is eager heavyweight module execution.

Missing dependencies can trigger package synchronization during startup (scripts/start.sh:211-233, :817-869), introducing unbounded network/setup work into the launch command.

Readiness means only that a port is listening, not that /api/health or the frontend is usable (scripts/start.sh:642-665).

If neither ss nor lsof is available, the readiness check returns success unconditionally (scripts/start.sh:622-640).

The known Python dependency diagnostic uses unbounded exec.Command(...).CombinedOutput() (backend/internal/pipeline/research_modules.go:399-410).

Other unbounded subprocess sites exist, including Markdown adapter execution, PDF capability checks, and standalone Python import probes. Persistent workers have time-bounded reads, but need explicit process-tree shutdown and output limits.

Exact packet edits:

Restrict BIC-01 to the exact default launch contract: custom ports, no implicit bootstrap/install, no model/module import, no outbound network, HTTP-level readiness, project-create smoke, and bounded shutdown of the entire process tree.

Add a separate implementation issue for the bounded external-work contract. It must inventory every exec.Command, HTTP client, clone, download, provider request, and diagnostic probe; classify intentional persistent workers; and enforce deadline, cancellation, process-group termination, grace period, bounded stdout/stderr, temporary-file cleanup, and actionable error classification.

Test the exact command in a network-denied environment with empty model caches. Verify that it reaches /api/health, serves the frontend, and creates a project without Python model imports, provider calls, dependency installation, cache mutation, or hidden downloads.

Define readiness as successful HTTP responses, not listener presence. Failure to run the readiness mechanism must fail closed.

Add SIGINT/SIGTERM tests proving frontend, API, compiler/watcher, and Python descendants terminate within a specified bound.

Keep active capability acquisition user-triggered and observable through the new capability flow.

The performance budgets are not reproducible, are internally inconsistent, and are gated too late.

The hard targets at docs/architecture/best-in-class-ux-performance.md:43-59 omit the measurement protocol: reference machine, run count, warm-up, cache state, readiness mark, sampling interval, process-tree accounting, production versus development mode, and failure treatment.

There are also conflicting sources of truth:

The architecture and benches/thresholds.json use a 15 KB initial CSS gzip limit, while docs/performance.md:64-74 says 14 KB.

Existing interaction metrics measure end-to-end operations as high as 850–2200 ms (docs/performance.md:76-93), while the candidate introduces a 100 ms “visible action response” without defining that as feedback acknowledgement rather than operation completion.

Current BIC-14 runs only after App extraction and responsive work (tts-research-best-in-class-batch-draft.md:193-204), so the packet permits bundle, render, interaction, and idle-resource regressions before the enforcement harness exists.

The App.tsx line target is a maintainability proxy, not sufficient performance evidence by itself.

Exact packet edits:

Make benches/thresholds.json the single machine-readable source for numerical thresholds and generate prose tables from it. Resolve the 14/15 KB discrepancy before issue creation.

Define each startup and interaction mark, including whether it measures visible acknowledgement, state commit, or completed operation.

Specify a reference machine class, one discarded warm-up, at least ten measured startup runs, p50/p95/max output, cache/build state, and separate compile versus runtime-init measurements.

Measure idle CPU and RSS for the complete descendant process tree, not only the immediate Go and Vite processes.

Add deterministic startup-egress evidence, long-task traces, render-count evidence, bundle graphs, and low-resource runs with no GPU/CUDA present.

Establish runtime and frontend performance baselines before App extraction and UX implementation. Every subsequent issue must rerun the affected gate.

Split App extraction into phases with characterization tests, render-count baselines, lazy-chunk checks, bundle checks, and progressive line limits. The final phase must enforce App.tsx <2,000 and no replacement module over 3,000 lines.

The proposed issues are not atomic enough, and their acceptance criteria are not verifiable.

All 16 issues repeat the same first four generic acceptance statements, and each repeats its deliverable verbatim as the final criterion. BIC-10 attempts to reduce a 21,168-line orchestrator below 2,000 lines in one issue. BIC-13 combines four materially different interaction modes. BIC-14 combines startup, subprocess/network behavior, bundle, interactions, idle resources, and low-resource operation. BIC-15 would be able to discover fixes but has no rule preventing implementation inside an evidence issue.

Exact packet edits:

Remove BIC-00 as an active issue. Use the Linear project or a milestone for parent closeout so it does not consume active-issue capacity or misuse dependency semantics.

Replace the logical issue order with the following maximum 20-issue structure:

Exact-command lean startup, custom ports, HTTP readiness, and bounded shutdown.

Bounded subprocess/network/diagnostic execution contract and remediation.

Flow schema, primary/shared-concern model, and fail-closed semantic validator.

Shell, navigation, command, project, and UI-memory flow contracts.

Source intake, URL, temporary, manifest, review, promotion, and repair contracts.

Narration settings, policy resolution, speech-plan, and lexicon contracts.

Capability activation, credentials, voice lifecycle, and preview contracts.

Job, event, persistence, and audio-artifact contracts.

Playback, sync-fidelity, progress, and reader-mode contracts.

Portability, operational recovery, trust-boundary, and diagnostics contracts.

App characterization plus shell/shared-state/action extraction; App.tsx ≤14,000 lines.

Intake/review/voice/job orchestration extraction; App.tsx ≤7,000 lines.

Reader/playback/overlay extraction; App.tsx <2,000, no replacement module over 3,000 lines.

Project library and source-intake UX.

Scope review, preview, and generation/recovery UX.

Reader and Cinema responsive/content-first UX.

Teleprompt and Theatre presenter UX.

Runtime startup, egress, shutdown, idle-CPU, and process-tree resource gate.

Frontend bundle, render, interaction, long-task, read-along, and low-resource gate.

Evidence-only accessibility, visual, flow-coverage, PO-verification, and advisory peer gate.

BIC-03 must not depend on startup work; those can proceed in parallel.

Establish BIC-18 and BIC-19 baselines before BIC-11 through BIC-17. Extraction depends on completed domain contracts and the frontend baseline. UX issues depend on their relevant extraction phases. BIC-20 depends on all product work and reruns both performance gates.

BIC-20 must be evidence-only. A discovered defect reopens or creates a bounded predecessor; it is not repaired inside the gate.

Give every issue explicit inScope, outOfScope, primaryOwnerSurface, flowIds, routePatterns, stateSymbols, existingIssueLinks, verificationCommands, artifactPaths, exact numerical thresholds, negative tests, rollback expectations, and required PO checks.

Make the JSON the canonical packet and generate the Markdown from it; add a parity validator.

The packet does not prove Linear capacity or reconcile existing work.

The packet records only activeCap: 20 and proposedCount: 16 at tts-research-best-in-class-batch-draft.json:6-8. It does not record the existing active count. The project setup’s last verified snapshot says 20 active and forbids new creation (docs/project-management/linear/tts-research-project-setup.md:13-20, :44-46). A later archive shows nine completed issues were archived, but that still does not establish the current count or prove sixteen free slots.

The new packet also overlaps existing or completed work including source-manifest events, incremental speech plans, artifact states, sync fidelity, progress, retry, repair, promotion, reader transport/windowing, the phone Theatre control defect, the UI action audit, and the prior final evidence gate.

Exact packet edits:

Add a fresh, timestamped capacitySnapshot to the JSON containing activeUnarchivedBefore, newIssuesCreatedNow, activeUnarchivedAfter, cap, compliant, and the repo artifact used to verify the count.

Create only the issue prefix that satisfies activeUnarchivedBefore + newIssuesCreatedNow ≤ 20; retain later issues as repo-local staged drafts until capacity exists.

Add an existingIssueReconciliation section mapping every BIC issue to relevant QQP issues with one explicit relationship: extends, documents-existing, supersedes, depends-on, or no-overlap.

State that completed first-batch behavior is characterized and preserved, not reimplemented under a new issue.

Do not create or mutate any Linear item until the corrected packet, fresh capacity snapshot, semantic validator output, deterministic evidence commands, and PO creation approval are all present.

This review is advisory and based on deterministic static inspection of the archive plus its supplied visual evidence. Repo-local validators, tests, generated performance/accessibility artifacts, and PO verification remain authoritative.
