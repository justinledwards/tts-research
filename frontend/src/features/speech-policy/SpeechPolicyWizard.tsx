import { useEffect, useMemo, useState } from "react";
import { Button, Panel, StatusChip, fieldControlClassName } from "../../design";
import {
  DEFAULT_SPEECH_POLICY_DEFINITION,
  applySpeechPolicyOverridesToSettings,
  hasSpeechPolicyOverrides,
  normalizeSpeechPolicyProfile,
  resolveSpeechPolicySettings,
  speechPolicyProfileDisplayName,
  speechPolicyProfileLabel,
} from "../../speechPolicy";
import type {
  CustomSpeechPolicyProfile,
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SpeechPolicySettings,
} from "../../types";
import { policyOverridesWithField, resolveSpeechPolicyProfileOptions } from "../policy";
import { ScopeBadge } from "../settings/ScopeBadge";
import { settingsScopeAppliesTo } from "../settings/model";
import {
  buildSpeechPolicyPreview,
  exportSpeechPolicyProfileJson,
  formatPolicyValue,
  parseSpeechPolicyProfileJson,
} from "./policyPreview";

const GUIDED_POLICY_KEYS: (keyof SpeechPolicyOverrides)[] = [
  "tableMode",
  "codeMode",
  "mathMode",
  "citationMode",
  "footnoteMode",
];

