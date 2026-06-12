export type SettingsScope = "session" | "temporarySource" | "source" | "project" | "machine";
export type SettingsLayerId = "quick" | "advanced" | "expert";
export type TemporaryExpiryDuration = "endOfSession" | "24h" | "7d";
export type TemporaryDestination = "review" | "preview" | "cinema";
export type TemporaryWebExtractionMode = "article" | "readable" | "fullPage";
export type TemporaryReturnContextMemory = "rememberSurface" | "askEachTime" | "forgetOnClose";

export interface TemporarySourceBehaviorSettings {
  askBeforeDiscardingAudio: boolean;
  autoClean: boolean;
  defaultDestination: TemporaryDestination;
  expiryDuration: TemporaryExpiryDuration;
  includeGeneratedAudioOnPromotion: boolean;
  returnContextMemory: TemporaryReturnContextMemory;
  webpageExtractionMode: TemporaryWebExtractionMode;
}

export const DEFAULT_TEMPORARY_SOURCE_BEHAVIOR: TemporarySourceBehaviorSettings = {
  askBeforeDiscardingAudio: true,
  autoClean: true,
  defaultDestination: "review",
  expiryDuration: "24h",
  includeGeneratedAudioOnPromotion: false,
  returnContextMemory: "rememberSurface",
  webpageExtractionMode: "article",
};

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

export type SettingsPersistenceTarget =
  | "browserSession"
  | "localRuntime"
  | "projectRecord"
  | "readOnly"
  | "sourceRecord"
  | "temporarySourceRecord";
export type SettingsResetTarget =
  | "display"
  | "machineMemory"
  | "none"
  | "projectDefault"
  | "runDefaults"
  | "sourceOverride"
  | "temporarySourceCleanup";
export type SettingsConfirmationLevel = "none" | "confirm" | "expert";

export interface SettingsScopeContract {
  confirmationLevel: SettingsConfirmationLevel;
  persistenceTarget: SettingsPersistenceTarget;
  presetEligible: boolean;
  previewSupported: boolean;
  resetTarget: SettingsResetTarget;
  sourceOfTruth: string;
}

export type ScopedSettingDefinition = SettingsFieldMeta & SettingsScopeContract;

export interface SettingsChangeSetItemInput {
  after: string;
  before: string;
  confirmationLevel?: SettingsConfirmationLevel;
  fieldId: string;
  preserved?: boolean;
}

export interface SettingsChangeSetItem {
  after: string;
  before: string;
  changed: boolean;
  confirmationLevel: SettingsConfirmationLevel;
  fieldId: string;
  label: string;
  preserved: boolean;
  resetTarget: SettingsResetTarget;
  scope: SettingsScope;
  sourceOfTruth: string;
}

export interface SettingsChangeSet {
  affectedScopes: SettingsScope[];
  changedCount: number;
  id: string;
  items: SettingsChangeSetItem[];
  label: string;
  preservedCount: number;
  requiresConfirmation: boolean;
}

export interface PresetChangeSet extends SettingsChangeSet {
  presetId: string;
  presetLabel: string;
}

export interface SettingsDraft {
  changeSet: SettingsChangeSet;
  id: string;
  label: string;
  status: "applied" | "previewed" | "staged";
}

export interface SettingsAuditRowInput {
  currentValue: string;
  fieldId: string;
  pendingValue?: string;
}

export interface SettingsAuditRow {
  confirmationLevel: SettingsConfirmationLevel;
  currentValue: string;
  fieldId: string;
  label: string;
  owningScope: SettingsScope;
  pendingValue?: string;
  previewSupported: boolean;
  resetAction: string;
  resetTarget: SettingsResetTarget;
  scope: SettingsScope;
  sourceOfTruth: string;
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
    badgeClassName:
      "border-[var(--vs-status-info-border)] bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]",
    description:
      "Local reader preferences, theme, engine readiness, model paths, and machine diagnostics.",
    label: "Machine",
    shortLabel: "Machine",
  },
  project: {
    appliesTo: "Applies to this project by default.",
    badgeClassName:
      "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)]",
    description: "Durable project defaults used by unpinned sources.",
    label: "Project",
    shortLabel: "Project",
  },
  session: {
    appliesTo: "Affects the current run or temporary session.",
    badgeClassName:
      "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)]",
    description: "Run choices for the current preview, run, or temporary session.",
    label: "Session",
    shortLabel: "Session",
  },
  source: {
    appliesTo: "Applies to the selected source until cleared.",
    badgeClassName:
      "border-[var(--vs-status-success-border)] bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]",
    description: "Durable source-level pins for prepared sources and book sources.",
    label: "Source",
    shortLabel: "Source",
  },
  temporarySource: {
    appliesTo: "Applies to this temporary source until discarded or promoted.",
    badgeClassName:
      "border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] text-[var(--vs-status-warning)]",
    description: "Session-owned source content, extraction results, and generated temporary audio.",
    label: "Temporary source",
    shortLabel: "Temp source",
  },
};

