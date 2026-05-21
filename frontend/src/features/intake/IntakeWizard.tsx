import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Panel, SegmentedControl, StatusChip, fieldControlClassName } from "../../design";
import type {
  BookSource,
  BookSourceImportOptions,
  BookSourceScopeContent,
  BookScope,
  MarkdownParseMode,
  PreparedSource,
  VoiceProfile,
} from "../../types";
import {
  bookScopeKey,
  bookScopeLabel,
  bookScopeOptions,
  bookSourceName,
  normalizeBookScopeForBook,
  resolveDefaultBookScope,
} from "../book-cinema/model";
import {
  INTAKE_INTENT_OPTIONS,
  INTAKE_SOURCE_CHOICE_OPTIONS,
  INTAKE_STEPS,
  nextIntakeStep,
  previousIntakeStep,
  type IntakeStepId,
} from "./intakeSteps";
import {
  INTAKE_PROJECT_TEMPLATES,
  defaultTemplateForIntent,
  intakeTemplateById,
  type IntakeProjectTemplate,
} from "./projectTemplates";
import {
  detectIntakeSource,
  extensionForName,
  languageLabel,
  sourceTypeLabel,
  type IntakeIntentId,
  type IntakePreparationTarget,
  type IntakeSourceChoice,
  type IntakeSourceMode,
  type IntakeSourceType,
} from "./sourceTypeModel";

export type IntakeDestinationStage = "review" | "preview";

export interface IntakeWizardProps {
  bookSourceError: string | null;
  bookSources: BookSource[];
  bookScopeContent: BookSourceScopeContent | null;
  isImportingBookSource: boolean;
  isPreparingSource: boolean;
  preparedSources: PreparedSource[];
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  selectedVoiceProfileId: string;
  sourceMode: IntakeSourceMode;
  sourcePrepError: string | null;
  text: string;
  voiceProfileLabel: string;
  voiceProfiles: VoiceProfile[];
  onImportBookFiles: (files: File[], options?: BookSourceImportOptions) => Promise<void>;
  onInspectBookSource: (source: BookSource) => void;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onOpenBookCinema: (source?: BookSource, scope?: BookScope) => void;
  onOpenPreparedSourceCinema: (source: PreparedSource) => void;
  onOpenVoiceCloning: () => void;
  onPrepareFile: (
    file: File,
    markdownParseMode: MarkdownParseMode,
    preparationTarget?: IntakePreparationTarget,
  ) => Promise<void>;
  onPrepareUrl: (
    url: string,
    markdownParseMode: MarkdownParseMode,
    preparationTarget?: IntakePreparationTarget,
  ) => Promise<void>;
  onScopeChange: (scope: BookScope) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onStageChange: (stage: IntakeDestinationStage) => void;
  onUseBookSource: (source: BookSource, scope: BookScope) => void;
  onUseDraftText: (text: string) => void;
  onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
  onVoiceProfileChange: (profileId: string) => void;
}

const LANGUAGE_OPTIONS = [
  { label: "English", value: "en-US" },
  { label: "Swedish", value: "sv-SE" },
  { label: "Spanish", value: "es-ES" },
  { label: "French", value: "fr-FR" },
  { label: "German", value: "de-DE" },
] as const;

const SOURCE_TYPE_OPTIONS = [
  { label: "Book", value: "book" },
  { label: "Document", value: "document" },
  { label: "Webpage", value: "webpage" },
  { label: "Draft text", value: "draft" },
  { label: "Voice clone", value: "voice-clone" },
] as const;

const MARKDOWN_PARSE_OPTIONS = [
  { label: "Strict", value: "strict" },
  { label: "Legacy", value: "legacy" },
] as const;

type VoiceStrategy = "default" | "language" | "profile";

const INTAKE_SOURCE_FILE_ACCEPT =
  ".txt,.md,.markdown,.text,.log,.csv,.json,.html,.htm,.pdf,.epub,.docx,.zip,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,image/png,image/jpeg,image/tiff,image/webp";

type IntakeExistingSource =
  | {
      detail: string;
      key: string;
      label: string;
      source: BookSource;
      type: "book";
    }
  | {
      detail: string;
      key: string;
      label: string;
      source: PreparedSource;
      type: "prepared";
    };

function initialIntentForSelection(
  sourceMode: IntakeSourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
): IntakeIntentId {
  return intentForHydratedSource(
    sourceMode,
    Boolean(selectedBookSource),
    selectedPreparedSource?.kind ?? null,
  );
}

function intentForHydratedSource(
  sourceMode: IntakeSourceMode,
  hasBookSource: boolean,
  preparedSourceKind: PreparedSource["kind"] | null,
): IntakeIntentId {
  if (sourceMode === "book" && hasBookSource) {
    return "book";
  }
  if (sourceMode === "fileUrl" && preparedSourceKind === "url") {
    return "webpage";
  }
  if (sourceMode === "fileUrl" && preparedSourceKind) {
    return "document";
  }
  return "document";
}

