import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";
import type {
  SourceAdapterKind,
  SourceKind,
  SourceLifecycleEnvelope,
  SourceLifecycleState,
  SourceLifecycleTone,
  SourceLifecycleType,
  SourcePolicyScope,
  SourceSelectionContinuityFact,
  SourceSelectionSnapshot,
} from "./sourceLifecycleCore";

export {
  canonicalSourceLifecycleState,
  generatedAudioIsStale,
  hasSourcePolicyPinValues,
  SOURCE_LIFECYCLE_STATES,
} from "./sourceLifecycleCore";
export type {
  SourceAdapterKind,
  SourceExtractionState,
  SourceFreshnessInput,
  SourceKind,
  SourceLifecycleEnvelope,
  SourceLifecycleState,
  SourceLifecycleSurface,
  SourceLifecycleTone,
  SourceLifecycleType,
  SourceNarrationState,
  SourcePolicyScope,
  SourceSelectionContinuityFact,
  SourceSelectionSnapshot,
} from "./sourceLifecycleCore";

export interface SourceLifecycleDescriptor {
  detail: string;
  label: string;
  state: SourceLifecycleState;
  tone: SourceLifecycleTone;
}

export const ARTIFACT_COMPATIBILITY_UI_LABELS = {
  alignmentMissing: "Alignment missing",
  audioReady: "Audio ready",
  audioStale: "Audio stale",
  highlightStale: "Highlight stale",
  regenerateRequired: "Regenerate required",
} as const;

export type ArtifactCompatibilityUiLabel =
  (typeof ARTIFACT_COMPATIBILITY_UI_LABELS)[keyof typeof ARTIFACT_COMPATIBILITY_UI_LABELS];

export type ArtifactCompatibilityUiState =
  | "alignmentMissing"
  | "audioReady"
  | "audioStale"
  | "highlightStale"
  | "regenerateRequired";

export function artifactCompatibilityUiLabel(
  state: ArtifactCompatibilityUiState,
): ArtifactCompatibilityUiLabel {
  return ARTIFACT_COMPATIBILITY_UI_LABELS[state];
}

export function sourceLifecycleDescriptor(state: SourceLifecycleState): SourceLifecycleDescriptor {
  switch (state) {
    case "new": {
      return descriptor(state, "New", "Source has not been imported yet.", "neutral");
    }
    case "imported": {
      return descriptor(
        state,
        "Imported",
        "Source is present and waiting for extraction.",
        "warning",
      );
    }
    case "extracting": {
      return descriptor(
        state,
        "Extracting",
        "Extraction is running or waiting for a result.",
        "info",
      );
    }
    case "extracted": {
      return descriptor(state, "Extracted", "Source structure has been extracted.", "success");
    }
    case "prepared": {
      return descriptor(state, "Prepared", "Source is prepared for review.", "success");
    }
    case "reviewable": {
      return descriptor(
        state,
        "Reviewable",
        "Source can be inspected and edited in Review.",
        "success",
      );
    }
    case "previewable": {
      return descriptor(state, "Previewable", "Source can be auditioned in Preview.", "success");
    }
    case "narratable": {
      return descriptor(
        state,
        "Narratable",
        "Source has narratable scope ready for generated audio.",
        "success",
      );
    }
    case "generating": {
      return descriptor(state, "Generating", "Generated audio is being created.", "info");
    }
    case "audioReady": {
      return descriptor(
        state,
        ARTIFACT_COMPATIBILITY_UI_LABELS.audioReady,
        "Current generated audio is ready.",
        "success",
      );
    }
    case "stale": {
      return descriptor(
        state,
        "Stale",
        "Generated audio or extracted source state is older than the current source context.",
        "warning",
      );
    }
    case "failed": {
      return descriptor(state, "Failed", "Source extraction or audio generation failed.", "danger");
    }
    case "archived": {
      return descriptor(
        state,
        "Archived",
        "Source is archived and unavailable for active narration.",
        "neutral",
      );
    }
  }
}

export function sourceLifecycleLabel(state: SourceLifecycleState): string {
  return sourceLifecycleDescriptor(state).label;
}

export function sourceKindLabel(kind: SourceKind): string {
  switch (kind) {
    case "book": {
      return "Book";
    }
    case "document": {
      return "Document";
    }
    case "draft": {
      return "Draft text";
    }
    case "prepared": {
      return "Prepared source";
    }
    case "text": {
      return "Pasted text";
    }
    case "voice-clone": {
      return "Voice clone";
    }
    case "website": {
      return "Website";
    }
  }
}

