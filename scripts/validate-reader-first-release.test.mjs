import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  CONTRACT_PATH,
  MARKDOWN_PATH,
  PACKET_PATH,
  renderPacketMarkdown,
  runValidation,
  validateExecutableOcrFixture,
  validateReaderFirstRelease,
} from "./validate-reader-first-release.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const [CONTRACT, PACKET] = await Promise.all([
  readFile(path.join(ROOT, CONTRACT_PATH), "utf8").then(JSON.parse),
  readFile(path.join(ROOT, PACKET_PATH), "utf8").then(JSON.parse),
]);
const OCR_OVERLAY = await readFile(
  path.join(ROOT, "fixtures/pdf/scanned_fixture.expected-overlay.json"),
  "utf8",
).then(JSON.parse);

function rejectContract(mutator, expected) {
  const contract = structuredClone(CONTRACT);
  mutator(contract);
  assert.throws(() => validateReaderFirstRelease(contract, PACKET), expected);
}
function rejectPacket(mutator, expected) {
  const packet = structuredClone(PACKET);
  mutator(packet);
  assert.throws(() => validateReaderFirstRelease(CONTRACT, packet), expected);
}

test("canonical contract, exact evidence hashes, packet, DAG, and generated Markdown pass", async () => {
  assert.doesNotThrow(() => validateReaderFirstRelease(CONTRACT, PACKET));
  assert.equal(
    await readFile(path.join(ROOT, MARKDOWN_PATH), "utf8"),
    renderPacketMarkdown(PACKET),
  );
  await assert.doesNotReject(runValidation({ root: ROOT }));
});

test("Peer approval, Linear creation, and root-only product authorization reject drift", () => {
  for (const gate of [
    "peerApproved",
    "linearCreationAuthorized",
    "productImplementationAuthorized",
  ]) {
    rejectContract((contract) => {
      contract.authorization[gate] = false;
    }, /authorization drift/);
  }
  rejectContract((contract) => {
    contract.authorization.authorizedIssues = ["RFA-01", "RFA-02"];
  }, /authorization drift/);
  rejectPacket((packet) => {
    packet.creationPlan.eligibleForProductImplementation = [];
  }, /post-creation Linear\/product authorization drift/);
  rejectPacket((packet) => {
    packet.issues[0].linear.identifier = "QQP-999";
  }, /RFA-01: live issue authorization\/binding drift/);
  rejectPacket((packet) => {
    packet.issues[1].productImplementationAuthorized = true;
  }, /RFA-02: live issue authorization\/binding drift/);
});

test("snapshot migration, browser transition, and revision concurrency are semantic invariants", () => {
  rejectContract((contract) => {
    contract.serverAuthority.snapshotReadPolicy = ["v1_direct"];
  }, /snapshot schema migration/);
  rejectContract((contract) => {
    contract.serverAuthority.legacySnapshotMigration.failure = "drop";
  }, /legacy snapshot\/browser transition/);
  rejectContract((contract) => {
    contract.serverAuthority.legacyBrowserStateTransition.serverSnapshotAlwaysWins = false;
  }, /legacy snapshot\/browser transition/);
  rejectContract((contract) => {
    contract.serverAuthority.concurrentBrowserConflictPolicy = "last_writer_wins";
  }, /cross-browser concurrency/);
});

test("nominal request envelope and manifest-only Reader fallback reject drift", () => {
  rejectContract((contract) => {
    contract.mediaContract.nominalConcurrentSegmentRequests = [1, 4];
  }, /nominal 2-4 request envelope/);
  rejectContract((contract) => {
    contract.mediaContract.maxConcurrentSegmentRequests = 5;
  }, /nominal 2-4 request envelope/);
  rejectContract((contract) => {
    contract.mediaContract.constrainedConcurrencyException.allowedSignals.pop();
  }, /nominal 2-4 request envelope/);
  rejectContract((contract) => {
    contract.mediaContract.boundedAuditionClipWaveformDecodeException.maxDurationSeconds = 60;
  }, /bounded Audition waveform exception/);
  rejectContract((contract) => {
    contract.mediaContract.manifestCapableReaderMayFallbackToFullAudio = true;
  }, /manifest Reader and legacy range/);
  rejectContract((contract) => {
    contract.mediaContract.finalAudioRoutePolicy.unsatisfiableStatus = 200;
  }, /manifest Reader and legacy range/);
});

