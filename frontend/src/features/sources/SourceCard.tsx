import { Button } from "../../design";
import { SourceLifecycleCard } from "../source-lifecycle";
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
    <SourceLifecycleCard
      ariaLabel={model.accessibleLabel}
      density="compact"
      envelope={model.envelope}
      selected={model.isActive}
      testId={`source-card-${model.owner}-${model.id}`}
      actions={
        <>
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
        </>
      }
    >
      <p className="vs-muted text-xs leading-5">{model.appliesToCopy}</p>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <SourceCardFact label="Expected transition" value={model.expectedStateTransition} />
        <SourceCardFact label="Enabled state" value={model.enabledDisabledReason} />
        <SourceCardFact label="Active state" value={model.activeStateLabel} />
      </dl>
    </SourceLifecycleCard>
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
