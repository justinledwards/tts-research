export const DUPLICATE_CLASSIFICATION_CATEGORIES = [
  "allowed-same-control-across-scenarios",
  "allowed-command-alias",
  "allowed-mobile-proxy",
  "allowed-surface-parity",
  "needs-consolidation",
  "overexposed",
];

const REVIEW_DATE = "2026-06-30";
const WORKSPACE_STAGE_SURFACES = [
  "BookCinema",
  "Preview mini-player",
  "Intake",
  "Review",
  "Preview",
  "Teleprompt",
];
const CINEMA_SURFACES = ["BookCinema", "DocumentCinema", "WebsiteCinema"];
const SETTINGS_SURFACES = ["Settings", "UI Memory", "Speech Policy"];
const ALL_REVIEW_SURFACES = [
  ...new Set([
    ...WORKSPACE_STAGE_SURFACES,
    ...CINEMA_SURFACES,
    ...SETTINGS_SURFACES,
    "Command Palette",
    "Mobile/narrow More sheet",
    "Project dashboard",
    "Teleprompt Theatre",
    "Voice dashboard",
    "Workspace",
  ]),
];

export const DUPLICATE_WAIVER_REGISTRY = [
  {
    acceptedSurfaces: [...WORKSPACE_STAGE_SURFACES, "Voice Command"],
    burnDownIssue: "WP46-BD-VOICE-CLONE",
    category: "overexposed",
    id: "wp46-clone-workflow",
    labels: ["Clone", "Create Clone", "Voice Cloning"],
    owner: "voice-workflow",
    reason:
      "Voice clone controls should stay in the voice workflow unless a stage has an explicit voice-cloning task.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: [
      "BookCinema",
      "Intake",
      "Playback",
      "Preview",
      "Preview mini-player",
      "Project dashboard",
      "Teleprompt Theatre",
    ],
    burnDownIssue: "WP46-BD-CINEMA-NAV",
    category: "overexposed",
    id: "wp46-cinema-navigation",
    labels: ["Cinema", "Open Cinema"],
    owner: "navigation-ia",
    reason:
      "Cinema entry points appear in dashboard, intake, preview, and theatre contexts. Keep them visible only where the target source/context is clear.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: ["Preview", "Preview mini-player", "Review"],
    burnDownIssue: "WP46-BD-PREVIEW-PLAYBACK",
    category: "overexposed",
    id: "wp46-preview-playback",
    labels: [
      "Audition A",
      "Audition: Missing",
      "Create & Listen: generate whole source",
      "Next preview block",
      "Open Teleprompt",
      "Pause preview audition",
      "Policy B",
      "Preview playback speed",
      "Previous preview block",
      "Restart preview",
      "Run B",
      "Selected segment",
      "Skip silence",
      "Use B",
      "Voice B",
      "Whole source",
    ],
    owner: "preview-workflow",
    reason:
      "Preview playback and A/B controls repeat between Review, Preview, and the mini-player. Keep one primary control set and expose proxies only with explicit context.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: WORKSPACE_STAGE_SURFACES,
    category: "allowed-command-alias",
    id: "wp46-command-palette-alias",
    labels: ["Open command palette"],
    owner: "command-palette",
    reason:
      "The command palette trigger is intentionally available from workspace chrome and mirrors command search access.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: [...WORKSPACE_STAGE_SURFACES, "Teleprompt Theatre", "Workspace"],
    category: "allowed-same-control-across-scenarios",
    id: "wp46-workspace-layout-shell-control",
    labelPatterns: [
      "^Layout$",
      "^Workspace layout:",
      "^(Focus|Balanced|Full|Custom) workspace layout$",
    ],
    owner: "workspace-ia",
    reason:
      "The single global workspace density control is shell chrome and intentionally repeats across narration stages.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: [
      ...CINEMA_SURFACES,
      "Intake",
      "Mobile/narrow More sheet",
      "Preview",
      "Preview mini-player",
    ],
    category: "allowed-mobile-proxy",
    id: "wp46-mobile-more-proxy",
    labels: [
      "-10s",
      "+10s",
      "Bookmark",
      "Cinema source: Iota EPUB Fixture",
      "Exit",
      "Narration",
      "Play",
      "Playback speed",
      "Select file",
      "Source",
    ],
    owner: "mobile-ux",
    reason:
      "Mobile/narrow More sheet duplicates primary visible controls so narrow layouts keep the same action reachability.",
    requiredSurfacesAny: ["Mobile/narrow More sheet"],
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: SETTINGS_SURFACES,
    category: "allowed-surface-parity",
    id: "wp46-settings-mode-parity",
    labelPatterns: [
      "^Accessibility preset",
      "^Advanced",
      "^Close Settings$",
      "^Expert / Diagnostics",
      "^Line spacing",
      "^Measure",
      "^Quick",
      "^Reduced motion$",
      "^Text scale",
    ],
    owner: "settings-ia",
    reason:
      "Settings, UI Memory, and Speech Policy expose the same settings-mode controls for parity across settings entry points.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: ["Settings", "Teleprompt", "Teleprompt Theatre"],
    category: "allowed-surface-parity",
    id: "wp46-accessibility-parity",
    labels: ["Dyslexic friendly", "High contrast", "Large text", "Standard"],
    owner: "accessibility",
    reason:
      "Accessibility display options intentionally repeat across settings and teleprompt presentation contexts.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: ["Teleprompt", "Teleprompt Theatre"],
    category: "allowed-surface-parity",
    id: "wp46-teleprompt-theatre-parity",
    labelPatterns: ["^Play Cue:"],
    owner: "teleprompt-workflow",
    reason: "Inline Teleprompt and theatre mode intentionally share cue playback controls.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: [...CINEMA_SURFACES, "Teleprompt", "Teleprompt Theatre"],
    category: "allowed-surface-parity",
    id: "wp46-media-restart-parity",
    labels: ["Restart"],
    owner: "playback",
    reason:
      "Restart is a shared media transport affordance across cinema and teleprompt playback surfaces.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: CINEMA_SURFACES,
    category: "allowed-surface-parity",
    id: "wp46-cinema-surface-parity",
    labels: [
      "-10s",
      "+10s",
      "Bookmark",
      "Exit",
      "Inspect",
      "Open Cinema More menu",
      "Open reader display settings",
      "Play",
      "Playback speed",
      "Read",
      "Restart",
      "Settings",
    ],
    owner: "cinema-ux",
    reason:
      "Book, document, and website cinema surfaces share reader transport and reader settings controls.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: CINEMA_SURFACES,
    category: "allowed-surface-parity",
    id: "wp57-cinema-more-ia-parity",
    labels: [
      "Alignment repair",
      "Cinema Theatre",
      "Command palette",
      "Help/guide",
      "Keyboard shortcuts",
      "Policy internals",
      "Reader settings",
      "Source internals",
      "Timing map",
    ],
    owner: "cinema-ux",
    reason:
      "Book, document, and website Cinema share the same curated More menu information architecture so repeated entries represent surface parity, not extra exposure.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: ["Review", "Teleprompt"],
    category: "allowed-surface-parity",
    id: "wp46-review-teleprompt-panel-parity",
    labelPatterns: [
      "^DiagnosticsAdvanced",
      "^HistoryOutline",
      "^OverviewCurrent",
      "^PolicySpeech",
      "^ReviewReview",
    ],
    owner: "review-workflow",
    reason:
      "Review and Teleprompt share the same context panel tabs so operators can inspect source and policy state in either workflow.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: ["UI Memory", "Speech Policy"],
    category: "allowed-surface-parity",
    id: "wp46-policy-settings-section-parity",
    labelPatterns: ["^ReaderReading", "^RunJob", "^SourcesProject", "^VoicesVoice"],
    owner: "settings-ia",
    reason:
      "UI Memory and Speech Policy intentionally expose mirrored section navigation for policy editing.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: ALL_REVIEW_SURFACES,
    category: "allowed-surface-parity",
    id: "wp46-workflow-surface-parity",
    labels: [
      "Diagnostics",
      "Hide",
      "Intake",
      "Open settings",
      "Open workspace",
      "Preview",
      "Read",
      "Review",
      "Teleprompt",
      "Workspaceidle",
    ],
    owner: "workspace-ia",
    reason:
      "Primary workflow navigation appears on each first-class surface so scenario coverage can enter and leave stages consistently.",
    reviewDate: REVIEW_DATE,
  },
  {
    acceptedSurfaces: ALL_REVIEW_SURFACES,
    category: "allowed-same-control-across-scenarios",
    id: "wp46-same-control-scenario-repeat",
    owner: "ux-qa",
    reason:
      "The same control can appear in multiple audit scenarios for the same surface; this is scenario coverage duplication, not additional UI exposure.",
    reviewDate: REVIEW_DATE,
    sameSurfaceAcrossScenarios: true,
  },
  {
    acceptedSurfaces: ALL_REVIEW_SURFACES,
    category: "needs-consolidation",
    id: "wp46-generic-navigation-labels",
    labels: [
      "Back",
      "Close",
      "Intent",
      "Metadata",
      "Next",
      "Open",
      "Rename",
      "Try the Studio",
      "Voice",
    ],
    owner: "workspace-ia",
    reason:
      "Generic navigation labels are classified but need clearer ownership, labels, or contextual grouping in the next IA pass.",
    reviewDate: REVIEW_DATE,
  },
];