function initialSourceChoiceForSelection(
  sourceMode: IntakeSourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
  text: string,
): IntakeSourceChoice {
  if (
    (sourceMode === "book" && selectedBookSource) ||
    (sourceMode === "fileUrl" && selectedPreparedSource)
  ) {
    return "existing";
  }
  if (text.trim()) {
    return "pastedText";
  }
  return "file";
}

function initialExistingSourceKey(
  sourceMode: IntakeSourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
): string {
  if (sourceMode === "fileUrl" && selectedPreparedSource) {
    return `prepared:${selectedPreparedSource.id}`;
  }
  if (sourceMode === "book" && selectedBookSource) {
    return `book:${selectedBookSource.id}`;
  }
  if (selectedPreparedSource) {
    return `prepared:${selectedPreparedSource.id}`;
  }
  return "";
}

function existingSourceTypeForDetection(
  source: IntakeExistingSource | undefined,
): IntakeSourceType | null {
  if (!source) {
    return null;
  }
  if (source.type === "book") {
    return "book";
  }
  return source.source.kind === "url" ? "webpage" : "document";
}

function selectedSourceKeyForMode(
  sourceMode: IntakeSourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
): string {
  return initialExistingSourceKey(sourceMode, selectedBookSource, selectedPreparedSource);
}

function bookScopeForWizard(source: BookSource | null, selectedScope: BookScope | null) {
  if (!source) {
    return null;
  }
  return selectedScope
    ? normalizeBookScopeForBook(source, selectedScope)
    : resolveDefaultBookScope(source);
}

function activeDestinationBook(
  existingSource: IntakeExistingSource | undefined,
  selectedBookSource: BookSource | null,
): BookSource | null {
  if (existingSource) {
    return existingSource.type === "book" ? existingSource.source : null;
  }
  return selectedBookSource?.status === "ready" ? selectedBookSource : null;
}

function activeDestinationPrepared(
  existingSource: IntakeExistingSource | undefined,
  selectedPreparedSource: PreparedSource | null,
): PreparedSource | null {
  if (existingSource) {
    return existingSource.type === "prepared" ? existingSource.source : null;
  }
  return selectedPreparedSource?.status === "ready" ? selectedPreparedSource : null;
}

function destinationStructureLabel(
  bookScopeContent: BookSourceScopeContent | null,
  activeBook: BookSource | null,
  detectedStructureLabel: string,
): string {
  const bookBlockCount = bookScopeContent?.blocks?.length ?? 0;
  if (bookBlockCount > 0 && activeBook) {
    return `${bookBlockCount.toLocaleString()} review blocks`;
  }
  return detectedStructureLabel;
}

