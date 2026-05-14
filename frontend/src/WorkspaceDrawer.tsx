import { useEffect, type ReactNode } from "react";
import { formatDuration } from "./format";
import type { SystemMetrics, VoiceJob, VoiceProfile, VoiceProfileSource } from "./types";

export function WorkspaceDrawer({
  isOpen,
  job,
  metrics,
  metricsError,
  profileSource,
  profiles,
  selectedProfileId,
  onClose,
  onOpenSettings,
  onSelectProfile,
}: Readonly<{
  isOpen: boolean;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSource: VoiceProfileSource | null;
  profiles: VoiceProfile[];
  selectedProfileId: string;
  onClose: () => void;
  onOpenSettings: () => void;
  onSelectProfile: (profileId: string) => void;
}>) {
  useEscapeClose(isOpen, onClose);
  if (!isOpen) {
    return null;
  }

  const gpu = metrics?.gpus?.[0];
  const providerStatus = metrics
    ? `${metrics.serviceVersion || "backend"} online`
    : (metricsError ?? "Provider status pending");

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/25" role="presentation">
      <aside
        aria-label="Workspace"
        className="flex h-full w-full max-w-[460px] flex-col border-r border-zinc-200 bg-white shadow-2xl md:w-[420px]"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Workspace</p>
            <h2 className="text-lg font-semibold text-zinc-950">Voice Studio</h2>
          </div>
          <button
            aria-label="Close workspace"
            className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <WorkspaceSection title="Project">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm font-semibold text-zinc-950">The Future of Clean Energy</p>
              <p className="mt-1 text-xs text-zinc-500">
                {job?.id ? `Active job ${job.id.slice(0, 8)}` : "No active job"}
              </p>
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Recent Jobs">
            {job ? (
              <div className="rounded-md border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-950">
                    {job.voiceProfileName ?? "Default voice"}
                  </p>
                  <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                    {job.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
                  {job.inputText.trim().length > 0 ? job.inputText : "Draft source text"}
                </p>
                <p className="mt-3 text-xs text-zinc-500">
                  {Math.max(job.retries.totalSegments, job.segments?.length ?? 0)} segments ·{" "}
                  {formatDuration(job.durationMs)}
                </p>
              </div>
            ) : (
              <EmptyDrawerText>No restored jobs in this session.</EmptyDrawerText>
            )}
          </WorkspaceSection>

          <WorkspaceSection title="Voice Profiles">
            <div className="grid gap-2">
              {profiles.length > 0 ? (
                profiles.slice(0, 8).map((profile) => (
                  <button
                    className={`rounded-md border p-3 text-left text-sm transition ${
                      profile.id === selectedProfileId
                        ? "border-orange-300 bg-orange-50 text-orange-950"
                        : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
                    }`}
                    key={profile.id}
                    onClick={() => {
                      onSelectProfile(profile.id);
                      onClose();
                    }}
                    type="button"
                  >
                    <span className="block font-semibold">{profile.name}</span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {profile.language} ·{" "}
                      {formatDuration(profile.referenceDurationMs ?? profile.durationMs)}
                    </span>
                  </button>
                ))
              ) : (
                <EmptyDrawerText>No saved voice profiles yet.</EmptyDrawerText>
              )}
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Source Analyses">
            {profileSource ? (
              <div className="rounded-md border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-zinc-950">
                    {profileSource.sourceFile}
                  </p>
                  <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                    {profileSource.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {profileSource.candidates.length} detected voice
                  {profileSource.candidates.length === 1 ? "" : "s"} ·{" "}
                  {profileSource.progressMessage}
                </p>
              </div>
            ) : (
              <EmptyDrawerText>No source analysis staged.</EmptyDrawerText>
            )}
          </WorkspaceSection>

          <WorkspaceSection title="Runtime">
            <div className="grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <p className="font-semibold text-zinc-950">{providerStatus}</p>
              <p className="text-xs text-zinc-500">
                {gpu
                  ? `${gpu.name} · ${String(gpu.memoryUsedMiB)}/${String(gpu.memoryTotalMiB)} MiB`
                  : "GPU telemetry unavailable"}
              </p>
              <button
                className="mt-2 h-9 rounded-md border border-zinc-200 bg-white text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={onOpenSettings}
                type="button"
              >
                Open Settings
              </button>
            </div>
          </WorkspaceSection>
        </div>
      </aside>
    </div>
  );
}

function WorkspaceSection({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function EmptyDrawerText({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
      {children}
    </p>
  );
}

function useEscapeClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);
}
