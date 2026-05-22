import { describe, expect, it } from "vitest";
import {
  DASHBOARD_ACTION_OWNERSHIP,
  dashboardActionsForOwner,
  dashboardOwnerForAction,
} from "./dashboardOwnership";

describe("dashboardOwnership", () => {
  it("keeps project asset actions owned by the Project Dashboard", () => {
    expect(dashboardOwnerForAction("project.open")).toBe("project-dashboard");
    expect(dashboardOwnerForAction("project.export")).toBe("project-dashboard");
    expect(dashboardOwnerForAction("source.list")).toBe("project-dashboard");
  });

  it("keeps reusable voice asset actions owned by the Voice Dashboard", () => {
    expect(dashboardOwnerForAction("voice.select")).toBe("voice-dashboard");
    expect(dashboardOwnerForAction("voice.clone")).toBe("voice-dashboard");
    expect(dashboardOwnerForAction("voice.diagnostics")).toBe("voice-dashboard");
  });

  it("keeps configuration, auditioning, playback, and runtime readiness out of dashboard ownership", () => {
    expect(dashboardOwnerForAction("configuration.run")).toBe("settings");
    expect(dashboardOwnerForAction("preview.compare")).toBe("preview");
    expect(dashboardOwnerForAction("playback.full")).toBe("cinema");
    expect(dashboardOwnerForAction("runtime.readiness")).toBe("runtime-diagnostics");
  });

  it("limits Settings ownership to configuration actions", () => {
    expect(dashboardActionsForOwner("settings").map((item) => item.action)).toEqual([
      "configuration.run",
      "configuration.scope",
    ]);
  });

  it("declares each action once", () => {
    const actions = DASHBOARD_ACTION_OWNERSHIP.map((item) => item.action);
    expect(new Set(actions).size).toBe(actions.length);
  });
});