export function IntakeWizard({
  bookSourceError,
  bookSources,
  bookScopeContent,
  isImportingBookSource,
  isPreparingSource,
  preparedSources,
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  selectedVoiceProfileId,
  sourceMode,
  sourcePrepError,
  text,
  voiceProfileLabel,
  voiceProfiles,
  onImportBookFiles,
  onInspectBookSource,
  onInspectPreparedSource,
  onOpenBookCinema,
  onOpenPreparedSourceCinema,
  onOpenVoiceCloning,
  onPrepareFile,
  onPrepareUrl,
  onScopeChange,
  onSpeechPolicyProfileChange,
  onStageChange,
  onUseBookSource,
  onUseDraftText,
  onUsePreparedSource,
  onVoiceProfileChange,
}: Readonly<IntakeWizardProps>) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initialIntent = initialIntentForSelection(
    sourceMode,
    selectedBookSource,
    selectedPreparedSource,
  );
  const initialTemplate = defaultTemplateForIntent(initialIntent);
  const [activeStep, setActiveStep] = useState<IntakeStepId>("intent");
  const [intentId, setIntentId] = useState<IntakeIntentId>(initialIntent);
  const [sourceChoice, setSourceChoice] = useState<IntakeSourceChoice>(
    initialSourceChoiceForSelection(sourceMode, selectedBookSource, selectedPreparedSource, text),
  );
  const [templateId, setTemplateId] = useState(initialTemplate.id);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [draftText, setDraftText] = useState(text);
  const [metadataTitle, setMetadataTitle] = useState("");
  const [language, setLanguage] = useState(initialTemplate.language);
  const [sourceType, setSourceType] = useState<IntakeSourceType>(initialTemplate.sourceType);
  const [markdownParseMode, setMarkdownParseMode] = useState<MarkdownParseMode>("strict");
  const [voiceStrategy, setVoiceStrategy] = useState<VoiceStrategy>(initialTemplate.voiceStrategy);
  const [presetVoiceProfileId, setPresetVoiceProfileId] = useState(selectedVoiceProfileId);
  const [existingSourceKey, setExistingSourceKey] = useState(() =>
    initialExistingSourceKey(sourceMode, selectedBookSource, selectedPreparedSource),
  );
  const [hasUserChosenSourceChoice, setHasUserChosenSourceChoice] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const selectedBookSourceIdForWizard = selectedBookSource?.id ?? "";
  const selectedPreparedSourceKindForWizard = selectedPreparedSource?.kind ?? null;
  const selectedProjectSourceKey = selectedSourceKeyForMode(
    sourceMode,
    selectedBookSource,
    selectedPreparedSource,
  );

  const template = intakeTemplateById(templateId);
  const existingSources = useMemo(
    (): IntakeExistingSource[] => [
      ...bookSources.map((source) => ({
        detail: `${source.kind.toUpperCase()} · ${source.wordCount.toLocaleString()} words`,
        key: `book:${source.id}`,
        label: bookSourceName(source),
        source,
        type: "book" as const,
      })),
      ...preparedSources.map((source) => ({
        detail: `${source.kind.toUpperCase()} · ${source.wordCount.toLocaleString()} words`,
        key: `prepared:${source.id}`,
        label: source.title ?? source.sourceName,
        source,
        type: "prepared" as const,
      })),
    ],
    [bookSources, preparedSources],
  );
  const selectedExistingSource = existingSources.find((source) => source.key === existingSourceKey);
  const existingBookSource =
    selectedExistingSource?.type === "book" ? selectedExistingSource.source : null;
  const scopeBookSource = sourceChoice === "existing" ? existingBookSource : selectedBookSource;
  const detected = detectIntakeSource({
    existingSourceType: existingSourceTypeForDetection(selectedExistingSource),
    fileName: selectedFile?.name,
    intentId,
    pastedText: draftText,
    sourceChoice,
    templateSourceType: template.sourceType,
    url: sourceUrl,
  });
  const effectiveTitle = metadataTitle.trim() || detected.title;
  const currentBookScope = bookScopeForWizard(scopeBookSource, selectedBookScope);
  const scopeOptions = scopeBookSource ? bookScopeOptions(scopeBookSource) : [];
  const isWorking = isPreparingSource || isImportingBookSource;
  const intakeError = localError ?? sourcePrepError ?? bookSourceError;

  useEffect(() => {
    if (!selectedProjectSourceKey) {
      return;
    }
    if (existingSourceKey !== selectedProjectSourceKey) {
      setExistingSourceKey(selectedProjectSourceKey);
    }
    if (!hasUserChosenSourceChoice) {
      const nextIntent = intentForHydratedSource(
        sourceMode,
        Boolean(selectedBookSourceIdForWizard),
        selectedPreparedSourceKindForWizard,
      );
      const nextTemplate = defaultTemplateForIntent(nextIntent);
      if (sourceChoice !== "existing") {
        setSourceChoice("existing");
      }
      if (intentId !== nextIntent) {
        setIntentId(nextIntent);
      }
      if (templateId !== nextTemplate.id) {
        setTemplateId(nextTemplate.id);
      }
      if (sourceType !== nextTemplate.sourceType) {
        setSourceType(nextTemplate.sourceType);
      }
    }
  }, [
    existingSourceKey,
    hasUserChosenSourceChoice,
    intentId,
    selectedBookSourceIdForWizard,
    selectedPreparedSourceKindForWizard,
    selectedProjectSourceKey,
    sourceMode,
    sourceChoice,
    sourceType,
    templateId,
  ]);

  function applyTemplate(nextTemplate: IntakeProjectTemplate) {
    setTemplateId(nextTemplate.id);
    setIntentId(nextTemplate.intentId);
    setSourceChoice(nextTemplate.sourceChoice);
    setHasUserChosenSourceChoice(true);
    setLanguage(nextTemplate.language);
    setSourceType(nextTemplate.sourceType);
    setVoiceStrategy(nextTemplate.voiceStrategy);
    onSpeechPolicyProfileChange(nextTemplate.speechPolicyProfile);
  }

  function rejectSourceStep(message: string) {
    setLocalError(message);
    setActiveStep("source");
  }

  async function openExistingSourceDestination(stage: IntakeDestinationStage) {
    if (!selectedExistingSource) {
      rejectSourceStep("Choose an existing source before opening the next stage.");
      return;
    }
    if (selectedExistingSource.type === "book") {
      onUseBookSource(
        selectedExistingSource.source,
        currentBookScope ?? resolveDefaultBookScope(selectedExistingSource.source),
      );
    } else {
      await onUsePreparedSource(selectedExistingSource.source);
    }
    onStageChange(stage);
  }

  async function openDestination(stage: IntakeDestinationStage) {
    setLocalError(null);
    applyVoiceChoice();
    onSpeechPolicyProfileChange(template.speechPolicyProfile);

    if (intentId === "voiceClone") {
      onOpenVoiceCloning();
      return;
    }

    if (sourceChoice === "file") {
      if (!selectedFile) {
        rejectSourceStep("Choose a file before opening the next stage.");
        return;
      }
      await (shouldImportFileAsBook(selectedFile, sourceType)
        ? onImportBookFiles([selectedFile], bookImportOptionsForTemplate(template))
        : onPrepareFile(selectedFile, markdownParseMode, "prepared"));
      onStageChange(stage);
      return;
    }

    if (sourceChoice === "url") {
      if (!sourceUrl.trim()) {
        rejectSourceStep("Paste a URL before opening the next stage.");
        return;
      }
      await onPrepareUrl(
        sourceUrl.trim(),
        markdownParseMode,
        shouldImportUrlAsBook(sourceUrl.trim(), sourceType) ? "book" : "prepared",
      );
      onStageChange(stage);
      return;
    }

    if (sourceChoice === "pastedText") {
      if (!draftText.trim()) {
        rejectSourceStep("Paste text before opening the next stage.");
        return;
      }
      onUseDraftText(draftText);
      onStageChange(stage);
      return;
    }

    await openExistingSourceDestination(stage);
  }

  function applyVoiceChoice() {
    if (voiceStrategy === "profile" && presetVoiceProfileId) {
      onVoiceProfileChange(presetVoiceProfileId);
      return;
    }
    if (voiceStrategy === "language") {
      const prefix = language.slice(0, 2).toLowerCase();
      const match = voiceProfiles.find((profile) =>
        profile.language.toLowerCase().startsWith(prefix),
      );
      if (match) {
        onVoiceProfileChange(match.id);
      }
    }
  }

  return (
    <Panel className="grid gap-4 p-4" variant="raised">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] vs-muted">
            Guided Intake
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--vs-text)]">
            Start with one source path
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 vs-muted">
            Choose the intent, source, template, voice, and destination. The studio keeps adapter
            choices underneath this flow.
          </p>
        </div>
        <StatusChip tone={isWorking ? "info" : "neutral"}>
          {isWorking
            ? "Preparing source"
            : `${sourceTypeLabel(sourceType)} · ${languageLabel(language)}`}
        </StatusChip>
      </div>

      <SegmentedControl
        ariaLabel="Intake wizard step"
        columns={5}
        options={INTAKE_STEPS.map((step) => ({
          label: step.label,
          testId: `intake-step-${step.id}`,
          value: step.id,
        }))}
        value={activeStep}
        onChange={(step) => {
          setActiveStep(step);
        }}
      />

      {activeStep === "intent" ? (
        <IntakeIntentStep
          intentId={intentId}
          template={template}
          templateId={templateId}
          onIntentChange={(nextIntent) => {
            applyTemplate(defaultTemplateForIntent(nextIntent));
          }}
          onTemplateChange={(id) => {
            applyTemplate(intakeTemplateById(id));
          }}
        />
      ) : null}

      {activeStep === "source" ? (
        <IntakeSourceStep
          draftText={draftText}
          existingSourceKey={existingSourceKey}
          existingSources={existingSources}
          isWorking={isWorking}
          markdownParseMode={markdownParseMode}
          selectedFile={selectedFile}
          sourceChoice={sourceChoice}
          sourceUrl={sourceUrl}
          onBrowse={() => {
            fileInputRef.current?.click();
          }}
          onDraftTextChange={setDraftText}
          onExistingSourceChange={setExistingSourceKey}
          onMarkdownParseModeChange={setMarkdownParseMode}
          onSourceChoiceChange={(choice) => {
            setHasUserChosenSourceChoice(true);
            setSourceChoice(choice);
          }}
          onSourceUrlChange={setSourceUrl}
        />
      ) : null}

      {activeStep === "metadata" ? (
        <IntakeMetadataStep
          detected={detected}
          effectiveTitle={effectiveTitle}
          language={language}
          sourceType={sourceType}
          title={metadataTitle}
          onLanguageChange={setLanguage}
          onSourceTypeChange={setSourceType}
          onTitleChange={setMetadataTitle}
        />
      ) : null}

      {activeStep === "voice" ? (
        <IntakeVoiceStep
          language={language}
          presetVoiceProfileId={presetVoiceProfileId}
          selectedVoiceProfileId={selectedVoiceProfileId}
          voiceProfileLabel={voiceProfileLabel}
          voiceProfiles={voiceProfiles}
          voiceStrategy={voiceStrategy}
          onPresetVoiceProfileChange={setPresetVoiceProfileId}
          onVoiceStrategyChange={setVoiceStrategy}
        />
      ) : null}

      {activeStep === "destination" ? (
        <IntakeDestinationStep
          currentBookScope={currentBookScope}
          bookScopeContent={bookScopeContent}
          detected={detected}
          effectiveTitle={effectiveTitle}
          existingSource={selectedExistingSource}
          intakeError={intakeError}
          isWorking={isWorking}
          policyProfile={template.speechPolicyProfile}
          scopeOptions={scopeOptions}
          selectedBookSource={scopeBookSource}
          selectedPreparedSource={selectedPreparedSource}
          sourceType={sourceType}
          voiceProfileLabel={voiceProfileLabel}
          onInspectBookSource={onInspectBookSource}
          onInspectPreparedSource={onInspectPreparedSource}
          onOpenBookCinema={onOpenBookCinema}
          onOpenPreparedSourceCinema={onOpenPreparedSourceCinema}
          onOpenReview={() => {
            void openDestination("review");
          }}
          onOpenPreview={() => {
            void openDestination("preview");
          }}
          onScopeChange={onScopeChange}
        />
      ) : null}

      {intakeError && activeStep !== "destination" ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {intakeError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 vs-border">
        <Button
          data-testid="intake-wizard-back"
          disabled={activeStep === "intent"}
          disabledReason={activeStep === "intent" ? "Already on the first intake step." : undefined}
          onClick={() => {
            setActiveStep(previousIntakeStep(activeStep));
          }}
          variant="secondary"
        >
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          {intentId === "voiceClone" ? (
            <Button
              data-testid="intake-wizard-open-voice-cloning"
              onClick={onOpenVoiceCloning}
              variant="soft"
            >
              Open Voice Cloning
            </Button>
          ) : null}
          <Button
            data-testid="intake-wizard-next"
            disabled={activeStep === "destination"}
            disabledReason={
              activeStep === "destination" ? "Choose Review or Preview from this step." : undefined
            }
            onClick={() => {
              setActiveStep(nextIntakeStep(activeStep));
            }}
            variant="primary"
          >
            Next
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        aria-hidden="true"
        accept={INTAKE_SOURCE_FILE_ACCEPT}
        className="sr-only"
        data-testid="intake-wizard-file-input"
        tabIndex={-1}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.item(0) ?? null;
          setSelectedFile(file);
          setLocalError(null);
          event.currentTarget.value = "";
        }}
      />
    </Panel>
  );
}

