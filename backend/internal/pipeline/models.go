package pipeline

import (
	"io"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/lexicon"
	speechmath "github.com/justinedwards/tts-research/backend/internal/math"
	"github.com/justinedwards/tts-research/backend/internal/normalise"
	"github.com/justinedwards/tts-research/backend/internal/policy"
	"github.com/justinedwards/tts-research/backend/internal/providers"
)

type JobStatus string

const (
	JobStatusQueued       JobStatus = "queued"
	JobStatusOptimizing   JobStatus = "optimizing"
	JobStatusSynthesizing JobStatus = "synthesizing"
	JobStatusChecking     JobStatus = "checking"
	JobStatusRetrying     JobStatus = "retrying"
	JobStatusCompleted    JobStatus = "completed"
	JobStatusFailed       JobStatus = "failed"
	JobStatusCancelled    JobStatus = "cancelled"
)

type JobPipelinePhase string

const (
	JobPipelinePhaseSubmit       JobPipelinePhase = "submit"
	JobPipelinePhaseExtract      JobPipelinePhase = "extract"
	JobPipelinePhaseStructure    JobPipelinePhase = "structure"
	JobPipelinePhaseRenderSpoken JobPipelinePhase = "render_spoken_form"
	JobPipelinePhaseSegment      JobPipelinePhase = "segment"
	JobPipelinePhaseSynthesize   JobPipelinePhase = "synthesize_segment"
	JobPipelinePhaseAlign        JobPipelinePhase = "align_segment"
	JobPipelinePhaseCheck        JobPipelinePhase = "check_segment"
	JobPipelinePhaseAssemble     JobPipelinePhase = "assemble"
	JobPipelinePhaseComplete     JobPipelinePhase = "complete"
)

var allJobPipelinePhases = []JobPipelinePhase{
	JobPipelinePhaseSubmit,
	JobPipelinePhaseExtract,
	JobPipelinePhaseStructure,
	JobPipelinePhaseRenderSpoken,
	JobPipelinePhaseSegment,
	JobPipelinePhaseSynthesize,
	JobPipelinePhaseAlign,
	JobPipelinePhaseCheck,
	JobPipelinePhaseAssemble,
	JobPipelinePhaseComplete,
}

var jobPipelinePhaseIndex = map[JobPipelinePhase]int{}

func init() {
	for index, phase := range allJobPipelinePhases {
		jobPipelinePhaseIndex[phase] = index
	}
}

func ParseJobPipelinePhase(value string) JobPipelinePhase {
	clean := JobPipelinePhase(value)
	if _, ok := jobPipelinePhaseIndex[clean]; ok {
		return clean
	}
	return ""
}

func isKnownJobPipelinePhase(phase JobPipelinePhase) bool {
	return JobPipelinePhaseSortOrder(phase) >= 0
}

func IsValidJobPipelinePhase(value string) bool {
	return ParseJobPipelinePhase(value) != ""
}

func isJobPipelinePhaseRetryCandidate(retryPhase, failedPhase JobPipelinePhase) bool {
	retryIndex := JobPipelinePhaseSortOrder(retryPhase)
	failedIndex := JobPipelinePhaseSortOrder(failedPhase)
	if retryIndex < 0 || failedIndex < 0 {
		return false
	}

	return retryIndex >= failedIndex
}

func JobPipelinePhaseSortOrder(phase JobPipelinePhase) int {
	if index, ok := jobPipelinePhaseIndex[phase]; ok {
		return index
	}
	return -1
}

type JobTerminalReason string

const (
	JobTerminalReasonUserCancelled       JobTerminalReason = "user_cancelled"
	JobTerminalReasonSystemCancelled     JobTerminalReason = "system_cancelled"
	JobTerminalReasonProviderFailed      JobTerminalReason = "provider_failed"
	JobTerminalReasonProviderTimeout     JobTerminalReason = "provider_timeout"
	JobTerminalReasonValidationFailed    JobTerminalReason = "validation_failed"
	JobTerminalReasonSuperseded          JobTerminalReason = "superseded"
	JobTerminalReasonMetadataFailed      JobTerminalReason = "metadata_failed"
	JobTerminalReasonConfigurationFailed JobTerminalReason = "configuration_failed"
)

type JobFailureKind string

const (
	JobFailureKindSource       JobFailureKind = "source"
	JobFailureKindVoice        JobFailureKind = "voice"
	JobFailureKindEngine       JobFailureKind = "engine"
	JobFailureKindBackend      JobFailureKind = "backend"
	JobFailureKindCancellation JobFailureKind = "cancellation"
	JobFailureKindQueue        JobFailureKind = "queue"
)

type StageStatus string

const (
	StageStatusWaiting StageStatus = "waiting"
	StageStatusRunning StageStatus = "running"
	StageStatusDone    StageStatus = "done"
	StageStatusFailed  StageStatus = "failed"
)

type CreateJobRequest struct {
	Text                  string                   `json:"text"`
	SpeechText            string                   `json:"speechText,omitempty"`
	VoiceID               string                   `json:"voiceId,omitempty"`
	ProjectID             string                   `json:"projectId,omitempty"`
	BookSourceID          string                   `json:"bookSourceId,omitempty"`
	BookScope             *BookScope               `json:"bookScope,omitempty"`
	PreparedSourceID      string                   `json:"preparedSourceId,omitempty"`
	TemporarySourceID     string                   `json:"temporarySourceId,omitempty"`
	SelectedBlockIDs      []string                 `json:"selectedBlockIds,omitempty"`
	SourceKind            string                   `json:"sourceKind,omitempty"`
	ProgressTargetID      string                   `json:"progressTargetId,omitempty"`
	VoiceProfileID        string                   `json:"voiceProfileId"`
	VoiceLanguage         string                   `json:"voiceLanguage"`
	TTSEngine             string                   `json:"ttsEngine,omitempty"`
	EngineOptions         map[string]string        `json:"engineOptions,omitempty"`
	TTSVoice              string                   `json:"ttsVoice,omitempty"`
	TTSLanguage           string                   `json:"ttsLanguage,omitempty"`
	AdaptiveMode          bool                     `json:"adaptiveMode"`
	RunMode               RunMode                  `json:"runMode,omitempty"`
	PerformanceMode       PerformanceMode          `json:"performanceMode,omitempty"`
	PipelineOptions       CreateJobPipelineOptions `json:"pipelineOptions,omitempty"`
	SpeechPolicyProfile   string                   `json:"speechPolicyProfile,omitempty"`
	SpeechPolicyOverrides policy.Overrides         `json:"speechPolicyOverrides,omitempty"`
	Locale                string                   `json:"locale,omitempty"`
	SpeechRenderApplied   bool                     `json:"speechRenderApplied,omitempty"`
}

type RetryVoiceJobRequest struct {
	Phase JobPipelinePhase `json:"phase,omitempty"`
}

type VoiceKind string

const (
	VoiceKindNative VoiceKind = "native"
	VoiceKindClone  VoiceKind = "clone"
)

type Voice struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	Kind               VoiceKind `json:"kind"`
	Provider           string    `json:"provider"`
	LangCode           string    `json:"langCode"`
	ReferenceAudioURL  string    `json:"referenceAudioUrl,omitempty"`
	ReferenceAudioPath string    `json:"referenceAudioPath,omitempty"`
	SourceFilename     string    `json:"sourceFilename,omitempty"`
	CreatedAt          time.Time `json:"createdAt"`
}

type VoiceUpload struct {
	Name        string
	Filename    string
	ContentType string
	Reader      io.Reader
}

