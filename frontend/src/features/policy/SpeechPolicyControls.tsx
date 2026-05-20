import { useEffect, useState } from "react";
import type {
  CustomSpeechPolicyProfile,
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SpeechPolicySettings,
} from "../../types";
import {
  BUILT_IN_SPEECH_POLICY_SETTINGS,
  DEFAULT_SPEECH_POLICY_DEFINITION,
  SPEECH_POLICY_PROFILE_OPTIONS,
  applySpeechPolicyOverridesToSettings,
  compactSpeechPolicyOverrides,
  hasSpeechPolicyOverrides,
  normalizeSpeechPolicyProfile,
  resolveSpeechPolicySettings,
  speechPolicyProfileDisplayName,
  speechPolicyProfileLabel,
} from "../../speechPolicy";
import { ScopeBadge } from "../settings/ScopeBadge";
import { settingsScopeAppliesTo } from "../settings/model";

export function SpeechPolicyControls({
  customProfiles,
  definition,
  error,
  isPreviewing,
  overrides,
  profile,
  profiles,
  onClearOverrides,
  onCreateCustomProfile,
  onDeleteCustomProfile,
  onOverridesChange,
  onProfileChange,
  onUpdateCustomProfile,
}: Readonly<{
  customProfiles: CustomSpeechPolicyProfile[];
  definition: SpeechPolicyDefinition;
  error: string | null;
  isPreviewing: boolean;
  overrides: SpeechPolicyOverrides;
  profile: string;
  profiles: SpeechPolicyProfile[];
  onClearOverrides: () => void;
  onCreateCustomProfile: (
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  onDeleteCustomProfile: (profileId: string) => Promise<void>;
  onOverridesChange: (overrides: SpeechPolicyOverrides) => void;
  onProfileChange: (profile: string) => void;
  onUpdateCustomProfile: (
    profileId: string,
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
}>) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isDefaultsOpen, setIsDefaultsOpen] = useState(false);
  const [isCustomFormOpen, setIsCustomFormOpen] = useState(false);
  const activeCustomProfile = customProfiles.find((item) => item.id === profile) ?? null;
  const [customProfileName, setCustomProfileName] = useState("");
  const definitionFields =
    definition.fields.length > 0 ? definition.fields : DEFAULT_SPEECH_POLICY_DEFINITION.fields;
  const profileOptions = resolveSpeechPolicyProfileOptions(definition, profiles);
  const baseSettings = resolveSpeechPolicySettings(profile, profileOptions, customProfiles);
  const effectiveSettings = applySpeechPolicyOverridesToSettings(baseSettings, overrides);
  const baseProfile = activeCustomProfile?.baseProfile ?? profile;
  const customNamePlaceholder = `${speechPolicyProfileDisplayName(profile, customProfiles)} copy`;

  useEffect(() => {
    setCustomProfileName(activeCustomProfile?.name ?? customNamePlaceholder);
  }, [activeCustomProfile?.name, customNamePlaceholder]);

  return (
    <section className="grid gap-3 rounded-lg border bg-[var(--vs-raised)] p-3 vs-border">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="grid min-w-0 gap-1 text-sm font-semibold text-[var(--vs-text)]">
          <span className="flex items-center gap-2">
            Profile
            <ScopeBadge scope="project" />
          </span>
          <select
            className="h-10 min-w-0 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 vs-border"
            onChange={(event) => {
              onProfileChange(normalizeSpeechPolicyProfile(event.currentTarget.value));
            }}
            value={profile}
          >
            {profileOptions.map((option) => (
              <option key={option.name} value={option.name}>
                {option.label || speechPolicyProfileLabel(option.name)}
              </option>
            ))}
            {customProfiles.length > 0 ? (
              <optgroup label="Custom profiles">
                {customProfiles.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {isPreviewing ? (
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
              Updating preview
            </span>
          ) : null}
          <button
            className="h-9 rounded-md border px-3 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700 vs-border"
            onClick={() => {
              setIsAdvancedOpen((current) => !current);
            }}
            type="button"
          >
            Advanced
          </button>
          <button
            className="h-9 rounded-md border px-3 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700 vs-border"
            onClick={() => {
              setIsDefaultsOpen((current) => !current);
            }}
            type="button"
          >
            Defaults
          </button>
          <button
            className="h-9 rounded-md border px-3 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700 vs-border"
            onClick={() => {
              setIsCustomFormOpen((current) => !current);
            }}
            type="button"
          >
            Save as profile
          </button>
          {hasSpeechPolicyOverrides(overrides) ? (
            <button
              className="h-9 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800"
              onClick={onClearOverrides}
              type="button"
            >
              Clear overrides
            </button>
          ) : null}
        </div>
      </div>
      <p className="vs-muted text-xs leading-5">{settingsScopeAppliesTo("project")}</p>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {isDefaultsOpen ? (
        <SpeechPolicyDefaultsTable fields={definitionFields} profiles={profileOptions} />
      ) : null}
      {isAdvancedOpen ? (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 vs-border">
          {definitionFields.map((field) => (
            <PolicyModeSelect
              key={field.key}
              label={field.label}
              options={field.options}
              value={overrides[field.key] ?? ""}
              onChange={(value) => {
                onOverridesChange(policyOverridesWithField(overrides, field.key, value));
              }}
            />
          ))}
        </div>
      ) : null}
      {isCustomFormOpen ? (
        <div className="grid gap-3 border-t pt-3 vs-border">
          <label className="grid gap-1 text-xs font-semibold">
            <span>Profile name</span>
            <input
              className="h-9 rounded-md border bg-[var(--vs-surface)] px-3 text-sm outline-none focus:border-orange-400 vs-border"
              onChange={(event) => {
                setCustomProfileName(event.currentTarget.value);
              }}
              value={customProfileName}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="h-9 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white"
              onClick={() => {
                void onCreateCustomProfile(customProfileName, effectiveSettings, baseProfile);
              }}
              type="button"
            >
              Save new profile
            </button>
            {activeCustomProfile ? (
              <>
                <button
                  className="h-9 rounded-md border px-3 text-xs font-semibold vs-border"
                  onClick={() => {
                    void onUpdateCustomProfile(
                      activeCustomProfile.id,
                      customProfileName,
                      effectiveSettings,
                      baseProfile,
                    );
                  }}
                  type="button"
                >
                  Update selected
                </button>
                <button
                  className="h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700"
                  onClick={() => {
                    void onDeleteCustomProfile(activeCustomProfile.id);
                  }}
                  type="button"
                >
                  Delete selected
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SpeechPolicyDefaultsTable({
  fields,
  profiles,
}: Readonly<{
  fields: SpeechPolicyDefinition["fields"];
  profiles: Pick<SpeechPolicyProfile, "name" | "label" | "settings">[];
}>) {
  const headers = ["Profile", "Mode", ...fields.map((field) => field.label)];
  return (
    <div className="overflow-x-auto border-t pt-3 vs-border">
      <table className="min-w-[960px] border-collapse text-left text-xs">
        <thead className="bg-[var(--vs-surface)] text-[0.68rem] uppercase tracking-[0.14em] vs-muted">
          <tr>
            {headers.map((header) => (
              <th className="border px-3 py-2 vs-border" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profiles.map((item) => (
            <tr key={item.name}>
              <td className="border px-3 py-2 font-semibold vs-border">
                {item.label || speechPolicyProfileLabel(item.name)}
              </td>
              <td className="border px-3 py-2 vs-border">
                {formatPolicyModeLabel(item.settings.mode)}
              </td>
              {fields.map((field) => (
                <td className="border px-3 py-2 vs-border" key={field.key}>
                  {formatPolicyModeLabel(item.settings[field.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function resolveSpeechPolicyProfileOptions(
  definition: SpeechPolicyDefinition,
  profiles: SpeechPolicyProfile[],
): SpeechPolicyProfile[] {
  if (definition.profiles.length > 0) {
    return definition.profiles;
  }
  if (profiles.length > 0) {
    return profiles;
  }
  return SPEECH_POLICY_PROFILE_OPTIONS.map(
    (name): SpeechPolicyProfile => ({
      description: "",
      label: speechPolicyProfileLabel(name),
      name,
      settings: { ...BUILT_IN_SPEECH_POLICY_SETTINGS[name] },
    }),
  );
}

export function policyOverridesWithField(
  overrides: SpeechPolicyOverrides,
  key: SpeechPolicyDefinition["fields"][number]["key"],
  value: string | undefined,
): SpeechPolicyOverrides {
  return compactSpeechPolicyOverrides({
    ...overrides,
    [key]: value,
  });
}

function PolicyModeSelect({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: SpeechPolicyDefinition["fields"][number]["options"];
  value: string;
  onChange: (value: string | undefined) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span className="flex items-center gap-2">
        {label}
        <ScopeBadge scope="session" />
      </span>
      <select
        className="h-9 min-w-0 rounded-md border bg-[var(--vs-surface)] px-2 text-xs outline-none focus:border-orange-400 vs-border"
        onChange={(event) => {
          onChange(event.currentTarget.value || undefined);
        }}
        value={value}
      >
        <option value="">Profile default</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label || formatPolicyModeLabel(option.value)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function formatPolicyModeLabel(value: string): string {
  if (value === "rowLinear") {
    return "Row linear";
  }
  if (value === "syntaxAware") {
    return "Syntax aware";
  }
  if (value === "literalsafe") {
    return "Literal safe";
  }
  if (value === "altFirst") {
    return "Alt first";
  }
  if (value === "describeShort") {
    return "Describe short";
  }
  if (value === "describeLong") {
    return "Describe long";
  }
  if (value === "onDemand") {
    return "On demand";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
