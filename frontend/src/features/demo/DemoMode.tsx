import { Button, Panel, StatusChip } from "../../design";
import type { TTSEngineDiagnostics } from "../../types";
import { resolveProviderRuntimeCapabilities } from "../provider-capabilities";
import type { WorkspaceStage } from "../workspace/model";
import { demoProjectSummary, demoProjects, type DemoProject } from "./demoProjects";
import { demoTourSteps, type DemoTourStep } from "./demoTour";

export function DemoMode({
  activeDemoProjectId,
  canCreateAudio,
  canOpenCinema,
  currentStage,
  hasGeneratedAudio,
  onCollapse,
  onCreateAndListen,
  onOpenCinema,
  onOpenDemoProject,
  onStageSelect,
  providerEngineId,
  providerEngines,
}: Readonly<{
  activeDemoProjectId: string | null;
  canCreateAudio: boolean;
  canOpenCinema: boolean;
  currentStage: WorkspaceStage;
  hasGeneratedAudio: boolean;
  onCollapse: (collapsed: boolean) => void;
  onCreateAndListen: () => void;
  onOpenCinema: () => void;
  onOpenDemoProject: (project: DemoProject) => void;
  onStageSelect: (stage: WorkspaceStage) => void;
  providerEngineId: string;
  providerEngines: readonly TTSEngineDiagnostics[];
}>) {
  const activeDemoProject =
    demoProjects.find((project) => project.id === activeDemoProjectId) ?? demoProjects[0];
  const runtime = resolveProviderRuntimeCapabilities(providerEngineId, providerEngines);
  const runtimeLabel = runtime.capabilities.mockTts
    ? `${runtime.providerLabel} · fully local mock`
    : `${runtime.providerLabel} · provider-backed`;

  return (
    <section
      className="border-b px-3 py-3 vs-border vs-surface lg:px-4"
      data-ui-action-surface="Workspace"
    >
      <Panel className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">Try the Studio</h2>
                <StatusChip tone={runtime.capabilities.mockTts ? "success" : "warning"}>
                  {runtime.capabilities.mockTts ? "Mock provider" : "Provider-backed"}
                </StatusChip>
                <StatusChip>Unsaved demo</StatusChip>
                <StatusChip>Local fixtures</StatusChip>
              </div>
              <p className="vs-muted mt-1 max-w-3xl text-sm leading-6">
                Load a sample source, walk Intake to Cinema, and create audio only when you
                explicitly choose Create & Listen.
              </p>
            </div>
            <Button
              data-testid="ui-action-demo-collapse"
              data-ui-action-surface="Workspace"
              onClick={() => {
                onCollapse(true);
              }}
              size="sm"
              variant="ghost"
            >
              Hide
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {demoProjects.map((project) => (
              <button
                aria-pressed={project.id === activeDemoProjectId}
                className="rounded-md border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md vs-border vs-surface"
                data-ui-action-surface="Workspace"
                data-ui-noop-reason={
                  project.id === activeDemoProjectId ? "Demo project already loaded." : undefined
                }
                data-testid={`ui-action-demo-project-${project.id}`}
                key={project.id}
                onClick={() => {
                  onOpenDemoProject(project);
                }}
                type="button"
              >
                <span className="block text-sm font-semibold">{project.title}</span>
                <span className="vs-muted mt-1 block text-xs leading-5">
                  {demoProjectSummary(project)}
                </span>
                <span className="vs-muted mt-2 block text-xs leading-5">
                  {project.fixtureLabel}
                </span>
                <span className="mt-2 block text-xs leading-5">{project.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-md border p-3 vs-border">
          <div>
            <p className="text-sm font-semibold">{activeDemoProject.title}</p>
            <p className="vs-muted mt-1 text-xs leading-5">
              {activeDemoProject.sourceLabel} · {activeDemoProject.scopeHint}
            </p>
          </div>
          <dl className="grid gap-2 rounded-md border p-2 text-xs sm:grid-cols-3 vs-border">
            <DemoFact label="Runtime" value={runtimeLabel} />
            <DemoFact
              label="Storage"
              value={hasGeneratedAudio ? "local audio created" : "unsaved"}
            />
            <DemoFact label="Network" value="no external service required" />
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {activeDemoProject.verificationGoals.map((goal) => (
              <StatusChip className="py-0.5" key={goal}>
                {goal}
              </StatusChip>
            ))}
          </div>
          <div className="grid gap-2">
            {demoTourSteps.map((step) => {
              const isActive = isDemoTourStepActive(step, currentStage, hasGeneratedAudio);
              const disabledReason = demoTourDisabledReason(step, {
                canCreateAudio,
                canOpenCinema,
                hasGeneratedAudio,
              });
              return (
                <Button
                  align="start"
                  aria-current={isActive ? "step" : undefined}
                  className="grid h-auto grid-cols-[auto_minmax(0,1fr)] gap-2 whitespace-normal p-2 text-sm"
                  data-ui-action-surface="Workspace"
                  data-testid={`ui-action-demo-tour-${step.id}`}
                  disabled={Boolean(disabledReason)}
                  disabledReason={disabledReason}
                  key={step.id}
                  onClick={() => {
                    if (step.stage) {
                      onStageSelect(step.stage);
                    } else if (step.action === "createAudio") {
                      onCreateAndListen();
                    } else if (step.action === "openCinema") {
                      onOpenCinema();
                    }
                  }}
                  selected={isActive}
                  variant="secondary"
                >
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[0.65rem] font-semibold vs-border">
                    {isActive ? "•" : ""}
                  </span>
                  <span>
                    <span className="block font-semibold">{step.label}</span>
                    <span className="vs-muted block text-xs leading-5">{step.description}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      </Panel>
    </section>
  );
}

function DemoFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <dt className="vs-muted font-semibold uppercase tracking-[0.14em]">{label}</dt>
      <dd className="mt-1 leading-5">{value}</dd>
    </div>
  );
}

function isDemoTourStepActive(
  step: DemoTourStep,
  currentStage: WorkspaceStage,
  hasGeneratedAudio: boolean,
): boolean {
  if (step.stage) {
    return step.stage === currentStage;
  }
  if (step.action === "createAudio") {
    return hasGeneratedAudio;
  }
  return false;
}

function demoTourDisabledReason(
  step: DemoTourStep,
  state: Readonly<{
    canCreateAudio: boolean;
    canOpenCinema: boolean;
    hasGeneratedAudio: boolean;
  }>,
): string | undefined {
  if (step.action === "createAudio") {
    if (state.hasGeneratedAudio) {
      return "Mock audio already exists for the active demo source.";
    }
    return state.canCreateAudio ? undefined : "Load a demo source before creating mock audio.";
  }
  if (step.action === "openCinema") {
    return state.canOpenCinema
      ? undefined
      : "Create audio with the mock provider before opening Cinema.";
  }
  return undefined;
}
