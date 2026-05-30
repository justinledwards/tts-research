package pipeline

import (
	"time"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
	"github.com/justinedwards/tts-research/backend/internal/audio"
	"github.com/justinedwards/tts-research/backend/internal/highlightmap"
	"github.com/justinedwards/tts-research/backend/internal/policy"
)

type RunMode string

const (
	RunModeDraftPreview  RunMode = "draftPreview"
	RunModeFastCreate    RunMode = "fastCreate"
	RunModeCheckedMaster RunMode = "checkedMaster"
	RunModePublishMaster RunMode = "publishMaster"
)

type PerformanceMode string

const (
	PerformanceModeBalanced   PerformanceMode = "balanced"
	PerformanceModeThroughput PerformanceMode = "throughput"
	PerformanceModeQuality    PerformanceMode = "quality"
)

type CreateJobPipelineOptions struct {
	TextPreprocess  *bool `json:"textPreprocess,omitempty"`
	VoiceClone      *bool `json:"voiceClone,omitempty"`
	ASRCheck        *bool `json:"asrCheck,omitempty"`
	AutoRetry       *bool `json:"autoRetry,omitempty"`
	ArrivalPlayback *bool `json:"arrivalPlayback,omitempty"`
	QualityReport   *bool `json:"qualityReport,omitempty"`
}

type PipelineOptions struct {
	TextPreprocess  bool `json:"textPreprocess"`
	VoiceClone      bool `json:"voiceClone"`
	ASRCheck        bool `json:"asrCheck"`
	AutoRetry       bool `json:"autoRetry"`
	ArrivalPlayback bool `json:"arrivalPlayback"`
	QualityReport   bool `json:"qualityReport"`
}

type JobQualityReport struct {
	Enabled              bool    `json:"enabled"`
	PreprocessChangedPct float64 `json:"preprocessChangedPct"`
	RetryCount           int     `json:"retryCount"`
	AverageSimilarity    float64 `json:"averageSimilarity"`
	AverageLatencyMS     int     `json:"averageLatencyMs"`
	SegmentCount         int     `json:"segmentCount"`
	ReferenceProfile     bool    `json:"referenceProfile"`
	Reason               string  `json:"reason"`
}

type JobSegment struct {
	Index      int     `json:"index"`
	Text       string  `json:"text"`
	Status     string  `json:"status,omitempty"`
	Attempts   int     `json:"attempts,omitempty"`
	DurationMS int     `json:"durationMs,omitempty"`
	LatencyMS  int     `json:"latencyMs,omitempty"`
	Similarity float64 `json:"similarity,omitempty"`
	Reason     string  `json:"reason,omitempty"`
}

type VoiceProfileStatus string

const (
	VoiceProfileStatusReady   VoiceProfileStatus = "ready"
	VoiceProfileStatusError   VoiceProfileStatus = "error"
	VoiceProfileStatusPending VoiceProfileStatus = "pending"
)

type VoiceProfileSourceStatus string

const (
	VoiceProfileSourceStatusQueued      VoiceProfileSourceStatus = "queued"
	VoiceProfileSourceStatusNormalizing VoiceProfileSourceStatus = "normalizing"
	VoiceProfileSourceStatusAnalyzing   VoiceProfileSourceStatus = "analyzing"
	VoiceProfileSourceStatusScoring     VoiceProfileSourceStatus = "scoring"
	VoiceProfileSourceStatusReady       VoiceProfileSourceStatus = "ready"
	VoiceProfileSourceStatusFailed      VoiceProfileSourceStatus = "failed"
	VoiceProfileSourceStatusCancelled   VoiceProfileSourceStatus = "cancelled"
)

type VoiceProfileReferenceSpan struct {
	StartMS    int     `json:"startMs"`
	EndMS      int     `json:"endMs"`
	DurationMS int     `json:"durationMs"`
	Score      float64 `json:"score"`
}

