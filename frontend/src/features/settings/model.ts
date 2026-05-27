export type SettingsScope = "session" | "source" | "project" | "machine";
export type SettingsLayerId = "quick" | "advanced" | "expert";

export interface SettingsScopeMeta {
  appliesTo: string;
  badgeClassName: string;
  description: string;
  label: string;
  shortLabel: string;
}

export type SettingsGroupId = "run" | "reader" | "voices" | "sources" | "runtime" | "diagnostics";

export interface SettingsLayerMeta {
  detail: string;
  id: SettingsLayerId;
  label: string;
  summary: string;
}

export interface SettingsGroupMeta {
  detail: string;
  id: SettingsGroupId;
  label: string;
  layer: Exclude<SettingsLayerId, "quick">;
  summary: string;
}

export interface SettingsFieldMeta {
  description: string;
  group: SettingsGroupId;
  id: string;
  label: string;
  layer: SettingsLayerId;
  scope: SettingsScope;
}

export interface SettingsCommandTarget {
  fieldId?: string;
  groupId: SettingsGroupId;
  layerId?: SettingsLayerId;
  scope?: SettingsScope;
}

export const SETTINGS_SCOPE_META: Record<SettingsScope, SettingsScopeMeta> = {
  machine: {
    appliesTo: "Applies to this browser or local runtime.",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
    description:
      "Local reader preferences, theme, engine readiness, model paths, and machine diagnostics.",
    label: "Machine",
    shortLabel: "Machine",
  },
  project: {
    appliesTo: "Applies to this project by default.",
    badgeClassName: "border-violet-200 bg-violet-50 text-violet-700",
    description: "Durable project defaults used by unpinned sources.",
    label: "Project",
    shortLabel: "Project",
  },
  session: {
    appliesTo: "Applies to the current browser session or next run.",
    badgeClassName: "border-orange-300 bg-orange-500/10 text-orange-700",
    description: "Temporary choices for the current preview, run, or in-browser session.",
    label: "Session",
    shortLabel: "Session",
  },
  source: {
    appliesTo: "Applies to the selected source until cleared.",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    description: "Durable source-level pins for prepared sources and book sources.",
    label: "Source",
    shortLabel: "Source",
  },
};

export const SETTINGS_LAYERS: SettingsLayerMeta[] = [
  {
    detail: "Voice, speed, source, output intent, basic policy, and preview sample.",
    id: "quick",
    label: "Quick",
    summary: "Generate useful audio without learning every setting.",
  },
  {
    detail: "Run configuration, structured content, source/project scope, caching, profiles.",
    id: "advanced",
    label: "Advanced",
    summary: "Tune the workflow while staying in product language.",
  },
  {
    detail: "Runtime, engine internals, model paths, debug output, JSON policy editing.",
    id: "expert",
    label: "Expert / Diagnostics",
    summary: "Open operational diagnostics only when you need them.",
  },
];

export const SETTINGS_GROUPS: SettingsGroupMeta[] = [
  {
    detail: "Job shape, quality level, and next-run toggles",
    id: "run",
    label: "Run",
    layer: "advanced",
    summary: "Choose how the next narration run behaves.",
  },
  {
    detail: "Reading comfort, display, and teleprompter focus",
    id: "reader",
    label: "Reader",
    layer: "advanced",
    summary: "Tune the experience of reading and following generated audio.",
  },
  {
    detail: "Voice selection, render paths, and profile readiness",
    id: "voices",
    label: "Voices",
    layer: "advanced",
    summary: "Understand which voice path will be used and whether it is ready.",
  },
  {
    detail: "Project defaults, session overrides, and source pins",
    id: "sources",
    label: "Sources",
    layer: "advanced",
    summary: "Control how source structure becomes listener-ready narration.",
  },
  {
    detail: "Narration engines, research modules, and local setup",
    id: "runtime",
    label: "Runtime",
    layer: "expert",
    summary: "Check local provider and model readiness.",
  },
  {
    detail: "Backend, GPU, job, storage, and extraction health",
    id: "diagnostics",
    label: "Diagnostics",
    layer: "expert",
    summary: "Inspect operational facts without changing configuration.",
  },
];

