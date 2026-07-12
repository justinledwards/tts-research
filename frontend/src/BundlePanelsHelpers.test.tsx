import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BundlePreviewCard, ExportReviewSummary } from "./BundlePanelsHelpers";
import type { ProjectBundlePreview } from "./types";

describe("BundlePanelsHelpers", () => {
  it("renders export generated-audio policy in the manifest review", () => {
    const markup = renderToStaticMarkup(
      <ExportReviewSummary
        summary={{
          chapterCount: 2,
          contents: [],
          createdAt: "2026-06-04T10:00:00.000Z",
          durationMs: 120_000,
          estimatedBytes: 42_000,
          fileName: "portable.voice-studio.zip",
          generatedAudio: 0,
          generatedAudioIncluded: false,
          omittedGeneratedAudio: 2,
          omittedGeneratedBytes: 32_000,
          profileCount: 1,
          projectId: "project-1",
          projectName: "Portable Review",
          version: "voice-studio.bundle.v1",
        }}
      />,
    );

    expect(markup).toContain("Audio policy");
    expect(markup).toContain("Excluded");
  });

  it("renders import validation, dependencies, conflicts, and exclusions", () => {
    const markup = renderToStaticMarkup(<BundlePreviewCard preview={preview()} />);

    expect(markup).toContain("Validation");
    expect(markup).toContain("Hash mismatch");
    expect(markup).toContain("Dependencies");
    expect(markup).toContain("Kokoro");
    expect(markup).toContain("Conflicts");
    expect(markup).toContain("Project name exists");
    expect(markup).toContain("Excluded from bundle");
    expect(markup).toContain("Provider secrets");
  });
});

function preview(): ProjectBundlePreview {
  return {
    availableImportModes: ["copy", "merge", "replace"],
    chapterCount: 1,
    compatibility: ["Manifest compatible"],
    conflicts: [
      {
        blocking: false,
        detail: "A local project with this name exists.",
        key: "project-name",
        label: "Project name exists",
        resolutions: ["copy", "merge", "replace"],
        severity: "warning",
      },
    ],
    dependencies: [
      {
        detail: "Kokoro is ready.",
        key: "tts:kokoro",
        label: "Kokoro",
        status: "ready",
      },
    ],
    estimatedBytes: 12_000,
    excluded: [
      {
        detail: "Credential files stay local.",
        included: false,
        key: "providerSecrets",
        label: "Provider secrets",
        required: false,
      },
    ],
    generatedAudio: 0,
    profileCount: 1,
    projectName: "Portable Review",
    quality: {
      generatedDurationMs: 120_000,
      overallScore: 92,
      warningCount: 1,
    },
    recommendedMode: "copy",
    valid: false,
    validation: [
      {
        blocking: true,
        detail: "audio.wav did not match its manifest checksum.",
        key: "hash",
        label: "Hash mismatch",
        status: "error",
      },
    ],
    version: "voice-studio.bundle.v1",
    warnings: ["Generated audio is not included."],
  };
}
