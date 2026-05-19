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
  sourcePolicyUpdateRequest,
  speechPolicyProfileOptions,
  type PolicyScopeState,
} from "./model";

export function PolicyScopeChips({ state }: Readonly<{ state: PolicyScopeState }>) {
  return (
    <div className="flex flex-wrap gap-2">
      {policyScopeChips(state).map((chip) => (
        <span
          className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${
            chip.isActive
              ? "border-orange-300 bg-orange-500/10 text-orange-700"
              : "border-zinc-200 bg-[var(--vs-surface)] vs-muted"
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

export interface SourcePolicyPinEditorProps {
  customProfiles?: { id: string; name: string }[];
  definition: SpeechPolicyDefinition;
  disabled?: boolean;
  error?: string | null;
  isSaving?: boolean;
  profiles: SpeechPolicyProfile[];
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
  sourceOverrides = {},
  sourceProfile,
  onClear,
  onSave,
}: Readonly<SourcePolicyPinEditorProps>) {
  const fallbackProfile = definition.profiles[0]?.name ?? "Enterprise";
  const [profile, setProfile] = useState(sourceProfile?.trim() ? sourceProfile : fallbackProfile);
  const [overrides, setOverrides] = useState<SpeechPolicyOverrides>(() =>
    normalizeSpeechPolicyOverrides(sourceOverrides),
  );
  const fields =
    definition.fields.length > 0 ? definition.fields : DEFAULT_SPEECH_POLICY_DEFINITION.fields;
  const options = useMemo(
    () => speechPolicyProfileOptions(definition, profiles, customProfiles),
    [customProfiles, definition, profiles],
  );

  useEffect(() => {
    setProfile(sourceProfile?.trim() ? sourceProfile : (options[0]?.name ?? "Enterprise"));
    setOverrides(normalizeSpeechPolicyOverrides(sourceOverrides));
  }, [options, sourceOverrides, sourceProfile]);

  const hasPin =
    Boolean(sourceProfile) || Object.keys(compactSpeechPolicyOverrides(sourceOverrides)).length > 0;

  return (
    <div className="grid gap-3 rounded-md border p-3 vs-border">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Source policy pin</h4>
        {hasPin ? (
          <span className="rounded-full border border-orange-300 bg-orange-500/10 px-2 py-0.5 text-xs font-semibold text-orange-700">
            Pinned
          </span>
        ) : (
          <span className="rounded-full border px-2 py-0.5 text-xs font-semibold vs-border vs-muted">
            Project default
          </span>
        )}
      </div>
      <label className="grid gap-1 text-xs font-semibold">
        <span className="vs-muted">Profile</span>
        <select
          className="h-9 min-w-0 rounded-md border bg-[var(--vs-surface)] px-2 text-sm font-medium outline-none vs-border"
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
        <summary className="cursor-pointer text-xs font-semibold text-orange-600">
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
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="h-9 rounded-md bg-orange-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
          disabled={disabled || isSaving}
          onClick={() => {
            void onSave(sourcePolicyUpdateRequest(profile, overrides));
          }}
          type="button"
        >
          {isSaving ? "Saving..." : "Save pin"}
        </button>
        <button
          className="h-9 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
          disabled={disabled || isSaving || !hasPin}
          onClick={() => {
            void onClear();
          }}
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
