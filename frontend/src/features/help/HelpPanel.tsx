import { useRef, type ReactNode } from "react";
import { useReaderModalLifecycle } from "../reader-accessibility";
import { getRunModePreset } from "../../runConfig";
import type {
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
} from "../../types";
import {
  HELP_ANCHORS,
  explainCurrentState,
  resolveActiveHelpAnchor,
  type HelpWorkflowContext,
} from "./model";
import type { SettingsCommandTarget } from "../settings/model";

export function HelpPanel({
  commandPaletteShortcutLabel,
  context,
  isOpen,
  job,
  profileSourceDiagnostics,
  profileSource,
  selectedProfile,
  shortcutCheatSheetLabel,
  preferredAnchorId,
  onOpenSettings,
  onClose,
}: Readonly<{
  commandPaletteShortcutLabel: string;
  context: HelpWorkflowContext;
  isOpen: boolean;
  job: VoiceJob | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  profileSource: VoiceProfileSource | null;
  selectedProfile: VoiceProfile | null;
  shortcutCheatSheetLabel: string;
  preferredAnchorId?: (typeof HELP_ANCHORS)[number]["id"] | null;
  onOpenSettings?: (target: SettingsCommandTarget) => void;
  onClose: () => void;
}>) {
  if (!isOpen) {
    return null;
  }

  const activeAnchor = preferredAnchorId ?? resolveActiveHelpAnchor(context);
  const currentExplanation = explainCurrentState(job, profileSource);
  const runPreset = getRunModePreset(context.runConfiguration.runMode);
  return (
    <PanelShell label="Help" title="Context Guide" onClose={onClose}>
      <section className="grid gap-3 rounded-md border border-[var(--vs-selected-border)] bg-[var(--vs-selected)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--vs-selected-text)]">Right now</h3>
          <span className="rounded-full border border-[var(--vs-selected-border)] bg-[var(--vs-surface-primary)] px-2 py-0.5 text-xs font-semibold text-[var(--vs-selected-text)]">
            {HELP_ANCHORS.find((anchor) => anchor.id === activeAnchor)?.label}
          </span>
        </div>
        <p className="text-sm leading-6 text-[var(--vs-selected-text)]">{currentExplanation}</p>
      </section>

      <section className="mt-4 grid gap-2 rounded-md border p-4 vs-border vs-surface">
        <h3 className="text-sm font-semibold">Fast access</h3>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <ShortcutHint label="Command palette" value={commandPaletteShortcutLabel} />
          <ShortcutHint label="Shortcut cheat sheet" value={shortcutCheatSheetLabel} />
        </div>
      </section>

      <section className="mt-4 grid gap-3 rounded-md border p-4 vs-border vs-surface">
        <div>
          <h3 className="text-sm font-semibold">Settings links</h3>
          <p className="vs-muted mt-1 text-xs leading-5">
            Jump straight to the source scope that controls temporary work.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <SettingsLink
            detail="Expiry, cleanup, webpage extraction, generated temporary audio, and return context."
            disabled={!onOpenSettings}
            label="Temporary source behavior"
            onClick={() => {
              onOpenSettings?.({
                fieldId: "temporarySourceBehavior",
                groupId: "sources",
                layerId: "advanced",
                scope: "temporarySource",
              });
            }}
          />
          <SettingsLink
            detail="Durable project behavior for unpinned promoted sources."
            disabled={!onOpenSettings}
            label="Project source defaults"
            onClick={() => {
              onOpenSettings?.({
                fieldId: "projectSpeechPolicy",
                groupId: "sources",
                layerId: "advanced",
                scope: "project",
              });
            }}
          />
        </div>
      </section>

      <section className="mt-5 grid gap-3">
        <h3 className="vs-muted text-xs font-semibold uppercase tracking-wide">Workflow anchors</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {HELP_ANCHORS.map((anchor) => (
            <a
              className={`rounded-md border p-3 text-left transition ${
                activeAnchor === anchor.id
                  ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
                  : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
              }`}
              href={`#help-${anchor.id}`}
              key={anchor.id}
            >
              <span className="block text-sm font-semibold">{anchor.label}</span>
              <span className="vs-muted mt-1 block text-xs leading-5">{anchor.detail}</span>
            </a>
          ))}
        </div>
      </section>

      <PanelSection title="Active context">
        <DiagnosticLine
          label="Stage"
          value={HELP_ANCHORS.find((item) => item.id === activeAnchor)?.label ?? "Intake"}
        />
        <DiagnosticLine label="Source mode" value={sourceModeLabel(context.sourceMode)} />
        <DiagnosticLine label="Run mode" value={runPreset.label} />
        <DiagnosticLine label="Selected profile" value={selectedProfile?.name ?? "Default voice"} />
      </PanelSection>

      <PanelSection title="Health hints">
        <DiagnosticLine
          label="Source analysis"
          value={profileSource?.status ?? "No source queued"}
        />
        <DiagnosticLine label="Pyannote" value={profileSourceDiagnostics?.mode ?? "Pending"} />
        <DiagnosticLine
          label="Local model"
          value={
            profileSourceDiagnostics?.localModelAvailable
              ? "Available"
              : "Set VOICE_PROFILE_DIARIZATION_MODEL_PATH"
          }
        />
        <DiagnosticLine label="TTS job" value={job?.status ?? "No active job"} />
      </PanelSection>
    </PanelShell>
  );
}

function ShortcutHint({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-[var(--vs-raised)] px-3 py-2 vs-border">
      <span className="vs-muted text-xs font-semibold">{label}</span>
      <kbd className="rounded border bg-[var(--vs-surface)] px-2 py-1 text-[0.68rem] font-semibold vs-border">
        {value}
      </kbd>
    </div>
  );
}

function SettingsLink({
  detail,
  disabled,
  label,
  onClick,
}: Readonly<{
  detail: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      className="rounded-md border p-3 text-left transition vs-border vs-raised hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="vs-muted mt-1 block text-xs leading-5">{detail}</span>
    </button>
  );
}

function sourceModeLabel(mode: HelpWorkflowContext["sourceMode"]): string {
  if (mode === "fileUrl") {
    return "File / URL";
  }
  if (mode === "book") {
    return "Book";
  }
  return "Text";
}

function PanelShell({
  children,
  label,
  onClose,
  title,
}: Readonly<{
  children: ReactNode;
  label: string;
  onClose: () => void;
  title: string;
}>) {
  const panelRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(panelRef, { closeOnEscape: true, onClose });

  return (
    <div className="fixed inset-0 z-50 bg-[var(--vs-surface-overlay)]" role="presentation">
      <aside
        aria-label={label}
        aria-modal="true"
        className="vs-app ml-auto flex h-full w-full max-w-[640px] flex-col border-l shadow-2xl md:w-[620px] vs-border"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between border-b px-5 py-4 vs-border">
          <div>
            <p className="vs-muted text-xs font-medium uppercase tracking-wide">{label}</p>
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <button
            aria-label={`Close ${label}`}
            className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

function PanelSection({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="mt-5">
      <h3 className="vs-muted mb-3 text-xs font-semibold uppercase tracking-wide">{title}</h3>
      <div className="grid gap-3 rounded-md border p-4 vs-border vs-raised">{children}</div>
    </section>
  );
}

function DiagnosticLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="vs-muted">{label}</dt>
      <dd className="max-w-[65%] break-words text-right font-medium">{value}</dd>
    </div>
  );
}