test("completed artifacts cannot regress to missing during backfill", () => {
  rejectContract((contract) => {
    contract.mediaContract.durableArtifactMigration.validArtifactMayBecomeArtifactMissing = true;
  }, /completed-artifact backfill/);
  rejectContract((contract) => {
    contract.mediaContract.completedRequiresDurablePromotionOutOfTmpfs = false;
  }, /segment-first durable media/);
});

test("consumed timing identity and boundaries are immutable in both directions", () => {
  for (const field of [
    "mayDelete",
    "mayReorder",
    "mayReplace",
    "mayMoveForward",
    "mayMoveBackward",
  ]) {
    rejectContract((contract) => {
      contract.timingContract.consumedCueImmutability[field] = true;
    }, /consumed cue identity\/timing immutability/);
  }
  rejectContract((contract) => {
    contract.timingContract.baselineFidelityClaim.trustedWordAllowed = true;
  }, /0.625 heuristic claim must remain untrusted/);
});

test("real scanned OCR evidence must stop unresolved narration and create reviewed revisions", () => {
  rejectContract((contract) => {
    contract.structureContract.reviewRequiredMayAutoNarrate = true;
  }, /structure-aware reviewRequired/);
  rejectContract((contract) => {
    contract.structureContract.ocrReviewRequiredPolicy.resolutionCreatesNewOverlayRevision = false;
  }, /OCR adjudication workflow/);
  rejectContract((contract) => {
    contract.structureContract.ocrReviewRequiredPolicy.requiredAuditFields[0] = "nodeId";
  }, /canonical OCR resolution audit-field contract drift/);
  rejectContract((contract) => {
    contract.structureContract.scannedPdfFixture.bytes = 98;
  }, /real scanned-PDF fixture/);
});

test("executable OCR fixture schema rejects legacy aliases independently of canonical hashes", () => {
  const overlay = structuredClone(OCR_OVERLAY);
  overlay.requiredResolution.auditFields[0] = "nodeId";
  assert.throws(
    () => validateExecutableOcrFixture(overlay, CONTRACT),
    /executable OCR fixture resolution audit-field schema drift/,
  );
});

test("system critical is backend-evidenced, fresh, enumerated, and not inferred by UI", () => {
  rejectContract((contract) => {
    contract.healthContract.frontendMayInferSystemCritical = true;
  }, /backend-owned truthful health/);
  rejectContract((contract) => {
    contract.healthContract.backendEvidenceSchema.maxEvidenceAgeSeconds = 300;
  }, /evidence schema\/freshness/);
  rejectContract((contract) => {
    contract.healthContract.backendEvidenceSchema.allowedReasonCodes.pop();
  }, /evidence schema\/freshness/);
});

test("archive-contained audit and Linear provenance bindings reject free-form drift", () => {
  rejectContract((contract) => {
    contract.auditEvidence.reviews[0].sha256 = "0".repeat(64);
  }, /audit path\/hash bindings/);
  rejectContract((contract) => {
    contract.linearTargetEvidence.projectId = "wrong";
  }, /Linear target provenance/);
  rejectPacket((packet) => {
    packet.projectId = "wrong";
  }, /packet Linear target provenance/);
  rejectPacket((packet) => {
    packet.capacitySnapshot.activeUnarchived = 1;
  }, /capacity snapshot drift/);
});

test("issue count, IDs, DAG, and dependency order are exact", () => {
  rejectPacket((packet) => {
    packet.issues.pop();
    packet.issueCount = 19;
  }, /exactly 20 ordered RFA issues/);
  rejectPacket((packet) => {
    packet.issues[19].localId = "RFA-21";
  }, /IDs or dependency DAG/);
  rejectPacket((packet) => {
    packet.dag["RFA-11"] = ["RFA-03"];
  }, /IDs or dependency DAG/);
  rejectPacket((packet) => {
    packet.issues[10].dependencies = ["RFA-03"];
  }, /RFA-11: dependency drift/);
});

test("issue execution schema requires owner, repository scope, non-goals, commands, and evidence", () => {
  rejectPacket((packet) => {
    packet.issues[1].accountableOwnerSurface = "";
  }, /RFA-02: one accountable owner/);
  rejectPacket((packet) => {
    packet.issues[8].inScope.paths = [];
  }, /RFA-09: repository-real in-scope paths/);
  rejectPacket((packet) => {
    packet.issues[16].inScope.symbols = [];
  }, /RFA-17: in-scope symbols/);
  rejectPacket((packet) => {
    packet.issues[17].nonGoals = [];
  }, /RFA-18: explicit non-goals/);
  rejectPacket((packet) => {
    packet.issues[1].verificationCommands = [];
  }, /RFA-02: verification commands/);
  rejectPacket((packet) => {
    packet.issues[1].evidenceArtifacts = [];
  }, /RFA-02: repo-relative evidence artifacts/);
});

