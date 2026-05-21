import { describe, expect, it } from "vitest";
import {
  INTAKE_PROJECT_TEMPLATES,
  defaultTemplateForIntent,
  intakeTemplateById,
} from "./projectTemplates";

describe("intake project templates", () => {
  it("covers every guided intake intent with a default template", () => {
    expect(defaultTemplateForIntent("book").id).toBe("technical-book");
    expect(defaultTemplateForIntent("webpage").id).toBe("blog-article");
    expect(defaultTemplateForIntent("technicalReview").id).toBe("enterprise-summary");
    expect(defaultTemplateForIntent("voiceClone").id).toBe("technical-book");
  });

  it("ships the requested template presets with policy defaults", () => {
    expect(INTAKE_PROJECT_TEMPLATES.map((template) => template.label)).toEqual([
      "Technical book",
      "Blog/article",
      "Education reading",
      "Accessibility full-content reading",
      "Enterprise summary/prose-first",
      "Language learning",
    ]);
    expect(intakeTemplateById("language-learning")).toMatchObject({
      sourceChoice: "pastedText",
      speechPolicyProfile: "LanguageLearning",
      voiceStrategy: "language",
    });
  });
});
