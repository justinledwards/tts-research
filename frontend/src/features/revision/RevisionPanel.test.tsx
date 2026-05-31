import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevisionPanel } from "./RevisionPanel";
import type { RevisionHistoryEntry } from "./revisionHistory";
import type { RevisionBlock, RevisionStatus } from "./revisionFilters";
import type { Dispatch, SetStateAction } from "react";

const noop = () => {
  // Test callback.
};

const setStatusNoop = noop as Dispatch<SetStateAction<Record<string, RevisionStatus>>>;
const setTextNoop = noop as Dispatch<SetStateAction<Record<string, string>>>;
const setHistoryNoop = noop as Dispatch<SetStateAction<RevisionHistoryEntry[]>>;

describe("RevisionPanel", () => {
  it("renders health, grouped repair queue, selected editor, and pronunciation repair rows", () => {
    const markup = renderRevisionPanel();

    expect(markup).toContain("Review health");
    expect(markup).toContain("Audio blockers");
    expect(markup).toContain("Pronunciation repair");
    expect(markup).toContain("Selected Block Editor");
    expect(markup).toContain("Source text");
    expect(markup).toContain("Spoken form");
    expect(markup).toContain("Pronunciation Repair");
    expect(markup).toContain("OpenAI");
    expect(markup).toContain("Open A I");
    expect(markup).toContain("Preview Speech");
  });

  it("renders review action shortcuts for discoverability", () => {
    const markup = renderRevisionPanel();

    expect(markup).toContain('data-shortcut-command-id="review.approve"');
    expect(markup).toContain('aria-keyshortcuts="a"');
    expect(markup).toContain('data-shortcut-command-id="review.edit"');
    expect(markup).toContain('data-shortcut-command-id="review.retry"');
    expect(markup).toContain('data-shortcut-command-id="review.regenerate"');
  });

  it("keeps diagnostics and history available as secondary selected-block details", () => {
    expect(renderRevisionPanel("diagnostics")).toContain("Validation Transcript");
    expect(renderRevisionPanel("history")).toContain("Inline edit saved");
  });
});

function renderRevisionPanel(initialTabId: "diagnostics" | "history" | "overview" = "overview") {
  return renderToStaticMarkup(
    <RevisionPanel
      activeBlockId="pronunciation"
      baseBlocks={baseBlocks}
      blocks={blocks}
      historyEntries={historyEntries}
      initialTabId={initialTabId}
      policyProfileLabel="Accessibility"
      runConfigurationLabel="Checked Master"
      scopeLabel="Chapter 1"
      sourceLabel="Repair sample"
      sourceMeta="4 blocks"
      statusByBlockId={{}}
      validationReason="Validation appears after synthesis."
      validationSimilarity={0}
      validationTranscript="No transcript yet."
      voiceProfileLabel="Default voice"
      onActiveBlockChange={noop}
      onEditedTextByBlockIdChange={setTextNoop}
      onHistoryEntriesChange={setHistoryNoop}
      onPreviewSpeech={noop}
      onStatusByBlockIdChange={setStatusNoop}
    />,
  );
}

const baseBlocks: RevisionBlock[] = [
  block({
    id: "pronunciation",
    index: 1,
    normalisationCount: 1,
    normalisations: [
      {
        endOffset: 4,
        kind: "acronym",
        original: "AI",
        rule: "spell-acronym",
        spoken: "A I",
        startOffset: 0,
      },
    ],
    pronunciationCount: 1,
    pronunciations: [
      {
        endOffset: 6,
        originalText: "OpenAI",
        source: "project",
        spoken: "Open A I",
        startOffset: 0,
        term: "OpenAI",
      },
    ],
    spokenText: "Open A I review queue.",
    text: "OpenAI review queue.",
  }),
  block({
    id: "empty",
    index: 2,
    label: "Empty spoken form",
    spokenText: "",
    status: "waiting",
  }),
];

const blocks: RevisionBlock[] = [
  baseBlocks[0],
  baseBlocks[1],
  block({
    id: "approved",
    index: 3,
    label: "Approved",
    status: "approved",
  }),
];

const historyEntries: RevisionHistoryEntry[] = [
  {
    blockId: "pronunciation",
    blockLabel: "Pronunciation block",
    id: "history-1",
    newSpokenText: "Open A I review queue.",
    policyProfile: "Accessibility",
    previousSpokenText: "OpenAI review queue.",
    runConfiguration: "Checked Master",
    timestamp: "2026-05-31T18:00:00.000Z",
    userAction: "Inline edit saved",
    voiceProfile: "Default voice",
  },
];

function block(overrides: Partial<RevisionBlock>): RevisionBlock {
  return {
    confidence: 0.9,
    estimatedDurationMs: 1200,
    id: "block",
    index: 1,
    kind: "body",
    label: "Pronunciation block",
    needsAttention: false,
    normalisationCount: 0,
    normalisations: [],
    policyNote: "Spoken as prose.",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    pronunciations: [],
    segmentCount: 1,
    sourceSection: "Chapter 1",
    speakMode: "speak",
    spokenText: "Spoken text.",
    status: "waiting",
    text: "Source text.",
    warnings: [],
    ...overrides,
  };
}
