export interface TemporarySourcesFeatureFlags {
  cinema: boolean;
  premiumSurfaces: boolean;
  promotion: boolean;
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

const featureFlagEnv = import.meta.env as Record<string, string | undefined>;

export const studioFeatureFlags: StudioFeatureFlags = {
  temporarySources: {
    cinema: enabledByDefault(featureFlagEnv.VITE_FEATURE_TEMPORARY_SOURCES_CINEMA),
    premiumSurfaces: enabledByDefault(
      featureFlagEnv.VITE_FEATURE_TEMPORARY_SOURCES_PREMIUM_SURFACES,
    ),
    promotion: enabledByDefault(featureFlagEnv.VITE_FEATURE_TEMPORARY_SOURCES_PROMOTION),
    quickListen: enabledByDefault(featureFlagEnv.VITE_FEATURE_TEMPORARY_SOURCES_QUICK_LISTEN),
  },
};

export function temporaryCinemaDisabledReason(): string {
  return "Website Cinema for temporary sources is disabled by the temporarySources.cinema feature flag.";
}

export function quickListenDisabledReason(): string {
  return "Quick Listen is disabled by the temporarySources.quickListen feature flag.";
}

export function temporaryPremiumSurfacesDisabledReason(): string {
  return "Temporary Work management is disabled by the temporarySources.premiumSurfaces feature flag.";
}

export function temporaryPromotionDisabledReason(): string {
  return "Keep in project is disabled by the temporarySources.promotion feature flag.";
}
