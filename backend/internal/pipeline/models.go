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
	Text             string                   `json:"text"`
	ProjectID        string                   `json:"projectId,omitempty"`
	BookSourceID     string                   `json:"bookSourceId,omitempty"`
	BookScope        *BookScope               `json:"bookScope,omitempty"`
	PreparedSourceID string                   `json:"preparedSourceId,omitempty"`
	SelectedBlockIDs []string                 `json:"selectedBlockIds,omitempty"`
	SourceKind       string                   `json:"sourceKind,omitempty"`
	ProgressTargetID string                   `json:"progressTargetId,omitempty"`
	VoiceProfileID   string                   `json:"voiceProfileId"`
	VoiceLanguage    string                   `json:"voiceLanguage"`
	TTSEngine        string                   `json:"ttsEngine,omitempty"`
	EngineOptions    map[string]string        `json:"engineOptions,omitempty"`
	TTSVoice         string                   `json:"ttsVoice,omitempty"`
	TTSLanguage      string                   `json:"ttsLanguage,omitempty"`
	AdaptiveMode     bool                     `json:"adaptiveMode"`
	RunMode          RunMode                  `json:"runMode,omitempty"`
	PerformanceMode  PerformanceMode          `json:"performanceMode,omitempty"`
	PipelineOptions  CreateJobPipelineOptions `json:"pipelineOptions,omitempty"`
}

type VoiceProject struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
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

type NarrationBlockKind string

const (
	NarrationBlockKindHeading     NarrationBlockKind = "heading"
	NarrationBlockKindSubheading  NarrationBlockKind = "subheading"
	NarrationBlockKindBody        NarrationBlockKind = "body"
	NarrationBlockKindQuote       NarrationBlockKind = "quote"
	NarrationBlockKindTable       NarrationBlockKind = "table"
	NarrationBlockKindCode        NarrationBlockKind = "code"
	NarrationBlockKindCitation    NarrationBlockKind = "citation"
	NarrationBlockKindFrontmatter NarrationBlockKind = "frontmatter"
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
	ID                  string             `json:"id"`
	Index               int                `json:"index"`
	Kind                NarrationBlockKind `json:"kind"`
	SpeakMode           NarrationSpeakMode `json:"speakMode"`
	Label               string             `json:"label,omitempty"`
	Text                string             `json:"text,omitempty"`
	SpokenText          string             `json:"spokenText,omitempty"`
	Emphasis            string             `json:"emphasis,omitempty"`
	PauseBeforeMS       int                `json:"pauseBeforeMs,omitempty"`
	PauseAfterMS        int                `json:"pauseAfterMs,omitempty"`
	StartOffset         int                `json:"startOffset"`
	EndOffset           int                `json:"endOffset"`
	EstimatedDurationMS int                `json:"estimatedDurationMs,omitempty"`
	Confidence          float64            `json:"confidence,omitempty"`
	Segments            []NarrationSegment `json:"segments,omitempty"`
	Warnings            []string           `json:"warnings,omitempty"`
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

type PreparedSource struct {
	ID                  string                `json:"id"`
	ProjectID           string                `json:"projectId"`
	Status              PreparedSourceStatus  `json:"status"`
	Kind                PreparedSourceKind    `json:"kind"`
	SourceName          string                `json:"sourceName"`
	SourceURL           string                `json:"sourceUrl,omitempty"`
	SourceContentType   string                `json:"sourceContentType,omitempty"`
	SourceBytes         int64                 `json:"sourceBytes,omitempty"`
	PreprocessorID      string                `json:"preprocessorId,omitempty"`
	PreprocessorVersion string                `json:"preprocessorVersion,omitempty"`
	SourceFormat        string                `json:"sourceFormat,omitempty"`
	RenderMode          string                `json:"renderMode,omitempty"`
	Title               string                `json:"title,omitempty"`
	Text                string                `json:"text,omitempty"`
	SpeechText          string                `json:"speechText,omitempty"`
	WordCount           int                   `json:"wordCount"`
	BlockCount          int                   `json:"blockCount"`
	SegmentCount        int                   `json:"segmentCount"`
	Summary             PreparedSourceSummary `json:"summary"`
	Blocks              []NarrationBlock      `json:"blocks,omitempty"`
	SkippedItems        []SkippedSourceItem   `json:"skippedItems,omitempty"`
	Warnings            []string              `json:"warnings,omitempty"`
	Error               string                `json:"error,omitempty"`
	CreatedAt           time.Time             `json:"createdAt"`
	UpdatedAt           time.Time             `json:"updatedAt"`
}

type CreatePreparedSourceRequest struct {
	Kind              PreparedSourceKind `json:"kind"`
	Text              string             `json:"text,omitempty"`
	URL               string             `json:"url,omitempty"`
	SourceName        string             `json:"sourceName,omitempty"`
	SourceContentType string             `json:"sourceContentType,omitempty"`
	SourceBytes       int64              `json:"sourceBytes,omitempty"`
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
	BookSourceKindPDF  BookSourceKind = "pdf"
	BookSourceKindEPUB BookSourceKind = "epub"
)

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
	ID               string               `json:"id"`
	ProjectID        string               `json:"projectId"`
	Status           BookSourceStatus     `json:"status"`
	Kind             BookSourceKind       `json:"kind"`
	SourceFile       string               `json:"sourceFile"`
	SourceBytes      int64                `json:"sourceBytes"`
	Title            string               `json:"title,omitempty"`
	Author           string               `json:"author,omitempty"`
	Text             string               `json:"text,omitempty"`
	WordCount        int                  `json:"wordCount"`
	PageCount        int                  `json:"pageCount"`
	ChapterCount     int                  `json:"chapterCount"`
	StructureVersion string               `json:"structureVersion,omitempty"`
	DefaultSectionID string               `json:"defaultSectionId,omitempty"`
	ReadingOrder     []string             `json:"readingOrder,omitempty"`
	Sections         []BookSourceSection  `json:"sections,omitempty"`
	Pages            []BookSourcePage     `json:"pages,omitempty"`
	Chapters         []BookSourceChapter  `json:"chapters,omitempty"`
	WordSpans        []BookSourceWordSpan `json:"wordSpans,omitempty"`
	Warnings         []string             `json:"warnings,omitempty"`
	Error            string               `json:"error,omitempty"`
	CreatedAt        time.Time            `json:"createdAt"`
	UpdatedAt        time.Time            `json:"updatedAt"`
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
	PDFExtractor             string `json:"pdfExtractor"`
	PDFExtractorAvailable    bool   `json:"pdfExtractorAvailable"`
	PDFStrict                bool   `json:"pdfStrict"`
	PDFSetup                 string `json:"pdfSetup,omitempty"`
	PDFToTextAvailable       bool   `json:"pdftotextAvailable"`
	PythonFallbackAvailable  bool   `json:"pythonFallbackAvailable"`
	PythonFallbackConfigured bool   `json:"pythonFallbackConfigured"`
	PythonPath               string `json:"pythonPath,omitempty"`
	PythonScript             string `json:"pythonScript,omitempty"`
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

type TTSEngineVoice struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Gender      string `json:"gender,omitempty"`
	Description string `json:"description,omitempty"`
}

