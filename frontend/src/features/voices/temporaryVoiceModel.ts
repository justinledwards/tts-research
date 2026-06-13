import type { TTSEngineDiagnostics, TemporarySourceSession, VoiceProfile } from "../../types";

export const TEMPORARY_VOICE_STATE_STORAGE_KEY = "tts-temporary-voice-state:v1";

export type TemporaryVoiceSelectionKind = "default" | "provider" | "saved-profile";

export interface TemporaryVoiceSelection {
  kind: TemporaryVoiceSelectionKind;
  label: string;
  providerVoiceId?: string;
  voiceProfileId?: string;
  updatedAt: string;
}

export interface TemporaryVoiceAudition {
  id: string;
  createdAt: string;
  result: "failed" | "played" | "queued";
  sample: string;
  selection: TemporaryVoiceSelection;
  temporarySourceId: string;
}

export interface TemporaryVoiceCloneConsent {
  confirmedAt: string;
  provenanceSummary: string;
  temporarySourceId: string;
}

export interface TemporaryVoiceState {
  auditionsByTemporarySourceId: Record<string, TemporaryVoiceAudition[]>;
  cloneConsentByTemporarySourceId: Record<string, TemporaryVoiceCloneConsent>;
  selectionsByTemporarySourceId: Record<string, TemporaryVoiceSelection>;
}

export interface TemporaryVoiceUsageSummary {
  auditionCount: number;
  currentSelection: TemporaryVoiceSelection;
  expiresAt: string;
  lastAuditionAt?: string;
  sessionLabel: string;
  temporarySourceId: string;
}

export interface TemporaryVoiceDiagnosticSummary {
  detail: string;
  id: string;
  label: string;
  status: "attention" | "ready" | "warning";
}

export interface TemporaryVoiceDashboardModel {
  activeUsage: TemporaryVoiceUsageSummary[];
  auditionHistory: TemporaryVoiceAudition[];
  cloneConsentRequired: boolean;
  diagnostics: TemporaryVoiceDiagnosticSummary[];
}

export const EMPTY_TEMPORARY_VOICE_STATE: TemporaryVoiceState = {
  auditionsByTemporarySourceId: {},
  cloneConsentByTemporarySourceId: {},
  selectionsByTemporarySourceId: {},
};

export function temporaryVoiceStateKey(projectId: string): string {
  const cleanProjectId = projectId.trim() || "default";
  return `${TEMPORARY_VOICE_STATE_STORAGE_KEY}:${cleanProjectId}`;
}

export function loadTemporaryVoiceState(projectId: string): TemporaryVoiceState {
  const stored = sessionStorage.getItem(temporaryVoiceStateKey(projectId));
  if (!stored) {
    return EMPTY_TEMPORARY_VOICE_STATE;
  }
  try {
    return normalizeTemporaryVoiceState(JSON.parse(stored) as unknown);
  } catch {
    return EMPTY_TEMPORARY_VOICE_STATE;
  }
}

export function saveTemporaryVoiceState(projectId: string, state: TemporaryVoiceState): void {
  sessionStorage.setItem(
    temporaryVoiceStateKey(projectId),
    JSON.stringify(normalizeTemporaryVoiceState(state)),
  );
}

export function defaultTemporaryVoiceSelection(
  now = new Date().toISOString(),
): TemporaryVoiceSelection {
  return {
    kind: "default",
    label: "Default voice",
    updatedAt: now,
  };
}

export function providerTemporaryVoiceSelection(
  providerVoiceId: string,
  label: string,
  now = new Date().toISOString(),
): TemporaryVoiceSelection {
  return {
    kind: "provider",
    label: label.trim() || providerVoiceId,
    providerVoiceId: providerVoiceId.trim(),
    updatedAt: now,
  };
}

export function savedProfileTemporaryVoiceSelection(
  profile: Pick<VoiceProfile, "id" | "name">,
  now = new Date().toISOString(),
): TemporaryVoiceSelection {
  return {
    kind: "saved-profile",
    label: profile.name,
    updatedAt: now,
    voiceProfileId: profile.id,
  };
}

export function selectTemporaryVoiceForSource(
  state: TemporaryVoiceState,
  temporarySourceId: string,
  selection: TemporaryVoiceSelection,
): TemporaryVoiceState {
  const cleanId = temporarySourceId.trim();
  if (!cleanId) {
    return state;
  }
  return {
    ...state,
    selectionsByTemporarySourceId: {
      ...state.selectionsByTemporarySourceId,
      [cleanId]: normalizeTemporaryVoiceSelection(selection),
    },
  };
}

