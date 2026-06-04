import { describe, expect, it } from "vitest";
import {
  SETTINGS_FIELD_META,
  SETTINGS_GROUPS,
  SETTINGS_LAYERS,
  SETTINGS_PRECEDENCE,
  SETTINGS_SCOPE_META,
  buildSettingsAuditRows,
  buildSettingsChangeSet,
  scopedSettingDefinition,
  scopedSettingDefinitions,
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

  it("defines a scoped contract for every searchable setting", () => {
    expect(scopedSettingDefinitions()).toHaveLength(SETTINGS_FIELD_META.length);
    expect(scopedSettingDefinition("runMode")).toMatchObject({
      persistenceTarget: "browserSession",
      resetTarget: "runDefaults",
      scope: "session",
    });
    expect(scopedSettingDefinition("projectSpeechPolicy")).toMatchObject({
      confirmationLevel: "confirm",
      persistenceTarget: "projectRecord",
      resetTarget: "projectDefault",
    });
    expect(scopedSettingDefinition("sourceSpeechPolicy")).toMatchObject({
      presetEligible: false,
      resetTarget: "sourceOverride",
      sourceOfTruth: "Backend selected-source pin",
    });
    expect(scopedSettingDefinition("runtimeDiagnostics")).toMatchObject({
      confirmationLevel: "expert",
      persistenceTarget: "readOnly",
      resetTarget: "none",
    });
  });

  it("keeps the formal settings precedence visible and ordered", () => {
    expect(SETTINGS_PRECEDENCE.map((item) => item.scope)).toEqual([
      "builtIn",
      "machine",
      "project",
      "source",
      "session",
      "previewDraft",
    ]);
  });

  it("builds scoped change sets and audit rows from the shared contract", () => {
    const changeSet = buildSettingsChangeSet({
      id: "preset:test",
      label: "Preset test",
      items: [
        { after: "Fast Create", before: "Checked Master", fieldId: "runMode" },
        { after: "Accessibility", before: "Enterprise", fieldId: "projectSpeechPolicy" },
        {
          after: "Unchanged by preset",
          before: "Existing source pins",
          fieldId: "sourceSpeechPolicy",
          preserved: true,
        },
      ],
    });

    expect(changeSet.affectedScopes).toEqual(["session", "source", "project"]);
    expect(changeSet.changedCount).toBe(2);
    expect(changeSet.preservedCount).toBe(1);
    expect(changeSet.requiresConfirmation).toBe(true);
    expect(changeSet.items.find((item) => item.fieldId === "sourceSpeechPolicy")).toMatchObject({
      preserved: true,
      changed: false,
    });

    expect(
      buildSettingsAuditRows([
        { currentValue: "Checked Master", fieldId: "runMode" },
        {
          currentValue: "Long-form book listening",
          fieldId: "ergonomicPresets",
          pendingValue: "Preview draft",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        fieldId: "runMode",
        resetAction: "Reset run defaults",
        sourceOfTruth: "Browser session state",
      }),
      expect.objectContaining({
        fieldId: "ergonomicPresets",
        pendingValue: "Preview draft",
        resetAction: "Reset display",
      }),
    ]);
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
