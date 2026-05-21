import type { ReactNode } from "react";
import { Button, Panel } from "../../design";
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
    <Panel className="grid gap-3 p-4" variant="raised">
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
          <Button
            className="flex-1 whitespace-nowrap sm:flex-none"
            data-testid={workspaceStageActionTestId("reviewBlocks")}
            onClick={onBackToReview}
            size="sm"
            variant="secondary"
          >
            Back to Review
          </Button>
          <Button
            className="flex-1 whitespace-nowrap sm:flex-none"
            data-testid={workspaceStageActionTestId("previewSpeech")}
            onClick={onBackToPreview}
            size="sm"
            variant="secondary"
          >
            Back to Preview
          </Button>
          <Button
            className="flex-1 whitespace-nowrap sm:flex-none"
            disabledReason={canOpenCinema ? undefined : "Create audio before opening Cinema."}
            data-testid={workspaceStageActionTestId("openCinema")}
            disabled={!canOpenCinema}
            onClick={onOpenCinema}
            size="sm"
            variant="soft"
          >
            {workspaceStageActionLabel("openCinema")}
          </Button>
          <Button
            className="flex-1 whitespace-nowrap sm:flex-none"
            disabledReason={canCreate ? undefined : "Select a ready source before creating audio."}
            data-testid={workspaceStageActionTestId("createAndListen")}
            disabled={!canCreate}
            onClick={onCreateAndListen}
            size="sm"
            variant="primary"
          >
            {workspaceStageActionLabel("createAndListen")}
          </Button>
        </div>
      </div>
      {children}
    </Panel>
  );
}
