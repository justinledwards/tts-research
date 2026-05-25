import type { StatusChipTone } from "../../design";
import type { ProviderRuntimeCapabilities } from "../provider-capabilities";

export type PrivacyBoundaryId =
  | "local-runtime"
  | "project-storage"
  | "generated-audio"
  | "ui-memory"
  | "provider-runtime"
  | "url-intake"
  | "project-export"
  | "project-import"
  | "voice-profile";

export type URLIntakeSafetyClass =
  | "empty"
  | "invalid"
  | "unsupported"
  | "external"
  | "privateNetwork"
  | "localMachine";

export interface PrivacyBoundaryFact {
  readonly label: string;
  readonly value: string;
}

export interface PrivacyBoundary {
  readonly id: PrivacyBoundaryId;
  readonly title: string;
  readonly status: string;
  readonly tone: StatusChipTone;
  readonly summary: string;
  readonly facts: readonly PrivacyBoundaryFact[];
  readonly included?: readonly string[];
  readonly excluded?: readonly string[];
}

export interface URLIntakeSafety {
  readonly allowedByDefault: boolean;
  readonly class: URLIntakeSafetyClass;
  readonly detail: string;
  readonly label: string;
  readonly leavesMachine: boolean;
  readonly tone: StatusChipTone;
}

export const UI_MEMORY_EXPORT_OMITTED_ITEMS = [
  "generated audio",
  "model paths",
  "provider secrets",
  "private project content",
  "raw Teleprompt script snapshots",
] as const;

export const PROJECT_EXPORT_EXCLUDED_ITEMS = [
  "provider secrets and credential files",
  "model cache directories and absolute model paths",
  "raw uploaded PDF/EPUB source files",
  "browser UI memory preferences",
] as const;

export const PROJECT_EXPORT_INCLUDED_ITEMS = [
  "project metadata and run configuration",
  "normalized script and source text already prepared for narration",
  "generated audio and waveform artifacts when present",
  "voice profile reference audio used by exported jobs",
  "quality reports, telemetry, and reading settings",
] as const;

export const privacyBoundaryCatalog = {
  generatedAudio: {
    facts: [
      { label: "Stored", value: "Local job data under backend/data/jobs." },
      { label: "Export", value: "Included in project bundles when generated audio exists." },
      { label: "Provider", value: "Creation may be mock, local, or provider-backed by runtime." },
    ],
    id: "generated-audio",
    status: "Local artifact",
    summary:
      "Generated audio is a project asset stored locally and exported only through an explicit bundle.",
    title: "Generated Audio",
    tone: "success",
  },
  projectStorage: {
    facts: [
      {
        label: "Stored",
        value: "Projects, source preps, books, jobs, progress, and voices live in backend/data.",
      },
      {
        label: "Network",
        value: "Local file and pasted-text intake do not require hosted services.",
      },
      { label: "Export", value: "Portable bundles are explicit and previewed before import." },
    ],
    id: "project-storage",
    status: "Machine-local",
    summary:
      "Project state is kept in ignored local runtime directories until the user exports a bundle.",
    title: "Project Storage",
    tone: "success",
  },
  uiMemory: {
    excluded: UI_MEMORY_EXPORT_OMITTED_ITEMS,
    facts: [
      { label: "Stored", value: "Browser-local presentation preferences only." },
      { label: "Export", value: "JSON preferences export contains enabled UI memory categories." },
      {
        label: "Import",
        value: "Unknown fields are ignored and last-project memory only applies locally.",
      },
    ],
    id: "ui-memory",
    status: "Browser-local",
    summary: "UI memory remembers presentation choices, not project content or generated media.",
    title: "UI Memory",
    tone: "success",
  },
  voiceProfile: {
    facts: [
      {
        label: "Stored",
        value:
          "Recordings, references, candidates, and clone artifacts stay in local voice-profile data.",
      },
      {
        label: "Export",
        value: "Project bundles include voice references only when jobs depend on those profiles.",
      },
      {
        label: "Credentials",
        value: "Provider tokens and model paths are separate runtime settings, not voice assets.",
      },
    ],
    id: "voice-profile",
    status: "Local voice data",
    summary:
      "Voice profile source data is local unless a configured provider or optional research module is used.",
    title: "Voice Profiles",
    tone: "success",
  },
} satisfies Record<string, PrivacyBoundary>;

