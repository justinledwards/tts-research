import { StatusChip, type StatusChipTone } from "../../design";
import {
  generatedAudioStateLabel,
  sourceAdapterLabel,
  sourceKindLabel,
  sourceLifecycleDescriptor,
  sourcePolicyScopeLabel,
  type SourceLifecycleEnvelope,
} from "./sourceLifecycle";
import type { ReactNode } from "react";

export interface SourceLifecycleCardProps {
  actions?: ReactNode;
  ariaLabel?: string;
  as?: "article" | "div";
  children?: ReactNode;
  className?: string;
  density?: "comfortable" | "compact";
  envelope: SourceLifecycleEnvelope;
  selected?: boolean;
  testId?: string;
}

export function SourceLifecycleCard({
  actions,
  ariaLabel,
  as = "article",
  children,
  className = "",
  density = "comfortable",
  envelope,
  selected = false,
  testId,
}: Readonly<SourceLifecycleCardProps>) {
  const Component = as;
  const descriptor = sourceLifecycleDescriptor(envelope.canonicalState);
  const isCompact = density === "compact";
  return (
    <Component
      aria-label={ariaLabel}
      className={`grid gap-3 rounded-md border ${
        selected ? "border-orange-300 bg-orange-500/5" : "vs-border vs-surface"
      } ${isCompact ? "p-3" : "p-4"} ${className}`}
      data-generated-audio-state={envelope.generatedAudioState}
      data-policy-scope={envelope.policyScope}
      data-selected-scope={envelope.selectedScope}
      data-source-lifecycle-state={envelope.canonicalState}
      data-testid={testId}
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4
              className={`min-w-0 truncate font-semibold ${isCompact ? "text-sm" : "text-base"}`}
              title={envelope.title}
            >
              {envelope.title}
            </h4>
            <StatusChip tone={sourceLifecycleTone(descriptor.tone)}>{descriptor.label}</StatusChip>
            <StatusChip tone={audioTone(envelope.generatedAudioState)}>
              {generatedAudioStateLabel(envelope.generatedAudioState)}
            </StatusChip>
            <StatusChip tone={envelope.policyScope === "source" ? "pinned" : "neutral"}>
              {sourcePolicyScopeLabel(envelope.policyScope)}
            </StatusChip>
            {selected ? <StatusChip tone="accent">Active source</StatusChip> : null}
          </div>
          <p className="vs-muted mt-1 text-xs leading-5">
            {sourceKindLabel(envelope.sourceKind)} · {sourceAdapterLabel(envelope.adapterKind)} ·{" "}
            {envelope.selectedScope}
          </p>
          <p className="vs-muted mt-1 text-xs leading-5">{descriptor.detail}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
      </div>
      {children}
    </Component>
  );
}

function sourceLifecycleTone(tone: SourceLifecycleEnvelopeTone): StatusChipTone {
  if (tone === "pinned") {
    return "pinned";
  }
  if (tone === "accent") {
    return "accent";
  }
  if (tone === "danger") {
    return "danger";
  }
  if (tone === "info") {
    return "info";
  }
  if (tone === "success") {
    return "success";
  }
  if (tone === "warning") {
    return "warning";
  }
  return "neutral";
}

function audioTone(state: SourceLifecycleEnvelope["generatedAudioState"]): StatusChipTone {
  if (state === "failed" || state === "degraded") {
    return "danger";
  }
  if (state === "stale") {
    return "warning";
  }
  if (state === "queued" || state === "generating") {
    return "info";
  }
  if (state === "ready") {
    return "success";
  }
  return "neutral";
}

type SourceLifecycleEnvelopeTone = ReturnType<typeof sourceLifecycleDescriptor>["tone"];
