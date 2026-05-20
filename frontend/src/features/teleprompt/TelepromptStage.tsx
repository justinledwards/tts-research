import type { ReactNode } from "react";
import { HeaderContextSummary } from "../header";

export function TelepromptStage({
  activeBlockLabel,
  children,
  policyProfile,
  returnLabel = "Back to Review",
  sourceLabel,
  sourceMeta,
  voiceProfile,
  onBackToReview,
}: Readonly<{
  activeBlockLabel: string;
  children: ReactNode;
  policyProfile: string;
  returnLabel?: string;
  sourceLabel: string;
  sourceMeta: string;
  voiceProfile: string;
  onBackToReview: () => void;
}>) {
  return (
    <section className="grid min-w-0 gap-3 rounded-xl border bg-[var(--vs-raised)] p-4 vs-border">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <HeaderContextSummary
          className="flex-1"
          metadata={[
            { label: "Policy", value: policyProfile },
            { label: "Voice", value: voiceProfile },
            { label: "Block", value: activeBlockLabel },
          ]}
          scopeTitle={sourceMeta}
          sourceTitle={sourceLabel}
          stateLabel="Teleprompt"
          surfaceName="Teleprompt Stage"
        />
        <button
          className="h-9 rounded-md border px-3 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700 vs-border vs-raised"
          onClick={onBackToReview}
          type="button"
        >
          {returnLabel}
        </button>
      </div>
      {children}
    </section>
  );
}
