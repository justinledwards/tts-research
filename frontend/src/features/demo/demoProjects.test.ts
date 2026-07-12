import { describe, expect, it } from "vitest";
import { demoProjectById, demoProjects, demoProjectSummary } from "./demoProjects";
import { demoSources } from "./demoSources";
import { demoTourSteps } from "./demoTour";
import { demoVoices } from "./demoVoices";

describe("demo mode fixtures", () => {
  it("covers the first-run product surfaces without external providers", () => {
    expect(demoProjects.map((project) => project.kind)).toEqual([
      "education",
      "technicalMarkdown",
      "websiteArticle",
      "epubChapter",
      "telepromptScript",
      "voiceComparison",
    ]);
    expect(demoProjects).toHaveLength(6);
    expect(demoSources.map((source) => source.id)).toEqual(
      demoProjects.map((project) => project.id),
    );
    expect([...new Set(demoVoices.map((voice) => voice.provider))]).toEqual(["mock"]);
  });

  it("keeps demo projects lookupable and reviewable", () => {
    const project = demoProjectById("technical-markdown-document");
    expect(project?.sampleText).toContain("pnpm validate:local");
    expect(project ? demoProjectSummary(project) : "").toContain("Technical Markdown");
  });

  it("maps the tour to real workspace stages before Cinema", () => {
    expect(demoTourSteps.map((step) => step.label)).toEqual([
      "Intake",
      "Review",
      "Preview",
      "Teleprompt",
      "Theatre",
      "Create audio",
      "Cinema",
    ]);
    expect(demoTourSteps.filter((step) => step.stage).map((step) => step.stage)).toEqual([
      "intake",
      "review",
      "preview",
      "teleprompt",
      "theatre",
    ]);
    expect(demoTourSteps.filter((step) => !step.stage).map((step) => step.action)).toEqual([
      "createAudio",
      "openCinema",
    ]);
  });
});