function IntakeIntentStep({
  intentId,
  template,
  templateId,
  onIntentChange,
  onTemplateChange,
}: Readonly<{
  intentId: IntakeIntentId;
  template: IntakeProjectTemplate;
  templateId: string;
  onIntentChange: (intent: IntakeIntentId) => void;
  onTemplateChange: (templateId: string) => void;
}>) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
      <div className="grid gap-2 sm:grid-cols-2">
        {INTAKE_INTENT_OPTIONS.map((option) => (
          <Button
            align="start"
            className="h-auto min-h-[5.75rem] flex-col gap-1 p-3"
            data-testid={`intake-intent-${option.id}`}
            key={option.id}
            onClick={() => {
              onIntentChange(option.id);
            }}
            selected={option.id === intentId}
            variant="mode"
          >
            <span className="text-sm">{option.label}</span>
            <span className="text-xs font-medium leading-5 vs-muted">{option.description}</span>
          </Button>
        ))}
      </div>
      <Panel className="grid gap-3 p-3" variant="surface">
        <label className="grid gap-1 text-xs font-semibold">
          <span className="vs-muted">Template defaults</span>
          <select
            className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
            data-testid="intake-template-select"
            onChange={(event) => {
              onTemplateChange(event.currentTarget.value);
            }}
            value={templateId}
          >
            {INTAKE_PROJECT_TEMPLATES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm leading-6 vs-muted">{template.description}</p>
        <dl className="grid gap-2 text-xs">
          <SummaryRow label="Policy" value={template.speechPolicyProfile} />
          <SummaryRow label="Source" value={sourceTypeLabel(template.sourceType)} />
          <SummaryRow label="Voice" value={template.voiceStrategy} />
        </dl>
      </Panel>
    </div>
  );
}

