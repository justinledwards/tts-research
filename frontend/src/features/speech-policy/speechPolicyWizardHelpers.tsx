import { Panel, StatusChip, fieldControlClassName } from "../../design";
import { BUILT_IN_SPEECH_POLICY_SETTINGS, speechPolicyProfileLabel } from "../../speechPolicy";
import type {
  CustomSpeechPolicyProfile,
  SpeechPolicyDefinition,
  SpeechPolicyProfile,
  SpeechPolicySettings,
} from "../../types";
import {
  buildGoldenMinutePolicyComparison,
  buildGoldenMinutePolicyPreview,
  parseSpeechPolicyProfileJson,
} from "./policyPreview";
import { ScopeBadge } from "../settings/ScopeBadge";
import { settingsScopeAppliesTo } from "../settings/model";
import { formatPolicyValue } from "./policyPreview";

export function ScopeFact({
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

export function PreviewFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-1 rounded-md border p-3 vs-border">
      <span className="text-xs font-semibold">{label}</span>
      <p className="vs-muted text-xs leading-5">{value}</p>
    </div>
  );
}

export function PreviewList({ items, label }: Readonly<{ items: string[]; label: string }>) {
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

export function GoldenMinuteComparisonView({
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

export function WizardStepHeader({
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

export function goldenMinutePreviewForProfile(
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

export function PolicyFieldSelect({
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
        <option value="">{`Profile default: ${formatPolicyValue(profileDefault ?? "speak")}`}</option>
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

export function policyProfileSummary(settings: SpeechPolicySettings): string {
  return [
    `Tables ${formatPolicyValue(settings.tableMode)}`,
    `code ${formatPolicyValue(settings.codeMode)}`,
    `citations ${formatPolicyValue(settings.citationMode)}`,
  ].join(" · ");
}

export async function handleImportProfile({
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
