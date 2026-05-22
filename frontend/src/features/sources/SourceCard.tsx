import { Button, StatusChip, type StatusChipTone } from "../../design";
import type { SourceCardModel } from "./sourceLifecycle";

export interface SourceCardProps {
  model: SourceCardModel;
  onOpenCinema?: (model: SourceCardModel) => void;
  onPreview?: (model: SourceCardModel) => void;
  onReview?: (model: SourceCardModel) => void;
}

export function SourceCard({
  model,
  onOpenCinema,
  onPreview,
  onReview,
}: Readonly<SourceCardProps>) {
  const reviewDisabledReason = sourceActionDisabledReason(
    model.routeState.canReview,
    model.routeState.reviewDisabledReason,
    onReview,
  );
  const previewDisabledReason = sourceActionDisabledReason(
    model.routeState.canPreview,
    model.routeState.previewDisabledReason,
    onPreview,
  );
  const cinemaDisabledReason = sourceActionDisabledReason(
    model.routeState.canCinema,
    model.routeState.cinemaDisabledReason,
    onOpenCinema,
  );
  return (
    <article
      aria-label={model.accessibleLabel}
      className={`grid gap-3 rounded-md border p-3 ${
        model.isActive ? "border-orange-300 bg-orange-500/5" : "vs-border vs-surface"
      }`}
      data-source-lifecycle-state={model.lifecycleState}
      data-testid={`source-card-${model.owner}-${model.id}`}
    >
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="min-w-0 truncate text-sm font-semibold" title={model.visibleLabel}>
              {model.visibleLabel}
            </h4>
            <StatusChip tone={sourceStateTone(model.lifecycleState)}>
              {model.lifecycleLabel}
            </StatusChip>
            {model.isActive ? (
              <StatusChip tone="accent">{model.activeStateLabel}</StatusChip>
            ) : null}
            {model.hasPolicyPin ? (
              <StatusChip tone="pinned">{model.policyPinLabel}</StatusChip>
            ) : null}
          </div>
          <p className="vs-muted mt-1 text-xs leading-5">
            {model.typeLabel} · {model.extractionState} · {model.narratableScopeLabel}
          </p>
          <p className="vs-muted mt-1 text-xs leading-5">{model.lifecycleDetail}</p>
          <p className="vs-muted mt-1 text-xs leading-5">{model.appliesToCopy}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            data-testid={`ui-action-source-review-${model.owner}-${model.id}`}
            data-ui-action-surface="Project dashboard"
            disabled={Boolean(reviewDisabledReason)}
            disabledReason={reviewDisabledReason}
            onClick={() => {
              onReview?.(model);
            }}
            size="sm"
            variant="primary"
          >
            Review
          </Button>
          <Button
            data-testid={`ui-action-source-preview-${model.owner}-${model.id}`}
            data-ui-action-surface="Project dashboard"
            disabled={Boolean(previewDisabledReason)}
            disabledReason={previewDisabledReason}
            onClick={() => {
              onPreview?.(model);
            }}
            size="sm"
            variant="secondary"
          >
            Preview
          </Button>
          <Button
            data-testid={`ui-action-source-cinema-${model.owner}-${model.id}`}
            data-ui-action-surface="Project dashboard"
            disabled={Boolean(cinemaDisabledReason)}
            disabledReason={cinemaDisabledReason}
            onClick={() => {
              onOpenCinema?.(model);
            }}
            size="sm"
            variant="secondary"
          >
            Cinema
          </Button>
        </div>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <SourceCardFact label="Expected transition" value={model.expectedStateTransition} />
        <SourceCardFact label="Enabled state" value={model.enabledDisabledReason} />
        <SourceCardFact label="Active state" value={model.activeStateLabel} />
      </dl>
    </article>
  );
}

function sourceActionDisabledReason(
  isAvailable: boolean,
  unavailableReason: string | undefined,
  handler: ((model: SourceCardModel) => void) | undefined,
): string | undefined {
  if (!isAvailable) {
    return unavailableReason ?? "Source route is not available yet.";
  }
  if (!handler) {
    return "No source route handler is attached.";
  }
  return undefined;
}

function SourceCardFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-md border px-3 py-2 vs-border">
      <dt className="font-semibold uppercase tracking-[0.12em] vs-muted">{label}</dt>
      <dd className="mt-1 line-clamp-2 leading-5 text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function sourceStateTone(state: SourceCardModel["lifecycleState"]): StatusChipTone {
  if (state === "failed" || state === "stale") {
    return "danger";
  }
  if (state === "imported" || state === "extracting") {
    return "warning";
  }
  if (state === "generated") {
    return "info";
  }
  return "success";
}