export function recordTemporaryVoiceAudition(
  state: TemporaryVoiceState,
  audition: TemporaryVoiceAudition,
): TemporaryVoiceState {
  const cleanId = audition.temporarySourceId.trim();
  if (!cleanId) {
    return state;
  }
  const current = state.auditionsByTemporarySourceId[cleanId] ?? [];
  return {
    ...state,
    auditionsByTemporarySourceId: {
      ...state.auditionsByTemporarySourceId,
      [cleanId]: [normalizeTemporaryVoiceAudition(audition), ...current].slice(0, 20),
    },
  };
}

export function confirmTemporaryVoiceCloneConsent(
  state: TemporaryVoiceState,
  consent: TemporaryVoiceCloneConsent,
): TemporaryVoiceState {
  const cleanId = consent.temporarySourceId.trim();
  if (!cleanId) {
    return state;
  }
  return {
    ...state,
    cloneConsentByTemporarySourceId: {
      ...state.cloneConsentByTemporarySourceId,
      [cleanId]: {
        confirmedAt: consent.confirmedAt,
        provenanceSummary: consent.provenanceSummary.trim(),
        temporarySourceId: cleanId,
      },
    },
  };
}

export function canUseTemporaryMediaForVoiceCloning(
  state: TemporaryVoiceState,
  temporarySourceId: string | null | undefined,
): boolean {
  return Boolean(
    temporarySourceId?.trim() && state.cloneConsentByTemporarySourceId[temporarySourceId.trim()],
  );
}

export function effectiveTemporaryVoiceSelection(
  state: TemporaryVoiceState,
  temporarySourceId: string | null | undefined,
): TemporaryVoiceSelection {
  const cleanId = temporarySourceId?.trim();
  if (!cleanId) {
    return defaultTemporaryVoiceSelection();
  }
  return state.selectionsByTemporarySourceId[cleanId] ?? defaultTemporaryVoiceSelection();
}

export function buildTemporaryVoiceDashboardModel({
  activeTemporarySourceId,
  profiles,
  state,
  temporarySources,
  ttsEngines,
}: Readonly<{
  activeTemporarySourceId: string | null;
  profiles: VoiceProfile[];
  state: TemporaryVoiceState;
  temporarySources: TemporarySourceSession[];
  ttsEngines: TTSEngineDiagnostics[];
}>): TemporaryVoiceDashboardModel {
  const activeUsage = temporarySources
    .filter((source) => source.status !== "discarded" && source.status !== "expired")
    .map((source) => temporaryVoiceUsageSummary(source, state, profiles));
  const activeSessionId = activeTemporarySourceId?.trim();
  const auditionHistory = activeSessionId
    ? (state.auditionsByTemporarySourceId[activeSessionId] ?? [])
    : [];
  return {
    activeUsage,
    auditionHistory,
    cloneConsentRequired: Boolean(
      activeTemporarySourceId &&
        !canUseTemporaryMediaForVoiceCloning(state, activeTemporarySourceId),
    ),
    diagnostics: temporaryVoiceDiagnostics(ttsEngines),
  };
}

function temporaryVoiceUsageSummary(
  source: TemporarySourceSession,
  state: TemporaryVoiceState,
  profiles: VoiceProfile[],
): TemporaryVoiceUsageSummary {
  const selection = effectiveTemporaryVoiceSelection(state, source.temporarySourceId);
  const resolvedSelection =
    selection.kind === "saved-profile" && selection.voiceProfileId
      ? savedProfileTemporaryVoiceSelection(
          profiles.find((profile) => profile.id === selection.voiceProfileId) ?? {
            id: selection.voiceProfileId,
            name: selection.label,
          },
          selection.updatedAt,
        )
      : selection;
  const auditions = state.auditionsByTemporarySourceId[source.temporarySourceId] ?? [];
  return {
    auditionCount: auditions.length,
    currentSelection: resolvedSelection,
    expiresAt: source.expiresAt,
    lastAuditionAt: auditions[0]?.createdAt,
    sessionLabel: source.title ?? source.sourceName,
    temporarySourceId: source.temporarySourceId,
  };
}

function temporaryVoiceDiagnostics(
  ttsEngines: TTSEngineDiagnostics[],
): TemporaryVoiceDiagnosticSummary[] {
  const activeEngines = ttsEngines.filter((engine) => engine.status !== "unavailable");
  const readyPreview = activeEngines.find((engine) => engine.capabilities?.voicePreview);
  const readyTts = activeEngines.find((engine) => engine.capabilities?.tts ?? engine.supportsVoice);
  const cloneReady = activeEngines.find(
    (engine) => engine.capabilities?.voiceCloning ?? engine.supportsReference,
  );
  return [
    diagnostic(
      "tts",
      "Temporary generation",
      readyTts,
      "Provider unavailable for temporary generation. This temporary-source error does not change project voice defaults.",
    ),
    diagnostic(
      "preview",
      "Voice audition",
      readyPreview,
      "Provider unavailable for temporary voice audition. Temporary auditions remain session history only.",
    ),
    diagnostic(
      "clone",
      "Reference cloning",
      cloneReady,
      "Clone/reference engines require setup in Voice Studio.",
    ),
  ];
}

