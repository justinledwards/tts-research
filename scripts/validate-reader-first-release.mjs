#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CONTRACT_PATH = "docs/architecture/reader-first-release-contract-v2.json";
export const PACKET_PATH =
  "docs/project-management/linear/tts-research-reader-first-release-batch-draft.json";
export const MARKDOWN_PATH =
  "docs/project-management/linear/tts-research-reader-first-release-batch-draft.md";
export const PLAN_PATH = "docs/plans/2026-07-10-reader-first-release-reset.md";
export const PROVENANCE_PATH =
  "docs/project-management/linear/tts-research-reader-first-linear-provenance.json";
export const LIVE_MANIFEST_PATH =
  "docs/project-management/linear/tts-research-reader-first-release-batch.manifest.json";
export const ISSUE_IDS = Array.from(
  { length: 20 },
  (_, index) => `RFA-${String(index + 1).padStart(2, "0")}`,
);

const EXPECTED_CONTRACT_SHA256 = "a3b2f75fa7393f93f0d2494bc5825c44e758dd2220d1fc3a78300d72a43ec868";
const EXPECTED_CONTRACT_CANONICAL_SHA256 =
  "c7d6098d0ec9a7243681be136f4654ef7af180452bb5a22cec2660924a17e719";
const EXPECTED_PACKET_SHA256 = "aa5e20a24b856caea74b78d224ac80307b7290f05cc35cb4169da7d9e1bdd44b";
const EXPECTED_PACKET_CANONICAL_SHA256 =
  "d32eb4b5ba5990a18e33e1a3d0a892731c9e59b8ffedf5beb3fcfd6706aacbef";