export function classifyDuplicateGroup(duplicate) {
  const normalized = normalizeDuplicate(duplicate);
  const match = DUPLICATE_WAIVER_REGISTRY.find((entry) =>
    duplicateMatchesRegistryEntry(normalized, entry),
  );
  if (!match) {
    return {
      acceptedSurfaces: [],
      category: "unclassified",
      id: "wp46-unclassified-duplicate",
      owner: "ux-qa",
      reason: "No duplicate waiver registry entry matched this group.",
      reviewDate: REVIEW_DATE,
      severity: "blocking",
      waiverRequired: false,
    };
  }
  return classificationForEntry(match);
}

export function classifyDuplicateGroups(duplicates) {
  return duplicates.map((duplicate) => ({
    ...duplicate,
    classification: duplicate.classification ?? classifyDuplicateGroup(duplicate),
  }));
}

export function summarizeDuplicateClassifications(duplicates) {
  const classified = classifyDuplicateGroups(duplicates);
  const byCategory = Object.fromEntries(
    [...DUPLICATE_CLASSIFICATION_CATEGORIES, "unclassified"].map((category) => [
      category,
      classified.filter((duplicate) => duplicate.classification?.category === category).length,
    ]),
  );
  const burnDownIssues = [
    ...new Set(
      classified.map((duplicate) => duplicate.classification?.burnDownIssue).filter(Boolean),
    ),
  ].map((issue) => {
    const groups = classified.filter(
      (duplicate) => duplicate.classification?.burnDownIssue === issue,
    );
    return {
      count: groups.length,
      issue,
      labels: [...new Set(groups.map((duplicate) => duplicate.label))].sort(),
      owner: groups[0]?.classification?.owner ?? "ux-qa",
      reason: groups[0]?.classification?.reason ?? "",
      reviewDate: groups[0]?.classification?.reviewDate ?? REVIEW_DATE,
      surfaces: [...new Set(groups.flatMap((duplicate) => duplicate.surfaces ?? []))].sort(),
    };
  });
  return {
    burnDownIssues,
    byCategory,
    classified: classified.length - byCategory.unclassified,
    duplicateWaiverRegistry: duplicateWaiverRegistryDocument(),
    needsConsolidation: byCategory["needs-consolidation"],
    overexposed: byCategory.overexposed,
    total: classified.length,
    unclassified: byCategory.unclassified,
    waived:
      byCategory["allowed-same-control-across-scenarios"] +
      byCategory["allowed-command-alias"] +
      byCategory["allowed-mobile-proxy"] +
      byCategory["allowed-surface-parity"],
  };
}

