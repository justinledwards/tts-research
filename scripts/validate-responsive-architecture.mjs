#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_CONTRACT_JSON_PATH = "docs/architecture/responsive-cinema-contract-v1.json";
export const DEFAULT_CONTRACT_MARKDOWN_PATH = "docs/architecture/responsive-cinema-contract-v1.md";
export const DEFAULT_PEER_RESPONSE_PATH =
  "docs/reviews/chatgpt-responsive-architecture-response-v1.md";
export const REQUIRED_PEER_MARKER = "TTS_RESPONSIVE_ARCHITECTURE_REQUEST_CHANGES";
export const EXPECTED_PEER_RESPONSE_SHA256 =
  "6778a6fe0833313f7ea679379fb6a4962e0e2d3cfc3ea2e3525dc6bf20a4e1f7";
export const EXPECTED_REVIEW_ARCHIVE_SHA256 =
  "fef0fa919baf138a194c59d88e79400595b3040ea6b5c8f26afe20a44d1b3b8f";
export const EXPECTED_ISSUE_IDS = Array.from(
  { length: 15 },
  (_, index) => `RSP-${String(index + 1).padStart(2, "0")}`,
);

const EXPECTED_AUTHORIZATION = {
  ownerAccepted: true,
  peerApproved: false,
  linearCreationAuthorized: false,
  productImplementationAuthorized: false,
  graphUnblockedIssues: ["RSP-01"],
  authorizedIssues: [],
};
const EXPECTED_OWNER_DECISION = {
  decidedAt: "2026-07-10T19:51:37+02:00",
  authority: "acting_product_owner",
  decision: "accept_rsp_01_through_rsp_15_in_repo_strangler_remake",
  repositoryStrategy: "continue_in_current_repository",
  newRepositoryAuthorized: false,
  peerV2Required: true,
};
const EXPECTED_BINDING_FIELDS = [
  "runId",
  "sourceId",
  "sourceRevisionId",
  "sourceContentHash",
  "voiceProfileVersion",
  "engineId",
  "engineConfigurationHash",
  "speechPolicyHash",
  "segmentationPolicyVersion",
  "audioFormat",
];
const EXPECTED_EVENT_FIELDS = [
  "schemaVersion",
  "eventId",
  "runId",
  "sequence",
  "occurredAt",
  "sourceId",
  "sourceRevisionId",
  "type",
  "payload",
];
const EXPECTED_EVENT_TYPES = [
  "run.accepted",
  "run.phaseChanged",
  "manifest.segmentPlayable",
  "manifest.segmentReplaced",
  "manifest.segmentFailed",
  "sync.updated",
  "run.cancelRequested",
  "run.cancelled",
  "run.interrupted",
  "run.failed",
  "run.completed",
  "heartbeat",
];
const EXPECTED_BUDGETS = [
  ["preparedSourceListServerTime", 50, 150, "ms"],
  ["sourceListClientIngestion", 75, 200, "ms"],
  ["selectedSourceDetailHydration", 120, 300, "ms"],
  ["readySourceToCinemaEnabled", 16, 50, "ms"],
  ["residentDataCinemaOpen", 50, 100, "ms"],
  ["firstUsefulColdShell", 650, 1000, "ms"],
  ["visibleActionAcknowledgement", 16, 75, "ms"],
  ["playbackCommandAcknowledgement", 16, 50, "ms"],
  ["narrationRequestAcceptance", 50, 150, "ms"],
  ["warmLocalFirstPlayable", 10, 20, "s"],
  ["coldLocalFirstPlayable", 20, 35, "s"],
  ["progressiveAdvantage", null, 0.35, "ratio"],
  ["artifactCommitToSseFlush", 25, 100, "ms"],
  ["eventReceiptToEnabledTransport", 32, 100, "ms"],
  ["commitToEnabledTransport", 100, 250, "ms"],
  ["reconnectConvergence", 250, 1000, "ms"],
  ["predecodedIntersegmentGap", 20, 50, "ms"],
  ["cursorContinuity", null, null, "ms"],
  ["mainThreadGenerationSession", null, null, "count"],
  ["overlayGeometry", null, null, "count"],
];
const EXPECTED_BUNDLE_GATES = {
  maxInitialJsRawBytes: 523700,
  maxInitialJsGzipBytes: 160000,
  maxInitialCssGzipBytes: 15000,
  maxLargestAsyncApplicationChunkGzipBytes: 110000,
};
const EXPECTED_VIEWPORTS = [390, 1100, 1440, 1920];
const EXPECTED_SYNC_LEVELS = ["sourceOnly", "audioOnly", "phraseFollow", "trustedWordFollow"];

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function nonemptyStrings(values, label) {
  invariant(Array.isArray(values) && values.length > 0, `${label} must be a nonempty array`);
  invariant(
    values.every((value) => typeof value === "string" && value.trim().length > 0),
    `${label} must contain only nonempty strings`,
  );
}