export function providerRuntimePrivacyBoundary(
  runtime: ProviderRuntimeCapabilities,
): PrivacyBoundary {
  const isMock = runtime.capabilities.mockTts;
  const isLocal = runtime.capabilities.localOnly || isMock;
  let status = "Provider-backed";
  if (isMock) {
    status = "Mock runtime";
  } else if (isLocal) {
    status = "Local runtime";
  }
  return {
    facts: [
      {
        label: "Active provider",
        value: runtime.providerLabel,
      },
      {
        label: "Generation boundary",
        value: isLocal
          ? "Mock/local generation does not require an external provider call."
          : "Provider-backed generation can send request text and voice settings to the configured provider.",
      },
      {
        label: "Fallback",
        value: isLocal
          ? "Mock mode remains available for review without secrets."
          : "Switch to mock or local runtime before preparing sensitive content.",
      },
    ],
    id: "provider-runtime",
    status,
    summary: isLocal
      ? "The selected runtime keeps generation on this machine or uses deterministic mock output."
      : "The selected runtime may cross the local machine boundary when generation starts.",
    title: "Provider Boundary",
    tone: isLocal ? "success" : "warning",
  };
}

export function projectExportPrivacyBoundary(): PrivacyBoundary {
  return {
    excluded: PROJECT_EXPORT_EXCLUDED_ITEMS,
    facts: [
      {
        label: "Included",
        value: "Prepared project assets, generated audio, run settings, and voice references.",
      },
      {
        label: "Excluded",
        value: "Secrets, credential files, model caches, model paths, and browser UI memory.",
      },
      {
        label: "Import",
        value: "Bundle import previews the manifest before mutating local projects.",
      },
    ],
    id: "project-export",
    included: PROJECT_EXPORT_INCLUDED_ITEMS,
    status: "Explicit bundle",
    summary:
      "Project export creates a portable local bundle with reviewable contents before download.",
    title: "Project Export",
    tone: "info",
  };
}

export function projectImportPrivacyBoundary(): PrivacyBoundary {
  return {
    facts: [
      { label: "Preview", value: "The manifest is validated before import changes project state." },
      {
        label: "Default",
        value: "Import as new project keeps bundle contents separate for review.",
      },
      {
        label: "Local result",
        value: "Imported audio and voice references are copied into local runtime storage.",
      },
    ],
    id: "project-import",
    status: "Preview first",
    summary:
      "Bundle import is local and uses copy mode by default unless merge or replace is selected.",
    title: "Project Import",
    tone: "info",
  };
}

export function urlIntakePrivacyBoundary(rawUrl: string): PrivacyBoundary {
  const safety = classifyUrlIntake(rawUrl);
  return {
    facts: [
      { label: "Fetch", value: safety.detail },
      {
        label: "Default guard",
        value: safety.allowedByDefault
          ? "Allowed by default."
          : "Blocked unless private URL intake is enabled.",
      },
      {
        label: "Storage",
        value: "Successful extraction writes readable content to local source-prep storage.",
      },
    ],
    id: "url-intake",
    status: safety.label,
    summary:
      "URL intake is fetched by the local backend, then extracted into a local prepared source.",
    title: "URL Intake",
    tone: safety.tone,
  };
}

export function classifyUrlIntake(rawUrl: string): URLIntakeSafety {
  const clean = rawUrl.trim();
  if (!clean) {
    return {
      allowedByDefault: false,
      class: "empty",
      detail: "Paste an http or https URL to see the fetch boundary.",
      label: "Waiting for URL",
      leavesMachine: false,
      tone: "neutral",
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return {
      allowedByDefault: false,
      class: "invalid",
      detail: "The URL must include a valid host and http or https scheme.",
      label: "Invalid URL",
      leavesMachine: false,
      tone: "danger",
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      allowedByDefault: false,
      class: "unsupported",
      detail: "Only http and https URL intake is supported.",
      label: "Unsupported scheme",
      leavesMachine: false,
      tone: "danger",
    };
  }
  const host = parsed.hostname.toLowerCase();
  if (isLocalHost(host)) {
    return {
      allowedByDefault: false,
      class: "localMachine",
      detail: "This points at the local machine and is blocked by the default backend guard.",
      label: "Local URL",
      leavesMachine: false,
      tone: "warning",
    };
  }
  if (isPrivateHost(host)) {
    return {
      allowedByDefault: false,
      class: "privateNetwork",
      detail:
        "This points at a private network address and is blocked by the default backend guard.",
      label: "Private network URL",
      leavesMachine: true,
      tone: "warning",
    };
  }
  return {
    allowedByDefault: true,
    class: "external",
    detail: "The local backend fetches this external URL before article extraction.",
    label: "External fetch",
    leavesMachine: true,
    tone: "info",
  };
}

function isLocalHost(host: string): boolean {
  const clean = host.replaceAll(/^\[|\]$/g, "");
  return (
    clean === "localhost" ||
    clean.endsWith(".localhost") ||
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean === "0.0.0.0"
  );
}

function isPrivateHost(host: string): boolean {
  const clean = host.replaceAll(/^\[|\]$/g, "");
  const parts = clean.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const [first, second] = parts;
    return (
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }
  return clean.startsWith("fc") || clean.startsWith("fd") || clean.startsWith("fe80:");
}