type TTSEngineDiagnostics struct {
	ID                string            `json:"id"`
	Label             string            `json:"label"`
	Status            string            `json:"status"`
	Default           bool              `json:"default"`
	Local             bool              `json:"local"`
	Experimental      bool              `json:"experimental"`
	SupportsVoice     bool              `json:"supportsVoice"`
	SupportsReference bool              `json:"supportsReference"`
	SupportsSwedish   bool              `json:"supportsSwedish"`
	Languages         []string          `json:"languages,omitempty"`
	Voices            []TTSEngineVoice  `json:"voices,omitempty"`
	EstimatedVRAM     string            `json:"estimatedVram,omitempty"`
	ModelCache        string            `json:"modelCache,omitempty"`
	Reason            string            `json:"reason,omitempty"`
	Setup             string            `json:"setup,omitempty"`
	Metadata          map[string]string `json:"metadata,omitempty"`
}

type ProjectBundleContentItem struct {
	Key            string `json:"key"`
	Label          string `json:"label"`
	Included       bool   `json:"included"`
	Required       bool   `json:"required"`
	EstimatedBytes int64  `json:"estimatedBytes,omitempty"`
}

type ProjectBundleSummary struct {
	ProjectID      string                     `json:"projectId"`
	ProjectName    string                     `json:"projectName"`
	Version        string                     `json:"version"`
	FileName       string                     `json:"fileName"`
	EstimatedBytes int64                      `json:"estimatedBytes"`
	ChapterCount   int                        `json:"chapterCount"`
	ProfileCount   int                        `json:"profileCount"`
	GeneratedAudio int                        `json:"generatedAudio"`
	DurationMS     int                        `json:"durationMs"`
	Contents       []ProjectBundleContentItem `json:"contents"`
	Warnings       []string                   `json:"warnings,omitempty"`
	CreatedAt      time.Time                  `json:"createdAt"`
}

type ProjectBundleFile struct {
	Role   string `json:"role"`
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256,omitempty"`
}

type ProjectBundleManifest struct {
	Version          string               `json:"version"`
	CreatedAt        time.Time            `json:"createdAt"`
	AppVersion       string               `json:"appVersion"`
	Project          VoiceProject         `json:"project"`
	Jobs             []VoiceJob           `json:"jobs"`
	Profiles         []VoiceProfile       `json:"profiles"`
	Books            []BookSource         `json:"books,omitempty"`
	Files            []ProjectBundleFile  `json:"files"`
	ProviderVersions map[string]string    `json:"providerVersions,omitempty"`
	Quality          ProjectBundleQuality `json:"quality"`
	Hashes           map[string]string    `json:"hashes,omitempty"`
}

type ProjectBundleQuality struct {
	OverallScore        int     `json:"overallScore"`
	AverageLikeness     float64 `json:"averageLikeness,omitempty"`
	CheckerConfidence   float64 `json:"checkerConfidence,omitempty"`
	GeneratedDurationMS int     `json:"generatedDurationMs"`
	WarningCount        int     `json:"warningCount"`
}

