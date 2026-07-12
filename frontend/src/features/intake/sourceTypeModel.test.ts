import { describe, expect, it } from "vitest";
import {
  defaultSourceTypeForIntent,
  detectIntakeSource,
  extensionForName,
  preparationTargetForSourceType,
  sourceModeForType,
} from "./sourceTypeModel";

describe("intake source type model", () => {
  it("detects source shape from the chosen intake path", () => {
    expect(
      detectIntakeSource({
        fileName: "architecture.epub",
        intentId: "book",
        sourceChoice: "file",
        templateSourceType: "book",
      }),
    ).toMatchObject({
      confidence: "high",
      sourceMode: "book",
      sourceType: "book",
      structureLabel: "Spine, chapters, and landmarks",
      title: "architecture",
    });

    expect(
      detectIntakeSource({
        intentId: "webpage",
        sourceChoice: "url",
        url: "https://example.test/guides/speech-policy",
      }),
    ).toMatchObject({
      sourceMode: "fileUrl",
      sourceType: "webpage",
      title: "speech policy",
    });
  });

  it("keeps pasted text and language detection in the draft lane", () => {
    expect(
      detectIntakeSource({
        intentId: "technicalReview",
        pastedText: "Rubrik\n\nDet här stycket kontrollerar svenskt språk.",
        sourceChoice: "pastedText",
      }),
    ).toMatchObject({
      language: "sv-SE",
      sourceMode: "text",
      sourceType: "draft",
      structureLabel: "2 paragraphs",
      title: "Rubrik",
    });
  });

  it("keeps adapter routing separate from user-facing source type", () => {
    expect(defaultSourceTypeForIntent("voiceClone")).toBe("voice-clone");
    expect(sourceModeForType("draft")).toBe("text");
    expect(sourceModeForType("document")).toBe("fileUrl");
    expect(preparationTargetForSourceType("book")).toBe("book");
    expect(preparationTargetForSourceType("document")).toBe("prepared");
    expect(extensionForName("https://example.test/source.pdf?download=1")).toBe("pdf");
  });
});
