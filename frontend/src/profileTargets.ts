import type { ResearchModuleDiagnostics, TTSEngineDiagnostics, VoiceProfile } from "./types";

export interface BackendProfileTargetPolicy {
  engineId: string;
  targetId: string | null;
  requiresProfileTarget: boolean;
  fallbackReadyWithoutTarget: boolean;
}

export interface NarrationBackendDescriptor {
  id: string;
  label: string;
  status: string;
  targetPolicy: BackendProfileTargetPolicy;
}

export function buildNarrationBackendDescriptor(
  engine: TTSEngineDiagnostics,
): NarrationBackendDescriptor {
  return {
    id: engine.id,
    label: engine.label,
    status: engine.status,
    targetPolicy: backendProfileTargetPolicy(engine.id),
  };
}

export function backendProfileTargetPolicy(engineId: string): BackendProfileTargetPolicy {
  const targetId = voiceProfileTargetForEngine(engineId);
  return {
    engineId,
    fallbackReadyWithoutTarget: targetId === "kokoro-clone",
    requiresProfileTarget: targetId !== null && targetId !== "kokoro-clone",
    targetId,
  };
}

export function voiceProfileTargetForEngine(engineId: string): string | null {
  switch (engineId) {
    case "auto":
    case "kokoro":
    case "kokoro-clone": {
      return "kokoro-clone";
    }
    case "kokoro-embed": {
      return "kokoro-embed";
    }
    case "supertonic-3": {
      return "supertonic-embed";
    }
    default: {
      return null;
    }
  }
}

export function isVoiceProfileTargetReadyForEngine(
  profile: VoiceProfile | null,
  engineId: string,
): boolean {
  if (!profile) {
    return true;
  }
  const targetId = voiceProfileTargetForEngine(engineId);
  if (!targetId) {
    return true;
  }
  const target = profile.cloneTargets?.[targetId];
  if (target) {
    return target.status === "ready";
  }
  if (profile.cloneTargets && Object.keys(profile.cloneTargets).length > 0) {
    return false;
  }
  if (targetId === "kokoro-clone") {
    return true;
  }
  const artifact = profile.cloneArtifacts?.[targetId];
  return artifact?.status === "ready";
}

export function voiceProfileTargetReadinessText(
  profile: VoiceProfile | null,
  engineId: string,
): string {
  if (!profile) {
    return "Select a voice profile to prepare clone targets.";
  }
  const targetId = voiceProfileTargetForEngine(engineId);
  if (!targetId) {
    return "This backend does not need a profile target.";
  }
  const target = profile.cloneTargets?.[targetId];
  if (!target) {
    if (targetId === "kokoro-clone" && isVoiceProfileTargetReadyForEngine(profile, engineId)) {
      return "Kokoro Clone is ready from the selected reference audio.";
    }
    return `Prepare ${voiceProfileTargetLabel(targetId)} on this profile.`;
  }
  if (target.status === "ready") {
    return `${voiceProfileTargetLabel(targetId)} is ready for this profile.`;
  }
  if (target.status === "failed") {
    return (
      target.error ?? target.validation?.error ?? `${voiceProfileTargetLabel(targetId)} failed.`
    );
  }
  if (target.status === "cancelled") {
    return `${voiceProfileTargetLabel(targetId)} was cancelled.`;
  }
  return `${voiceProfileTargetLabel(targetId)} is ${target.status}.`;
}

export function voiceProfileTargetLabel(targetId: string): string {
  switch (targetId) {
    case "kokoro-clone": {
      return "Kokoro Clone";
    }
    case "kokoro-embed": {
      return "Kokoro Embed";
    }
    case "supertonic-embed": {
      return "Supertonic Embed";
    }
    default: {
      return targetId;
    }
  }
}

export interface HumanizedProfileTargetProblem {
  detail: string;
  command?: string;
  requiresHuggingFaceToken?: boolean;
}

const DEFAULT_VOICE_EMBED_SETUP_COMMAND = "VOICE_EMBED_INSTALL_DEPS=1 mise setup:voice-embed";
const PROFILE_ANALYSIS_SETUP_COMMAND = "cd backend && uv sync --all-extras";