type ProjectBundlePreview struct {
	Valid          bool                   `json:"valid"`
	Version        string                 `json:"version,omitempty"`
	ProjectName    string                 `json:"projectName,omitempty"`
	ChapterCount   int                    `json:"chapterCount,omitempty"`
	ProfileCount   int                    `json:"profileCount,omitempty"`
	GeneratedAudio int                    `json:"generatedAudio,omitempty"`
	EstimatedBytes int64                  `json:"estimatedBytes,omitempty"`
	Quality        ProjectBundleQuality   `json:"quality"`
	Compatibility  []string               `json:"compatibility"`
	Warnings       []string               `json:"warnings,omitempty"`
	Errors         []string               `json:"errors,omitempty"`
	Manifest       *ProjectBundleManifest `json:"manifest,omitempty"`
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
	ID              string    `json:"id"`
	Label           string    `json:"label,omitempty"`
	CurrentTimeSec  float64   `json:"currentTimeSec"`
	ActiveWordIndex int       `json:"activeWordIndex,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
}

type PlaybackProgress struct {
	TargetID         string             `json:"targetId"`
	ProjectID        string             `json:"projectId"`
	JobID            string             `json:"jobId,omitempty"`
	BookSourceID     string             `json:"bookSourceId,omitempty"`
	PreparedSourceID string             `json:"preparedSourceId,omitempty"`
	BookScope        *BookScope         `json:"bookScope,omitempty"`
	CurrentTimeSec   float64            `json:"currentTimeSec"`
	Progress         float64            `json:"progress"`
	ActiveWordIndex  int                `json:"activeWordIndex,omitempty"`
	Finished         bool               `json:"finished"`
	Hidden           bool               `json:"hidden"`
	Bookmarks        []ProgressBookmark `json:"bookmarks,omitempty"`
	StartedAt        *time.Time         `json:"startedAt,omitempty"`
	FinishedAt       *time.Time         `json:"finishedAt,omitempty"`
	CreatedAt        time.Time          `json:"createdAt"`
	UpdatedAt        time.Time          `json:"updatedAt"`
}

type PlaybackProgressUpdate struct {
	TargetID         string            `json:"targetId,omitempty"`
	ProjectID        string            `json:"projectId,omitempty"`
	JobID            string            `json:"jobId,omitempty"`
	BookSourceID     string            `json:"bookSourceId,omitempty"`
	PreparedSourceID string            `json:"preparedSourceId,omitempty"`
	BookScope        *BookScope        `json:"bookScope,omitempty"`
	CurrentTimeSec   float64           `json:"currentTimeSec"`
	DurationSec      float64           `json:"durationSec,omitempty"`
	Progress         float64           `json:"progress,omitempty"`
	ActiveWordIndex  int               `json:"activeWordIndex,omitempty"`
	Finished         bool              `json:"finished,omitempty"`
	Hidden           *bool             `json:"hidden,omitempty"`
	AddBookmark      *ProgressBookmark `json:"addBookmark,omitempty"`
}

type PlaybackSessionStatus string

const (
	PlaybackSessionStatusOpen   PlaybackSessionStatus = "open"
	PlaybackSessionStatusClosed PlaybackSessionStatus = "closed"
)

type PlaybackSession struct {
	ID               string                `json:"id"`
	TargetID         string                `json:"targetId"`
	ProjectID        string                `json:"projectId"`
	JobID            string                `json:"jobId,omitempty"`
	BookSourceID     string                `json:"bookSourceId,omitempty"`
	PreparedSourceID string                `json:"preparedSourceId,omitempty"`
	BookScope        *BookScope            `json:"bookScope,omitempty"`
	CurrentTimeSec   float64               `json:"currentTimeSec"`
	ActiveWordIndex  int                   `json:"activeWordIndex,omitempty"`
	Status           PlaybackSessionStatus `json:"status"`
	StartedAt        time.Time             `json:"startedAt"`
	UpdatedAt        time.Time             `json:"updatedAt"`
	ClosedAt         *time.Time            `json:"closedAt,omitempty"`
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
	BookSourceID            string            `json:"bookSourceId,omitempty"`
	BookScope               *BookScope        `json:"bookScope,omitempty"`
	PreparedSourceID        string            `json:"preparedSourceId,omitempty"`
	SelectedBlockIDs        []string          `json:"selectedBlockIds,omitempty"`
	SourceKind              string            `json:"sourceKind,omitempty"`
	ProgressTargetID        string            `json:"progressTargetId,omitempty"`
	Status                  JobStatus         `json:"status"`
	Stages                  PipelineStages    `json:"stages"`
	AdaptiveMode            bool              `json:"adaptiveMode"`
	RunMode                 RunMode           `json:"runMode"`
	PerformanceMode         PerformanceMode   `json:"performanceMode"`
	PipelineOptions         PipelineOptions   `json:"pipelineOptions"`
	VoiceProfileID          string            `json:"voiceProfileId,omitempty"`
	VoiceProfileName        string            `json:"voiceProfileName,omitempty"`
	VoiceProfileLanguage    string            `json:"voiceProfileLanguage,omitempty"`
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
