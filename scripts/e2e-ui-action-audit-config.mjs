export const UI_ACTION_AUDIT_SEVERITIES = ["blocking", "needs-review", "waived", "informational"];

export const UI_ACTION_AUDIT_THRESHOLDS = {
  duplicateGroups: 0,
  missingStableTestIds: 0,
};

export const CINEMA_MORE_REQUIRED_SECTIONS = [
  "source",
  "audio",
  "display",
  "theatre",
  "workflow",
  "advanced",
  "help-shortcuts",
];

export const CINEMA_MORE_ACTION_BUDGETS = new Map([
  ["BookCinema", { max: 14, min: 8 }],
  ["DocumentCinema", { max: 14, min: 8 }],
  ["WebsiteCinema", { max: 14, min: 8 }],
  ["Mobile/narrow More sheet", { max: 6, min: 3 }],
]);

export const CINEMA_MORE_PRIMARY_LABELS = new Set([
  "Bookmark",
  "Debug",
  "Display",
  "Inspect",
  "Open reader display settings",
  "Pause",
  "Play",
  "Playback speed",
  "Read",
  "Restart",
  "Review",
  "+10s",
  "-10s",
]);

const FULL_PROVIDER_CAPABILITIES = {
  abComparison: true,
  alignment: true,
  alignmentRequiredForWordHighlight: false,
  alignmentSupported: true,
  cancelJob: true,
  localOnly: true,
  mockTts: true,
  phonemeOverrides: true,
  phraseTiming: true,
  retryJob: true,
  ssml: true,
  ssmlMarks: true,
  streaming: true,
  tts: true,
  voiceCloning: true,
  voicePreview: true,
  wordTiming: true,
};

const LIMITED_PROVIDER_BASE = {
  ...FULL_PROVIDER_CAPABILITIES,
  mockTts: false,
};

function providerProfileDefinition(profile) {
  const disabledCapabilities = Object.entries(profile.capabilities)
    .filter(([, available]) => available === false)
    .map(([capability]) => capability)
    .sort();
  return Object.freeze({
    ...profile,
    disabledCapabilities,
  });
}

export const TEST_PROVIDER_PROFILES = Object.freeze({
  "local-audio-only": providerProfileDefinition({
    capabilities: {
      ...LIMITED_PROVIDER_BASE,
      abComparison: false,
      alignment: false,
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      cancelJob: false,
      phonemeOverrides: false,
      phraseTiming: false,
      ssml: false,
      ssmlMarks: false,
      streaming: false,
      voiceCloning: false,
      voicePreview: false,
      wordTiming: false,
    },
    description: "Local synthesis can create audio but exposes no timing or hosted features.",
    id: "local-audio-only",
    label: "Local audio-only profile",
  }),
  "mock-full": providerProfileDefinition({
    capabilities: FULL_PROVIDER_CAPABILITIES,
    description: "Fully capable deterministic mock profile for local review.",
    id: "mock-full",
    label: "Mock full profile",
  }),
  "no-cancel": providerProfileDefinition({
    capabilities: { ...LIMITED_PROVIDER_BASE, cancelJob: false },
    description: "Provider cannot cancel in-flight jobs.",
    id: "no-cancel",
    label: "No cancel profile",
  }),
  "no-ssml": providerProfileDefinition({
    capabilities: {
      ...LIMITED_PROVIDER_BASE,
      phonemeOverrides: false,
      ssml: false,
      ssmlMarks: false,
    },
    description: "Provider accepts plain text only; SSML and mark callbacks are unavailable.",
    id: "no-ssml",
    label: "No SSML profile",
  }),
  "no-streaming": providerProfileDefinition({
    capabilities: { ...LIMITED_PROVIDER_BASE, streaming: false },
    description: "Provider creates complete files but cannot stream partial results.",
    id: "no-streaming",
    label: "No streaming profile",
  }),
  "no-voice-cloning": providerProfileDefinition({
    capabilities: {
      ...LIMITED_PROVIDER_BASE,
      voiceCloning: false,
    },
    description: "Provider supports default voices but not reference/profile cloning.",
    id: "no-voice-cloning",
    label: "No voice cloning profile",
  }),
  "no-word-timing": providerProfileDefinition({
    capabilities: {
      ...LIMITED_PROVIDER_BASE,
      alignmentRequiredForWordHighlight: true,
      wordTiming: false,
    },
    description: "Provider offers phrase timing but requires forced alignment for word sync.",
    id: "no-word-timing",
    label: "No word timing profile",
  }),
});

export function parseProviderProfileArg(args) {
  const envValue = process.env.UI_ACTION_AUDIT_PROVIDER_PROFILE ?? process.env.E2E_PROVIDER_PROFILE;
  for (const [index, arg] of args.entries()) {
    if (arg.startsWith("--provider-profile=")) {
      return arg.slice("--provider-profile=".length);
    }
    if (arg === "--provider-profile") {
      return args[index + 1] ?? "";
    }
  }
  return envValue ?? "";
}

export function resolveProviderProfile(id) {
  const clean = String(id ?? "").trim();
  if (!clean) {
    return null;
  }
  const profile = TEST_PROVIDER_PROFILES[clean];
  if (!profile) {
    throw new Error(
      `Unknown provider profile ${JSON.stringify(clean)}. Available profiles: ${Object.keys(
        TEST_PROVIDER_PROFILES,
      ).join(", ")}`,
    );
  }
  return profile;
}

export function providerProfileEngines(profile) {
  const baseEngine = {
    capabilities: profile.capabilities,
    experimental: false,
    languages: ["en"],
    local: true,
    metadata: {
      providerProfile: profile.id,
      runtimeProvider: "provider-profile",
    },
    modelCache: "provider-profile-fixture",
    reason: profile.description,
    setup: profile.description,
    status: "ready",
    supportsReference: profile.capabilities.voiceCloning,
    supportsSSML: profile.capabilities.ssml,
    supportsSwedish: true,
    supportsVoice: profile.capabilities.voicePreview,
  };
  return [
    {
      ...baseEngine,
      default: false,
      id: "auto",
      label: `${profile.label} Auto`,
    },
    {
      ...baseEngine,
      default: true,
      id: "kokoro",
      label: profile.label,
    },
  ];
}

export function providerProfileSummary(profile) {
  return {
    description: profile.description,
    disabledCapabilities: profile.disabledCapabilities,
    id: profile.id,
    label: profile.label,
  };
}