function formatLimit(value, unit) {
  if (value === null) return "—";
  return unit === "ratio" ? String(value) : `${value} ${unit}`;
}

function jsonInline(value) {
  return `\`${JSON.stringify(value)}\``;
}

export function parsePeerIssueGraph(peerText) {
  invariant(
    peerText.split(/\r?\n/, 1)[0] === REQUIRED_PEER_MARKER,
    `Peer response must begin with ${REQUIRED_PEER_MARKER}`,
  );
  const dependencies = {
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
  return { issueIds: EXPECTED_ISSUE_IDS, dependencies };
}

export function validateArchitectureContract(contract, peerText) {
  parsePeerIssueGraph(peerText);
  const peerResponseSha256 = createHash("sha256").update(peerText).digest("hex");
  invariant(
    peerResponseSha256 === EXPECTED_PEER_RESPONSE_SHA256,
    "Peer response bytes do not match the reviewed SHA-256",
  );
  invariant(
    contract.schemaVersion === "tts-research.responsive-cinema-contract.v1",
    "unexpected responsive architecture schemaVersion",
  );
  invariant(
    contract.status === "owner_accepted_peer_pending",
    "contract status must remain owner_accepted_peer_pending",
  );
  invariant(
    contract.source?.peerResponsePath === DEFAULT_PEER_RESPONSE_PATH,
    "contract must cite the exact Peer response path",
  );
  invariant(
    contract.source?.requiredFirstLineMarker === REQUIRED_PEER_MARKER,
    "contract Peer marker drift",
  );
  invariant(
    contract.source?.peerResponseSha256 === EXPECTED_PEER_RESPONSE_SHA256,
    "contract Peer response SHA-256 drift",
  );
  invariant(
    contract.source?.reviewArchiveSha256 === EXPECTED_REVIEW_ARCHIVE_SHA256,
    "contract reviewed archive SHA-256 drift",
  );
  invariant(
    same(contract.ownerDecision, EXPECTED_OWNER_DECISION),
    "owner decision must preserve the accepted in-repository strangler-remake strategy and independent Peer v2 gate",
  );
  invariant(
    same(contract.authorization, EXPECTED_AUTHORIZATION),
    "authorization must keep owner acceptance true, Peer/Linear/product gates false, and only RSP-01 graph-unblocked",
  );

  const invariantIds = contract.ownerInvariants?.map(({ id }) => id);
  invariant(
    same(invariantIds, [
      "cinema-source-ready-before-audio",
      "reading-only-before-narration",
      "first-playable-same-session",
      "preview-audition-voice-only",
      "responsive-performance-release-blocking",
    ]),
    "owner invariants must remain complete and ordered",
  );
  invariant(
    contract.ownerInvariants.every(({ releaseBlocking }) => releaseBlocking === true),
    "every owner invariant must be release-blocking",
  );

  invariant(contract.ownership?.length === 7, "exactly seven lifecycle ownership domains required");
  invariant(
    contract.ownership.every(({ maxClientAuthorities }) => maxClientAuthorities === 1),
    "every lifecycle must have exactly one client authority",
  );
  const playbackOwner = contract.ownership.find(
    ({ domain }) => domain === "playbackCursorAndIntent",
  );
  invariant(
    playbackOwner?.clientAuthority === "PlaybackSessionController",
    "PlaybackSessionController must be the sole playback authority",
  );
  const previewOwner = contract.ownership.find(({ domain }) => domain === "voicePreviewAudition");
  invariant(
    same(previewOwner?.stableIdentity, ["previewId"]) &&
      same(previewOwner?.forbiddenIdentity, ["runId"]),
    "voice Preview/Audition must use previewId and forbid runId",
  );

  invariant(
    same(contract.sourceContract?.revisionIdentityFields, [
      "sourceId",
      "revisionId",
      "contentHash",
    ]),
    "source revision identity must require sourceId, revisionId, and contentHash",
  );
  invariant(
    contract.sourceContract.cinemaPinsRevision === true,
    "Cinema must pin its source revision",
  );
  invariant(
    contract.sourceContract.silentRevisionSubstitutionAllowed === false,
    "silent source revision substitution must be forbidden",
  );
  const summary = contract.sourceContract.summaryDto;
  invariant(
    summary?.canonicalFixtureSourceCount === 26,
    "summary DTO canonical fixture must contain 26 sources",
  );
  invariant(summary?.maxRawBytes === 65536, "summary DTO raw limit must be exactly 64 KiB");
  invariant(summary?.maxBaseBytes === 8192, "summary DTO base limit must be exactly 8 KiB");
  invariant(
    summary?.maxPerSourceBytes === 2304,
    "summary DTO per-source limit must be exactly 2.25 KiB",
  );
  invariant(
    same(summary?.forbiddenFields, [
      "blocks",
      "text",
      "speechText",
      "transcript",
      "skippedItems",
      "unboundedMetadata",
    ]),
    "summary DTO must forbid all detailed/unbounded fields",
  );

  invariant(
    same(contract.narrationRunContract?.bindingFields, EXPECTED_BINDING_FIELDS),
    "narration run binding must include exact immutable source/configuration fields",
  );
  invariant(
    contract.narrationRunContract?.playabilityEncodedAsRunPhase === false,
    "playability must not be encoded as a narration run phase",
  );
  invariant(
    contract.narrationRunContract?.bindingImmutable === true &&
      contract.narrationRunContract?.retryCreatesNewRunId === true,
    "run binding must be immutable and retry must create a new runId",
  );

  invariant(
    contract.mediaManifestContract?.capabilities?.canPlayAudio ===
      "contiguousPlayableDurationMs > 0",
    "playability must derive from contiguousPlayableDurationMs > 0",
  );
  invariant(
    contract.mediaManifestContract?.onlyContiguousCompatiblePrefixAutoPlayable === true,
    "only a contiguous compatible prefix may be automatically playable",
  );
  invariant(
    contract.mediaManifestContract?.finalAssemblyRequiredForPlayback === false,
    "final assembly must not gate playback",
  );
  invariant(
    same(
      contract.mediaManifestContract?.firstSegmentPolicy?.targetEstimatedSpeechSeconds,
      [4, 8],
    ) && contract.mediaManifestContract?.firstSegmentPolicy?.hardTargetMaximumSeconds === 12,
    "first segment policy must target 4–8 seconds with a 12-second hard target maximum",
  );

  invariant(
    same(contract.eventContract?.envelopeFields, EXPECTED_EVENT_FIELDS),
    "event envelope must include exact sequenced revision-bound fields",
  );
  invariant(
    same(contract.eventContract?.eventTypes, EXPECTED_EVENT_TYPES),
    "required narration event types drift",
  );
  invariant(contract.eventContract?.durable === true, "event stream must be durable");
  invariant(
    contract.eventContract?.monotonicPerRun === true,
    "event sequence must be monotonic per run",
  );
  invariant(
    same(contract.eventContract?.snapshotFields, ["snapshotSequence"]),
    "snapshotSequence is required",
  );
  invariant(
    same(contract.eventContract?.reconnectInputs, ["Last-Event-ID", "afterSequence"]),
    "reconnect must support Last-Event-ID and afterSequence",
  );
  invariant(
    contract.eventContract?.reducerRules?.length === 3,
    "duplicate/exact-next/gap reducer rules are required",
  );
  invariant(
    contract.eventContract?.persistBeforePublish?.includes("sequenceRecord"),
    "event sequence record must be durable before publication",
  );

  const playback = contract.playbackContract;
  invariant(
    playback?.maxActiveControllersPerSession === 1,
    "exactly one playback controller is allowed per session",
  );
  invariant(
    playback?.maxAudioOwnersPerSession === 1,
    "exactly one audio owner is allowed per session",
  );
  invariant(
    playback?.arrivalCompletedModeSwitchAllowed === false,
    "arrival/completed player switching must be forbidden",
  );
  invariant(
    playback?.finalAssemblyMayReplaceController === false,
    "final assembly must not replace the controller",
  );
  invariant(
    playback?.manifestAppendCapable === true,
    "playback controller must append compatible manifest segments",
  );
  invariant(playback?.restoreState === "paused", "restoration must open paused");

  invariant(
    same(contract.syncContract?.levels, EXPECTED_SYNC_LEVELS),
    "sync fidelity levels drift",
  );
  invariant(
    contract.syncContract?.independentFromRunFailure === true,
    "sync failure must be independent from run failure",
  );
  invariant(
    contract.syncContract?.timingFailureResult === "audioOnly",
    "timing failure must downgrade to audioOnly",
  );

  const cinema = contract.uxContract?.cinema;
  invariant(
    cinema?.availabilityDerivation ===
      "sourceRevisionReady || sourceSummaryReadyForImmediateShellHydration",
    "Cinema availability must derive from source readiness, never terminal audio",
  );
  invariant(
    cinema?.forbiddenDependencies?.includes('generatedAudioLifecycle === "ready"'),
    "terminal generated-audio Cinema gate must be explicitly forbidden",
  );
  invariant(
    contract.uxContract?.regularNarrationTransportOwner === "reader/Cinema session",
    "regular narration transport must belong to the reader/Cinema session",
  );
  invariant(
    same(contract.uxContract?.firstPlayableAddsToSameSession, ["transport", "read-along"]),
    "first playable segment must add transport and read-along to the same session",
  );
  invariant(
    same(contract.uxContract?.previewAudition?.allowedWorkflows, [
      "voice-cloning",
      "voice-comparison",
    ]),
    "Preview/Audition must be limited to voice-cloning and voice-comparison",
  );

  const responsive = contract.responsiveContract;
  invariant(
    same(responsive?.viewportWidthsCssPx, EXPECTED_VIEWPORTS),
    "responsive viewports must be 390/1100/1440/1920 CSS px",
  );
  invariant(responsive?.releaseBlocking === true, "responsive behavior must be release-blocking");
  for (const field of [
    "maxDuplicateVisibleActionLabels",
    "maxHorizontalOverflow",
    "maxControlContentOcclusions",
    "maxPrimaryActionHitTestInterceptions",
  ])
    invariant(responsive?.[field] === 0, `${field} must be zero`);
  invariant(
    responsive?.maxDominantActionsPerSurface === 1,
    "only one dominant action per surface is allowed",
  );

  const performance = contract.performanceContract;
  invariant(
    performance?.releaseBlocking === true,
    "responsive performance must be release-blocking",
  );
  invariant(
    performance?.extendsExistingThresholdsWithoutLoosening === true,
    "existing thresholds may not be loosened",
  );
  invariant(performance?.discardedWarmupRuns === 1, "exactly one discarded warm-up is required");
  invariant(performance?.minMeasuredRuns >= 10, "at least ten measured runs are required");
  invariant(
    same(performance?.statistics, ["p50", "p95", "maximum"]),
    "p50/p95/maximum statistics are required",
  );
  invariant(
    performance?.missingResultIsPass === false,
    "missing performance results must fail closed",
  );
  invariant(
    performance?.negativeBudgetFixturesRequired === true,
    "negative budget fixtures are required",
  );
  invariant(
    same(performance?.existingBundleGates, EXPECTED_BUNDLE_GATES),
    "existing bundle gates must remain unchanged",
  );
  invariant(
    performance?.budgets?.length === EXPECTED_BUDGETS.length,
    "all 20 responsive budgets are required",
  );
  const actualBudgetShape = performance.budgets.map(({ id, p50Max, p95Max, unit }) => [
    id,
    p50Max,
    p95Max,
    unit,
  ]);
  invariant(same(actualBudgetShape, EXPECTED_BUDGETS), "responsive p50/p95 budget values drift");
  for (const budget of performance.budgets) {
    invariant(
      typeof budget.metric === "string" && budget.metric.length > 0,
      `${budget.id}: metric required`,
    );
    invariant(
      typeof budget.measurementWindow === "string" && budget.measurementWindow.length > 0,
      `${budget.id}: measurement window required`,
    );
    invariant(
      typeof budget.additionalGate === "string" && budget.additionalGate.length > 0,
      `${budget.id}: additional gate required`,
    );
  }
  invariant(
    same(performance?.requiredRawArtifactBindings, [
      "sourceSha",
      "buildSha",
      "machineMetadata",
      "fixtureId",
      "providerEngineConfiguration",
      "thresholdFileHash",
      "coldWarmCacheState",
    ]),
    "raw performance evidence bindings are incomplete",
  );

  nonemptyStrings(contract.instrumentation?.frontendMarks, "frontend instrumentation marks");
  nonemptyStrings(
    contract.instrumentation?.backendBoundaries,
    "backend instrumentation boundaries",
  );
  invariant(
    contract.instrumentation?.frontendMarks?.includes("playback_controller_created") &&
      contract.instrumentation?.frontendMarks?.includes("transport_enabled"),
    "controller and transport instrumentation marks are required",
  );
  invariant(
    contract.instrumentation?.sensitiveSourceOrVoiceMaterialAllowed === false,
    "metrics must forbid source text and sensitive voice material",
  );
  nonemptyStrings(contract.currentBaseline?.knownViolationIds, "known baseline violation IDs");
  invariant(
    contract.currentBaseline?.evidenceStatus === "known_failures_recorded_not_ci_expected_failures",
    "current known failures must be recorded without intentionally failing CI",
  );
  invariant(
    contract.currentBaseline?.recordedPreparedSourceListBytes === 4338805 &&
      contract.currentBaseline?.estimatedCompactRepresentationBytes === 28962,
    "prepared-source baseline bytes must match direct runtime evidence",
  );
}

export function renderArchitectureMarkdown(contract) {
  const authorization = contract.authorization;
  const lines = [
    "<!-- Generated by scripts/validate-responsive-architecture.mjs; edit the canonical JSON, not this file. -->",
    "",
    "# Responsive Cinema architecture contract v1",
    "",
    `Status: \`${contract.status}\``,
    "",
    `Peer verdict marker: \`${contract.source.requiredFirstLineMarker}\``,
    "",
    `Peer response: \`${contract.source.peerResponsePath}\``,
    `Peer response SHA-256: \`${contract.source.peerResponseSha256}\``,
    `Reviewed archive SHA-256: \`${contract.source.reviewArchiveSha256}\``,
    "",
    "## Authorization gate",
    "",
    `- Owner accepted: \`${authorization.ownerAccepted}\``,
    `- Peer approved: \`${authorization.peerApproved}\``,
    `- Linear creation authorized: \`${authorization.linearCreationAuthorized}\``,
    `- Product implementation authorized: \`${authorization.productImplementationAuthorized}\``,
    `- Graph-unblocked only: ${authorization.graphUnblockedIssues.map((id) => `\`${id}\``).join(", ")}`,
    "- RSP-01 is graph-unblocked only; it is not authorized for implementation or Linear creation.",
    "",
    "## Owner invariants",
    "",
    ...contract.ownerInvariants.map(({ id, statement }) => `- **${id}**: ${statement}`),
    "",
    "## Lifecycle ownership",
    "",
    "| Domain | Server authority | Client authority | Stable identity |",
    "| --- | --- | --- | --- |",
    ...contract.ownership.map(
      ({ domain, serverAuthority, clientAuthority, stableIdentity }) =>
        `| ${domain} | ${serverAuthority ?? "none"} | ${clientAuthority} | ${stableIdentity.map((field) => `\`${field}\``).join(", ")} |`,
    ),
    "",
    "Every lifecycle has one authoritative client owner. The active playback session permits one controller and one audio/Web Audio owner.",
    "",
    "## Source and revision contract",
    "",
    `- Server states: ${contract.sourceContract.serverStates.map((value) => `\`${value}\``).join(" → ")}`,
    `- Client hydration states: ${contract.sourceContract.clientStates.map((value) => `\`${value}\``).join(" → ")}`,
    `- Revision identity: ${contract.sourceContract.revisionIdentityFields.map((value) => `\`${value}\``).join(", ")}`,
    "- Cinema pins the selected immutable revision; a newer revision marks the session stale and never silently substitutes content.",
    `- Prepared-source summary DTO: 26-source raw payload ≤ ${contract.sourceContract.summaryDto.maxRawBytes} bytes; base ≤ ${contract.sourceContract.summaryDto.maxBaseBytes} bytes + ${contract.sourceContract.summaryDto.maxPerSourceBytes} bytes/source.`,
    `- Forbidden summary detail fields: ${contract.sourceContract.summaryDto.forbiddenFields.map((value) => `\`${value}\``).join(", ")}`,
    "",
    "## Narration run and media capability contract",
    "",
    `- Execution states: ${contract.narrationRunContract.executionStates.map((value) => `\`${value}\``).join(", ")}`,
    `- Immutable run binding fields: ${contract.narrationRunContract.bindingFields.map((value) => `\`${value}\``).join(", ")}`,
    `- Manifest fields: ${contract.mediaManifestContract.fields.map((value) => `\`${value}\``).join(", ")}`,
    `- Segment fields: ${contract.mediaManifestContract.segmentFields.map((value) => `\`${value}\``).join(", ")}`,
    `- \`canPlayAudio\`: \`${contract.mediaManifestContract.capabilities.canPlayAudio}\``,
    `- \`canContinueWithoutBuffering\`: \`${contract.mediaManifestContract.capabilities.canContinueWithoutBuffering}\``,
    `- \`isFullyGenerated\`: \`${contract.mediaManifestContract.capabilities.isFullyGenerated}\``,
    `- \`hasFinalAssembly\`: \`${contract.mediaManifestContract.capabilities.hasFinalAssembly}\``,
    "- Run phase never encodes playability; only a contiguous compatible manifest prefix does.",
    "- Initial segments target 4–8 seconds with a 12-second hard target maximum and safe clause/phrase fallback.",
    "",
    "## Sequenced event and reconciliation contract",
    "",
    `- Envelope fields: ${contract.eventContract.envelopeFields.map((value) => `\`${value}\``).join(", ")}`,
    `- Event types: ${contract.eventContract.eventTypes.map((value) => `\`${value}\``).join(", ")}`,
    `- Snapshot cursor: ${contract.eventContract.snapshotFields.map((value) => `\`${value}\``).join(", ")}`,
    `- Reconnect cursors: ${contract.eventContract.reconnectInputs.map((value) => `\`${value}\``).join(", ")}`,
    ...contract.eventContract.reducerRules.map(
      ({ condition, action }) => `- \`${condition}\`: ${action}.`,
    ),
    "- Artifact, manifest, run snapshot, and sequence record are durable before event publication.",
    "",
    "## Playback and sync contract",
    "",
    `- Playback states: ${contract.playbackContract.states.map((value) => `\`${value}\``).join(", ")}`,
    "- Later compatible segments append to the same controller; arrival/completed player switching is forbidden.",
    "- Terminal completion and final assembly do not replace controller identity, cursor, rate, callbacks, or UI.",
    `- Sync levels: ${contract.syncContract.levels.map((value) => `\`${value}\``).join(", ")}`,
    "- Sync may upgrade or downgrade without remounting. Timing failure yields audio-only and never disables reading or audio.",
    "",
    "## Exact UX and responsive contract",
    "",
    `- Cinema availability derives from \`${contract.uxContract.cinema.availabilityDerivation}\`.`,
    `- Terminal audio dependencies are forbidden: ${contract.uxContract.cinema.forbiddenDependencies.map((value) => `\`${value}\``).join(", ")}`,
    "- The first playable segment adds transport and read-along to the already-mounted Cinema session.",
    "- Regular narration belongs to the reader/Cinema controller. Preview/Audition accepts preview IDs only and is restricted to voice cloning/comparison.",
    `- Required viewport widths: ${contract.responsiveContract.viewportWidthsCssPx.map((value) => `\`${value}px\``).join(", ")}`,
    "- Every primary action must pass geometry and elementFromPoint checks; overlays, highlights, drawers, focus, touch targets, overflow, and dominant-action counts fail closed.",
    "",
    "## Release-blocking performance contract",
    "",
    `- Machine class: \`${contract.performanceContract.machineClass.id}\`, ${contract.performanceContract.machineClass.logicalCpuRange.join("–")} logical CPUs, ≥${contract.performanceContract.machineClass.minMemoryGiB} GiB RAM, SSD, no required GPU.`,
    `- Protocol: one discarded warm-up, at least ${contract.performanceContract.minMeasuredRuns} measured runs, p50/p95/maximum, explicit cold/warm/cache state, localhost only.`,
    `- Raw evidence bindings: ${contract.performanceContract.requiredRawArtifactBindings.map((value) => `\`${value}\``).join(", ")}`,
    "",
    "| Metric | Window | p50 max | p95 max | Additional gate |",
    "| --- | --- | ---: | ---: | --- |",
    ...contract.performanceContract.budgets.map(
      ({ metric, measurementWindow, p50Max, p95Max, unit, additionalGate }) =>
        `| ${metric} | ${measurementWindow} | ${formatLimit(p50Max, unit)} | ${formatLimit(p95Max, unit)} | ${additionalGate} |`,
    ),
    "",
    `Existing bundle gates remain unchanged: ${Object.entries(
      contract.performanceContract.existingBundleGates,
    )
      .map(([key, value]) => `\`${key}=${value}\``)
      .join(", ")}.`,
    "",
    "## Instrumentation and failure recovery",
    "",
    `- Frontend marks: ${contract.instrumentation.frontendMarks.map((value) => `\`${value}\``).join(", ")}`,
    `- Frontend dimensions: ${contract.instrumentation.frontendDimensions.map((value) => `\`${value}\``).join(", ")}`,
    `- Backend boundaries: ${contract.instrumentation.backendBoundaries.map((value) => `\`${value}\``).join(", ")}`,
    "- Metrics contain no source text or sensitive voice material.",
    "- Cancellation, interruption, reconnect, checker/timing/final-assembly failure, and rich-renderer failure preserve the independent readable/playable capabilities described by the contract.",
    "",
    "## Current baseline (known failures, not expected-failing CI)",
    "",
    `- Evidence status: \`${contract.currentBaseline.evidenceStatus}\``,
    `- Recorded violations: ${contract.currentBaseline.knownViolationIds.map((value) => `\`${value}\``).join(", ")}`,
    `- Baseline details: ${jsonInline({
      preparedSourceListBytes: contract.currentBaseline.recordedPreparedSourceListBytes,
      preparedSourceCount: contract.currentBaseline.recordedPreparedSourceCount,
      sseSnapshotCadenceMs: contract.currentBaseline.recordedSseSnapshotCadenceMs,
      mainJsGzipBytes: contract.currentBaseline.recordedMainJsGzipBytes,
      cssGzipBytes: contract.currentBaseline.recordedCssGzipBytes,
    })}`,
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function loadArchitectureInputs(root = process.cwd()) {
  const [contract, peerText] = await Promise.all([
    readFile(path.join(root, DEFAULT_CONTRACT_JSON_PATH), "utf8").then(JSON.parse),
    readFile(path.join(root, DEFAULT_PEER_RESPONSE_PATH), "utf8"),
  ]);
  return { contract, peerText };
}

export async function runArchitectureValidation({ root = process.cwd(), write = false } = {}) {
  const { contract, peerText } = await loadArchitectureInputs(root);
  validateArchitectureContract(contract, peerText);
  const rendered = renderArchitectureMarkdown(contract);
  const markdownPath = path.join(root, DEFAULT_CONTRACT_MARKDOWN_PATH);
  if (write) {
    await writeFile(markdownPath, rendered);
    return { mode: "write", budgetCount: contract.performanceContract.budgets.length };
  }
  const current = await readFile(markdownPath, "utf8");
  invariant(
    current === rendered,
    `${DEFAULT_CONTRACT_MARKDOWN_PATH} is not in parity; run node scripts/validate-responsive-architecture.mjs --write`,
  );
  return { mode: "check", budgetCount: contract.performanceContract.budgets.length };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runArchitectureValidation({ write: process.argv.includes("--write") })
    .then(({ mode, budgetCount }) => {
      console.log(
        `responsive architecture ${mode} passed: lifecycle, capability, revision, event, playback, sync, UX, and ${budgetCount} performance budgets valid`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
