import { useEffect, useMemo, useState } from "react";
import { Button, Panel, StatusChip, fieldControlClassName } from "../../design";
import {
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
import {
  buildGoldenMinutePolicyComparison,
  buildGoldenMinutePolicyPreview,
  exportSpeechPolicyProfileJson,
} from "./policyPreview";
import { settingsScopeAppliesTo } from "../settings/model";
import {
  GoldenMinuteComparisonView,
  PolicyFieldSelect,
  PreviewFact,
  PreviewList,
  ScopeFact,
  WizardStepHeader,
  goldenMinutePreviewForProfile,
  handleImportProfile,
  policyProfileSummary,
} from "./speechPolicyWizardHelpers";

const GUIDED_POLICY_KEYS: (keyof SpeechPolicyOverrides)[] = [
  "tableMode",
  "codeMode",
  "mathMode",
  "citationMode",
  "footnoteMode",
];

type SpeechPolicyDefinitionField = SpeechPolicyDefinition["fields"][number];

function resolveGuidedPolicyFields(
  definitionFields: readonly SpeechPolicyDefinitionField[],
): SpeechPolicyDefinitionField[] {
  return GUIDED_POLICY_KEYS.map((key) =>
    definitionFields.find((field) => field.key === key),
  ).filter(Boolean) as SpeechPolicyDefinitionField[];
}

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

  const guidedFields = resolveGuidedPolicyFields(definitionFields);

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
