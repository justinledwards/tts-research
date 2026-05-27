import { describe, expect, it } from "vitest";
import { BUILT_IN_SPEECH_POLICY_SETTINGS } from "../../speechPolicy";
import { buildGoldenMinutePolicyComparison, buildGoldenMinutePolicyPreview } from "./policyPreview";

describe("golden-minute speech policy preview", () => {
  it("shows citation, pronunciation, pause, and highlight effects for the default profile", () => {
    const preview = buildGoldenMinutePolicyPreview(
      BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise,
      "Enterprise",
    );

    expect(preview.profileLabel).toBe("Enterprise");
    expect(preview.speechPlanSummary).toContain("golden-minute segments");
    expect(preview.citationHandling).toContain("[^gm1]");
    expect(preview.citationHandling).toContain("available on demand");
    expect(preview.highlightPlan).toContain("phrase");
    expect(preview.pronunciationSubstitutions).toContain("Dr. -> Doctor");
    expect(preview.pronunciationSubstitutions).toContain("47 -> forty seven");
    expect(preview.pauseChanges.join(" ")).toContain("waits for a breath");
    expect(preview.segments.find((segment) => segment.id === "gm-p1")?.spoken).toContain(
      "seven oh five",
    );
  });

  it("makes inline citation and highlight changes visible between profiles", () => {
    const enterprise = buildGoldenMinutePolicyPreview(
      BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise,
      "Enterprise",
    );
    const education = buildGoldenMinutePolicyPreview(
      BUILT_IN_SPEECH_POLICY_SETTINGS.Education,
      "Education",
    );
    const comparison = buildGoldenMinutePolicyComparison(enterprise, education);

    expect(education.citationHandling).toContain("read inline");
    expect(education.highlightGranularity).toBe("sentence");
    expect(comparison.differences.join(" ")).toContain("citation handling differs");
    expect(comparison.differences.join(" ")).toContain("Highlight granularity changes");
  });
});