test("every acceptance assertion is bound to an issue command, evidence file, and fail-closed result", () => {
  rejectPacket((packet) => {
    packet.issues[1].acceptanceProbes[0].assertion = "x";
  }, /RFA-02: measurable acceptance assertion/);
  rejectPacket((packet) => {
    packet.issues[8].acceptanceProbes[0].verificationCommand = "true";
  }, /RFA-09: acceptance command\/evidence\/failure binding/);
  rejectPacket((packet) => {
    packet.issues[16].acceptanceProbes[0].evidenceArtifact = "docs/nope.json";
  }, /RFA-17: acceptance command\/evidence\/failure binding/);
  rejectPacket((packet) => {
    packet.issues[17].acceptanceProbes[0].onFailure = "continue";
  }, /RFA-18: acceptance command\/evidence\/failure binding/);
});

test("issue-local observability, rollback, and performance budgets reject generic or centralized drift", () => {
  rejectPacket((packet) => {
    packet.issues[1].observabilityEvidence.events[0] = "generic.started";
  }, /RFA-02: issue-specific observability/);
  rejectPacket((packet) => {
    packet.issues[8].rollbackBoundary.strategy = "delete_and_retry";
  }, /RFA-09: rollback boundary/);
  rejectPacket((packet) => {
    packet.issues[12].performanceBudgetIds = [];
  }, /RFA-13: local performance budget allocation/);
  rejectPacket((packet) => {
    packet.issues[19].performanceBudgetIds.pop();
  }, /RFA-20: local performance budget allocation/);
});

test("RFA-20 is adjudication-only and legacy removal stays with implementation owners", () => {
  rejectPacket((packet) => {
    packet.issues[19].title = "Release and delete legacy";
  }, /RFA-20 must remain pure adjudication/);
  rejectPacket((packet) => {
    packet.issues[19].legacyRemovalOwned = ["delete everything"];
  }, /RFA-20: legacy-removal ownership/);
  rejectPacket((packet) => {
    packet.issues[15].legacyRemovalOwned = [];
  }, /RFA-16: legacy-removal ownership/);
});

test("Round 2 blocker semantics reject packet regressions independently of canonical seals", () => {
  rejectPacket((packet) => {
    packet.issues[5].acceptanceProbes.find(({ id }) => id === "RFA-06-AC02").assertion =
      packet.issues[5].acceptanceProbes
        .find(({ id }) => id === "RFA-06-AC02")
        .assertion.replace("fsynced, ", "");
  }, /RFA-06 completed-artifact backfill acceptance drift/);
  rejectPacket((packet) => {
    packet.issues[8].acceptanceProbes.find(({ id }) => id === "RFA-09-AC02").assertion =
      packet.issues[8].acceptanceProbes
        .find(({ id }) => id === "RFA-09-AC02")
        .assertion.replace("416", "400");
  }, /RFA-09 route\/range acceptance drift/);
  rejectPacket((packet) => {
    packet.issues[14].acceptanceProbes.find(({ id }) => id === "RFA-15-AC03").assertion =
      packet.issues[14].acceptanceProbes
        .find(({ id }) => id === "RFA-15-AC03")
        .assertion.replace("word identity", "word label");
  }, /RFA-15 consumed-cue acceptance drift/);
  rejectPacket((packet) => {
    const issue = packet.issues[3];
    const probe = issue.acceptanceProbes.find(({ id }) => id === "RFA-04-AC02");
    issue.verificationCommands.push("python3 -m unittest adapters.pdf.pdf_adapter_test");
    probe.verificationCommand = "python3 -m unittest adapters.pdf.pdf_adapter_test";
  }, /RFA-04 exact OCR audit-field acceptance drift/);
  rejectPacket((packet) => {
    const probe = packet.issues[3].acceptanceProbes.find(({ id }) => id === "RFA-04-AC04");
    probe.assertion = probe.assertion.replace("resolvedRole", "role");
  }, /RFA-04 exact OCR audit-field acceptance drift/);
  rejectPacket((packet) => {
    packet.issues[16].acceptanceProbes.find(({ id }) => id === "RFA-17-AC04").assertion =
      packet.issues[16].acceptanceProbes
        .find(({ id }) => id === "RFA-17-AC04")
        .assertion.replace("expires after 30 seconds to unknown", "remains cached");
  }, /RFA-17 health authority acceptance drift/);
});

