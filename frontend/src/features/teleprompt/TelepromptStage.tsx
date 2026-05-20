import type { ReactNode } from "react";
import { HeaderContextSummary } from "../header";
import { workspaceStageActionLabel, workspaceStageActionTestId } from "../workspace";

export function TelepromptStage({
  activeBlockLabel,
  canCreate,
  canOpenCinema,
  children,
  policyProfile,
  scopeLabel,
  sourceLabel,
  sourceMeta,
  voiceProfile,
  onBackToPreview,
  onBackToReview,
  onCreateAndListen,
  onOpenCinema,
}: Readonly<{
  activeBlockLabel: string;
  canCreate: boolean;
  canOpenCinema: boolean;
  children: ReactNode;
  policyProfile: string;
  scopeLabel: string;
  sourceLabel: string;
  sourceMeta: string;
  voiceProfile: string;
  onBackToPreview: () => void;
  onBackToReview: () => void;
  onCreateAndListen: () => void;
  onOpenCinema: () => void;
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
            { label: "Size", value: sourceMeta },
          ]}
          scopeTitle={scopeLabel}
          sourceTitle={sourceLabel}
          stateLabel="Teleprompt"
          surfaceName="Teleprompt Stage"
        />
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <button
            className="h-9 flex-1 whitespace-nowrap rounded-md border px-3 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700 sm:flex-none vs-border vs-raised"
            data-testid={workspaceStageActionTestId("reviewBlocks")}
            onClick={onBackToReview}
            type="button"
          >
            Back to Review
          </button>
          <button
            className="h-9 flex-1 whitespace-nowrap rounded-md border px-3 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700 sm:flex-none vs-border vs-raised"
            data-testid={workspaceStageActionTestId("previewSpeech")}
            onClick={onBackToPreview}
            type="button"
          >
            Back to Preview
          </button>
          <button
            className="h-9 flex-1 whitespace-nowrap rounded-md border border-orange-300 bg-orange-500/10 px-3 text-xs font-semibold text-orange-700 transition hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            data-disabled-reason={canOpenCinema ? undefined : "Create audio before opening Cinema."}
            data-testid={workspaceStageActionTestId("openCinema")}
            disabled={!canOpenCinema}
            onClick={onOpenCinema}
            type="button"
          >
            {workspaceStageActionLabel("openCinema")}
          </button>
          <button
            className="h-9 flex-1 whitespace-nowrap rounded-md px-4 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-zinc-300 sm:flex-none vs-accent-bg"
            data-disabled-reason={
              canCreate ? undefined : "Select a ready source before creating audio."
            }
            data-testid={workspaceStageActionTestId("createAndListen")}
            disabled={!canCreate}
            onClick={onCreateAndListen}
            type="button"
          >
            {workspaceStageActionLabel("createAndListen")}
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}
