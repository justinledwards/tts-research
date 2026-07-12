import type {
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SourceSpeechPolicyUpdateRequest,
} from "../../types";
import {
  compactSpeechPolicyOverrides,
  DEFAULT_SPEECH_POLICY_DEFINITION,
  hasSpeechPolicyOverrides,
  normalizeSpeechPolicyProfile,
  speechPolicyProfileLabel,
} from "../../speechPolicy";

export interface PolicyScopeState {
  projectProfile: string;
  resolvedProfile?: string;
  sessionOverrides?: SpeechPolicyOverrides;
  sourceOverrides?: SpeechPolicyOverrides;
  sourceProfile?: string;
}

export interface PolicyScopeChip {
  detail: string;
  id: "current" | "project" | "session" | "source";
  isActive: boolean;
  label: string;
}

export interface PolicyScopeSummary {
  compactLabel: string;
  currentProfileLabel: string;
  description: string;
  ownershipLabel: string;
}

export interface PolicyProfileOption {
  label: string;
  name: string;
}

export function policyScopeChips(state: PolicyScopeState): PolicyScopeChip[] {
  const projectProfile = normalizeSpeechPolicyProfile(state.projectProfile);
  const sourceProfile = state.sourceProfile?.trim() ?? "";
  const sourceOverrides = compactSpeechPolicyOverrides(state.sourceOverrides ?? {});
  const sessionOverrides = compactSpeechPolicyOverrides(state.sessionOverrides ?? {});
  const resolvedProfile = normalizeSpeechPolicyProfile(
    state.resolvedProfile ?? (sourceProfile || projectProfile),
  );
  return [
    {
      detail: speechPolicyProfileLabel(resolvedProfile),
      id: "current",
      isActive: true,
      label: "Current profile",
    },
    {
      detail: speechPolicyProfileLabel(projectProfile),
      id: "project",
      isActive: !sourceProfile && !hasSpeechPolicyOverrides(sourceOverrides),
      label: "Project default",
    },
    {
      detail: sourcePolicyDetail(sourceProfile, sourceOverrides),
      id: "source",
      isActive: Boolean(sourceProfile) || hasSpeechPolicyOverrides(sourceOverrides),
      label: "Source pin",
    },
    {
      detail: overrideCountLabel(sessionOverrides),
      id: "session",
      isActive: hasSpeechPolicyOverrides(sessionOverrides),
      label: "Session override",
    },
  ];
}

export function policyScopeSummary(state: PolicyScopeState): PolicyScopeSummary {
  const chips = policyScopeChips(state);
  const currentProfileLabel = chips.find((chip) => chip.id === "current")?.detail ?? "Enterprise";
  const project = chips.find((chip) => chip.id === "project");
  const source = chips.find((chip) => chip.id === "source");
  const session = chips.find((chip) => chip.id === "session");
  const ownershipLabel = source?.isActive ? "Source" : "Project";
  const sessionSuffix = session?.isActive ? " + Session" : "";
  const compactLabel = `${currentProfileLabel} · ${ownershipLabel}${sessionSuffix}`;
  const description = [
    `Current profile: ${currentProfileLabel}`,
    `Project default: ${project?.detail ?? "Enterprise"}`,
    `Source pin: ${source?.detail ?? "Not pinned"}`,
    `Session override: ${session?.detail ?? "None"}`,
  ].join(". ");
  return {
    compactLabel,
    currentProfileLabel,
    description,
    ownershipLabel: `${ownershipLabel}${sessionSuffix}`,
  };
}

export function sourcePolicyUpdateRequest(
  profile: string,
  overrides: SpeechPolicyOverrides,
): SourceSpeechPolicyUpdateRequest {
  return {
    profile: normalizeSpeechPolicyProfile(profile),
    overrides: compactSpeechPolicyOverrides(overrides),
  };
}

export function sessionSpeechPolicyRequest(overrides: SpeechPolicyOverrides): {
  overrides?: SpeechPolicyOverrides;
} {
  const normalized = compactSpeechPolicyOverrides(overrides);
  return hasSpeechPolicyOverrides(normalized) ? { overrides: normalized } : {};
}

export function speechPolicyProfileOptions(
  definition: SpeechPolicyDefinition,
  profiles: SpeechPolicyProfile[],
  customProfiles: { id: string; name: string }[] = [],
): PolicyProfileOption[] {
  let source = DEFAULT_SPEECH_POLICY_DEFINITION.profiles;
  if (definition.profiles.length > 0) {
    source = definition.profiles;
  } else if (profiles.length > 0) {
    source = profiles;
  }
  const builtin = source.map((profile) => ({
    label: profile.label || speechPolicyProfileLabel(profile.name),
    name: profile.name,
  }));
  return [
    ...builtin,
    ...customProfiles.map((profile) => ({
      label: profile.name,
      name: profile.id,
    })),
  ];
}

export function speechPolicyOverrideCount(overrides: SpeechPolicyOverrides): number {
  return Object.keys(compactSpeechPolicyOverrides(overrides)).length;
}

function sourcePolicyDetail(profile: string, overrides: SpeechPolicyOverrides): string {
  const pieces = [];
  if (profile) {
    pieces.push(speechPolicyProfileLabel(profile));
  }
  const count = speechPolicyOverrideCount(overrides);
  if (count > 0) {
    pieces.push(overrideCountLabel(overrides));
  }
  return pieces.join(" · ") || "Not pinned";
}

function overrideCountLabel(overrides: SpeechPolicyOverrides): string {
  const count = speechPolicyOverrideCount(overrides);
  if (count === 0) {
    return "None";
  }
  return count === 1 ? "1 field" : `${count.toString()} fields`;
}
