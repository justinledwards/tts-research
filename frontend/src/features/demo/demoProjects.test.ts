import { describe, expect, it } from "vitest";
import { demoProjectById, demoProjects, demoProjectSummary } from "./demoProjects";
import { demoTourSteps } from "./demoTour";
import { demoVoices } from "./demoVoices";

describe("demo mode fixtures", () => {
  it("covers the first-run product surfaces without external providers", () => {
    expect(demoProjects.map((project) => project.kind)).toEqual([
      "book",
      "website",
      "document",
      "teleprompt",
      "voiceComparison",
    ]);
    expect([...new Set(demoVoices.map((voice) => voice.provider))]).toEqual(["mock"]);
  });

  it("keeps demo projects lookupable and reviewable", () => {
    const project = demoProjectById("technical-document");
    expect(project?.sampleText).toContain("degraded states");
    expect(project ? demoProjectSummary(project) : "").toContain("Document");
  });

  it("maps the tour to real workspace stages before Cinema", () => {
    expect(demoTourSteps.map((step) => step.label)).toEqual([
      "Intake",
      "Review",
      "Preview",
      "Teleprompt",
      "Cinema",
    ]);
    expect(demoTourSteps.filter((step) => step.stage).map((step) => step.stage)).toEqual([
      "intake",
      "review",
      "preview",
      "teleprompt",
    ]);
  });
});
