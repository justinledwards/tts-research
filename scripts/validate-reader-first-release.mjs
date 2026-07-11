#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
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
export const PARENT_AUTHORIZATION_PATH =
  "docs/reviews/reader-first-rfa02-parent-authorization.json";
export const RFA_02_START_AUTHORIZATION_PATH =
  "docs/reviews/reader-first-rfa02-start-scope-authorization.json";
export const RFA_01_VERIFICATION_PATH = "docs/evidence/reader-first/RFA-01/verification.json";
export const RFA_01_ROLLBACK_PATH = "docs/evidence/reader-first/RFA-01/rollback.json";
const VALIDATOR_PATH = "scripts/validate-reader-first-release.mjs";
export const ISSUE_IDS = Array.from(
  { length: 20 },
  (_, index) => `RFA-${String(index + 1).padStart(2, "0")}`,
);

const EXPECTED_CONTRACT_SHA256 = "f7fd41ae66e7b68fdc8e2af75a8061dbccbf05a974a70605ba4eebdac82e27c7";
const EXPECTED_CONTRACT_CANONICAL_SHA256 =
  "80b161f49ce2ae97bc4a8b49bd603ad1eaefe1844b16cdb59aa42ecd652ffefe";
const EXPECTED_PACKET_SHA256 = "54155e7c1aebd54310dc484b28eaa1f1002c7764e8ed8977d6a7b822eb045c6c";
const EXPECTED_PACKET_CANONICAL_SHA256 =
  "cf46cbc248ef0938e0d4fc09a532a7a3b7998887acfd7ae96e9f0ccb81508705";
const EXPECTED_MARKDOWN_SHA256 = "e22d928bb4b88e89ca80fb7a89791196b1a02c57a2613ccd4ed361bcd1e97066";
const EXPECTED_STATUS = "peer_approved_rfa_01_completed_rfa_02_in_progress_product_authorized";
const EXPECTED_AUTHORIZATION = {
  ownerAccepted: true,
  peerApproved: true,
  linearCreationAuthorized: true,
  productImplementationAuthorized: true,
  graphUnblockedIssues: ["RFA-02"],
  authorizedIssues: ["RFA-02"],
};
const HISTORICAL_RFA_01_CONTRACT_SHA256 =
  "a3b2f75fa7393f93f0d2494bc5825c44e758dd2220d1fc3a78300d72a43ec868";
const HISTORICAL_RFA_01_PACKET_SHA256 =
  "aa5e20a24b856caea74b78d224ac80307b7290f05cc35cb4169da7d9e1bdd44b";
const HISTORICAL_RFA_01_VALIDATOR_SHA256 =
  "7fe7f5bcd2e4ba5e2b11d6d2b75c5c509201b86b70aa61e11651071ef028a41e";
const HISTORICAL_RFA_01_STATUS = "peer_approved_linear_created_rfa_01_product_authorized";
const HISTORICAL_RFA_01_AUTHORIZATION = {
  ownerAccepted: true,
  peerApproved: true,
  linearCreationAuthorized: true,
  productImplementationAuthorized: true,
  graphUnblockedIssues: ["RFA-01"],
  authorizedIssues: ["RFA-01"],
};
const EXPECTED_PARENT_AUTHORIZATION_SHA256 =
  "41fa61517142af7c1ad5d2e9204aaaa4fa7c3020d21443df311a4532a329d265";
const EXPECTED_LIVE_MANIFEST_SHA256 =
  "54b00631d390e4ba504708191f6ccf4b4f2bce04974fe27fd3e5cef339c1595a";
const EXPECTED_RFA_02_START_AUTHORIZATION_SHA256 =
  "14463389f0b9b686e194deaec3f7bb27616e32c2f09c48615259bf86748ea07c";
const RFA_02_AUTHORIZATION_COMMIT = "836cf2c8f4631e237543d234fea339a659828529";
const RFA_02_PO_COMMENT_URL =
  "https://linear.app/niklas-olsson/issue/QQP-614/rfa-02-add-server-authoritative-project-restoration-snapshot-and#comment-87c70bed";
