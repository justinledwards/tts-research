import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  getProjectBundleSummary,
  importProjectBundle,
  previewProjectBundle,
  projectBundleDownloadUrl,
} from "./api";
import {
  PRIVACY_NOTICES,
  PrivacyBoundaryPanel,
  projectExportPrivacyBoundary,
  projectImportPrivacyBoundary,
} from "./features/privacy";
import { useReaderModalLifecycle } from "./features/reader-accessibility";
import type {
  BundleImportMode,
  ProjectBundleImportResult,
  ProjectBundlePreview,
  ProjectBundleSummary,
  VoiceProject,
} from "./types";
import {
  BundleContentRow,
  BundlePreviewCard,
  ExportOptionalContent,
  ExportReviewSummary,
  ExportWarnings,
  formatBytes,
  ImportResult,
  PanelError,
  PanelNote,
  SectionHeading,
  StepRail,
} from "./BundlePanelsHelpers";

export type BundlePanelMode = "export" | "import";

export interface BundleOperationActivity {
  cancelLabel: string;
  canCancel: boolean;
  detail: string;
  id: string;
  label: string;
  status: "idle" | "running" | "attention" | "complete" | "cancelled";
}

export interface BundleOperationReport {
  conflicts?: ProjectBundlePreview["conflicts"];
  dependencies?: ProjectBundlePreview["dependencies"];
  detail: string;
  excluded?: ProjectBundleSummary["excluded"];
  generatedAudio?: number;
  generatedAudioIncluded?: boolean;
  kind: BundlePanelMode;
  omittedGeneratedAudio?: number;
  status: "blocked" | "ready" | "running" | "warning";
  title: string;
  updatedAt: string;
  validation?: ProjectBundlePreview["validation"];
  warnings?: string[];
}

export function BundleFlowPanel({
  activeProjectId,
  activeProjectName,
  isOpen,
  mode,
  projects,
  onClose,
  onOperationActivityChange,
  onOperationReportChange,
  onImported,
}: Readonly<{
  activeProjectId: string;
  activeProjectName: string;
  isOpen: boolean;
  mode: BundlePanelMode;
  projects: VoiceProject[];
  onClose: () => void;
  onOperationActivityChange?: (activity: BundleOperationActivity | null) => void;
  onOperationReportChange?: (report: BundleOperationReport) => void;
  onImported: (result: ProjectBundleImportResult) => Promise<void> | void;
}>) {
  const panelRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(panelRef, { closeOnEscape: true, isOpen, onClose });
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--vs-surface-overlay)] p-0 sm:p-4"
      role="presentation"
    >
      <section
        aria-label={mode === "export" ? "Export project bundle" : "Import project bundle"}
        aria-modal="true"
        className="vs-app ml-auto flex h-full w-full max-w-[760px] flex-col border-l shadow-2xl vs-raised sm:rounded-l-xl sm:border"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4 vs-border">
          <div className="min-w-0">
            <p className="vs-muted text-xs font-semibold uppercase tracking-[0.18em]">
              {mode === "export" ? "Portable Export" : "Bundle Import"}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold">
              {mode === "export" ? activeProjectName : "Bring in a Voice Studio bundle"}
            </h2>
          </div>
          <button
            aria-label="Close bundle panel"
            className="grid h-9 w-9 place-items-center rounded-md border text-lg transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        {mode === "export" ? (
          <ExportBundleFlow
            activeProjectId={activeProjectId}
            onClose={onClose}
            onOperationActivityChange={onOperationActivityChange}
            onOperationReportChange={onOperationReportChange}
          />
        ) : (
          <ImportBundleFlow
            activeProjectId={activeProjectId}
            projects={projects}
            onOperationActivityChange={onOperationActivityChange}
            onOperationReportChange={onOperationReportChange}
            onImported={onImported}
          />
        )}
      </section>
    </div>
  );
}

