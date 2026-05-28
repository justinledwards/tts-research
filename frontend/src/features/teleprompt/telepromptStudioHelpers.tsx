import { buildContextPanelTabs, type ContextPanelSectionInput } from "../context-panel";
import { TelepromptContextFact } from "./telepromptStudioComponents";
import { TELEPROMPT_SHORTCUTS } from "./telepromptToolbar";
import type { RevisionBlock } from "../revision";
import type { TelepromptCueSyncState } from "./telepromptCueTimeline";
import type { TelepromptReturnTarget } from "./telepromptReturnMemory";

interface BuildTelepromptContextTabsParams {
  readonly activeBlock: RevisionBlock | null;
  readonly cueSegmentIndex: number | null;
  readonly cueSegmentCount: number | null;
  readonly cueSyncStatusLabel: string;
  readonly policyProfile: string;
  readonly playbackAvailable: boolean;
  readonly playbackStatusLabel: string;
  readonly cueSync: TelepromptCueSyncState;
  readonly returnTarget: TelepromptReturnTarget;
  readonly scopeLabel: string;
  readonly sourceLabel: string;
  readonly sourceMeta: string;
  readonly voiceProfile: string;
}

export function buildTelepromptContextTabs({
  activeBlock,
  cueSegmentCount,
  cueSegmentIndex,
  cueSync,
  playbackAvailable,
  playbackStatusLabel,
  cueSyncStatusLabel,
  policyProfile,
  returnTarget,
  scopeLabel,
  sourceLabel,
  sourceMeta,
  voiceProfile,
}: BuildTelepromptContextTabsParams) {
  const cueTimingValue = cueSync.activeCue
    ? `${cueSync.activeCue.timingSource} / word ${cueSync.activeCue.currentWordIndex.toString()}`
    : "No active timing cue";
  const audioCueValue =
    cueSegmentIndex !== null
      ? `Segment ${String(cueSegmentIndex + 1)} of ${String(cueSegmentCount ?? 0)}`
      : "Waiting for generated audio";
  const sectionInputs: readonly ContextPanelSectionInput[] = [
    {
      children: (
        <dl className="grid gap-2 text-xs">
          <TelepromptContextFact label="Source" value={sourceLabel} />
          <TelepromptContextFact label="Scope" value={scopeLabel} />
          <TelepromptContextFact label="Block" value={activeBlock?.label ?? "No active block"} />
        </dl>
      ),
      detail: sourceMeta,
      id: "teleprompt-source-overview",
      kind: "source-provenance",
      tabId: "overview",
      title: "Teleprompt source",
    },
    {
      children: (
        <p className="text-xs leading-5 vs-muted">
          Back to Review and Back to Preview preserve this source, block, policy, voice, and script
          scroll position.
        </p>
      ),
      detail: `Current return target: ${returnTarget}`,
      id: "teleprompt-return-review",
      kind: "narration-block-status",
      tabId: "review",
      title: "Return context",
    },
    {
      children: (
        <dl className="grid gap-2 text-xs">
          <TelepromptContextFact label="Policy" value={policyProfile} />
          <TelepromptContextFact label="Voice" value={voiceProfile} />
        </dl>
      ),
      detail: `${policyProfile} - ${voiceProfile}`,
      id: "teleprompt-policy",
      kind: "speech-policy",
      tabId: "policy",
      title: "Speech policy",
    },
    {
      children: (
        <dl className="grid gap-2 text-xs">
          <TelepromptContextFact label="Audio cue" value={audioCueValue} />
          <TelepromptContextFact
            label="Playback"
            value={playbackAvailable ? playbackStatusLabel : "Not generated"}
          />
          <TelepromptContextFact label="Cue sync" value={cueSyncStatusLabel} />
          <TelepromptContextFact label="Cue timing" value={cueTimingValue} />
        </dl>
      ),
      detail: cueSync.detail,
      id: "teleprompt-diagnostics",
      kind: "generated-audio-health",
      tabId: "diagnostics",
      title: "Generated audio health",
    },
    {
      children: (
        <div className="grid gap-2 text-xs">
          {TELEPROMPT_SHORTCUTS.map((shortcut) => (
            <div className="flex items-center justify-between gap-3" key={shortcut.action}>
              <span className="font-semibold">{shortcut.label}</span>
              <kbd className="rounded border bg-[var(--vs-raised)] px-2 py-1 text-[0.68rem] vs-border">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      ),
      detail: "Keyboard operation",
      id: "teleprompt-history",
      kind: "wayfinding",
      tabId: "history",
      title: "Keyboard shortcuts",
    },
  ];
  return buildContextPanelTabs(sectionInputs, {
    allowedSurfaces: ["Teleprompt"],
    owner: "teleprompt",
  });
}
