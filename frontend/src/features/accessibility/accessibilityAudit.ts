import {
  DEFAULT_READER_ACCESSIBILITY_SETTINGS,
  type ReaderAccessibilitySettings,
} from "../reader-accessibility";
import { minInteractiveSize } from "../../design";

export type AccessibilityAuditSeverity = "fail" | "warning";

export type AccessibilityPresetId =
  | "standard"
  | "highContrast"
  | "reducedMotion"
  | "dyslexicFriendly"
  | "largeText"
  | "lowVision";

export interface AccessibilityPreset {
  description: string;
  id: AccessibilityPresetId;
  label: string;
  settings: ReaderAccessibilitySettings;
}

export interface AccessibilityControlAuditInput {
  accessibleName: string;
  disabled: boolean;
  disabledReason?: string | null;
  height: number;
  hitAreaHeight?: number;
  hitAreaWidth?: number;
  id: string;
  role: string | null;
  stableTestId?: string | null;
  surface?: string | null;
  visualHeight?: number;
  visualWidth?: number;
  visibleLabel: string;
  width: number;
}

export interface AccessibilityAuditIssue {
  controlId: string;
  detail: string;
  hitAreaSize?: {
    height: number;
    width: number;
  };
  ruleId: string;
  severity: AccessibilityAuditSeverity;
  stableTestId?: string | null;
  surface?: string | null;
  visualSize?: {
    height: number;
    width: number;
  };
}

export interface AccessibilityAuditSummary {
  controlCount: number;
  failCount: number;
  issues: AccessibilityAuditIssue[];
  warningCount: number;
}

export const ACCESSIBILITY_PRESETS: readonly AccessibilityPreset[] = [
  {
    description: "Default reader comfort with large text and standard motion.",
    id: "standard",
    label: "Standard",
    settings: DEFAULT_READER_ACCESSIBILITY_SETTINGS,
  },
  {
    description: "Stronger highlight and foreground contrast for bright rooms or low contrast.",
    id: "highContrast",
    label: "High contrast",
    settings: {
      ...DEFAULT_READER_ACCESSIBILITY_SETTINGS,
      highContrast: true,
    },
  },
  {
    description: "Instant scrolling and no nonessential motion.",
    id: "reducedMotion",
    label: "Reduced motion",
    settings: {
      ...DEFAULT_READER_ACCESSIBILITY_SETTINGS,
      reducedMotion: true,
    },
  },
  {
    description: "Spacious reading with wider measure and less motion.",
    id: "dyslexicFriendly",
    label: "Dyslexic friendly",
    settings: {
      highContrast: false,
      lineSpacing: "spacious",
      measure: "wide",
      reducedMotion: true,
      textScale: "large",
    },
  },
  {
    description: "Large typography while keeping the default measure.",
    id: "largeText",
    label: "Large text",
    settings: {
      ...DEFAULT_READER_ACCESSIBILITY_SETTINGS,
      lineSpacing: "spacious",
      textScale: "giant",
    },
  },
  {
    description: "High contrast, giant text, spacious lines, and a shorter line length.",
    id: "lowVision",
    label: "Low-vision measure",
    settings: {
      highContrast: true,
      lineSpacing: "spacious",
      measure: "narrow",
      reducedMotion: true,
      textScale: "giant",
    },
  },
];

export function accessibilityPresetById(id: AccessibilityPresetId): AccessibilityPreset {
  return ACCESSIBILITY_PRESETS.find((preset) => preset.id === id) ?? ACCESSIBILITY_PRESETS[0];
}

export function applyAccessibilityPreset(id: AccessibilityPresetId): ReaderAccessibilitySettings {
  return { ...accessibilityPresetById(id).settings };
}

export function accessibilityPresetForSettings(
  settings: ReaderAccessibilitySettings,
): AccessibilityPresetId | "custom" {
  const match = ACCESSIBILITY_PRESETS.find((preset) =>
    readerAccessibilitySettingsEqual(preset.settings, settings),
  );
  return match?.id ?? "custom";
}

export function auditAccessibilityControls(
  controls: readonly AccessibilityControlAuditInput[],
): AccessibilityAuditSummary {
  const issues = controls.flatMap((control) => auditControl(control));
  return {
    controlCount: controls.length,
    failCount: issues.filter((issue) => issue.severity === "fail").length,
    issues,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
  };
}

function auditControl(control: AccessibilityControlAuditInput): AccessibilityAuditIssue[] {
  const issues: AccessibilityAuditIssue[] = [];
  const controlIssue = (
    issue: Omit<AccessibilityAuditIssue, "stableTestId" | "surface">,
  ): AccessibilityAuditIssue => ({
    ...issue,
    stableTestId: control.stableTestId,
    surface: control.surface,
  });
  const label = control.accessibleName.trim() || control.visibleLabel.trim();
  if (!label) {
    issues.push(
      controlIssue({
        controlId: control.id,
        detail: "Interactive controls need a visible or programmatic name.",
        ruleId: "control-name",
        severity: "fail",
      }),
    );
  }
  if (control.disabled && !control.disabledReason?.trim()) {
    issues.push(
      controlIssue({
        controlId: control.id,
        detail: "Disabled controls need an exposed reason.",
        ruleId: "disabled-reason",
        severity: "fail",
      }),
    );
  }
  const visualWidth = control.visualWidth ?? control.width;
  const visualHeight = control.visualHeight ?? control.height;
  const hitAreaWidth = control.hitAreaWidth ?? control.width;
  const hitAreaHeight = control.hitAreaHeight ?? control.height;
  if (
    hitAreaWidth > 0 &&
    hitAreaHeight > 0 &&
    (hitAreaWidth < minInteractiveSize || hitAreaHeight < minInteractiveSize)
  ) {
    issues.push(
      controlIssue({
        controlId: control.id,
        detail: `Touch target hit area is ${Math.round(hitAreaWidth).toString()} x ${Math.round(
          hitAreaHeight,
        ).toString()} px; visual box is ${Math.round(visualWidth).toString()} x ${Math.round(
          visualHeight,
        ).toString()} px; target minimum is ${minInteractiveSize.toString()} x ${minInteractiveSize.toString()} px.`,
        hitAreaSize: {
          height: hitAreaHeight,
          width: hitAreaWidth,
        },
        ruleId: "touch-target",
        severity: "warning",
        visualSize: {
          height: visualHeight,
          width: visualWidth,
        },
      }),
    );
  }
  if (!control.role) {
    issues.push(
      controlIssue({
        controlId: control.id,
        detail: "Interactive element has no explicit or implicit role.",
        ruleId: "control-role",
        severity: "warning",
      }),
    );
  }
  return issues;
}

function readerAccessibilitySettingsEqual(
  left: ReaderAccessibilitySettings,
  right: ReaderAccessibilitySettings,
): boolean {
  return (
    left.highContrast === right.highContrast &&
    left.lineSpacing === right.lineSpacing &&
    left.measure === right.measure &&
    left.reducedMotion === right.reducedMotion &&
    left.textScale === right.textScale
  );
}
