import { describe, expect, it } from "vitest";
import {
  SETTINGS_FIELD_META,
  SETTINGS_GROUPS,
  SETTINGS_LAYERS,
  SETTINGS_SCOPE_META,
  settingsFieldMeta,
  settingsGroupsForLayer,
  settingsGroupMeta,
  settingsLayerForCommandTarget,
  settingsScopeAppliesTo,
} from "./model";

describe("settings metadata", () => {
  it("defines the task-oriented settings groups in navigation order", () => {
    expect(SETTINGS_LAYERS.map((layer) => layer.id)).toEqual(["quick", "advanced", "expert"]);
    expect(SETTINGS_GROUPS.map((group) => group.id)).toEqual([
      "run",
      "reader",
      "voices",
      "sources",
      "runtime",
      "diagnostics",
    ]);
    expect(settingsGroupMeta("sources").label).toBe("Sources");
    expect(settingsGroupsForLayer("advanced").map((group) => group.id)).toEqual([
      "run",
      "reader",
      "voices",
      "sources",
    ]);
    expect(settingsGroupsForLayer("expert").map((group) => group.id)).toEqual([
      "runtime",
      "diagnostics",
    ]);
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
    expect(settingsFieldMeta("previewSample")?.layer).toBe("quick");
    expect(settingsFieldMeta("ergonomicPresets")?.scope).toBe("machine");
    expect(settingsFieldMeta("runtimeDiagnostics")?.group).toBe("runtime");
    expect(settingsFieldMeta("shortcuts")?.group).toBe("reader");
  });

  it("routes settings command targets into progressive layers", () => {
    expect(settingsLayerForCommandTarget({ groupId: "run", layerId: "quick" })).toBe("quick");
    expect(
      settingsLayerForCommandTarget({
        fieldId: "sourceSpeechPolicy",
        groupId: "sources",
        scope: "source",
      }),
    ).toBe("advanced");
    expect(settingsLayerForCommandTarget({ groupId: "diagnostics", scope: "machine" })).toBe(
      "expert",
    );
  });
});