type VoiceProject struct {
	ID                   string                      `json:"id"`
	Name                 string                      `json:"name"`
	SpeechPolicyProfile  string                      `json:"speechPolicyProfile"`
	SpeechPolicyProfiles []CustomSpeechPolicyProfile `json:"speechPolicyProfiles,omitempty"`
	CreatedAt            time.Time                   `json:"createdAt"`
	UpdatedAt            time.Time                   `json:"updatedAt"`
}

type CustomSpeechPolicyProfile struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	BaseProfile string          `json:"baseProfile,omitempty"`
	Settings    policy.Settings `json:"settings"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

type PreparedSourceKind string

const (
	PreparedSourceKindText PreparedSourceKind = "text"
	PreparedSourceKindFile PreparedSourceKind = "file"
	PreparedSourceKindURL  PreparedSourceKind = "url"
	PreparedSourceKindBook PreparedSourceKind = "book"
)

type PreparedSourceStatus string

const (
	PreparedSourceStatusReady  PreparedSourceStatus = "ready"
	PreparedSourceStatusFailed PreparedSourceStatus = "failed"
)

type SourceOwner string

const (
	SourceOwnerProject   SourceOwner = "project"
	SourceOwnerTemporary SourceOwner = "temporary"
)

type TemporarySourceLifecycleState string

const (
	TemporarySourceStateCreated       TemporarySourceLifecycleState = "created"
	TemporarySourceStateImporting     TemporarySourceLifecycleState = "importing"
	TemporarySourceStateExtracted     TemporarySourceLifecycleState = "extracted"
	TemporarySourceStateNeedsMetadata TemporarySourceLifecycleState = "needs_metadata"
	TemporarySourceStateReviewable    TemporarySourceLifecycleState = "reviewable"
	TemporarySourceStatePreviewable   TemporarySourceLifecycleState = "previewable"
	TemporarySourceStateGenerating    TemporarySourceLifecycleState = "generating"
	TemporarySourceStateAudioReady    TemporarySourceLifecycleState = "audio_ready"
	TemporarySourceStateStale         TemporarySourceLifecycleState = "stale"
	TemporarySourceStateFailed        TemporarySourceLifecycleState = "failed"
	TemporarySourceStatePromoted      TemporarySourceLifecycleState = "promoted"
	TemporarySourceStateExpired       TemporarySourceLifecycleState = "expired"
	TemporarySourceStateDiscarded     TemporarySourceLifecycleState = "discarded"
)

type TemporarySourcePromotionStatus string

const (
	TemporarySourceNotPromoted     TemporarySourcePromotionStatus = "notPromoted"
	TemporarySourcePromoted        TemporarySourcePromotionStatus = "promoted"
	TemporarySourcePromotionFailed TemporarySourcePromotionStatus = "promotionFailed"
)

type TemporarySourceFailureCode string

const (
	TemporarySourceFailureUnsafeURL           TemporarySourceFailureCode = "unsafe_url"
	TemporarySourceFailureFetchFailed         TemporarySourceFailureCode = "fetch_failed"
	TemporarySourceFailureExtractionFailed    TemporarySourceFailureCode = "extraction_failed"
	TemporarySourceFailureUnsupportedFile     TemporarySourceFailureCode = "unsupported_file"
	TemporarySourceFailureFileTooLarge        TemporarySourceFailureCode = "file_too_large"
	TemporarySourceFailureMetadataRequired    TemporarySourceFailureCode = "metadata_required"
	TemporarySourceFailureSourceNotReady      TemporarySourceFailureCode = "source_not_ready"
	TemporarySourceFailureGenerationFailed    TemporarySourceFailureCode = "generation_failed"
	TemporarySourceFailureProviderUnavailable TemporarySourceFailureCode = "provider_unavailable"
	TemporarySourceFailureAlignmentFailed     TemporarySourceFailureCode = "alignment_failed"
	TemporarySourceFailureExpired             TemporarySourceFailureCode = "expired"
	TemporarySourceFailureDiscarded           TemporarySourceFailureCode = "discarded"
	TemporarySourceFailureCleanupFailed       TemporarySourceFailureCode = "cleanup_failed"
	TemporarySourceFailurePromotionFailed     TemporarySourceFailureCode = "promotion_failed"
)

type SourceArtifactScope string

const (
	SourceArtifactScopeProject   SourceArtifactScope = "project"
	SourceArtifactScopeTemporary SourceArtifactScope = "temporary"
)

type SourceArtifactKind string

const (
	SourceArtifactKindExtraction     SourceArtifactKind = "extraction"
	SourceArtifactKindReview         SourceArtifactKind = "review"
	SourceArtifactKindPreviewAudio   SourceArtifactKind = "previewAudio"
	SourceArtifactKindGeneratedAudio SourceArtifactKind = "generatedAudio"
	SourceArtifactKindTiming         SourceArtifactKind = "timing"
	SourceArtifactKindValidation     SourceArtifactKind = "validation"
	SourceArtifactKindBookmark       SourceArtifactKind = "bookmark"
	SourceArtifactKindProgress       SourceArtifactKind = "progress"
)

type SourceArtifactRef struct {
	ID        string              `json:"id"`
	Scope     SourceArtifactScope `json:"scope"`
	Kind      SourceArtifactKind  `json:"kind"`
	URL       string              `json:"url,omitempty"`
	Bytes     int64               `json:"bytes,omitempty"`
	CreatedAt time.Time           `json:"createdAt"`
	ExpiresAt *time.Time          `json:"expiresAt,omitempty"`
}

type TemporarySourceCleanupAction string

const (
	TemporarySourceCleanupDiscardNow         TemporarySourceCleanupAction = "discardNow"
	TemporarySourceCleanupExtendSession      TemporarySourceCleanupAction = "extendSession"
	TemporarySourceCleanupRemoveAudioOnly    TemporarySourceCleanupAction = "removeGeneratedAudioOnly"
	TemporarySourceCleanupRemoveAllArtifacts TemporarySourceCleanupAction = "removeAllTemporaryArtifacts"
)

type TemporarySourceCleanupRequest struct {
	Action        TemporarySourceCleanupAction `json:"action"`
	ExtendByHours int                          `json:"extendByHours,omitempty"`
}

type TemporarySourceCleanupResult struct {
	TemporarySourceID string                        `json:"temporarySourceId"`
	Action            TemporarySourceCleanupAction  `json:"action"`
	Status            TemporarySourceLifecycleState `json:"status"`
	RemovedBytes      int64                         `json:"removedBytes,omitempty"`
	ExpiresAt         *time.Time                    `json:"expiresAt,omitempty"`
	Message           string                        `json:"message,omitempty"`
	Source            *TemporarySourceSession       `json:"source,omitempty"`
}

type TemporaryStorageUsageSummary struct {
	TotalBytes        int64                          `json:"totalBytes"`
	SourceBytes       int64                          `json:"sourceBytes"`
	ArtifactBytes     int64                          `json:"artifactBytes"`
	AudioBytes        int64                          `json:"audioBytes"`
	ProgressBytes     int64                          `json:"progressBytes"`
	ArtifactTypeBytes map[string]int64               `json:"artifactTypeBytes,omitempty"`
	TemporaryCount    int                            `json:"temporaryCount"`
	ExpiredCount      int                            `json:"expiredCount"`
	GeneratingCount   int                            `json:"generatingCount"`
	Sessions          []TemporaryStorageUsageSession `json:"sessions"`
	UpdatedAt         time.Time                      `json:"updatedAt"`
}

type TemporaryStorageUsageSession struct {
	TemporarySourceID string                        `json:"temporarySourceId"`
	Title             string                        `json:"title,omitempty"`
	Status            TemporarySourceLifecycleState `json:"status"`
	Bytes             int64                         `json:"bytes"`
	AudioBytes        int64                         `json:"audioBytes,omitempty"`
	ArtifactBytes     int64                         `json:"artifactBytes,omitempty"`
	SourceBytes       int64                         `json:"sourceBytes,omitempty"`
	ProgressBytes     int64                         `json:"progressBytes,omitempty"`
	ArtifactTypeBytes map[string]int64              `json:"artifactTypeBytes,omitempty"`
	ExpiresAt         time.Time                     `json:"expiresAt"`
	LastAccessedAt    time.Time                     `json:"lastAccessedAt"`
}

type SourceReadinessState string

const (
	SourceReadinessStateNoSource      SourceReadinessState = "noSource"
	SourceReadinessStateImporting     SourceReadinessState = "importing"
	SourceReadinessStateNeedsMetadata SourceReadinessState = "needsMetadata"
	SourceReadinessStateReady         SourceReadinessState = "ready"
	SourceReadinessStateFailed        SourceReadinessState = "failed"
	SourceReadinessStateUnsupported   SourceReadinessState = "unsupported"
	SourceReadinessStateStale         SourceReadinessState = "stale"
)

type SourceReadinessFailureStage string

const (
	SourceReadinessFailureFile              SourceReadinessFailureStage = "file"
	SourceReadinessFailureExtraction        SourceReadinessFailureStage = "extraction"
	SourceReadinessFailureStructure         SourceReadinessFailureStage = "structure"
	SourceReadinessFailurePolicyPreparation SourceReadinessFailureStage = "policyPreparation"
)

type SourceReadiness struct {
	State           SourceReadinessState        `json:"state"`
	Title           string                      `json:"title,omitempty"`
	SourceType      string                      `json:"sourceType,omitempty"`
	Language        string                      `json:"language,omitempty"`
	StructureLabel  string                      `json:"structureLabel,omitempty"`
	Confidence      string                      `json:"confidence,omitempty"`
	ConfirmedFields []string                    `json:"confirmedFields,omitempty"`
	PreparedAt      *time.Time                  `json:"preparedAt,omitempty"`
	StaleReason     string                      `json:"staleReason,omitempty"`
	FailureStage    SourceReadinessFailureStage `json:"failureStage,omitempty"`
	RetryAction     string                      `json:"retryAction,omitempty"`
	Detail          string                      `json:"detail"`
}

type SourceReadinessConfirmationRequest struct {
	Title               string     `json:"title,omitempty"`
	SourceType          string     `json:"sourceType,omitempty"`
	Language            string     `json:"language,omitempty"`
	StructureChoice     string     `json:"structureChoice,omitempty"`
	StructureLabel      string     `json:"structureLabel,omitempty"`
	Scope               *BookScope `json:"scope,omitempty"`
	SpeechPolicyProfile string     `json:"speechPolicyProfile,omitempty"`
	VoiceProfileID      string     `json:"voiceProfileId,omitempty"`
}

type NarrationBlockKind string

const (
	NarrationBlockKindHeading     NarrationBlockKind = "heading"
	NarrationBlockKindSubheading  NarrationBlockKind = "subheading"
	NarrationBlockKindBody        NarrationBlockKind = "body"
	NarrationBlockKindQuote       NarrationBlockKind = "quote"
	NarrationBlockKindTable       NarrationBlockKind = "table"
	NarrationBlockKindCode        NarrationBlockKind = "code"
	NarrationBlockKindMath        NarrationBlockKind = "math"
	NarrationBlockKindImage       NarrationBlockKind = "image"
	NarrationBlockKindCaption     NarrationBlockKind = "caption"
	NarrationBlockKindCitation    NarrationBlockKind = "citation"
	NarrationBlockKindFootnote    NarrationBlockKind = "footnote"
	NarrationBlockKindReference   NarrationBlockKind = "reference"
	NarrationBlockKindArtifact    NarrationBlockKind = "artifact_token"
	NarrationBlockKindUnknownMark NarrationBlockKind = "unknown_inline_marker"
	NarrationBlockKindList        NarrationBlockKind = "list"
	NarrationBlockKindFrontmatter NarrationBlockKind = "frontmatter"
	NarrationBlockKindAdmonition  NarrationBlockKind = "admonition"
	NarrationBlockKindDirective   NarrationBlockKind = "directive"
	NarrationBlockKindEmbedded    NarrationBlockKind = "embedded"
)

type NarrationSpeakMode string

const (
	NarrationSpeakModeSpeak     NarrationSpeakMode = "speak"
	NarrationSpeakModeSkip      NarrationSpeakMode = "skip"
	NarrationSpeakModeSummarize NarrationSpeakMode = "summarize"
)

type NarrationSegment struct {
	Index       int      `json:"index"`
	Text        string   `json:"text"`
	StartOffset int      `json:"startOffset"`
	EndOffset   int      `json:"endOffset"`
	Warnings    []string `json:"warnings,omitempty"`
}

type NarrationBlock struct {
	ID                  string                    `json:"id"`
	Index               int                       `json:"index"`
	Kind                NarrationBlockKind        `json:"kind"`
	SpeakMode           NarrationSpeakMode        `json:"speakMode"`
	Label               string                    `json:"label,omitempty"`
	Text                string                    `json:"text,omitempty"`
	SpokenText          string                    `json:"spokenText,omitempty"`
	Language            string                    `json:"language,omitempty"`
	Emphasis            string                    `json:"emphasis,omitempty"`
	PauseBeforeMS       int                       `json:"pauseBeforeMs,omitempty"`
	PauseAfterMS        int                       `json:"pauseAfterMs,omitempty"`
	StartOffset         int                       `json:"startOffset"`
	EndOffset           int                       `json:"endOffset"`
	EstimatedDurationMS int                       `json:"estimatedDurationMs,omitempty"`
	Confidence          float64                   `json:"confidence,omitempty"`
	Segments            []NarrationSegment        `json:"segments,omitempty"`
	Warnings            []string                  `json:"warnings,omitempty"`
	Metadata            map[string]any            `json:"metadata,omitempty"`
	SpeechPolicy        policy.SpeechPolicy       `json:"speechPolicy"`
	LanguageSpans       []normalise.LanguageSpan  `json:"languageSpans,omitempty"`
	Pronunciations      []lexicon.Decision        `json:"pronunciations,omitempty"`
	Normalisations      []normalise.Decision      `json:"normalisations,omitempty"`
	MathPreview         *speechmath.PreviewResult `json:"mathPreview,omitempty"`
}

type SkippedSourceItem struct {
	ID     string             `json:"id"`
	Kind   NarrationBlockKind `json:"kind"`
	Text   string             `json:"text"`
	Reason string             `json:"reason"`
	Offset int                `json:"offset,omitempty"`
}

type PreparedSourceSummary struct {
	HeadingCount         int `json:"headingCount"`
	SpokenBlockCount     int `json:"spokenBlockCount"`
	SkippedBlockCount    int `json:"skippedBlockCount"`
	CitationSkipCount    int `json:"citationSkipCount"`
	SentenceSegmentCount int `json:"sentenceSegmentCount"`
}

type TranscriptMetadata struct {
	Text        string     `json:"text,omitempty"`
	GeneratedAt *time.Time `json:"generatedAt,omitempty"`
	Model       string     `json:"model,omitempty"`
	Provider    string     `json:"provider,omitempty"`
	Confidence  float64    `json:"confidence,omitempty"`
	Error       string     `json:"error,omitempty"`
}

type PreparedSource struct {
	ID                          string                `json:"id"`
	ProjectID                   string                `json:"projectId"`
	SourceOwner                 SourceOwner           `json:"sourceOwner,omitempty"`
	TemporarySourceID           string                `json:"temporarySourceId,omitempty"`
	Status                      PreparedSourceStatus  `json:"status"`
	SourceReadiness             *SourceReadiness      `json:"sourceReadiness,omitempty"`
	Kind                        PreparedSourceKind    `json:"kind"`
	SourceName                  string                `json:"sourceName"`
	SourceURL                   string                `json:"sourceUrl,omitempty"`
	SourceContentType           string                `json:"sourceContentType,omitempty"`
	SourceBytes                 int64                 `json:"sourceBytes,omitempty"`
	PreprocessorID              string                `json:"preprocessorId,omitempty"`
	PreprocessorVersion         string                `json:"preprocessorVersion,omitempty"`
	SourceFormat                string                `json:"sourceFormat,omitempty"`
	RenderMode                  string                `json:"renderMode,omitempty"`
	MarkdownParseMode           string                `json:"markdownParseMode,omitempty"`
	SpeechPolicyProfile         string                `json:"speechPolicyProfile"`
	SourceSpeechPolicyProfile   string                `json:"sourceSpeechPolicyProfile,omitempty"`
	SourceSpeechPolicyOverrides policy.Overrides      `json:"sourceSpeechPolicyOverrides,omitempty"`
	Title                       string                `json:"title,omitempty"`
	Text                        string                `json:"text,omitempty"`
	SpeechText                  string                `json:"speechText,omitempty"`
	WordCount                   int                   `json:"wordCount"`
	BlockCount                  int                   `json:"blockCount"`
	SegmentCount                int                   `json:"segmentCount"`
	Summary                     PreparedSourceSummary `json:"summary"`
	Blocks                      []NarrationBlock      `json:"blocks,omitempty"`
	SkippedItems                []SkippedSourceItem   `json:"skippedItems,omitempty"`
	Warnings                    []string              `json:"warnings,omitempty"`
	Metadata                    map[string]any        `json:"metadata,omitempty"`
	TranscriptMetadata          *TranscriptMetadata   `json:"transcriptMetadata,omitempty"`
	Transcript                  string                `json:"transcript,omitempty"`
	TranscriptGeneratedAt       *time.Time            `json:"transcriptGeneratedAt,omitempty"`
	TranscriptModel             string                `json:"transcriptModel,omitempty"`
	TranscriptError             string                `json:"transcriptError,omitempty"`
	TranscriptConfidence        float64               `json:"transcriptConfidence,omitempty"`
	Error                       string                `json:"error,omitempty"`
	CreatedAt                   time.Time             `json:"createdAt"`
	UpdatedAt                   time.Time             `json:"updatedAt"`
}

type CreatePreparedSourceRequest struct {
	Kind                  PreparedSourceKind `json:"kind"`
	Text                  string             `json:"text,omitempty"`
	URL                   string             `json:"url,omitempty"`
	SourceName            string             `json:"sourceName,omitempty"`
	SourceContentType     string             `json:"sourceContentType,omitempty"`
	SourceBytes           int64              `json:"sourceBytes,omitempty"`
	MarkdownParseMode     string             `json:"markdownParseMode,omitempty"`
	HTMLContainerSelector string             `json:"htmlContainerSelector,omitempty"`
}

type SpeechPolicyPreviewRequest struct {
	Profile        string           `json:"profile,omitempty"`
	Overrides      policy.Overrides `json:"overrides,omitempty"`
	Scope          *BookScope       `json:"scope,omitempty"`
	VoiceProfileID string           `json:"voiceProfileId,omitempty"`
	Locale         string           `json:"locale,omitempty"`
	TTSEngine      string           `json:"ttsEngine,omitempty"`
}

type SourceSpeechPolicyUpdateRequest struct {
	Profile   string           `json:"profile,omitempty"`
	Overrides policy.Overrides `json:"overrides,omitempty"`
	Clear     bool             `json:"clear,omitempty"`
}

type ProjectSpeechPolicy struct {
	ProjectID      string                      `json:"projectId"`
	Profile        string                      `json:"profile"`
	Settings       policy.Settings             `json:"settings"`
	CustomProfiles []CustomSpeechPolicyProfile `json:"customProfiles,omitempty"`
}

type UpsertSpeechPolicyProfileRequest struct {
	Name        string          `json:"name"`
	BaseProfile string          `json:"baseProfile,omitempty"`
	Settings    policy.Settings `json:"settings"`
}

type ProjectStorageDownload struct {
	Kind      string `json:"kind"`
	Label     string `json:"label"`
	URL       string `json:"url"`
	FileName  string `json:"fileName"`
	Bytes     int64  `json:"bytes,omitempty"`
	JobID     string `json:"jobId,omitempty"`
	Segment   int    `json:"segment,omitempty"`
	Available bool   `json:"available"`
}

type ProjectStorageSummary struct {
	ProjectID           string                   `json:"projectId"`
	ProjectName         string                   `json:"projectName"`
	GeneratedAudioBytes int64                    `json:"generatedAudioBytes"`
	BookSourceBytes     int64                    `json:"bookSourceBytes"`
	PreparedSourceBytes int64                    `json:"preparedSourceBytes"`
	JobBytes            int64                    `json:"jobBytes"`
	TotalBytes          int64                    `json:"totalBytes"`
	JobCount            int                      `json:"jobCount"`
	BookSourceCount     int                      `json:"bookSourceCount"`
	PreparedSourceCount int                      `json:"preparedSourceCount"`
	Downloads           []ProjectStorageDownload `json:"downloads"`
	Directories         map[string]string        `json:"directories,omitempty"`
	Warnings            []string                 `json:"warnings,omitempty"`
	UpdatedAt           time.Time                `json:"updatedAt"`
}

type BookSourceStatus string

const (
	BookSourceStatusReady  BookSourceStatus = "ready"
	BookSourceStatusFailed BookSourceStatus = "failed"
)

type BookSourceKind string

const (
	BookSourceKindPDF      BookSourceKind = "pdf"
	BookSourceKindEPUB     BookSourceKind = "epub"
	BookSourceKindDOCX     BookSourceKind = "docx"
	BookSourceKindHTML     BookSourceKind = "html"
	BookSourceKindMarkdown BookSourceKind = "markdown"
	BookSourceKindImage    BookSourceKind = "image"
)

type BookImportProfile string

const (
	BookImportProfileAuto      BookImportProfile = "auto"
	BookImportProfileScholarly BookImportProfile = "scholarly"
)

type PDFTableMode string

const (
	PDFTableModeAuto       PDFTableMode = "auto"
	PDFTableModeOff        PDFTableMode = "off"
	PDFTableModeStructured PDFTableMode = "structured"
)

type BookSourceImportOptions struct {
	ImportProfile BookImportProfile `json:"importProfile,omitempty"`
	PDFTableMode  PDFTableMode      `json:"pdfTableMode,omitempty"`
}

type BookSourceUpload struct {
	Path     string
	Filename string
	Bytes    int64
}

type BookSourcePage struct {
	Index     int    `json:"index"`
	Label     string `json:"label"`
	Text      string `json:"text,omitempty"`
	WordCount int    `json:"wordCount"`
	SectionID string `json:"sectionId,omitempty"`
}

type BookSourceChapter struct {
	Index               int      `json:"index"`
	ID                  string   `json:"id,omitempty"`
	Title               string   `json:"title"`
	Text                string   `json:"text,omitempty"`
	WordCount           int      `json:"wordCount"`
	Role                string   `json:"role,omitempty"`
	IsNarratable        bool     `json:"isNarratable"`
	PageStart           int      `json:"pageStart,omitempty"`
	PageEnd             int      `json:"pageEnd,omitempty"`
	SourceHref          string   `json:"sourceHref,omitempty"`
	EstimatedDurationMS int      `json:"estimatedDurationMs,omitempty"`
	Warnings            []string `json:"warnings,omitempty"`
}

type BookSourceWordSpan struct {
	Index       int    `json:"index"`
	Text        string `json:"text"`
	PageIndex   int    `json:"pageIndex,omitempty"`
	Chapter     int    `json:"chapter,omitempty"`
	StartOffset int    `json:"startOffset"`
	EndOffset   int    `json:"endOffset"`
}

type BookSourceSection struct {
	ID                  string   `json:"id"`
	Index               int      `json:"index"`
	Title               string   `json:"title"`
	Role                string   `json:"role"`
	IsNarratable        bool     `json:"isNarratable"`
	Kind                string   `json:"kind"`
	ChapterIndex        int      `json:"chapterIndex,omitempty"`
	PageStart           int      `json:"pageStart,omitempty"`
	PageEnd             int      `json:"pageEnd,omitempty"`
	SourceHref          string   `json:"sourceHref,omitempty"`
	WordCount           int      `json:"wordCount"`
	EstimatedDurationMS int      `json:"estimatedDurationMs,omitempty"`
	Warnings            []string `json:"warnings,omitempty"`
}

type BookSource struct {
	ID                          string                `json:"id"`
	ProjectID                   string                `json:"projectId"`
	SourceOwner                 SourceOwner           `json:"sourceOwner,omitempty"`
	TemporarySourceID           string                `json:"temporarySourceId,omitempty"`
	Status                      BookSourceStatus      `json:"status"`
	SourceReadiness             *SourceReadiness      `json:"sourceReadiness,omitempty"`
	Kind                        BookSourceKind        `json:"kind"`
	SourceFile                  string                `json:"sourceFile"`
	SourceBytes                 int64                 `json:"sourceBytes"`
	Title                       string                `json:"title,omitempty"`
	Author                      string                `json:"author,omitempty"`
	Text                        string                `json:"text,omitempty"`
	WordCount                   int                   `json:"wordCount"`
	PageCount                   int                   `json:"pageCount"`
	ChapterCount                int                   `json:"chapterCount"`
	StructureVersion            string                `json:"structureVersion,omitempty"`
	DefaultSectionID            string                `json:"defaultSectionId,omitempty"`
	SourceSpeechPolicyProfile   string                `json:"sourceSpeechPolicyProfile,omitempty"`
	SourceSpeechPolicyOverrides policy.Overrides      `json:"sourceSpeechPolicyOverrides,omitempty"`
	ReadingOrder                []string              `json:"readingOrder,omitempty"`
	Sections                    []BookSourceSection   `json:"sections,omitempty"`
	Pages                       []BookSourcePage      `json:"pages,omitempty"`
	Chapters                    []BookSourceChapter   `json:"chapters,omitempty"`
	WordSpans                   []BookSourceWordSpan  `json:"wordSpans,omitempty"`
	Warnings                    []string              `json:"warnings,omitempty"`
	Ingestion                   *IngestionDiagnostics `json:"ingestion,omitempty"`
	Error                       string                `json:"error,omitempty"`
	CreatedAt                   time.Time             `json:"createdAt"`
	UpdatedAt                   time.Time             `json:"updatedAt"`
}

type IngestionDiagnostics struct {
	SupportTier      string               `json:"supportTier,omitempty"`
	SupportTierLabel string               `json:"supportTierLabel,omitempty"`
	Confidence       float64              `json:"confidence,omitempty"`
	ImportProfile    string               `json:"importProfile,omitempty"`
	PDFTableMode     string               `json:"pdfTableMode,omitempty"`
	ExtractorChain   []ExtractorChainStep `json:"extractorChain,omitempty"`
	Warnings         []string             `json:"warnings,omitempty"`
}

type ExtractorChainStep struct {
	ID         string   `json:"id"`
	Label      string   `json:"label"`
	Status     string   `json:"status"`
	Confidence float64  `json:"confidence,omitempty"`
	Warnings   []string `json:"warnings,omitempty"`
}

type BookScopeType string

const (
	BookScopeTypeBook    BookScopeType = "book"
	BookScopeTypeChapter BookScopeType = "chapter"
	BookScopeTypePages   BookScopeType = "pages"
)

type BookScope struct {
	Type         BookScopeType `json:"type"`
	ChapterIndex int           `json:"chapterIndex,omitempty"`
	PageStart    int           `json:"pageStart,omitempty"`
	PageEnd      int           `json:"pageEnd,omitempty"`
	Label        string        `json:"label,omitempty"`
}

type BookCinemaDiagnostics struct {
	PDFExtractor             string                        `json:"pdfExtractor"`
	PDFExtractorAvailable    bool                          `json:"pdfExtractorAvailable"`
	PDFStrict                bool                          `json:"pdfStrict"`
	PDFSetup                 string                        `json:"pdfSetup,omitempty"`
	PDFToTextAvailable       bool                          `json:"pdftotextAvailable"`
	PythonFallbackAvailable  bool                          `json:"pythonFallbackAvailable"`
	PythonFallbackConfigured bool                          `json:"pythonFallbackConfigured"`
	PythonPath               string                        `json:"pythonPath,omitempty"`
	PythonScript             string                        `json:"pythonScript,omitempty"`
	Adapters                 map[string]AdapterDiagnostics `json:"adapters,omitempty"`
}

type AdapterCapability struct {
	AdapterID   string         `json:"adapterId"`
	Extensions  []string       `json:"extensions"`
	MimeTypes   []string       `json:"mimeTypes"`
	SourceKinds []string       `json:"sourceKinds"`
	Features    map[string]any `json:"features"`
}

type AdapterDiagnostics struct {
	AdapterID string                            `json:"adapterId"`
	Available bool                              `json:"available"`
	Status    string                            `json:"status"`
	CLIPath   string                            `json:"cliPath,omitempty"`
	Warnings  []string                          `json:"warnings,omitempty"`
	Tools     map[string]AdapterToolDiagnostics `json:"tools,omitempty"`
}

type AdapterToolDiagnostics struct {
	Available bool   `json:"available"`
	Status    string `json:"status"`
}

type BookSourceScopeContent struct {
	BookSourceID         string                `json:"bookSourceId"`
	Scope                BookScope             `json:"scope"`
	Text                 string                `json:"text"`
	WordSpans            []BookSourceWordSpan  `json:"wordSpans"`
	Section              *BookSourceSection    `json:"section,omitempty"`
	WordCount            int                   `json:"wordCount"`
	EstimatedDurationMS  int                   `json:"estimatedDurationMs,omitempty"`
	SourceStructureValid bool                  `json:"sourceStructureValid"`
	Blocks               []NarrationBlock      `json:"blocks,omitempty"`
	SkippedItems         []SkippedSourceItem   `json:"skippedItems,omitempty"`
	Summary              PreparedSourceSummary `json:"summary"`
	Warnings             []string              `json:"warnings,omitempty"`
}

type TemporarySourceSession struct {
	ID                          string                         `json:"id"`
	TemporarySourceID           string                         `json:"temporarySourceId"`
	Scope                       SourceArtifactScope            `json:"scope"`
	SourceOwner                 SourceOwner                    `json:"sourceOwner"`
	ProjectID                   string                         `json:"projectId,omitempty"`
	Status                      TemporarySourceLifecycleState  `json:"status"`
	PromotionStatus             TemporarySourcePromotionStatus `json:"promotionStatus"`
	PromotedProjectID           string                         `json:"promotedProjectId,omitempty"`
	PromotedSourceID            string                         `json:"promotedSourceId,omitempty"`
	Kind                        string                         `json:"kind"`
	SourceReadiness             *SourceReadiness               `json:"sourceReadiness,omitempty"`
	SourceName                  string                         `json:"sourceName"`
	SourceURL                   string                         `json:"sourceUrl,omitempty"`
	SourceContentType           string                         `json:"sourceContentType,omitempty"`
	SourceBytes                 int64                          `json:"sourceBytes,omitempty"`
	Title                       string                         `json:"title,omitempty"`
	Text                        string                         `json:"text,omitempty"`
	SpeechText                  string                         `json:"speechText,omitempty"`
	WordCount                   int                            `json:"wordCount"`
	BlockCount                  int                            `json:"blockCount,omitempty"`
	SegmentCount                int                            `json:"segmentCount,omitempty"`
	Summary                     *PreparedSourceSummary         `json:"summary,omitempty"`
	Blocks                      []NarrationBlock               `json:"blocks,omitempty"`
	SkippedItems                []SkippedSourceItem            `json:"skippedItems,omitempty"`
	ReviewNotes                 []string                       `json:"reviewNotes,omitempty"`
	Metadata                    map[string]any                 `json:"metadata,omitempty"`
	Artifacts                   []SourceArtifactRef            `json:"artifacts"`
	Bookmarks                   []ProgressBookmark             `json:"bookmarks,omitempty"`
	PlaybackProgress            *PlaybackProgress              `json:"playbackProgress,omitempty"`
	SourceSpeechPolicyProfile   string                         `json:"sourceSpeechPolicyProfile,omitempty"`
	SourceSpeechPolicyOverrides policy.Overrides               `json:"sourceSpeechPolicyOverrides,omitempty"`
	Warnings                    []string                       `json:"warnings,omitempty"`
	Error                       string                         `json:"error,omitempty"`
	FailureCode                 TemporarySourceFailureCode     `json:"failureCode,omitempty"`
	CreatedAt                   time.Time                      `json:"createdAt"`
	LastAccessedAt              time.Time                      `json:"lastAccessedAt"`
	ExpiresAt                   time.Time                      `json:"expiresAt"`
	UpdatedAt                   time.Time                      `json:"updatedAt"`
}

type ProjectSourceEnvelope struct {
	SourceOwner       SourceOwner `json:"sourceOwner"`
	ProjectID         string      `json:"projectId"`
	TemporarySourceID string      `json:"temporarySourceId,omitempty"`
	Source            any         `json:"source"`
}

type TemporarySourceEnvelope struct {
	SourceOwner       SourceOwner            `json:"sourceOwner"`
	Scope             SourceArtifactScope    `json:"scope"`
	ProjectID         string                 `json:"projectId,omitempty"`
	TemporarySourceID string                 `json:"temporarySourceId"`
	Source            TemporarySourceSession `json:"source"`
}

type TTSEngineVoice struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Gender      string `json:"gender,omitempty"`
	Description string `json:"description,omitempty"`
}

type TTSEngineDiagnostics struct {
	ID                string                  `json:"id"`
	Label             string                  `json:"label"`
	Status            string                  `json:"status"`
	Default           bool                    `json:"default"`
	Local             bool                    `json:"local"`
	Experimental      bool                    `json:"experimental"`
	SupportsVoice     bool                    `json:"supportsVoice"`
	SupportsReference bool                    `json:"supportsReference"`
	SupportsArtifacts bool                    `json:"supportsProfileArtifacts"`
	SupportsSwedish   bool                    `json:"supportsSwedish"`
	SupportsSSML      bool                    `json:"supportsSSML"`
	Capabilities      providers.CapabilitySet `json:"capabilities"`
	Languages         []string                `json:"languages,omitempty"`
	Voices            []TTSEngineVoice        `json:"voices,omitempty"`
	EstimatedVRAM     string                  `json:"estimatedVram,omitempty"`
	ModelCache        string                  `json:"modelCache,omitempty"`
	Reason            string                  `json:"reason,omitempty"`
	Setup             string                  `json:"setup,omitempty"`
	Metadata          map[string]string       `json:"metadata,omitempty"`
}

type ResearchModuleDiagnostics struct {
	ID                  string   `json:"id"`
	Label               string   `json:"label"`
	RepoURL             string   `json:"repoUrl"`
	Ref                 string   `json:"ref"`
	LocalPath           string   `json:"localPath"`
	EngineID            string   `json:"engineId,omitempty"`
	Status              string   `json:"status"`
	Installed           bool     `json:"installed"`
	RuntimeReady        bool     `json:"runtimeReady"`
	MissingDependencies []string `json:"missingDependencies,omitempty"`
	CloneAllowed        bool     `json:"cloneAllowed"`
	Prompt              bool     `json:"prompt"`
	Reason              string   `json:"reason,omitempty"`
	Setup               string   `json:"setup,omitempty"`
	SetupCommand        string   `json:"setupCommand,omitempty"`
}

type ProjectBundleContentItem struct {
	Key            string `json:"key"`
	Label          string `json:"label"`
	Detail         string `json:"detail,omitempty"`
	Included       bool   `json:"included"`
	Required       bool   `json:"required"`
	EstimatedBytes int64  `json:"estimatedBytes,omitempty"`
}

type ProjectBundleConflict struct {
	Key         string             `json:"key"`
	Label       string             `json:"label"`
	Detail      string             `json:"detail"`
	Severity    string             `json:"severity"`
	Blocking    bool               `json:"blocking"`
	Resolutions []BundleImportMode `json:"resolutions,omitempty"`
}

type ProjectBundleDependency struct {
	Key             string `json:"key"`
	Label           string `json:"label"`
	Detail          string `json:"detail"`
	Status          string `json:"status"`
	CurrentVersion  string `json:"currentVersion,omitempty"`
	RequiredVersion string `json:"requiredVersion,omitempty"`
	Missing         bool   `json:"missing,omitempty"`
}

type ProjectBundleValidationItem struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Detail   string `json:"detail"`
	Status   string `json:"status"`
	Blocking bool   `json:"blocking,omitempty"`
}

type ProjectBundleSummary struct {
	ProjectID              string                     `json:"projectId"`
	ProjectName            string                     `json:"projectName"`
	Version                string                     `json:"version"`
	FileName               string                     `json:"fileName"`
	EstimatedBytes         int64                      `json:"estimatedBytes"`
	ChapterCount           int                        `json:"chapterCount"`
	ProfileCount           int                        `json:"profileCount"`
	GeneratedAudio         int                        `json:"generatedAudio"`
	GeneratedAudioIncluded bool                       `json:"generatedAudioIncluded"`
	OmittedGeneratedAudio  int                        `json:"omittedGeneratedAudio,omitempty"`
	OmittedGeneratedBytes  int64                      `json:"omittedGeneratedBytes,omitempty"`
	DurationMS             int                        `json:"durationMs"`
	Contents               []ProjectBundleContentItem `json:"contents"`
	Excluded               []ProjectBundleContentItem `json:"excluded,omitempty"`
	Warnings               []string                   `json:"warnings,omitempty"`
	CreatedAt              time.Time                  `json:"createdAt"`
}

type ProjectBundleFile struct {
	Role   string `json:"role"`
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256,omitempty"`
}

