import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button, Panel, SegmentedControl, StatusChip, fieldControlClassName } from "../../design";
import { Drawer } from "../../design/components/Drawer";
import type {
  BookSource,
  BookSourceImportOptions,
  BookSourceScopeContent,
  BookScope,
  MarkdownParseMode,
  PreparedSource,
  SourceReadinessConfirmationRequest,
  VoiceProfile,
} from "../../types";
import {
  bookScopeKey,
  bookScopeLabel,
  bookScopeOptions,
  bookSourceName,
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
  languageLabel,
  sourceTypeLabel,
  type IntakeIntentId,
  type IntakePreparationTarget,
  type IntakeSourceChoice,
  type IntakeSourceMode,
  type IntakeSourceType,
} from "./sourceTypeModel";
import {
  bookSourceLifecycleEnvelope,
  preparedSourceLifecycleEnvelope,
  sourceSelectorOption,
} from "../source-lifecycle/sourceSelectors";
import { PRIVACY_NOTICES, sourcePrepFailureNotice, urlIntakeNotice } from "../privacy";
import type { PrivacyNotice } from "../privacy";
import {
  activeDestinationBook,
  activeDestinationPrepared,
  bookImportOptionsForTemplate,
  bookScopeForWizard,
  destinationStructureLabel,
  existingSourceTypeForDetection,
  initialExistingSourceKey,
  initialIntentForSelection,
  intentForHydratedSource,
  initialSourceChoiceForSelection,
  type IntakeExistingSource,
  selectedSourceKeyForMode,
} from "./intakeWizardHelpers";
import {
  buildIntakeSourceCandidate,
  resolveDetectedIntakeDefaults,
  resolveIntakeReadiness,
  shouldRouteFileAsBook,
  shouldRouteUrlAsBook,
  type IntakeReadinessState,
  type IntakeSourceCandidate,
} from "./intakeWizardModel";

export type IntakeDestinationStage = "review" | "preview";
type IntakeBookImportResult = BookSource | undefined;
type IntakePreparationResult = BookSource | PreparedSource | undefined;
type IntakeDraftPreparationResult = PreparedSource | undefined;

