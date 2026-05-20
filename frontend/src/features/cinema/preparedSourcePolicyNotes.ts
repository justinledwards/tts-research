import type { NarrationBlock, PreparedSource } from "../../types";

export interface PreparedSourceCinemaPolicyNote {
  explanation: string;
  id: string;
  kind: string;
  mode: string;
  text?: string;
  title: string;
}

const PREPARED_SOURCE_POLICY_NOTE_KINDS = new Set([
  "admonition",
  "artifact_token",
  "caption",
  "citation",
  "code",
  "footnote",
  "list",
  "math",
  "quote",
  "reference",
  "table",
  "unknown_inline_marker",
]);

export function preparedSourceCinemaPolicyNotes(
  source: PreparedSource,
): PreparedSourceCinemaPolicyNote[] {
  const notes: PreparedSourceCinemaPolicyNote[] = [];
  const seen = new Set<string>();
  const addNote = (note: PreparedSourceCinemaPolicyNote) => {
    const key = `${note.kind}:${note.mode}:${note.explanation}:${note.text ?? ""}`;
    if (!seen.has(key)) {
      notes.push(note);
      seen.add(key);
    }
  };

  for (const block of source.blocks ?? []) {
    const explanation = block.speechPolicy.explanation.trim();
    const mode = block.speechPolicy.mode;
    const hasArtifactWarning = (block.warnings ?? []).some((warning) =>
      /artifact|citation|footnote|reference|inline_marker|link_reference/.test(warning),
    );
    const shouldInclude =
      explanation.length > 0 &&
      (mode !== "speak" ||
        block.speakMode !== "speak" ||
        PREPARED_SOURCE_POLICY_NOTE_KINDS.has(block.kind) ||
        hasArtifactWarning ||
        Boolean(block.speechPolicy.elementMode));
    if (shouldInclude) {
      addNote({
        explanation,
        id: `block:${block.id}`,
        kind: block.kind,
        mode,
        text: compactPolicyText(block.spokenText ?? block.text),
        title: block.label ?? formatPolicyKindLabel(block.kind),
      });
    }
    for (const artifact of inlineArtifactsFromBlock(block)) {
      addNote({
        explanation: inlineArtifactPolicyExplanation(artifact.kind),
        id: `artifact:${block.id}:${artifact.startOffset.toString()}`,
        kind: artifact.kind,
        mode: "skip",
        text: artifact.visualLabel,
        title: formatPolicyKindLabel(artifact.kind),
      });
    }
  }

  for (const item of source.skippedItems ?? []) {
    const explanation = item.reason.trim();
    if (!explanation) {
      continue;
    }
    addNote({
      explanation,
      id: `skipped:${item.id}`,
      kind: item.kind,
      mode: "skip",
      text: compactPolicyText(item.text),
      title: formatPolicyKindLabel(item.kind),
    });
  }
  return notes;
}

interface InlineArtifactMetadata {
  kind: string;
  startOffset: number;
  visualLabel: string;
}

function inlineArtifactsFromBlock(block: NarrationBlock): InlineArtifactMetadata[] {
  const raw = block.metadata?.inlineArtifacts;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Record<string, unknown>;
    const kind = typeof candidate.kind === "string" ? candidate.kind : "";
    const visualLabel = typeof candidate.visualLabel === "string" ? candidate.visualLabel : "";
    const startOffset =
      typeof candidate.startOffset === "number" ? candidate.startOffset : block.startOffset;
    if (!kind || !visualLabel) {
      return [];
    }
    return [{ kind, startOffset, visualLabel }];
  });
}

function inlineArtifactPolicyExplanation(kind: string): string {
  switch (kind) {
    case "citation": {
      return "Raw citation markup is converted to a citation chip and omitted from generated speech.";
    }
    case "footnote": {
      return "Footnote markers are separated from prose so the active speech profile can inline, defer, or skip them.";
    }
    case "reference": {
      return "Reference markers and links stay visually discoverable without being read as ordinary prose.";
    }
    case "artifact_token": {
      return "Raw artifact locator tokens are hidden from generated speech and shown as compact visual tokens.";
    }
    case "unknown_inline_marker": {
      return "Bracketed metadata is kept visible as a marker instead of being read as prose.";
    }
    default: {
      return "Inline document markup is separated from prose for visual and speech rendering.";
    }
  }
}

function compactPolicyText(value: string | undefined): string | undefined {
  const clean = value?.trim().replaceAll(/\s+/g, " ");
  if (!clean) {
    return undefined;
  }
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

function formatPolicyKindLabel(kind: string): string {
  return kind
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