type ProjectBundleManifest struct {
	Version                string                     `json:"version"`
	CreatedAt              time.Time                  `json:"createdAt"`
	AppVersion             string                     `json:"appVersion"`
	Project                VoiceProject               `json:"project"`
	Jobs                   []VoiceJob                 `json:"jobs"`
	Profiles               []VoiceProfile             `json:"profiles"`
	Books                  []BookSource               `json:"books,omitempty"`
	Files                  []ProjectBundleFile        `json:"files"`
	ProviderVersions       map[string]string          `json:"providerVersions,omitempty"`
	Quality                ProjectBundleQuality       `json:"quality"`
	Hashes                 map[string]string          `json:"hashes,omitempty"`
	Contents               []ProjectBundleContentItem `json:"contents,omitempty"`
	Excluded               []ProjectBundleContentItem `json:"excluded,omitempty"`
	GeneratedAudioIncluded bool                       `json:"generatedAudioIncluded"`
	OmittedGeneratedAudio  int                        `json:"omittedGeneratedAudio,omitempty"`
	OmittedGeneratedBytes  int64                      `json:"omittedGeneratedBytes,omitempty"`
}

type ProjectBundleQuality struct {
	OverallScore        int     `json:"overallScore"`
	AverageLikeness     float64 `json:"averageLikeness,omitempty"`
	CheckerConfidence   float64 `json:"checkerConfidence,omitempty"`
	GeneratedDurationMS int     `json:"generatedDurationMs"`
	WarningCount        int     `json:"warningCount"`
}