const RFA_02_STARTED_STATE_ID = "8952b964-26ec-474c-838b-de6ecc3facb3";
const EXPECTED_RFA_02_SCOPE_PATHS = [
  "backend/internal/httpapi",
  "packages/schema",
  "backend/data",
  "scripts/e2e-reader-first-continuity.mjs",
  "backend/internal/contentir/schema",
  "backend/internal/pipeline",
  "scripts/generate-contract-types-templates.mjs",
  "packages/sdk-py/src/voice_studio_sdk/schema_files",
  "fixtures/contracts/schema-snapshots",
  "docs/contracts/schema-bundle.v1.json",
];
const EXPECTED_RFA_02_SCOPE_SYMBOLS = [
  "ReaderWorkspaceSnapshot",
  "GET/PUT project reader-workspace",
  "snapshot v0-to-v1 migrator",
  "canonical ReaderWorkspaceSnapshot schema generation",
  "minimum server-derived source-revision/run-compatibility read projection",
];
const EXPECTED_RFA_02_NON_GOALS = [
  "No audio delivery or generation behavior changes",
  "No automatic playback on restore",
  "No browser-provided compatibility or browser authority",
];
const RFA_01_COMPLETION_COMMIT = "44aa1ad0640aad8c9c18014346a6923189228b41";
const EVIDENCE_SCHEMA_VERSION = "tts-research.reader-first-evidence-manifest.v1";
const EVIDENCE_SEMANTICS = "static_attestation_of_recorded_execution";
const EVIDENCE_PRODUCER = "Hermes Agent RFA-01 evidence capture producer v1";
const EXPECTED_ARCHIVE_NAME = "tts-research-reader-first-peer-review-v8.zip";
const EXPECTED_ARCHIVE_SHA256 = "b91a683ac8c94bd44ca618b53b275cbe93c2d55d8a5cac1b11e6d9d1aeafc7de";
const EXPECTED_SOURCE_COMMIT = "0f74143156a970c04b404a650f724b572e0ee2fd";
const EXPECTED_APPROVAL_BINDING = {
  approvalBindingPath: "docs/reviews/reader-first-release-peer-approval-v8.json",
  approvalBindingSha256: "29710a3b5af4fc21be5091b454a57fc7c2b14d363a9fc46706e403e901e7ecef",
};
// Static attestations must describe one bounded capture. A five-minute skew permits slow clocks.
const MAX_CAPTURE_INTERVAL_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EXPECTED_FIXTURE_SHA256S = {
  "fixtures/pdf/scanned_fixture.pdf":
    "25eeaa49a696c8d5f0fca7b80ec9ec11ebd6450c33f7a279a26555b0e56a5500",
  "fixtures/pdf/scanned_fixture.ocr.txt":
    "fbed95e0ddf91100b02ffc1978147df53a2c2f7a0da6a8ed23e67ba5b7f09f78",
  "fixtures/pdf/scanned_fixture.expected-overlay.json":
    "783a5d48857303fc8c7f7a67fd3b5e5e5e06deb87469724ef3d76a15e1a9ca06",
};
const EXPECTED_ROLLBACK = {
  strategy: "disable_rfa_01_new_behavior_keep_prior_compatible_state",
  preserve: ["source_content", "committed_compatible_artifacts", "server_authoritative_revisions"],
  never: ["delete_valid_artifacts", "infer_rebuild", "restore_browser_authority"],
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
  [LIVE_MANIFEST_PATH, EXPECTED_LIVE_MANIFEST_SHA256],
  [PARENT_AUTHORIZATION_PATH, EXPECTED_PARENT_AUTHORIZATION_SHA256],
  [RFA_02_START_AUTHORIZATION_PATH, EXPECTED_RFA_02_START_AUTHORIZATION_SHA256],
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

export function validateParentAuthorization(record) {
  invariant(
    record?.schemaVersion === "tts-research.reader-first-parent-authorization.v1" &&
      record.recordedAt === "2026-07-11T02:31:15Z" &&
      record.authority === "canonical_parent_authorization_transition",
    "RFA-02 parent authorization record is stale or has unexpected authority",
  );
  invariant(
    record.peerApproval?.round === "reader-first-release-v8" &&
      record.peerApproval?.verdict === "approved" &&
      record.peerApproval?.responsePath === EVIDENCE_BINDINGS[21][0] &&
      record.peerApproval?.responseSha256 === EVIDENCE_BINDINGS[21][1] &&
      record.peerApproval?.parentApprovalPath === EXPECTED_APPROVAL_BINDING.approvalBindingPath &&
      record.peerApproval?.parentApprovalSha256 ===
        EXPECTED_APPROVAL_BINDING.approvalBindingSha256 &&
      record.peerApproval?.archive === EXPECTED_ARCHIVE_NAME &&
      record.peerApproval?.archiveSha256 === EXPECTED_ARCHIVE_SHA256 &&
      record.peerApproval?.productImplementationPermitted === true,
    "RFA-02 parent authorization Peer v8 binding drift",
  );
  invariant(
    record.liveLinearManifest?.path === LIVE_MANIFEST_PATH &&
      record.liveLinearManifest?.sha256 ===
        "f9aa05aa04221f34bea1e0b3a0b0f7c0c6b4ce8c7fc26d1b948435ac5c29608b" &&
      record.liveLinearManifest?.verifiedAt === "2026-07-11T02:31:15Z",
    "RFA-02 historical parent authorization live Linear binding drift",
  );
  invariant(
    record.completedDependency?.localId === "RFA-01" &&
      record.completedDependency?.linearIdentifier === "QQP-613" &&
      record.completedDependency?.linearState === "Done" &&
      record.completedDependency?.linearStateType === "completed" &&
      record.completedDependency?.completionCommit === RFA_01_COMPLETION_COMMIT,
    "RFA-01 completion fact or commit binding drift",
  );
  invariant(
    same(record.completedDependency.historicalAuthorization, {
      status: HISTORICAL_RFA_01_STATUS,
      graphUnblockedIssues: ["RFA-01"],
      authorizedIssues: ["RFA-01"],
    }) &&
      same(record.completedDependency.immutableEvidence, {
        verificationPath: RFA_01_VERIFICATION_PATH,
        verificationSha256: "8bfffb270cb7d4c1ccb4ffc52297a9589f8349726ac685afe726ac942b07ba96",
        rollbackPath: RFA_01_ROLLBACK_PATH,
        rollbackSha256: "83097e307834b600029136dc70f08ac67a9793a041e44e42cecac9e82bce0383",
      }),
    "RFA-01 historical authorization/evidence binding drift",
  );
  invariant(
    record.authorizedCandidate?.localId === "RFA-02" &&
      record.authorizedCandidate?.linearIdentifier === "QQP-614" &&
      record.authorizedCandidate?.linearState === "Backlog" &&
      record.authorizedCandidate?.linearStateType === "backlog" &&
      same(record.authorizedCandidate?.dependencies, ["RFA-01"]) &&
      same(record.authorizedCandidate?.dependencyClosure, [
        {
          localId: "RFA-01",
          linearIdentifier: "QQP-613",
          linearState: "Done",
          linearStateType: "completed",
          completionCommit: RFA_01_COMPLETION_COMMIT,
        },
      ]) &&
      record.authorizedCandidate?.dependencyClosureSatisfied === true &&
      record.authorizedCandidate?.productImplementationAuthorized === true &&
      record.authorizedCandidate?.linearTransitionPerformed === false,
    "RFA-02 historical authorization, dependency closure, or Backlog fact drift",
  );
  invariant(
    same(record.currentAuthorization, EXPECTED_AUTHORIZATION) &&
      same(record.blockedUnauthorizedIssues, ISSUE_IDS.slice(2)) &&
      record.linearMutationPerformed === false &&
      record.productMutationPerformed === false,
    "historical sole RFA-02 authorization drift",
  );
}

export function validateRfa02StartAuthorization(record, manifest, packet) {
  const rfa01 = manifest?.issues?.find(({ localId }) => localId === "RFA-01");
  const rfa02 = manifest?.issues?.find(({ localId }) => localId === "RFA-02");
  const packetRfa02 = packet?.issues?.find(({ localId }) => localId === "RFA-02");
  invariant(
    record?.schemaVersion === "tts-research.reader-first-rfa02-start-scope-authorization.v1" &&
      record.recordedAt === "2026-07-11T09:25:28Z" &&
      record.authority === "acting_product_owner_scope_expansion_and_execution_start",
    "RFA-02 current execution authorization identity drift",
  );
  invariant(
    same(record.previousAuthorization, {
      path: PARENT_AUTHORIZATION_PATH,
      sha256: EXPECTED_PARENT_AUTHORIZATION_SHA256,
      authorizationCommit: RFA_02_AUTHORIZATION_COMMIT,
    }),
    "RFA-02 previous authorization commit/hash binding drift",
  );
  invariant(
    record.liveLinearManifest?.path === LIVE_MANIFEST_PATH &&
      record.liveLinearManifest?.sha256 === EXPECTED_LIVE_MANIFEST_SHA256 &&
      record.liveLinearManifest?.verifiedAt === manifest?.verifiedAt &&
      manifest?.verifiedAt === "2026-07-11T09:25:28Z" &&
      rfa01?.identifier === "QQP-613" &&
      rfa01?.state === "Done" &&
      rfa01?.stateType === "completed" &&
      rfa02?.identifier === "QQP-614" &&
      rfa02?.state === "In Progress" &&
      rfa02?.stateType === "started" &&
      rfa02?.stateId === RFA_02_STARTED_STATE_ID &&
      same(record.liveLinearManifest.completedDependency, {
        localId: "RFA-01",
        linearIdentifier: "QQP-613",
        linearState: "Done",
        linearStateType: "completed",
      }) &&
      same(record.liveLinearManifest.startedIssue, {
        localId: "RFA-02",
        linearIdentifier: "QQP-614",
        linearState: "In Progress",
        linearStateType: "started",
        linearStateId: RFA_02_STARTED_STATE_ID,
      }),
    "RFA-02 current In Progress live Linear binding drift",
  );
  invariant(
    record.productOwnerDecision?.commentUrl === RFA_02_PO_COMMENT_URL &&
      record.productOwnerDecision?.decision ===
        "approve_exact_rfa02_scope_expansion_and_execution_start" &&
      record.productOwnerDecision?.productMutationPerformed === false,
    "RFA-02 PO comment/start decision binding drift",
  );
  invariant(
    record.authorizedScope?.localId === "RFA-02" &&
      same(record.authorizedScope?.paths, EXPECTED_RFA_02_SCOPE_PATHS) &&
      same(record.authorizedScope?.symbols, EXPECTED_RFA_02_SCOPE_SYMBOLS) &&
      same(record.authorizedScope?.nonGoals, EXPECTED_RFA_02_NON_GOALS) &&
      same(packetRfa02?.inScope?.paths, EXPECTED_RFA_02_SCOPE_PATHS) &&
      same(packetRfa02?.inScope?.symbols, EXPECTED_RFA_02_SCOPE_SYMBOLS) &&
      same(packetRfa02?.nonGoals, EXPECTED_RFA_02_NON_GOALS),
    "RFA-02 exact authorized scope path/symbol/non-goal drift",
  );
  invariant(
    same(record.currentAuthorization, EXPECTED_AUTHORIZATION) &&
      same(record.blockedUnauthorizedIssues, ISSUE_IDS.slice(2)) &&
      record.productMutationPerformed === false &&
      same(manifest.authorization, EXPECTED_AUTHORIZATION),
    "sole current RFA-02 execution authorization drift",
  );
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
    "Peer-approved sole RFA-02 product authorization drift",
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
      server.restoreAutoplay === false &&
      server.artifactCompatibilityAuthority === "server",
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
      health.missingLegacyIdentityMayDemandRebuild === false &&
      health.rebuildRequiresExplicitIncompatibilityEvidence === true &&
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
      contract.liveLinearManifest?.relationCount === 65 &&
      contract.liveLinearManifest?.verifiedAt === "2026-07-11T09:25:28Z",
    "live Linear manifest binding drift",
  );
  invariant(
    same(contract.parentAuthorization, {
      path: PARENT_AUTHORIZATION_PATH,
      sha256: EXPECTED_PARENT_AUTHORIZATION_SHA256,
    }),
    "RFA-02 parent authorization binding drift",
  );
  invariant(
    same(contract.currentExecutionAuthorization, {
      path: RFA_02_START_AUTHORIZATION_PATH,
      sha256: EXPECTED_RFA_02_START_AUTHORIZATION_SHA256,
    }),
    "RFA-02 current execution authorization binding drift",
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
      same(packet.liveLinearManifest, contract.liveLinearManifest) &&
      same(packet.parentAuthorization, contract.parentAuthorization) &&
      same(packet.currentExecutionAuthorization, contract.currentExecutionAuthorization),
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
      eligibleForProductImplementation: ["RFA-02"],
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
  invariant(
    same(byId.get("RFA-02")?.inScope?.paths, EXPECTED_RFA_02_SCOPE_PATHS) &&
      same(byId.get("RFA-02")?.inScope?.symbols, EXPECTED_RFA_02_SCOPE_SYMBOLS) &&
      same(byId.get("RFA-02")?.nonGoals, EXPECTED_RFA_02_NON_GOALS),
    "RFA-02 exact authorized scope path/symbol/non-goal drift",
  );
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
    const completed = prefix === "RFA-01";
    const unblocked = prefix === "RFA-02";
    const linearNumber = 612 + Number(prefix.slice(4));
    invariant(
      issue.ownerAccepted === true &&
        issue.peerApproved === true &&
        issue.linearCreationAuthorized === true &&
        issue.productImplementationAuthorized === unblocked &&
        issue.linear?.identifier === `QQP-${linearNumber}` &&
        issue.linear?.state === (completed ? "Done" : unblocked ? "In Progress" : "Backlog") &&
        issue.linear?.stateType === (completed ? "completed" : unblocked ? "started" : "backlog") &&
        (unblocked ? issue.linear?.stateId === RFA_02_STARTED_STATE_ID : true) &&
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
          (completed
            ? "completed_linear_done"
            : unblocked
              ? "in_progress_product_authorized"
              : "dependency_blocked_linear_created"),
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
    `Linear target: team \`QQP\`, project \`TTS-Research\` (${packet.capacitySnapshot.activeUnarchived} / ${packet.capacitySnapshot.cap} unarchived).`,
    "",
    "RFA-01 is completed in Linear; its immutable evidence preserves the historical RFA-01 authorization capture.",
    "",
    "RFA-02 is In Progress and remains the sole currently graph-unblocked and product-authorized issue; no product mutation has yet been performed.",
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

export function validateNegativeFixtures(contract, packet) {
  const fixtures = [
    {
      id: "browser-authority",
      expected: /browser storage and restore-autoplay authority drift/,
      mutate(candidate) {
        candidate.serverAuthority.browserStorageRole = "workflow_authority";
      },
    },
    {
      id: "final-only-alignment",
      expected: /timing source\/fallback contract drift/,
      mutate(candidate) {
        candidate.timingContract.forcedAlignmentMayWaitForFinalAssembly = true;
      },
    },
    {
      id: "monolithic-normal-playback",
      expected: /segment-first durable media contract drift/,
      mutate(candidate) {
        candidate.mediaContract.canonicalPlaybackArtifact = "monolithic_final_audio";
      },
    },
    {
      id: "multiple-audio-owners",
      expected: /single append-capable playback owner drift/,
      mutate(candidate) {
        candidate.playbackContract.maxAudioOwnersPerRun = 2;
      },
    },
    {
      id: "narration-preview-binding",
      expected: /single append-capable playback owner drift/,
      mutate(candidate) {
        candidate.playbackContract.previewMayOwnNarrationRun = true;
      },
    },
    {
      id: "inferred-rebuild-or-critical-status",
      expected: /backend-owned truthful health contract drift/,
      mutate(candidate) {
        candidate.healthContract.missingLegacyIdentityMayDemandRebuild = true;
        candidate.healthContract.frontendMayInferSystemCritical = true;
      },
    },
  ];
  for (const fixture of fixtures) {
    const candidate = structuredClone(contract);
    fixture.mutate(candidate);
    let rejected = false;
    try {
      validateReaderFirstRelease(candidate, packet);
    } catch (error) {
      rejected = error instanceof Error && fixture.expected.test(error.message);
    }
    invariant(rejected, `${fixture.id}: required negative fixture was not rejected semantically`);
  }
  return fixtures.map(({ id }) => id);
}

async function readEvidenceManifest(root, relativePath) {
  let text;
  try {
    text = await readFile(path.join(root, relativePath), "utf8");
  } catch {
    throw new Error(`${relativePath}: required evidence artifact missing or unreadable`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${relativePath}: required evidence artifact is malformed JSON`);
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const EXPECTED_AC01_TEST_NAMES = [
  "canonical contract, exact evidence hashes, packet, DAG, and generated Markdown pass",
  "Peer approval, Linear creation, and root-only product authorization reject drift",
  "snapshot migration, browser transition, and revision concurrency are semantic invariants",
  "nominal request envelope and manifest-only Reader fallback reject drift",
  "completed artifacts cannot regress to missing during backfill",
  "consumed timing identity and boundaries are immutable in both directions",
  "real scanned OCR evidence must stop unresolved narration and create reviewed revisions",
  "executable OCR fixture schema rejects legacy aliases independently of canonical hashes",
  "system critical is backend-evidenced, fresh, enumerated, and not inferred by UI",
  "archive-contained audit and Linear provenance bindings reject free-form drift",
  "issue count, IDs, DAG, and dependency order are exact",
  "issue execution schema requires owner, repository scope, non-goals, commands, and evidence",
  "every acceptance assertion is bound to an issue command, evidence file, and fail-closed result",
  "issue-local observability, rollback, and performance budgets reject generic or centralized drift",
  "RFA-20 is adjudication-only and legacy removal stays with implementation owners",
  "Round 2 blocker semantics reject packet regressions independently of canonical seals",
  "RFA-15 authoritative timing renderer ownership rejects every omission",
  "Round 2 execution ownership, dependencies, gates, and evidence reject drift",
  "Round 3 executable ownership, enums, budgets, and harness semantics reject drift",
  "random title/objective drift is caught by the canonical object seal",
];

function validateUuid(value, label) {
  invariant(typeof value === "string" && UUID_V4.test(value), `${label}: UUID v4 required`);
}
function utcMillis(value, label, now = Date.now()) {
  invariant(
    typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value),
    `${label}: canonical UTC timestamp required`,
  );
  const parsed = Date.parse(value);
  invariant(Number.isFinite(parsed), `${label}: valid UTC timestamp required`);
  invariant(parsed <= now + MAX_CLOCK_SKEW_MS, `${label}: timestamp is too far in the future`);
  return parsed;
}
function validateMetadata(record, label) {
  invariant(
    record.evidenceSemantics === EVIDENCE_SEMANTICS,
    `${label}: static attestation semantics required`,
  );
  invariant(
    record.reviewer === EVIDENCE_PRODUCER,
    `${label}: fixed evidence producer identity required`,
  );
  invariant(
    /^v\d+\.\d+\.\d+$/.test(record.toolVersions?.node) &&
      /^\d+\.\d+\.\d+(?:\.[0-9]+)?$/.test(record.toolVersions?.git),
    `${label}: structured node and git tool versions required`,
  );
  invariant(
    ["linux", "darwin", "win32"].includes(record.operatingSystem?.platform) &&
      typeof record.operatingSystem?.release === "string" &&
      record.operatingSystem.release.length >= 3 &&
      /^(?:x64|arm64|ia32)$/.test(record.operatingSystem?.architecture),
    `${label}: meaningful structured operating system required`,
  );
  invariant(
    typeof record.hardwareProfile?.cpuModel === "string" &&
      record.hardwareProfile.cpuModel.trim().length >= 8 &&
      Number.isInteger(record.hardwareProfile.logicalCpuCount) &&
      record.hardwareProfile.logicalCpuCount > 0 &&
      Number.isInteger(record.hardwareProfile.totalMemoryBytes) &&
      record.hardwareProfile.totalMemoryBytes >= 256 * 1024 * 1024,
    `${label}: meaningful structured hardware profile required`,
  );
}
function validateApprovalResolution(record, approval, approvalHash, label) {
  invariant(
    approvalHash === EXPECTED_APPROVAL_BINDING.approvalBindingSha256 &&
      approval?.peerReview?.archive === EXPECTED_ARCHIVE_NAME &&
      approval.peerReview.archiveSha256 === EXPECTED_ARCHIVE_SHA256,
    `${label}: approval record does not resolve expected archive`,
  );
  invariant(
    record.approvalBindingPath === EXPECTED_APPROVAL_BINDING.approvalBindingPath &&
      record.approvalBindingSha256 === approvalHash &&
      record.archiveName === approval.peerReview.archive &&
      record.archiveSha256 === approval.peerReview.archiveSha256 &&
      record.commitOrArchiveSha256 === approval.peerReview.archiveSha256,
    `${label}: unresolved or mismatched archive approval binding`,
  );
}
function validateAc01Output(output, label) {
  invariant(
    typeof output === "string" && !output.includes("[truncated]"),
    `${label}: truncated output forbidden`,
  );
  const passNames = output
    .split("\n")
    .filter((line) => line.startsWith("✔ "))
    .map((line) => line.replace(/^✔ /, "").replace(/ \([\d.]+ms\)$/, ""));
  invariant(
    same(passNames, EXPECTED_AC01_TEST_NAMES),
    `${label}: complete ordered AC01 TAP test names required`,
  );
  for (const summary of [
    "ℹ tests 20",
    "ℹ suites 0",
    "ℹ pass 20",
    "ℹ fail 0",
    "ℹ cancelled 0",
    "ℹ skipped 0",
    "ℹ todo 0",
  ])
    invariant(output.split("\n").includes(summary), `${label}: complete AC01 TAP summary required`);
}
function validateExecution(
  record,
  expected,
  captureStart,
  captureEnd,
  approval,
  approvalHash,
  label,
) {
  invariant(record?.issueId === "RFA-01", `${label}: issue ID drift`);
  validateUuid(record.correlationId, `${label} correlationId`);
  invariant(record.acceptanceProbeId === expected.acceptanceProbeId, `${label}: probe ID drift`);
  invariant(record.command === expected.command, `${label}: canonical command drift`);
  invariant(record.executionMode === expected.executionMode, `${label}: execution mode drift`);
  invariant(
    same(record.fixtureSha256s, expected.fixtureSha256s),
    `${label}: fixture bindings drift`,
  );
  invariant(
    record.measurementProfile === expected.measurementProfile,
    `${label}: measurement profile drift`,
  );
  validateMetadata(record, label);
  validateApprovalResolution(record, approval, approvalHash, label);
  const started = utcMillis(record.startedAt, `${label} startedAt`);
  const completed = utcMillis(record.completedAt, `${label} completedAt`);
  const observed = utcMillis(record.observedAt, `${label} observedAt`);
  invariant(observed === completed, `${label}: observedAt must equal completedAt`);
  invariant(
    captureStart <= started && started <= completed && completed <= captureEnd,
    `${label}: timestamps outside bounded capture interval`,
  );
  invariant(record.exitCode === 0, `${label}: exitCode must be exactly 0`);
  invariant(record.rawOutputPath === expected.rawOutputPath, `${label}: raw output path drift`);
  invariant(
    typeof record.stdout === "string" &&
      typeof record.stderr === "string" &&
      record.rawOutput === `${record.stdout}${record.stderr}` &&
      SHA256.test(record.outputSha256) &&
      record.outputSha256 === sha256(record.rawOutput),
    `${label}: complete stdout/stderr output hash mismatch`,
  );
  invariant(record.result === "pass", `${label}: passing result required`);
  expected.validateOutput(record.rawOutput, label);
}

function expectedRollbackCommand() {
  return (
    'node --input-type=module -e \'import assert from "node:assert/strict"; import {readFile} from "node:fs/promises"; ' +
    'const packet=JSON.parse(await readFile("docs/project-management/linear/tts-research-reader-first-release-batch-draft.json","utf8")); ' +
    'const issue=packet.issues.find(({localId})=>localId==="RFA-01"); ' +
    'assert.equal(issue.rollbackBoundary.strategy,"disable_rfa_01_new_behavior_keep_prior_compatible_state"); ' +
    'assert.deepEqual(issue.rollbackBoundary.preserve,["source_content","committed_compatible_artifacts","server_authoritative_revisions"]); ' +
    'assert.deepEqual(issue.rollbackBoundary.never,["delete_valid_artifacts","infer_rebuild","restore_browser_authority"]); ' +
    `console.log(\`RFA-01 rollback boundary passed: preserve=\${issue.rollbackBoundary.preserve.join(",")} never=\${issue.rollbackBoundary.never.join(",")}\`);'`
  );
}

export function validateRfa01Evidence(
  verification,
  rollback,
  packet,
  _validatorHash,
  approval,
  approvalHash,
) {
  const issue = packet.issues.find(({ localId }) => localId === "RFA-01");
  invariant(issue, "RFA-01: canonical packet issue missing");
  const captureStart = utcMillis(
    verification.captureStartedAt,
    `${RFA_01_VERIFICATION_PATH} captureStartedAt`,
  );
  const captureEnd = utcMillis(
    verification.captureCompletedAt,
    `${RFA_01_VERIFICATION_PATH} captureCompletedAt`,
  );
  const observedAt = utcMillis(verification.observedAt, `${RFA_01_VERIFICATION_PATH} observedAt`);
  invariant(
    observedAt === captureEnd,
    `${RFA_01_VERIFICATION_PATH}: observedAt must equal captureCompletedAt`,
  );
  invariant(
    captureStart <= captureEnd && captureEnd - captureStart <= MAX_CAPTURE_INTERVAL_MS,
    `${RFA_01_VERIFICATION_PATH}: capture interval exceeds ten minutes`,
  );
  invariant(
    verification?.schemaVersion === EVIDENCE_SCHEMA_VERSION &&
      verification.immutable === true &&
      verification.supersessionOnly === true &&
      verification.evidenceSemantics === EVIDENCE_SEMANTICS,
    `${RFA_01_VERIFICATION_PATH}: evidence lifecycle drift`,
  );
  invariant(
    verification.issueId === "RFA-01" &&
      verification.linearIssueId === issue.linear.identifier &&
      verification.result === "pass",
    `${RFA_01_VERIFICATION_PATH}: identity or result drift`,
  );
  validateUuid(verification.correlationId, `${RFA_01_VERIFICATION_PATH} correlationId`);
  validateMetadata(verification, RFA_01_VERIFICATION_PATH);
  validateApprovalResolution(verification, approval, approvalHash, RFA_01_VERIFICATION_PATH);
  invariant(
    verification.contractHash === HISTORICAL_RFA_01_CONTRACT_SHA256 &&
      verification.packetHash === HISTORICAL_RFA_01_PACKET_SHA256 &&
      verification.validatorHash === HISTORICAL_RFA_01_VALIDATOR_SHA256,
    `${RFA_01_VERIFICATION_PATH}: historical capture contract, packet, or validator hash drift`,
  );
  invariant(
    same(verification.authorizationState, {
      status: HISTORICAL_RFA_01_STATUS,
      ...HISTORICAL_RFA_01_AUTHORIZATION,
    }),
    `${RFA_01_VERIFICATION_PATH}: historical capture authorization binding drift`,
  );
  invariant(
    verification.commitOrArchiveSha256 === EXPECTED_ARCHIVE_SHA256 &&
      verification.sourceCommit === EXPECTED_SOURCE_COMMIT &&
      same(verification.fixtureSha256s, EXPECTED_FIXTURE_SHA256S),
    `${RFA_01_VERIFICATION_PATH}: source or fixture binding drift`,
  );
  const expectedCommands = issue.acceptanceProbes.map((probe, index) => ({
    acceptanceProbeId: probe.id,
    command: probe.verificationCommand,
    executionMode:
      probe.id === "RFA-01-AC01"
        ? "subprocess_exact_command"
        : "in_process_semantic_core_evidence_deferred",
    fixtureSha256s: EXPECTED_FIXTURE_SHA256S,
    measurementProfile: "contract_validation_only_no_product_performance_measurement",
    rawOutputPath: `${RFA_01_VERIFICATION_PATH}#/commands/${index}/rawOutput`,
    validateOutput:
      probe.id === "RFA-01-AC01"
        ? validateAc01Output
        : (output, label) =>
            invariant(
              output ===
                "Reader-First release semantic capture passed: 20 issues, 6 contract negative fixtures; evidence-file validation deliberately deferred\n",
              `${label}: exact AC02 semantic capture output required`,
            ),
  }));
  invariant(
    same(
      expectedCommands.map(({ acceptanceProbeId, command }) => ({ acceptanceProbeId, command })),
      [
        {
          acceptanceProbeId: "RFA-01-AC01",
          command: "node --test scripts/validate-reader-first-release.test.mjs",
        },
        {
          acceptanceProbeId: "RFA-01-AC02",
          command: "node scripts/validate-reader-first-release.mjs",
        },
      ],
    ) && verification.commands?.length === 2,
    `${RFA_01_VERIFICATION_PATH}: exact AC01/AC02 command set required`,
  );
  verification.commands.forEach((record, index) => {
    validateExecution(
      record,
      expectedCommands[index],
      captureStart,
      captureEnd,
      approval,
      approvalHash,
      `${RFA_01_VERIFICATION_PATH} command ${index}`,
    );
  });

  invariant(
    rollback?.schemaVersion === EVIDENCE_SCHEMA_VERSION &&
      rollback.immutable === true &&
      rollback.supersessionOnly === true &&
      rollback.evidenceSemantics === EVIDENCE_SEMANTICS,
    `${RFA_01_ROLLBACK_PATH}: evidence lifecycle drift`,
  );
  invariant(
    rollback.issueId === "RFA-01" &&
      rollback.linearIssueId === issue.linear.identifier &&
      rollback.acceptanceProbeId === "RFA-01-ROLLBACK" &&
      rollback.result === "pass",
    `${RFA_01_ROLLBACK_PATH}: identity or result drift`,
  );
  validateUuid(rollback.correlationId, `${RFA_01_ROLLBACK_PATH} correlationId`);
  invariant(
    rollback.captureStartedAt === verification.captureStartedAt &&
      rollback.captureCompletedAt === verification.captureCompletedAt,
    `${RFA_01_ROLLBACK_PATH}: capture interval drift`,
  );
  invariant(
    rollback.sourceCommit === EXPECTED_SOURCE_COMMIT &&
      same(rollback.fixtureSha256s, {
        [CONTRACT_PATH]: HISTORICAL_RFA_01_CONTRACT_SHA256,
        [PACKET_PATH]: HISTORICAL_RFA_01_PACKET_SHA256,
        [VALIDATOR_PATH]: HISTORICAL_RFA_01_VALIDATOR_SHA256,
      }),
    `${RFA_01_ROLLBACK_PATH}: historical capture fixture hash bindings drift`,
  );
  invariant(
    rollback.strategy === EXPECTED_ROLLBACK.strategy &&
      same(rollback.disableNewBehaviorBoundary, {
        preserve: EXPECTED_ROLLBACK.preserve,
        never: EXPECTED_ROLLBACK.never,
      }),
    `${RFA_01_ROLLBACK_PATH}: exact rollback strategy/preserve/never required`,
  );
  invariant(
    same(rollback.authorizationState, {
      status: HISTORICAL_RFA_01_STATUS,
      authorizedIssues: ["RFA-01"],
      browserAuthority: false,
      rebuildInference: false,
    }),
    `${RFA_01_ROLLBACK_PATH}: authorization state drift`,
  );
  validateExecution(
    rollback,
    {
      acceptanceProbeId: "RFA-01-ROLLBACK",
      command: expectedRollbackCommand(),
      executionMode: "subprocess_exact_command",
      fixtureSha256s: {
        [CONTRACT_PATH]: HISTORICAL_RFA_01_CONTRACT_SHA256,
        [PACKET_PATH]: HISTORICAL_RFA_01_PACKET_SHA256,
        [VALIDATOR_PATH]: HISTORICAL_RFA_01_VALIDATOR_SHA256,
      },
      measurementProfile: "static_rollback_contract_assertion_no_product_mutation",
      rawOutputPath: `${RFA_01_ROLLBACK_PATH}#/rawOutput`,
      validateOutput: (output, label) =>
        invariant(
          output ===
            `RFA-01 rollback boundary passed: preserve=${EXPECTED_ROLLBACK.preserve.join(",")} never=${EXPECTED_ROLLBACK.never.join(",")}\n`,
          `${label}: exact rollback output required`,
        ),
    },
    captureStart,
    captureEnd,
    approval,
    approvalHash,
    RFA_01_ROLLBACK_PATH,
  );
}

function validateEvidenceNegativeFixtures(
  verification,
  rollback,
  packet,
  validatorHash,
  approval,
  approvalHash,
) {
  const fixtures = [
    [
      "truncated-ac01-output",
      (v) => {
        const record = v.commands[0];
        record.stdout = "ℹ tests 20\nℹ pass 20\nℹ fail 0\n";
        record.rawOutput = record.stdout;
        record.outputSha256 = sha256(record.rawOutput);
      },
    ],
    [
      "vacuous-nested-metadata",
      (v) => {
        v.commands[0].toolVersions = { node: "x", git: "y" };
        v.commands[0].operatingSystem = { platform: "x", release: "y", architecture: "z" };
        v.commands[0].hardwareProfile = { cpuModel: "x", logicalCpuCount: 0, totalMemoryBytes: 1 };
      },
    ],
    [
      "invalid-top-level-timestamp",
      (v) => {
        v.captureStartedAt = "not-a-time";
      },
    ],
    [
      "far-future-command-timestamp",
      (v) => {
        v.commands[0].completedAt = "2999-01-01T00:00:00.000Z";
      },
    ],
    [
      "non-uuid-identities",
      (v, r) => {
        v.correlationId = "x";
        r.correlationId = "y";
      },
    ],
    [
      "wrong-output-hash-and-exit-code",
      (v) => {
        v.commands[0].outputSha256 = "0".repeat(64);
        v.commands[0].exitCode = 1;
      },
    ],
    [
      "unresolved-archive-approval-binding",
      (v) => {
        v.commands[0].archiveName = "fabricated.zip";
        v.commands[0].archiveSha256 = "0".repeat(64);
      },
    ],
    [
      "execution-mode-drift",
      (v) => {
        v.commands[1].executionMode = "subprocess_exact_command";
      },
    ],
    [
      "tampered-rfa01-historical-authorization",
      (v) => {
        v.authorizationState.authorizedIssues = ["RFA-02"];
      },
    ],
  ];
  for (const [id, mutate] of fixtures) {
    const candidateVerification = structuredClone(verification);
    const candidateRollback = structuredClone(rollback);
    mutate(candidateVerification, candidateRollback);
    let rejected = false;
    try {
      validateRfa01Evidence(
        candidateVerification,
        candidateRollback,
        packet,
        validatorHash,
        approval,
        approvalHash,
      );
    } catch {
      rejected = true;
    }
    invariant(rejected, `${id}: adversarial evidence fixture was not rejected`);
  }
  return fixtures.map(([id]) => id);
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

async function runValidationCore({
  root = process.cwd(),
  write = false,
  validateEvidence = true,
} = {}) {
  const [
    contractText,
    packetText,
    validatorBytes,
    parentAuthorizationText,
    startAuthorizationText,
    manifestText,
  ] = await Promise.all([
    readFile(path.join(root, CONTRACT_PATH), "utf8"),
    readFile(path.join(root, PACKET_PATH), "utf8"),
    readFile(path.join(root, VALIDATOR_PATH)),
    readFile(path.join(root, PARENT_AUTHORIZATION_PATH), "utf8"),
    readFile(path.join(root, RFA_02_START_AUTHORIZATION_PATH), "utf8"),
    readFile(path.join(root, LIVE_MANIFEST_PATH), "utf8"),
  ]);
  const contract = JSON.parse(contractText);
  const packet = JSON.parse(packetText);
  const manifest = JSON.parse(manifestText);
  validateReaderFirstRelease(contract, packet);
  validateParentAuthorization(JSON.parse(parentAuthorizationText));
  validateRfa02StartAuthorization(JSON.parse(startAuthorizationText), manifest, packet);
  const negativeFixtures = validateNegativeFixtures(contract, packet);
  invariant(sha256(contractText) === EXPECTED_CONTRACT_SHA256, "contract file-byte SHA-256 drift");
  invariant(sha256(packetText) === EXPECTED_PACKET_SHA256, "packet file-byte SHA-256 drift");
  let evidenceNegativeFixtures = [];
  if (validateEvidence) {
    const [verification, rollback, approvalText] = await Promise.all([
      readEvidenceManifest(root, RFA_01_VERIFICATION_PATH),
      readEvidenceManifest(root, RFA_01_ROLLBACK_PATH),
      readFile(path.join(root, EXPECTED_APPROVAL_BINDING.approvalBindingPath), "utf8"),
    ]);
    const approval = JSON.parse(approvalText);
    const validatorHash = sha256(validatorBytes);
    validateRfa01Evidence(
      verification,
      rollback,
      packet,
      validatorHash,
      approval,
      sha256(approvalText),
    );
    evidenceNegativeFixtures = validateEvidenceNegativeFixtures(
      verification,
      rollback,
      packet,
      validatorHash,
      approval,
      sha256(approvalText),
    );
  }
  await verifyEvidenceBindings(root, contract);
  const rendered = renderPacketMarkdown(packet);
  const markdownPath = path.join(root, MARKDOWN_PATH);
  if (write) await writeFile(markdownPath, rendered);
  else {
    const markdown = await readFile(markdownPath, "utf8");
    invariant(markdown === rendered, "Reader-First Markdown parity drift");
    invariant(sha256(markdown) === EXPECTED_MARKDOWN_SHA256, "generated Markdown SHA-256 drift");
  }
  return {
    mode: write ? "write" : "check",
    issueCount: packet.issueCount,
    negativeFixtureCount: negativeFixtures.length,
    evidenceNegativeFixtureCount: evidenceNegativeFixtures.length,
    evidenceValidationDeferred: !validateEvidence,
  };
}

export async function runValidation(options = {}) {
  return runValidationCore({ ...options, validateEvidence: true });
}

function executeForEvidence(root, executable, args, env = process.env) {
  const startedAt = new Date().toISOString();
  return new Promise((resolve) => {
    execFile(
      executable,
      args,
      { cwd: root, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          startedAt,
          completedAt: new Date().toISOString(),
          exitCode: error?.code ?? 0,
          stdout,
          stderr,
          rawOutput: `${stdout}${stderr}`,
        });
      },
    );
  });
}

function canonicalSemanticCoreOutput(result) {
  return `Reader-First release semantic capture passed: ${result.issueCount} issues, ${result.negativeFixtureCount} contract negative fixtures; evidence-file validation deliberately deferred\n`;
}

async function executeSemanticCoreForEvidence(root) {
  const startedAt = new Date().toISOString();
  try {
    const result = await runValidationCore({ root, validateEvidence: false });
    const stdout = canonicalSemanticCoreOutput(result);
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      exitCode: 0,
      stdout,
      stderr: "",
      rawOutput: stdout,
      outputSha256: sha256(stdout),
    };
  } catch (error) {
    const stderr = `${error instanceof Error ? error.message : String(error)}\n`;
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      exitCode: 1,
      stdout: "",
      stderr,
      rawOutput: stderr,
      outputSha256: sha256(stderr),
    };
  }
}

function archiveFields() {
  return {
    approvalBindingPath: EXPECTED_APPROVAL_BINDING.approvalBindingPath,
    approvalBindingSha256: EXPECTED_APPROVAL_BINDING.approvalBindingSha256,
    archiveName: EXPECTED_ARCHIVE_NAME,
    archiveSha256: EXPECTED_ARCHIVE_SHA256,
    commitOrArchiveSha256: EXPECTED_ARCHIVE_SHA256,
  };
}

export async function captureRfa01Evidence({ root = process.cwd() } = {}) {
  throw new Error(
    `RFA-01 evidence is immutable historical evidence; --capture-rfa01-evidence is disabled and will not write ${RFA_01_VERIFICATION_PATH} or ${RFA_01_ROLLBACK_PATH}`,
  );
  // biome-ignore lint/correctness/noUnreachable: retained only as non-executable historical producer provenance.
  const captureStartedAt = new Date().toISOString();
  const [validatorBytes, packetText, approvalText, gitResult] = await Promise.all([
    readFile(path.join(root, VALIDATOR_PATH)),
    readFile(path.join(root, PACKET_PATH), "utf8"),
    readFile(path.join(root, EXPECTED_APPROVAL_BINDING.approvalBindingPath), "utf8"),
    executeForEvidence(root, "git", ["--version"]),
  ]);
  invariant(gitResult.exitCode === 0, "capture: git --version failed");
  const gitVersion = gitResult.stdout.trim().replace(/^git version /, "");
  const toolVersions = { node: process.version, git: gitVersion };
  const operatingSystem = {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
  };
  const hardwareProfile = {
    cpuModel: os.cpus()[0]?.model ?? "unknown processor",
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  };
  const shared = {
    evidenceSemantics: EVIDENCE_SEMANTICS,
    reviewer: EVIDENCE_PRODUCER,
    toolVersions,
    operatingSystem,
    hardwareProfile,
    ...archiveFields(),
  };
  const ac01 = await executeForEvidence(root, process.execPath, [
    "--test",
    "scripts/validate-reader-first-release.test.mjs",
  ]);
  invariant(ac01.exitCode === 0, `capture: AC01 failed\n${ac01.rawOutput}`);
  const ac02 = await executeSemanticCoreForEvidence(root);
  invariant(ac02.exitCode === 0, `capture: AC02 semantic validation failed\n${ac02.rawOutput}`);
  const rollbackScript = expectedRollbackCommand().match(/-e '([\s\S]*)'$/)?.[1];
  invariant(rollbackScript, "capture: rollback command parser failed");
  const rollbackResult = await executeForEvidence(root, process.execPath, [
    "--input-type=module",
    "-e",
    rollbackScript,
  ]);
  invariant(
    rollbackResult.exitCode === 0,
    `capture: rollback assertion failed\n${rollbackResult.rawOutput}`,
  );
  const captureCompletedAt = new Date().toISOString();
  const packet = JSON.parse(packetText);
  const issue = packet.issues.find(({ localId }) => localId === "RFA-01");
  const execution = (result, fields) => ({
    issueId: "RFA-01",
    correlationId: randomUUID(),
    ...fields,
    ...shared,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    observedAt: result.completedAt,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    rawOutput: result.rawOutput,
    outputSha256: result.outputSha256 ?? sha256(result.rawOutput),
    result: "pass",
  });
  const verification = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    immutable: true,
    supersessionOnly: true,
    issueId: "RFA-01",
    linearIssueId: issue.linear.identifier,
    correlationId: randomUUID(),
    result: "pass",
    captureStartedAt,
    captureCompletedAt,
    observedAt: captureCompletedAt,
    contractHash: EXPECTED_CONTRACT_SHA256,
    packetHash: EXPECTED_PACKET_SHA256,
    validatorHash: sha256(validatorBytes),
    authorizationState: { status: EXPECTED_STATUS, ...EXPECTED_AUTHORIZATION },
    sourceCommit: EXPECTED_SOURCE_COMMIT,
    fixtureSha256s: EXPECTED_FIXTURE_SHA256S,
    measurementProfile: "contract_validation_only_no_product_performance_measurement",
    ...shared,
    commands: [
      execution(ac01, {
        acceptanceProbeId: "RFA-01-AC01",
        command: "node --test scripts/validate-reader-first-release.test.mjs",
        executionMode: "subprocess_exact_command",
        fixtureSha256s: EXPECTED_FIXTURE_SHA256S,
        measurementProfile: "contract_validation_only_no_product_performance_measurement",
        rawOutputPath: `${RFA_01_VERIFICATION_PATH}#/commands/0/rawOutput`,
      }),
      execution(ac02, {
        acceptanceProbeId: "RFA-01-AC02",
        command: "node scripts/validate-reader-first-release.mjs",
        executionMode: "in_process_semantic_core_evidence_deferred",
        fixtureSha256s: EXPECTED_FIXTURE_SHA256S,
        measurementProfile: "contract_validation_only_no_product_performance_measurement",
        rawOutputPath: `${RFA_01_VERIFICATION_PATH}#/commands/1/rawOutput`,
      }),
    ],
  };
  const rollback = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    immutable: true,
    supersessionOnly: true,
    linearIssueId: issue.linear.identifier,
    captureStartedAt,
    captureCompletedAt,
    sourceCommit: EXPECTED_SOURCE_COMMIT,
    strategy: EXPECTED_ROLLBACK.strategy,
    disableNewBehaviorBoundary: {
      preserve: EXPECTED_ROLLBACK.preserve,
      never: EXPECTED_ROLLBACK.never,
    },
    authorizationState: {
      status: EXPECTED_STATUS,
      authorizedIssues: ["RFA-01"],
      browserAuthority: false,
      rebuildInference: false,
    },
    ...execution(rollbackResult, {
      acceptanceProbeId: "RFA-01-ROLLBACK",
      command: expectedRollbackCommand(),
      executionMode: "subprocess_exact_command",
      fixtureSha256s: {
        [CONTRACT_PATH]: EXPECTED_CONTRACT_SHA256,
        [PACKET_PATH]: EXPECTED_PACKET_SHA256,
        [VALIDATOR_PATH]: sha256(validatorBytes),
      },
      measurementProfile: "static_rollback_contract_assertion_no_product_mutation",
      rawOutputPath: `${RFA_01_ROLLBACK_PATH}#/rawOutput`,
    }),
  };
  const approval = JSON.parse(approvalText);
  validateRfa01Evidence(
    verification,
    rollback,
    packet,
    sha256(validatorBytes),
    approval,
    sha256(approvalText),
  );
  validateEvidenceNegativeFixtures(
    verification,
    rollback,
    packet,
    sha256(validatorBytes),
    approval,
    sha256(approvalText),
  );
  await Promise.all([
    writeFile(
      path.join(root, RFA_01_VERIFICATION_PATH),
      `${JSON.stringify(verification, null, 2)}\n`,
    ),
    writeFile(path.join(root, RFA_01_ROLLBACK_PATH), `${JSON.stringify(rollback, null, 2)}\n`),
  ]);
  const formatResult = await executeForEvidence(root, "pnpm", [
    "exec",
    "biome",
    "format",
    "--write",
    RFA_01_VERIFICATION_PATH,
    RFA_01_ROLLBACK_PATH,
  ]);
  invariant(
    formatResult.exitCode === 0,
    `capture: evidence formatting failed\n${formatResult.rawOutput}`,
  );
  const [formattedVerification, formattedRollback] = await Promise.all([
    readEvidenceManifest(root, RFA_01_VERIFICATION_PATH),
    readEvidenceManifest(root, RFA_01_ROLLBACK_PATH),
  ]);
  validateRfa01Evidence(
    formattedVerification,
    formattedRollback,
    packet,
    sha256(validatorBytes),
    approval,
    sha256(approvalText),
  );
  validateEvidenceNegativeFixtures(
    formattedVerification,
    formattedRollback,
    packet,
    sha256(validatorBytes),
    approval,
    sha256(approvalText),
  );
  return { commandCount: 3, evidenceNegativeFixtureCount: 9, captureStartedAt, captureCompletedAt };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const capture = process.argv.includes("--capture-rfa01-evidence");
  const operation = capture
    ? captureRfa01Evidence()
    : runValidation({ write: process.argv.includes("--write") });
  operation
    .then((result) => {
      if (capture) {
        console.log(
          `RFA-01 evidence capture passed: ${result.commandCount} commands and ${result.evidenceNegativeFixtureCount} adversarial evidence fixtures`,
        );
      } else {
        console.log(
          `Reader-First release ${result.mode} passed: ${result.issueCount} issues, ${result.negativeFixtureCount} contract negative fixtures, ${result.evidenceNegativeFixtureCount} evidence negative fixtures, and all owner gates valid`,
        );
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
