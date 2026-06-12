export const TEMPORARY_ACTION_IDS = [
  "quick-listen",
  "create-temporary-source",
  "keep-in-project",
  "discard",
  "extend-expiry",
  "re-extract",
  "create-audio",
  "retry-audio",
  "open-theatre-cinema",
  "clear-expired",
  "temporary-settings",
  "temporary-diagnostics",
] as const;

export type TemporaryActionId = (typeof TEMPORARY_ACTION_IDS)[number];

export const TEMPORARY_SURFACE_IDS = [
  "shell",
  "empty-workspace",
  "command-palette",
  "quick-listen-launcher",
  "intake",
  "temporary-source-header",
  "inspector",
  "inspector-diagnostics",
  "temporary-source-recovery",
  "command-center-shelf",
  "cinema-more",
  "preview-status-strip",
  "status-strip",
  "recovery-banner",
  "owning-stage-controls",
  "settings",
  "workbench",
] as const;

export type TemporarySurfaceId = (typeof TEMPORARY_SURFACE_IDS)[number];

export type TemporaryActionPriority = "primary" | "secondary" | "advanced";

export interface TemporaryActionInventoryItem {
  readonly id: TemporaryActionId;
  readonly label: string;
  readonly intent: string;
}

export interface TemporaryActionOwnership {
  readonly actionId: TemporaryActionId;
  readonly allowedSurfaces: readonly TemporarySurfaceId[];
  readonly disabledReason: string;
  readonly forbiddenSurfaces?: readonly TemporarySurfaceId[];
  readonly primarySurfaces: readonly TemporarySurfaceId[];
}

export interface TemporaryActionPlacement {
  readonly actionId: TemporaryActionId;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly duplicateReason?: string;
  readonly label: string;
  readonly priority: TemporaryActionPriority;
  readonly surfaceId: TemporarySurfaceId;
  readonly visible: boolean;
}

export interface TemporaryActionAuditIssue {
  readonly actionId?: TemporaryActionId;
  readonly code:
    | "command-palette-only"
    | "disabled-without-reason"
    | "duplicate-primary-label"
    | "forbidden-surface"
    | "missing-disabled-state-reason"
    | "unknown-action";
  readonly detail: string;
  readonly label?: string;
  readonly surfaceId?: TemporarySurfaceId;
}

export interface TemporaryComplexityBudget {
  readonly allowDiagnosticsByDefault: boolean;
  readonly maxPrimaryTemporaryActions: number;
  readonly maxTemporaryActions: number;
  readonly maxTemporaryPromotionPrimaryActions: number;
  readonly notes: readonly string[];
}

export type TemporaryComplexityState =
  | "read-calm"
  | "preview-standard"
  | "review-dense"
  | "diagnostics-advanced"
  | "command-center"
  | "settings-quick";

export const TEMPORARY_ACTION_INVENTORY: readonly TemporaryActionInventoryItem[] = [
  item("quick-listen", "Quick Listen", "Start a temporary narration path without a project."),
  item(
    "create-temporary-source",
    "Create temporary source",
    "Capture paste, file, or URL input as a temporary session.",
  ),
  item(
    "keep-in-project",
    "Keep in project",
    "Promote useful temporary work to durable project material.",
  ),
  item("discard", "Discard", "Remove throwaway temporary source data and artifacts."),
  item(
    "extend-expiry",
    "Extend expiry",
    "Give a temporary session more time without promoting it.",
  ),
  item("re-extract", "Re-extract", "Retry source extraction from diagnostics or recovery."),
  item("create-audio", "Create audio", "Generate listener-ready audio for the current source."),
  item("retry-audio", "Retry generation", "Recover a failed temporary audio generation attempt."),
  item("open-theatre-cinema", "Open Theatre/Cinema", "Move into the owning playback stage."),
  item(
    "clear-expired",
    "Clear expired temporary sources",
    "Clean expired sessions outside Workbench.",
  ),
  item("temporary-settings", "Temporary Settings", "Adjust common temporary defaults."),
  item("temporary-diagnostics", "Temporary Diagnostics", "Inspect advanced temporary internals."),
] as const;

