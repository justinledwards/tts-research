import { describe, expect, it } from "vitest";
import {
  SETTINGS_FIELD_META,
  SETTINGS_GROUPS,
  SETTINGS_SCOPE_META,
  settingsFieldMeta,
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

  it("assigns searchable fields to settings groups", () => {
    expect(SETTINGS_FIELD_META.every((field) => field.group.length > 0)).toBe(true);
    expect(settingsFieldMeta("sourceSpeechPolicy")?.group).toBe("sources");
    expect(settingsFieldMeta("runtimeDiagnostics")?.group).toBe("runtime");
    expect(settingsFieldMeta("shortcuts")?.group).toBe("reader");
  });
});
