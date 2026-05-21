import type { RunMode } from "../../types";

export interface PreviewComparisonOption {
  readonly detail?: string;
  readonly id: string;
  readonly label: string;
}

export interface PreviewComparisonChoice {
  readonly policyId: string;
  readonly runMode: RunMode;
  readonly voiceId: string;
}

export interface PreviewComparisonModel {
  readonly choiceA: PreviewComparisonChoice;
  readonly choiceB: PreviewComparisonChoice;
  readonly differences: PreviewComparisonDifference[];
  readonly hasDifference: boolean;
}

export interface PreviewComparisonDifference {
  readonly changed: boolean;
  readonly currentLabel: string;
  readonly nextLabel: string;
  readonly kind: "policy" | "run" | "voice";
  readonly label: string;
}

export const PREVIEW_RUN_COMPARISON_OPTIONS: readonly PreviewComparisonOption[] = [
  {
    detail: "Fastest pass for timing, phrasing, and read-along review.",
    id: "draftPreview",
    label: "Draft Preview",
  },
  {
    detail: "Daily output when speed matters more than checker validation.",
    id: "fastCreate",
    label: "Fast Create",
  },
  {
    detail: "Balanced production pass with checker confidence.",
    id: "checkedMaster",
    label: "Checked Master",
  },
  {
    detail: "Quality-first run for final delivery.",
    id: "publishMaster",
    label: "Publish Master",
  },
] as const;

export function buildPreviewComparisonModel(
  choiceA: PreviewComparisonChoice,
  choiceB: PreviewComparisonChoice,
  options: Readonly<{
    policyOptions: readonly PreviewComparisonOption[];
    voiceOptions: readonly PreviewComparisonOption[];
  }>,
): PreviewComparisonModel {
  const normalizedB = normalizePreviewComparisonChoice(choiceB, choiceA, options);
  const differences = previewComparisonDifferences(choiceA, normalizedB, options);
  return {
    choiceA,
    choiceB: normalizedB,
    differences,
    hasDifference: differences.some((difference) => difference.changed),
  };
}

export function normalizePreviewComparisonChoice(
  choice: PreviewComparisonChoice,
  fallback: PreviewComparisonChoice,
  options: Readonly<{
    policyOptions: readonly PreviewComparisonOption[];
    voiceOptions: readonly PreviewComparisonOption[];
  }>,
): PreviewComparisonChoice {
  return {
    policyId: optionExists(options.policyOptions, choice.policyId)
      ? choice.policyId
      : fallback.policyId,
    runMode: isRunMode(choice.runMode) ? choice.runMode : fallback.runMode,
    voiceId: optionExists(options.voiceOptions, choice.voiceId) ? choice.voiceId : fallback.voiceId,
  };
}

export function previewComparisonDifferences(
  choiceA: PreviewComparisonChoice,
  choiceB: PreviewComparisonChoice,
  options: Readonly<{
    policyOptions: readonly PreviewComparisonOption[];
    voiceOptions: readonly PreviewComparisonOption[];
  }>,
): PreviewComparisonDifference[] {
  return [
    {
      changed: choiceA.voiceId !== choiceB.voiceId,
      currentLabel: optionLabel(options.voiceOptions, choiceA.voiceId),
      kind: "voice",
      label: "Voice",
      nextLabel: optionLabel(options.voiceOptions, choiceB.voiceId),
    },
    {
      changed: choiceA.policyId !== choiceB.policyId,
      currentLabel: optionLabel(options.policyOptions, choiceA.policyId),
      kind: "policy",
      label: "Speech policy",
      nextLabel: optionLabel(options.policyOptions, choiceB.policyId),
    },
    {
      changed: choiceA.runMode !== choiceB.runMode,
      currentLabel: optionLabel(PREVIEW_RUN_COMPARISON_OPTIONS, choiceA.runMode),
      kind: "run",
      label: "Run config",
      nextLabel: optionLabel(PREVIEW_RUN_COMPARISON_OPTIONS, choiceB.runMode),
    },
  ];
}

export function previewComparisonSummary(model: PreviewComparisonModel): string {
  const changed = model.differences.filter((difference) => difference.changed);
  if (changed.length === 0) {
    return "A and B match.";
  }
  return changed
    .map(
      (difference) => `${difference.label}: ${difference.currentLabel} to ${difference.nextLabel}`,
    )
    .join("; ");
}

function optionExists(options: readonly PreviewComparisonOption[], id: string): boolean {
  return options.some((option) => option.id === id);
}

function optionLabel(options: readonly PreviewComparisonOption[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

function isRunMode(value: unknown): value is RunMode {
  return (
    value === "draftPreview" ||
    value === "fastCreate" ||
    value === "checkedMaster" ||
    value === "publishMaster"
  );
}
