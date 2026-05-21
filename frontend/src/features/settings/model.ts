export type SettingsScope = "session" | "source" | "project" | "machine";

export interface SettingsScopeMeta {
  appliesTo: string;
  badgeClassName: string;
  description: string;
  label: string;
  shortLabel: string;
}

export type SettingsGroupId = "run" | "reader" | "voices" | "sources" | "runtime" | "diagnostics";

export interface SettingsGroupMeta {
  detail: string;
  id: SettingsGroupId;
  label: string;
  summary: string;
}

export interface SettingsFieldMeta {
  description: string;
  group: SettingsGroupId;
  id: string;
  label: string;
  scope: SettingsScope;
}

export interface SettingsCommandTarget {
  fieldId?: string;
  groupId: SettingsGroupId;
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

export const SETTINGS_GROUPS: SettingsGroupMeta[] = [
  {
    detail: "Job shape, quality level, and next-run toggles",
    id: "run",
    label: "Run",
    summary: "Choose how the next narration run behaves.",
  },
  {
    detail: "Reading comfort, display, and teleprompter focus",
    id: "reader",
    label: "Reader",
    summary: "Tune the experience of reading and following generated audio.",
  },
  {
    detail: "Voice selection, render paths, and profile readiness",
    id: "voices",
    label: "Voices",
    summary: "Understand which voice path will be used and whether it is ready.",
  },
  {
    detail: "Project defaults, session overrides, and source pins",
    id: "sources",
    label: "Sources",
    summary: "Control how source structure becomes listener-ready narration.",
  },
  {
    detail: "Narration engines, research modules, and local setup",
    id: "runtime",
    label: "Runtime",
    summary: "Check local provider and model readiness.",
  },
  {
    detail: "Backend, GPU, job, storage, and extraction health",
    id: "diagnostics",
    label: "Diagnostics",
    summary: "Inspect operational facts without changing configuration.",
  },
];

export const SETTINGS_FIELD_META: SettingsFieldMeta[] = [
  {
    description: "Controls the preset and enabled pipeline steps for the next job.",
    group: "run",
    id: "runMode",
    label: "Run mode",
    scope: "session",
  },
  {
    description: "Controls the balance between throughput and steadier rendering.",
    group: "run",
    id: "performanceMode",
    label: "Performance",
    scope: "session",
  },
  {
    description: "Controls typography and motion across reader surfaces on this machine.",
    group: "reader",
    id: "readerPreferences",
    label: "Reader preferences",
    scope: "machine",
  },
  {
    description: "Controls whether local presentation layout is remembered on this machine.",
    group: "reader",
    id: "uiMemory",
    label: "UI memory",
    scope: "machine",
  },
  {
    description: "Controls global command, Help, Settings, and Create & Listen shortcuts.",
    group: "reader",
    id: "shortcuts",
    label: "Keyboard shortcuts",
    scope: "machine",
  },
  {
    description: "Sets the durable speech-policy default for unpinned project sources.",
    group: "sources",
    id: "projectSpeechPolicy",
    label: "Project policy",
    scope: "project",
  },
  {
    description: "Pins a selected source to its own profile or field overrides.",
    group: "sources",
    id: "sourceSpeechPolicy",
    label: "Source pin",
    scope: "source",
  },
  {
    description: "Shows local engine, model, provider, and backend readiness.",
    group: "runtime",
    id: "runtimeDiagnostics",
    label: "Runtime diagnostics",
    scope: "machine",
  },
];

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