type VoiceProfileQualityMetrics struct {
	CleanSpeech             float64 `json:"cleanSpeech"`
	SingleSpeakerConfidence float64 `json:"singleSpeakerConfidence"`
	UsableDurationMS        int     `json:"usableDurationMs"`
	ClippingRisk            float64 `json:"clippingRisk"`
	NoiseRisk               float64 `json:"noiseRisk"`
	NoiseRiskBefore         float64 `json:"noiseRiskBefore,omitempty"`
	NoiseRiskAfter          float64 `json:"noiseRiskAfter,omitempty"`
	SilenceRatio            float64 `json:"silenceRatio"`
	SourceCoverage          float64 `json:"sourceCoverage"`
}

type VoiceProfileDenoiseMetadata struct {
	Provider        string   `json:"provider"`
	Strength        string   `json:"strength"`
	Applied         bool     `json:"applied"`
	RawAudio        string   `json:"rawAudio,omitempty"`
	CleanAudio      string   `json:"cleanAudio,omitempty"`
	RawPath         string   `json:"rawPath,omitempty"`
	CleanPath       string   `json:"cleanPath,omitempty"`
	NoiseRiskBefore float64  `json:"noiseRiskBefore,omitempty"`
	NoiseRiskAfter  float64  `json:"noiseRiskAfter,omitempty"`
	SNRBeforeDB     float64  `json:"snrBeforeDb,omitempty"`
	SNRAfterDB      float64  `json:"snrAfterDb,omitempty"`
	Warnings        []string `json:"warnings,omitempty"`
	Reason          string   `json:"reason,omitempty"`
}

type VoiceProfileLikeness struct {
	Status            string     `json:"status"`
	Score             float64    `json:"score,omitempty"`
	SpeakerSimilarity float64    `json:"speakerSimilarity,omitempty"`
	EmbeddingModel    string     `json:"embeddingModel,omitempty"`
	CalibrationText   string     `json:"calibrationText,omitempty"`
	MeasuredAt        *time.Time `json:"measuredAt,omitempty"`
	Reason            string     `json:"reason,omitempty"`
}

type VoiceProfileTargetStatus string

const (
	VoiceProfileTargetStatusSelected   VoiceProfileTargetStatus = "selected"
	VoiceProfileTargetStatusQueued     VoiceProfileTargetStatus = "queued"
	VoiceProfileTargetStatusBuilding   VoiceProfileTargetStatus = "building"
	VoiceProfileTargetStatusValidating VoiceProfileTargetStatus = "validating"
	VoiceProfileTargetStatusReady      VoiceProfileTargetStatus = "ready"
	VoiceProfileTargetStatusFailed     VoiceProfileTargetStatus = "failed"
	VoiceProfileTargetStatusCancelled  VoiceProfileTargetStatus = "cancelled"
)

type VoiceProfileTargetValidation struct {
	Status               VoiceProfileTargetStatus `json:"status"`
	Score                float64                  `json:"score,omitempty"`
	SpeakerSimilarity    float64                  `json:"speakerSimilarity,omitempty"`
	TranscriptSimilarity float64                  `json:"transcriptSimilarity,omitempty"`
	GeneratedAudio       string                   `json:"generatedAudio,omitempty"`
	GeneratedPath        string                   `json:"generatedPath,omitempty"`
	ExpectedTranscript   string                   `json:"expectedTranscript,omitempty"`
	ASRTranscript        string                   `json:"asrTranscript,omitempty"`
	Provider             string                   `json:"provider,omitempty"`
	Model                string                   `json:"model,omitempty"`
	MeasuredAt           *time.Time               `json:"measuredAt,omitempty"`
	Error                string                   `json:"error,omitempty"`
}