export interface IntakeWizardProps {
  bookSourceError: string | null;
  bookSources: BookSource[];
  bookScopeContent: BookSourceScopeContent | null;
  isImportingBookSource: boolean;
  isPreparingSource: boolean;
  initialAdvancedOpen?: boolean;
  initialSourceChoice?: IntakeSourceChoice;
  initialSourceUrl?: string;
  initialStep?: IntakeStepId;
  preparedSources: PreparedSource[];
  providerBackedGenerationBoundary?: boolean;
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  selectedVoiceProfileId: string;
  sourceMode: IntakeSourceMode;
  sourcePrepError: string | null;
  text: string;
  voiceProfileLabel: string;
  voiceProfiles: VoiceProfile[];
  onImportBookFiles: (
    files: File[],
    options?: BookSourceImportOptions,
  ) => Promise<IntakeBookImportResult>;
  onInspectBookSource: (source: BookSource) => void;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onOpenBookCinema: (source?: BookSource, scope?: BookScope) => void;
  onOpenPreparedSourceCinema: (source: PreparedSource) => void;
  onOpenVoiceCloning: () => void;
  onConfirmBookSourceReadiness: (
    source: BookSource,
    request: SourceReadinessConfirmationRequest,
  ) => Promise<BookSource>;
  onConfirmPreparedSourceReadiness: (
    source: PreparedSource,
    request: SourceReadinessConfirmationRequest,
  ) => Promise<PreparedSource>;
  onPrepareFile: (
    file: File,
    markdownParseMode: MarkdownParseMode,
    preparationTarget?: IntakePreparationTarget,
  ) => Promise<IntakePreparationResult>;
  onPrepareDraftText: (
    text: string,
    markdownParseMode: MarkdownParseMode,
  ) => Promise<IntakeDraftPreparationResult>;
  onPrepareUrl: (
    url: string,
    markdownParseMode: MarkdownParseMode,
    preparationTarget?: IntakePreparationTarget,
  ) => Promise<IntakePreparationResult>;
  onScopeChange: (scope: BookScope) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onStageChange: (stage: IntakeDestinationStage) => void;
  onUseBookSource: (source: BookSource, scope: BookScope) => void;
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

type ExistingSourcesForIntakeInput = Readonly<{
  bookSources: readonly BookSource[];
  preparedSources: readonly PreparedSource[];
  selectedBookScope: BookScope | null;
  selectedBookSourceId: string | undefined;
  selectedPreparedSourceId: string | undefined;
}>;

type PreparedIntakeSource =
  | { source: BookSource; type: "book" }
  | { source: PreparedSource; type: "prepared" };

function existingSourcesForIntake({
  bookSources,
  preparedSources,
  selectedBookScope,
  selectedBookSourceId,
  selectedPreparedSourceId,
}: ExistingSourcesForIntakeInput): IntakeExistingSource[] {
  return [
    ...bookSources.map((source) => {
      const envelope = bookSourceLifecycleEnvelope(source, {
        isActive: source.id === selectedBookSourceId,
        lastOpenedSurface: "Intake",
        selectedScope: source.id === selectedBookSourceId ? selectedBookScope : null,
      });
      const option = sourceSelectorOption(envelope, "book");
      return {
        detail: option.detail,
        envelope,
        key: option.value,
        label: option.label,
        optionLabel: option.optionLabel,
        source,
        type: "book" as const,
      };
    }),
    ...preparedSources.map((source) => {
      const envelope = preparedSourceLifecycleEnvelope(source, {
        isActive: source.id === selectedPreparedSourceId,
        lastOpenedSurface: "Intake",
      });
      const option = sourceSelectorOption(envelope, "prepared");
      return {
        detail: option.detail,
        envelope,
        key: option.value,
        label: option.label,
        optionLabel: option.optionLabel,
        source,
        type: "prepared" as const,
      };
    }),
  ];
}

export function IntakeWizard({
  bookSourceError,
  bookSources,
  bookScopeContent,
  isImportingBookSource,
  isPreparingSource,
  initialAdvancedOpen = false,
  initialSourceChoice,
  initialSourceUrl = "",
  initialStep = "intent",
  preparedSources,
  providerBackedGenerationBoundary = false,
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
  onConfirmBookSourceReadiness,
  onConfirmPreparedSourceReadiness,
  onPrepareDraftText,
  onPrepareFile,
  onPrepareUrl,
  onScopeChange,
  onSpeechPolicyProfileChange,
  onStageChange,
  onUseBookSource,
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
  const [activeStep, setActiveStep] = useState<IntakeStepId>(initialStep);
  const [intentId, setIntentId] = useState<IntakeIntentId>(initialIntent);
  const [sourceChoice, setSourceChoice] = useState<IntakeSourceChoice>(
    initialSourceChoice ??
      initialSourceChoiceForSelection(sourceMode, selectedBookSource, selectedPreparedSource, text),
  );
  const [templateId, setTemplateId] = useState(initialTemplate.id);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [draftText, setDraftText] = useState(text);
  const [metadataTitle, setMetadataTitle] = useState("");
  const [language, setLanguage] = useState(initialTemplate.language);
  const [sourceType, setSourceType] = useState<IntakeSourceType>(initialTemplate.sourceType);
  const [markdownParseMode, setMarkdownParseMode] = useState<MarkdownParseMode>("strict");
  const [voiceStrategy, setVoiceStrategy] = useState<VoiceStrategy>(initialTemplate.voiceStrategy);
  const [presetVoiceProfileId, setPresetVoiceProfileId] = useState(selectedVoiceProfileId);
  const [hasUserEditedLanguage, setHasUserEditedLanguage] = useState(false);
  const [hasUserEditedSourceType, setHasUserEditedSourceType] = useState(false);
  const [existingSourceKey, setExistingSourceKey] = useState(() =>
    initialExistingSourceKey(sourceMode, selectedBookSource, selectedPreparedSource),
  );
  const [hasUserChosenSourceChoice, setHasUserChosenSourceChoice] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(initialAdvancedOpen);
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
    () =>
      existingSourcesForIntake({
        bookSources,
        preparedSources,
        selectedBookScope,
        selectedBookSourceId: selectedBookSource?.id,
        selectedPreparedSourceId: selectedPreparedSource?.id,
      }),
    [
      bookSources,
      preparedSources,
      selectedBookScope,
      selectedBookSource?.id,
      selectedPreparedSource?.id,
    ],
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
  const selectedExistingSourceForReadiness = selectedExistingSource
    ? {
        detail: selectedExistingSource.detail,
        disabledReason: selectedExistingSource.envelope.disabledReason,
        key: selectedExistingSource.key,
        label: selectedExistingSource.label,
        type: selectedExistingSource.type,
      }
    : undefined;
  const candidate = buildIntakeSourceCandidate({
    detected,
    draftText,
    existingSourceKey,
    selectedExistingSource: selectedExistingSourceForReadiness,
    selectedFile,
    sourceChoice,
    sourceType,
    sourceTypeWasEdited: hasUserEditedSourceType,
    sourceUrl,
  });
  const readiness = resolveIntakeReadiness({
    backendError: intakeError,
    candidate,
    draftText,
    intentId,
    isWorking,
    selectedExistingSource: selectedExistingSourceForReadiness,
    selectedFile,
    sourceUrl,
  });
  const canJumpBeyondSource = candidate.hasSourceInput;

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
      setHasUserEditedLanguage(false);
      setHasUserEditedSourceType(false);
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

  useEffect(() => {
    const defaults = resolveDetectedIntakeDefaults({
      currentLanguage: language,
      currentSourceType: sourceType,
      detectedLanguage: detected.language,
      detectedSourceType: detected.sourceType,
      languageWasEdited: hasUserEditedLanguage,
      sourceTypeWasEdited: hasUserEditedSourceType,
    });
    if (language !== defaults.language) {
      setLanguage(defaults.language);
    }
    if (sourceType !== defaults.sourceType) {
      setSourceType(defaults.sourceType);
    }
  }, [
    detected.language,
    detected.sourceType,
    hasUserEditedLanguage,
    hasUserEditedSourceType,
    language,
    sourceType,
  ]);

  function applyTemplate(nextTemplate: IntakeProjectTemplate) {
    setTemplateId(nextTemplate.id);
    setIntentId(nextTemplate.intentId);
    setSourceChoice(nextTemplate.sourceChoice);
    setHasUserChosenSourceChoice(true);
    setLanguage(nextTemplate.language);
    setSourceType(nextTemplate.sourceType);
    setHasUserEditedLanguage(false);
    setHasUserEditedSourceType(false);
    setVoiceStrategy(nextTemplate.voiceStrategy);
    onSpeechPolicyProfileChange(nextTemplate.speechPolicyProfile);
  }

  function rejectSourceStep(message: string) {
    setLocalError(message);
    setActiveStep("source");
  }

  function selectedPreparedIntakeSource(): PreparedIntakeSource | null {
    if (selectedExistingSource) {
      return selectedExistingSource.type === "book"
        ? { source: selectedExistingSource.source, type: "book" }
        : { source: selectedExistingSource.source, type: "prepared" };
    }
    if (selectedBookSource) {
      return { source: selectedBookSource, type: "book" };
    }
    if (selectedPreparedSource) {
      return { source: selectedPreparedSource, type: "prepared" };
    }
    return null;
  }

  async function prepareSelectedSource(): Promise<PreparedIntakeSource | null> {
    switch (sourceChoice) {
      case "existing": {
        const selected = selectedPreparedIntakeSource();
        if (!selected) {
          rejectSourceStep("Choose an existing source before continuing.");
        }
        return selected;
      }
      case "file": {
        return prepareSelectedFile();
      }
      case "url": {
        return prepareSelectedUrl();
      }
      case "pastedText": {
        return preparePastedText();
      }
    }
  }

  async function prepareSelectedFile(): Promise<PreparedIntakeSource | null> {
    if (!selectedFile) {
      rejectSourceStep("Choose a file before continuing.");
      return null;
    }
    const prepared = await (shouldRouteFileAsBook(selectedFile, sourceType, hasUserEditedSourceType)
      ? onImportBookFiles([selectedFile], bookImportOptionsForTemplate(template))
      : onPrepareFile(selectedFile, markdownParseMode, "prepared"));
    return normalizePreparedIntakeSource(prepared) ?? selectedPreparedIntakeSource();
  }

  async function prepareSelectedUrl(): Promise<PreparedIntakeSource | null> {
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) {
      rejectSourceStep("Paste a URL before continuing.");
      return null;
    }
    const prepared = await onPrepareUrl(
      trimmedUrl,
      markdownParseMode,
      shouldRouteUrlAsBook(trimmedUrl, sourceType, hasUserEditedSourceType) ? "book" : "prepared",
    );
    return normalizePreparedIntakeSource(prepared) ?? selectedPreparedIntakeSource();
  }

  async function preparePastedText(): Promise<PreparedIntakeSource | null> {
    if (!draftText.trim()) {
      rejectSourceStep("Paste text before continuing.");
      return null;
    }
    const prepared = await onPrepareDraftText(draftText, markdownParseMode);
    return normalizePreparedIntakeSource(prepared) ?? selectedPreparedIntakeSource();
  }

  async function confirmPreparedSourceForReview(
    prepared: PreparedIntakeSource,
  ): Promise<PreparedIntakeSource | null> {
    const request = sourceReadinessConfirmationRequest({
      currentBookScope,
      detected,
      effectiveTitle,
      language,
      policyProfile: template.speechPolicyProfile,
      prepared,
      selectedVoiceProfileId,
      sourceType,
    });
    if (prepared.type === "book") {
      const confirmed = await onConfirmBookSourceReadiness(prepared.source, request);
      return confirmed.sourceReadiness?.state === "ready"
        ? { source: confirmed, type: "book" }
        : null;
    }
    const confirmed = await onConfirmPreparedSourceReadiness(prepared.source, request);
    return confirmed.sourceReadiness?.state === "ready"
      ? { source: confirmed, type: "prepared" }
      : null;
  }

  async function openDestination(stage: IntakeDestinationStage) {
    if (readiness.status !== "ready") {
      setActiveStep(readiness.recoveryStep);
      return;
    }
    setLocalError(null);
    applyIntakeVoiceChoice({
      language,
      presetVoiceProfileId,
      voiceProfiles,
      voiceStrategy,
      onVoiceProfileChange,
    });
    onSpeechPolicyProfileChange(template.speechPolicyProfile);

    if (intentId === "voiceClone") {
      onOpenVoiceCloning();
      return;
    }

    const prepared = await prepareSelectedSource();
    if (!prepared) {
      return;
    }
    const confirmed = await confirmPreparedSourceForReview(prepared);
    if (!confirmed) {
      setLocalError("Confirm source readiness before opening Review.");
      setActiveStep("metadata");
      return;
    }
    if (confirmed.type === "book") {
      onUseBookSource(
        confirmed.source,
        currentBookScope ?? resolveDefaultBookScope(confirmed.source),
      );
    } else {
      await onUsePreparedSource(confirmed.source);
    }
    onStageChange(stage);
  }

  async function advanceWizard() {
    if (activeStep === "destination") {
      return;
    }
    if (
      readiness.status !== "ready" &&
      (readiness.recoveryStep === activeStep || activeStep === "source")
    ) {
      setActiveStep(readiness.recoveryStep);
      return;
    }
    if (activeStep === "source") {
      const prepared = await prepareSelectedSource();
      if (!prepared) {
        return;
      }
    }
    setLocalError(null);
    setActiveStep(nextIntakeStep(activeStep));
  }

  const stepContentById: Record<IntakeStepId, ReactNode> = {
    destination: (
      <IntakeDestinationStep
        candidate={candidate}
        currentBookScope={currentBookScope}
        bookScopeContent={bookScopeContent}
        detected={detected}
        effectiveTitle={effectiveTitle}
        existingSource={selectedExistingSource}
        intakeError={intakeError}
        isWorking={isWorking}
        policyProfile={template.speechPolicyProfile}
        providerBackedGenerationBoundary={providerBackedGenerationBoundary}
        readiness={readiness}
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
        onRecover={(step) => {
          setActiveStep(step);
        }}
        onScopeChange={onScopeChange}
      />
    ),
    intent: (
      <IntakeIntentStep
        intentId={intentId}
        template={template}
        onIntentChange={(nextIntent) => {
          applyTemplate(defaultTemplateForIntent(nextIntent));
        }}
      />
    ),
    metadata: (
      <IntakeMetadataStep
        candidate={candidate}
        detected={detected}
        effectiveTitle={effectiveTitle}
        language={language}
        sourceType={sourceType}
        title={metadataTitle}
        onLanguageChange={(value) => {
          setLanguage(value);
          setHasUserEditedLanguage(true);
          setLocalError(null);
        }}
        onSourceTypeChange={(value) => {
          setSourceType(value);
          setHasUserEditedSourceType(true);
          setLocalError(null);
        }}
        onTitleChange={setMetadataTitle}
      />
    ),
    source: (
      <IntakeSourceStep
        candidate={candidate}
        draftText={draftText}
        existingSourceKey={existingSourceKey}
        existingSources={existingSources}
        isWorking={isWorking}
        readiness={readiness}
        selectedFile={selectedFile}
        sourceChoice={sourceChoice}
        sourceUrl={sourceUrl}
        onAdvancedOpen={() => {
          setIsAdvancedOpen(true);
        }}
        onBrowse={() => {
          fileInputRef.current?.click();
        }}
        onDraftTextChange={(value) => {
          setDraftText(value);
          setLocalError(null);
          setHasUserEditedLanguage(false);
          setHasUserEditedSourceType(false);
        }}
        onExistingSourceChange={(key) => {
          setExistingSourceKey(key);
          setLocalError(null);
          setHasUserEditedLanguage(false);
          setHasUserEditedSourceType(false);
        }}
        onSourceChoiceChange={(choice) => {
          setHasUserChosenSourceChoice(true);
          setSourceChoice(choice);
          setLocalError(null);
          setHasUserEditedLanguage(false);
          setHasUserEditedSourceType(false);
        }}
        onSourceUrlChange={(value) => {
          setSourceUrl(value);
          setLocalError(null);
          setHasUserEditedLanguage(false);
          setHasUserEditedSourceType(false);
        }}
      />
    ),
    voice: (
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
    ),
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={readiness.tone}>
            {readiness.status === "ready" ? "Ready" : readiness.title}
          </StatusChip>
          <StatusChip tone="neutral">
            {sourceTypeLabel(sourceType)} · {languageLabel(language)}
          </StatusChip>
          <Button
            data-testid="intake-advanced-open"
            onClick={() => {
              setIsAdvancedOpen(true);
            }}
            size="sm"
            variant="ghost"
          >
            Advanced import
          </Button>
        </div>
      </div>

      <SegmentedControl
        ariaLabel="Intake wizard step"
        columns={5}
        options={INTAKE_STEPS.map((step) => ({
          disabled: !canJumpBeyondSource && step.id !== "intent" && step.id !== "source",
          disabledReason: "Choose a source before jumping ahead.",
          label: step.label,
          testId: `intake-step-${step.id}`,
          value: step.id,
        }))}
        value={activeStep}
        onChange={(step) => {
          setActiveStep(step);
        }}
      />

      {stepContentById[activeStep]}

      {readiness.status !== "ready" && activeStep !== "destination" && activeStep !== "source" ? (
        <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-xs text-[var(--vs-status-warning)]">
          {readiness.detail}
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
              void advanceWizard();
            }}
            variant="primary"
          >
            Next
          </Button>
        </div>
      </div>

      {isAdvancedOpen ? (
        <AdvancedImportDrawer
          candidate={candidate}
          detected={detected}
          intakeError={intakeError}
          markdownParseMode={markdownParseMode}
          policyProfile={template.speechPolicyProfile}
          providerBackedGenerationBoundary={providerBackedGenerationBoundary}
          sourceChoice={sourceChoice}
          sourceUrl={sourceUrl}
          template={template}
          templateId={templateId}
          onClose={() => {
            setIsAdvancedOpen(false);
          }}
          onMarkdownParseModeChange={setMarkdownParseMode}
          onTemplateChange={(id) => {
            applyTemplate(intakeTemplateById(id));
          }}
        />
      ) : null}

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
          if (file) {
            setHasUserChosenSourceChoice(true);
            setSourceChoice("file");
            setHasUserEditedLanguage(false);
            setHasUserEditedSourceType(false);
          }
          event.currentTarget.value = "";
        }}
      />
    </Panel>
  );
}

