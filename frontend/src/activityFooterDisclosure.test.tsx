import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VoiceCloningActivitySummary } from "./appVoiceCloningHelpers";
import { NarrationStatusStrip, type NarrationStatusModel } from "./features/status-strip";

describe("NarrationStatusStrip disclosure rendering", () => {
  it("keeps healthy systems compact and removes old footer panel copy", () => {
    const markup = renderToStaticMarkup(
      <NarrationStatusStrip
        canCancel={false}
        canCreate
        canOpenCinema
        mode="compact"
        model={model()}
        onCancel={() => null}
        onCreate={() => null}
        onOpenCinema={() => null}
        onOpenVoiceCloning={() => null}
      />,
    );

    expect(markup).toContain('data-testid="narration-status-strip"');
    expect(markup).toContain('data-status-strip-density="compact"');
    expect(markup).toContain("Audio ready");
    expect(markup).toContain("Queue");
    expect(markup).not.toContain("Activity Footer");
    expect(markup).not.toContain("Narration Pipeline");
    expect(markup).not.toContain("Job Status");
  });

  it("shows blocker treatment and the next action", () => {
    const markup = renderToStaticMarkup(
      <NarrationStatusStrip
        canCancel={false}
        canCreate
        canOpenCinema={false}
        mode="collapsed"
        model={model({
          blocker: {
            actionLabel: "Retry audio",
            detail: "Provider failed before checked audio was ready.",
            title: "Generation failed",
          },
          primaryAction: { id: "retry", label: "Retry audio", tone: "danger" },
          primaryLabel: "Generation failed",
          primaryMessage: "Generation failed. Retry audio",
          state: "failed",
          tone: "danger",
        })}
        onCancel={() => null}
        onCreate={() => null}
        onOpenCinema={() => null}
        onOpenVoiceCloning={() => null}
      />,
    );

    expect(markup).toContain('data-pipeline-state="failed"');
    expect(markup).toContain('data-status-strip-density="essential"');
    expect(markup).toContain("Retry audio");
    expect(markup).toContain("Generation failed");
  });

  it("keeps queue, timeline, and history out of the old footer drawer", () => {
    const markup = renderToStaticMarkup(
      <NarrationStatusStrip
        canCancel={false}
        canCreate
        canOpenCinema
        initialDrawerOpen
        mode="full"
        model={model()}
        onCancel={() => null}
        onCreate={() => null}
        onOpenCinema={() => null}
        onOpenVoiceCloning={() => null}
      />,
    );

    expect(markup).toContain('data-status-strip-density="expanded"');
    expect(markup).not.toContain('data-testid="ui-action-status-strip-activity"');
    expect(markup).not.toContain('data-testid="narration-activity-drawer"');
    expect(markup).not.toContain("Stage Timeline");
    expect(markup).not.toContain("Queue and Job");
    expect(markup).not.toContain("Activity History");
    expect(markup).not.toContain("Recent Jobs");
  });

  it("offers a compact Command Center activity route for active work", () => {
    const markup = renderToStaticMarkup(
      <NarrationStatusStrip
        canCancel
        canCreate={false}
        canOpenCinema={false}
        mode="compact"
        model={model({
          primaryAction: { id: "cancel", label: "Cancel Run", tone: "danger" },
          primaryLabel: "Generating",
          primaryMessage: "Generating segment 1 of 4.",
          state: "generating",
          tone: "warning",
        })}
        onCancel={() => null}
        onCreate={() => null}
        onOpenActivity={() => null}
        onOpenCinema={() => null}
        onOpenVoiceCloning={() => null}
      />,
    );

    expect(markup).toContain('data-testid="ui-action-status-strip-activity"');
    expect(markup).toContain("Activity");
    expect(markup).not.toContain('data-testid="narration-activity-drawer"');
    expect(markup).not.toContain("Stage Timeline");
  });

  it("makes cancellation visible", () => {
    const markup = renderToStaticMarkup(
      <NarrationStatusStrip
        canCancel={false}
        canCreate
        canOpenCinema={false}
        mode="compact"
        model={model({
          blocker: {
            actionLabel: "Retry audio",
            detail: "The active narration job was cancelled.",
            title: "Job cancelled",
          },
          primaryAction: { id: "retry", label: "Retry audio", tone: "warning" },
          primaryLabel: "Cancelled",
          primaryMessage: "Job cancelled. Retry when ready.",
          state: "cancelled",
          tone: "warning",
        })}
        onCancel={() => null}
        onCreate={() => null}
        onOpenCinema={() => null}
        onOpenVoiceCloning={() => null}
      />,
    );

    expect(markup).toContain("Cancelled");
    expect(markup).toContain("Job cancelled. Retry when ready.");
  });
});

function model(overrides: Partial<NarrationStatusModel> = {}): NarrationStatusModel {
  return {
    activeJobDetail: "completed · 5m",
    activeJobLabel: "job-123",
    activityItems: [
      {
        detail: "Draft text",
        id: "source",
        status: "ready",
        title: "Source: Draft text",
        tone: "success",
      },
      {
        detail: "4 ready, 0 generating, 4 total",
        id: "queue",
        status: "ready",
        title: "Queue and readiness",
        tone: "success",
      },
    ],
    blocker: null,
    chips: [
      { id: "source", label: "Source", tone: "success", value: "Narratable" },
      { id: "review", label: "Review", tone: "success", value: "Ready" },
      { id: "audio", label: "Audio", tone: "success", value: "Ready" },
      { id: "queue", label: "Queue", tone: "success", value: "4/4 ready" },
      { id: "check", label: "Check", tone: "success", value: "99%" },
      { id: "system", label: "System", tone: "success", value: "Healthy" },
    ],
    confidenceDetail: "ASR check passed",
    confidenceLabel: "99%",
    detail: "4 ready, 0 generating, 4 total",
    eta: "Ready",
    primaryAction: { id: "openCinema", label: "Open Cinema", tone: "secondary" },
    primaryLabel: "Audio ready",
    primaryMessage: "Audio ready.",
    queue: {
      currentSegment: 4,
      generatingCount: 0,
      readyCount: 4,
      totalSegments: 4,
    },
    recentJobs: [
      {
        detail: "4 of 4 ready",
        id: "job-123",
        status: "completed",
        title: "job-123 · af_heart",
        tone: "success",
      },
    ],
    sourceTitle: "Draft text",
    stageLabel: "Preview",
    stages: [
      { label: "Optimize", status: "done" },
      { label: "Synthesize", status: "done" },
      { label: "Check", status: "done" },
    ],
    state: "ready",
    tone: "success",
    voiceCloning: idleVoiceCloningActivity,
    ...overrides,
  };
}

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
