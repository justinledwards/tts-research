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

export interface GoldenMinutePolicySegmentPreview {
  id: string;
  label: string;
  policyNote: string;
  sourceLocator: string;
  spoken: string;
  written: string;
}

export interface GoldenMinutePolicyPreview {
  citationHandling: string;
  highlightGranularity: string;
  highlightPlan: string;
  pauseChanges: string[];
  profileLabel: string;
  pronunciationSubstitutions: string[];
  segments: GoldenMinutePolicySegmentPreview[];
  speechPlanSummary: string;
}

export interface GoldenMinutePolicyComparison {
  differences: string[];
  left: GoldenMinutePolicyPreview;
  right: GoldenMinutePolicyPreview;
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
  const items = buildSpeechPolicyPreviewItems(settings);

  return {
    items,
    notes: buildSpeechPolicyNotes(settings),
  };
}

export function buildGoldenMinutePolicyPreview(
  settings: SpeechPolicySettings,
  profileLabel = "Current policy",
): GoldenMinutePolicyPreview {
  const citationHandling = goldenMinuteCitationHandling(settings);
  const highlightGranularity = goldenMinuteHighlightGranularity(settings);
  const segments = goldenMinuteSegments(settings);
  return {
    citationHandling,
    highlightGranularity,
    highlightPlan: `${highlightGranularity} highlight plan with ${goldenMinuteSyncStrictness(
      settings,
    )} timing; citation markers use ${formatPolicyValue(settings.citationMode)} handling.`,
    pauseChanges: goldenMinutePauseChanges(settings),
    profileLabel,
    pronunciationSubstitutions: [
      "Dr. -> Doctor",
      "7:05 -> seven oh five",
      "golden-minute://resume-anchor -> golden minute resume anchor",
      "47 -> forty seven",
    ],
    segments,
    speechPlanSummary: goldenMinuteSpeechPlanSummary(segments),
  };
}

function goldenMinuteSpeechPlanSummary(
  segments: readonly GoldenMinutePolicySegmentPreview[],
): string {
  return `${String(
    segments.length,
  )} golden-minute segments: heading, paragraph handoffs, quote, citation token, natural pause, bookmark, and theatre cue.`;
}