type VoiceProfileTarget struct {
	ID         string                        `json:"id"`
	Label      string                        `json:"label,omitempty"`
	EngineID   string                        `json:"engineId,omitempty"`
	ModuleID   string                        `json:"moduleId,omitempty"`
	Status     VoiceProfileTargetStatus      `json:"status"`
	Selected   bool                          `json:"selected"`
	Validation *VoiceProfileTargetValidation `json:"validation,omitempty"`
	CreatedAt  time.Time                     `json:"createdAt"`
	UpdatedAt  time.Time                     `json:"updatedAt"`
	Error      string                        `json:"error,omitempty"`
	Metadata   map[string]string             `json:"metadata,omitempty"`
}

type VoiceProfileCloneArtifactStatus string

const (
	VoiceProfileCloneArtifactStatusPending   VoiceProfileCloneArtifactStatus = "pending"
	VoiceProfileCloneArtifactStatusBuilding  VoiceProfileCloneArtifactStatus = "building"
	VoiceProfileCloneArtifactStatusReady     VoiceProfileCloneArtifactStatus = "ready"
	VoiceProfileCloneArtifactStatusFailed    VoiceProfileCloneArtifactStatus = "failed"
	VoiceProfileCloneArtifactStatusCancelled VoiceProfileCloneArtifactStatus = "cancelled"
)

type VoiceProfileCloneArtifact struct {
	ModuleID     string                          `json:"moduleId"`
	EngineID     string                          `json:"engineId,omitempty"`
	Kind         string                          `json:"kind,omitempty"`
	Status       VoiceProfileCloneArtifactStatus `json:"status"`
	File         string                          `json:"file,omitempty"`
	Path         string                          `json:"path,omitempty"`
	Loss         float64                         `json:"loss,omitempty"`
	Score        float64                         `json:"score,omitempty"`
	Steps        int                             `json:"steps,omitempty"`
	BaseStyle    string                          `json:"baseStyle,omitempty"`
	UpstreamRef  string                          `json:"upstreamRef,omitempty"`
	ModelVersion string                          `json:"modelVersion,omitempty"`
	Metadata     map[string]string               `json:"metadata,omitempty"`
	CreatedAt    time.Time                       `json:"createdAt"`
	UpdatedAt    time.Time                       `json:"updatedAt"`
	Error        string                          `json:"error,omitempty"`
}

type VoiceProfileCandidate struct {
	ID                      string                       `json:"id"`
	SpeakerID               string                       `json:"speakerId"`
	SuggestedName           string                       `json:"suggestedName"`
	Status                  string                       `json:"status"`
	Rank                    int                          `json:"rank,omitempty"`
	Recommended             bool                         `json:"recommended,omitempty"`
	Suitability             string                       `json:"suitability,omitempty"`
	Warnings                []string                     `json:"warnings,omitempty"`
	Reason                  string                       `json:"reason,omitempty"`
	PreviewAudio            string                       `json:"previewAudio,omitempty"`
	PreviewPath             string                       `json:"previewPath,omitempty"`
	RawPreviewAudio         string                       `json:"rawPreviewAudio,omitempty"`
	RawPreviewPath          string                       `json:"rawPreviewPath,omitempty"`
	CleanPreviewAudio       string                       `json:"cleanPreviewAudio,omitempty"`
	CleanPreviewPath        string                       `json:"cleanPreviewPath,omitempty"`
	ReferenceAudio          string                       `json:"referenceAudio,omitempty"`
	ReferencePath           string                       `json:"referencePath,omitempty"`
	ReferenceDurationMS     int                          `json:"referenceDurationMs"`
	ReferenceVersion        string                       `json:"referenceVersion"`
	ReferenceSampleStrategy string                       `json:"referenceSampleStrategy"`
	StrategyVersion         string                       `json:"strategyVersion"`
	ModelVersion            string                       `json:"modelVersion,omitempty"`
	Score                   float64                      `json:"score"`
	TotalSpeechDurationMS   int                          `json:"totalSpeechDurationMs"`
	ReferenceSpanCount      int                          `json:"referenceSpanCount,omitempty"`
	Spans                   []VoiceProfileReferenceSpan  `json:"spans"`
	QualityMetrics          VoiceProfileQualityMetrics   `json:"qualityMetrics"`
	Denoise                 *VoiceProfileDenoiseMetadata `json:"denoise,omitempty"`
	TranscriptMetadata      *TranscriptMetadata          `json:"transcriptMetadata,omitempty"`
	Transcript              string                       `json:"transcript,omitempty"`
	TranscriptGeneratedAt   *time.Time                   `json:"transcriptGeneratedAt,omitempty"`
	TranscriptModel         string                       `json:"transcriptModel,omitempty"`
	TranscriptError         string                       `json:"transcriptError,omitempty"`
	TranscriptConfidence    float64                      `json:"transcriptConfidence,omitempty"`
	CreatedAt               time.Time                    `json:"createdAt"`
	UpdatedAt               time.Time                    `json:"updatedAt"`
}

