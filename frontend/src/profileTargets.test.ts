import { describe, expect, it } from "vitest";
import {
  humanizeProfileTargetProblem,
  isVoiceProfileTargetReadyForEngine,
  voiceProfileTargetReadinessText,
} from "./profileTargets";
import type { VoiceProfile } from "./types";

describe("voice profile target helpers", () => {
  it("requires selected target readiness before enabling clone engines", () => {
    const profile = profileWithTargets({
      "kokoro-clone": "ready",
      "kokoro-embed": "building",
      "supertonic-embed": "failed",
    });

    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro")).toBe(true);
    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro-embed")).toBe(false);
    expect(isVoiceProfileTargetReadyForEngine(profile, "supertonic-3")).toBe(false);
    expect(voiceProfileTargetReadinessText(profile, "kokoro-embed")).toContain("building");
  });

  it("treats an unselected target as unavailable on new targeted profiles", () => {
    const profile = profileWithTargets({ "kokoro-embed": "ready" });

    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro")).toBe(false);
    expect(voiceProfileTargetReadinessText(profile, "kokoro")).toContain("Prepare Kokoro Clone");
  });

  it("keeps legacy artifact profiles usable when target state is absent", () => {
    const profile = {
      ...baseProfile,
      cloneArtifacts: {
        "kokoro-embed": {
          moduleId: "kokoro-embed",
          engineId: "kokoro-embed",
          status: "ready",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    } satisfies VoiceProfile;

    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro")).toBe(true);
    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro-embed")).toBe(true);
    expect(isVoiceProfileTargetReadyForEngine(profile, "supertonic-3")).toBe(false);
  });

  it("distinguishes configured-token access denial from missing-token setup", () => {
    const denied = humanizeProfileTargetProblem(`target speaker likeness failed: 403 Client Error.
Cannot access gated repo for url https://huggingface.co/pyannote/embedding/resolve/main/pytorch_model.bin.
Access to model pyannote/embedding is restricted and you are not in the authorized list.`);

    expect(denied.detail).toMatch(/configured Hugging Face token/i);
    expect(denied.detail).toMatch(/accept the model terms/i);
    expect(denied.requiresHuggingFaceToken).toBe(true);

    const missing = humanizeProfileTargetProblem(
      "target speaker likeness needs access to pyannote/embedding. Set PYANNOTE_AUTH_TOKEN or HF_TOKEN.",
    );
    expect(missing.detail).toMatch(/add a Hugging Face token/i);
  });

  it("routes profile-analysis dependency failures to the validation runtime", () => {
    const problem = humanizeProfileTargetProblem(
      "target speaker likeness failed: profile likeness script failed: pyannote audio dependencies are not installed: No module named 'omegaconf'",
    );

    expect(problem.detail).toMatch(/Speaker likeness validation/i);
    expect(problem.detail).toMatch(/omegaconf/);
    expect(problem.command).toBe("cd backend && uv sync --all-extras");
  });

  it("keeps artifact dependency failures pointed at the voice embed runtime", () => {
    const problem = humanizeProfileTargetProblem("No module named 'numpy'", {
      id: "kokoro-embed",
      label: "Kokoro Embed",
      repoUrl: "https://example.test/kokoro.embed",
      ref: "main",
      localPath: ".upstreams/kokoro.embed",
      installed: true,
      status: "runtime_missing",
      cloneAllowed: true,
      prompt: true,
      setupCommand: "VOICE_EMBED_INSTALL_DEPS=1 mise setup:voice-embed",
    });

    expect(problem.detail).toMatch(/Voice Embed runtime/i);
    expect(problem.command).toBe("VOICE_EMBED_INSTALL_DEPS=1 mise setup:voice-embed");
  });
});

function profileWithTargets(targets: Record<string, "ready" | "building" | "failed">) {
  const now = new Date().toISOString();
  return {
    ...baseProfile,
    cloneTargets: Object.fromEntries(
      Object.entries(targets).map(([id, status]) => [
        id,
        {
          id,
          selected: true,
          status,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    ),
  } satisfies VoiceProfile;
}

const baseProfile: VoiceProfile = {
  id: "profile-1",
  name: "Narrator",
  language: "en",
  sourceFile: "source.wav",
  sourceBytes: 100,
  referenceAudio: "reference.wav",
  referencePath: "/profile/reference.wav",
  referenceTrimmed: false,
  audioFormat: "audio/wav",
  status: "ready",
  durationMs: 1000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
