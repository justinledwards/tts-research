import { describe, expect, it } from "vitest";
import { TEMPORARY_SOURCE_COPY } from "./temporary-source-copy";

describe("temporary source copy", () => {
  it("publishes the trust vocabulary for temporary source persistence", () => {
    expect(Object.values(TEMPORARY_SOURCE_COPY.terms)).toEqual(
      expect.arrayContaining([
        "Temporary source",
        "Keep in project",
        "Discard temporary source",
        "Expires after inactivity",
        "Session-only review note",
        "Session voice override",
        "Project source pin",
        "Generated temporary audio",
        "Promote with audio",
        "Promote source only",
        "Clear expired temporary work",
      ]),
    );
  });

  it("keeps destructive and durable confirmations explicit about scope", () => {
    expect(TEMPORARY_SOURCE_COPY.confirmation.discard).toContain("Project sources are unchanged");
    expect(TEMPORARY_SOURCE_COPY.confirmation.discard).toContain("generated temporary audio");
    expect(TEMPORARY_SOURCE_COPY.promotion.subtitle).toContain("durable project history");
    expect(TEMPORARY_SOURCE_COPY.privacy.localFirst).toContain("Provider-backed generation");
  });

  it("avoids ambiguous bare lifecycle language in temporary-source action copy", () => {
    const copy = JSON.stringify({
      actions: TEMPORARY_SOURCE_COPY.actions,
      confirmation: TEMPORARY_SOURCE_COPY.confirmation,
      empty: TEMPORARY_SOURCE_COPY.empty,
      launcher: TEMPORARY_SOURCE_COPY.launcher,
      promotion: TEMPORARY_SOURCE_COPY.promotion,
    });

    expect(copy).not.toMatch(/\bSave\b/);
    expect(copy).not.toMatch(/\bSaved\b/);
    expect(copy).not.toMatch(/"Import"/);
    expect(copy).not.toMatch(/"Discard"/);
    expect(copy).not.toMatch(/"History"/);
  });
});