export const SETTINGS_FIELD_META: SettingsFieldMeta[] = [
  {
    description: "Controls the preset and enabled pipeline steps for the next job.",
    group: "run",
    id: "runMode",
    label: "Run mode",
    layer: "quick",
    scope: "session",
  },
  {
    description: "Controls the balance between throughput and steadier rendering.",
    group: "run",
    id: "performanceMode",
    label: "Performance",
    layer: "quick",
    scope: "session",
  },
  {
    description: "Selects the active voice path for useful default narration.",
    group: "voices",
    id: "voice",
    label: "Voice",
    layer: "quick",
    scope: "session",
  },
  {
    description: "Shows which source is active before previewing or creating audio.",
    group: "sources",
    id: "activeSource",
    label: "Active source",
    layer: "quick",
    scope: "source",
  },
  {
    description: "Starts a short audition from the current configuration before production audio.",
    group: "run",
    id: "previewSample",
    label: "Preview sample",
    layer: "quick",
    scope: "session",
  },
  {
    description: "Controls typography and motion across reader surfaces on this machine.",
    group: "reader",
    id: "readerPreferences",
    label: "Reader preferences",
    layer: "advanced",
    scope: "machine",
  },
  {
    description:
      "Controls highlight granularity, style, follow motion, sync fallback, calibration, and degraded read-along display.",
    group: "reader",
    id: "readAlongPreferences",
    label: "Read-along preferences",
    layer: "advanced",
    scope: "machine",
  },
  {
    description:
      "Controls Teleprompt Theatre presets, cue sizing, operator layout, countdown, metronome, and fullscreen fallback.",
    group: "reader",
    id: "telepromptTheatre",
    label: "Teleprompt Theatre",
    layer: "advanced",
    scope: "machine",
  },
  {
    description:
      "Controls local memory for layout, theme, last project, reader preferences, Teleprompt returns, and panel pins.",
    group: "reader",
    id: "uiMemory",
    label: "UI memory",
    layer: "advanced",
    scope: "machine",
  },
  {
    description: "Controls global command, Help, Settings, and Create & Listen shortcuts.",
    group: "reader",
    id: "shortcuts",
    label: "Keyboard shortcuts",
    layer: "advanced",
    scope: "machine",
  },
  {
    description: "Sets the durable speech-policy default for unpinned project sources.",
    group: "sources",
    id: "projectSpeechPolicy",
    label: "Project policy",
    layer: "advanced",
    scope: "project",
  },
  {
    description: "Pins a selected source to its own profile or field overrides.",
    group: "sources",
    id: "sourceSpeechPolicy",
    label: "Source pin",
    layer: "advanced",
    scope: "source",
  },
  {
    description: "Manages custom speech policy profiles and import/export.",
    group: "sources",
    id: "profileImportExport",
    label: "Profile import/export",
    layer: "advanced",
    scope: "project",
  },
  {
    description:
      "Controls detailed structured content behavior for tables, code, math, citations, and notes.",
    group: "sources",
    id: "structuredContent",
    label: "Structured content",
    layer: "advanced",
    scope: "session",
  },
  {
    description: "Shows local engine, model, provider, and backend readiness.",
    group: "runtime",
    id: "runtimeDiagnostics",
    label: "Runtime diagnostics",
    layer: "expert",
    scope: "machine",
  },
  {
    description: "Exposes engine internals, model paths, and debug output for troubleshooting.",
    group: "diagnostics",
    id: "debugOutput",
    label: "Debug output",
    layer: "expert",
    scope: "machine",
  },
];

export function settingsLayerMeta(id: SettingsLayerId): SettingsLayerMeta {
  return SETTINGS_LAYERS.find((layer) => layer.id === id) ?? SETTINGS_LAYERS[0];
}

export function settingsGroupMeta(id: SettingsGroupId): SettingsGroupMeta {
  return SETTINGS_GROUPS.find((group) => group.id === id) ?? SETTINGS_GROUPS[0];
}

export function settingsFieldMeta(id: string): SettingsFieldMeta | null {
  return SETTINGS_FIELD_META.find((field) => field.id === id) ?? null;
}

export function settingsScopeAppliesTo(scope: SettingsScope): string {
  return SETTINGS_SCOPE_META[scope].appliesTo;
}

export function settingsScopeLabel(scope: SettingsScope): string {
  return SETTINGS_SCOPE_META[scope].label;
}

export function settingsLayerForGroup(groupId: SettingsGroupId): SettingsLayerId {
  return settingsGroupMeta(groupId).layer;
}

export function settingsLayerForCommandTarget(target: SettingsCommandTarget): SettingsLayerId {
  if (target.layerId) {
    return target.layerId;
  }
  if (target.fieldId) {
    return settingsFieldMeta(target.fieldId)?.layer ?? settingsLayerForGroup(target.groupId);
  }
  if (target.scope === "machine" && target.groupId === "diagnostics") {
    return "expert";
  }
  return settingsLayerForGroup(target.groupId);
}

export function settingsGroupsForLayer(
  layer: Exclude<SettingsLayerId, "quick">,
): SettingsGroupMeta[] {
  return SETTINGS_GROUPS.filter((group) => group.layer === layer);
}