function applyIntakeVoiceChoice({
  language,
  presetVoiceProfileId,
  voiceProfiles,
  voiceStrategy,
  onVoiceProfileChange,
}: Readonly<{
  language: string;
  presetVoiceProfileId: string;
  voiceProfiles: VoiceProfile[];
  voiceStrategy: VoiceStrategy;
  onVoiceProfileChange: (profileId: string) => void;
}>) {
  if (voiceStrategy === "profile" && presetVoiceProfileId) {
    onVoiceProfileChange(presetVoiceProfileId);
    return;
  }
  if (voiceStrategy !== "language") {
    return;
  }
  const prefix = language.slice(0, 2).toLowerCase();
  const match = voiceProfiles.find((profile) => profile.language.toLowerCase().startsWith(prefix));
  if (match) {
    onVoiceProfileChange(match.id);
  }
}

function normalizePreparedIntakeSource(
  value: BookSource | PreparedSource | undefined,
): PreparedIntakeSource | null {
  if (!value) {
    return null;
  }
  return "sourceFile" in value
    ? { source: value, type: "book" }
    : { source: value, type: "prepared" };
}

function sourceReadinessConfirmationRequest({
  currentBookScope,
  detected,
  effectiveTitle,
  language,
  policyProfile,
  prepared,
  selectedVoiceProfileId,
  sourceType,
}: Readonly<{
  currentBookScope: BookScope | null;
  detected: ReturnType<typeof detectIntakeSource>;
  effectiveTitle: string;
  language: string;
  policyProfile: string;
  prepared: PreparedIntakeSource;
  selectedVoiceProfileId: string;
  sourceType: IntakeSourceType;
}>): SourceReadinessConfirmationRequest {
  return {
    language,
    scope:
      prepared.type === "book"
        ? (currentBookScope ?? resolveDefaultBookScope(prepared.source))
        : undefined,
    sourceType,
    speechPolicyProfile: policyProfile,
    structureLabel: detected.structureLabel,
    title: effectiveTitle,
    voiceProfileId: selectedVoiceProfileId,
  };
}

