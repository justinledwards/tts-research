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

type StageStatus string

const (
	StageStatusWaiting StageStatus = "waiting"
	StageStatusRunning StageStatus = "running"
	StageStatusDone    StageStatus = "done"
	StageStatusFailed  StageStatus = "failed"
)

type CreateJobRequest struct {
	Text                  string                   `json:"text"`
	VoiceID               string                   `json:"voiceId,omitempty"`
	ProjectID             string                   `json:"projectId,omitempty"`
	BookSourceID          string                   `json:"bookSourceId,omitempty"`
	BookScope             *BookScope               `json:"bookScope,omitempty"`
	PreparedSourceID      string                   `json:"preparedSourceId,omitempty"`
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
	Status                      PreparedSourceStatus  `json:"status"`
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
	Status                      BookSourceStatus      `json:"status"`
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
	ID              string           `json:"id"`
	Label           string           `json:"label,omitempty"`
	CurrentTimeSec  float64          `json:"currentTimeSec"`
	ActiveWordIndex int              `json:"activeWordIndex,omitempty"`
	ReadingPosition *ReadingPosition `json:"readingPosition,omitempty"`
	CreatedAt       time.Time        `json:"createdAt"`
}

type ReadingPosition struct {
	BookSourceID    string                     `json:"bookSourceId,omitempty"`
	ScopeKey        string                     `json:"scopeKey,omitempty"`
	ActiveWordIndex int                        `json:"activeWordIndex,omitempty"`
	NodeID          string                     `json:"nodeId,omitempty"`
	Locator         *contentir.Locator         `json:"locator,omitempty"`
	LocatorEnvelope *contentir.LocatorEnvelope `json:"locatorEnvelope,omitempty"`
	TextQuote       string                     `json:"textQuote,omitempty"`
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
	ReadingPosition  *ReadingPosition   `json:"readingPosition,omitempty"`
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
	ReadingPosition  *ReadingPosition  `json:"readingPosition,omitempty"`
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
	ReadingPosition  *ReadingPosition      `json:"readingPosition,omitempty"`
	Status           PlaybackSessionStatus `json:"status"`
	StartedAt        time.Time             `json:"startedAt"`
	UpdatedAt        time.Time             `json:"updatedAt"`
	ClosedAt         *time.Time            `json:"closedAt,omitempty"`
}
