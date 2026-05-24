import type { WorkspaceStage } from "../workspace/model";

export type DemoTourStepId =
  | "intake"
  | "review"
  | "preview"
  | "teleprompt"
  | "createAudio"
  | "openCinema";
export type DemoTourAction = "createAudio" | "openCinema" | "stage";

export interface DemoTourStep {
  action: DemoTourAction;
  id: DemoTourStepId;
  label: string;
  description: string;
  stage?: WorkspaceStage;
}

export const demoTourSteps: readonly DemoTourStep[] = [
  {
    action: "stage",
    description: "Start with sample text already loaded, then replace it with a file or URL later.",
    id: "intake",
    label: "Intake",
    stage: "intake",
  },
  {
    action: "stage",
    description:
      "Check blocks, pronunciation, policy notes, and source context before audio exists.",
    id: "review",
    label: "Review",
    stage: "review",
  },
  {
    action: "stage",
    description: "Audition the spoken form with mock voices and compare alternatives.",
    id: "preview",
    label: "Preview",
    stage: "preview",
  },
  {
    action: "stage",
    description: "Run presenter cues with recording-first controls and return memory.",
    id: "teleprompt",
    label: "Teleprompt",
    stage: "teleprompt",
  },
  {
    action: "createAudio",
    description: "Create mock generated audio from the active demo source.",
    id: "createAudio",
    label: "Create audio",
  },
  {
    action: "openCinema",
    description: "Open Cinema, then bookmark playback and resume from the saved position.",
    id: "openCinema",
    label: "Cinema",
  },
];