type ProjectBundlePreview struct {
	Valid                bool                          `json:"valid"`
	Version              string                        `json:"version,omitempty"`
	ProjectName          string                        `json:"projectName,omitempty"`
	ChapterCount         int                           `json:"chapterCount,omitempty"`
	ProfileCount         int                           `json:"profileCount,omitempty"`
	GeneratedAudio       int                           `json:"generatedAudio,omitempty"`
	EstimatedBytes       int64                         `json:"estimatedBytes,omitempty"`
	Quality              ProjectBundleQuality          `json:"quality"`
	Compatibility        []string                      `json:"compatibility"`
	Warnings             []string                      `json:"warnings,omitempty"`
	Errors               []string                      `json:"errors,omitempty"`
	Manifest             *ProjectBundleManifest        `json:"manifest,omitempty"`
	Contents             []ProjectBundleContentItem    `json:"contents,omitempty"`
	Excluded             []ProjectBundleContentItem    `json:"excluded,omitempty"`
	Conflicts            []ProjectBundleConflict       `json:"conflicts,omitempty"`
	Dependencies         []ProjectBundleDependency     `json:"dependencies,omitempty"`
	Validation           []ProjectBundleValidationItem `json:"validation,omitempty"`
	AvailableImportModes []BundleImportMode            `json:"availableImportModes,omitempty"`
	RecommendedMode      BundleImportMode              `json:"recommendedMode,omitempty"`
}