function IntakeIntentStep({
  intentId,
  template,
  onIntentChange,
}: Readonly<{
  intentId: IntakeIntentId;
  template: IntakeProjectTemplate;
  onIntentChange: (intent: IntakeIntentId) => void;
}>) {
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {INTAKE_INTENT_OPTIONS.map((option) => (
          <Button
            align="start"
            className="h-auto min-h-[4.75rem] flex-col gap-1 p-3"
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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--vs-text)]">Default path</h3>
          <StatusChip tone="neutral">{template.label}</StatusChip>
        </div>
        <p className="text-sm leading-6 vs-muted">{template.description}</p>
        <dl className="grid gap-2 text-xs">
          <SummaryRow label="Policy" value={template.speechPolicyProfile} />
          <SummaryRow label="Source" value={sourceTypeLabel(template.sourceType)} />
          <SummaryRow label="Voice default" value={template.voiceStrategy} />
        </dl>
        <p className="rounded-md border border-dashed p-3 text-xs leading-5 vs-border vs-muted">
          Template and import adapter details are available in Advanced import.
        </p>
      </Panel>
    </div>
  );
}

function IntakeSourceStep({
  candidate,
  draftText,
  existingSourceKey,
  existingSources,
  isWorking,
  readiness,
  selectedFile,
  sourceChoice,
  sourceUrl,
  onAdvancedOpen,
  onBrowse,
  onDraftTextChange,
  onExistingSourceChange,
  onSourceChoiceChange,
  onSourceUrlChange,
}: Readonly<{
  candidate: IntakeSourceCandidate;
  draftText: string;
  existingSourceKey: string;
  existingSources: IntakeExistingSource[];
  isWorking: boolean;
  readiness: IntakeReadinessState;
  selectedFile: File | null;
  sourceChoice: IntakeSourceChoice;
  sourceUrl: string;
  onAdvancedOpen: () => void;
  onBrowse: () => void;
  onDraftTextChange: (text: string) => void;
  onExistingSourceChange: (key: string) => void;
  onSourceChoiceChange: (choice: IntakeSourceChoice) => void;
  onSourceUrlChange: (url: string) => void;
}>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-[var(--vs-text)]">Where is the source?</p>
        <SegmentedControl
          ariaLabel="Intake source path"
          columns={4}
          options={INTAKE_SOURCE_CHOICE_OPTIONS.map((option) => ({
            label: option.label,
            testId: `intake-source-${option.id}`,
            value: option.id,
          }))}
          value={sourceChoice}
          onChange={onSourceChoiceChange}
        />
      </div>

      <Panel className="grid gap-4 p-4" variant="surface">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--vs-text)]">{candidate.sourceLabel}</h3>
            <p className="mt-1 truncate text-xs vs-muted" title={candidate.inputSummary}>
              {candidate.inputSummary}
            </p>
          </div>
          <StatusChip tone={readiness.tone}>
            {readiness.status === "ready" ? "Source selected" : readiness.title}
          </StatusChip>
        </div>

        <IntakeSourceInput
          candidate={candidate}
          draftText={draftText}
          existingSourceKey={existingSourceKey}
          existingSources={existingSources}
          isWorking={isWorking}
          selectedFile={selectedFile}
          sourceChoice={sourceChoice}
          sourceUrl={sourceUrl}
          onBrowse={onBrowse}
          onDraftTextChange={onDraftTextChange}
          onExistingSourceChange={onExistingSourceChange}
          onSourceUrlChange={onSourceUrlChange}
        />

        <SourceReadinessNotice readiness={readiness} />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 vs-border">
          <p className="text-xs leading-5 vs-muted">{candidate.adapterRouteLabel}</p>
          <Button data-testid="intake-source-advanced" onClick={onAdvancedOpen} variant="ghost">
            Advanced import
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function IntakeSourceInput({
  candidate,
  draftText,
  existingSourceKey,
  existingSources,
  isWorking,
  selectedFile,
  sourceChoice,
  sourceUrl,
  onBrowse,
  onDraftTextChange,
  onExistingSourceChange,
  onSourceUrlChange,
}: Readonly<{
  candidate: IntakeSourceCandidate;
  draftText: string;
  existingSourceKey: string;
  existingSources: IntakeExistingSource[];
  isWorking: boolean;
  selectedFile: File | null;
  sourceChoice: IntakeSourceChoice;
  sourceUrl: string;
  onBrowse: () => void;
  onDraftTextChange: (text: string) => void;
  onExistingSourceChange: (key: string) => void;
  onSourceUrlChange: (url: string) => void;
}>) {
  switch (sourceChoice) {
    case "url": {
      return (
        <UrlSourceInput
          candidate={candidate}
          sourceUrl={sourceUrl}
          onSourceUrlChange={onSourceUrlChange}
        />
      );
    }
    case "pastedText": {
      return <PastedTextSourceInput draftText={draftText} onDraftTextChange={onDraftTextChange} />;
    }
    case "existing": {
      return (
        <ExistingSourceInput
          existingSourceKey={existingSourceKey}
          existingSources={existingSources}
          onExistingSourceChange={onExistingSourceChange}
        />
      );
    }
    default: {
      return (
        <FileSourceInput isWorking={isWorking} selectedFile={selectedFile} onBrowse={onBrowse} />
      );
    }
  }
}

