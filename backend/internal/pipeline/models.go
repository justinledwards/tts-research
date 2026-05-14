package pipeline

import (
	"time"

	"github.com/justinedwards/tts-research/backend/internal/audio"
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

type StageStatus string

const (
	StageStatusWaiting StageStatus = "waiting"
	StageStatusRunning StageStatus = "running"
	StageStatusDone    StageStatus = "done"
	StageStatusFailed  StageStatus = "failed"
)

type CreateJobRequest struct {
	Text            string                   `json:"text"`
	ProjectID       string                   `json:"projectId,omitempty"`
	VoiceProfileID  string                   `json:"voiceProfileId"`
	VoiceLanguage   string                   `json:"voiceLanguage"`
	TTSVoice        string                   `json:"ttsVoice,omitempty"`
	TTSLanguage     string                   `json:"ttsLanguage,omitempty"`
	AdaptiveMode    bool                     `json:"adaptiveMode"`
	RunMode         RunMode                  `json:"runMode,omitempty"`
	PerformanceMode PerformanceMode          `json:"performanceMode,omitempty"`
	PipelineOptions CreateJobPipelineOptions `json:"pipelineOptions,omitempty"`
}

type VoiceProject struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

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
	CreatedAt               time.Time                    `json:"createdAt"`
	UpdatedAt               time.Time                    `json:"updatedAt"`
}

type VoiceProfileSourceStage struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type VoiceProfileSource struct {
	ID               string                       `json:"id"`
	Status           VoiceProfileSourceStatus     `json:"status"`
	SourceFile       string                       `json:"sourceFile"`
	SourceBytes      int64                        `json:"sourceBytes"`
	SourceDurationMS int                          `json:"sourceDurationMs,omitempty"`
	NormalizedAudio  string                       `json:"normalizedAudio,omitempty"`
	NormalizedPath   string                       `json:"normalizedPath,omitempty"`
	CleanedAudio     string                       `json:"cleanedAudio,omitempty"`
	CleanedPath      string                       `json:"cleanedPath,omitempty"`
	Denoise          *VoiceProfileDenoiseMetadata `json:"denoise,omitempty"`
	AudioFormat      string                       `json:"audioFormat"`
	ProgressMessage  string                       `json:"progressMessage"`
	ProgressDetail   string                       `json:"progressDetail,omitempty"`
	Error            string                       `json:"error,omitempty"`
	Stages           []VoiceProfileSourceStage    `json:"stages"`
	Candidates       []VoiceProfileCandidate      `json:"candidates"`
	StrategyVersion  string                       `json:"strategyVersion"`
	ModelVersion     string                       `json:"modelVersion,omitempty"`
	CreatedAt        time.Time                    `json:"createdAt"`
	UpdatedAt        time.Time                    `json:"updatedAt"`
}

type VoiceProfile struct {
	ID                      string                       `json:"id"`
	Name                    string                       `json:"name"`
	Language                string                       `json:"language"`
	SourceFile              string                       `json:"sourceFile"`
	SourceBytes             int64                        `json:"sourceBytes"`
	SourceID                string                       `json:"sourceId,omitempty"`
	SpeakerID               string                       `json:"speakerId,omitempty"`
	SpeakerName             string                       `json:"speakerName,omitempty"`
	SourceDurationMS        int                          `json:"sourceDurationMs,omitempty"`
	ReferenceAudio          string                       `json:"referenceAudio"`
	ReferencePath           string                       `json:"referencePath"`
	ReferenceDurationMS     int                          `json:"referenceDurationMs,omitempty"`
	ReferenceTrimmed        bool                         `json:"referenceTrimmed"`
	ReferenceSampleStrategy string                       `json:"referenceSampleStrategy,omitempty"`
	ReferenceVersion        string                       `json:"referenceVersion,omitempty"`
	ReferenceScore          float64                      `json:"referenceScore,omitempty"`
	ReferenceSpans          []VoiceProfileReferenceSpan  `json:"referenceSpans,omitempty"`
	QualityMetrics          *VoiceProfileQualityMetrics  `json:"qualityMetrics,omitempty"`
	Denoise                 *VoiceProfileDenoiseMetadata `json:"denoise,omitempty"`
	Likeness                *VoiceProfileLikeness        `json:"likeness,omitempty"`
	AudioFormat             string                       `json:"audioFormat"`
	Status                  VoiceProfileStatus           `json:"status"`
	Error                   string                       `json:"error,omitempty"`
	DurationMS              int                          `json:"durationMs"`
	CreatedAt               time.Time                    `json:"createdAt"`
	UpdatedAt               time.Time                    `json:"updatedAt"`
	ReferenceSamples        string                       `json:"referenceSamples,omitempty"`
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

type VoiceJob struct {
	ID                      string            `json:"id"`
	ProjectID               string            `json:"projectId"`
	Status                  JobStatus         `json:"status"`
	Stages                  PipelineStages    `json:"stages"`
	AdaptiveMode            bool              `json:"adaptiveMode"`
	RunMode                 RunMode           `json:"runMode"`
	PerformanceMode         PerformanceMode   `json:"performanceMode"`
	PipelineOptions         PipelineOptions   `json:"pipelineOptions"`
	VoiceProfileID          string            `json:"voiceProfileId,omitempty"`
	VoiceProfileName        string            `json:"voiceProfileName,omitempty"`
	VoiceProfileLanguage    string            `json:"voiceProfileLanguage,omitempty"`
	TTSVoice                string            `json:"ttsVoice,omitempty"`
	TTSLanguage             string            `json:"ttsLanguage,omitempty"`
	InputText               string            `json:"inputText"`
	OptimizedText           string            `json:"optimizedText"`
	Segments                []JobSegment      `json:"segments,omitempty"`
	Optimizer               string            `json:"optimizer"`
	AudioURL                string            `json:"audioUrl"`
	AudioPartialURL         string            `json:"audioPartialUrl,omitempty"`
	AudioPath               string            `json:"audioPath,omitempty"`
	AudioReadySegments      int               `json:"audioReadySegments,omitempty"`
	AudioSegmentDurationsMS []int             `json:"audioSegmentDurationsMs,omitempty"`
	AudioSegmentLatenciesMS []int             `json:"audioSegmentLatenciesMs,omitempty"`
	ContentType             string            `json:"contentType"`
	DurationMS              int               `json:"durationMs"`
	Provider                string            `json:"provider"`
	Voice                   string            `json:"voice"`
	Retries                 RetryMetadata     `json:"retries"`
	VoiceCheck              VoiceCheck        `json:"voiceCheck"`
	QualityReport           *JobQualityReport `json:"qualityReport,omitempty"`
	Progress                JobProgress       `json:"progress"`
	Error                   string            `json:"error,omitempty"`
	CreatedAt               time.Time         `json:"createdAt"`
	UpdatedAt               time.Time         `json:"updatedAt"`
	CompletedAt             *time.Time        `json:"completedAt,omitempty"`
}

type storedJob struct {
	VoiceJob
	audio             []byte
	audioSegments     [][]byte
	audioPartialPCM   []byte
	audioPartialSpec  audio.WAVSpec
	audioPartialReady bool
}