type BundleImportMode string

const (
	BundleImportModeCopy    BundleImportMode = "copy"
	BundleImportModeMerge   BundleImportMode = "merge"
	BundleImportModeReplace BundleImportMode = "replace"
)

type ProjectBundleImportRequest struct {
	Mode      BundleImportMode `json:"mode"`
	ProjectID string           `json:"projectId,omitempty"`
}

type ProjectBundleImportResult struct {
	Project  VoiceProject   `json:"project"`
	Jobs     []VoiceJob     `json:"jobs"`
	Profiles []VoiceProfile `json:"profiles"`
	Warnings []string       `json:"warnings,omitempty"`
}

type ProgressBookmark struct {
	ID              string           `json:"id"`
	Label           string           `json:"label,omitempty"`
	CurrentTimeSec  float64          `json:"currentTimeSec"`
	ActiveWordIndex int              `json:"activeWordIndex,omitempty"`
	ReadingPosition *ReadingPosition `json:"readingPosition,omitempty"`
	CreatedAt       time.Time        `json:"createdAt"`
}

type ReadingPosition struct {
	BookSourceID      string                     `json:"bookSourceId,omitempty"`
	TemporarySourceID string                     `json:"temporarySourceId,omitempty"`
	ScopeKey          string                     `json:"scopeKey,omitempty"`
	ActiveWordIndex   int                        `json:"activeWordIndex,omitempty"`
	NodeID            string                     `json:"nodeId,omitempty"`
	Locator           *contentir.Locator         `json:"locator,omitempty"`
	LocatorEnvelope   *contentir.LocatorEnvelope `json:"locatorEnvelope,omitempty"`
	TextQuote         string                     `json:"textQuote,omitempty"`
}

