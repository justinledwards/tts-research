import { describe, expect, it } from "vitest";
import type { TemporarySourceFailureCode } from "../types";
import { TEMPORARY_SOURCE_COPY, temporarySourceFailureCopy } from "./temporary-source-copy";

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
    expect(TEMPORARY_SOURCE_COPY.confirmation.discard).toBe(
      "Discard temporary source now? This deletes temporary source text, generated temporary audio, timing, bookmarks, progress, review notes, and diagnostics from this session. Project sources are unchanged.",
    );
    expect(TEMPORARY_SOURCE_COPY.confirmation.removeGeneratedAudio).toBe(
      "Remove generated temporary audio for this session?",
    );
    expect(TEMPORARY_SOURCE_COPY.empty.noExpired).toBe(
      "No expired temporary sources are ready to clear.",
    );
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

  it("maps every temporary failure code to safe scoped recovery copy", () => {
    const codes: TemporarySourceFailureCode[] = [
      "unsafe_url",
      "fetch_failed",
      "extraction_failed",
      "unsupported_file",
      "file_too_large",
      "metadata_required",
      "source_not_ready",
      "generation_failed",
      "provider_unavailable",
      "alignment_failed",
      "expired",
      "discarded",
      "cleanup_failed",
      "promotion_failed",
    ];

    for (const code of codes) {
      const copy = temporarySourceFailureCopy(code, "Generic project-source recovery failed.");
      expect(copy).toMatch(/temporary source/i);
      expect(copy).not.toContain("project-source");
      expect(copy).not.toContain(["/", "tmp", "/"].join(""));
      expect(copy).not.toContain("Generic project-source recovery");
    }
    expect(temporarySourceFailureCopy("metadata_required")).toBe(
      "This temporary source is not ready for review or audio.",
    );
    expect(temporarySourceFailureCopy("expired")).toBe(
      "Temporary source expired after inactivity. Extend expiry before reopening it.",
    );
    expect(temporarySourceFailureCopy("discarded")).toBe(
      "Temporary source was discarded. Start Quick Listen again to create a new temporary source.",
    );
    expect(temporarySourceFailureCopy("promotion_failed")).toBe(
      "Unable to keep temporary source in the project. No project history was changed.",
    );
  });
});