const EXPECTED_MARKDOWN_SHA256 = "c9a55e887a9fabd88b8d2568f1a08071cd17aece179ddec1df11994a16d34a90";
const EXPECTED_STATUS = "peer_approved_linear_created_rfa_01_product_authorized";
const EXPECTED_AUTHORIZATION = {
  ownerAccepted: true,
  peerApproved: true,
  linearCreationAuthorized: true,
  productImplementationAuthorized: true,
  graphUnblockedIssues: ["RFA-01"],
  authorizedIssues: ["RFA-01"],
};
const REQUIRED_REQUIREMENTS = [
  "cross-browser-server-authority",
  "instant-progressive-readalong",
  "structure-aware-narration",
  "no-preview-in-narration",
  "truthful-lightweight-completion",
  "best-in-class-rebalance",
];
const EXPECTED_DEPENDENCIES = {
  "RFA-01": [],
  "RFA-02": ["RFA-01"],
  "RFA-03": ["RFA-01"],
  "RFA-04": ["RFA-01"],
  "RFA-05": ["RFA-04"],
  "RFA-06": ["RFA-02", "RFA-05"],
  "RFA-07": ["RFA-01", "RFA-05"],
  "RFA-08": ["RFA-06", "RFA-07"],
  "RFA-09": ["RFA-06", "RFA-07"],
  "RFA-10": ["RFA-01", "RFA-06", "RFA-09"],
  "RFA-11": ["RFA-02", "RFA-03"],
  "RFA-12": ["RFA-06", "RFA-09", "RFA-10"],
  "RFA-13": ["RFA-09", "RFA-12"],
  "RFA-14": ["RFA-11", "RFA-12", "RFA-13"],
  "RFA-15": ["RFA-07", "RFA-08", "RFA-09", "RFA-13", "RFA-14"],
  "RFA-16": ["RFA-14"],
  "RFA-17": ["RFA-02", "RFA-09", "RFA-12"],
  "RFA-18": ["RFA-03", "RFA-11", "RFA-12", "RFA-13", "RFA-16", "RFA-17"],
  "RFA-19": [
    "RFA-02",
    "RFA-10",
    "RFA-11",
    "RFA-12",
    "RFA-13",
    "RFA-14",
    "RFA-15",
    "RFA-17",
    "RFA-18",
  ],
  "RFA-20": ISSUE_IDS.slice(3, 19),
};
const BUDGET_IDS = [
  "cleanBrowserRestore",
  "residentCinemaOpen",
  "narrateAcknowledgement",
  "warmFirstPlayable",
  "commitToTransport",
  "segmentTimingPublication",
  "trustedWordDrift",
  "mainThreadLongTasks",
  "normalPlaybackFullBookFetches",
  "falseCriticalOrRebuild",
  "segmentRequestsInFlight",
  "bufferedMediaWindow",
  "normalPlaybackFullWaveformDecodes",
  "initialWorkspaceSnapshotBytes",
  "initialWorkspaceBootstrap",
  "serverHydrationAudioBytes",
];
const EXPECTED_BUDGET_ALLOCATIONS = {
  "RFA-01": [],
  "RFA-02": [
    "cleanBrowserRestore",
    "falseCriticalOrRebuild",
    "initialWorkspaceSnapshotBytes",
    "initialWorkspaceBootstrap",
  ],
  "RFA-03": [
    "initialWorkspaceSnapshotBytes",
    "initialWorkspaceBootstrap",
    "serverHydrationAudioBytes",
  ],
  "RFA-04": [],
  "RFA-05": [],
  "RFA-06": ["warmFirstPlayable", "commitToTransport", "serverHydrationAudioBytes"],
  "RFA-07": ["segmentTimingPublication", "trustedWordDrift"],
  "RFA-08": ["segmentTimingPublication", "trustedWordDrift"],
  "RFA-09": [
    "commitToTransport",
    "normalPlaybackFullBookFetches",
    "segmentRequestsInFlight",
    "bufferedMediaWindow",
    "serverHydrationAudioBytes",
  ],
  "RFA-10": ["narrateAcknowledgement", "warmFirstPlayable", "commitToTransport"],
  "RFA-11": [
    "cleanBrowserRestore",
    "residentCinemaOpen",
    "initialWorkspaceSnapshotBytes",
    "initialWorkspaceBootstrap",
  ],
  "RFA-12": ["narrateAcknowledgement", "warmFirstPlayable"],
  "RFA-13": [
    "mainThreadLongTasks",
    "normalPlaybackFullBookFetches",
    "segmentRequestsInFlight",
    "bufferedMediaWindow",
    "normalPlaybackFullWaveformDecodes",
  ],
  "RFA-14": [
    "residentCinemaOpen",
    "narrateAcknowledgement",
    "warmFirstPlayable",
    "mainThreadLongTasks",
  ],
  "RFA-15": ["segmentTimingPublication", "trustedWordDrift", "mainThreadLongTasks"],
  "RFA-16": [],
  "RFA-17": ["falseCriticalOrRebuild", "serverHydrationAudioBytes"],
  "RFA-18": [
    "residentCinemaOpen",
    "narrateAcknowledgement",
    "mainThreadLongTasks",
    "normalPlaybackFullBookFetches",
    "segmentRequestsInFlight",
    "bufferedMediaWindow",
    "normalPlaybackFullWaveformDecodes",
    "initialWorkspaceSnapshotBytes",
    "initialWorkspaceBootstrap",
  ],
  "RFA-19": BUDGET_IDS,
  "RFA-20": BUDGET_IDS,
};
const EXPECTED_LEGACY_REMOVAL_OWNERS = ["RFA-11", "RFA-13", "RFA-16", "RFA-18"];
const EXPECTED_FUTURE_SCRIPT_OWNERS = {
  "scripts/e2e-reader-first-continuity.mjs": "RFA-02",
  "scripts/measure-reader-first-bootstrap.mjs": "RFA-03",
  "scripts/verify-reader-first-scan-fixture.mjs": "RFA-04",
  "scripts/verify-reader-first-speech-plan.mjs": "RFA-05",
  "scripts/verify-reader-first-timing.mjs": "RFA-07",
  "scripts/e2e-reader-first-media.mjs": "RFA-09",
  "scripts/e2e-reader-first-journey.mjs": "RFA-14",
  "scripts/run-reader-first-performance-gate.mjs": "RFA-18",
  "scripts/run-reader-first-release-gate.mjs": "RFA-20",
};
const EXISTING_SHARED_SCRIPTS = new Set(["scripts/validate-reader-first-release.mjs"]);
const EVIDENCE_BINDINGS = [
  [
    "docs/reviews/chatgpt-reader-first-release-response-v1.md",
    "e6e99204ccf699715c7e2bafadef66abe50c9efd4278a43dbddf831d74c0f039",
  ],
  [
    "docs/reviews/reader-first-audits/server-state-restoration-and-health.md",
    "99e65dad1cbdc7f0d85df6dcdbdf3d6fc81d8f9d4ab48c147037f9dc17025f1c",
  ],
  [
    "docs/reviews/reader-first-audits/progressive-media-timing-and-browser.md",
    "34602c38493ad171cf00e0ecd988281ff13f183640b0d686de3450d8383eb0e4",
  ],
  [
    "docs/reviews/reader-first-audits/structure-preprocessing-and-ui.md",
    "88de3250519ead829fb0edcb18e719881bc18761ced38031051d073df2c265f4",
  ],
  [PROVENANCE_PATH, "523be92d4064d5ff0a16149cb6d113dbfe66058c7983fa3f88839de5592dbc98"],
  [
    "fixtures/pdf/scanned_fixture.pdf",
    "25eeaa49a696c8d5f0fca7b80ec9ec11ebd6450c33f7a279a26555b0e56a5500",
  ],
  [
    "fixtures/pdf/scanned_fixture.ocr.txt",
    "fbed95e0ddf91100b02ffc1978147df53a2c2f7a0da6a8ed23e67ba5b7f09f78",
  ],
  [
    "fixtures/pdf/scanned_fixture.expected-overlay.json",
    "783a5d48857303fc8c7f7a67fd3b5e5e5e06deb87469724ef3d76a15e1a9ca06",
  ],
  [
    "docs/reviews/reader-first-release-peer-repair-v2.md",
    "394390409f0ce245c7d982d73c4080f3e0c7e8e16099df44ece7cb79a73ee805",
  ],
  [
    "docs/reviews/chatgpt-reader-first-release-response-v2.md",
    "78ec9a3910ccc3758ecf8d4fb9a756e599da323e6abccaa2760eae7a229e73b2",
  ],
  [
    "docs/reviews/reader-first-release-peer-repair-v3.md",
    "0d53d996bc60fb927330e6ad4968c94ae2b5d30f742c26f08c522c245468700c",
  ],
  [
    "docs/reviews/chatgpt-reader-first-release-response-v3.md",
    "47029af8866a7f4fcc16f872ce7ed95a165707540943ae7bcbdd3fb16a5869d8",
  ],
  [
    "docs/reviews/reader-first-release-peer-repair-v4.md",
    "09c713b9e62dfb5a4406f493eb8b3e9d5e9db7fe979915e5225e8d1a73959ef8",
  ],
  [
    "docs/reviews/chatgpt-reader-first-release-response-v4.md",
    "047ac056b40a5d8ebf57741d8c911ded142167971382b360c99025c6e63accec",
  ],
  [
    "docs/reviews/reader-first-release-peer-repair-v5.md",
    "303097594cb66865d714df933b59faf02d23e93ca48c81287b1a62b8ff83aedc",
  ],
  [
    "docs/reviews/reader-first-audits/source-scope-ownership-v5.md",
    "6150e3ead4604e209e4e0084b7149e985c3650cdc94470f7f17500f80349b140",
  ],
  [
    "docs/reviews/reader-first-release-self-audit-v6.md",
    "ff6e0c98c1e9e139cf7ff5f2cdce1a9cb391256444dc0f58bfab7c0602ed9430",
  ],
  [
    "docs/reviews/chatgpt-reader-first-release-response-v6.md",
    "c2ced797a0f916d6b1eb152538c5e2f1e5bc4d06cfb7a9b55c05cc7169e8a75c",
  ],
  [
    "docs/reviews/reader-first-release-peer-repair-v7.md",
    "e3376691cfe578ad656a7578e3915a8ee7fc532d6dc9a35e17d8979158afe18a",
  ],
  [
    "docs/reviews/chatgpt-reader-first-release-response-v7.md",
    "e838c60cc28d1bbdd8fd4f4b6aa286560a61190c0b04e9eda4a598a33f039b01",
  ],
  [
    "docs/reviews/reader-first-release-peer-repair-v8.md",
    "67d6c37947731f4f33822753fcede456cce0686cac030ec1437a960eb0e8597a",
  ],
  [
    "docs/reviews/chatgpt-reader-first-release-response-v8.md",
    "db77ea725ec44d7916c12ff243554a5b7ae34975e2b2ad61d283a6fb221bfe01",
  ],
  [
    "docs/reviews/reader-first-release-peer-approval-v8.json",
    "29710a3b5af4fc21be5091b454a57fc7c2b14d363a9fc46706e403e901e7ecef",
  ],
  [LIVE_MANIFEST_PATH, "5f18e3e86d204a40dbd69f6640b1c442be8d3f473ab313d34707b713661a22d8"],
];

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function canonicalHash(value) {
  return sha256(`${JSON.stringify(value, null, 2)}\n`);
}
function nonemptyStrings(values, message) {
  invariant(
    Array.isArray(values) &&
      values.length > 0 &&
      values.every((value) => typeof value === "string" && value.trim().length > 0),
    message,
  );
}
function repoPaths(values, message) {
  nonemptyStrings(values, message);
  invariant(
    values.every((value) => !path.isAbsolute(value) && !value.includes("..")),
    message,
  );
}
function visit(id, byId, visiting, visited) {
  if (visited.has(id)) return;
  invariant(!visiting.has(id), `dependency cycle at ${id}`);
  visiting.add(id);
  for (const dependency of byId.get(id).dependencies) {
    invariant(byId.has(dependency), `${id}: unknown dependency ${dependency}`);
    visit(dependency, byId, visiting, visited);
  }
  visiting.delete(id);
  visited.add(id);
}
function dependsTransitively(issueId, dependencyId, byId, seen = new Set()) {
  if (seen.has(issueId)) return false;
  seen.add(issueId);
  const dependencies = byId.get(issueId).dependencies;
  return (
    dependencies.includes(dependencyId) ||
    dependencies.some((id) => dependsTransitively(id, dependencyId, byId, seen))
  );
}
function commandScripts(commands) {
  return commands.flatMap((command) => command.match(/scripts\/[a-z0-9-]+\.mjs/g) ?? []);
}