function diagnostic(
  id: string,
  label: string,
  engine: TTSEngineDiagnostics | undefined,
  missingDetail: string,
): TemporaryVoiceDiagnosticSummary {
  if (!engine) {
    return { detail: missingDetail, id, label, status: "attention" };
  }
  if (engine.reason || engine.setup) {
    return {
      detail: engine.reason ?? engine.setup ?? "",
      id,
      label,
      status: "warning",
    };
  }
  return { detail: `${engine.label} is ready.`, id, label, status: "ready" };
}

function normalizeTemporaryVoiceState(value: unknown): TemporaryVoiceState {
  if (!value || typeof value !== "object") {
    return EMPTY_TEMPORARY_VOICE_STATE;
  }
  const candidate = value as Partial<TemporaryVoiceState>;
  return {
    auditionsByTemporarySourceId: normalizeAuditions(candidate.auditionsByTemporarySourceId),
    cloneConsentByTemporarySourceId: normalizeCloneConsent(
      candidate.cloneConsentByTemporarySourceId,
    ),
    selectionsByTemporarySourceId: normalizeSelections(candidate.selectionsByTemporarySourceId),
  };
}

function normalizeSelections(value: unknown): Record<string, TemporaryVoiceSelection> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const selections: Record<string, TemporaryVoiceSelection> = {};
  for (const [key, selection] of Object.entries(value as Record<string, unknown>)) {
    if (key.trim().length > 0) {
      selections[key] = normalizeTemporaryVoiceSelection(selection);
    }
  }
  return selections;
}

function normalizeAuditions(value: unknown): Record<string, TemporaryVoiceAudition[]> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized: Record<string, TemporaryVoiceAudition[]> = {};
  for (const [key, auditions] of Object.entries(value as Record<string, unknown>)) {
    if (key.trim().length === 0) {
      continue;
    }
    normalized[key] = Array.isArray(auditions)
      ? auditions.map((audition) => normalizeTemporaryVoiceAudition(audition)).slice(0, 20)
      : [];
  }
  return normalized;
}

function normalizeCloneConsent(value: unknown): Record<string, TemporaryVoiceCloneConsent> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized: Record<string, TemporaryVoiceCloneConsent> = {};
  for (const [key, consent] of Object.entries(
    value as Record<string, Partial<TemporaryVoiceCloneConsent>>,
  )) {
    if (key.trim().length === 0) {
      continue;
    }
    normalized[key] = {
      confirmedAt: stringOrNow(consent.confirmedAt),
      provenanceSummary: stringOrEmpty(consent.provenanceSummary),
      temporarySourceId: nonEmptyOr(consent.temporarySourceId, key),
    };
  }
  return normalized;
}

function normalizeTemporaryVoiceSelection(value: unknown): TemporaryVoiceSelection {
  if (!value || typeof value !== "object") {
    return defaultTemporaryVoiceSelection();
  }
  const candidate = value as Partial<TemporaryVoiceSelection>;
  if (candidate.kind === "saved-profile" && candidate.voiceProfileId?.trim()) {
    return {
      kind: "saved-profile",
      label: nonEmptyOr(candidate.label, candidate.voiceProfileId),
      updatedAt: stringOrNow(candidate.updatedAt),
      voiceProfileId: candidate.voiceProfileId.trim(),
    };
  }
  if (candidate.kind === "provider" && candidate.providerVoiceId?.trim()) {
    return {
      kind: "provider",
      label: nonEmptyOr(candidate.label, candidate.providerVoiceId),
      providerVoiceId: candidate.providerVoiceId.trim(),
      updatedAt: stringOrNow(candidate.updatedAt),
    };
  }
  return defaultTemporaryVoiceSelection(stringOrNow(candidate.updatedAt));
}

function normalizeTemporaryVoiceAudition(value: unknown): TemporaryVoiceAudition {
  const candidate =
    value && typeof value === "object" ? (value as Partial<TemporaryVoiceAudition>) : {};
  const result =
    candidate.result === "failed" || candidate.result === "played" || candidate.result === "queued"
      ? candidate.result
      : "queued";
  return {
    createdAt: stringOrNow(candidate.createdAt),
    id: nonEmptyOr(candidate.id, `audition-${Date.now().toString()}`),
    result,
    sample: stringOrEmpty(candidate.sample),
    selection: normalizeTemporaryVoiceSelection(candidate.selection),
    temporarySourceId: stringOrEmpty(candidate.temporarySourceId),
  };
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringOrNow(value: unknown): string {
  return nonEmptyOr(value, new Date().toISOString());
}

function nonEmptyOr(value: unknown, fallback: string): string {
  const cleanValue = stringOrEmpty(value);
  return cleanValue.length > 0 ? cleanValue : fallback;
}