type VoiceProfileSourceStage struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type VoiceProfileSource struct {
	ID                    string                       `json:"id"`
	Status                VoiceProfileSourceStatus     `json:"status"`
	SourceFile            string                       `json:"sourceFile"`
	SourceBytes           int64                        `json:"sourceBytes"`
	SourceDurationMS      int                          `json:"sourceDurationMs,omitempty"`
	NormalizedAudio       string                       `json:"normalizedAudio,omitempty"`
	NormalizedPath        string                       `json:"normalizedPath,omitempty"`
	CleanedAudio          string                       `json:"cleanedAudio,omitempty"`
	CleanedPath           string                       `json:"cleanedPath,omitempty"`
	Denoise               *VoiceProfileDenoiseMetadata `json:"denoise,omitempty"`
	AudioFormat           string                       `json:"audioFormat"`
	ProgressMessage       string                       `json:"progressMessage"`
	ProgressDetail        string                       `json:"progressDetail,omitempty"`
	Error                 string                       `json:"error,omitempty"`
	Stages                []VoiceProfileSourceStage    `json:"stages"`
	Candidates            []VoiceProfileCandidate      `json:"candidates"`
	TranscriptMetadata    *TranscriptMetadata          `json:"transcriptMetadata,omitempty"`
	Transcript            string                       `json:"transcript,omitempty"`
	TranscriptGeneratedAt *time.Time                   `json:"transcriptGeneratedAt,omitempty"`
	TranscriptModel       string                       `json:"transcriptModel,omitempty"`
	TranscriptError       string                       `json:"transcriptError,omitempty"`
	TranscriptConfidence  float64                      `json:"transcriptConfidence,omitempty"`
	StrategyVersion       string                       `json:"strategyVersion"`
	ModelVersion          string                       `json:"modelVersion,omitempty"`
	CreatedAt             time.Time                    `json:"createdAt"`
	UpdatedAt             time.Time                    `json:"updatedAt"`
}

type VoiceProfile struct {
	ID                      string                               `json:"id"`
	Name                    string                               `json:"name"`
	Language                string                               `json:"language"`
	SourceFile              string                               `json:"sourceFile"`
	SourceBytes             int64                                `json:"sourceBytes"`
	SourceID                string                               `json:"sourceId,omitempty"`
	SpeakerID               string                               `json:"speakerId,omitempty"`
	SpeakerName             string                               `json:"speakerName,omitempty"`
	SourceDurationMS        int                                  `json:"sourceDurationMs,omitempty"`
	ReferenceAudio          string                               `json:"referenceAudio"`
	ReferencePath           string                               `json:"referencePath"`
	ReferenceDurationMS     int                                  `json:"referenceDurationMs,omitempty"`
	ReferenceTrimmed        bool                                 `json:"referenceTrimmed"`
	ReferenceSampleStrategy string                               `json:"referenceSampleStrategy,omitempty"`
	ReferenceVersion        string                               `json:"referenceVersion,omitempty"`
	ReferenceScore          float64                              `json:"referenceScore,omitempty"`
	ReferenceSpans          []VoiceProfileReferenceSpan          `json:"referenceSpans,omitempty"`
	QualityMetrics          *VoiceProfileQualityMetrics          `json:"qualityMetrics,omitempty"`
	Denoise                 *VoiceProfileDenoiseMetadata         `json:"denoise,omitempty"`
	Likeness                *VoiceProfileLikeness                `json:"likeness,omitempty"`
	CloneTargets            map[string]VoiceProfileTarget        `json:"cloneTargets,omitempty"`
	CloneArtifacts          map[string]VoiceProfileCloneArtifact `json:"cloneArtifacts,omitempty"`
	AudioFormat             string                               `json:"audioFormat"`
	Status                  VoiceProfileStatus                   `json:"status"`
	Error                   string                               `json:"error,omitempty"`
	DurationMS              int                                  `json:"durationMs"`
	CreatedAt               time.Time                            `json:"createdAt"`
	UpdatedAt               time.Time                            `json:"updatedAt"`
	ReferenceSamples        string                               `json:"referenceSamples,omitempty"`
}