type PlaybackProgress struct {
	TargetID          string             `json:"targetId"`
	ProjectID         string             `json:"projectId,omitempty"`
	JobID             string             `json:"jobId,omitempty"`
	BookSourceID      string             `json:"bookSourceId,omitempty"`
	PreparedSourceID  string             `json:"preparedSourceId,omitempty"`
	TemporarySourceID string             `json:"temporarySourceId,omitempty"`
	BookScope         *BookScope         `json:"bookScope,omitempty"`
	CurrentTimeSec    float64            `json:"currentTimeSec"`
	Progress          float64            `json:"progress"`
	ActiveWordIndex   int                `json:"activeWordIndex,omitempty"`
	ReadingPosition   *ReadingPosition   `json:"readingPosition,omitempty"`
	Finished          bool               `json:"finished"`
	Hidden            bool               `json:"hidden"`
	Bookmarks         []ProgressBookmark `json:"bookmarks,omitempty"`
	StartedAt         *time.Time         `json:"startedAt,omitempty"`
	FinishedAt        *time.Time         `json:"finishedAt,omitempty"`
	CreatedAt         time.Time          `json:"createdAt"`
	UpdatedAt         time.Time          `json:"updatedAt"`
}

type PlaybackProgressUpdate struct {
	TargetID          string            `json:"targetId,omitempty"`
	ProjectID         string            `json:"projectId,omitempty"`
	JobID             string            `json:"jobId,omitempty"`
	BookSourceID      string            `json:"bookSourceId,omitempty"`
	PreparedSourceID  string            `json:"preparedSourceId,omitempty"`
	TemporarySourceID string            `json:"temporarySourceId,omitempty"`
	BookScope         *BookScope        `json:"bookScope,omitempty"`
	CurrentTimeSec    float64           `json:"currentTimeSec"`
	DurationSec       float64           `json:"durationSec,omitempty"`
	Progress          float64           `json:"progress,omitempty"`
	ActiveWordIndex   int               `json:"activeWordIndex,omitempty"`
	ReadingPosition   *ReadingPosition  `json:"readingPosition,omitempty"`
	Finished          bool              `json:"finished,omitempty"`
	Hidden            *bool             `json:"hidden,omitempty"`
	AddBookmark       *ProgressBookmark `json:"addBookmark,omitempty"`
}