function ExportBundleFlow({
  activeProjectId,
  onClose,
  onOperationActivityChange,
  onOperationReportChange,
}: Readonly<{
  activeProjectId: string;
  onClose: () => void;
  onOperationActivityChange?: (activity: BundleOperationActivity | null) => void;
  onOperationReportChange?: (report: BundleOperationReport) => void;
}>) {
  const [activeStep, setActiveStep] = useState<ExportBundleStep>("Contents");
  const [summary, setSummary] = useState<ProjectBundleSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeGeneratedAudio, setIncludeGeneratedAudio] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);
    onOperationActivityChange?.(bundleActivity("export", "running", "Preparing export manifest."));
    void getProjectBundleSummary(activeProjectId, { includeGeneratedAudio })
      .then((nextSummary) => {
        if (!isCancelled) {
          setSummary(nextSummary);
          onOperationActivityChange?.(
            bundleActivity("export", "complete", "Export manifest is ready for review."),
          );
          onOperationReportChange?.(bundleReportFromSummary(nextSummary));
        }
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          const message =
            caughtError instanceof Error ? caughtError.message : "Unable to summarize bundle";
          setError(message);
          onOperationActivityChange?.(bundleActivity("export", "attention", message));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [activeProjectId, includeGeneratedAudio, onOperationActivityChange, onOperationReportChange]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <StepRail
        activeStep={activeStep}
        enabledSteps={summary ? ["Contents", "Review", "Export"] : ["Contents"]}
        steps={["Contents", "Review", "Export"]}
        onStepChange={(step) => {
          setActiveStep(step as ExportBundleStep);
        }}
      />
      {isLoading ? <PanelNote>Preparing bundle summary...</PanelNote> : null}
      {error ? <PanelError>{error}</PanelError> : null}
      <ExportStepContent
        activeStep={activeStep}
        includeGeneratedAudio={includeGeneratedAudio}
        summary={summary}
        onIncludeGeneratedAudioChange={setIncludeGeneratedAudio}
      />
      <ExportFlowFooter
        activeProjectId={activeProjectId}
        activeStep={activeStep}
        includeGeneratedAudio={includeGeneratedAudio}
        summary={summary}
        onClose={onClose}
        onOperationActivityChange={onOperationActivityChange}
        onStepChange={setActiveStep}
      />
    </div>
  );
}

type ExportBundleStep = "Contents" | "Review" | "Export";

type ExportBundleContentGroups = Readonly<{
  includedItems: ProjectBundleSummary["contents"];
  optionalItems: ProjectBundleSummary["contents"];
}>;

function splitExportBundleContents(
  contents: ProjectBundleSummary["contents"],
): ExportBundleContentGroups {
  return {
    includedItems: contents.filter((item) => item.included),
    optionalItems: contents.filter((item) => !item.included),
  };
}