export function sourceAdapterLabel(adapterKind: SourceAdapterKind): string {
  switch (adapterKind) {
    case "book": {
      return "Book";
    }
    case "docx": {
      return "DOCX";
    }
    case "epub": {
      return "EPUB";
    }
    case "html": {
      return "HTML";
    }
    case "image": {
      return "Image";
    }
    case "markdown": {
      return "Markdown";
    }
    case "pdf": {
      return "PDF";
    }
    case "text": {
      return "Text";
    }
    case "url": {
      return "URL";
    }
    case "unknown": {
      return "Source";
    }
  }
}

export function sourceLifecycleTypeLabel(type: SourceLifecycleType): string {
  switch (type) {
    case "book": {
      return "Book";
    }
    case "document": {
      return "Document";
    }
    case "website": {
      return "Website";
    }
    case "pdf": {
      return "PDF";
    }
    case "epub": {
      return "EPUB";
    }
    case "docx": {
      return "DOCX";
    }
    case "markdown": {
      return "Markdown";
    }
    case "prepared": {
      return "Prepared source";
    }
    case "text": {
      return "Pasted text";
    }
    case "unknown": {
      return "Source";
    }
  }
}

export function generatedAudioStateLabel(state: GeneratedAudioLifecycleState): string {
  switch (state) {
    case "archived": {
      return "Archived audio";
    }
    case "degraded": {
      return "Degraded audio";
    }
    case "failed": {
      return "Audio failed";
    }
    case "generating": {
      return "Generating audio";
    }
    case "missing": {
      return "No generated audio";
    }
    case "queued": {
      return "Audio queued";
    }
    case "ready": {
      return ARTIFACT_COMPATIBILITY_UI_LABELS.audioReady;
    }
    case "stale": {
      return ARTIFACT_COMPATIBILITY_UI_LABELS.audioStale;
    }
  }
}

export function sourcePolicyScopeLabel(scope: SourcePolicyScope): string {
  return scope === "source" ? "Source policy" : "Project policy";
}

export function sourceLifecycleOptionLabel(envelope: SourceLifecycleEnvelope): string {
  return `${envelope.title} · ${sourceKindLabel(envelope.sourceKind)} · ${
    envelope.selectedScope
  } · ${sourceLifecycleLabel(envelope.canonicalState)}`;
}

export function sourceLifecycleAriaLabel(envelope: SourceLifecycleEnvelope): string {
  return `${envelope.title}, ${sourceKindLabel(envelope.sourceKind)}, ${
    envelope.selectedScope
  }, ${sourceLifecycleLabel(envelope.canonicalState)}, ${generatedAudioStateLabel(
    envelope.generatedAudioState,
  )}, ${sourcePolicyScopeLabel(envelope.policyScope)}`;
}

export function sourceSelectionContinuityFacts(
  previous: SourceSelectionSnapshot,
  next: SourceSelectionSnapshot,
): SourceSelectionContinuityFact[] {
  return [
    {
      changed: previous.selectedScope !== next.selectedScope,
      label: "Scope",
      value: next.selectedScope,
    },
    {
      changed: previous.policyScope !== next.policyScope,
      label: "Policy",
      value: sourcePolicyScopeLabel(next.policyScope),
    },
    {
      changed: previous.generatedAudioState !== next.generatedAudioState,
      label: "Generated audio",
      value: generatedAudioStateLabel(next.generatedAudioState),
    },
    {
      changed: (previous.activeBlockId ?? null) !== (next.activeBlockId ?? null),
      label: "Active block",
      value: next.activeBlockId ?? "No active block",
    },
  ];
}

export function sourceSelectionContinuitySummary(
  previous: SourceSelectionSnapshot,
  next: SourceSelectionSnapshot,
): string {
  const changedFacts = sourceSelectionContinuityFacts(previous, next)
    .filter((fact) => fact.changed)
    .map((fact) => `${fact.label}: ${fact.value}`);
  if (changedFacts.length === 0) {
    return "Scope, policy, generated audio, and active block stayed unchanged.";
  }
  return `Selection changed ${changedFacts.join("; ")}.`;
}

function descriptor(
  state: SourceLifecycleState,
  label: string,
  detail: string,
  tone: SourceLifecycleTone,
): SourceLifecycleDescriptor {
  return { detail, label, state, tone };
}