type RetryMetadata struct {
	MaxRetries      int `json:"maxRetries"`
	Attempts        int `json:"attempts"`
	SegmentAttempts int `json:"segmentAttempts"`
	CurrentSegment  int `json:"currentSegment"`
	TotalSegments   int `json:"totalSegments"`
}

type PipelineStages struct {
	Optimization StageStatus `json:"optimization"`
	Synthesis    StageStatus `json:"synthesis"`
	Checker      StageStatus `json:"checker"`
}

type VoiceCheck struct {
	Complete    bool    `json:"complete"`
	Transcript  string  `json:"transcript"`
	ResumeText  string  `json:"resumeText,omitempty"`
	NeedsResume bool    `json:"needsResume"`
	Reason      string  `json:"reason"`
	Provider    string  `json:"provider"`
	Similarity  float64 `json:"similarity"`
}

type JobProgress struct {
	Message        string     `json:"message"`
	Detail         string     `json:"detail"`
	ActiveStage    string     `json:"activeStage"`
	CurrentSegment int        `json:"currentSegment,omitempty"`
	TotalSegments  int        `json:"totalSegments,omitempty"`
	StartedAt      *time.Time `json:"startedAt,omitempty"`
}

type AlignmentOptions struct {
	Enabled                  bool                     `json:"enabled"`
	Mode                     alignment.AlignmentMode  `json:"mode,omitempty"`
	Preferred                []alignment.TimingSource `json:"preferred,omitempty"`
	MFABin                   string                   `json:"mfaBin,omitempty"`
	MFADictionary            string                   `json:"mfaDictionary,omitempty"`
	MFAAcousticModel         string                   `json:"mfaAcousticModel,omitempty"`
	AeneasPython             string                   `json:"aeneasPython,omitempty"`
	GentleURL                string                   `json:"gentleUrl,omitempty"`
	TimeoutSeconds           int                      `json:"timeoutSeconds,omitempty"`
	RequiredForWordHighlight bool                     `json:"requiredForWordHighlight,omitempty"`
}

type TimingArtifacts struct {
	Status              string                            `json:"status"`
	Summary             highlightmap.Summary              `json:"summary"`
	HighlightMapURL     string                            `json:"highlightMapUrl,omitempty"`
	HighlightMapV2URL   string                            `json:"highlightMapV2Url,omitempty"`
	FragmentTimingURL   string                            `json:"fragmentTimingUrl,omitempty"`
	TokenTimingURL      string                            `json:"tokenTimingUrl,omitempty"`
	AlignmentQualityURL string                            `json:"alignmentQualityUrl,omitempty"`
	FragmentTiming      *alignment.FragmentTimingArtifact `json:"fragmentTiming,omitempty"`
	TokenTiming         *alignment.TokenTimingArtifact    `json:"tokenTiming,omitempty"`
	AlignmentQuality    *alignment.AlignmentQualityReport `json:"alignmentQuality,omitempty"`
}