export const TEMPORARY_ACTION_OWNERSHIP: readonly TemporaryActionOwnership[] = [
  owner("quick-listen", ["shell", "empty-workspace", "command-palette"], ["shell"]),
  owner(
    "create-temporary-source",
    ["quick-listen-launcher", "intake"],
    ["quick-listen-launcher", "intake"],
  ),
  owner(
    "keep-in-project",
    ["temporary-source-header", "inspector", "command-center-shelf", "cinema-more"],
    ["temporary-source-header"],
  ),
  owner(
    "discard",
    ["temporary-source-header", "inspector", "command-center-shelf", "cinema-more"],
    ["temporary-source-header"],
  ),
  owner("extend-expiry", ["inspector", "command-center-shelf"], ["inspector"]),
  owner("re-extract", ["inspector-diagnostics", "temporary-source-recovery"], []),
  owner("create-audio", ["preview-status-strip"], ["preview-status-strip"]),
  owner("retry-audio", ["status-strip", "recovery-banner"], ["status-strip", "recovery-banner"]),
  owner("open-theatre-cinema", ["owning-stage-controls"], ["owning-stage-controls"]),
  owner(
    "clear-expired",
    ["command-center-shelf", "settings"],
    ["command-center-shelf"],
    ["workbench"],
  ),
  owner("temporary-settings", ["settings"], []),
  owner("temporary-diagnostics", ["inspector-diagnostics"], []),
] as const;

export const TEMPORARY_COMPLEXITY_BUDGETS: Record<
  TemporaryComplexityState,
  TemporaryComplexityBudget
> = {
  "command-center": {
    allowDiagnosticsByDefault: false,
    maxPrimaryTemporaryActions: 3,
    maxTemporaryActions: 8,
    maxTemporaryPromotionPrimaryActions: 1,
    notes: [
      "Command Center can manage temporary work, including cleanup, without Workbench controls.",
    ],
  },
  "diagnostics-advanced": {
    allowDiagnosticsByDefault: true,
    maxPrimaryTemporaryActions: 2,
    maxTemporaryActions: 10,
    maxTemporaryPromotionPrimaryActions: 0,
    notes: ["Diagnostics are explicitly advanced and may expose recovery internals."],
  },
  "preview-standard": {
    allowDiagnosticsByDefault: false,
    maxPrimaryTemporaryActions: 1,
    maxTemporaryActions: 3,
    maxTemporaryPromotionPrimaryActions: 0,
    notes: ["Preview stays a standard audio readiness surface, not another Command Center."],
  },
  "read-calm": {
    allowDiagnosticsByDefault: false,
    maxPrimaryTemporaryActions: 0,
    maxTemporaryActions: 2,
    maxTemporaryPromotionPrimaryActions: 0,
    notes: ["Read mode remains canvas-first; promotion and diagnostics stay secondary."],
  },
  "review-dense": {
    allowDiagnosticsByDefault: false,
    maxPrimaryTemporaryActions: 2,
    maxTemporaryActions: 5,
    maxTemporaryPromotionPrimaryActions: 0,
    notes: ["Review may be dense, but temporary promotion actions remain secondary."],
  },
  "settings-quick": {
    allowDiagnosticsByDefault: false,
    maxPrimaryTemporaryActions: 1,
    maxTemporaryActions: 5,
    maxTemporaryPromotionPrimaryActions: 0,
    notes: ["Settings Quick exposes common temporary defaults only."],
  },
};

export function temporaryActionOwnershipFor(actionId: TemporaryActionId): TemporaryActionOwnership {
  return (
    TEMPORARY_ACTION_OWNERSHIP.find((item) => item.actionId === actionId) ?? owner(actionId, [], [])
  );
}

export function auditTemporaryActionPlacements(
  placements: readonly TemporaryActionPlacement[],
): TemporaryActionAuditIssue[] {
  const issues: TemporaryActionAuditIssue[] = [];
  for (const placement of placements) {
    const ownership = TEMPORARY_ACTION_OWNERSHIP.find(
      (item) => item.actionId === placement.actionId,
    );
    if (!ownership) {
      issues.push({
        actionId: placement.actionId,
        code: "unknown-action",
        detail: `${placement.actionId} is not in the temporary action inventory.`,
        surfaceId: placement.surfaceId,
      });
      continue;
    }
    if (!ownership.allowedSurfaces.includes(placement.surfaceId)) {
      issues.push({
        actionId: placement.actionId,
        code: "forbidden-surface",
        detail: `${placement.label} belongs on ${ownership.allowedSurfaces.join(", ")}, not ${placement.surfaceId}.`,
        label: placement.label,
        surfaceId: placement.surfaceId,
      });
    }
    if (placement.disabled && !placement.disabledReason) {
      issues.push({
        actionId: placement.actionId,
        code: "disabled-without-reason",
        detail: `${placement.label} is disabled without an explanatory reason.`,
        label: placement.label,
        surfaceId: placement.surfaceId,
      });
    }
  }
  return [
    ...issues,
    ...auditCommandPaletteOnlyActions(placements),
    ...auditDuplicatePrimaryLabels(placements),
  ];
}

