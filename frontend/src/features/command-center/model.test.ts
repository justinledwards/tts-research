import { describe, expect, it } from "vitest";
import type { TemporarySourceSession, VoiceJob, VoiceProject } from "../../types";
import {
  COMMAND_CENTER_ROUTE_IDS,
  COMMAND_CENTER_ROUTES,
  commandCenterGeneratedAudioState,
  filterTemporaryWorkSessions,
  sortCommandCenterProjects,
  temporarySessionAudioReadiness,
  visibleCommandCenterJobs,
  visibleTemporaryCommandCenterJobs,
} from "./model";

describe("Command Center model", () => {
  it("keeps the typed route contract explicit", () => {
    expect(COMMAND_CENTER_ROUTE_IDS).toEqual([
      "overview",
      "projects",
      "temporary",
      "assets",
      "activity",
      "importsExports",
      "reports",
    ]);
    expect(COMMAND_CENTER_ROUTES.map((route) => route.label)).toEqual([
      "Overview",
      "Projects",
      "Temporary Work",
      "Assets",
      "Activity",
      "Import/Export",
      "Reports",
    ]);
  });

  it("sorts the active project first, then recently updated projects", () => {
    const projects = [
      project({ id: "later", name: "Later", updatedAt: "2026-06-03T12:00:00Z" }),
      project({ id: "active", name: "Active", updatedAt: "2026-05-01T12:00:00Z" }),
      project({ id: "middle", name: "Middle", updatedAt: "2026-06-02T12:00:00Z" }),
    ];

    expect(sortCommandCenterProjects(projects, "active").map((item) => item.id)).toEqual([
      "active",
      "later",
      "middle",
    ]);
  });

  it("keeps visible jobs scoped, unique, and newest first", () => {
    const active = job({ id: "active", projectId: "project-1", updatedAt: "2026-06-03T12:00:00Z" });
    const older = job({ id: "older", projectId: "project-1", updatedAt: "2026-06-01T12:00:00Z" });
    const other = job({ id: "other", projectId: "project-2", updatedAt: "2026-06-04T12:00:00Z" });

    expect(
      visibleCommandCenterJobs({
        activeProjectId: "project-1",
        job: active,
        projectJobs: [older, active, other],
      }).map((item) => item.id),
    ).toEqual(["active", "older"]);
  });

  it("keeps temporary jobs discoverable outside the active project scope", () => {
    const temporary = job({
      id: "temp-job",
      projectId: "",
      temporarySourceId: "temp-1",
      updatedAt: "2026-06-04T12:00:00Z",
    });
    const active = job({ id: "active", projectId: "project-1", updatedAt: "2026-06-03T12:00:00Z" });

    expect(visibleTemporaryCommandCenterJobs({ job: temporary, projectJobs: [active] })).toEqual([
      temporary,
    ]);
  });

  it("filters temporary shelf sessions by lifecycle and generated audio", () => {
    const active = temporarySession({
      id: "active",
      lastAccessedAt: "2026-06-12T10:00:00Z",
      status: "previewable",
    });
    const failed = temporarySession({
      id: "failed",
      lastAccessedAt: "2026-06-12T10:01:00Z",
      status: "failed",
    });
    const expired = temporarySession({ id: "expired", status: "expired" });
    const promoted = temporarySession({
      id: "promoted",
      promotionStatus: "promoted",
      status: "promoted",
    });
    const audio = temporarySession({
      id: "audio",
      artifacts: [
        {
          createdAt: "2026-06-12T10:00:00Z",
          id: "a1",
          kind: "generatedAudio",
          scope: "temporary",
        },
      ],
      lastAccessedAt: "2026-06-12T10:02:00Z",
    });

    const sessions = [active, failed, expired, promoted, audio];
    expect(filterTemporaryWorkSessions(sessions, "active").map((item) => item.id)).toEqual([
      "audio",
      "failed",
      "active",
    ]);
    expect(filterTemporaryWorkSessions(sessions, "generatedAudio").map((item) => item.id)).toEqual([
      "audio",
    ]);
    expect(filterTemporaryWorkSessions(sessions, "expired").map((item) => item.id)).toEqual([
      "expired",
    ]);
  });

  it("summarizes temporary audio readiness from jobs before artifacts", () => {
    const session = temporarySession({ id: "temp-1" });

    expect(
      temporarySessionAudioReadiness(session, [
        job({ status: "synthesizing", temporarySourceId: "temp-1" }),
      ]),
    ).toBe("Generating");
    expect(
      temporarySessionAudioReadiness(session, [
        job({ status: "completed", temporarySourceId: "temp-1" }),
      ]),
    ).toBe("Ready");
  });

  it("summarizes generated audio state without playback controls", () => {
    expect(commandCenterGeneratedAudioState([])).toBe("No audio");
    expect(commandCenterGeneratedAudioState([job({ status: "synthesizing" })])).toBe("Working");
    expect(commandCenterGeneratedAudioState([job({ status: "failed" })])).toBe("Needs attention");
    expect(commandCenterGeneratedAudioState([job({ status: "completed" })])).toBe("1 ready");
  });
});

function project(overrides: Partial<VoiceProject>): VoiceProject {
  return {
    createdAt: "2026-05-31T20:00:00Z",
    id: "project",
    name: "Project",
    speechPolicyProfile: "general",
    updatedAt: "2026-05-31T21:00:00Z",
    ...overrides,
  };
}

function temporarySession(overrides: Partial<TemporarySourceSession> = {}): TemporarySourceSession {
  const id = overrides.id ?? "temp";
  return {
    artifacts: [],
    createdAt: "2026-06-12T09:00:00Z",
    expiresAt: "2026-06-13T09:00:00Z",
    id,
    kind: "text",
    lastAccessedAt: overrides.lastAccessedAt ?? "2026-06-12T10:00:00Z",
    promotionStatus: "notPromoted",
    sourceName: "Temporary paste",
    sourceOwner: "temporary",
    status: "reviewable",
    temporarySourceId: id,
    updatedAt: "2026-06-12T10:00:00Z",
    wordCount: 120,
    ...overrides,
  };
}

function job(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    createdAt: "2026-05-31T20:30:00Z",
    durationMs: 120_000,
    id: "job",
    inputText: "Opening chapter",
    projectId: "project-1",
    retries: { currentSegment: 1, totalSegments: 2 },
    status: "completed",
    updatedAt: "2026-05-31T20:31:00Z",
    voice: "default",
    voiceCheck: { similarity: 0.9 },
    ...overrides,
  } as VoiceJob;
}