export function humanizeProfileTargetProblem(
  message: string,
  module?: ResearchModuleDiagnostics,
): HumanizedProfileTargetProblem {
  const clean = message.trim();
  const lower = clean.toLowerCase();
  const setupCommand = module?.setupCommand ?? DEFAULT_VOICE_EMBED_SETUP_COMMAND;
  if (isHuggingFaceAccessDenied(lower)) {
    return {
      detail:
        "The configured Hugging Face token could not access the gated pyannote model. Update the token or accept the model terms, then re-validate.",
      requiresHuggingFaceToken: true,
    };
  }
  const missingModule = /No module named ['"]([^'"]+)['"]/i.exec(clean)?.[1];
  if (missingModule) {
    return humanizeMissingPythonModuleProblem(lower, missingModule, setupCommand);
  }
  if (lower.includes("pyannote/embedding") || lower.includes("gated repo")) {
    return {
      detail:
        "Speaker likeness validation needs access to the gated pyannote/embedding model. Rendering is available; add a Hugging Face token or configure a local embedding model, then re-validate.",
      requiresHuggingFaceToken: true,
    };
  }
  if (lower.includes("en_core_web_sm")) {
    return {
      detail:
        "Kokoro embed requires the spacy model en_core_web_sm. Run setup to install it, then retry profile preparation.",
      command: setupCommand,
    };
  }
  if (lower.includes("no virtual environment found")) {
    return {
      detail:
        "The embed optimizer tried to use an unprepared Python workspace. Run the isolated voice-embed setup, restart the app if it was already open, then retry this target.",
      command: setupCommand,
    };
  }
  if (lower.includes("kokoro/voices")) {
    return {
      detail:
        "The Kokoro embed workspace was missing its local voices directory. The app now prepares that folder automatically; retry profile preparation after setup completes.",
      command: setupCommand,
    };
  }
  if (lower.includes("invalid literal for int() with base 10") && lower.includes("final")) {
    return {
      detail:
        "The upstream optimizer found a stale final checkpoint from an earlier run. The app now clears stale non-step checkpoints before retrying this artifact.",
    };
  }
  if (lower.includes("voice embed runtime")) {
    return {
      detail: clean,
      command: setupCommand,
    };
  }
  if (
    lower.includes("supertonic embed prerequisite missing") ||
    lower.includes("duration_predictor.onnx") ||
    lower.includes("onnx/") ||
    lower.includes("missing required file") ||
    lower.includes("missing: ")
  ) {
    return {
      detail:
        clean ||
        "The optional Supertonic embed assets are missing. Sync them by running setup for voice-embed.",
      command: setupCommand,
    };
  }
  if (lower.includes("tts engine") && lower.includes("unavailable")) {
    return {
      detail:
        "The style artifact is ready, but the validation render could not run because this backend is unavailable in the current runtime. Start the app with that backend enabled, then re-validate.",
      command: module?.setupCommand,
    };
  }
  if (lower.includes("profile artifact build failed")) {
    return {
      detail:
        clean ||
        "The artifact builder exited before creating a style file. Check the module setup and retry.",
      command: module?.setupCommand,
    };
  }
  return {
    detail: clean || "This target could not be prepared. Retry after checking the backend logs.",
    command: module?.setupCommand,
  };
}

function isHuggingFaceAccessDenied(lower: string): boolean {
  return (
    (lower.includes("403") || lower.includes("not in the authorized list")) &&
    includesAny(lower, ["hugging face", "huggingface", "pyannote", "gated repo"])
  );
}

function humanizeMissingPythonModuleProblem(
  lower: string,
  missingModule: string,
  setupCommand: string,
): HumanizedProfileTargetProblem {
  if (isProfileAnalysisDependency(lower, missingModule)) {
    return {
      detail: `Speaker likeness validation is missing the Python package ${missingModule}. Sync the profile-analysis runtime, then re-validate this target.`,
      command: PROFILE_ANALYSIS_SETUP_COMMAND,
    };
  }
  return {
    detail: `The Voice Embed runtime is missing the Python package ${missingModule}. Install the optional embed dependencies, then retry this target.`,
    command: setupCommand,
  };
}

function isProfileAnalysisDependency(lower: string, missingModule: string): boolean {
  return (
    missingModule === "omegaconf" ||
    includesAny(lower, ["profile likeness", "speaker likeness", "pyannote"])
  );
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}