function FileSourceInput({
  isWorking,
  selectedFile,
  onBrowse,
}: Readonly<{ isWorking: boolean; selectedFile: File | null; onBrowse: () => void }>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4 vs-border">
      <p className="min-w-0 text-sm leading-6 vs-muted">
        {selectedFile
          ? "This file is ready for metadata confirmation."
          : "Choose one local file to import or prepare."}
      </p>
      <Button
        data-testid="intake-wizard-browse-file"
        disabled={isWorking}
        disabledReason={isWorking ? "Source preparation is already running." : undefined}
        onClick={onBrowse}
        variant="secondary"
      >
        {selectedFile ? "Change File" : "Browse File"}
      </Button>
    </div>
  );
}

function UrlSourceInput({
  candidate,
  sourceUrl,
  onSourceUrlChange,
}: Readonly<{
  candidate: IntakeSourceCandidate;
  sourceUrl: string;
  onSourceUrlChange: (url: string) => void;
}>) {
  return (
    <label className="grid gap-2 text-xs font-semibold">
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
      {candidate.urlSafety && !candidate.urlSafety.allowedByDefault ? (
        <span className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-xs font-medium text-[var(--vs-status-warning)]">
          {candidate.urlSafety.detail}
        </span>
      ) : null}
    </label>
  );
}