type VoiceJob struct {
	ID                      string            `json:"id"`
	ProjectID               string            `json:"projectId"`
	BookSourceID            string            `json:"bookSourceId,omitempty"`
	BookScope               *BookScope        `json:"bookScope,omitempty"`
	PreparedSourceID        string            `json:"preparedSourceId,omitempty"`
	SelectedBlockIDs        []string          `json:"selectedBlockIds,omitempty"`
	SourceKind              string            `json:"sourceKind,omitempty"`
	ProgressTargetID        string            `json:"progressTargetId,omitempty"`
	SpeechPolicyProfile     string            `json:"speechPolicyProfile,omitempty"`
	SpeechPolicyOverrides   policy.Overrides  `json:"speechPolicyOverrides,omitempty"`
	Locale                  string            `json:"locale,omitempty"`
	SpeechRenderApplied     bool              `json:"speechRenderApplied,omitempty"`
	Status                  JobStatus         `json:"status"`
	Stages                  PipelineStages    `json:"stages"`
	AdaptiveMode            bool              `json:"adaptiveMode"`
	RunMode                 RunMode           `json:"runMode"`
	PerformanceMode         PerformanceMode   `json:"performanceMode"`
	PipelineOptions         PipelineOptions   `json:"pipelineOptions"`
	VoiceProfileID          string            `json:"voiceProfileId,omitempty"`
	VoiceProfileName        string            `json:"voiceProfileName,omitempty"`
	VoiceProfileLanguage    string            `json:"voiceProfileLanguage,omitempty"`
	VoiceID                 string            `json:"voiceId,omitempty"`
	TTSEngine               string            `json:"ttsEngine,omitempty"`
	EngineOptions           map[string]string `json:"engineOptions,omitempty"`
	TTSVoice                string            `json:"ttsVoice,omitempty"`
	TTSLanguage             string            `json:"ttsLanguage,omitempty"`
	InputText               string            `json:"inputText"`
	OptimizedText           string            `json:"optimizedText"`
	Segments                []JobSegment      `json:"segments,omitempty"`
	SegmentationWarnings    []string          `json:"segmentationWarnings,omitempty"`
	Optimizer               string            `json:"optimizer"`
	AudioURL                string            `json:"audioUrl"`
	AudioPartialURL         string            `json:"audioPartialUrl,omitempty"`
	AudioPath               string            `json:"audioPath,omitempty"`
	AudioReadySegments      int               `json:"audioReadySegments,omitempty"`
	AudioSegmentDurationsMS []int             `json:"audioSegmentDurationsMs,omitempty"`
	AudioSegmentLatenciesMS []int             `json:"audioSegmentLatenciesMs,omitempty"`
	Timing                  *TimingArtifacts  `json:"timing,omitempty"`
	ContentType             string            `json:"contentType"`
	DurationMS              int               `json:"durationMs"`
	Provider                string            `json:"provider"`
	Voice                   string            `json:"voice"`
	Retries                 RetryMetadata     `json:"retries"`
	VoiceCheck              VoiceCheck        `json:"voiceCheck"`
	QualityReport           *JobQualityReport `json:"qualityReport,omitempty"`
	Progress                JobProgress       `json:"progress"`
	Error                   string            `json:"error,omitempty"`
	TerminalReason          JobTerminalReason `json:"terminalReason,omitempty"`
	Retriable               bool              `json:"retriable,omitempty"`
	CreatedAt               time.Time         `json:"createdAt"`
	UpdatedAt               time.Time         `json:"updatedAt"`
	CompletedAt             *time.Time        `json:"completedAt,omitempty"`
}

type storedJob struct {
	VoiceJob
	audio              []byte
	audioSegments      [][]byte
	audioPartialPCM    []byte
	audioPartialSpec   audio.WAVSpec
	audioPartialReady  bool
	nativeTimingEvents []alignment.NativeTimingEvent
}
