import {
  applySpeechPolicyOverridesToSettings,
  normalizeSpeechPolicyOverrides,
  speechPolicyProfileLabel,
} from "../../speechPolicy";
import type { SpeechPolicyOverrides, SpeechPolicySettings } from "../../types";

export interface SpeechPolicyPreviewItem {
  id: string;
  label: string;
  written: string;
  spoken: string;
  note: string;
}

export interface SpeechPolicyPreview {
  items: SpeechPolicyPreviewItem[];
  notes: string[];
}

export interface SpeechPolicyProfileExport {
  schemaVersion: "speech-policy-profile.v1";
  name: string;
  baseProfile: string;
  settings: SpeechPolicySettings;
}

export interface SpeechPolicyProfileImportResult {
  baseProfile: string;
  name: string;
  settings: SpeechPolicySettings;
}

const SPEECH_POLICY_MODE_OPTIONS = [
  "speak",
  "skip",
  "summarise",
  "literal",
  "spell",
  "describeShort",
  "describeLong",
  "onDemand",
  "interactive",
] as const;

export function buildSpeechPolicyPreview(settings: SpeechPolicySettings): SpeechPolicyPreview {
  const items: SpeechPolicyPreviewItem[] = [
    {
      id: "numbers",
      label: "Numbers",
      written: "Release 3.14 ships on 2026-05-21.",
      spoken:
        settings.mathMode === "skip"
          ? "Release number and date are kept in prose; math-only expressions are skipped."
          : "Release three point one four ships on May twenty first, twenty twenty six.",
      note:
        settings.mathMode === "literalsafe"
          ? "Literal-safe math keeps numeric symbols deliberate."
          : "Number wording follows the selected speech renderer locale.",
    },
    {
      id: "abbreviations",
      label: "Abbreviations",
      written: "Use the API, e.g. POST /v1/audio.",
      spoken:
        settings.codeMode === "literal" || settings.codeMode === "syntaxAware"
          ? "Use the A P I, for example, post slash v one slash audio."
          : "Use the API, for example the audio endpoint.",
      note:
        settings.codeMode === "syntaxAware"
          ? "Syntax-aware code keeps short tokens inspectable."
          : "Abbreviations are smoothed unless a code policy asks for literal tokens.",
    },
    {
      id: "punctuation",
      label: "Punctuation",
      written: 'Note: "Keep review notes audible."',
      spoken: quotePreview(settings.quoteMode),
      note:
        settings.admonitionMode === "summarise"
          ? "Admonitions are condensed before narration."
          : "Quotes and punctuation cues stay aligned with the quote policy.",
    },
    {
      id: "citations",
      label: "Citations",
      written: "Latency improved by 18% [Smith 2025].",
      spoken: citationPreview(settings.citationMode),
      note:
        settings.citationMode === "onDemand"
          ? "Citation detail remains available without interrupting the main read."
          : "Citation handling follows the active speech profile.",
    },
    {
      id: "code",
      label: "Code",
      written: "const total = items.length;",
      spoken: codePreview(settings.codeMode),
      note:
        settings.codeMode === "skip"
          ? "Code blocks are omitted from the spoken pass."
          : "Code phrasing changes immediately when the code policy changes.",
    },
    {
      id: "tables",
      label: "Table summaries",
      written: "Table: Engine | Status | VRAM",
      spoken: tablePreview(settings.tableMode, settings.tableHeaderMode),
      note:
        settings.tableHeaderMode === "rowAndColumn"
          ? "Row and column headers are repeated for orientation."
          : "Table header verbosity follows the active profile.",
    },
  ];

  return {
    items,
    notes: [
      settings.footnoteMode === "inline"
        ? "Footnotes read inline with the surrounding passage."
        : `Footnotes use ${formatPolicyValue(settings.footnoteMode)} handling.`,
      settings.captionMode === "speak"
        ? "Captions are spoken with nearby media."
        : `Captions are ${formatPolicyValue(settings.captionMode)}.`,
    ],
  };
}

