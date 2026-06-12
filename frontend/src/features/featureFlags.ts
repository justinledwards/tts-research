export interface TemporarySourcesFeatureFlags {
  quickListen: boolean;
}

export interface StudioFeatureFlags {
  temporarySources: TemporarySourcesFeatureFlags;
}

function enabledByDefault(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  return !["0", "false", "off", "disabled"].includes(value.trim().toLowerCase());
}

export const studioFeatureFlags: StudioFeatureFlags = {
  temporarySources: {
    quickListen: enabledByDefault(import.meta.env.VITE_FEATURE_TEMPORARY_SOURCES_QUICK_LISTEN),
  },
};

export function quickListenDisabledReason(): string {
  return "Quick Listen is disabled by the temporarySources.quickListen feature flag.";
}