export function buildGoldenMinutePolicyComparison(
  left: GoldenMinutePolicyPreview,
  right: GoldenMinutePolicyPreview,
): GoldenMinutePolicyComparison {
  return {
    differences: goldenMinutePolicyDifferences(left, right),
    left,
    right,
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
    .replaceAll("And", "and")
    .replaceAll("row And Column", "row and column")
    .replaceAll("on Demand", "on demand")
    .trim()
    .toLowerCase();
}

function buildSpeechPolicyPreviewItems(settings: SpeechPolicySettings): SpeechPolicyPreviewItem[] {
  return [
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
}

function buildSpeechPolicyNotes(settings: SpeechPolicySettings): string[] {
  return [
    settings.footnoteMode === "inline"
      ? "Footnotes read inline with the surrounding passage."
      : `Footnotes use ${formatPolicyValue(settings.footnoteMode)} handling.`,
    settings.captionMode === "speak"
      ? "Captions are spoken with nearby media."
      : `Captions are ${formatPolicyValue(settings.captionMode)}.`,
  ];
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

function goldenMinuteSegments(settings: SpeechPolicySettings): GoldenMinutePolicySegmentPreview[] {
  return [
    {
      id: "gm-h1",
      label: "Heading",
      policyNote: "Heading stays spoken so segment handoff starts with a stable title.",
      sourceLocator: "sample.md#L1",
      spoken: "Golden Minute Calibration",
      written: "# Golden Minute Calibration",
    },
    {
      id: "gm-p1",
      label: "Abbreviation, number, quote",
      policyNote: goldenMinuteQuotePolicyNote(settings),
      sourceLocator: "sample.md#L3",
      spoken: `Doctor Mira Chen unlocked the studio at seven oh five, placed a brass bookmark on paragraph three, and said, ${goldenMinuteQuoteText(
        settings,
        "Start with the listener, then chase the waveform.",
      )}`,
      written:
        'Dr. Mira Chen unlocked the studio at 7:05, placed a brass bookmark on paragraph three, and said, "Start with the listener, then chase the waveform."',
    },
    {
      id: "gm-p3",
      label: "Citation and locator",
      policyNote: goldenMinuteCitationPolicyNote(settings),
      sourceLocator: "sample.md#L7",
      spoken: `Before playback begins, she taps the source locator golden minute resume anchor, waits for a breath, and checks that ${goldenMinuteCitationText(
        settings,
      )} stays silent under the default policy.`,
      written:
        "Before playback begins, she taps the source locator golden-minute://resume-anchor, waits for a breath, and checks that citation [^gm1] stays silent under the default policy.",
    },
    {
      id: "gm-p4",
      label: "Long sentence",
      policyNote:
        "Long sentence remains a single measured segment so phrase and sentence highlight modes can be compared.",
      sourceLocator: "sample.md#L9",
      spoken:
        "Because the sample moves from a heading into measured paragraphs, then into a quoted instruction, a citation token, a bookmark target, and a final theatre cue, it can expose drift that tiny fixtures usually miss.",
      written:
        "Because the sample moves from a heading into measured paragraphs, then into a quoted instruction, a citation token, a bookmark target, and a final theatre cue, it can expose drift that tiny fixtures usually miss.",
    },
    {
      id: "gm-p5",
      label: "Natural pause",
      policyNote: "Short sentence keeps a deliberate pause boundary for fluency checks.",
      sourceLocator: "sample.md#L11",
      spoken: "Then listen.",
      written: "Then listen.",
    },
    {
      id: "gm-p7",
      label: "Bookmark and theatre cue",
      policyNote: goldenMinuteQuotePolicyNote(settings),
      sourceLocator: "sample.md#L15",
      spoken: `At forty seven seconds, the player seeks ahead, returns to the saved bookmark, and proves that the resumed paragraph still belongs to the same source; the last theatre cue says, ${goldenMinuteQuoteText(
        settings,
        "let the final word land.",
      )}`,
      written:
        'At 47 seconds, the player seeks ahead, returns to the saved bookmark, and proves that the resumed paragraph still belongs to the same source; the last theatre cue says, "let the final word land."',
    },
  ];
}

function goldenMinuteCitationHandling(settings: SpeechPolicySettings): string {
  if (settings.citationMode === "skip") {
    return "Citation marker [^gm1] and footnote body are skipped in the main spoken pass.";
  }
  if (settings.citationMode === "inline") {
    return "Citation marker [^gm1] is read inline and the local citation note can be spoken in context.";
  }
  if (settings.citationMode === "endnote") {
    return "Citation marker [^gm1] is deferred to end notes after the golden-minute passage.";
  }
  return "Citation marker [^gm1] stays silent in the main pass and remains available on demand.";
}

function goldenMinuteCitationText(settings: SpeechPolicySettings): string {
  if (settings.citationMode === "inline") {
    return "citation g m one";
  }
  if (settings.citationMode === "endnote") {
    return "citation, moved to end notes,";
  }
  if (settings.citationMode === "skip") {
    return "the citation";
  }
  return "citation";
}

function goldenMinuteCitationPolicyNote(settings: SpeechPolicySettings): string {
  if (settings.citationMode === "inline") {
    return "Inline citation mode makes [^gm1] audible before generation.";
  }
  if (settings.citationMode === "endnote") {
    return "Endnote citation mode keeps the paragraph flow clean and moves detail after the passage.";
  }
  if (settings.citationMode === "skip") {
    return "Citation marker and detail are intentionally skipped.";
  }
  return "On-demand citation mode keeps [^gm1] visible but silent until requested.";
}

function goldenMinuteQuoteText(settings: SpeechPolicySettings, quote: string): string {
  if (settings.quoteMode === "skip") {
    return "the quoted phrase is skipped.";
  }
  if (settings.quoteMode === "summarise") {
    return "a quoted instruction is summarised.";
  }
  return `quote, ${quote.replaceAll('"', "")}, end quote.`;
}

function goldenMinuteQuotePolicyNote(settings: SpeechPolicySettings): string {
  if (settings.quoteMode === "skip") {
    return "Quote policy skips the phrase while preserving surrounding narration.";
  }
  if (settings.quoteMode === "summarise") {
    return "Quote policy summarises the phrase instead of reading every word.";
  }
  return "Quote policy reads quote boundaries so the spoken and highlighted text stay inspectable.";
}

function goldenMinuteHighlightGranularity(settings: SpeechPolicySettings): string {
  if (settings.citationMode === "inline" && settings.footnoteMode === "inline") {
    return "sentence";
  }
  if (settings.codeMode === "syntaxAware" || settings.mathMode === "literalsafe") {
    return "word";
  }
  if (settings.citationMode === "endnote") {
    return "phrase";
  }
  if (settings.imageMode === "describeLong") {
    return "paragraph/block";
  }
  return "phrase";
}

function goldenMinuteSyncStrictness(settings: SpeechPolicySettings): string {
  if (goldenMinuteHighlightGranularity(settings) === "word") {
    return "exact word when available";
  }
  if (goldenMinuteHighlightGranularity(settings) === "sentence") {
    return "sentence confidence fallback";
  }
  return "phrase fallback";
}

function goldenMinutePauseChanges(settings: SpeechPolicySettings): string[] {
  const pauses = [
    "Paragraph transitions keep the 750 ms golden-minute baseline.",
    "The phrase 'waits for a breath' keeps a 900 ms natural pause.",
    "Then listen. keeps a 650 ms short-sentence pause before segment handoff.",
  ];
  if (settings.citationMode === "inline") {
    pauses.push("Inline citation adds a short citation-marker pause before the phrase continues.");
  } else if (settings.citationMode === "endnote") {
    pauses.push("Endnote citation moves citation detail to the end-note pause after the passage.");
  } else {
    pauses.push("Silent citation handling avoids adding a spoken citation pause.");
  }
  if (settings.quoteMode === "summarise") {
    pauses.push("Summarised quotes shorten quote-boundary pauses.");
  } else if (settings.quoteMode === "skip") {
    pauses.push("Skipped quotes remove quote-boundary pauses from the speech plan.");
  } else {
    pauses.push("Spoken quotes keep quote-boundary pauses for review.");
  }
  return pauses;
}

function goldenMinutePolicyDifferences(
  left: GoldenMinutePolicyPreview,
  right: GoldenMinutePolicyPreview,
): string[] {
  const differences: string[] = [];
  if (left.citationHandling !== right.citationHandling) {
    differences.push(
      `${left.profileLabel} citation handling differs from ${right.profileLabel}: ${left.citationHandling} / ${right.citationHandling}`,
    );
  }
  if (left.highlightGranularity !== right.highlightGranularity) {
    differences.push(
      `Highlight granularity changes from ${left.highlightGranularity} to ${right.highlightGranularity}.`,
    );
  }
  const changedSegments = left.segments.filter((segment, index) => {
    const other = right.segments.at(index);
    return other?.spoken !== segment.spoken;
  });
  if (changedSegments.length > 0) {
    differences.push(
      `Spoken text changes in ${changedSegments.map((segment) => segment.id).join(", ")}.`,
    );
  }
  const leftPauseTail = left.pauseChanges.at(-1);
  const rightPauseTail = right.pauseChanges.at(-1);
  if (leftPauseTail && rightPauseTail && leftPauseTail !== rightPauseTail) {
    differences.push(`Pause model changes: ${leftPauseTail} / ${rightPauseTail}`);
  }
  return differences.length > 0 ? differences : ["No golden-minute policy differences detected."];
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
