import { describe, expect, it } from "vitest";
import {
  buildIntakeSourceCandidate,
  resolveDetectedIntakeDefaults,
  resolveIntakeReadiness,
  shouldRouteFileAsBook,
  shouldRouteUrlAsBook,
} from "./intakeWizardModel";
import type { IntakeSourceDetection } from "./sourceTypeModel";

describe("intake wizard model", () => {
  it("blocks missing source inputs with a recovery step", () => {
    const candidate = buildIntakeSourceCandidate({
      detected: detection({ confidence: "low" }),
      draftText: "",
      existingSourceKey: "",
      selectedFile: null,
      sourceChoice: "file",
      sourceType: "document",
      sourceTypeWasEdited: false,
      sourceUrl: "",
    });

    expect(
      resolveIntakeReadiness({
        backendError: null,
        candidate,
        draftText: "",
        intentId: "document",
        isWorking: false,
        selectedFile: null,
        sourceUrl: "",
      }),
    ).toMatchObject({
      actionLabel: "Choose a file",
      recoveryStep: "source",
      status: "blocked",
    });
  });

  it("uses URL safety classification before import", () => {
    const candidate = buildIntakeSourceCandidate({
      detected: detection({ confidence: "medium", sourceType: "webpage" }),
      draftText: "",
      existingSourceKey: "",
      selectedFile: null,
      sourceChoice: "url",
      sourceType: "webpage",
      sourceTypeWasEdited: false,
      sourceUrl: "ftp://example.test/source",
    });

    expect(candidate.urlSafety?.class).toBe("unsupported");
    expect(
      resolveIntakeReadiness({
        backendError: null,
        candidate,
        draftText: "",
        intentId: "webpage",
        isWorking: false,
        selectedFile: null,
        sourceUrl: "ftp://example.test/source",
      }),
    ).toMatchObject({
      actionLabel: "Enter a public URL",
      status: "blocked",
      title: "Unsupported scheme",
    });
  });

  it("keeps existing source reuse ready when the selected source is reusable", () => {
    const candidate = buildIntakeSourceCandidate({
      detected: detection({ confidence: "high", sourceType: "book" }),
      draftText: "",
      existingSourceKey: "book:alpha",
      selectedExistingSource: {
        detail: "Book import · Default scope · 12,000 words",
        key: "book:alpha",
        label: "Book · Alpha",
        type: "book",
      },
      selectedFile: null,
      sourceChoice: "existing",
      sourceType: "book",
      sourceTypeWasEdited: false,
      sourceUrl: "",
    });

    expect(
      resolveIntakeReadiness({
        backendError: null,
        candidate,
        draftText: "",
        intentId: "book",
        isWorking: false,
        selectedExistingSource: {
          detail: "Book import · Default scope · 12,000 words",
          key: "book:alpha",
          label: "Book · Alpha",
          type: "book",
        },
        selectedFile: null,
        sourceUrl: "",
      }),
    ).toMatchObject({
      status: "ready",
      title: "Ready for review",
    });
  });

  it("requires correction for low-confidence detection until the source type is edited", () => {
    const uncertain = buildIntakeSourceCandidate({
      detected: detection({ confidence: "low" }),
      draftText: "hello",
      existingSourceKey: "",
      selectedFile: null,
      sourceChoice: "pastedText",
      sourceType: "draft",
      sourceTypeWasEdited: false,
      sourceUrl: "",
    });
    const corrected = buildIntakeSourceCandidate({
      detected: detection({ confidence: "low" }),
      draftText: "hello",
      existingSourceKey: "",
      selectedFile: null,
      sourceChoice: "pastedText",
      sourceType: "draft",
      sourceTypeWasEdited: true,
      sourceUrl: "",
    });

    expect(uncertain.confidencePrompt).toContain("Detection is uncertain");
    expect(corrected.confidencePrompt).toBeNull();
  });

  it("syncs detected defaults until the user overrides them", () => {
    const detected = detection({ language: "sv-SE", sourceType: "draft" });

    expect(
      resolveDetectedIntakeDefaults({
        currentLanguage: "en-US",
        currentSourceType: "document",
        detectedLanguage: detected.language,
        detectedSourceType: detected.sourceType,
        languageWasEdited: false,
        sourceTypeWasEdited: false,
      }),
    ).toEqual({ language: "sv-SE", sourceType: "draft" });
    expect(
      resolveDetectedIntakeDefaults({
        currentLanguage: "en-US",
        currentSourceType: "document",
        detectedLanguage: detected.language,
        detectedSourceType: detected.sourceType,
        languageWasEdited: true,
        sourceTypeWasEdited: true,
      }),
    ).toEqual({ language: "en-US", sourceType: "document" });
  });

  it("routes book-capable sources to book import unless corrected", () => {
    expect(shouldRouteFileAsBook({ name: "manual.pdf", size: 1200 }, "document", false)).toBe(true);
    expect(shouldRouteFileAsBook({ name: "manual.pdf", size: 1200 }, "document", true)).toBe(false);
    expect(shouldRouteUrlAsBook("https://example.test/book.epub", "webpage", false)).toBe(true);
    expect(shouldRouteUrlAsBook("https://example.test/book.epub", "webpage", true)).toBe(false);
  });
});

function detection(overrides: Partial<IntakeSourceDetection> = {}): IntakeSourceDetection {
  return {
    confidence: "high",
    language: "en-US",
    reason: "Test detection",
    sourceMode: "fileUrl",
    sourceType: "document",
    structureLabel: "Headings and blocks",
    title: "Detected source",
    ...overrides,
  };
}