export function temporaryDuplicateLabelCounts(
  placements: readonly TemporaryActionPlacement[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const placement of placements.filter((item) => item.visible)) {
    const normalized = normalizeTemporaryActionLabel(placement.label);
    counts[normalized] = (counts[normalized] ?? 0) + 1;
  }
  return counts;
}

export function temporaryDisabledReasonFor(actionId: TemporaryActionId): string {
  return temporaryActionOwnershipFor(actionId).disabledReason;
}

export function temporaryComplexityBudgetForState(
  state: TemporaryComplexityState,
): TemporaryComplexityBudget {
  return TEMPORARY_COMPLEXITY_BUDGETS[state];
}

function auditCommandPaletteOnlyActions(
  placements: readonly TemporaryActionPlacement[],
): TemporaryActionAuditIssue[] {
  const visibleByAction = visiblePlacementsByAction(placements);
  return TEMPORARY_ACTION_OWNERSHIP.flatMap((ownership) => {
    const visible = visibleByAction.get(ownership.actionId) ?? [];
    if (
      visible.length > 0 &&
      visible.every((placement) => placement.surfaceId === "command-palette")
    ) {
      return [
        {
          actionId: ownership.actionId,
          code: "command-palette-only" as const,
          detail: `${ownership.actionId} cannot be available only through Command Palette.`,
        },
      ];
    }
    return [];
  });
}

function auditDuplicatePrimaryLabels(
  placements: readonly TemporaryActionPlacement[],
): TemporaryActionAuditIssue[] {
  const primaryVisible = placements.filter(
    (placement) => placement.visible && placement.priority === "primary",
  );
  const byLabel = new Map<string, TemporaryActionPlacement[]>();
  for (const placement of primaryVisible) {
    const normalized = normalizeTemporaryActionLabel(placement.label);
    byLabel.set(normalized, [...(byLabel.get(normalized) ?? []), placement]);
  }
  return [...byLabel.entries()].flatMap(([label, duplicates]) => {
    if (duplicates.length <= 1 || duplicates.every((placement) => placement.duplicateReason)) {
      return [];
    }
    return [
      {
        actionId: duplicates[0]?.actionId,
        code: "duplicate-primary-label" as const,
        detail: `${label} appears as a duplicate primary temporary action without a reason.`,
        label,
      },
    ];
  });
}

function visiblePlacementsByAction(
  placements: readonly TemporaryActionPlacement[],
): Map<TemporaryActionId, TemporaryActionPlacement[]> {
  const byAction = new Map<TemporaryActionId, TemporaryActionPlacement[]>();
  for (const placement of placements.filter((item) => item.visible)) {
    byAction.set(placement.actionId, [...(byAction.get(placement.actionId) ?? []), placement]);
  }
  return byAction;
}

function normalizeTemporaryActionLabel(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

function item(id: TemporaryActionId, label: string, intent: string): TemporaryActionInventoryItem {
  return { id, intent, label };
}

function owner(
  actionId: TemporaryActionId,
  allowedSurfaces: readonly TemporarySurfaceId[],
  primarySurfaces: readonly TemporarySurfaceId[],
  forbiddenSurfaces: readonly TemporarySurfaceId[] = [],
): TemporaryActionOwnership {
  return {
    actionId,
    allowedSurfaces,
    disabledReason: disabledReasonForAction(actionId),
    forbiddenSurfaces,
    primarySurfaces,
  };
}

function disabledReasonForAction(actionId: TemporaryActionId): string {
  switch (actionId) {
    case "clear-expired": {
      return "No expired temporary sources are ready to clear.";
    }
    case "create-audio": {
      return "Create audio is available when the temporary source is ready.";
    }
    case "create-temporary-source": {
      return "Add paste text, a supported file, or a URL before creating a temporary source.";
    }
    case "discard": {
      return "Discard is unavailable after this temporary source is already discarded or promoted.";
    }
    case "extend-expiry": {
      return "Extend expiry is unavailable after this temporary source is discarded, expired, or promoted.";
    }
    case "keep-in-project": {
      return "Keep in project is available after temporary source work exists to save.";
    }
    case "open-theatre-cinema": {
      return "Create audio or select a ready source before opening Theatre or Cinema.";
    }
    case "quick-listen": {
      return "Quick Listen is unavailable while temporary source creation is already running.";
    }
    case "re-extract": {
      return "Re-extract is available only when extraction can be retried.";
    }
    case "retry-audio": {
      return "Retry generation is available after temporary audio generation fails.";
    }
    case "temporary-diagnostics": {
      return "Temporary diagnostics are available from advanced diagnostic context.";
    }
    case "temporary-settings": {
      return "Temporary settings are unavailable while settings are loading.";
    }
  }
}
