import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntakeWizard, type IntakeWizardProps } from "./IntakeWizard";
import type { PreparedSource, VoiceProfile } from "../../types";

const noop = () => {
  // Test callback.
};

const asyncNoop = async () => {
  // Test callback.
};

describe("IntakeWizard", () => {
  it("renders a simplified file source step", () => {
    const markup = renderIntake({ initialStep: "source" });

    expect(markup).toContain("Where is the source?");
    expect(markup).toContain("Browse File");
    expect(markup).toContain("Advanced import");
    expect(markup).toContain("Choose a file");
  });

  it("surfaces URL validation without opening advanced settings", () => {
    const markup = renderIntake({
      initialSourceChoice: "url",
      initialSourceUrl: "ftp://example.test/source",
      initialStep: "source",
    });

    expect(markup).toContain("Unsupported scheme");
    expect(markup).toContain("Only http and https URL intake is supported.");
  });

  it("renders pasted text as one focused source input", () => {
    const markup = renderIntake({
      initialSourceChoice: "pastedText",
      initialStep: "source",
      text: "Demo title\n\nThis text is ready to review.",
    });

    expect(markup).toContain("Pasted text");
    expect(markup).toContain("Demo title");
    expect(markup).toContain("8 pasted words");
  });

  it("keeps existing source reuse visible in the source step", () => {
    const prepared = makePreparedSource();
    const markup = renderIntake({
      initialStep: "source",
      preparedSources: [prepared],
      selectedPreparedSource: prepared,
      sourceMode: "fileUrl",
    });

    expect(markup).toContain("Existing source");
    expect(markup).toContain("Example article");
    expect(markup).toContain("Full source");
  });

  it("shows metadata as confirmation first", () => {
    const markup = renderIntake({
      initialSourceChoice: "pastedText",
      initialStep: "metadata",
      text: "Detected title\n\nBody copy.",
    });

    expect(markup).toContain("Confirm what we found");
    expect(markup).toContain("Edit Details");
    expect(markup).toContain("Detected title");
    expect(markup).toContain("Confidence");
  });

  it("keeps advanced import settings in a drawer", () => {
    const markup = renderIntake({
      initialAdvancedOpen: true,
      initialSourceChoice: "url",
      initialSourceUrl: "https://example.test/article",
      initialStep: "source",
    });

    expect(markup).toContain("Advanced import settings");
    expect(markup).toContain("Template defaults");
    expect(markup).toContain("Markdown parsing");
    expect(markup).toContain("Adapter route");
    expect(markup).toContain("External fetch");
  });

  it("makes the ready state obvious on the final step", () => {
    const markup = renderIntake({
      initialSourceChoice: "pastedText",
      initialStep: "destination",
      text: "Ready text",
    });

    expect(markup).toContain("Ready for review");
    expect(markup).toContain("Open Review");
    expect(markup).toContain("Open Preview");
  });

  it("shows a blocked final state with a recovery action", () => {
    const markup = renderIntake({ initialStep: "destination" });

    expect(markup).toContain("Choose a file");
    expect(markup).toContain("Pick a PDF");
    expect(markup).toContain("intake-wizard-recover");
  });
});

function renderIntake(overrides: Partial<IntakeWizardProps> = {}): string {
  const props: IntakeWizardProps = {
    bookScopeContent: null,
    bookSourceError: null,
    bookSources: [],
    isImportingBookSource: false,
    isPreparingSource: false,
    preparedSources: [],
    selectedBookScope: null,
    selectedBookSource: null,
    selectedPreparedSource: null,
    selectedVoiceProfileId: "voice-en",
    sourceMode: "text",
    sourcePrepError: null,
    text: "",
    voiceProfileLabel: "Default voice",
    voiceProfiles: [makeVoiceProfile()],
    onImportBookFiles: asyncNoop,
    onInspectBookSource: noop,
    onInspectPreparedSource: noop,
    onOpenBookCinema: noop,
    onOpenPreparedSourceCinema: noop,
    onOpenVoiceCloning: noop,
    onPrepareFile: asyncNoop,
    onPrepareUrl: asyncNoop,
    onScopeChange: noop,
    onSpeechPolicyProfileChange: noop,
    onStageChange: noop,
    onUseBookSource: noop,
    onUseDraftText: noop,
    onUsePreparedSource: asyncNoop,
    onVoiceProfileChange: noop,
    ...overrides,
  };

  return renderToStaticMarkup(<IntakeWizard {...props} />);
}

function makePreparedSource(overrides: Partial<PreparedSource> = {}): PreparedSource {
  return {
    blockCount: 2,
    createdAt: "2026-05-31T18:00:00.000Z",
    id: "prepared-alpha",
    kind: "url",
    projectId: "project-alpha",
    segmentCount: 2,
    sourceName: "https://example.test/article",
    sourceUrl: "https://example.test/article",
    speechPolicyProfile: "Education",
    speechText: "Example article body.",
    status: "ready",
    summary: {
      citationSkipCount: 0,
      headingCount: 1,
      sentenceSegmentCount: 2,
      skippedBlockCount: 0,
      spokenBlockCount: 2,
    },
    title: "Example article",
    updatedAt: "2026-05-31T18:00:00.000Z",
    wordCount: 3,
    ...overrides,
  };
}

function makeVoiceProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    audioFormat: "wav",
    createdAt: "2026-05-31T18:00:00.000Z",
    durationMs: 1000,
    id: "voice-en",
    language: "en-US",
    name: "English voice",
    referenceAudio: "reference.wav",
    referencePath: "reference.wav",
    referenceTrimmed: false,
    sourceBytes: 1000,
    sourceFile: "reference.wav",
    status: "ready",
    updatedAt: "2026-05-31T18:00:00.000Z",
    ...overrides,
  };
}
