import { demoVoiceLabel } from "./demoVoices";
import { demoSourceById, demoSources, type DemoSourceKind } from "./demoSources";

export type DemoProjectKind = DemoSourceKind;

export interface DemoProject {
  id: string;
  title: string;
  kind: DemoProjectKind;
  surfaceLabel: string;
  description: string;
  fixtureLabel: string;
  sourceLabel: string;
  voiceId: string;
  policyProfile: string;
  sampleText: string;
  scopeHint: string;
  verificationGoals: readonly string[];
}

export const demoProjects: readonly DemoProject[] = demoSources.map((source) => ({ ...source }));

export function demoProjectById(id: string): DemoProject | null {
  const source = demoSourceById(id);
  return source ? { ...source } : null;
}

export function demoProjectSummary(project: DemoProject): string {
  return `${project.surfaceLabel} · ${project.scopeHint} · ${demoVoiceLabel(project.voiceId)}`;
}