export function SpeechPolicyWizard({
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
  const [customProfileName, setCustomProfileName] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const definitionFields =
    definition.fields.length > 0 ? definition.fields : DEFAULT_SPEECH_POLICY_DEFINITION.fields;
  const profileOptions = resolveSpeechPolicyProfileOptions(definition, profiles);
  const activeCustomProfile = customProfiles.find((item) => item.id === profile) ?? null;
  const baseSettings = resolveSpeechPolicySettings(profile, profileOptions, customProfiles);
  const effectiveSettings = applySpeechPolicyOverridesToSettings(baseSettings, overrides);
  const baseProfile = activeCustomProfile?.baseProfile ?? profile;
  const displayName = speechPolicyProfileDisplayName(profile, customProfiles);
  const preview = useMemo(() => buildSpeechPolicyPreview(effectiveSettings), [effectiveSettings]);
  const profileJson = useMemo(
    () => exportSpeechPolicyProfileJson(displayName, baseProfile, effectiveSettings),
    [baseProfile, displayName, effectiveSettings],
  );

  useEffect(() => {
    setCustomProfileName(`${displayName} custom`);
  }, [displayName]);

  const guidedFields = GUIDED_POLICY_KEYS.map((key) =>
    definitionFields.find((field) => field.key === key),
  ).filter(Boolean) as SpeechPolicyDefinition["fields"];

  const importDisabled = importText.trim().length === 0;

  return (
    <Panel
      className="grid gap-4 p-3"
      data-testid="speech-policy-wizard"
      data-ui-action-surface="Settings"
      title="Speech policy wizard"
      variant="surface"
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ScopeFact scope="session" value="Temporary overrides" />
        <ScopeFact scope="source" value="Selected-source pins below" />
        <ScopeFact scope="project" value={displayName} />
        <ScopeFact scope="machine" value="Engine defaults only" />
      </div>

      <section className="grid gap-3" aria-labelledby="policy-wizard-profile">
        <WizardStepHeader
          id="policy-wizard-profile"
          detail="Choose the market profile that defines the default spoken form."
          label="1. Speech profile"
          scope="project"
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {profileOptions.map((option) => (
            <Button
              align="start"
              className="grid gap-1 p-3"
              data-testid={`speech-policy-profile-${option.name}`}
              key={option.name}
              onClick={() => {
                onProfileChange(normalizeSpeechPolicyProfile(option.name));
              }}
              selected={profile === option.name}
              variant="mode"
            >
              <span className="font-semibold">
                {option.label || speechPolicyProfileLabel(option.name)}
              </span>
              <span className="vs-muted text-xs leading-5">
                {option.description || policyProfileSummary(option.settings)}
              </span>
            </Button>
          ))}
          {customProfiles.map((option) => (
            <Button
              align="start"
              className="grid gap-1 p-3"
              data-testid={`speech-policy-profile-${option.id}`}
              key={option.id}
              onClick={() => {
                onProfileChange(option.id);
              }}
              selected={profile === option.id}
              variant="pinned"
            >
              <span className="font-semibold">{option.name}</span>
              <span className="vs-muted text-xs leading-5">
                Custom profile based on{" "}
                {speechPolicyProfileLabel(option.baseProfile ?? "Enterprise")}.
              </span>
            </Button>
          ))}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="policy-wizard-structured">
        <WizardStepHeader
          id="policy-wizard-structured"
          detail="Adjust the structured-content decisions normal users most often need."
          label="2. Structured content"
          scope="session"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {guidedFields.map((field) => (
            <PolicyFieldSelect
              field={field}
              key={field.key}
              profileDefault={baseSettings[field.key]}
              value={overrides[field.key] ?? ""}
              onChange={(value) => {
                onOverridesChange(policyOverridesWithField(overrides, field.key, value));
              }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasSpeechPolicyOverrides(overrides) ? (
            <Button
              data-testid="speech-policy-clear-overrides"
              onClick={onClearOverrides}
              size="sm"
              variant="soft"
            >
              Clear session overrides
            </Button>
          ) : null}
          {isPreviewing ? (
            <StatusChip tone="info">Updating preview</StatusChip>
          ) : (
            <StatusChip tone="neutral">Preview current</StatusChip>
          )}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="policy-wizard-preview">
        <WizardStepHeader
          id="policy-wizard-preview"
          detail="The sample updates immediately, before a paid or slow generation run starts."
          label="3. Preview sample sentence"
          scope="session"
        />
        <div className="grid gap-2 xl:grid-cols-2">
          {preview.items.map((item) => (
            <Panel className="grid gap-2 p-3" key={item.id} variant="raised">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-sm font-semibold">{item.label}</h5>
                <StatusChip tone="accent">{formatPolicyValue(item.id)}</StatusChip>
              </div>
              <p className="rounded-md border bg-[var(--vs-surface)] px-3 py-2 font-mono text-xs vs-border">
                {item.written}
              </p>
              <p className="text-sm leading-6">{item.spoken}</p>
              <p className="vs-muted text-xs leading-5">{item.note}</p>
            </Panel>
          ))}
        </div>
        <ul className="grid gap-1 text-xs leading-5 vs-muted">
          {preview.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3" aria-labelledby="policy-wizard-json">
        <WizardStepHeader
          id="policy-wizard-json"
          detail="Export the effective profile or import a profile JSON file into project defaults."
          label="4. JSON profiles"
          scope="project"
        />
        <div className="grid gap-3 xl:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold">
            <span>Export effective profile</span>
            <textarea
              className={`${fieldControlClassName} min-h-[13rem] resize-y font-mono leading-5`}
              data-testid="speech-policy-json-export"
              readOnly
              value={profileJson}
            />
          </label>
          <div className="grid gap-2">
            <label className="grid gap-1 text-xs font-semibold">
              <span>Import profile JSON</span>
              <textarea
                className={`${fieldControlClassName} min-h-[9rem] resize-y font-mono leading-5`}
                data-testid="speech-policy-json-import"
                onChange={(event) => {
                  setImportText(event.currentTarget.value);
                  setImportError(null);
                  setImportStatus(null);
                }}
                placeholder={profileJson}
                value={importText}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                data-testid="speech-policy-import-json"
                disabled={importDisabled}
                disabledReason={
                  importDisabled ? "Paste a speech-policy profile JSON object first." : undefined
                }
                onClick={() => {
                  void handleImportProfile({
                    baseProfile,
                    fallbackName: `${displayName} import`,
                    fallbackSettings: effectiveSettings,
                    importText,
                    onCreateCustomProfile,
                    setImportError,
                    setImportStatus,
                  });
                }}
                variant="primary"
              >
                Import JSON profile
              </Button>
              <Button
                data-testid="speech-policy-save-current"
                onClick={() => {
                  void onCreateCustomProfile(customProfileName, effectiveSettings, baseProfile);
                }}
                variant="secondary"
              >
                Save current profile
              </Button>
            </div>
            <label className="grid gap-1 text-xs font-semibold">
              <span>Saved profile name</span>
              <input
                className={fieldControlClassName}
                data-testid="speech-policy-profile-name"
                onChange={(event) => {
                  setCustomProfileName(event.currentTarget.value);
                }}
                value={customProfileName}
              />
            </label>
            {activeCustomProfile ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  data-testid="speech-policy-update-selected"
                  onClick={() => {
                    void onUpdateCustomProfile(
                      activeCustomProfile.id,
                      customProfileName,
                      effectiveSettings,
                      baseProfile,
                    );
                  }}
                  variant="secondary"
                >
                  Update selected
                </Button>
                <Button
                  data-testid="speech-policy-delete-selected"
                  onClick={() => {
                    void onDeleteCustomProfile(activeCustomProfile.id);
                  }}
                  variant="destructive"
                >
                  Delete selected
                </Button>
              </div>
            ) : null}
            {importError ? (
              <p className="text-xs font-semibold text-red-700">{importError}</p>
            ) : null}
            {importStatus ? (
              <p className="text-xs font-semibold text-emerald-700">{importStatus}</p>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <p className="vs-muted text-xs leading-5">{settingsScopeAppliesTo("project")}</p>
    </Panel>
  );
}

function ScopeFact({
  scope,
  value,
}: Readonly<{ scope: "session" | "source" | "project" | "machine"; value: string }>) {
  return (
    <Panel className="grid gap-1 p-3" variant="raised">
      <span className="flex items-center gap-2 text-xs font-semibold">
        <ScopeBadge scope={scope} />
        {settingsScopeAppliesTo(scope)}
      </span>
      <span className="truncate text-sm font-semibold" title={value}>
        {value}
      </span>
    </Panel>
  );
}

function WizardStepHeader({
  detail,
  id,
  label,
  scope,
}: Readonly<{
  detail: string;
  id: string;
  label: string;
  scope: "session" | "source" | "project" | "machine";
}>) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t pt-3 vs-border">
      <div>
        <h4 className="text-sm font-semibold" id={id}>
          {label}
        </h4>
        <p className="vs-muted mt-1 text-xs leading-5">{detail}</p>
      </div>
      <ScopeBadge scope={scope} />
    </div>
  );
}

function PolicyFieldSelect({
  field,
  profileDefault,
  value,
  onChange,
}: Readonly<{
  field: SpeechPolicyDefinition["fields"][number];
  profileDefault: string | undefined;
  value: string;
  onChange: (value: string | undefined) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span className="flex items-center gap-2">
        {field.label}
        <ScopeBadge scope="session" />
      </span>
      <select
        className={`${fieldControlClassName} min-w-0`}
        data-testid={`speech-policy-field-${field.key}`}
        onChange={(event) => {
          onChange(event.currentTarget.value || undefined);
        }}
        value={value}
      >
        <option value="">Profile default: {formatPolicyValue(profileDefault ?? "speak")}</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label || formatPolicyValue(option.value)}
          </option>
        ))}
      </select>
      {field.description ? <span className="vs-muted leading-5">{field.description}</span> : null}
    </label>
  );
}

function policyProfileSummary(settings: SpeechPolicySettings): string {
  return [
    `Tables ${formatPolicyValue(settings.tableMode)}`,
    `code ${formatPolicyValue(settings.codeMode)}`,
    `citations ${formatPolicyValue(settings.citationMode)}`,
  ].join(" · ");
}

async function handleImportProfile({
  baseProfile,
  fallbackName,
  fallbackSettings,
  importText,
  onCreateCustomProfile,
  setImportError,
  setImportStatus,
}: {
  baseProfile: string;
  fallbackName: string;
  fallbackSettings: SpeechPolicySettings;
  importText: string;
  onCreateCustomProfile: (
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  setImportError: (message: string | null) => void;
  setImportStatus: (message: string | null) => void;
}) {
  try {
    const imported = parseSpeechPolicyProfileJson(
      importText,
      fallbackName,
      baseProfile,
      fallbackSettings,
    );
    await onCreateCustomProfile(imported.name, imported.settings, imported.baseProfile);
    setImportStatus(`Imported ${imported.name}.`);
    setImportError(null);
  } catch (error) {
    setImportError(error instanceof Error ? error.message : "Import failed.");
    setImportStatus(null);
  }
}
