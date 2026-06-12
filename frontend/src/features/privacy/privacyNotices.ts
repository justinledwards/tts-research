import type { StatusChipTone } from "../../design";
import { classifyUrlIntake } from "./privacyModel";

export interface PrivacyNotice {
  readonly id: string;
  readonly message: string;
  readonly title: string;
  readonly tone: StatusChipTone;
}

export const PRIVACY_NOTICES = {
  fileIntake: {
    id: "file-intake",
    message:
      "Local files are read by the local backend and kept in project as prepared source data.",
    title: "Local file intake",
    tone: "success",
  },
  projectBundleExport: {
    id: "project-bundle-export",
    message:
      "Project bundles include prepared source text, generated audio when present, settings, telemetry, and voice references; secrets and model paths stay out.",
    title: "Export boundary",
    tone: "info",
  },
  projectBundleImport: {
    id: "project-bundle-import",
    message:
      "Bundle import previews the manifest before it copies project assets into local storage.",
    title: "Import boundary",
    tone: "info",
  },
  providerBackedGeneration: {
    id: "provider-backed-generation",
    message:
      "Provider-backed generation can send request text and selected voice settings to the configured provider for generation.",
    title: "Provider-backed generation",
    tone: "warning",
  },
  uiMemoryExport: {
    id: "ui-memory-export",
    message:
      "UI memory export contains presentation preferences only; project content, audio, secrets, and model paths are omitted.",
    title: "UI memory export",
    tone: "success",
  },
  voiceProfileLocal: {
    id: "voice-profile-local",
    message:
      "Voice source recordings, references, and clone artifacts stay local unless a configured provider or optional module is used.",
    title: "Voice profile boundary",
    tone: "success",
  },
} satisfies Record<string, PrivacyNotice>;

export function urlIntakeNotice(rawUrl: string): PrivacyNotice {
  const safety = classifyUrlIntake(rawUrl);
  return {
    id: `url-intake-${safety.class}`,
    message: safety.detail,
    title: safety.label,
    tone: safety.tone,
  };
}

export function sourcePrepFailureNotice(error: string): PrivacyNotice {
  if (/content type|unsupported/i.test(error)) {
    return {
      id: "source-prep-unsupported-content",
      message: "The fetched URL did not return a supported readable document type.",
      title: "Unsupported content type",
      tone: "danger",
    };
  }
  if (/private|local/i.test(error)) {
    return {
      id: "source-prep-private-url",
      message: "The backend blocked this URL because it resolves to a private or local address.",
      title: "Private URL blocked",
      tone: "warning",
    };
  }
  return {
    id: "source-prep-failed",
    message: "Extraction failed before readable content was kept in project.",
    title: "Extraction failed",
    tone: "danger",
  };
}