export function validateReaderFirstRelease(contract, packet) {
  invariant(
    contract.schemaVersion === "tts-research.reader-first-release-contract.v2",
    "unexpected Reader-First contract schema",
  );
  invariant(
    contract.status === EXPECTED_STATUS,
    "Reader-First contract must record Peer approval and live Linear authorization",
  );
  invariant(contract.planPath === PLAN_PATH, "Reader-First plan path drift");
  invariant(
    same(contract.authorization, EXPECTED_AUTHORIZATION),
    "Peer-approved Linear and RFA-01 product authorization drift",
  );
  invariant(
    contract.ownerDecision?.repositoryStrategy === "continue_in_current_repository" &&
      contract.ownerDecision?.newRepositoryAuthorized === false &&
      contract.ownerDecision?.peerApprovalRequired === true,
    "owner repository and Peer-gate decision drift",
  );
  invariant(
    contract.peerReviewHistory?.length === 7,
    "all six request-changes rounds and final Peer approval are required",
  );
  const [roundOne, roundTwo, roundThree, roundFour, roundFive, roundSix, roundSeven] =
    contract.peerReviewHistory;
  invariant(
    roundOne.verdict === "request_changes" &&
      roundOne.blockingFindingCount === 9 &&
      roundOne.linearCreationPermitted === false &&
      roundOne.productImplementationPermitted === false &&
      roundOne.repairEvidencePath === EVIDENCE_BINDINGS[8][0] &&
      roundOne.repairEvidenceSha256 === EVIDENCE_BINDINGS[8][1],
    "Round 1 Peer evidence binding drift",
  );
  invariant(
    roundTwo.round === 2 &&
      roundTwo.verdict === "request_changes" &&
      roundTwo.blockingFindings === 10 &&
      roundTwo.responsePath === EVIDENCE_BINDINGS[9][0] &&
      roundTwo.responseSha256 === EVIDENCE_BINDINGS[9][1] &&
      roundTwo.repairEvidencePath === EVIDENCE_BINDINGS[10][0] &&
      roundTwo.repairEvidenceSha256 === EVIDENCE_BINDINGS[10][1] &&
      roundTwo.linearCreationPermitted === false &&
      roundTwo.productImplementationPermitted === false,
    "Round 2 Peer evidence binding drift",
  );
  invariant(
    roundThree.round === "reader-first-release-v3" &&
      roundThree.verdict === "request_changes" &&
      roundThree.blockingFindings === 8 &&
      roundThree.responsePath === EVIDENCE_BINDINGS[11][0] &&
      roundThree.responseSha256 === EVIDENCE_BINDINGS[11][1] &&
      roundThree.repairEvidencePath === EVIDENCE_BINDINGS[12][0] &&
      roundThree.repairEvidenceSha256 === EVIDENCE_BINDINGS[12][1] &&
      roundThree.linearCreationPermitted === false &&
      roundThree.productImplementationPermitted === false,
    "Round 3 Peer evidence binding drift",
  );
  invariant(
    roundFour.round === "reader-first-release-v4" &&
      roundFour.verdict === "request_changes" &&
      roundFour.blockingFindings === 3 &&
      roundFour.responsePath === EVIDENCE_BINDINGS[13][0] &&
      roundFour.responseSha256 === EVIDENCE_BINDINGS[13][1] &&
      roundFour.repairEvidencePath === EVIDENCE_BINDINGS[14][0] &&
      roundFour.repairEvidenceSha256 === EVIDENCE_BINDINGS[14][1] &&
      roundFour.linearCreationPermitted === false &&
      roundFour.productImplementationPermitted === false,
    "Round 4 Peer evidence binding drift",
  );
  invariant(
    roundFive.round === "reader-first-release-v6" &&
      roundFive.verdict === "request_changes" &&
      roundFive.blockingFindings === 2 &&
      roundFive.responsePath === EVIDENCE_BINDINGS[17][0] &&
      roundFive.responseSha256 === EVIDENCE_BINDINGS[17][1] &&
      roundFive.repairEvidencePath === EVIDENCE_BINDINGS[18][0] &&
      roundFive.repairEvidenceSha256 === EVIDENCE_BINDINGS[18][1] &&
      roundFive.linearCreationPermitted === false &&
      roundFive.productImplementationPermitted === false,
    "Round 5 Peer evidence binding drift",
  );
  invariant(
    roundSix.round === "reader-first-release-v7" &&
      roundSix.verdict === "request_changes" &&
      roundSix.blockingFindings === 1 &&
      roundSix.responsePath === EVIDENCE_BINDINGS[19][0] &&
      roundSix.responseSha256 === EVIDENCE_BINDINGS[19][1] &&
      roundSix.repairEvidencePath === EVIDENCE_BINDINGS[20][0] &&
      roundSix.repairEvidenceSha256 === EVIDENCE_BINDINGS[20][1] &&
      roundSix.linearCreationPermitted === false &&
      roundSix.productImplementationPermitted === false,
    "Round 6 Peer evidence binding drift",
  );
  invariant(
    roundSeven.round === "reader-first-release-v8" &&
      roundSeven.verdict === "approved" &&
      roundSeven.responsePath === EVIDENCE_BINDINGS[21][0] &&
      roundSeven.responseSha256 === EVIDENCE_BINDINGS[21][1] &&
      roundSeven.parentApprovalPath === EVIDENCE_BINDINGS[22][0] &&
      roundSeven.parentApprovalSha256 === EVIDENCE_BINDINGS[22][1] &&
      roundSeven.archiveSha256 ===
        "b91a683ac8c94bd44ca618b53b275cbe93c2d55d8a5cac1b11e6d9d1aeafc7de" &&
      roundSeven.linearCreationPermitted === true &&
      roundSeven.productImplementationPermitted === true &&
      same(roundSeven.graphUnblockedIssues, ["RFA-01"]),
    "Round 7 final Peer approval binding drift",
  );

  invariant(contract.customerRequirements?.length === 6, "all six owner requirements are required");
  invariant(
    same(
      contract.customerRequirements.map(({ id }) => id),
      REQUIRED_REQUIREMENTS,
    ),
    "owner requirement IDs or order drift",
  );
  for (const requirement of contract.customerRequirements) {
    nonemptyStrings(requirement.issues, `${requirement.id}: issue mappings required`);
    invariant(
      requirement.issues.every((id) => ISSUE_IDS.includes(id)) &&
        requirement.issues.includes("RFA-20"),
      `${requirement.id}: exact integrated issue mapping required`,
    );
  }

  const server = contract.serverAuthority;
  invariant(
    server?.browserStorageRole === "disposable_cache_and_preferences_only" &&
      server.missingBrowserStorageMayBreakRestore === false &&
      server.restoreAutoplay === false,
    "browser storage and restore-autoplay authority drift",
  );
  invariant(
    server.snapshotSchemaVersion === "reader_workspace_snapshot.v1" &&
      same(server.snapshotReadPolicy, [
        "v1_direct",
        "v0_server_snapshot_migrate_to_v1",
        "no_snapshot_server_selection_fallback",
      ]),
    "snapshot schema migration contract drift",
  );
  invariant(
    server.legacySnapshotMigration?.writeback ===
      "conditional_v1_write_with_project_revision_precondition" &&
      server.legacySnapshotMigration?.failure ===
        "explicit_snapshot_incompatible_never_silent_drop" &&
      server.legacyBrowserStateTransition?.serverSnapshotAlwaysWins === true &&
      server.legacyBrowserStateTransition?.importMayTriggerPlayback === false,
    "legacy snapshot/browser transition must be explicit and fail closed",
  );
  invariant(
    server.workspaceMutationsRequireRevisionPrecondition === true &&
      server.concurrentBrowserConflictPolicy ===
        "reject_stale_revision_return_current_snapshot_and_retry_token",
    "cross-browser concurrency contract drift",
  );

  const structure = contract.structureContract;
  invariant(
    structure?.headingStandaloneSpeechUnit === true &&
      structure.pauseMetadataOutOfBandFromHighlightText === true &&
      structure.lowConfidenceSilentlyPromoted === false &&
      structure.reviewRequiredMayAutoNarrate === false &&
      structure.flattenedStringPlannerMayRemainAuthoritative === false,
    "structure-aware reviewRequired contract drift",
  );
  invariant(
    structure.ocrReviewRequiredPolicy?.resolutionCreatesNewOverlayRevision === true &&
      structure.ocrReviewRequiredPolicy?.unresolvedReaderBehavior ===
        "render_source_region_and_pause_narration_at_boundary",
    "OCR adjudication workflow drift",
  );
  invariant(
    structure.scannedPdfFixture?.sha256 === EVIDENCE_BINDINGS[5][1] &&
      structure.scannedPdfFixture?.bytes === 84284 &&
      structure.scannedPdfFixture?.rasterOnly === true &&
      structure.scannedPdfFixture?.expectedOverlaySha256 === EVIDENCE_BINDINGS[7][1],
    "real scanned-PDF fixture binding drift",
  );

  const timing = contract.timingContract;
  invariant(
    same(timing?.sourcePriority, [
      "trustedProviderNative",
      "qwen3SegmentForcedAlignment",
      "phraseHeuristic",
      "none",
    ]) &&
      timing.forcedAlignmentUnit === "immutable_audio_segment" &&
      timing.forcedAlignmentConcurrentWithNarration === true &&
      timing.forcedAlignmentMayWaitForFinalAssembly === false &&
      timing.heuristicMayClaimTrustedWord === false,
    "timing source/fallback contract drift",
  );
  invariant(
    timing.baselineFidelityClaim?.confidence === 0.625 &&
      timing.baselineFidelityClaim?.trustedWordAllowed === false,
    "baseline 0.625 heuristic claim must remain untrusted",
  );
  invariant(
    timing.consumedCueWatermark?.field === "playbackCursorMs" &&
      timing.consumedCueWatermark?.persistedBy === "server_workspace_snapshot",
    "consumed timing watermark drift",
  );
  invariant(
    timing.consumedCueImmutability?.mayDelete === false &&
      timing.consumedCueImmutability?.mayReorder === false &&
      timing.consumedCueImmutability?.mayReplace === false &&
      timing.consumedCueImmutability?.mayMoveForward === false &&
      timing.consumedCueImmutability?.mayMoveBackward === false &&
      timing.consumedCueImmutability?.laterRevisionPolicy ===
        "apply_only_to_unconsumed_cues_after_watermark",
    "consumed cue identity/timing immutability drift",
  );

  const media = contract.mediaContract;
  invariant(
    media?.canonicalPlaybackArtifact === "immutable_segments" &&
      media.finalAssemblyRequiredForPlayback === false &&
      media.fullBookFetchAllowedForNormalPlayback === false &&
      media.completedRequiresDurablePromotionOutOfTmpfs === true,
    "segment-first durable media contract drift",
  );
  invariant(
    same(media.nominalConcurrentSegmentRequests, [2, 4]) &&
      media.maxConcurrentSegmentRequests === 4 &&
      media.constrainedConcurrencyException?.minimum === 1 &&
      same(media.constrainedConcurrencyException?.allowedSignals, [
        "saveData",
        "effectiveType_2g",
        "deviceMemory_below_2gb",
        "active_manifest_has_one_remaining_segment",
      ]) &&
      media.constrainedConcurrencyException?.mustEmitReasonCode === true &&
      media.constrainedConcurrencyException?.mayExceedMaximum === false,
    "nominal 2-4 request envelope drift",
  );
  invariant(
    media.fullAudioDecodeForWaveformAllowed === false &&
      media.serverProducedWaveformEnvelope === true &&
      media.boundedAuditionClipWaveformDecodeException?.allowed === true &&
      same(media.boundedAuditionClipWaveformDecodeException?.allowedSurfaces, [
        "voice_comparison",
        "voice_cloning",
      ]) &&
      media.boundedAuditionClipWaveformDecodeException?.requiredIdentity === "AuditionSessionId" &&
      same(media.boundedAuditionClipWaveformDecodeException?.forbiddenIdentities, [
        "VoiceJob",
        "narration_runId",
      ]) &&
      media.boundedAuditionClipWaveformDecodeException?.maxDurationSeconds === 30 &&
      media.boundedAuditionClipWaveformDecodeException?.maxBytes === 5_242_880 &&
      media.boundedAuditionClipWaveformDecodeException?.overLimitBehavior ===
        "server_waveform_envelope_or_no_waveform",
    "bounded Audition waveform exception drift",
  );
  invariant(
    media.readerRequiresVersionedManifest === true &&
      media.manifestCapableReaderMayFallbackToFullAudio === false &&
      media.finalAudioRoutePolicy?.readerFallbackAllowed === false &&
      media.finalAudioRoutePolicy?.satisfiableStatus === 206 &&
      media.finalAudioRoutePolicy?.unsatisfiableStatus === 416 &&
      media.finalAudioRoutePolicy?.contentRangeRequired === true,
    "manifest Reader and legacy range semantics drift",
  );
  invariant(
    same(
      media.compressedDeliveryProfiles?.map(({ id }) => id),
      ["fmp4-aac", "webm-opus"],
    ),
    "compressed gapless browser profile drift",
  );
  invariant(
    media.durableArtifactMigration?.validArtifactMayBecomeArtifactMissing === false &&
      media.durableArtifactMigration?.promotion ===
        "copy_fsync_atomic_rename_then_commit_metadata" &&
      media.durableArtifactMigration?.failure ===
        "retain_prior_metadata_emit_artifact_migration_failed_never_mark_completed",
    "completed-artifact backfill contract drift",
  );

  invariant(
    contract.playbackContract?.maxControllersPerRun === 1 &&
      contract.playbackContract?.maxAudioOwnersPerRun === 1 &&
      contract.playbackContract?.appendCapable === true &&
      contract.playbackContract?.previewMayOwnNarrationRun === false &&
      contract.playbackContract?.terminalCompletionMayRemount === false,
    "single append-capable playback owner drift",
  );
  const health = contract.healthContract;
  invariant(
    health?.systemCriticalAuthority === "backend_health_evidence_only" &&
      health.frontendMayInferSystemCritical === false &&
      health.optionalCapabilityAbsenceMayBeCritical === false &&
      health.stageOrAudioBlockerMaySetSystemCritical === false &&
      health.finalAssemblyFailureInvalidatesSegments === false,
    "backend-owned truthful health contract drift",
  );
  invariant(
    same(health.backendEvidenceSchema?.allowedReasonCodes, health.systemCriticalRequires) &&
      same(health.backendEvidenceSchema?.allowedReasonCodes, [
        "backendUnavailable",
        "corruptState",
        "durableStorageFailure",
        "unrecoverableInvariantViolation",
      ]) &&
      same(health.backendEvidenceSchema?.requiredFields, [
        "reasonCode",
        "sourceSubsystem",
        "observedAt",
        "expiresAt",
        "correlationId",
        "clearCondition",
      ]) &&
      health.backendEvidenceSchema?.maxEvidenceAgeSeconds === 30 &&
      health.backendEvidenceSchema?.expiredEvidenceBehavior === "unknown_not_critical" &&
      health.backendEvidenceSchema?.clearRequiresBackendEvidence === true,
    "system-critical evidence schema/freshness drift",
  );

  invariant(
    contract.performanceContract?.releaseBlocking === true &&
      contract.performanceContract?.missingResultIsPass === false &&
      contract.performanceContract?.minimumMeasuredRuns === 10 &&
      contract.performanceContract?.discardedWarmupRuns === 1,
    "performance evidence gate drift",
  );
  invariant(
    same(
      contract.performanceContract?.targetProfiles?.map(({ id }) => id),
      ["desktop-cold", "desktop-warm", "webkit-cold"],
    ),
    "target hardware/network profile drift",
  );
  invariant(
    same(
      contract.performanceContract?.budgets?.map(({ id }) => id),
      BUDGET_IDS,
    ),
    "performance budget IDs/order drift",
  );
  invariant(
    contract.performanceContract.budgets.find(({ id }) => id === "initialWorkspaceSnapshotBytes")
      ?.p95Max === 262144 &&
      contract.performanceContract.budgets.find(({ id }) => id === "initialWorkspaceBootstrap")
        ?.p95Max === 1500 &&
      contract.performanceContract.budgets.find(({ id }) => id === "serverHydrationAudioBytes")
        ?.p95Max === 0,
    "bootstrap/server-hydration budgets drift",
  );
  const evidenceManifest = contract.evidenceManifestContract;
  invariant(
    evidenceManifest?.schemaVersion === "tts-research.reader-first-evidence-manifest.v1" &&
      evidenceManifest.immutable === true &&
      evidenceManifest.supersessionOnly === true &&
      same(evidenceManifest.resultEnum, ["pass", "fail", "blocked"]),
    "evidence manifest lifecycle drift",
  );
  invariant(
    same(evidenceManifest.requiredFields, [
      "issueId",
      "acceptanceProbeId",
      "command",
      "commitOrArchiveSha256",
      "fixtureSha256s",
      "measurementProfile",
      "toolVersions",
      "operatingSystem",
      "hardwareProfile",
      "rawOutputPath",
      "result",
      "reviewer",
      "observedAt",
    ]),
    "evidence manifest required fields drift",
  );

  invariant(
    contract.auditEvidence?.reviews?.length === 5 &&
      contract.auditEvidence?.reconciled === true &&
      contract.auditEvidence?.mutationsByReviewers === false,
    "archive-contained audit evidence drift",
  );
  invariant(
    same(
      contract.auditEvidence.reviews.map(({ path, sha256: hash }) => [path, hash]),
      [...EVIDENCE_BINDINGS.slice(1, 4), EVIDENCE_BINDINGS[15], EVIDENCE_BINDINGS[16]],
    ),
    "audit path/hash bindings drift",
  );
  invariant(
    contract.linearTargetEvidence?.path === PROVENANCE_PATH &&
      contract.linearTargetEvidence?.sha256 === EVIDENCE_BINDINGS[4][1] &&
      contract.linearTargetEvidence?.teamId === "cdc92ef0-dc69-47b5-8896-312dbc1e2d93" &&
      contract.linearTargetEvidence?.projectId === "010252d0-b34c-473d-82f2-05bc4d7bc685" &&
      contract.linearTargetEvidence?.activeUnarchived === 20 &&
      contract.linearTargetEvidence?.cap === 20 &&
      contract.linearTargetEvidence?.hasNextPage === false,
    "Linear target provenance binding drift",
  );
  invariant(
    contract.liveLinearManifest?.path === LIVE_MANIFEST_PATH &&
      contract.liveLinearManifest?.sha256 === EVIDENCE_BINDINGS[23][1] &&
      contract.liveLinearManifest?.issueCount === 20 &&
      contract.liveLinearManifest?.relationCount === 65,
    "live Linear manifest binding drift",
  );

  invariant(
    packet.schemaVersion === "tts-research.reader-first-linear-batch.v2" &&
      packet.issueSchemaVersion === "tts-research.reader-first-issue.v2",
    "unexpected Reader-First packet/issue schema",
  );
  invariant(
    packet.status === EXPECTED_STATUS &&
      packet.architectureContractPath === CONTRACT_PATH &&
      packet.planPath === PLAN_PATH,
    "packet status/path drift",
  );
  invariant(
    packet.projectId === contract.linearTargetEvidence.projectId &&
      packet.teamId === contract.linearTargetEvidence.teamId &&
      same(packet.targetProvenance, contract.linearTargetEvidence),
    "packet Linear target provenance drift",
  );
  invariant(
    same(packet.authorization, contract.authorization) &&
      same(packet.auditEvidence, contract.auditEvidence) &&
      same(packet.peerReviewHistory, contract.peerReviewHistory) &&
      same(packet.liveLinearManifest, contract.liveLinearManifest),
    "packet contract evidence/authorization mirror drift",
  );
  invariant(
    packet.capacitySnapshot?.activeUnarchived === 20 &&
      packet.capacitySnapshot?.cap === 20 &&
      packet.capacitySnapshot?.availableSlots === 0 &&
      packet.capacitySnapshot?.pagesRead === 1 &&
      packet.capacitySnapshot?.hasNextPage === false &&
      packet.capacitySnapshot?.provenancePath === PROVENANCE_PATH,
    "capacity snapshot drift",
  );
  invariant(
    same(packet.evidenceManifestContract, contract.evidenceManifestContract),
    "packet/contract evidence manifest drift",
  );
  invariant(
    same(packet.creationPlan, {
      eligibleForLinearCreation: [],
      eligibleForProductImplementation: ["RFA-01"],
      newIssuesCreatedNow: 20,
      linearMutationPerformed: true,
      productMutationPerformed: false,
    }),
    "post-creation Linear/product authorization drift",
  );
  invariant(
    packet.issueCount === 20 &&
      packet.issues?.length === 20 &&
      packet.issueIdRange === "RFA-01..RFA-20",
    "exactly 20 ordered RFA issues required",
  );
  invariant(
    same(
      packet.issues.map(({ localId }) => localId),
      ISSUE_IDS,
    ) && same(packet.dag, EXPECTED_DEPENDENCIES),
    "RFA IDs or dependency DAG drift",
  );

  const byId = new Map(packet.issues.map((issue) => [issue.localId, issue]));
  const requiredSourceScopes = {
    "RFA-09": {
      paths: ["frontend/src/api.ts"],
      symbols: ["audioSource completed-job media route selection"],
    },
    "RFA-11": {
      paths: ["frontend/src/projectState.ts", "frontend/src/App.tsx"],
      symbols: [
        "ProjectWorkspaceState",
        "PROJECT_WORKSPACE_STATE_PREFIX",
        "loadProjectWorkspaceState",
        "saveProjectWorkspaceState",
        "clearProjectWorkspaceState",
        "migrateLegacyWorkspaceState",
        "clearLegacyWorkspaceState",
        "App activeProjectId localStorage initialization",
        "restoreProjectWorkspace",
        "selectProject",
        "App project-change migration/restoration effect",
        "App continuous workspace persistence effect",
      ],
    },
    "RFA-13": {
      paths: [
        "frontend/src/App.tsx",
        "frontend/src/audioWaveform.ts",
        "frontend/src/waveform.ts",
        "frontend/src/features/teleprompt",
        "frontend/src/features/book-cinema/BookCinemaPanel.tsx",
        "frontend/src/features/cinema/PreparedSourceCinemaTransportHelpers.tsx",
      ],
      symbols: [
        "useCompletedWaveformBars full-source decode path",
        "ArrivalAudioPlayerQueue segment-loading effect",
        "ArrivalAudioPlayerQueue loadRequests Promise.all fan-out",
        "missingSegmentIndexes bounded scheduler",
        "useAudioWaveformBars long-form full-object decode path",
        "sampleAudioBuffer decoded-buffer waveform path",
        "TelepromptStudio waveform call site",
        "BookCinemaPanel waveform call site",
        "PreparedSourceCinemaTransportHelpers waveform call site",
      ],
    },
    "RFA-15": {
      paths: [
        "frontend/src/features/teleprompt/TelepromptStudio.tsx",
        "frontend/src/features/teleprompt/telepromptStudioComponents.tsx",
        "frontend/src/features/teleprompt/telepromptTheatreCueContent.tsx",
        "frontend/src/features/cinema/BookDocumentReaderStage.tsx",
        "frontend/src/features/theatre/model.ts",
        "frontend/src/features/teleprompt/TelepromptTheatre.tsx",
        "frontend/src/features/cinema/PreparedSourceCinemaBase.tsx",
      ],
      symbols: [
        "TelepromptStudio authoritative timing fidelity consumption",
        "Teleprompt cue and word authoritative timing-state defaults",
        "Teleprompt theatre cue authoritative timing-state default",
        "BookDocumentReaderStage authoritative block and word highlight fidelity",
        "Theatre runtime authoritative timing availability",
        "TelepromptTheatre omitted timing input fail-closed default",
        "PreparedSourceCinema active and inactive block authoritative timing state",
      ],
    },
    "RFA-16": {
      paths: ["frontend/src/App.tsx"],
      symbols: [
        "playbackCursorSec",
        "isPlaybackActive",
        "playbackControls",
        "handlePlaybackControlsChange",
        "globalPreviewOwner",
        "globalPreviewVisible",
        "LazyGlobalPreviewPlayer mount",
        "PlaybackControllerHost",
        "StreamingAudioPanel ownership bridge",
        "GlobalPreviewPlayer bounded Audition waveform path",
      ],
    },
    "RFA-17": {
      paths: ["frontend/src/features/status-strip/model.ts", "frontend/src/App.tsx"],
      symbols: [
        "resolveNarrationStatusModel",
        "resolveNarrationOperationalIssues",
        "resolveOperationalSystemIssue",
        "highestPriorityPanel blocking critical inference",
        "App narrationStatusModel/disclosure input call site",
      ],
    },
  };
  for (const [id, required] of Object.entries(requiredSourceScopes)) {
    const scope = byId.get(id).inScope;
    if (scope.paths.length === 0 || scope.symbols.length === 0) continue;
    invariant(
      required.paths.every((value) => scope.paths.includes(value)) &&
        required.symbols.every((value) => scope.symbols.includes(value)),
      `${id}: repository-real source path/symbol ownership drift`,
    );
  }
  for (const issue of packet.issues) {
    const prefix = issue.localId;
    invariant(
      same(issue.dependencies, EXPECTED_DEPENDENCIES[prefix]),
      `${prefix}: dependency drift`,
    );
    invariant(
      typeof issue.title === "string" &&
        issue.title.length > 10 &&
        typeof issue.objective === "string" &&
        issue.objective.length > 20,
      `${prefix}: title/objective required`,
    );
    invariant(
      typeof issue.accountableOwnerSurface === "string" && issue.accountableOwnerSurface.length > 3,
      `${prefix}: one accountable owner surface required`,
    );
    repoPaths(issue.inScope?.paths, `${prefix}: repository-real in-scope paths required`);
    invariant(
      !issue.inScope.paths.includes("scripts"),
      `${prefix}: broad scripts scope is forbidden`,
    );
    nonemptyStrings(issue.inScope?.symbols, `${prefix}: in-scope symbols required`);
    nonemptyStrings(issue.nonGoals, `${prefix}: explicit non-goals required`);
    nonemptyStrings(issue.verificationCommands, `${prefix}: verification commands required`);
    repoPaths(issue.evidenceArtifacts, `${prefix}: repo-relative evidence artifacts required`);
    invariant(
      Array.isArray(issue.acceptanceProbes) && issue.acceptanceProbes.length > 0,
      `${prefix}: acceptance probes required`,
    );
    for (const probe of issue.acceptanceProbes) {
      invariant(
        typeof probe.id === "string" &&
          probe.id.startsWith(`${prefix}-AC`) &&
          typeof probe.assertion === "string" &&
          probe.assertion.length > 15,
        `${prefix}: measurable acceptance assertion required`,
      );
      invariant(
        issue.verificationCommands.includes(probe.verificationCommand) &&
          issue.evidenceArtifacts.includes(probe.evidenceArtifact) &&
          probe.onFailure === "block_issue_and_preserve_prior_authoritative_path",
        `${prefix}: acceptance command/evidence/failure binding drift`,
      );
    }
    invariant(
      issue.observabilityEvidence?.events?.length === 3 &&
        issue.observabilityEvidence.events.every((event) =>
          event.includes(prefix.toLowerCase().replace("-", "_")),
        ) &&
        issue.evidenceArtifacts.includes(issue.observabilityEvidence.artifact),
      `${prefix}: issue-specific observability evidence required`,
    );
    invariant(
      ["issueId", "correlationId", "result"].every((field) =>
        issue.observabilityEvidence.requiredFields.includes(field),
      ) &&
        new Set(issue.observabilityEvidence.requiredFields).size ===
          issue.observabilityEvidence.requiredFields.length,
      `${prefix}: telemetry base fields drift`,
    );
    const rollbackShape =
      prefix === "RFA-20"
        ? issue.rollbackBoundary.preserve.includes("product_state") &&
          issue.rollbackBoundary.never.includes("mutate_product_state")
        : issue.rollbackBoundary.preserve.includes("server_authoritative_revisions") &&
          issue.rollbackBoundary.never.includes("restore_browser_authority");
    invariant(
      typeof issue.rollbackBoundary?.strategy === "string" &&
        issue.rollbackBoundary.strategy.length > 20 &&
        rollbackShape &&
        issue.evidenceArtifacts.includes(issue.rollbackBoundary.verification),
      `${prefix}: rollback boundary drift`,
    );
    invariant(
      same(issue.performanceBudgetIds, EXPECTED_BUDGET_ALLOCATIONS[prefix]) &&
        issue.performanceBudgetIds.every((id) => BUDGET_IDS.includes(id)),
      `${prefix}: local performance budget allocation drift`,
    );
    const ownsRemoval = issue.legacyRemovalOwned.length > 0;
    invariant(
      ownsRemoval === EXPECTED_LEGACY_REMOVAL_OWNERS.includes(prefix),
      `${prefix}: legacy-removal ownership drift`,
    );
    const unblocked = prefix === "RFA-01";
    const linearNumber = 612 + Number(prefix.slice(4));
    invariant(
      issue.ownerAccepted === true &&
        issue.peerApproved === true &&
        issue.linearCreationAuthorized === true &&
        issue.productImplementationAuthorized === unblocked &&
        issue.linear?.identifier === `QQP-${linearNumber}` &&
        issue.linear?.state === "Backlog" &&
        issue.linear?.stateType === "backlog" &&
        issue.linear?.priority === 3 &&
        issue.linear?.projectId === "010252d0-b34c-473d-82f2-05bc4d7bc685" &&
        typeof issue.linear?.id === "string" &&
        issue.linear.id.length > 0 &&
        issue.linear?.url.includes(`/issue/QQP-${linearNumber}/`),
      `${prefix}: live issue authorization/binding drift`,
    );
    invariant(
      issue.dependencyUnblocked === unblocked &&
        issue.status ===
          (unblocked ? "graph_unblocked_authorized" : "dependency_blocked_linear_created"),
      `${prefix}: graph/status drift`,
    );
    const number = Number(prefix.slice(4));
    invariant(
      issue.dependencies.every((dependency) => Number(dependency.slice(4)) < number),
      `${prefix}: dependency must precede issue`,
    );
  }
  const stateEvidence = {
    "RFA-02": [
      "snapshotSchemaVersion",
      "readMode",
      "writeMode",
      "snapshotRevision",
      "conflictOutcome",
    ],
    "RFA-06": [
      "artifactSourceRoot",
      "artifactDestination",
      "checksumResult",
      "metadataRevision",
      "promotionPhase",
    ],
    "RFA-09": [
      "callerCapability",
      "selectedRoute",
      "responseStatus",
      "contentRange",
      "codecProfile",
      "concurrencyReason",
    ],
    "RFA-13": [
      "playbackOwnerId",
      "bufferedSeconds",
      "inFlightRequests",
      "evictionReason",
      "terminalState",
    ],
    "RFA-15": ["consumedWatermark", "oldTimingRevision", "newTimingRevision", "conflictReason"],
    "RFA-17": ["reasonCode", "sourceSubsystem", "observedAt", "expiresAt", "clearCondition"],
    "RFA-20": [
      "archiveHash",
      "evidenceManifestHash",
      "verdict",
      "reviewer",
      "supersedesVerdictHash",
    ],
  };
  for (const [id, fields] of Object.entries(stateEvidence)) {
    invariant(
      fields.every((field) => byId.get(id).observabilityEvidence.requiredFields.includes(field)),
      `${id}: domain telemetry facts drift`,
    );
  }
  invariant(
    byId.get("RFA-02").rollbackBoundary.strategy ===
      "disable_v1_writes_keep_v0_v1_reads_never_restore_browser_authority",
    "RFA-02 snapshot rollback drift",
  );
  invariant(
    byId.get("RFA-20").rollbackBoundary.strategy ===
      "invalidate_or_supersede_evidence_verdict_without_product_state_change",
    "RFA-20 evidence-only rollback drift",
  );
  invariant(
    byId.get("RFA-19").rollbackBoundary.strategy ===
      "invalidate_or_supersede_failed_release_verdict_and_evidence_manifest_without_product_mutation" &&
      byId.get("RFA-19").rollbackBoundary.preserve.includes("product_state") &&
      byId.get("RFA-19").rollbackBoundary.never.includes("mutate_product_state"),
    "RFA-19 evidence-only rollback drift",
  );
  for (const [script, owner] of Object.entries(EXPECTED_FUTURE_SCRIPT_OWNERS)) {
    invariant(
      byId.get(owner).inScope.paths.includes(script),
      `${script}: creating issue scope drift`,
    );
  }
  for (const issue of packet.issues) {
    for (const script of commandScripts(issue.verificationCommands)) {
      if (EXISTING_SHARED_SCRIPTS.has(script)) continue;
      const owner = EXPECTED_FUTURE_SCRIPT_OWNERS[script];
      invariant(owner, `${issue.localId}: unowned verification harness ${script}`);
      invariant(
        issue.localId === owner || dependsTransitively(issue.localId, owner, byId),
        `${issue.localId}: harness owner ${owner} must be an ancestor for ${script}`,
      );
    }
  }
  const acceptance = (id) =>
    byId.get(id.slice(0, 6)).acceptanceProbes.find((probe) => probe.id === id);
  invariant(
    [
      "legacy root",
      "checksum",
      "fsynced",
      "atomically renamed",
      "post-host-reboot",
      "never becomes artifact_missing",
    ].every((term) => acceptance("RFA-06-AC02").assertion.includes(term)),
    "RFA-06 completed-artifact backfill acceptance drift",
  );
  invariant(
    ["200", "206", "416", "Content-Range", "Accept-Ranges"].every((term) =>
      acceptance("RFA-09-AC02").assertion.includes(term),
    ) && acceptance("RFA-09-AC04").assertion.includes("never full-audio fallback"),
    "RFA-09 route/range acceptance drift",
  );
  invariant(
    [
      "2–4 concurrent",
      "saveData",
      "effectiveType_2g",
      "deviceMemory_below_2gb",
      "active_manifest_has_one_remaining_segment",
      "transient lifecycle events",
      "never sustained-concurrency exceptions",
      "Never more than four",
    ].every((term) => acceptance("RFA-13-AC03").assertion.includes(term)) &&
      byId.get("RFA-13").observabilityEvidence.requiredFields.includes("concurrencyReason"),
    "RFA-13 exact concurrency exception acceptance drift",
  );
  invariant(
    [
      "cue ID",
      "word identity",
      "start or end in either direction",
      "replace or delete",
      "consumed watermark",
    ].every((term) => acceptance("RFA-15-AC03").assertion.includes(term)),
    "RFA-15 consumed-cue acceptance drift",
  );
  invariant(
    [
      "Reader, Teleprompt, Cinema, and Theatre",
      "authoritative fidelity",
      "timing manifest or server snapshot",
      "heuristic or estimated phrases remain visibly estimated",
      "word boundaries or highlight-map data",
      "never enable exact read-along",
      "no renderer hard-codes or defaults timing to trusted",
      "omitted Theatre timing input defaults to estimated or unknown",
      "inactive prepared-source block consumes authoritative fidelity or remains unknown",
      "never becomes trusted by inactivity",
    ].every((term) => acceptance("RFA-15-AC05").assertion.includes(term)),
    "RFA-15 authoritative timing-renderer acceptance drift",
  );
  const requiredOcrAuditFields =
    contract.structureContract.ocrReviewRequiredPolicy.requiredAuditFields;
  invariant(
    same(requiredOcrAuditFields, [
      "sourceNodeId",
      "sourceEvidence",
      "sourceOverlayRevision",
      "reviewedOverlayRevision",
      "reviewerId",
      "resolvedRole",
      "resolvedDisposition",
      "resolvedAt",
    ]),
    "canonical OCR resolution audit-field contract drift",
  );
  invariant(
    acceptance("RFA-04-AC02").verificationCommand.includes(
      "verify-reader-first-scan-fixture.mjs",
    ) &&
      acceptance("RFA-04-AC04").assertion ===
        `Resolving each reviewRequired node creates a new audited overlay revision with exactly ${requiredOcrAuditFields.slice(0, -1).join(", ")}, and ${requiredOcrAuditFields.at(-1)}; unresolved low-confidence structure is never flattened or auto-narrated.` &&
      requiredOcrAuditFields.every((field) =>
        byId.get("RFA-04").observabilityEvidence.requiredFields.includes(field),
      ),
    "RFA-04 exact OCR audit-field acceptance drift",
  );
  invariant(
    [
      "long-form Reader, Cinema, and Teleprompt",
      "server envelopes",
      "bounded manifest segments",
      "never fetches or decodes a full audio object",
    ].every((term) => acceptance("RFA-13-AC04").assertion.includes(term)),
    "RFA-13 repository-wide long-form waveform acceptance drift",
  );
  invariant(
    [
      "voice-comparison or voice-cloning",
      "AuditionSessionId",
      "30 seconds",
      "5242880 bytes",
      "VoiceJob and narration runId are forbidden",
      "server waveform envelope or no waveform",
    ].every((term) => acceptance("RFA-16-AC03").assertion.includes(term)),
    "RFA-16 bounded Audition waveform acceptance drift",
  );
  invariant(
    acceptance("RFA-17-AC03").assertion.includes("backend-authored") &&
      [
        "backendUnavailable",
        "corruptState",
        "durableStorageFailure",
        "unrecoverableInvariantViolation",
        "clearCondition",
      ].every((term) => acceptance("RFA-17-AC03").assertion.includes(term)) &&
      acceptance("RFA-17-AC04").assertion.includes("expires after 30 seconds to unknown"),
    "RFA-17 health authority acceptance drift",
  );
  invariant(
    acceptance("RFA-11-AC03").assertion.includes("imported once") &&
      acceptance("RFA-11-AC03").assertion.includes("server snapshot exists it always wins") &&
      acceptance("RFA-11-AC03").assertion.includes(
        "no workflow-authoritative localStorage write remains",
      ) &&
      acceptance("RFA-11-AC03").evidenceArtifact ===
        contract.serverAuthority.legacyBrowserStateTransition.retirementEvidencePath,
    "RFA-11 legacy browser-authority retirement drift",
  );
  invariant(
    acceptance("RFA-06-AC02").evidenceArtifact ===
      contract.mediaContract.durableArtifactMigration.backfillEvidencePath &&
      acceptance("RFA-19-AC04").verificationCommand ===
        "node scripts/e2e-reader-first-continuity.mjs --all",
    "contract evidence ownership or RFA-19 stale-mutation harness drift",
  );
  invariant(
    ["RFA-20-AC02", "RFA-20-AC04"].every((id) =>
      acceptance(id).verificationCommand.includes("run-reader-first-release-gate.mjs"),
    ),
    "RFA-20 runtime assertions must use the integrated release gate",
  );
  invariant(
    byId.get("RFA-02").legacyRemovalOwned.length === 0 &&
      byId
        .get("RFA-11")
        .legacyRemovalOwned.some((entry) => entry.includes("browser-authoritative")),
    "browser-authority removal must be frontend-owned",
  );
  invariant(
    byId.get("RFA-20").title ===
      "Adjudicate the integrated Design for the Real World release gate" &&
      byId.get("RFA-20").objective.includes("verdict only") &&
      byId.get("RFA-20").legacyRemovalOwned.length === 0 &&
      byId.get("RFA-20").nonGoals.includes("No legacy deletion"),
    "RFA-20 must remain pure adjudication without legacy deletion",
  );
  const visiting = new Set();
  const visited = new Set();
  for (const id of ISSUE_IDS) visit(id, byId, visiting, visited);

  invariant(
    canonicalHash(contract) === EXPECTED_CONTRACT_CANONICAL_SHA256,
    "canonical contract SHA-256 drift",
  );
  invariant(
    canonicalHash(packet) === EXPECTED_PACKET_CANONICAL_SHA256,
    "canonical packet SHA-256 drift",
  );
}