function PastedTextSourceInput({
  draftText,
  onDraftTextChange,
}: Readonly<{ draftText: string; onDraftTextChange: (text: string) => void }>) {
  return (
    <textarea
      aria-label="Pasted intake text"
      className={`${fieldControlClassName} min-h-[16rem] resize-y bg-[var(--vs-raised)] p-4 font-mono leading-6`}
      data-testid="intake-wizard-pasted-text"
      onChange={(event) => {
        onDraftTextChange(event.currentTarget.value);
      }}
      placeholder="Paste the text you want to listen to."
      spellCheck={false}
      value={draftText}
    />
  );
}

function ExistingSourceInput({
  existingSourceKey,
  existingSources,
  onExistingSourceChange,
}: Readonly<{
  existingSourceKey: string;
  existingSources: IntakeExistingSource[];
  onExistingSourceChange: (key: string) => void;
}>) {
  return (
    <div className="grid gap-3">
      {existingSources.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {existingSources.map((source) => (
            <Button
              align="start"
              className="h-auto min-h-[4.5rem] flex-col gap-1 p-3"
              data-testid={`intake-existing-source-${source.key}`}
              key={source.key}
              onClick={() => {
                onExistingSourceChange(source.key);
              }}
              selected={existingSourceKey === source.key}
              variant="mode"
            >
              <span className="text-sm">{source.label}</span>
              <span className="text-xs font-medium leading-5 vs-muted">{source.detail}</span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-xs leading-5 vs-border vs-muted">
          Prepared files, URLs, books, and reusable sources will appear here after import.
        </p>
      )}
      <label className="grid gap-1 text-xs font-semibold sm:max-w-md">
        <span className="vs-muted">Existing source list</span>
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
              {source.optionLabel}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SourceReadinessNotice({ readiness }: Readonly<{ readiness: IntakeReadinessState }>) {
  if (readiness.status === "ready" || readiness.recoveryStep !== "source") {
    return null;
  }
  return (
    <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--vs-status-warning)]">
      {readiness.detail}
    </p>
  );
}

function PrivacyNoticeCallout({ notice }: Readonly<{ notice: PrivacyNotice }>) {
  return (
    <div
      className="grid gap-2 rounded-md border p-3 text-xs leading-5 vs-border vs-surface"
      data-privacy-notice={notice.id}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{notice.title}</p>
        <StatusChip tone={notice.tone}>{notice.tone === "success" ? "Local" : "Review"}</StatusChip>
      </div>
      <p className="vs-muted">{notice.message}</p>
    </div>
  );
}

function IntakeMetadataStep({
  candidate,
  detected,
  effectiveTitle,
  language,
  sourceType,
  title,
  onLanguageChange,
  onSourceTypeChange,
  onTitleChange,
}: Readonly<{
  candidate: IntakeSourceCandidate;
  detected: ReturnType<typeof detectIntakeSource>;
  effectiveTitle: string;
  language: string;
  sourceType: IntakeSourceType;
  title: string;
  onLanguageChange: (language: string) => void;
  onSourceTypeChange: (sourceType: IntakeSourceType) => void;
  onTitleChange: (title: string) => void;
}>) {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <div className="grid gap-4">
      <Panel className="grid gap-4 p-4" variant="surface">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--vs-text)]">Confirm what we found</h3>
            <p className="mt-1 text-xs leading-5 vs-muted">
              Check the detected details before Review opens.
            </p>
          </div>
          <Button
            data-testid="intake-metadata-edit"
            onClick={() => {
              setIsEditing((current) => !current);
            }}
            variant="secondary"
          >
            {isEditing ? "Hide Edits" : "Edit Details"}
          </Button>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryRow label="Title" value={effectiveTitle} />
          <SummaryRow label="Type" value={sourceTypeLabel(sourceType)} />
          <SummaryRow label="Structure" value={detected.structureLabel} />
          <SummaryRow label="Language" value={languageLabel(language)} />
          <SummaryRow label="Confidence" value={detected.confidence} />
        </dl>

        {candidate.confidencePrompt ? (
          <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--vs-status-warning)]">
            {candidate.confidencePrompt}
          </p>
        ) : (
          <p className="rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs leading-5 vs-border vs-muted">
            {detected.reason}
          </p>
        )}

        {isEditing ? (
          <div className="grid gap-3 border-t pt-3 vs-border lg:grid-cols-3">
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
        ) : null}
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
      <div className="grid gap-2 xl:grid-cols-3">
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
  candidate,
  currentBookScope,
  detected,
  effectiveTitle,
  existingSource,
  intakeError,
  isWorking,
  policyProfile,
  providerBackedGenerationBoundary,
  readiness,
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
  onRecover,
  onScopeChange,
}: Readonly<{
  bookScopeContent: BookSourceScopeContent | null;
  candidate: IntakeSourceCandidate;
  currentBookScope: BookScope | null;
  detected: ReturnType<typeof detectIntakeSource>;
  effectiveTitle: string;
  existingSource: IntakeExistingSource | undefined;
  intakeError: string | null;
  isWorking: boolean;
  policyProfile: string;
  providerBackedGenerationBoundary: boolean;
  readiness: IntakeReadinessState;
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
  onRecover: (step: IntakeStepId) => void;
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
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
      <Panel className="grid gap-4 p-4" variant="surface">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--vs-text)]">{readiness.title}</h3>
            <p className="mt-1 text-sm leading-6 vs-muted">{readiness.detail}</p>
          </div>
          <StatusChip tone={readiness.tone}>
            {readiness.status === "ready" ? "Complete" : readiness.status}
          </StatusChip>
        </div>

        <dl className="grid gap-2 text-xs xl:grid-cols-2">
          <SummaryRow label="Title" value={effectiveTitle} />
          <SummaryRow label="Type" value={sourceTypeLabel(sourceType)} />
          <SummaryRow label="Structure" value={structureLabel} />
          <SummaryRow label="Policy" value={policyProfile} />
          <SummaryRow label="Voice" value={voiceProfileLabel} />
          <SummaryRow label="Source" value={candidate.inputSummary} />
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
        {intakeError && readiness.status === "ready" ? (
          <p className="rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] px-3 py-2 text-xs text-[var(--vs-status-danger)]">
            {intakeError}
          </p>
        ) : null}
        {providerBackedGenerationBoundary ? (
          <PrivacyNoticeCallout notice={PRIVACY_NOTICES.providerBackedGeneration} />
        ) : null}
        <DestinationActions
          isWorking={isWorking}
          readiness={readiness}
          onOpenPreview={onOpenPreview}
          onOpenReview={onOpenReview}
          onRecover={onRecover}
        />
      </Panel>
      <DestinationActiveSourcePanel
        activeBook={activeBook}
        activePrepared={activePrepared}
        currentBookScope={currentBookScope}
        onInspectBookSource={onInspectBookSource}
        onInspectPreparedSource={onInspectPreparedSource}
        onOpenBookCinema={onOpenBookCinema}
        onOpenPreparedSourceCinema={onOpenPreparedSourceCinema}
      />
    </div>
  );
}

