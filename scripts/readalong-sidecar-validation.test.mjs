import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractDir = path.join(repoRoot, "fixtures/contracts");

const negativeCases = [
  {
    fixture: "readalong-current.readalong-manifest.v1.json",
    suffix: "readalong-manifest.v1.json",
    expected: "audioArtifactIds entry missing-audio does not resolve to audio-artifact.v1",
    mutate(payload) {
      return {
        ...payload,
        manifestId: `ram-invalid-${randomUUID()}`,
        audioArtifactIds: ["missing-audio"],
      };
    },
  },
  {
    fixture: "readalong-current.readalong-manifest.v1.json",
    suffix: "readalong-manifest.v1.json",
    expected:
      "speechPlanIds entry contract-pdf sourceId contract-pdf does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        manifestId: `ram-invalid-${randomUUID()}`,
        speechPlanIds: ["contract-pdf"],
      };
    },
  },
  {
    fixture: "readalong-current.readalong-manifest.v1.json",
    suffix: "readalong-manifest.v1.json",
    expected:
      "sourceRevisionId sr-ql-001 sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        manifestId: `ram-invalid-${randomUUID()}`,
        sourceRevisionId: "sr-ql-001",
      };
    },
  },
  {
    fixture: "readalong-exact.sync-fidelity-decision.v1.json",
    suffix: "sync-fidelity-decision.v1.json",
    expected: "non-exact fidelity must set exactAllowed=false",
    mutate(payload) {
      return {
        ...payload,
        decisionId: `sync-invalid-${randomUUID()}`,
        fidelity: "phrase",
        exactAllowed: true,
        evidence: {
          ...payload.evidence,
          lowResourceMode: true,
        },
      };
    },
  },
  {
    fixture: "readalong-exact.sync-fidelity-decision.v1.json",
    suffix: "sync-fidelity-decision.v1.json",
    expected: "highlightMapId contract-audio-phrase is not owned by readalongManifestId ram-md-002",
    mutate(payload) {
      return {
        ...payload,
        decisionId: `sync-invalid-${randomUUID()}`,
        highlightMapId: "contract-audio-phrase",
      };
    },
  },
  {
    fixture: "readalong-interrupted.source-manifest-event.v1.json",
    suffix: "source-manifest-event.v1.json",
    expected: "subject.audioArtifactId missing-audio does not resolve to audio-artifact.v1",
    mutate(payload) {
      return {
        ...payload,
        eventId: `evt-invalid-${randomUUID()}`,
        sequence: 99,
        subject: {
          ...payload.subject,
          audioArtifactId: "missing-audio",
        },
      };
    },
  },
  {
    fixture: "readalong-snapshot.source-manifest-event.v1.json",
    suffix: "source-manifest-event.v1.json",
    expected:
      "snapshotManifestId ram-ql-001 sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        eventId: `evt-invalid-${randomUUID()}`,
        sequence: 100,
        snapshotManifestId: "ram-ql-001",
      };
    },
  },
  {
    fixture: "readalong-promotion.promotion-crosswalk.v1.json",
    suffix: "promotion-crosswalk.v1.json",
    expected:
      "identityMappings from sr-md-002 sourceId contract-markdown does not match quicklisten-temp-001",
    mutate(payload) {
      return {
        ...payload,
        crosswalkId: `promo-invalid-${randomUUID()}`,
        identityMappings: {
          ...payload.identityMappings,
          sourceRevisionIds: [
            {
              from: "sr-md-002",
              to: "sr-ql-001",
              confidence: 0.5,
            },
          ],
        },
      };
    },
  },
  {
    fixture: "readalong-promotion.promotion-crosswalk.v1.json",
    suffix: "promotion-crosswalk.v1.json",
    expected: "identityMappings to sr-md-001 sourceRevisionId sr-md-001 does not match sr-md-002",
    mutate(payload) {
      return {
        ...payload,
        crosswalkId: `promo-invalid-${randomUUID()}`,
        identityMappings: {
          ...payload.identityMappings,
          sourceRevisionIds: [
            {
              from: "sr-ql-001",
              to: "sr-md-001",
              confidence: 0.5,
            },
          ],
        },
      };
    },
  },
  {
    fixture: "readalong-promotion.promotion-crosswalk.v1.json",
    suffix: "promotion-crosswalk.v1.json",
    expected:
      "identityMappings from audio-md-checked sourceId contract-markdown does not match quicklisten-temp-001",
    mutate(payload) {
      return {
        ...payload,
        crosswalkId: `promo-invalid-${randomUUID()}`,
        identityMappings: {
          ...payload.identityMappings,
          audioArtifactIds: [
            {
              from: "audio-md-checked",
              to: "audio-ql-001",
              confidence: 0.5,
            },
          ],
        },
      };
    },
  },
  {
    fixture: "readalong-promotion.promotion-crosswalk.v1.json",
    suffix: "promotion-crosswalk.v1.json",
    expected:
      "identityMappings from progress-md-current sourceId contract-markdown does not match quicklisten-temp-001",
    mutate(payload) {
      return {
        ...payload,
        crosswalkId: `promo-invalid-${randomUUID()}`,
        identityMappings: {
          ...payload.identityMappings,
          progressIds: [
            {
              from: "progress-md-current",
              to: "progress-ql-001",
              confidence: 0.5,
            },
          ],
        },
      };
    },
  },
  {
    fixture: "readalong-current.durable-progress.v1.json",
    suffix: "durable-progress.v1.json",
    expected:
      "readalongManifestId ram-ql-001 sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        progressId: `progress-invalid-${randomUUID()}`,
        readalongManifestId: "ram-ql-001",
      };
    },
  },
  {
    fixture: "readalong-current.durable-progress.v1.json",
    suffix: "durable-progress.v1.json",
    expected: "audio-md-stale sourceRevisionId sr-md-001 does not match sr-md-002",
    mutate(payload) {
      return {
        ...payload,
        progressId: `progress-invalid-${randomUUID()}`,
        audioArtifactId: "audio-md-stale",
      };
    },
  },
  {
    fixture: "readalong-current.durable-progress.v1.json",
    suffix: "durable-progress.v1.json",
    expected: "locatorEnvelope.sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        progressId: `progress-invalid-${randomUUID()}`,
        locatorEnvelope: {
          ...payload.locatorEnvelope,
          sourceId: "quicklisten-temp-001",
        },
      };
    },
  },
  {
    fixture: "readalong-current.durable-progress.v1.json",
    suffix: "durable-progress.v1.json",
    expected: "position.unitId unit-missing does not resolve inside readalongManifestId ram-md-002",
    mutate(payload) {
      return {
        ...payload,
        progressId: `progress-invalid-${randomUUID()}`,
        position: {
          ...payload.position,
          unitId: "unit-missing",
        },
      };
    },
  },
  {
    fixture: "readalong-remapped.resume-resolution.v1.json",
    suffix: "resume-resolution.v1.json",
    expected:
      "resolvedReadalongManifestId ram-ql-001 sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        resolutionId: `resume-invalid-${randomUUID()}`,
        resolvedReadalongManifestId: "ram-ql-001",
      };
    },
  },
  {
    fixture: "readalong-current.resume-resolution.v1.json",
    suffix: "resume-resolution.v1.json",
    expected:
      "progressId progress-ql-001 sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        resolutionId: `resume-invalid-${randomUUID()}`,
        progressId: "progress-ql-001",
      };
    },
  },
  {
    fixture: "readalong-current.resume-resolution.v1.json",
    suffix: "resume-resolution.v1.json",
    expected:
      "resolvedLocatorEnvelope.sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        resolutionId: `resume-invalid-${randomUUID()}`,
        resolvedLocatorEnvelope: {
          ...payload.resolvedLocatorEnvelope,
          sourceId: "quicklisten-temp-001",
        },
      };
    },
  },
  {
    fixture: "readalong-current.resume-resolution.v1.json",
    suffix: "resume-resolution.v1.json",
    expected:
      "revisionMapId revmap-md-001 sourceId contract-markdown does not match quicklisten-temp-001",
    mutate(payload) {
      return {
        ...payload,
        resolutionId: `resume-invalid-${randomUUID()}`,
        sourceId: "quicklisten-temp-001",
        progressId: "progress-ql-001",
        resolvedReadalongManifestId: "ram-ql-001",
        resolvedLocatorEnvelope: {
          ...payload.resolvedLocatorEnvelope,
          sourceId: "quicklisten-temp-001",
        },
        revisionMapId: "revmap-md-001",
      };
    },
  },
  {
    fixture: "readalong-remapped.resume-resolution.v1.json",
    suffix: "resume-resolution.v1.json",
    expected:
      "staleProgressId progress-ql-001 sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        resolutionId: `resume-invalid-${randomUUID()}`,
        staleProgressId: "progress-ql-001",
      };
    },
  },
  {
    fixture: "readalong-current.resume-resolution.v1.json",
    suffix: "resume-resolution.v1.json",
    expected:
      "retryArtifactId audio-ql-001 sourceId quicklisten-temp-001 does not match contract-markdown",
    mutate(payload) {
      return {
        ...payload,
        resolutionId: `resume-invalid-${randomUUID()}`,
        retryArtifactId: "audio-ql-001",
      };
    },
  },
];

test("readalong sidecar validation rejects broken semantic references and exact-sync gates", async () => {
  const tempContractDir = await mkdtemp(path.join(tmpdir(), "readalong-contracts-"));
  try {
    await cp(contractDir, tempContractDir, { recursive: true });
    for (const negativeCase of negativeCases) {
      const validPayload = JSON.parse(
        await readFile(path.join(contractDir, negativeCase.fixture), "utf8"),
      );
      await writeFile(
        path.join(tempContractDir, `readalong-invalid-${randomUUID()}.${negativeCase.suffix}`),
        `${JSON.stringify(negativeCase.mutate(validPayload), null, 2)}\n`,
      );
    }

    const result = spawnSync(process.execPath, ["scripts/validate-content-ir.mjs"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        TTS_RESEARCH_CONTRACT_DIR: tempContractDir,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    for (const { expected } of negativeCases) {
      assert.match(output, new RegExp(escapeRegExp(expected)));
    }
  } finally {
    await rm(tempContractDir, { force: true, recursive: true });
  }
});

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