function ids(values) {
  return values.length === 0 ? "none" : values.map((value) => `\`${value}\``).join(", ");
}
function bullets(values) {
  return values.map((value) => `- ${value}`);
}
export function renderPacketMarkdown(packet) {
  const lines = [
    "<!-- Generated by scripts/validate-reader-first-release.mjs; edit canonical JSON, not this file. -->",
    "",
    "# TTS-Research Reader-First Architecture release batch",
    "",
    `Status: \`${packet.status}\``,
    "",
    `Linear target: team \`QQP\`, project \`TTS-Research\` (0 / ${packet.capacitySnapshot.cap} active).`,
    "",
    "Peer, Linear creation, and product implementation remain unauthorized.",
    "",
    "## DAG",
    "",
    ...packet.issues.map(
      (issue) => `- **${issue.localId}** depends on ${ids(issue.dependencies)}.`,
    ),
    "",
    "## Linear-ready issue descriptions",
    "",
  ];
  for (const issue of packet.issues) {
    lines.push(
      `## ${issue.localId} — ${issue.title}`,
      "",
      `**Accountable owner surface:** ${issue.accountableOwnerSurface}`,
      "",
      "### Objective",
      "",
      issue.objective,
      "",
      `**Dependencies:** ${ids(issue.dependencies)}`,
      "",
      "### In scope",
      "",
      "Paths:",
      ...bullets(issue.inScope.paths.map((value) => `\`${value}\``)),
      "",
      "Symbols/contracts:",
      ...bullets(issue.inScope.symbols.map((value) => `\`${value}\``)),
      "",
      "### Non-goals",
      "",
      ...bullets(issue.nonGoals),
      "",
      "### Acceptance and evidence",
      "",
    );
    for (const probe of issue.acceptanceProbes) {
      lines.push(
        `- **${probe.id}:** ${probe.assertion}`,
        `  - Verify: \`${probe.verificationCommand}\``,
        `  - Evidence: \`${probe.evidenceArtifact}\``,
        `  - Failure: \`${probe.onFailure}\``,
      );
    }
    lines.push(
      "",
      "### Verification commands",
      "",
      ...bullets(issue.verificationCommands.map((value) => `\`${value}\``)),
      "",
      "### Required evidence artifacts",
      "",
      ...bullets(issue.evidenceArtifacts.map((value) => `\`${value}\``)),
      "",
      "### Observability",
      "",
      ...bullets(issue.observabilityEvidence.events.map((value) => `\`${value}\``)),
      `- Required fields: ${ids(issue.observabilityEvidence.requiredFields)}`,
      "",
      "### Rollback boundary",
      "",
      `- Strategy: \`${issue.rollbackBoundary.strategy}\``,
      `- Preserve: ${ids(issue.rollbackBoundary.preserve)}`,
      `- Never: ${ids(issue.rollbackBoundary.never)}`,
      `- Evidence: \`${issue.rollbackBoundary.verification}\``,
      "",
      `**Performance budgets:** ${ids(issue.performanceBudgetIds)}`,
      "",
      `**Legacy removal owned here:** ${ids(issue.legacyRemovalOwned)}`,
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function validateExecutableOcrFixture(overlay, contract) {
  const allowedRoles = new Set(contract.structureContract.unitRoles);
  invariant(
    overlay.expectedOverlay.units.every((unit) => allowedRoles.has(unit.role)),
    "executable OCR overlay role is outside structureContract.unitRoles",
  );
  const fixtureAuditFields = overlay.requiredResolution?.auditFields;
  invariant(
    same(fixtureAuditFields, [
      "sourceNodeId",
      "sourceEvidence",
      "sourceOverlayRevision",
      "reviewedOverlayRevision",
      "reviewerId",
      "resolvedRole",
      "resolvedDisposition",
      "resolvedAt",
    ]) &&
      same(
        fixtureAuditFields,
        contract.structureContract.ocrReviewRequiredPolicy.requiredAuditFields,
      ),
    "executable OCR fixture resolution audit-field schema drift",
  );
}

async function verifyEvidenceBindings(root, contract) {
  for (const [relativePath, expected] of EVIDENCE_BINDINGS) {
    const absolute = path.join(root, relativePath);
    const bytes = await readFile(absolute);
    invariant(sha256(bytes) === expected, `${relativePath}: evidence SHA-256 drift`);
  }
  const fixture = await stat(path.join(root, "fixtures/pdf/scanned_fixture.pdf"));
  invariant(fixture.size === 84284, "scanned PDF fixture byte-size drift");
  const overlay = JSON.parse(
    await readFile(path.join(root, "fixtures/pdf/scanned_fixture.expected-overlay.json"), "utf8"),
  );
  validateExecutableOcrFixture(overlay, contract);
}

export async function runValidation({ root = process.cwd(), write = false } = {}) {
  const [contractText, packetText] = await Promise.all([
    readFile(path.join(root, CONTRACT_PATH), "utf8"),
    readFile(path.join(root, PACKET_PATH), "utf8"),
  ]);
  const contract = JSON.parse(contractText);
  const packet = JSON.parse(packetText);
  validateReaderFirstRelease(contract, packet);
  invariant(sha256(contractText) === EXPECTED_CONTRACT_SHA256, "contract file-byte SHA-256 drift");
  invariant(sha256(packetText) === EXPECTED_PACKET_SHA256, "packet file-byte SHA-256 drift");
  await verifyEvidenceBindings(root, contract);
  const rendered = renderPacketMarkdown(packet);
  const markdownPath = path.join(root, MARKDOWN_PATH);
  if (write) await writeFile(markdownPath, rendered);
  else {
    const markdown = await readFile(markdownPath, "utf8");
    invariant(markdown === rendered, "Reader-First Markdown parity drift");
    invariant(sha256(markdown) === EXPECTED_MARKDOWN_SHA256, "generated Markdown SHA-256 drift");
  }
  return { mode: write ? "write" : "check", issueCount: packet.issueCount };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  runValidation({ write: process.argv.includes("--write") })
    .then(({ mode, issueCount }) =>
      console.log(
        `Reader-First release ${mode} passed: ${issueCount} issues and all owner gates valid`,
      ),
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