export const SETTINGS_PRECEDENCE: readonly {
  description: string;
  label: string;
  scope: SettingsScope | "builtIn" | "previewDraft";
}[] = [
  {
    description: "Product defaults used when no scoped preference exists.",
    label: "Built-in defaults",
    scope: "builtIn",
  },
  {
    description: "Local browser/runtime preferences such as display, theme, and UI memory.",
    label: "Machine defaults",
    scope: "machine",
  },
  {
    description: "Durable defaults for unpinned sources in the active project.",
    label: "Project defaults",
    scope: "project",
  },
  {
    description:
      "Session-owned source behavior kept only until the temporary source is discarded or promoted.",
    label: "Temporary source",
    scope: "temporarySource",
  },
  {
    description: "Durable selected-source policy profile and field pins.",
    label: "Source pins",
    scope: "source",
  },
  {
    description: "Temporary choices for this browser session or next run.",
    label: "Session overrides",
    scope: "session",
  },
  {
    description: "Uncommitted values used only for before/after review and preview.",
    label: "Preview draft",
    scope: "previewDraft",
  },
];

export const SETTINGS_RESET_META: Record<
  SettingsResetTarget,
  { description: string; label: string }
> = {
  display: {
    description: "Restore reader display and theme defaults.",
    label: "Reset display",
  },
  machineMemory: {
    description: "Clear local/browser UI memory for the selected area.",
    label: "Reset machine memory",
  },
  none: {
    description: "Read-only setting; there is no reset action.",
    label: "No reset",
  },
  projectDefault: {
    description: "Restore the current project default.",
    label: "Reset project default",
  },
  runDefaults: {
    description: "Restore next-run session defaults.",
    label: "Reset run defaults",
  },
  sourceOverride: {
    description: "Clear the selected-source pin or override.",
    label: "Reset source override",
  },
  temporarySourceCleanup: {
    description:
      "Delete when discarded, clear expired sessions, or keep in project through promotion.",
    label: "Clean up temporary source",
  },
};

const SETTINGS_SCOPE_CONTRACT_DEFAULTS: Record<SettingsScope, SettingsScopeContract> = {
  machine: {
    confirmationLevel: "none",
    persistenceTarget: "localRuntime",
    presetEligible: true,
    previewSupported: true,
    resetTarget: "machineMemory",
    sourceOfTruth: "Local browser/runtime storage",
  },
  project: {
    confirmationLevel: "confirm",
    persistenceTarget: "projectRecord",
    presetEligible: true,
    previewSupported: true,
    resetTarget: "projectDefault",
    sourceOfTruth: "Backend project record",
  },
  session: {
    confirmationLevel: "none",
    persistenceTarget: "browserSession",
    presetEligible: true,
    previewSupported: true,
    resetTarget: "runDefaults",
    sourceOfTruth: "Browser session state",
  },
  source: {
    confirmationLevel: "confirm",
    persistenceTarget: "sourceRecord",
    presetEligible: false,
    previewSupported: true,
    resetTarget: "sourceOverride",
    sourceOfTruth: "Backend source record",
  },
  temporarySource: {
    confirmationLevel: "confirm",
    persistenceTarget: "temporarySourceRecord",
    presetEligible: false,
    previewSupported: true,
    resetTarget: "temporarySourceCleanup",
    sourceOfTruth: "Temporary source session record",
  },
};