function DestinationActions({
  isWorking,
  readiness,
  onOpenPreview,
  onOpenReview,
  onRecover,
}: Readonly<{
  isWorking: boolean;
  readiness: IntakeReadinessState;
  onOpenPreview: () => void;
  onOpenReview: () => void;
  onRecover: (step: IntakeStepId) => void;
}>) {
  if (readiness.status !== "ready") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="intake-wizard-recover"
          onClick={() => {
            onRecover(readiness.recoveryStep);
          }}
          variant="primary"
        >
          {readiness.actionLabel}
        </Button>
      </div>
    );
  }

  return (
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
  );
}

function DestinationActiveSourcePanel({
  activeBook,
  activePrepared,
  currentBookScope,
  onInspectBookSource,
  onInspectPreparedSource,
  onOpenBookCinema,
  onOpenPreparedSourceCinema,
}: Readonly<{
  activeBook: BookSource | null;
  activePrepared: PreparedSource | null;
  currentBookScope: BookScope | null;
  onInspectBookSource: (source: BookSource) => void;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onOpenBookCinema: (source?: BookSource, scope?: BookScope) => void;
  onOpenPreparedSourceCinema: (source: PreparedSource) => void;
}>) {
  return (
    <Panel className="grid gap-3 p-3" variant="raised">
      <h3 className="text-sm font-semibold text-[var(--vs-text)]">Active source</h3>
      <BookActiveSource
        activeBook={activeBook}
        currentBookScope={currentBookScope}
        onInspectBookSource={onInspectBookSource}
        onOpenBookCinema={onOpenBookCinema}
      />
      <PreparedActiveSource
        activePrepared={activePrepared}
        onInspectPreparedSource={onInspectPreparedSource}
        onOpenPreparedSourceCinema={onOpenPreparedSourceCinema}
      />
      {!activeBook && !activePrepared ? (
        <p className="rounded-md border border-dashed p-3 text-xs leading-5 vs-border vs-muted">
          Source metadata will appear here after import or when you choose an existing source.
        </p>
      ) : null}
    </Panel>
  );
}