export function duplicateWaiverRegistryDocument() {
  return DUPLICATE_WAIVER_REGISTRY.map((entry) => ({
    acceptedSurfaces: entry.acceptedSurfaces ?? [],
    burnDownIssue: entry.burnDownIssue ?? null,
    category: entry.category,
    id: entry.id,
    labels: entry.labels ?? [],
    labelPatterns: entry.labelPatterns ?? [],
    owner: entry.owner,
    reason: entry.reason,
    reviewDate: entry.reviewDate,
  }));
}

function duplicateMatchesRegistryEntry(duplicate, entry) {
  if (entry.kinds && !entry.kinds.includes(duplicate.kind)) {
    return false;
  }
  if (entry.actionClasses && !entry.actionClasses.includes(duplicate.actionClass)) {
    return false;
  }
  if (entry.requiredSurfacesAny && !hasAnySurface(duplicate, entry.requiredSurfacesAny)) {
    return false;
  }
  if (entry.requiredSurfacesAll && !hasAllSurfaces(duplicate, entry.requiredSurfacesAll)) {
    return false;
  }
  if (entry.acceptedSurfaces && !surfacesAreAccepted(duplicate, entry.acceptedSurfaces)) {
    return false;
  }
  if (entry.sameSurfaceAcrossScenarios && !isSameControlAcrossScenarios(duplicate)) {
    return false;
  }
  return labelMatchesEntry(duplicate.label, entry) || Boolean(entry.sameSurfaceAcrossScenarios);
}

