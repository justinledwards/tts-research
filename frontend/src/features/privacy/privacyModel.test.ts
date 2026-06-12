import { describe, expect, it } from "vitest";
import {
  UI_MEMORY_EXPORT_OMITTED_ITEMS,
  classifyUrlIntake,
  projectExportPrivacyBoundary,
  providerRuntimePrivacyBoundary,
  temporarySourcePrivacyBoundary,
} from "./privacyModel";
import { completeProviderCapabilities } from "../provider-capabilities";

describe("privacy model", () => {
  it("classifies URL intake boundaries before backend fetch", () => {
    expect(classifyUrlIntake("https://example.com/article")).toMatchObject({
      allowedByDefault: true,
      class: "external",
      leavesMachine: true,
    });
    expect(classifyUrlIntake("https://localhost:5173/article")).toMatchObject({
      allowedByDefault: false,
      class: "localMachine",
      leavesMachine: false,
    });
    expect(classifyUrlIntake("https://192.168.1.25/article")).toMatchObject({
      allowedByDefault: false,
      class: "privateNetwork",
      leavesMachine: true,
    });
    expect(classifyUrlIntake("file:///tmp/source.html")).toMatchObject({
      allowedByDefault: false,
      class: "unsupported",
    });
  });

  it("keeps UI memory export exclusions centralized", () => {
    expect(UI_MEMORY_EXPORT_OMITTED_ITEMS).toContain("generated audio");
    expect(UI_MEMORY_EXPORT_OMITTED_ITEMS).toContain("model paths");
    expect(UI_MEMORY_EXPORT_OMITTED_ITEMS).toContain("provider secrets");
    expect(UI_MEMORY_EXPORT_OMITTED_ITEMS).toContain("private project content");
  });

  it("describes provider-backed runtime as a warning boundary", () => {
    const boundary = providerRuntimePrivacyBoundary({
      capabilities: completeProviderCapabilities({ localOnly: false, mockTts: false, tts: true }),
      engine: null,
      missing: [],
      providerId: "cloud",
      providerLabel: "Cloud Provider",
    });

    expect(boundary.status).toBe("Provider-backed");
    expect(boundary.tone).toBe("warning");
  });

  it("documents project bundle included and excluded content", () => {
    const boundary = projectExportPrivacyBoundary();

    expect(boundary.included).toContain("generated audio and waveform artifacts when present");
    expect(boundary.excluded).toContain("provider secrets and credential files");
    expect(boundary.excluded).toContain("model cache directories and absolute model paths");
  });

  it("documents the temporary source privacy boundary", () => {
    const boundary = temporarySourcePrivacyBoundary();

    expect(boundary.status).toBe("Session-owned");
    expect(boundary.summary).toContain("session-owned content");
    expect(boundary.facts.map((fact) => fact.value).join(" ")).toContain(
      "Saved to this temporary session",
    );
    expect(boundary.facts.map((fact) => fact.value).join(" ")).toContain(
      "sent to provider for generation",
    );
    expect(boundary.excluded).toContain(
      "project source pins unless the temporary source is promoted",
    );
  });
});
