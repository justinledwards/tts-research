import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipelineStatusFooter } from "./App";
import type { VoiceCloningActivitySummary } from "./appVoiceCloningHelpers";
import { resolveWorkspaceDisclosure, type WorkspaceDisclosureInput } from "./features/workspace";

describe("PipelineStatusFooter disclosure rendering", () => {
  it("keeps idle voice cloning out of the full footer's large activity panels", () => {
    const markup = renderToStaticMarkup(
      <PipelineStatusFooter
        activeJobId={null}
        canSubmit
        disclosure={resolveWorkspaceDisclosure(baseDisclosureInput())}
        hint="Ready"
        isProcessing={false}
        job={null}
        mode="full"
        pipeline={{ checker: "waiting", optimization: "waiting", synthesis: "waiting" }}
        showNarrationAction={false}
        voiceCloningActivity={idleVoiceCloningActivity}
        onCancel={() => null}
        onOpenVoiceCloning={() => null}
        onPinDisclosurePanel={() => null}
        onSubmit={() => null}
      />,
    );

    expect(markup).toContain("Voice cloning: collapsed");
    expect(markup).not.toContain("Candidates</p>");
    expect(markup).not.toContain("Voice Cloning</h2>");
  });

  it("shows hidden attention in the collapsed footer", () => {
    const markup = renderToStaticMarkup(
      <PipelineStatusFooter
        activeJobId={null}
        canSubmit
        disclosure={resolveWorkspaceDisclosure({
          ...baseDisclosureInput(),
          audioGeneration: { lifecycle: "failed", requiresPlayback: false },
        })}
        hint="Ready"
        isProcessing={false}
        job={null}
        mode="collapsed"
        pipeline={{ checker: "failed", optimization: "done", synthesis: "failed" }}
        showNarrationAction={false}
        voiceCloningActivity={idleVoiceCloningActivity}
        onCancel={() => null}
        onOpenVoiceCloning={() => null}
        onPinDisclosurePanel={() => null}
        onSubmit={() => null}
      />,
    );

    expect(markup).toContain("1 attention");
    expect(markup).toContain("Audio generation");
    expect(markup).toContain("failed or was cancelled");
  });
});

const idleVoiceCloningActivity: VoiceCloningActivitySummary = {
  activeProfile: null,
  actionLabel: "Create Clone",
  candidateDetail: "No candidates yet",
  detail: "Upload source media to begin.",
  elapsed: "n/a",
  eta: "n/a",
  lastUpdate: "No updates",
  message: "No source analysis is running.",
  sourceDetail: "No source queued",
  stages: [
    { label: "Analyze Source", status: "waiting" },
    { label: "Detect Speakers", status: "waiting" },
    { label: "Build Clone", status: "waiting" },
    { label: "Validate Voice", status: "waiting" },
  ],
  status: "idle",
  statusLabel: "Idle",
};

function baseDisclosureInput(): WorkspaceDisclosureInput {
  return {
    audioGeneration: { lifecycle: "missing", requiresPlayback: false },
    backendState: {
      active: false,
      blocking: false,
      online: true,
      warning: false,
    },
    diagnostics: {
      active: false,
      blocking: false,
      warning: false,
    },
    exportImport: {
      active: false,
      blocking: false,
      warning: false,
    },
    sourceDetails: {
      active: false,
      blocking: false,
      hasSource: true,
      warning: false,
    },
    stage: "preview",
    storage: {
      blocking: false,
      warning: false,
    },
    voiceCloning: {
      blocking: false,
      status: "idle",
    },
  };
}
