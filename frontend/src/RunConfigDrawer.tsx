import { useRef } from "react";
import { useReaderModalLifecycle } from "./features/reader-accessibility";
import { RunConfigurationControls } from "./features/run-config/RunConfigDrawerHelpers";
import type { RunConfiguration } from "./runConfig";
import type { TTSEngineDiagnostics, VoiceJob, VoiceProfile } from "./types";

export function RunConfigDrawer({
  canSubmit,
  isOpen,
  job,
  runConfiguration,
  selectedProfile,
  ttsEngineError,
  ttsEngines,
  onChange,
  onClose,
  onPrepareProfileTarget,
  onSubmit,
}: Readonly<{
  canSubmit: boolean;
  isOpen: boolean;
  job: VoiceJob | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onChange: (configuration: RunConfiguration) => void;
  onClose: () => void;
  onPrepareProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onSubmit: () => void;
}>) {
  const drawerRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(drawerRef, { closeOnEscape: true, isOpen, onClose });
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/25" role="presentation">
      <aside
        aria-label="Run configuration"
        aria-modal="true"
        className="vs-app ml-auto flex h-full w-full max-w-[660px] flex-col border-l shadow-2xl md:w-[620px] vs-border"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between border-b px-5 py-4 vs-border">
          <div>
            <p className="vs-muted text-xs font-medium uppercase tracking-wide">Create</p>
            <h2 className="text-lg font-semibold">Run Configuration</h2>
          </div>
          <button
            aria-label="Close run configuration"
            className="grid h-9 w-9 place-items-center rounded-md border hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <RunConfigurationControls
            canSubmit={canSubmit}
            job={job}
            runConfiguration={runConfiguration}
            selectedProfile={selectedProfile}
            ttsEngineError={ttsEngineError}
            ttsEngines={ttsEngines}
            onChange={onChange}
            onPrepareProfileTarget={onPrepareProfileTarget}
            onSubmit={onSubmit}
          />
        </div>
      </aside>
    </div>
  );
}
