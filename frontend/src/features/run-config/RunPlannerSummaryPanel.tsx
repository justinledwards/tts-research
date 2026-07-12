import { Button, StatusChip } from "../../design";
import type { RunPlannerDifference, RunPlannerSummary } from "./runConfigSteps";

export function RunPlannerSummaryPanel({
  createWithCurrentPlanDisabled = false,
  createWithCurrentPlanDisabledReason,
  differences = [],
  onCreateWithCurrentPlan,
  retrySummary,
  summary,
}: Readonly<{
  createWithCurrentPlanDisabled?: boolean;
  createWithCurrentPlanDisabledReason?: string;
  differences?: RunPlannerDifference[];
  onCreateWithCurrentPlan?: () => void;
  retrySummary?: RunPlannerSummary | null;
  summary: RunPlannerSummary;
}>) {
  const hasRetrySummary = Boolean(retrySummary);
  const hasDifferences = differences.length > 0;
  return (
    <section
      aria-label="Next run plan"
      className="grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border"
      data-testid="next-run-summary"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Next-run plan</h3>
          <p className="mt-1 text-xs leading-5 vs-muted">
            Wizard changes apply to future generation only. Existing generated audio is unchanged.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip tone="info">{summary.intent.label}</StatusChip>
          <StatusChip tone={summary.engineReadiness === "Ready" ? "success" : "warning"}>
            {summary.engineReadiness}
          </StatusChip>
        </div>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
        {summary.facts.map((fact) => (
          <div className="min-w-0" key={fact.label}>
            <dt className="font-semibold uppercase tracking-[0.12em] vs-muted">{fact.label}</dt>
            <dd className="mt-1 truncate text-sm font-semibold" title={fact.value}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid gap-2">
          <div>
            <p className="text-sm font-semibold">{summary.previewSample.label}</p>
            <p className="mt-1 text-xs leading-5 vs-muted">{summary.previewSample.detail}</p>
          </div>
          <p className="line-clamp-3 rounded-md bg-[var(--vs-raised)] px-3 py-2 text-sm leading-6">
            {summary.previewSample.text}
          </p>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Before generation starts</p>
          <ul className="grid gap-1 text-xs leading-5 vs-muted">
            {summary.beforeGeneration.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {summary.structuredContent.map((item) => (
          <div className="rounded-md border bg-[var(--vs-raised)] p-3 vs-border" key={item.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{item.label}</p>
              <StatusChip tone="neutral">{item.value}</StatusChip>
            </div>
            <p className="mt-2 text-xs leading-5 vs-muted">{item.detail}</p>
          </div>
        ))}
      </div>

      {hasRetrySummary ? (
        <div className="grid gap-3 rounded-md border bg-[var(--vs-raised)] p-3 vs-border">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold">Retry will reuse saved job plan</h4>
              <p className="mt-1 text-xs leading-5 vs-muted">
                Retry Audio reproduces the failed or cancelled job unless you create a fresh run
                with the current wizard plan.
              </p>
            </div>
            <StatusChip tone={hasDifferences ? "warning" : "success"}>
              {hasDifferences ? "Wizard differs" : "Same plan"}
            </StatusChip>
          </div>
          {retrySummary ? (
            <dl className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
              {retrySummary.facts.slice(2).map((fact) => (
                <div className="min-w-0" key={fact.label}>
                  <dt className="font-semibold uppercase tracking-[0.12em] vs-muted">
                    {fact.label}
                  </dt>
                  <dd className="mt-1 truncate text-sm font-semibold" title={fact.value}>
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {hasDifferences ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <ul className="grid gap-1 text-xs leading-5 vs-muted">
                {differences.map((difference) => (
                  <li key={difference.label}>
                    <span className="font-semibold text-[var(--vs-text-secondary)]">
                      {difference.label}:
                    </span>{" "}
                    retry {difference.retry}; current wizard {difference.current}
                  </li>
                ))}
              </ul>
              {onCreateWithCurrentPlan ? (
                <Button
                  disabled={createWithCurrentPlanDisabled}
                  disabledReason={createWithCurrentPlanDisabledReason}
                  onClick={onCreateWithCurrentPlan}
                  size="sm"
                  variant="soft"
                >
                  Create with current plan
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