const SETTINGS_FIELD_CONTRACT_OVERRIDES: Record<string, Partial<SettingsScopeContract>> = {
  activeSource: {
    confirmationLevel: "none",
    presetEligible: false,
    previewSupported: false,
    resetTarget: "sourceOverride",
  },
  debugOutput: {
    confirmationLevel: "expert",
    persistenceTarget: "readOnly",
    presetEligible: false,
    previewSupported: false,
    resetTarget: "none",
    sourceOfTruth: "Runtime diagnostics",
  },
  ergonomicPresets: {
    confirmationLevel: "confirm",
    presetEligible: false,
    previewSupported: true,
    resetTarget: "display",
    sourceOfTruth: "Preset draft",
  },
  previewSample: {
    presetEligible: false,
    sourceOfTruth: "Preview draft",
  },
  profileImportExport: {
    confirmationLevel: "confirm",
    presetEligible: false,
    resetTarget: "projectDefault",
  },
  projectSpeechPolicy: {
    confirmationLevel: "confirm",
    presetEligible: true,
    sourceOfTruth: "Backend project speech policy",
  },
  readerPreferences: {
    resetTarget: "display",
    sourceOfTruth: "Local reader preferences",
  },
  readAlongPreferences: {
    sourceOfTruth: "Read-along preference scope",
  },
  runtimeDiagnostics: {
    confirmationLevel: "expert",
    persistenceTarget: "readOnly",
    presetEligible: false,
    previewSupported: false,
    resetTarget: "none",
    sourceOfTruth: "Backend runtime diagnostics",
  },
  sourceSpeechPolicy: {
    confirmationLevel: "confirm",
    presetEligible: false,
    sourceOfTruth: "Backend selected-source pin",
  },
  temporarySourceBehavior: {
    confirmationLevel: "confirm",
    presetEligible: false,
    resetTarget: "temporarySourceCleanup",
    sourceOfTruth: "Temporary source session record",
  },
  structuredContent: {
    sourceOfTruth: "Session speech policy overrides",
  },
  uiMemory: {
    presetEligible: false,
    sourceOfTruth: "Local UI memory",
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
    detail: "Project defaults, temporary behavior, session overrides, and source pins",
    id: "sources",
    label: "Sources",
    layer: "advanced",
    summary: "Control durable and temporary source behavior without mixing their scopes.",
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
    description:
      "Applies transparent use-case defaults across reader display, read-along, Theatre, preview, and run behavior.",
    group: "reader",
    id: "ergonomicPresets",
    label: "Use-case presets",
    layer: "quick",
    scope: "machine",
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
    description:
      "Controls expiry, cleanup, generated temporary audio, return context, webpage extraction, and promotion behavior.",
    group: "sources",
    id: "temporarySourceBehavior",
    label: "Temporary source behavior",
    layer: "advanced",
    scope: "temporarySource",
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

export function scopedSettingDefinition(id: string): ScopedSettingDefinition | null {
  const field = settingsFieldMeta(id);
  if (!field) {
    return null;
  }
  return {
    ...field,
    ...SETTINGS_SCOPE_CONTRACT_DEFAULTS[field.scope],
    ...SETTINGS_FIELD_CONTRACT_OVERRIDES[field.id],
  };
}

export function scopedSettingDefinitions(): ScopedSettingDefinition[] {
  const definitions: ScopedSettingDefinition[] = [];
  for (const field of SETTINGS_FIELD_META) {
    const definition = scopedSettingDefinition(field.id);
    if (definition) {
      definitions.push(definition);
    }
  }
  return definitions;
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

export function settingsResetLabel(resetTarget: SettingsResetTarget): string {
  return SETTINGS_RESET_META[resetTarget].label;
}

export function buildSettingsChangeSet({
  id,
  items,
  label,
}: Readonly<{
  id: string;
  items: readonly SettingsChangeSetItemInput[];
  label: string;
}>): SettingsChangeSet {
  const resolvedItems = items.map((item) => {
    const definition = scopedSettingDefinition(item.fieldId);
    const fallbackScope: SettingsScope = "session";
    const preserved = item.preserved === true;
    const confirmationLevel = item.confirmationLevel ?? definition?.confirmationLevel ?? "none";
    return {
      after: item.after,
      before: item.before,
      changed: !preserved && item.before !== item.after,
      confirmationLevel,
      fieldId: item.fieldId,
      label: definition?.label ?? item.fieldId,
      preserved,
      resetTarget: definition?.resetTarget ?? "runDefaults",
      scope: definition?.scope ?? fallbackScope,
      sourceOfTruth: definition?.sourceOfTruth ?? "Settings draft",
    };
  });
  const affectedScopes = uniqueScopes(resolvedItems.map((item) => item.scope));
  return {
    affectedScopes,
    changedCount: resolvedItems.filter((item) => item.changed).length,
    id,
    items: resolvedItems,
    label,
    preservedCount: resolvedItems.filter((item) => item.preserved).length,
    requiresConfirmation: resolvedItems.some(
      (item) => item.changed && item.confirmationLevel !== "none",
    ),
  };
}

export function buildSettingsAuditRows(
  inputs: readonly SettingsAuditRowInput[],
): SettingsAuditRow[] {
  return inputs.map((input) => {
    const definition = scopedSettingDefinition(input.fieldId);
    const resetTarget = definition?.resetTarget ?? "runDefaults";
    return {
      confirmationLevel: definition?.confirmationLevel ?? "none",
      currentValue: input.currentValue,
      fieldId: input.fieldId,
      label: definition?.label ?? input.fieldId,
      owningScope: definition?.scope ?? "session",
      pendingValue: input.pendingValue,
      previewSupported: definition?.previewSupported ?? false,
      resetAction: settingsResetLabel(resetTarget),
      resetTarget,
      scope: definition?.scope ?? "session",
      sourceOfTruth: definition?.sourceOfTruth ?? "Settings draft",
    };
  });
}

function uniqueScopes(scopes: SettingsScope[]): SettingsScope[] {
  const orderedScopes: SettingsScope[] = [
    "session",
    "temporarySource",
    "source",
    "project",
    "machine",
  ];
  return orderedScopes.filter((scope) => scopes.includes(scope));
}