function BookActiveSource({
  activeBook,
  currentBookScope,
  onInspectBookSource,
  onOpenBookCinema,
}: Readonly<{
  activeBook: BookSource | null;
  currentBookScope: BookScope | null;
  onInspectBookSource: (source: BookSource) => void;
  onOpenBookCinema: (source?: BookSource, scope?: BookScope) => void;
}>) {
  if (!activeBook) {
    return null;
  }
  return (
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
            onOpenBookCinema(activeBook, currentBookScope ?? resolveDefaultBookScope(activeBook));
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
  );
}

function PreparedActiveSource({
  activePrepared,
  onInspectPreparedSource,
  onOpenPreparedSourceCinema,
}: Readonly<{
  activePrepared: PreparedSource | null;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onOpenPreparedSourceCinema: (source: PreparedSource) => void;
}>) {
  if (!activePrepared) {
    return null;
  }
  return (
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
  );
}

function AdvancedImportDrawer({
  candidate,
  detected,
  intakeError,
  markdownParseMode,
  policyProfile,
  providerBackedGenerationBoundary,
  sourceChoice,
  sourceUrl,
  template,
  templateId,
  onClose,
  onMarkdownParseModeChange,
  onTemplateChange,
}: Readonly<{
  candidate: IntakeSourceCandidate;
  detected: ReturnType<typeof detectIntakeSource>;
  intakeError: string | null;
  markdownParseMode: MarkdownParseMode;
  policyProfile: string;
  providerBackedGenerationBoundary: boolean;
  sourceChoice: IntakeSourceChoice;
  sourceUrl: string;
  template: IntakeProjectTemplate;
  templateId: string;
  onClose: () => void;
  onMarkdownParseModeChange: (mode: MarkdownParseMode) => void;
  onTemplateChange: (templateId: string) => void;
}>) {
  const importOptions = bookImportOptionsForTemplate(template);
  return (
    <Drawer
      label="Advanced import"
      metadata={[
        { label: "Route", value: candidate.adapterRouteLabel },
        { label: "Confidence", value: detected.confidence },
      ]}
      title="Advanced import settings"
      onClose={onClose}
    >
      <div className="grid gap-4">
        <Panel className="grid gap-3 p-3" variant="surface">
          <h3 className="text-sm font-semibold text-[var(--vs-text)]">Defaults</h3>
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
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <SummaryRow label="Policy" value={policyProfile} />
            <SummaryRow label="Default type" value={sourceTypeLabel(template.sourceType)} />
            <SummaryRow label="Import profile" value={importOptions.importProfile ?? "auto"} />
            <SummaryRow label="PDF tables" value={importOptions.pdfTableMode ?? "auto"} />
          </dl>
        </Panel>

        <Panel className="grid gap-3 p-3" variant="surface">
          <h3 className="text-sm font-semibold text-[var(--vs-text)]">Adapter route</h3>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <SummaryRow label="Detected type" value={sourceTypeLabel(detected.sourceType)} />
            <SummaryRow label="Detected mode" value={detected.sourceMode} />
            <SummaryRow label="Detected structure" value={detected.structureLabel} />
            <SummaryRow label="Route" value={candidate.adapterRouteLabel} />
          </dl>
          <p className="rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs leading-5 vs-border vs-muted">
            {detected.reason}
          </p>
          <MarkdownModeSelect mode={markdownParseMode} onChange={onMarkdownParseModeChange} />
        </Panel>

        <Panel className="grid gap-3 p-3" variant="surface">
          <h3 className="text-sm font-semibold text-[var(--vs-text)]">Privacy and diagnostics</h3>
          {sourceChoice === "file" ? (
            <PrivacyNoticeCallout notice={PRIVACY_NOTICES.fileIntake} />
          ) : null}
          {sourceChoice === "url" ? (
            <PrivacyNoticeCallout notice={urlIntakeNotice(sourceUrl)} />
          ) : null}
          {providerBackedGenerationBoundary ? (
            <PrivacyNoticeCallout notice={PRIVACY_NOTICES.providerBackedGeneration} />
          ) : null}
          {intakeError ? (
            <PrivacyNoticeCallout notice={sourcePrepFailureNotice(intakeError)} />
          ) : null}
          {!intakeError && sourceChoice !== "file" && sourceChoice !== "url" ? (
            <p className="rounded-md border border-dashed p-3 text-xs leading-5 vs-border vs-muted">
              No external import boundary is active for this source path.
            </p>
          ) : null}
        </Panel>
      </div>
    </Drawer>
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
      <dd
        className="mt-1 line-clamp-2 break-words text-sm font-semibold text-[var(--vs-text)]"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
