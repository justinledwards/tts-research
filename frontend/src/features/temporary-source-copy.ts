export const TEMPORARY_SOURCE_COPY = {
  terms: {
    temporarySource: "Temporary source",
    durableProjectSource: "Durable project source",
    keepInProject: "Keep in project",
    discardTemporarySource: "Discard temporary source",
    expiresAfterInactivity: "Expires after inactivity",
    sessionOnlyReviewNote: "Session-only review note",
    sessionVoiceOverride: "Session voice override",
    projectSourcePin: "Project source pin",
    generatedTemporaryAudio: "Generated temporary audio",
    promoteWithAudio: "Promote with audio",
    promoteSourceOnly: "Promote source only",
    clearExpiredTemporaryWork: "Clear expired temporary work",
  },
  launcher: {
    boundaryTitle: "Temporary source boundary",
    boundaryDetail:
      "Quick Listen creates temporary source work, not a durable project source. Source text, generated temporary audio, progress, and review notes stay in this session until expiry, discard, or Keep in project.",
    keepHint: "Keep in project appears after there is useful temporary work to make durable.",
    noRecent:
      "Recent temporary sources appear here after you start Quick Listen in this app session.",
  },
  actions: {
    clearExpired: "Clear expired temporary work",
    discard: "Discard temporary source",
    extendExpiry: "Extend expiry",
    generatedAudioOnly: "Remove generated temporary audio",
    keep: "Keep in project",
    open: "Open temporary source",
    removeTemporaryArtifacts: "Remove temporary artifacts",
  },
  confirmation: {
    clearExpired:
      "Clear expired temporary work? This deletes only expired temporary content and artifacts. Project sources are unchanged.",
    discard:
      "Discard temporary source now? This deletes temporary source text, generated temporary audio, timing, bookmarks, progress, review notes, and diagnostics from this session. Project sources are unchanged.",
    removeAllArtifacts:
      "Remove all temporary artifacts for this session? Recovery metadata remains, but temporary source text, generated temporary audio, timing, bookmarks, and progress will be cleaned. Project sources are unchanged.",
    removeGeneratedAudio: "Remove generated temporary audio for this session?",
  },
  errors: {
    discardedCannotKeep: "Temporary source was discarded and cannot be kept in a project.",
    discardedCannotOpen:
      "Temporary source was discarded. Start Quick Listen again to create a new temporary source.",
    expiredCannotOpen:
      "Temporary source expired after inactivity. Extend expiry before reopening it.",
    failed: "Temporary source failed.",
    keepFailed: "Unable to keep temporary source in the project. No project history was changed.",
    notReady: "This temporary source is not ready for review or audio.",
    unavailable: "Temporary source is no longer available.",
  },
  empty: {
    noExpired: "No expired temporary sources are ready to clear.",
    noSession: "Open or select a temporary source first.",
    noTemporarySources: "No temporary sources are available in this app session.",
    recovery:
      "No temporary sources match this filter. Start Quick Listen to create temporary work without adding anything to the project library.",
  },
  promotion: {
    title: "Keep in project",
    subtitle:
      "Choose what becomes durable project history. Temporary cache paths, local file details, and session-only review notes stay out unless explicitly selected.",
    manifestIntro: "Durable project history will include:",
    extractedSource: "Temporary source text",
    generatedAudio: "Generated temporary audio",
    sourceOnly: "Temporary source text only",
    sourcePin: "Project source pin",
    sessionLexicon: "Session voice override",
    submitWithAudio: "Promote with audio",
    submitSourceOnly: "Promote source only",
  },
  privacy: {
    localFirst:
      "Temporary source content stays local unless you generate audio or use another provider-backed feature. Provider-backed generation can send request text, selected voice settings, and run configuration. Requests go to the configured provider.",
    projectBoundary:
      "Keep in project creates a durable project source. Discard temporary source deletes only temporary work and does not change project sources.",
  },
} as const;

export type TemporarySourceCopy = typeof TEMPORARY_SOURCE_COPY;

export function temporarySourceFailureCopy(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  switch (code) {
    case "expired": {
      return TEMPORARY_SOURCE_COPY.errors.expiredCannotOpen;
    }
    case "discarded": {
      return TEMPORARY_SOURCE_COPY.errors.discardedCannotOpen;
    }
    case "metadata_required":
    case "source_not_ready": {
      return TEMPORARY_SOURCE_COPY.errors.notReady;
    }
    case "promotion_failed": {
      return TEMPORARY_SOURCE_COPY.errors.keepFailed;
    }
    case "provider_unavailable": {
      return "Temporary source failed. Provider-backed generation is unavailable.";
    }
    case "cleanup_failed": {
      return "Temporary source failed. Project sources are unchanged.";
    }
    case "unsupported_file":
    case "file_too_large": {
      return "Temporary source failed. Choose a supported file and try Quick Listen again.";
    }
    case "unsafe_url":
    case "fetch_failed":
    case "extraction_failed":
    case "generation_failed":
    case "alignment_failed": {
      return TEMPORARY_SOURCE_COPY.errors.failed;
    }
    default: {
      const trimmed = fallback?.trim();
      return trimmed === undefined || trimmed.length === 0
        ? TEMPORARY_SOURCE_COPY.errors.failed
        : trimmed;
    }
  }
}
