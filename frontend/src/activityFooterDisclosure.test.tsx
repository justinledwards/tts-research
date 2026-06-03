import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VoiceCloningActivitySummary } from "./appVoiceCloningHelpers";
import type { OperationalStatusIssue } from "./features/operational-status";
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
            actionLabel: "Retry generation",
            detail: "Provider failed before checked audio was ready.",
            title: "Generation failed",
          },
          primaryAction: { id: "retry", label: "Retry generation", tone: "danger" },
          primaryLabel: "Generation failed",
          primaryMessage: "Generation failed. Retry generation",
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
    expect(markup).toContain("Retry generation");
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

  it("offers a compact reports route for diagnostic blockers", () => {
    const markup = renderToStaticMarkup(
      <NarrationStatusStrip
        canCancel={false}
        canCreate={false}
        canOpenCinema={false}
        mode="compact"
        model={model({
          blocker: {
            actionLabel: "Open diagnostics",
            detail: "Provider readiness needs review.",
            title: "System attention",
          },
          primaryAction: { id: "openDiagnostics", label: "Open diagnostics", tone: "warning" },
          primaryLabel: "System attention",
          primaryMessage: "System attention. Open diagnostics",
          state: "blocked",
          tone: "warning",
        })}
        onCancel={() => null}
        onCreate={() => null}
        onOpenDiagnostics={() => null}
        onOpenCinema={() => null}
        onOpenVoiceCloning={() => null}
      />,
    );

    expect(markup).toContain('data-testid="ui-action-status-strip-openDiagnostics"');
    expect(markup).toContain("Open diagnostics");
    expect(markup).not.toContain("Backend Contract");
    expect(markup).not.toContain("GPU telemetry");
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
            actionLabel: "Retry generation",
            detail: "Generation was cancelled by request. Retry generation when audio is needed.",
            title: "Generation cancelled",
          },
          primaryAction: { id: "retry", label: "Retry generation", tone: "warning" },
          primaryLabel: "Generation cancelled",
          primaryMessage: "Generation cancelled. Retry generation",
          state: "cancelled",
          tone: "warning",
        })}
        onCancel={() => null}
        onCreate={() => null}
        onOpenCinema={() => null}
        onOpenVoiceCloning={() => null}
      />,
    );

    expect(markup).toContain("Generation cancelled");
    expect(markup).toContain("Generation cancelled. Retry generation");
  });

  it("renders status chips as selectable inspector controls when a handler is provided", () => {
    const statusModel = model();
    const selectedIssueId = statusModel.chips.find((chip) => chip.id === "audio")?.issue.id;
    const markup = renderToStaticMarkup(
      <NarrationStatusStrip
        canCancel={false}
        canCreate
        canOpenCinema
        mode="compact"
        model={statusModel}
        selectedIssueId={selectedIssueId}
        onCancel={() => null}
        onCreate={() => null}
        onOpenCinema={() => null}
        onOpenVoiceCloning={() => null}
        onStatusChipSelect={() => null}
      />,
    );

    expect(markup).toContain('data-testid="ui-action-status-chip-audio"');
    expect(markup).toContain('aria-label="Inspect Audio: Ready"');
    expect(markup).toContain('aria-pressed="true"');
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
      chip("source", "Source", "Narratable"),
      chip("review", "Review", "Ready"),
      chip("audio", "Audio", "Ready"),
      chip("queue", "Queue", "4/4 ready"),
      chip("check", "Check", "99%"),
      chip("system", "System", "Healthy"),
    ],
    confidenceDetail: "ASR check passed",
    confidenceLabel: "99%",
    detail: "4 ready, 0 generating, 4 total",
    eta: "Ready",
    issues: [
      issue("source", "Source", "Narratable"),
      issue("review", "Review", "Ready"),
      issue("audio", "Audio", "Ready"),
      issue("queue", "Queue", "4/4 ready"),
      issue("check", "Check", "99%"),
      issue("system", "System", "Healthy"),
    ],
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

function chip(owner: OperationalStatusIssue["owner"], label: string, value: string) {
  return {
    id: owner,
    issue: issue(owner, label, value),
    label,
    tone: "success" as const,
    value,
  };
}

function issue(
  owner: OperationalStatusIssue["owner"],
  label: string,
  chipValue: string,
): OperationalStatusIssue {
  return {
    blocksCurrentStage: false,
    chipValue,
    condition: "ready",
    detail: `${label} ready.`,
    id: `${owner}-ready`,
    label: `${label} ready`,
    owner,
    recovery: {
      available: false,
      id: "none",
      label: "No action available",
      unavailableReason: "No action needed.",
    },
    severity: "ok",
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