test("RFA-15 authoritative timing renderer ownership rejects every omission", () => {
  const paths = [
    "frontend/src/features/teleprompt/TelepromptStudio.tsx",
    "frontend/src/features/teleprompt/telepromptStudioComponents.tsx",
    "frontend/src/features/teleprompt/telepromptTheatreCueContent.tsx",
    "frontend/src/features/cinema/BookDocumentReaderStage.tsx",
    "frontend/src/features/theatre/model.ts",
    "frontend/src/features/teleprompt/TelepromptTheatre.tsx",
    "frontend/src/features/cinema/PreparedSourceCinemaBase.tsx",
  ];
  const symbols = [
    "TelepromptStudio authoritative timing fidelity consumption",
    "Teleprompt cue and word authoritative timing-state defaults",
    "Teleprompt theatre cue authoritative timing-state default",
    "BookDocumentReaderStage authoritative block and word highlight fidelity",
    "Theatre runtime authoritative timing availability",
    "TelepromptTheatre omitted timing input fail-closed default",
    "PreparedSourceCinema active and inactive block authoritative timing state",
  ];
  for (const path of paths) {
    rejectPacket((packet) => {
      packet.issues[14].inScope.paths = packet.issues[14].inScope.paths.filter(
        (value) => value !== path,
      );
    }, /RFA-15: repository-real source path\/symbol ownership drift/);
  }
  for (const symbol of symbols) {
    rejectPacket((packet) => {
      packet.issues[14].inScope.symbols = packet.issues[14].inScope.symbols.filter(
        (value) => value !== symbol,
      );
    }, /RFA-15: repository-real source path\/symbol ownership drift/);
  }
  rejectPacket((packet) => {
    packet.issues[14].acceptanceProbes.find(({ id }) => id === "RFA-15-AC05").assertion =
      "Word timings imply trusted exact read-along.";
  }, /RFA-15 authoritative timing-renderer acceptance drift/);
  rejectPacket((packet) => {
    const probe = packet.issues[14].acceptanceProbes.find(({ id }) => id === "RFA-15-AC05");
    probe.assertion = probe.assertion.replace(
      "omitted Theatre timing input defaults to estimated or unknown",
      "omitted Theatre timing input defaults to trusted",
    );
  }, /RFA-15 authoritative timing-renderer acceptance drift/);
  rejectPacket((packet) => {
    const probe = packet.issues[14].acceptanceProbes.find(({ id }) => id === "RFA-15-AC05");
    probe.assertion = probe.assertion.replace(
      "inactive prepared-source block consumes authoritative fidelity or remains unknown",
      "inactive prepared-source block defaults to trusted",
    );
  }, /RFA-15 authoritative timing-renderer acceptance drift/);
});

test("Round 2 execution ownership, dependencies, gates, and evidence reject drift", () => {
  rejectPacket((packet) => {
    packet.issues[18].dependencies = packet.issues[18].dependencies.filter((id) => id !== "RFA-18");
    packet.dag["RFA-19"] = packet.issues[18].dependencies;
  }, /IDs or dependency DAG drift/);
  rejectPacket((packet) => {
    packet.issues[1].inScope.paths = packet.issues[1].inScope.paths.filter(
      (value) => value !== "scripts/e2e-reader-first-continuity.mjs",
    );
  }, /creating issue scope drift/);
  rejectPacket((packet) => {
    const issue = packet.issues[19];
    const probe = issue.acceptanceProbes.find(({ id }) => id === "RFA-20-AC02");
    issue.verificationCommands.push("node scripts/validate-reader-first-release.mjs");
    probe.verificationCommand = "node scripts/validate-reader-first-release.mjs";
  }, /RFA-20 runtime assertions must use the integrated release gate/);
  rejectPacket((packet) => {
    packet.issues[5].observabilityEvidence.requiredFields =
      packet.issues[5].observabilityEvidence.requiredFields.filter(
        (field) => field !== "promotionPhase",
      );
  }, /RFA-06: domain telemetry facts drift/);
  rejectPacket((packet) => {
    packet.issues[19].rollbackBoundary.strategy =
      "invalidate_evidence_and_modify_product_state_after_failure";
  }, /RFA-20 evidence-only rollback drift/);
  rejectContract((contract) => {
    delete contract.evidenceManifestContract.requiredFields;
  }, /evidence manifest required fields drift/);
});

