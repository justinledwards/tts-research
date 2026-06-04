import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevisionPanel } from "./RevisionPanel";
import type { RevisionHistoryEntry } from "./revisionHistory";
import type { RevisionBlock, RevisionStatus } from "./revisionFilters";
import type { Dispatch, ReactNode, SetStateAction } from "react";

const noop = () => {
  // Test callback.
};

const setStatusNoop = noop as Dispatch<SetStateAction<Record<string, RevisionStatus>>>;
const setTextNoop = noop as Dispatch<SetStateAction<Record<string, string>>>;
const setHistoryNoop = noop as Dispatch<SetStateAction<RevisionHistoryEntry[]>>;

describe("RevisionPanel", () => {
  it("renders health, grouped repair queue, selected editor, and pronunciation repair rows", () => {
    const markup = renderRevisionPanel();

    expect(markup).toContain("Guided review");
    expect(markup).toContain("Review warnings");
    expect(markup).toContain("Audio blockers");
    expect(markup).toContain("Pronunciation repair");
    expect(markup).toContain("Current repair");
    expect(markup).toContain("Source text");
    expect(markup).toContain("Spoken form");
    expect(markup).toContain("Repair Notes");
    expect(markup).toContain("Pronunciation Repair");
    expect(markup).toContain("Apply repair");
    expect(markup).toContain('data-testid="ui-action-revision-batch-approve-clean"');
    expect(markup).toContain("More batch actions");
    expect(markup).toContain("Approve clean blocks (1)");
    expect(markup).toContain("OpenAI");
    expect(markup).toContain("Open A I");
    expect(markup).toContain("Preview Speech");
    expect(markup.match(/workspace-stage-action-previewSpeech/g)?.length).toBe(1);
    expect(markup).not.toContain("Selected Block Editor");
  });

  it("embeds available review playback inside the selected repair surface", () => {
    const markup = renderRevisionPanel(
      "overview",
      "pronunciation",
      <div data-testid="mock-review-playback">Review Playback</div>,
    );

    expect(markup).toContain('data-testid="revision-selected-playback"');
    expect(markup).toContain('data-testid="mock-review-playback"');
    expect(markup.indexOf('data-testid="revision-selected-block-editor"')).toBeLessThan(
      markup.indexOf('data-testid="revision-selected-playback"'),
    );
  });

  it("renders review action shortcuts for discoverability", () => {
    const markup = renderRevisionPanel();

    expect(markup).toContain('data-shortcut-command-id="review.approve"');
    expect(markup).toContain('aria-keyshortcuts="a"');
    expect(markup).toContain('data-shortcut-command-id="review.edit"');
    expect(markup).toContain('data-shortcut-command-id="review.retry"');
    expect(markup).toContain('data-shortcut-command-id="review.regenerate"');
    expect(markup).toContain('data-shortcut-command-id="review.nextIssue"');
    expect(markup).toContain('aria-keyshortcuts="n"');
  });

  it("keeps diagnostics and history available as secondary selected-block details", () => {
    expect(renderRevisionPanel("diagnostics")).toContain("Validation Transcript");
    expect(renderRevisionPanel("history")).toContain("Inline edit saved");
  });

  it("explains skipped content in the selected-block repair notes", () => {
    const markup = renderRevisionPanel("overview", "skipped");

    expect(markup).toContain("Skipped content");
    expect(markup).toContain("Footnote skipped for narration.");
  });
});

function renderRevisionPanel(
  initialTabId: "diagnostics" | "history" | "overview" = "overview",
  activeBlockId = "pronunciation",
  playbackToolbar?: ReactNode,
) {
  return renderToStaticMarkup(
    <RevisionPanel
      activeBlockId={activeBlockId}
      baseBlocks={baseBlocks}
      blocks={blocks}
      historyEntries={historyEntries}
      initialTabId={initialTabId}
      playbackToolbar={playbackToolbar}
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
  block({
    id: "clean",
    index: 4,
    label: "Clean",
    status: "waiting",
  }),
  block({
    id: "skipped",
    index: 5,
    label: "Footnote",
    policyNote: "Footnote skipped for narration.",
    policyNoteType: "skipped",
    speakMode: "skip",
    status: "skipped",
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