type DurableProgressKind string

const (
	DurableProgressKindResume    DurableProgressKind = "resume"
	DurableProgressKindBookmark  DurableProgressKind = "bookmark"
	DurableProgressKindHighlight DurableProgressKind = "highlight"
)

type DurableProgressState string

const (
	DurableProgressStateCurrent              DurableProgressState = "current"
	DurableProgressStateDegraded             DurableProgressState = "degraded"
	DurableProgressStateStale                DurableProgressState = "stale"
	DurableProgressStateSuperseded           DurableProgressState = "superseded"
	DurableProgressStateFailed               DurableProgressState = "failed"
	DurableProgressStateInterruptedRetriable DurableProgressState = "interrupted_retriable"
	DurableProgressStateRemapped             DurableProgressState = "remapped"
)

type DurableProgressPosition struct {
	UnitID          string `json:"unitId"`
	SegmentID       string `json:"segmentId,omitempty"`
	ActiveWordIndex int    `json:"activeWordIndex,omitempty"`
	AudioOffsetMS   int    `json:"audioOffsetMs,omitempty"`
	TextQuote       string `json:"textQuote,omitempty"`
}

type DurableProgress struct {
	SchemaVersion       string                    `json:"schemaVersion"`
	ProgressID          string                    `json:"progressId"`
	SourceID            string                    `json:"sourceId"`
	ReadalongManifestID string                    `json:"readalongManifestId"`
	SourceRevisionID    string                    `json:"sourceRevisionId"`
	AudioArtifactID     string                    `json:"audioArtifactId,omitempty"`
	Kind                DurableProgressKind       `json:"kind"`
	State               DurableProgressState      `json:"state"`
	UpdatedAt           time.Time                 `json:"updatedAt"`
	Canonical           bool                      `json:"canonical"`
	LocatorEnvelope     contentir.LocatorEnvelope `json:"locatorEnvelope"`
	Position            DurableProgressPosition   `json:"position"`
	Metadata            map[string]any            `json:"metadata,omitempty"`
}