function ExportStepContent({
  activeStep,
  includeGeneratedAudio,
  summary,
  onIncludeGeneratedAudioChange,
}: Readonly<{
  activeStep: ExportBundleStep;
  includeGeneratedAudio: boolean;
  summary: ProjectBundleSummary | null;
  onIncludeGeneratedAudioChange: (includeGeneratedAudio: boolean) => void;
}>) {
  if (!summary) {
    return null;
  }
  const { includedItems, optionalItems } = splitExportBundleContents(summary.contents);

  if (activeStep === "Contents") {
    return (
      <div className="grid gap-5">
        <section className="grid gap-3 rounded-lg border p-4 vs-surface">
          <SectionHeading
            subtitle="Default bundles include the portable assets needed to evaluate this project on another machine."
            title="Bundle contents"
          />
          <GeneratedAudioExportToggle
            includeGeneratedAudio={includeGeneratedAudio}
            summary={summary}
            onChange={onIncludeGeneratedAudioChange}
          />
          <div className="grid gap-2">
            {[...includedItems, ...optionalItems].map((item) => (
              <BundleContentRow item={item} key={item.key} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (activeStep === "Review") {
    return (
      <div className="grid gap-5">
        <ExportReviewSummary summary={summary} />
        <PrivacyBoundaryPanel
          boundaries={projectExportPrivacyBoundary()}
          compact
          title="Bundle data boundary"
        />
        <GeneratedAudioExportToggle
          includeGeneratedAudio={includeGeneratedAudio}
          summary={summary}
          onChange={onIncludeGeneratedAudioChange}
        />
        <section className="grid gap-3">
          <SectionHeading
            subtitle="Default bundles are portable: script, normalized text, generated audio, references, waveform peaks, telemetry, reports, run config, and reading settings."
            title="Included by default"
          />
          <div className="grid gap-2">
            {includedItems.map((item) => (
              <BundleContentRow item={item} key={item.key} />
            ))}
          </div>
        </section>
        <ExportOptionalContent optionalItems={optionalItems} />
        <ExportExcludedContent excludedItems={summary.excluded ?? []} />
        <ExportWarnings warnings={summary.warnings ?? []} />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 rounded-lg border p-4 vs-surface">
        <SectionHeading
          subtitle="The download is generated by the backend from the manifest and portable project assets."
          title="Ready to export"
        />
        <p className="vs-muted text-sm">
          {summary.fileName} · {formatBytes(summary.estimatedBytes)}
        </p>
        <p className="vs-muted text-xs">
          Generated audio {summary.generatedAudioIncluded ? "included" : "excluded"} for this
          download.
        </p>
      </section>
    </div>
  );
}

function ExportExcludedContent({
  excludedItems,
}: Readonly<{ excludedItems: ProjectBundleSummary["contents"] }>) {
  if (excludedItems.length === 0) {
    return null;
  }
  return (
    <section className="grid gap-3 rounded-lg border p-4 vs-surface">
      <SectionHeading
        subtitle="Sensitive runtime details and machine-local artifacts are kept out of portable bundles."
        title="Excluded from bundle"
      />
      <div className="grid gap-2">
        {excludedItems.map((item) => (
          <BundleContentRow item={item} key={item.key} />
        ))}
      </div>
    </section>
  );
}

function GeneratedAudioExportToggle({
  includeGeneratedAudio,
  summary,
  onChange,
}: Readonly<{
  includeGeneratedAudio: boolean;
  summary: ProjectBundleSummary;
  onChange: (includeGeneratedAudio: boolean) => void;
}>) {
  const omittedCount = summary.omittedGeneratedAudio ?? 0;
  const omittedBytes = summary.omittedGeneratedBytes ?? 0;
  return (
    <label className="flex items-start gap-3 rounded-md border p-3 text-sm vs-border vs-raised">
      <input
        checked={includeGeneratedAudio}
        className="mt-1"
        type="checkbox"
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <span className="grid gap-1">
        <span className="font-semibold">Include generated audio</span>
        <span className="vs-muted text-xs leading-5">
          {includeGeneratedAudio
            ? `${summary.generatedAudio.toString()} audio file(s) are included for offline playback.`
            : `${omittedCount.toString()} audio file(s), ${formatBytes(omittedBytes)}, will be omitted and can be regenerated after import.`}
        </span>
      </span>
    </label>
  );
}

function ExportFlowFooter({
  activeProjectId,
  activeStep,
  includeGeneratedAudio,
  summary,
  onClose,
  onOperationActivityChange,
  onStepChange,
}: Readonly<{
  activeProjectId: string;
  activeStep: ExportBundleStep;
  includeGeneratedAudio: boolean;
  summary: ProjectBundleSummary | null;
  onClose: () => void;
  onOperationActivityChange?: (activity: BundleOperationActivity | null) => void;
  onStepChange: (step: ExportBundleStep) => void;
}>) {
  const showBack = activeStep === "Review" || activeStep === "Export";
  const showDownload = activeStep === "Export";
  const nextStep = activeStep === "Contents" ? "Review" : "Export";
  return (
    <footer className="sticky bottom-0 mt-6 flex flex-wrap justify-end gap-3 border-t bg-[var(--vs-bg)] pt-4 vs-border">
      <button
        className="h-10 rounded-md border px-4 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
        onClick={onClose}
        type="button"
      >
        Close
      </button>
      {showBack ? (
        <button
          className="h-10 rounded-md border px-4 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
          onClick={() => {
            onStepChange(activeStep === "Export" ? "Review" : "Contents");
          }}
          type="button"
        >
          Back
        </button>
      ) : null}
      {showDownload ? (
        <a
          className={`inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-[var(--vs-action-primary-text)] shadow-sm shadow-[var(--vs-shadow)] vs-accent-bg ${
            summary ? "" : "pointer-events-none opacity-50"
          }`}
          download={summary?.fileName ?? "voice-studio.voice-studio.zip"}
          href={projectBundleDownloadUrl(activeProjectId, { includeGeneratedAudio })}
          onClick={() => {
            if (summary) {
              onOperationActivityChange?.(
                bundleActivity("export", "complete", "Bundle download started."),
              );
            }
          }}
        >
          Download Bundle
        </a>
      ) : (
        <button
          className="h-10 rounded-md px-4 text-sm font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50 vs-accent-bg"
          disabled={!summary}
          onClick={() => {
            onStepChange(nextStep);
          }}
          type="button"
        >
          {activeStep === "Contents" ? "Review Bundle" : "Continue to Export"}
        </button>
      )}
    </footer>
  );
}

function ImportBundleFlow({
  activeProjectId,
  projects,
  onOperationActivityChange,
  onOperationReportChange,
  onImported,
}: Readonly<{
  activeProjectId: string;
  projects: VoiceProject[];
  onOperationActivityChange?: (activity: BundleOperationActivity | null) => void;
  onOperationReportChange?: (report: BundleOperationReport) => void;
  onImported: (result: ProjectBundleImportResult) => Promise<void> | void;
}>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProjectBundlePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [mode, setMode] = useState<BundleImportMode>("copy");
  const [targetProjectId, setTargetProjectId] = useState(activeProjectId);
  const [result, setResult] = useState<ProjectBundleImportResult | null>(null);
  const [activeStep, setActiveStep] = useState<ImportBundleStep>("Choose Bundle");

  const acceptFile = useCallback((candidate: File | null | undefined) => {
    if (!candidate) {
      return;
    }
    setFile(candidate);
    setPreview(null);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!file) {
      return;
    }
    let isCancelled = false;
    setIsPreviewing(true);
    setError(null);
    onOperationActivityChange?.(
      bundleActivity("import", "running", "Previewing bundle before import."),
    );
    void previewProjectBundle(file)
      .then((nextPreview) => {
        if (!isCancelled) {
          setPreview(nextPreview);
          setActiveStep("Review");
          setMode(nextPreview.recommendedMode ?? "copy");
          if (nextPreview.errors && nextPreview.errors.length > 0) {
            setError(nextPreview.errors.join(" "));
          }
          onOperationActivityChange?.(
            bundleActivity(
              "import",
              nextPreview.valid ? "complete" : "attention",
              nextPreview.valid
                ? "Import preview is ready for conflict review."
                : "Import preview found blocking validation issues.",
            ),
          );
          onOperationReportChange?.(bundleReportFromPreview(nextPreview));
        }
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          const message =
            caughtError instanceof Error ? caughtError.message : "Unable to preview bundle";
          setError(message);
          onOperationActivityChange?.(bundleActivity("import", "attention", message));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsPreviewing(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [file, onOperationActivityChange, onOperationReportChange]);

  const canImport = Boolean(
    file && preview?.valid && !isImporting && importModeResolvesPreview(preview, mode),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <StepRail
        activeStep={activeStep}
        enabledSteps={importEnabledSteps(preview)}
        steps={["Choose Bundle", "Review", "Import"]}
        onStepChange={(step) => {
          setActiveStep(step as ImportBundleStep);
        }}
      />
      <ImportStepContent
        acceptFile={acceptFile}
        activeStep={activeStep}
        file={file}
        inputRef={inputRef}
        isDragActive={isDragActive}
        mode={mode}
        preview={preview}
        projects={projects}
        targetProjectId={targetProjectId}
        onDragActiveChange={setIsDragActive}
        onModeChange={setMode}
        onTargetProjectChange={setTargetProjectId}
      />
      {isPreviewing ? <PanelNote>Reading manifest and compatibility flags...</PanelNote> : null}
      {error ? <PanelError>{error}</PanelError> : null}
      <ImportResult result={result} />
      <ImportFlowFooter
        activeStep={activeStep}
        canImport={canImport}
        file={file}
        isImporting={isImporting}
        mode={mode}
        preview={preview}
        targetProjectId={targetProjectId}
        onError={setError}
        onOperationActivityChange={onOperationActivityChange}
        onOperationReportChange={onOperationReportChange}
        onImported={onImported}
        onImportingChange={setIsImporting}
        onResult={setResult}
        onStepChange={setActiveStep}
      />
    </div>
  );
}

type ImportBundleStep = "Choose Bundle" | "Review" | "Import";

function importEnabledSteps(preview: ProjectBundlePreview | null): ImportBundleStep[] {
  if (!preview) {
    return ["Choose Bundle"];
  }
  if (preview.valid) {
    return ["Choose Bundle", "Review", "Import"];
  }
  return ["Choose Bundle", "Review"];
}

function ImportStepContent({
  acceptFile,
  activeStep,
  file,
  inputRef,
  isDragActive,
  mode,
  preview,
  projects,
  targetProjectId,
  onDragActiveChange,
  onModeChange,
  onTargetProjectChange,
}: Readonly<{
  acceptFile: (candidate: File | null | undefined) => void;
  activeStep: ImportBundleStep;
  file: File | null;
  inputRef: RefObject<HTMLInputElement | null>;
  isDragActive: boolean;
  mode: BundleImportMode;
  preview: ProjectBundlePreview | null;
  projects: VoiceProject[];
  targetProjectId: string;
  onDragActiveChange: (isActive: boolean) => void;
  onModeChange: (mode: BundleImportMode) => void;
  onTargetProjectChange: (projectId: string) => void;
}>) {
  if (activeStep === "Choose Bundle") {
    return (
      <ImportChooseStep
        acceptFile={acceptFile}
        file={file}
        inputRef={inputRef}
        isDragActive={isDragActive}
        onDragActiveChange={onDragActiveChange}
      />
    );
  }
  if (activeStep === "Review") {
    return preview ? <BundlePreviewCard preview={preview} /> : null;
  }
  return (
    <ImportModeStep
      mode={mode}
      preview={preview}
      projects={projects}
      targetProjectId={targetProjectId}
      onModeChange={onModeChange}
      onTargetProjectChange={onTargetProjectChange}
    />
  );
}

function ImportChooseStep({
  acceptFile,
  file,
  inputRef,
  isDragActive,
  onDragActiveChange,
}: Readonly<{
  acceptFile: (candidate: File | null | undefined) => void;
  file: File | null;
  inputRef: RefObject<HTMLInputElement | null>;
  isDragActive: boolean;
  onDragActiveChange: (isActive: boolean) => void;
}>) {
  return (
    <div className="grid gap-4">
      <section
        aria-label="Drop or choose a Voice Studio bundle"
        className={`grid min-h-48 place-items-center rounded-xl border border-dashed p-6 text-center transition ${
          isDragActive
            ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
            : "vs-border vs-surface"
        }`}
        onDragLeave={() => {
          onDragActiveChange(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          onDragActiveChange(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDragActiveChange(false);
          acceptFile(event.dataTransfer.files.item(0));
        }}
      >
        <div className="max-w-md">
          <p className="text-lg font-semibold">Drop a `.voice-studio.zip` bundle</p>
          <p className="vs-muted mt-2 text-sm">
            Preview validates the manifest before it touches your projects.
          </p>
          <button
            className="mt-4 h-10 rounded-md border px-4 text-sm font-semibold transition hover:bg-[var(--vs-raised)] vs-border"
            onClick={() => {
              inputRef.current?.click();
            }}
            type="button"
          >
            Browse Bundle
          </button>
          <input
            ref={inputRef}
            accept=".voice-studio.zip,.zip"
            className="sr-only"
            type="file"
            onChange={(event) => {
              acceptFile(event.currentTarget.files?.item(0));
              event.currentTarget.value = "";
            }}
          />
          {file ? (
            <p className="vs-muted mt-3 truncate text-xs" title={file.name}>
              {file.name} · {formatBytes(file.size)}
            </p>
          ) : null}
        </div>
      </section>
      <PrivacyBoundaryPanel
        boundaries={projectImportPrivacyBoundary()}
        compact
        title="Import data boundary"
      />
      <p
        className="vs-muted rounded-md border p-3 text-xs leading-5 vs-border vs-surface"
        data-privacy-notice={PRIVACY_NOTICES.projectBundleImport.id}
      >
        {PRIVACY_NOTICES.projectBundleImport.message}
      </p>
    </div>
  );
}

function ImportModeStep({
  mode,
  preview,
  projects,
  targetProjectId,
  onModeChange,
  onTargetProjectChange,
}: Readonly<{
  mode: BundleImportMode;
  preview: ProjectBundlePreview | null;
  projects: VoiceProject[];
  targetProjectId: string;
  onModeChange: (mode: BundleImportMode) => void;
  onTargetProjectChange: (projectId: string) => void;
}>) {
  return (
    <section className="mt-5 grid gap-3 rounded-lg border p-4 vs-surface">
      <SectionHeading
        subtitle="The safe default keeps imported work separate so it can be evaluated independently."
        title="Conflict handling"
      />
      <p className="vs-muted rounded-md border p-3 text-xs leading-5 vs-border">
        {importModeResolvesPreview(preview, mode)
          ? "Selected resolution covers the previewed conflicts."
          : "Select a resolution supported by the blocking conflicts before import."}
      </p>
      <label className="grid gap-1 text-sm">
        <span className="vs-muted text-xs font-semibold uppercase tracking-wide">Import mode</span>
        <select
          className="h-10 rounded-md border bg-[var(--vs-raised)] px-3 text-sm font-semibold vs-border"
          onChange={(event) => {
            onModeChange(event.currentTarget.value as BundleImportMode);
          }}
          value={mode}
        >
          <option disabled={!importModeAvailable(preview, "copy")} value="copy">
            Duplicate as new project
          </option>
          <option disabled={!importModeAvailable(preview, "merge")} value="merge">
            Merge into selected project
          </option>
          <option disabled={!importModeAvailable(preview, "replace")} value="replace">
            Replace selected project
          </option>
        </select>
      </label>
      {mode === "copy" ? null : (
        <label className="grid gap-1 text-sm">
          <span className="vs-muted text-xs font-semibold uppercase tracking-wide">
            Target project
          </span>
          <select
            className="h-10 rounded-md border bg-[var(--vs-raised)] px-3 text-sm font-semibold vs-border"
            onChange={(event) => {
              onTargetProjectChange(event.currentTarget.value);
            }}
            value={targetProjectId}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

function importModeAvailable(
  preview: ProjectBundlePreview | null,
  mode: BundleImportMode,
): boolean {
  return !preview?.availableImportModes || preview.availableImportModes.includes(mode);
}

function importModeResolvesPreview(
  preview: ProjectBundlePreview | null,
  mode: BundleImportMode,
): boolean {
  if (!preview) {
    return false;
  }
  return (preview.conflicts ?? []).every((conflict) => {
    if (!conflict.blocking) {
      return true;
    }
    return !conflict.resolutions || conflict.resolutions.includes(mode);
  });
}

function ImportFlowFooter({
  activeStep,
  canImport,
  file,
  isImporting,
  mode,
  preview,
  targetProjectId,
  onError,
  onOperationActivityChange,
  onOperationReportChange,
  onImported,
  onImportingChange,
  onResult,
  onStepChange,
}: Readonly<{
  activeStep: ImportBundleStep;
  canImport: boolean;
  file: File | null;
  isImporting: boolean;
  mode: BundleImportMode;
  preview: ProjectBundlePreview | null;
  targetProjectId: string;
  onError: (error: string | null) => void;
  onOperationActivityChange?: (activity: BundleOperationActivity | null) => void;
  onOperationReportChange?: (report: BundleOperationReport) => void;
  onImported: (result: ProjectBundleImportResult) => Promise<void> | void;
  onImportingChange: (isImporting: boolean) => void;
  onResult: (result: ProjectBundleImportResult) => void;
  onStepChange: (step: ImportBundleStep) => void;
}>) {
  const showBack = activeStep === "Review" || activeStep === "Import";
  return (
    <footer className="sticky bottom-0 mt-6 flex flex-wrap justify-end gap-3 border-t bg-[var(--vs-bg)] pt-4 vs-border">
      {showBack ? (
        <button
          className="h-10 rounded-md border px-4 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
          onClick={() => {
            onStepChange(activeStep === "Import" ? "Review" : "Choose Bundle");
          }}
          type="button"
        >
          Back
        </button>
      ) : null}
      {activeStep === "Choose Bundle" ? (
        <button
          className="h-10 rounded-md px-4 text-sm font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50 vs-accent-bg"
          disabled={!preview}
          onClick={() => {
            onStepChange("Review");
          }}
          type="button"
        >
          Review Bundle
        </button>
      ) : null}
      {activeStep === "Review" ? (
        <button
          className="h-10 rounded-md px-4 text-sm font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50 vs-accent-bg"
          disabled={!preview?.valid}
          onClick={() => {
            onStepChange("Import");
          }}
          type="button"
        >
          Continue to Import
        </button>
      ) : null}
      {activeStep === "Import" ? (
        <ImportButton
          canImport={canImport}
          file={file}
          isImporting={isImporting}
          mode={mode}
          preview={preview}
          targetProjectId={targetProjectId}
          onError={onError}
          onOperationActivityChange={onOperationActivityChange}
          onOperationReportChange={onOperationReportChange}
          onImported={onImported}
          onImportingChange={onImportingChange}
          onResult={onResult}
        />
      ) : null}
    </footer>
  );
}

function ImportButton({
  canImport,
  file,
  isImporting,
  mode,
  preview,
  targetProjectId,
  onError,
  onOperationActivityChange,
  onOperationReportChange,
  onImported,
  onImportingChange,
  onResult,
}: Readonly<{
  canImport: boolean;
  file: File | null;
  isImporting: boolean;
  mode: BundleImportMode;
  preview: ProjectBundlePreview | null;
  targetProjectId: string;
  onError: (error: string | null) => void;
  onOperationActivityChange?: (activity: BundleOperationActivity | null) => void;
  onOperationReportChange?: (report: BundleOperationReport) => void;
  onImported: (result: ProjectBundleImportResult) => Promise<void> | void;
  onImportingChange: (isImporting: boolean) => void;
  onResult: (result: ProjectBundleImportResult) => void;
}>) {
  return (
    <button
      className="h-10 rounded-md px-4 text-sm font-semibold text-[var(--vs-action-primary-text)] shadow-sm shadow-[var(--vs-shadow)] disabled:opacity-50 vs-accent-bg"
      disabled={!canImport}
      onClick={() => {
        if (!file) {
          return;
        }
        onImportingChange(true);
        onError(null);
        onOperationActivityChange?.(
          bundleActivity("import", "running", "Importing bundle into local storage."),
        );
        void importProjectBundle(file, mode, mode === "copy" ? undefined : targetProjectId)
          .then(async (nextResult) => {
            onResult(nextResult);
            await onImported(nextResult);
            onOperationActivityChange?.(
              bundleActivity("import", "complete", `Imported ${nextResult.project.name}.`),
            );
            if (preview) {
              onOperationReportChange?.(bundleReportFromPreview(preview, "ready"));
            }
          })
          .catch((caughtError: unknown) => {
            const message =
              caughtError instanceof Error ? caughtError.message : "Unable to import bundle";
            onError(message);
            onOperationActivityChange?.(bundleActivity("import", "attention", message));
          })
          .finally(() => {
            onImportingChange(false);
          });
      }}
      type="button"
    >
      {isImporting ? "Importing..." : "Import Bundle"}
    </button>
  );
}

function bundleActivity(
  kind: BundlePanelMode,
  status: BundleOperationActivity["status"],
  detail: string,
): BundleOperationActivity {
  return {
    cancelLabel: "Cancel",
    canCancel: false,
    detail,
    id: `bundle:${kind}`,
    label: kind === "export" ? "Bundle export" : "Bundle import",
    status,
  };
}

function bundleReportFromSummary(summary: ProjectBundleSummary): BundleOperationReport {
  return {
    detail: `${summary.fileName} · ${formatBytes(summary.estimatedBytes)} · generated audio ${
      summary.generatedAudioIncluded ? "included" : "excluded"
    }.`,
    excluded: summary.excluded,
    generatedAudio: summary.generatedAudio,
    generatedAudioIncluded: summary.generatedAudioIncluded,
    kind: "export",
    omittedGeneratedAudio: summary.omittedGeneratedAudio,
    status: summary.warnings && summary.warnings.length > 0 ? "warning" : "ready",
    title: `Export manifest for ${summary.projectName}`,
    updatedAt: summary.createdAt,
    warnings: summary.warnings,
  };
}

function bundleReportFromPreview(
  preview: ProjectBundlePreview,
  status: BundleOperationReport["status"] = preview.valid ? "ready" : "blocked",
): BundleOperationReport {
  return {
    conflicts: preview.conflicts,
    dependencies: preview.dependencies,
    detail: `${preview.projectName ?? "Unnamed bundle"} · ${String(preview.chapterCount ?? 0)} chapter(s) · ${formatBytes(
      preview.estimatedBytes ?? 0,
    )}.`,
    excluded: preview.excluded ?? preview.manifest?.excluded,
    generatedAudio: preview.generatedAudio,
    generatedAudioIncluded: preview.manifest?.generatedAudioIncluded,
    kind: "import",
    omittedGeneratedAudio: preview.manifest?.omittedGeneratedAudio,
    status,
    title: `Import preview for ${preview.projectName ?? "bundle"}`,
    updatedAt: new Date().toISOString(),
    validation: preview.validation,
    warnings: preview.warnings,
  };
}