function IntakeSourceStep({
  draftText,
  existingSourceKey,
  existingSources,
  isWorking,
  markdownParseMode,
  selectedFile,
  sourceChoice,
  sourceUrl,
  onBrowse,
  onDraftTextChange,
  onExistingSourceChange,
  onMarkdownParseModeChange,
  onSourceChoiceChange,
  onSourceUrlChange,
}: Readonly<{
  draftText: string;
  existingSourceKey: string;
  existingSources: IntakeExistingSource[];
  isWorking: boolean;
  markdownParseMode: MarkdownParseMode;
  selectedFile: File | null;
  sourceChoice: IntakeSourceChoice;
  sourceUrl: string;
  onBrowse: () => void;
  onDraftTextChange: (text: string) => void;
  onExistingSourceChange: (key: string) => void;
  onMarkdownParseModeChange: (mode: MarkdownParseMode) => void;
  onSourceChoiceChange: (choice: IntakeSourceChoice) => void;
  onSourceUrlChange: (url: string) => void;
}>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 md:grid-cols-4">
        {INTAKE_SOURCE_CHOICE_OPTIONS.map((option) => (
          <Button
            align="start"
            className="h-auto min-h-[5.25rem] flex-col gap-1 p-3"
            data-testid={`intake-source-${option.id}`}
            key={option.id}
            onClick={() => {
              onSourceChoiceChange(option.id);
            }}
            selected={option.id === sourceChoice}
            variant="mode"
          >
            <span className="text-sm">{option.label}</span>
            <span className="text-xs font-medium leading-5 vs-muted">{option.description}</span>
          </Button>
        ))}
      </div>

      {sourceChoice === "file" ? (
        <Panel className="grid gap-3 p-3" variant="surface">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--vs-text)]">Source file</p>
              <p className="mt-1 truncate text-xs vs-muted" title={selectedFile?.name}>
                {selectedFile
                  ? `${selectedFile.name} · ${selectedFile.size.toLocaleString()} bytes`
                  : "PDF, EPUB, DOCX, Markdown, HTML, image, text, CSV, JSON, or logs"}
              </p>
            </div>
            <Button
              data-testid="intake-wizard-browse-file"
              disabled={isWorking}
              disabledReason={isWorking ? "Source preparation is already running." : undefined}
              onClick={onBrowse}
              variant="secondary"
            >
              Browse File
            </Button>
          </div>
          <MarkdownModeSelect mode={markdownParseMode} onChange={onMarkdownParseModeChange} />
        </Panel>
      ) : null}

      {sourceChoice === "url" ? (
        <Panel className="grid gap-3 p-3" variant="surface">
          <label className="grid gap-1 text-xs font-semibold">
            <span className="vs-muted">URL</span>
            <input
              className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
              data-testid="intake-wizard-url"
              onChange={(event) => {
                onSourceUrlChange(event.currentTarget.value);
              }}
              placeholder="https://example.com/article"
              type="url"
              value={sourceUrl}
            />
          </label>
          <MarkdownModeSelect mode={markdownParseMode} onChange={onMarkdownParseModeChange} />
        </Panel>
      ) : null}

      {sourceChoice === "pastedText" ? (
        <textarea
          aria-label="Pasted intake text"
          className={`${fieldControlClassName} min-h-[18rem] resize-y bg-[var(--vs-raised)] p-4 font-mono leading-6`}
          data-testid="intake-wizard-pasted-text"
          onChange={(event) => {
            onDraftTextChange(event.currentTarget.value);
          }}
          placeholder="Paste the text you want to listen to."
          spellCheck={false}
          value={draftText}
        />
      ) : null}

      {sourceChoice === "existing" ? (
        <Panel className="grid gap-3 p-3" variant="surface">
          <label className="grid gap-1 text-xs font-semibold">
            <span className="vs-muted">Existing source</span>
            <select
              aria-label="Existing source"
              className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
              data-testid="intake-wizard-existing-source"
              onChange={(event) => {
                onExistingSourceChange(event.currentTarget.value);
              }}
              value={existingSourceKey}
            >
              <option value="">Choose a project source</option>
              {existingSources.map((source) => (
                <option key={source.key} value={source.key}>
                  {source.label} · {source.detail}
                </option>
              ))}
            </select>
          </label>
          {existingSources.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-xs leading-5 vs-border vs-muted">
              Prepared files, URLs, books, and reusable sources will appear here after import.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}

function IntakeMetadataStep({
  detected,
  effectiveTitle,
  language,
  sourceType,
  title,
  onLanguageChange,
  onSourceTypeChange,
  onTitleChange,
}: Readonly<{
  detected: ReturnType<typeof detectIntakeSource>;
  effectiveTitle: string;
  language: string;
  sourceType: IntakeSourceType;
  title: string;
  onLanguageChange: (language: string) => void;
  onSourceTypeChange: (sourceType: IntakeSourceType) => void;
  onTitleChange: (title: string) => void;
}>) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
      <Panel className="grid gap-3 p-3" variant="surface">
        <label className="grid gap-1 text-xs font-semibold">
          <span className="vs-muted">Title</span>
          <input
            className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
            data-testid="intake-wizard-title"
            onChange={(event) => {
              onTitleChange(event.currentTarget.value);
            }}
            placeholder={detected.title}
            value={title}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold">
            <span className="vs-muted">Language</span>
            <select
              className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
              data-testid="intake-wizard-language"
              onChange={(event) => {
                onLanguageChange(event.currentTarget.value);
              }}
              value={language}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            <span className="vs-muted">Source type</span>
            <select
              className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
              data-testid="intake-wizard-source-type"
              onChange={(event) => {
                onSourceTypeChange(event.currentTarget.value as IntakeSourceType);
              }}
              value={sourceType}
            >
              {SOURCE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Panel>
      <Panel className="grid gap-2 p-3" variant="raised">
        <SummaryRow label="Detected title" value={effectiveTitle} />
        <SummaryRow label="Detected type" value={sourceTypeLabel(detected.sourceType)} />
        <SummaryRow label="Detected structure" value={detected.structureLabel} />
        <SummaryRow label="Confidence" value={detected.confidence} />
        <p className="rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-xs leading-5 vs-border vs-muted">
          {detected.reason}
        </p>
      </Panel>
    </div>
  );
}

function IntakeVoiceStep({
  language,
  presetVoiceProfileId,
  selectedVoiceProfileId,
  voiceProfileLabel,
  voiceProfiles,
  voiceStrategy,
  onPresetVoiceProfileChange,
  onVoiceStrategyChange,
}: Readonly<{
  language: string;
  presetVoiceProfileId: string;
  selectedVoiceProfileId: string;
  voiceProfileLabel: string;
  voiceProfiles: VoiceProfile[];
  voiceStrategy: VoiceStrategy;
  onPresetVoiceProfileChange: (profileId: string) => void;
  onVoiceStrategyChange: (strategy: VoiceStrategy) => void;
}>) {
  const languagePrefix = language.slice(0, 2).toLowerCase();
  const languageProfile = voiceProfiles.find((profile) =>
    profile.language.toLowerCase().startsWith(languagePrefix),
  );
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          align="start"
          className="h-auto min-h-[5rem] flex-col gap-1 p-3"
          data-testid="intake-voice-default"
          onClick={() => {
            onVoiceStrategyChange("default");
          }}
          selected={voiceStrategy === "default"}
          variant="mode"
        >
          <span>Default voice</span>
          <span className="text-xs font-medium leading-5 vs-muted">{voiceProfileLabel}</span>
        </Button>
        <Button
          align="start"
          className="h-auto min-h-[5rem] flex-col gap-1 p-3"
          data-testid="intake-voice-language"
          onClick={() => {
            onVoiceStrategyChange("language");
          }}
          selected={voiceStrategy === "language"}
          variant="mode"
        >
          <span>Language-specific voice</span>
          <span className="text-xs font-medium leading-5 vs-muted">
            {languageProfile?.name ?? `No ${languageLabel(language)} profile yet`}
          </span>
        </Button>
        <Button
          align="start"
          className="h-auto min-h-[5rem] flex-col gap-1 p-3"
          data-testid="intake-voice-profile"
          onClick={() => {
            onVoiceStrategyChange("profile");
          }}
          selected={voiceStrategy === "profile"}
          variant="mode"
        >
          <span>Profile preset</span>
          <span className="text-xs font-medium leading-5 vs-muted">
            {voiceProfiles.length.toLocaleString()} available
          </span>
        </Button>
      </div>
      {voiceStrategy === "profile" ? (
        <label className="grid gap-1 text-xs font-semibold">
          <span className="vs-muted">Voice profile</span>
          <select
            className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
            data-testid="intake-wizard-voice-profile"
            onChange={(event) => {
              onPresetVoiceProfileChange(event.currentTarget.value);
            }}
            value={presetVoiceProfileId || selectedVoiceProfileId}
          >
            {voiceProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} · {profile.language}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function IntakeDestinationStep({
  bookScopeContent,
  currentBookScope,
  detected,
  effectiveTitle,
  existingSource,
  intakeError,
  isWorking,
  policyProfile,
  scopeOptions,
  selectedBookSource,
  selectedPreparedSource,
  sourceType,
  voiceProfileLabel,
  onInspectBookSource,
  onInspectPreparedSource,
  onOpenBookCinema,
  onOpenPreparedSourceCinema,
  onOpenPreview,
  onOpenReview,
  onScopeChange,
}: Readonly<{
  bookScopeContent: BookSourceScopeContent | null;
  currentBookScope: BookScope | null;
  detected: ReturnType<typeof detectIntakeSource>;
  effectiveTitle: string;
  existingSource: IntakeExistingSource | undefined;
  intakeError: string | null;
  isWorking: boolean;
  policyProfile: string;
  scopeOptions: ReturnType<typeof bookScopeOptions>;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceType: IntakeSourceType;
  voiceProfileLabel: string;
  onInspectBookSource: (source: BookSource) => void;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onOpenBookCinema: (source?: BookSource, scope?: BookScope) => void;
  onOpenPreparedSourceCinema: (source: PreparedSource) => void;
  onOpenPreview: () => void;
  onOpenReview: () => void;
  onScopeChange: (scope: BookScope) => void;
}>) {
  const activeBook = activeDestinationBook(existingSource, selectedBookSource);
  const activePrepared = activeDestinationPrepared(existingSource, selectedPreparedSource);
  const structureLabel = destinationStructureLabel(
    bookScopeContent,
    activeBook,
    detected.structureLabel,
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
      <Panel className="grid gap-3 p-3" variant="surface">
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <SummaryRow label="Title" value={effectiveTitle} />
          <SummaryRow label="Type" value={sourceTypeLabel(sourceType)} />
          <SummaryRow label="Structure" value={structureLabel} />
          <SummaryRow label="Policy" value={policyProfile} />
          <SummaryRow label="Voice" value={voiceProfileLabel} />
        </dl>
        {currentBookScope && selectedBookSource ? (
          <label className="grid gap-1 text-xs font-semibold">
            <span className="vs-muted">Book scope</span>
            <select
              aria-label={`Book scope: ${bookScopeLabel(currentBookScope)}`}
              className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
              data-testid="intake-wizard-book-scope"
              onChange={(event) => {
                const nextScope = scopeOptions.find(
                  (option) => option.key === event.currentTarget.value,
                )?.scope;
                if (nextScope) {
                  onScopeChange(nextScope);
                }
              }}
              value={bookScopeKey(currentBookScope)}
            >
              {scopeOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {intakeError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {intakeError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="intake-wizard-open-review"
            disabled={isWorking}
            disabledReason={isWorking ? "Source preparation is already running." : undefined}
            onClick={onOpenReview}
            variant="primary"
          >
            Open Review
          </Button>
          <Button
            data-testid="intake-wizard-open-preview"
            disabled={isWorking}
            disabledReason={isWorking ? "Source preparation is already running." : undefined}
            onClick={onOpenPreview}
            variant="soft"
          >
            Open Preview
          </Button>
        </div>
      </Panel>
      <Panel className="grid gap-3 p-3" variant="raised">
        <h3 className="text-sm font-semibold text-[var(--vs-text)]">Active source</h3>
        {activeBook ? (
          <div className="grid gap-2">
            <SummaryRow label="Book" value={bookSourceName(activeBook)} />
            <SummaryRow
              label="Structure"
              value={`${activeBook.chapterCount.toLocaleString()} chapters · ${activeBook.wordCount.toLocaleString()} words`}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="intake-wizard-open-book-cinema"
                onClick={() => {
                  onOpenBookCinema(
                    activeBook,
                    currentBookScope ?? resolveDefaultBookScope(activeBook),
                  );
                }}
                size="sm"
                variant="secondary"
              >
                Open Book Cinema
              </Button>
              <Button
                data-testid="intake-wizard-inspect-book"
                onClick={() => {
                  onInspectBookSource(activeBook);
                }}
                size="sm"
                variant="ghost"
              >
                Content Structure
              </Button>
            </div>
          </div>
        ) : null}
        {activePrepared ? (
          <div className="grid gap-2">
            <SummaryRow label="Source" value={activePrepared.title ?? activePrepared.sourceName} />
            <SummaryRow
              label="Structure"
              value={`${activePrepared.blockCount.toLocaleString()} blocks · ${activePrepared.wordCount.toLocaleString()} words`}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="intake-wizard-open-prepared-cinema"
                onClick={() => {
                  onOpenPreparedSourceCinema(activePrepared);
                }}
                size="sm"
                variant="secondary"
              >
                {activePrepared.kind === "url" ? "Open Website Cinema" : "Open Document Cinema"}
              </Button>
              <Button
                data-testid="intake-wizard-inspect-prepared"
                onClick={() => {
                  onInspectPreparedSource(activePrepared);
                }}
                size="sm"
                variant="ghost"
              >
                Content Structure
              </Button>
            </div>
          </div>
        ) : null}
        {!activeBook && !activePrepared ? (
          <p className="rounded-md border border-dashed p-3 text-xs leading-5 vs-border vs-muted">
            Source metadata will appear here after import or when you choose an existing source.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function MarkdownModeSelect({
  mode,
  onChange,
}: Readonly<{ mode: MarkdownParseMode; onChange: (mode: MarkdownParseMode) => void }>) {
  return (
    <label className="grid gap-1 text-xs font-semibold sm:max-w-xs">
      <span className="vs-muted">Markdown parsing</span>
      <select
        className={`${fieldControlClassName} bg-[var(--vs-raised)]`}
        data-testid="intake-wizard-markdown-mode"
        onChange={(event) => {
          onChange(event.currentTarget.value as MarkdownParseMode);
        }}
        value={mode}
      >
        {MARKDOWN_PARSE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <dt className="vs-muted text-[0.68rem] font-semibold uppercase tracking-[0.14em]">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function shouldImportFileAsBook(file: File, sourceType: IntakeSourceType): boolean {
  return sourceType === "book" || isBookAdapterExtension(extensionForName(file.name));
}

function shouldImportUrlAsBook(url: string, sourceType: IntakeSourceType): boolean {
  return sourceType === "book" || isBookAdapterExtension(extensionForName(url));
}

function isBookAdapterExtension(extension: string): boolean {
  return [
    "pdf",
    "epub",
    "docx",
    "html",
    "htm",
    "zip",
    "png",
    "jpg",
    "jpeg",
    "tif",
    "tiff",
    "bmp",
    "webp",
  ].includes(extension);
}

function bookImportOptionsForTemplate(template: IntakeProjectTemplate): BookSourceImportOptions {
  if (template.id === "technical-book") {
    return { importProfile: "scholarly", pdfTableMode: "structured" };
  }
  return {};
}
