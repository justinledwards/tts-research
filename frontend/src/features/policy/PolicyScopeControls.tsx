import { useEffect, useMemo, useState } from "react";
import type {
  SpeechPolicyDefinition,
  SpeechPolicyDefinitionField,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SourceSpeechPolicyUpdateRequest,
} from "../../types";
import {
  compactSpeechPolicyOverrides,
  DEFAULT_SPEECH_POLICY_DEFINITION,
  normalizeSpeechPolicyOverrides,
} from "../../speechPolicy";
import {
  policyScopeChips,
  policyScopeSummary,
  sourcePolicyUpdateRequest,
  speechPolicyProfileOptions,
  type PolicyScopeState,
} from "./model";
import { ScopeBadge } from "../settings/ScopeBadge";
import { settingsScopeAppliesTo } from "../settings/model";
import {
  sourceLifecycleDescriptor,
  sourcePolicyScopeLabel,
  type SourceLifecycleEnvelope,
} from "../source-lifecycle/sourceLifecycle";

export function PolicyScopeChips({ state }: Readonly<{ state: PolicyScopeState }>) {
  return (
    <div className="flex flex-wrap gap-2">
      {policyScopeChips(state).map((chip) => (
        <span
          className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${
            chip.isActive
              ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)]"
              : "border-[var(--vs-border-subtle)] bg-[var(--vs-surface)] vs-muted"
          }`}
          key={chip.id}
          title={`${chip.label}: ${chip.detail}`}
        >
          <span className="truncate">{chip.label}</span>
          <span className="max-w-32 truncate font-medium">{chip.detail}</span>
        </span>
      ))}
    </div>
  );
}

export function PolicyScopeSummary({
  display = "compact",
  state,
}: Readonly<{ display?: "compact" | "expanded" | "debug"; state: PolicyScopeState }>) {
  const summary = policyScopeSummary(state);
  if (display === "compact") {
    return (
      <span
        className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)]"
        title={summary.description}
      >
        <span className="sr-only">{summary.description}</span>
        <span className="shrink-0">Policy</span>
        <span className="min-w-0 truncate">{summary.compactLabel}</span>
      </span>
    );
  }

  return (
    <div className="grid gap-2">
      <div
        className="grid gap-1 rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-xs vs-border"
        title={summary.description}
      >
        <span className="font-semibold text-[var(--vs-text)]">
          Policy: {summary.currentProfileLabel}
        </span>
        <span className="vs-muted">Applies from {summary.ownershipLabel}</span>
      </div>
      <PolicyScopeChips state={state} />
      {display === "debug" ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs leading-5 vs-border vs-muted">
          {summary.description}
        </p>
      ) : null}
    </div>
  );
}

export interface SourcePolicyPinEditorProps {
  customProfiles?: { id: string; name: string }[];
  definition: SpeechPolicyDefinition;
  disabled?: boolean;
  error?: string | null;
  isSaving?: boolean;
  profiles: SpeechPolicyProfile[];
  sourceLifecycle?: SourceLifecycleEnvelope | null;
  sourceOverrides?: SpeechPolicyOverrides;
  sourceProfile?: string;
  onClear: () => Promise<void> | void;
  onSave: (request: SourceSpeechPolicyUpdateRequest) => Promise<void> | void;
}

export function SourcePolicyPinEditor({
  customProfiles = [],
  definition,
  disabled = false,
  error = null,
  isSaving = false,
  profiles,
  sourceLifecycle = null,
  sourceOverrides = {},
  sourceProfile,
  onClear,
  onSave,
}: Readonly<SourcePolicyPinEditorProps>) {
  const fields =
    definition.fields.length > 0 ? definition.fields : DEFAULT_SPEECH_POLICY_DEFINITION.fields;
  const options = useMemo(
    () => speechPolicyProfileOptions(definition, profiles, customProfiles),
    [customProfiles, definition, profiles],
  );
  const fallbackProfile = options[0].name;
  const [profile, setProfile] = useState(() =>
    sourcePolicyProfileValue(sourceProfile, options, fallbackProfile),
  );
  const [overrides, setOverrides] = useState<SpeechPolicyOverrides>(() =>
    normalizeSpeechPolicyOverrides(sourceOverrides),
  );

  useEffect(() => {
    setProfile(sourcePolicyProfileValue(sourceProfile, options, fallbackProfile));
    setOverrides(normalizeSpeechPolicyOverrides(sourceOverrides));
  }, [fallbackProfile, options, sourceOverrides, sourceProfile]);

  const hasPin =
    Boolean(sourceProfile) || Object.keys(compactSpeechPolicyOverrides(sourceOverrides)).length > 0;
  const savingDisabledReason =
    disabled || isSaving ? "Source policy pin is currently saving." : undefined;
  const clearPinDisabledReason = hasPin ? savingDisabledReason : "No source policy pin is set.";
  const lifecycleDescriptor = sourceLifecycle
    ? sourceLifecycleDescriptor(sourceLifecycle.canonicalState)
    : null;

  return (
    <div className="grid gap-3 rounded-md border p-3 vs-border">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          Source policy pin
          <ScopeBadge scope="source" />
        </h4>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
            hasPin
              ? "border-[var(--vs-status-success-border)] bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]"
              : "vs-border vs-muted"
          }`}
        >
          {hasPin ? "Pinned" : "Project default"}
        </span>
      </div>
      <p className="vs-muted text-xs leading-5">
        {sourceLifecycle
          ? `${settingsScopeAppliesTo("source")} Applies to ${sourceLifecycle.title} · ${
              sourceLifecycle.selectedScope
            }. ${sourcePolicyScopeLabel(sourceLifecycle.policyScope)} · ${
              lifecycleDescriptor?.label ?? "Lifecycle unknown"
            }.`
          : `${settingsScopeAppliesTo(
              "source",
            )} Applies to the selected source only; project and session settings still apply everywhere else.`}
      </p>
      <label className="grid gap-1 text-xs font-semibold">
        <span className="vs-muted">Profile</span>
        <select
          className="h-9 min-w-0 rounded-md border bg-[var(--vs-surface)] px-2 text-sm font-medium outline-none vs-border"
          data-testid="source-policy-pin-profile"
          data-disabled-reason={savingDisabledReason}
          disabled={disabled || isSaving}
          onChange={(event) => {
            setProfile(event.currentTarget.value);
          }}
          value={profile}
        >
          {options.map((option) => (
            <option key={option.name} value={option.name}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <details className="group">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--vs-action-primary)]">
          Pin field overrides
        </summary>
        <div className="mt-3 grid gap-2">
          {fields.map((field) => (
            <PolicyOverrideSelect
              field={field}
              key={field.key}
              value={overrides[field.key] ?? ""}
              onChange={(value) => {
                setOverrides((current) =>
                  compactSpeechPolicyOverrides({
                    ...current,
                    [field.key]: optionalOverrideValue(value),
                  }),
                );
              }}
            />
          ))}
        </div>
      </details>
      {error ? (
        <p className="rounded border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] px-2 py-1.5 text-xs text-[var(--vs-status-danger)]">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="h-9 rounded-md bg-[var(--vs-action-primary-hover)] px-3 text-xs font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50"
          data-testid="source-policy-save-pin"
          disabled={disabled || isSaving}
          data-disabled-reason={savingDisabledReason}
          onClick={() => {
            void onSave(sourcePolicyUpdateRequest(profile, overrides));
          }}
          type="button"
        >
          {isSaving ? "Saving..." : "Save pin"}
        </button>
        <button
          className="h-9 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
          data-confirm="Clear source policy pin"
          data-disabled-reason={clearPinDisabledReason}
          data-testid="source-policy-clear-pin"
          disabled={disabled || isSaving || !hasPin}
          onClick={() => {
            if (globalThis.confirm("Clear the selected source policy pin?")) {
              void onClear();
            }
          }}
          title={hasPin ? "Clear source policy pin" : "No source policy pin is set."}
          type="button"
        >
          Clear pin
        </button>
      </div>
    </div>
  );
}

function optionalOverrideValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return undefined;
}

function sourcePolicyProfileValue(
  sourceProfile: string | undefined,
  options: readonly { name: string }[],
  fallbackProfile: string,
): string {
  const trimmed = sourceProfile?.trim() ?? "";
  if (trimmed && options.some((option) => option.name === trimmed)) {
    return trimmed;
  }
  return fallbackProfile;
}

function PolicyOverrideSelect({
  field,
  value,
  onChange,
}: Readonly<{
  field: SpeechPolicyDefinitionField;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span className="vs-muted">{field.label}</span>
      <select
        className="h-8 min-w-0 rounded-md border bg-[var(--vs-surface)] px-2 text-xs outline-none vs-border"
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        value={value}
      >
        <option value="">Project/source profile default</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
