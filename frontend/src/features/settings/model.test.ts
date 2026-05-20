import { describe, expect, it } from "vitest";
import {
  SETTINGS_GROUPS,
  SETTINGS_SCOPE_META,
  settingsGroupMeta,
  settingsScopeAppliesTo,
} from "./model";

describe("settings metadata", () => {
  it("defines the task-oriented settings groups in navigation order", () => {
    expect(SETTINGS_GROUPS.map((group) => group.id)).toEqual([
      "run",
      "reader",
      "voices",
      "sources",
      "runtime",
      "diagnostics",
    ]);
    expect(settingsGroupMeta("sources").label).toBe("Sources");
  });

  it("keeps scope labels and applies-to copy centralized", () => {
    expect(Object.keys(SETTINGS_SCOPE_META)).toEqual(["machine", "project", "session", "source"]);
    expect(settingsScopeAppliesTo("session")).toContain("current browser session");
    expect(settingsScopeAppliesTo("source")).toContain("selected source");
    expect(settingsScopeAppliesTo("project")).toContain("project");
    expect(settingsScopeAppliesTo("machine")).toContain("local runtime");
  });
});