type ResumeDecision string

const (
	ResumeDecisionAutoResumeCurrent  ResumeDecision = "auto_resume_current"
	ResumeDecisionAutoResumeDegraded ResumeDecision = "auto_resume_degraded"
	ResumeDecisionResumeAudioOnly    ResumeDecision = "resume_audio_only"
	ResumeDecisionResumeSourceOnly   ResumeDecision = "resume_source_only"
	ResumeDecisionOfferRetry         ResumeDecision = "offer_retry"
	ResumeDecisionOfferOldVsRepaired ResumeDecision = "offer_old_vs_repaired"
	ResumeDecisionAutoResumeRemapped ResumeDecision = "auto_resume_remapped"
	ResumeDecisionBlockedFailed      ResumeDecision = "blocked_failed"
)

type ResumeResolution struct {
	SchemaVersion               string                    `json:"schemaVersion"`
	ResolutionID                string                    `json:"resolutionId"`
	ProgressID                  string                    `json:"progressId"`
	SourceID                    string                    `json:"sourceId"`
	RequestedAt                 time.Time                 `json:"requestedAt"`
	Decision                    ResumeDecision            `json:"decision"`
	Reason                      string                    `json:"reason"`
	ResolvedReadalongManifestID string                    `json:"resolvedReadalongManifestId"`
	ResolvedLocatorEnvelope     contentir.LocatorEnvelope `json:"resolvedLocatorEnvelope"`
	RevisionMapID               string                    `json:"revisionMapId,omitempty"`
	StaleProgressID             string                    `json:"staleProgressId,omitempty"`
	RetryArtifactID             string                    `json:"retryArtifactId,omitempty"`
	Offers                      []string                  `json:"offers,omitempty"`
	Metadata                    map[string]any            `json:"metadata,omitempty"`
}

type ResumeResolutionRequest struct {
	ProgressID            string
	SourceID              string
	SourceRevisionID      string
	ReadalongManifestID   string
	Kind                  DurableProgressKind
	RequestedAt           time.Time
	AudioArtifacts        []ResumeAudioArtifactEvidence
	SyncFidelityDecisions []SyncFidelityDecision
	RevisionMaps          []RevisionMap
}

type ResumeAudioArtifactEvidence struct {
	ArtifactID          string                      `json:"artifactId"`
	SourceID            string                      `json:"sourceId"`
	SourceRevisionID    string                      `json:"sourceRevisionId"`
	ReadalongManifestID string                      `json:"readalongManifestId"`
	UnitID              string                      `json:"unitId,omitempty"`
	SegmentID           string                      `json:"segmentId,omitempty"`
	CompatibilityKey    string                      `json:"compatibilityKey,omitempty"`
	State               AudioArtifactState          `json:"state"`
	Retry               *AudioArtifactRetryMetadata `json:"retry,omitempty"`
}

type RevisionMapCause string

const (
	RevisionMapCauseRepairOverlay        RevisionMapCause = "repair_overlay"
	RevisionMapCauseExtractionCorrection RevisionMapCause = "extraction_correction"
	RevisionMapCausePromotion            RevisionMapCause = "promotion"
)

type RevisionMapUnitMapping struct {
	FromUnitID string  `json:"fromUnitId"`
	ToUnitID   string  `json:"toUnitId"`
	Confidence float64 `json:"confidence"`
	Status     string  `json:"status,omitempty"`
}

type RevisionMapProgressMapping struct {
	FromProgressID string  `json:"fromProgressId"`
	ToProgressID   string  `json:"toProgressId"`
	Confidence     float64 `json:"confidence"`
}

type RevisionMapLocatorMapping struct {
	FromLocator         *contentir.Locator         `json:"fromLocator,omitempty"`
	ToLocator           *contentir.Locator         `json:"toLocator,omitempty"`
	FromLocatorEnvelope *contentir.LocatorEnvelope `json:"fromLocatorEnvelope,omitempty"`
	ToLocatorEnvelope   *contentir.LocatorEnvelope `json:"toLocatorEnvelope,omitempty"`
	Confidence          float64                    `json:"confidence"`
	Status              string                     `json:"status,omitempty"`
	TextQuote           string                     `json:"textQuote,omitempty"`
}

type RevisionMap struct {
	SchemaVersion        string                       `json:"schemaVersion"`
	RevisionMapID        string                       `json:"revisionMapId"`
	SourceID             string                       `json:"sourceId"`
	FromSourceRevisionID string                       `json:"fromSourceRevisionId"`
	ToSourceRevisionID   string                       `json:"toSourceRevisionId"`
	GeneratedAt          time.Time                    `json:"generatedAt"`
	Cause                RevisionMapCause             `json:"cause"`
	OverlayID            string                       `json:"overlayId,omitempty"`
	Confidence           float64                      `json:"confidence"`
	UnitMappings         []RevisionMapUnitMapping     `json:"unitMappings"`
	LocatorMappings      []RevisionMapLocatorMapping  `json:"locatorMappings,omitempty"`
	ProgressMappings     []RevisionMapProgressMapping `json:"progressMappings,omitempty"`
	Metadata             map[string]any               `json:"metadata,omitempty"`
}

type PlaybackSessionStatus string

const (
	PlaybackSessionStatusOpen   PlaybackSessionStatus = "open"
	PlaybackSessionStatusClosed PlaybackSessionStatus = "closed"
)

type PlaybackSession struct {
	ID                string                `json:"id"`
	TargetID          string                `json:"targetId"`
	ProjectID         string                `json:"projectId,omitempty"`
	JobID             string                `json:"jobId,omitempty"`
	BookSourceID      string                `json:"bookSourceId,omitempty"`
	PreparedSourceID  string                `json:"preparedSourceId,omitempty"`
	TemporarySourceID string                `json:"temporarySourceId,omitempty"`
	BookScope         *BookScope            `json:"bookScope,omitempty"`
	CurrentTimeSec    float64               `json:"currentTimeSec"`
	ActiveWordIndex   int                   `json:"activeWordIndex,omitempty"`
	ReadingPosition   *ReadingPosition      `json:"readingPosition,omitempty"`
	Status            PlaybackSessionStatus `json:"status"`
	StartedAt         time.Time             `json:"startedAt"`
	UpdatedAt         time.Time             `json:"updatedAt"`
	ClosedAt          *time.Time            `json:"closedAt,omitempty"`
}