test("Round 3 executable ownership, enums, budgets, and harness semantics reject drift", () => {
  rejectPacket((packet) => {
    packet.issues[8].inScope.paths = packet.issues[8].inScope.paths.filter(
      (value) => value !== "frontend/src/api.ts",
    );
  }, /RFA-09: repository-real source path\/symbol ownership drift/);
  rejectPacket((packet) => {
    packet.issues[10].inScope.paths = packet.issues[10].inScope.paths.filter(
      (value) => value !== "frontend/src/projectState.ts",
    );
  }, /RFA-11: repository-real source path\/symbol ownership drift/);
  rejectPacket((packet) => {
    packet.issues[12].inScope.symbols = packet.issues[12].inScope.symbols.map((value) =>
      value.replace("ArrivalAudioPlayerQueue", "VoiceJobPlayer"),
    );
  }, /RFA-13: repository-real source path\/symbol ownership drift/);
  rejectPacket((packet) => {
    packet.issues[12].inScope.paths = packet.issues[12].inScope.paths.filter(
      (value) => value !== "frontend/src/audioWaveform.ts",
    );
  }, /RFA-13: repository-real source path\/symbol ownership drift/);
  rejectPacket((packet) => {
    packet.issues[15].inScope.symbols = packet.issues[15].inScope.symbols.filter(
      (value) => value !== "PlaybackControllerHost",
    );
  }, /RFA-16: repository-real source path\/symbol ownership drift/);
  rejectPacket((packet) => {
    const probe = packet.issues[12].acceptanceProbes.find(({ id }) => id === "RFA-13-AC03");
    probe.assertion = probe.assertion.replace("2–4 concurrent", "at most four concurrent");
  }, /RFA-13 exact concurrency exception acceptance drift/);
  rejectPacket((packet) => {
    packet.issues[12].observabilityEvidence.requiredFields =
      packet.issues[12].observabilityEvidence.requiredFields.filter(
        (field) => field !== "concurrencyReason",
      );
  }, /RFA-13 exact concurrency exception acceptance drift/);
  rejectPacket((packet) => {
    const probe = packet.issues[15].acceptanceProbes.find(({ id }) => id === "RFA-16-AC03");
    probe.assertion = probe.assertion.replace("30 seconds", "60 seconds");
  }, /RFA-16 bounded Audition waveform acceptance drift/);
  rejectPacket((packet) => {
    const probe = packet.issues[16].acceptanceProbes.find(({ id }) => id === "RFA-17-AC03");
    probe.assertion = probe.assertion.replace("corruptState", "corrupt_state");
  }, /RFA-17 health authority acceptance drift/);
  rejectPacket((packet) => {
    packet.issues[18].performanceBudgetIds.pop();
  }, /RFA-19: local performance budget allocation drift/);
  rejectPacket((packet) => {
    packet.issues[18].rollbackBoundary.strategy =
      "disable_rfa_19_new_behavior_keep_prior_compatible_state";
  }, /RFA-19 evidence-only rollback drift/);
  rejectPacket((packet) => {
    const probe = packet.issues[18].acceptanceProbes.find(({ id }) => id === "RFA-19-AC04");
    probe.verificationCommand =
      "node scripts/run-reader-first-performance-gate.mjs --profiles desktop-cold,desktop-warm,webkit-cold";
  }, /contract evidence ownership or RFA-19 stale-mutation harness drift/);
  rejectPacket((packet) => {
    const issue = packet.issues[5];
    const probe = issue.acceptanceProbes.find(({ id }) => id === "RFA-06-AC02");
    probe.evidenceArtifact = "docs/evidence/reader-first/RFA-06/verification.json";
  }, /contract evidence ownership or RFA-19 stale-mutation harness drift/);
});

test("random title/objective drift is caught by the canonical object seal", () => {
  rejectPacket((packet) => {
    packet.issues[3].title += " altered";
  }, /canonical packet SHA-256 drift/);
  rejectContract((contract) => {
    contract.ownerDecision.decision += " altered";
  }, /canonical contract SHA-256 drift/);
});