export function exportSpeechPolicyProfileJson(
  name: string,
  baseProfile: string,
  settings: SpeechPolicySettings,
): string {
  const payload: SpeechPolicyProfileExport = {
    schemaVersion: "speech-policy-profile.v1",
    name: name.trim() || `${speechPolicyProfileLabel(baseProfile)} custom`,
    baseProfile,
    settings,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseSpeechPolicyProfileJson(
  raw: string,
  fallbackName: string,
  fallbackBaseProfile: string,
  fallbackSettings: SpeechPolicySettings,
): SpeechPolicyProfileImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Profile JSON must be an object.");
  }

  const candidate = parsed as {
    baseProfile?: unknown;
    name?: unknown;
    profile?: unknown;
    settings?: unknown;
  };
  const settingsSource =
    candidate.settings && typeof candidate.settings === "object" ? candidate.settings : candidate;
  const settingsCandidate = settingsSource as SpeechPolicyOverrides;
  const mode =
    typeof settingsCandidate.mode === "string" &&
    SPEECH_POLICY_MODE_OPTIONS.includes(settingsCandidate.mode)
      ? settingsCandidate.mode
      : fallbackSettings.mode;
  const settings = applySpeechPolicyOverridesToSettings(fallbackSettings, {
    ...normalizeSpeechPolicyOverrides(settingsSource),
    mode,
  });
  let baseProfile = fallbackBaseProfile;
  if (typeof candidate.baseProfile === "string" && candidate.baseProfile.trim()) {
    baseProfile = candidate.baseProfile.trim();
  } else if (typeof candidate.profile === "string" && candidate.profile.trim()) {
    baseProfile = candidate.profile.trim();
  }
  return {
    name:
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim()
        : fallbackName,
    baseProfile,
    settings,
  };
}

export function formatPolicyValue(value: string): string {
  return value
    .replaceAll(/([A-Z])/g, " $1")
    .replaceAll("row And Column", "row and column")
    .replaceAll("on Demand", "on demand")
    .trim()
    .toLowerCase();
}

function citationPreview(mode: SpeechPolicySettings["citationMode"]): string {
  if (mode === "skip") {
    return "Latency improved by eighteen percent.";
  }
  if (mode === "inline") {
    return "Latency improved by eighteen percent, citation Smith twenty twenty five.";
  }
  if (mode === "endnote") {
    return "Latency improved by eighteen percent. Citation moved to end notes.";
  }
  return "Latency improved by eighteen percent. Citation available on demand.";
}

function quotePreview(mode: SpeechPolicySettings["quoteMode"]): string {
  if (mode === "skip") {
    return "Note.";
  }
  if (mode === "summarise") {
    return "Note: a quoted review reminder follows.";
  }
  return "Note: quote, keep review notes audible, end quote.";
}

function codePreview(mode: SpeechPolicySettings["codeMode"]): string {
  if (mode === "skip") {
    return "Code block skipped.";
  }
  if (mode === "summary") {
    return "Code summary: total is assigned from the item count.";
  }
  if (mode === "syntaxAware") {
    return "Constant total equals items dot length.";
  }
  return "c o n s t total equals items dot length semicolon.";
}

function tablePreview(
  tableMode: SpeechPolicySettings["tableMode"],
  headerMode: SpeechPolicySettings["tableHeaderMode"],
): string {
  if (tableMode === "skip") {
    return "Table skipped.";
  }
  if (tableMode === "summary") {
    return "Table summary: engines are listed with status and memory needs.";
  }
  const headerPhrase = tableHeaderPreview(headerMode);
  if (tableMode === "interactive") {
    return `Interactive table available ${headerPhrase}.`;
  }
  return `Row one, engine Kokoro, status ready, VRAM four gigabytes, ${headerPhrase}.`;
}

function tableHeaderPreview(headerMode: SpeechPolicySettings["tableHeaderMode"]): string {
  if (headerMode === "rowAndColumn") {
    return "with row and column headers";
  }
  if (headerMode === "column") {
    return "with column headers";
  }
  return "without repeated headers";
}
