import type { ReactNode } from "react";

export function TelepromptStage({
  activeBlockLabel,
  children,
  policyProfile,
  sourceLabel,
  sourceMeta,
  voiceProfile,
  onBackToReview,
}: Readonly<{
  activeBlockLabel: string;
  children: ReactNode;
  policyProfile: string;
  sourceLabel: string;
  sourceMeta: string;
  voiceProfile: string;
  onBackToReview: () => void;
}>) {
  return (
    <section className="grid min-w-0 gap-3 rounded-xl border bg-[var(--vs-raised)] p-4 vs-border">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">
            Teleprompt Stage
          </p>
          <h2
            className="mt-1 truncate text-lg font-semibold text-[var(--vs-text)]"
            title={sourceLabel}
          >
            {sourceLabel}
          </h2>
          <p className="mt-1 text-sm vs-muted">{sourceMeta}</p>
        </div>
        <button
          className="h-9 rounded-md border px-3 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700 vs-border vs-raised"
          onClick={onBackToReview}
          type="button"
        >
          Back to Review
        </button>
      </div>
      <dl className="grid gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 text-xs sm:grid-cols-3 vs-border">
        <TelepromptFact label="Block" value={activeBlockLabel} />
        <TelepromptFact label="Voice" value={voiceProfile} />
        <TelepromptFact label="Policy" value={policyProfile} />
      </dl>
      {children}
    </section>
  );
}

function TelepromptFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <dt className="font-semibold uppercase tracking-[0.14em] vs-muted">{label}</dt>
      <dd className="mt-1 truncate font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}
