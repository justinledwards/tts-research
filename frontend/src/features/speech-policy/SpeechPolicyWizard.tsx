import { useEffect, useMemo, useState } from "react";
import { Button, Panel, StatusChip, fieldControlClassName } from "../../design";
import {
  BUILT_IN_SPEECH_POLICY_SETTINGS,
  DEFAULT_SPEECH_POLICY_PROFILE,
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
  buildGoldenMinutePolicyComparison,
  buildGoldenMinutePolicyPreview,
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

type GoldenMinuteCompareMode =
  | "enterprise-education"
  | "accessibility-technical"
  | "custom-project";

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
  const [goldenMinuteCompareMode, setGoldenMinuteCompareMode] =
    useState<GoldenMinuteCompareMode>("enterprise-education");
  const goldenMinutePreview = useMemo(
    () => buildGoldenMinutePolicyPreview(effectiveSettings, `${displayName} effective`),
    [displayName, effectiveSettings],
  );
  const goldenMinuteProfilePreviews = useMemo(
    () => [
      ...profileOptions.map((option) =>
        buildGoldenMinutePolicyPreview(
          option.settings,
          option.label || speechPolicyProfileLabel(option.name),
        ),
      ),
      ...customProfiles.map((customProfile) =>
        buildGoldenMinutePolicyPreview(customProfile.settings, customProfile.name),
      ),
    ],
    [customProfiles, profileOptions],
  );
  const enterpriseEducationComparison = useMemo(
    () =>
      buildGoldenMinutePolicyComparison(
        goldenMinutePreviewForProfile("Enterprise", profileOptions, customProfiles),
        goldenMinutePreviewForProfile("Education", profileOptions, customProfiles),
      ),
    [customProfiles, profileOptions],
  );
  const accessibilityTechnicalComparison = useMemo(
    () =>
      buildGoldenMinutePolicyComparison(
        goldenMinutePreviewForProfile("Accessibility", profileOptions, customProfiles),
        goldenMinutePreviewForProfile("TechnicalDocs", profileOptions, customProfiles),
      ),
    [customProfiles, profileOptions],
  );
  const customProfileForComparison = activeCustomProfile ?? customProfiles.at(0);
  const customProjectComparison = useMemo(() => {
    if (!customProfileForComparison) {
      return null;
    }
    const baseProfileName = customProfileForComparison.baseProfile ?? DEFAULT_SPEECH_POLICY_PROFILE;
    return buildGoldenMinutePolicyComparison(
      buildGoldenMinutePolicyPreview(
        customProfileForComparison.settings,
        `${customProfileForComparison.name} custom`,
      ),
      goldenMinutePreviewForProfile(baseProfileName, profileOptions, []),
    );
  }, [customProfileForComparison, profileOptions]);
  let goldenMinuteComparison = enterpriseEducationComparison;
  if (goldenMinuteCompareMode === "accessibility-technical") {
    goldenMinuteComparison = accessibilityTechnicalComparison;
  } else if (goldenMinuteCompareMode === "custom-project" && customProjectComparison) {
    goldenMinuteComparison = customProjectComparison;
  }
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

      <section
        className="grid gap-3"
        aria-labelledby="policy-wizard-golden-minute"
        data-testid="speech-policy-golden-minute-preview"
      >
        <WizardStepHeader
          id="policy-wizard-golden-minute"
          detail="Preview the canonical one-minute fixture before a paid or slow generation run starts."
          label="3. Golden-minute policy preview"
          scope="session"
        />
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
          <Panel
            className="grid max-h-[34rem] gap-3 overflow-auto p-3"
            data-testid="speech-policy-golden-spoken-preview"
            title="Visual spoken-text preview"
            variant="raised"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="accent">{goldenMinutePreview.profileLabel}</StatusChip>
              <StatusChip tone="info">
                {goldenMinutePreview.highlightGranularity} highlight
              </StatusChip>
            </div>
            <p className="vs-muted text-xs leading-5">{goldenMinutePreview.speechPlanSummary}</p>
            <ol className="grid gap-2">
              {goldenMinutePreview.segments.map((segment) => (
                <li className="grid gap-1 rounded-md border p-3 vs-border" key={segment.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold">
                      {segment.id} · {segment.label}
                    </span>
                    <span className="vs-muted text-[0.7rem]">{segment.sourceLocator}</span>
                  </div>
                  <p className="rounded-md bg-[var(--vs-surface)] px-3 py-2 font-mono text-xs leading-5">
                    {segment.written}
                  </p>
                  <p className="text-sm leading-6">{segment.spoken}</p>
                  <p className="vs-muted text-xs leading-5">{segment.policyNote}</p>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel className="grid gap-3 p-3" title="Speech and highlight plan" variant="raised">
            <PreviewFact label="Citation handling" value={goldenMinutePreview.citationHandling} />
            <PreviewFact label="Highlight plan" value={goldenMinutePreview.highlightPlan} />
            <PreviewList
              items={goldenMinutePreview.pronunciationSubstitutions}
              label="Pronunciation substitutions"
            />
            <PreviewList items={goldenMinutePreview.pauseChanges} label="Pause changes" />
          </Panel>
        </div>

        <Panel
          className="grid gap-3 p-3"
          data-testid="speech-policy-golden-profile-matrix"
          title="Policy profile impact"
          variant="raised"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {goldenMinuteProfilePreviews.map((previewItem) => (
              <div
                className="grid gap-2 rounded-md border p-3 vs-border"
                key={previewItem.profileLabel}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h5 className="text-sm font-semibold">{previewItem.profileLabel}</h5>
                  <StatusChip tone="neutral">{previewItem.highlightGranularity}</StatusChip>
                </div>
                <p className="vs-muted text-xs leading-5">{previewItem.citationHandling}</p>
                <p className="text-xs leading-5">{previewItem.highlightPlan}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          className="grid gap-3 p-3"
          data-testid="speech-policy-golden-ab-compare"
          title="A/B compare"
          variant="raised"
        >
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="speech-policy-ab-enterprise-education"
              onClick={() => {
                setGoldenMinuteCompareMode("enterprise-education");
              }}
              selected={goldenMinuteCompareMode === "enterprise-education"}
              size="sm"
              variant="mode"
            >
              Enterprise vs Education
            </Button>
            <Button
              data-testid="speech-policy-ab-accessibility-technical"
              onClick={() => {
                setGoldenMinuteCompareMode("accessibility-technical");
              }}
              selected={goldenMinuteCompareMode === "accessibility-technical"}
              size="sm"
              variant="mode"
            >
              Accessibility vs Technical Docs
            </Button>
            <Button
              data-testid="speech-policy-ab-custom-project"
              disabled={!customProjectComparison}
              disabledReason={
                customProjectComparison
                  ? undefined
                  : "Save a custom speech-policy profile before comparing it with the project default."
              }
              onClick={() => {
                setGoldenMinuteCompareMode("custom-project");
              }}
              selected={goldenMinuteCompareMode === "custom-project"}
              size="sm"
              variant="mode"
            >
              Custom vs project default
            </Button>
          </div>
          <GoldenMinuteComparisonView comparison={goldenMinuteComparison} />
        </Panel>
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

function PreviewFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-1 rounded-md border p-3 vs-border">
      <span className="text-xs font-semibold">{label}</span>
      <p className="vs-muted text-xs leading-5">{value}</p>
    </div>
  );
}

function PreviewList({ items, label }: Readonly<{ items: string[]; label: string }>) {
  return (
    <div className="grid gap-1 rounded-md border p-3 vs-border">
      <h5 className="text-xs font-semibold">{label}</h5>
      <ul className="grid gap-1 text-xs leading-5 vs-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function GoldenMinuteComparisonView({
  comparison,
}: Readonly<{
  comparison: ReturnType<typeof buildGoldenMinutePolicyComparison>;
}>) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <GoldenMinuteComparisonColumn preview={comparison.left} />
      <GoldenMinuteComparisonColumn preview={comparison.right} />
      <div className="grid gap-2 rounded-md border p-3 vs-border xl:col-span-2">
        <h5 className="text-xs font-semibold">Differences</h5>
        <ul className="grid gap-1 text-xs leading-5 vs-muted">
          {comparison.differences.map((difference) => (
            <li key={difference}>{difference}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function GoldenMinuteComparisonColumn({
  preview,
}: Readonly<{
  preview: ReturnType<typeof buildGoldenMinutePolicyPreview>;
}>) {
  return (
    <div className="grid gap-2 rounded-md border p-3 vs-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold">{preview.profileLabel}</h5>
        <StatusChip tone="info">{preview.highlightGranularity}</StatusChip>
      </div>
      <p className="text-xs leading-5">{preview.citationHandling}</p>
      <p className="vs-muted text-xs leading-5">{preview.highlightPlan}</p>
      <p className="rounded-md bg-[var(--vs-surface)] px-3 py-2 text-xs leading-5">
        {preview.segments.find((segment) => segment.id === "gm-p3")?.spoken}
      </p>
    </div>
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

function goldenMinutePreviewForProfile(
  profileName: string,
  profileOptions: SpeechPolicyProfile[],
  customProfiles: CustomSpeechPolicyProfile[],
) {
  const customProfile = customProfiles.find((item) => item.id === profileName);
  if (customProfile) {
    return buildGoldenMinutePolicyPreview(customProfile.settings, customProfile.name);
  }
  const profileOption = profileOptions.find((item) => item.name === profileName);
  return buildGoldenMinutePolicyPreview(
    profileOption?.settings ?? BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise,
    profileOption?.label ?? speechPolicyProfileLabel(profileName),
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
