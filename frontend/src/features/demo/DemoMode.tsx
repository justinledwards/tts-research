import { Button, Panel, StatusChip } from "../../design";
import type { WorkspaceStage } from "../workspace/model";
import { demoProjectSummary, demoProjects, type DemoProject } from "./demoProjects";
import { demoTourSteps } from "./demoTour";

export function DemoMode({
  activeDemoProjectId,
  currentStage,
  onCollapse,
  onOpenDemoProject,
  onStageSelect,
}: Readonly<{
  activeDemoProjectId: string | null;
  currentStage: WorkspaceStage;
  onCollapse: (collapsed: boolean) => void;
  onOpenDemoProject: (project: DemoProject) => void;
  onStageSelect: (stage: WorkspaceStage) => void;
}>) {
  const activeDemoProject =
    demoProjects.find((project) => project.id === activeDemoProjectId) ?? demoProjects[0];

  return (
    <section className="border-b px-3 py-3 vs-border vs-surface lg:px-4">
      <Panel className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">Try the Studio</h2>
                <StatusChip>Mock provider</StatusChip>
                <StatusChip>Unsaved demo</StatusChip>
              </div>
              <p className="vs-muted mt-1 max-w-3xl text-sm leading-6">
                Load a sample source, walk Intake to Cinema, and create audio only when you
                explicitly choose Create & Listen.
              </p>
            </div>
            <Button
              data-testid="ui-action-demo-collapse"
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
          <div className="grid gap-2">
            {demoTourSteps.map((step) => {
              const isActive = step.stage === currentStage;
              return (
                <button
                  aria-current={isActive ? "step" : undefined}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border p-2 text-left text-sm transition hover:shadow-sm vs-border"
                  data-disabled-reason={
                    step.stage
                      ? undefined
                      : "Create audio with the mock provider before opening Cinema."
                  }
                  data-testid={`ui-action-demo-tour-${step.id}`}
                  disabled={!step.stage}
                  key={step.id}
                  onClick={() => {
                    if (step.stage) {
                      onStageSelect(step.stage);
                    }
                  }}
                  type="button"
                >
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-[0.65rem] font-semibold vs-border">
                    {step.stage && isActive ? "•" : ""}
                  </span>
                  <span>
                    <span className="block font-semibold">{step.label}</span>
                    <span className="vs-muted block text-xs leading-5">{step.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>
    </section>
  );
}
