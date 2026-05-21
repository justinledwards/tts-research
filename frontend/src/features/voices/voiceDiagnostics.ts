import type { ResearchModuleDiagnostics, VoiceProfileSourceDiagnostics } from "../../types";

export interface VoiceDiagnosticItem {
  detail: string;
  id: string;
  label: string;
  tone: "danger" | "info" | "neutral" | "success" | "warning";
  value: string;
}

export function buildVoiceDiagnostics({
  diagnostics,
  modules,
}: Readonly<{
  diagnostics: VoiceProfileSourceDiagnostics | null;
  modules: ResearchModuleDiagnostics[];
}>): VoiceDiagnosticItem[] {
  const cloneModules = modules.filter((module) => module.cloneAllowed);
  return [
    {
      detail: diagnostics?.setupMessage ?? "Voice source diagnostics load after analysis starts.",
      id: "source-diagnostics",
      label: "Source analysis",
      tone: sourceDiagnosticTone(diagnostics),
      value: diagnostics?.mode ?? "Pending",
    },
    {
      detail:
        diagnostics?.modelPath ??
        diagnostics?.localModelDir ??
        "No local diarization path reported.",
      id: "diarization-model",
      label: "Diarization model",
      tone: modelDiagnosticTone(diagnostics),
      value: diagnostics?.model ?? "Not checked",
    },
    {
      detail: diagnostics?.tokenConfigured
        ? "A local or provider token is configured."
        : "Token-gated models may need credentials before full analysis.",
      id: "token-readiness",
      label: "Credential readiness",
      tone: tokenDiagnosticTone(diagnostics),
      value: diagnostics?.tokenConfigured ? "Configured" : "Not configured",
    },
    {
      detail:
        cloneModules.length > 0
          ? cloneModules.map((module) => module.label).join(", ")
          : "Clone modules have not been detected in this runtime.",
      id: "clone-modules",
      label: "Clone modules",
      tone: cloneModules.length > 0 ? "success" : "warning",
      value: cloneModules.length.toString(),
    },
  ];
}

function sourceDiagnosticTone(
  diagnostics: VoiceProfileSourceDiagnostics | null,
): VoiceDiagnosticItem["tone"] {
  if (!diagnostics) {
    return "neutral";
  }
  if (!diagnostics.ffmpegAvailable) {
    return "danger";
  }
  return "success";
}

function modelDiagnosticTone(
  diagnostics: VoiceProfileSourceDiagnostics | null,
): VoiceDiagnosticItem["tone"] {
  if (!diagnostics) {
    return "neutral";
  }
  return diagnostics.localModelAvailable ? "success" : "warning";
}

function tokenDiagnosticTone(
  diagnostics: VoiceProfileSourceDiagnostics | null,
): VoiceDiagnosticItem["tone"] {
  if (!diagnostics) {
    return "neutral";
  }
  return diagnostics.tokenConfigured ? "success" : "warning";
}
