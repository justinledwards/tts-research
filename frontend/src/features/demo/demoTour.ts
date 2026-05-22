import type { WorkspaceStage } from "../workspace/model";

export type DemoTourStepId = "intake" | "review" | "preview" | "teleprompt" | "cinema";

export interface DemoTourStep {
  id: DemoTourStepId;
  label: string;
  description: string;
  stage?: WorkspaceStage;
}

export const demoTourSteps: readonly DemoTourStep[] = [
  {
    description: "Start with sample text already loaded, then replace it with a file or URL later.",
    id: "intake",
    label: "Intake",
    stage: "intake",
  },
  {
    description:
      "Check blocks, pronunciation, policy notes, and source context before audio exists.",
    id: "review",
    label: "Review",
    stage: "review",
  },
  {
    description: "Audition the spoken form with mock voices and compare alternatives.",
    id: "preview",
    label: "Preview",
    stage: "preview",
  },
  {
    description: "Run presenter cues with recording-first controls and return memory.",
    id: "teleprompt",
    label: "Teleprompt",
    stage: "teleprompt",
  },
  {
    description: "Use Create & Listen with the mock provider, then open Cinema for full playback.",
    id: "cinema",
    label: "Cinema",
  },
];