function classificationForEntry(entry) {
  const severity = severityForCategory(entry.category);
  return {
    acceptedSurfaces: entry.acceptedSurfaces ?? [],
    burnDownIssue: entry.burnDownIssue ?? null,
    category: entry.category,
    expiresAt: entry.reviewDate,
    id: entry.id,
    owner: entry.owner,
    reason: entry.reason,
    reviewDate: entry.reviewDate,
    severity,
    waiverRequired: severity === "blocking",
  };
}

function severityForCategory(category) {
  if (category === "overexposed" || category === "needs-consolidation") {
    return "needs-review";
  }
  if (category.startsWith("allowed-")) {
    return "waived";
  }
  return "blocking";
}

function normalizeDuplicate(duplicate) {
  return {
    ...duplicate,
    actionClass: duplicate.actionClass ?? "",
    kind: duplicate.kind ?? "same-label-same-surface",
    label: String(duplicate.label ?? ""),
    scenarios: duplicate.scenarios ?? [],
    surfaces: duplicate.surfaces ?? splitSurfaces(duplicate.surface),
  };
}

function splitSurfaces(surface) {
  return String(surface ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function labelMatchesEntry(label, entry) {
  if (entry.labels?.includes(label)) {
    return true;
  }
  return (entry.labelPatterns ?? []).some((pattern) => new RegExp(pattern, "i").test(label));
}

function isSameControlAcrossScenarios(duplicate) {
  return duplicate.surfaces.length === 1 && new Set(duplicate.scenarios).size > 1;
}

function surfacesAreAccepted(duplicate, acceptedSurfaces) {
  const accepted = new Set(acceptedSurfaces.map(normalizeSurface));
  return duplicate.surfaces.every((surface) => accepted.has(normalizeSurface(surface)));
}

function hasAnySurface(duplicate, surfaces) {
  const actual = new Set(duplicate.surfaces.map(normalizeSurface));
  return surfaces.some((surface) => actual.has(normalizeSurface(surface)));
}

function hasAllSurfaces(duplicate, surfaces) {
  const actual = new Set(duplicate.surfaces.map(normalizeSurface));
  return surfaces.every((surface) => actual.has(normalizeSurface(surface)));
}

function normalizeSurface(surface) {
  return String(surface ?? "")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[\s/-]+/g, " ")
    .trim()
    .toLowerCase();
}
