import type { VoiceProfile } from "./types";

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
