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
  BundleStat,
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

export function BundleFlowPanel({
  activeProjectId,
  activeProjectName,
  isOpen,
  mode,
  projects,
  onClose,
  onImported,
}: Readonly<{
  activeProjectId: string;
  activeProjectName: string;
  isOpen: boolean;
  mode: BundlePanelMode;
  projects: VoiceProject[];
  onClose: () => void;
  onImported: (result: ProjectBundleImportResult) => Promise<void> | void;
}>) {
  const panelRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(panelRef, { closeOnEscape: true, isOpen, onClose });
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-0 sm:p-4" role="presentation">
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
          <ExportBundleFlow activeProjectId={activeProjectId} onClose={onClose} />
        ) : (
          <ImportBundleFlow
            activeProjectId={activeProjectId}
            projects={projects}
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
}: Readonly<{ activeProjectId: string; onClose: () => void }>) {
  const [activeStep, setActiveStep] = useState<ExportBundleStep>("Contents");
  const [summary, setSummary] = useState<ProjectBundleSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);
    void getProjectBundleSummary(activeProjectId)
      .then((nextSummary) => {
        if (!isCancelled) {
          setSummary(nextSummary);
        }
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Unable to summarize bundle",
          );
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
  }, [activeProjectId]);

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
      <ExportStepContent activeStep={activeStep} summary={summary} />
      <ExportFlowFooter
        activeProjectId={activeProjectId}
        activeStep={activeStep}
        summary={summary}
        onClose={onClose}
        onStepChange={setActiveStep}
      />
    </div>
  );
}

type ExportBundleStep = "Contents" | "Review" | "Export";

function ExportStepContent({
  activeStep,
  summary,
}: Readonly<{ activeStep: ExportBundleStep; summary: ProjectBundleSummary | null }>) {
  if (!summary) {
    return null;
  }
  const includedItems = summary.contents.filter((item) => item.included);
  const optionalItems = summary.contents.filter((item) => !item.included);

  if (activeStep === "Contents") {
    return (
      <div className="grid gap-5">
        <section className="grid gap-3 rounded-lg border p-4 vs-surface">
          <SectionHeading
            subtitle="Default bundles include the portable assets needed to evaluate this project on another machine."
            title="Bundle contents"
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
      </section>
    </div>
  );
}

function ExportFlowFooter({
  activeProjectId,
  activeStep,
  summary,
  onClose,
  onStepChange,
}: Readonly<{
  activeProjectId: string;
  activeStep: ExportBundleStep;
  summary: ProjectBundleSummary | null;
  onClose: () => void;
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
          className={`inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 vs-accent-bg ${
            summary ? "" : "pointer-events-none opacity-50"
          }`}
          download={summary?.fileName ?? "voice-studio.voice-studio.zip"}
          href={projectBundleDownloadUrl(activeProjectId)}
        >
          Download Bundle
        </a>
      ) : (
        <button
          className="h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50 vs-accent-bg"
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
  onImported,
}: Readonly<{
  activeProjectId: string;
  projects: VoiceProject[];
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
    void previewProjectBundle(file)
      .then((nextPreview) => {
        if (!isCancelled) {
          setPreview(nextPreview);
          setActiveStep("Review");
          if (nextPreview.errors && nextPreview.errors.length > 0) {
            setError(nextPreview.errors.join(" "));
          }
        }
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to preview bundle");
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
  }, [file]);

  const canImport = Boolean(file && preview?.valid && !isImporting);

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
          isDragActive ? "border-orange-400 bg-orange-500/10" : "vs-border vs-surface"
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
  projects,
  targetProjectId,
  onModeChange,
  onTargetProjectChange,
}: Readonly<{
  mode: BundleImportMode;
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
      <label className="grid gap-1 text-sm">
        <span className="vs-muted text-xs font-semibold uppercase tracking-wide">Import mode</span>
        <select
          className="h-10 rounded-md border bg-[var(--vs-raised)] px-3 text-sm font-semibold vs-border"
          onChange={(event) => {
            onModeChange(event.currentTarget.value as BundleImportMode);
          }}
          value={mode}
        >
          <option value="copy">Import as new project</option>
          <option value="merge">Merge into selected project</option>
          <option value="replace">Replace selected project</option>
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

function ImportFlowFooter({
  activeStep,
  canImport,
  file,
  isImporting,
  mode,
  preview,
  targetProjectId,
  onError,
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
          className="h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50 vs-accent-bg"
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
          className="h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50 vs-accent-bg"
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
          targetProjectId={targetProjectId}
          onError={onError}
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
  targetProjectId,
  onError,
  onImported,
  onImportingChange,
  onResult,
}: Readonly<{
  canImport: boolean;
  file: File | null;
  isImporting: boolean;
  mode: BundleImportMode;
  targetProjectId: string;
  onError: (error: string | null) => void;
  onImported: (result: ProjectBundleImportResult) => Promise<void> | void;
  onImportingChange: (isImporting: boolean) => void;
  onResult: (result: ProjectBundleImportResult) => void;
}>) {
  return (
    <button
      className="h-10 rounded-md px-4 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 disabled:opacity-50 vs-accent-bg"
      disabled={!canImport}
      onClick={() => {
        if (!file) {
          return;
        }
        onImportingChange(true);
        onError(null);
        void importProjectBundle(file, mode, mode === "copy" ? undefined : targetProjectId)
          .then(async (nextResult) => {
            onResult(nextResult);
            await onImported(nextResult);
          })
          .catch((caughtError: unknown) => {
            onError(caughtError instanceof Error ? caughtError.message : "Unable to import bundle");
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
