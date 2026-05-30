package pipeline

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/alignment"
	"github.com/justinedwards/tts-research/backend/internal/audio"
)

var (
	ErrEmptyText                   = errors.New("text is required")
	ErrJobNotFound                 = errors.New("voice job not found")
	ErrVoiceNotFound               = errors.New("voice not found")
	ErrInvalidVoice                = errors.New("voice upload is invalid")
	ErrProfileNotFound             = errors.New("voice profile not found")
	ErrAudioNotReady               = errors.New("voice job audio is not ready")
	ErrRetryExhaust                = errors.New("voice checker did not confirm complete audio before retry limit")
	ErrProfileTooLarge             = errors.New("voice profile upload exceeds allowed size")
	ErrProfileExtractionFailed     = errors.New("unable to extract voice profile audio")
	ErrProfileMissingAudio         = errors.New("voice profile has no reference audio")
	ErrProfileUnsupported          = errors.New("tts engine does not support reference voice synthesis")
	ErrProfileArtifactMissing      = errors.New("voice profile clone artifact is not ready")
	ErrProfileArtifactUnsupported  = errors.New("voice profile clone artifact module is not supported")
	ErrProfileSourceNotFound       = errors.New("voice profile source not found")
	ErrProfileCandidateNotFound    = errors.New("voice profile candidate not found")
	ErrProfileAnalysisUnavailable  = errors.New("voice profile source analysis is not configured")
	ErrProjectNotFound             = errors.New("project not found")
	ErrProjectProtected            = errors.New("default project cannot be deleted")
	ErrBookSourceNotFound          = errors.New("book source not found")
	ErrPreparedSourceNotFound      = errors.New("prepared source not found")
	ErrContentIRNotFound           = errors.New("content IR not found")
	ErrSpeechPolicyProfileNotFound = errors.New("speech policy profile not found")
	ErrProgressNotFound            = errors.New("playback progress not found")
	ErrPlaybackSessionNotFound     = errors.New("playback session not found")
	ErrProjectBundleInvalid        = errors.New("project bundle is invalid")
	ErrResearchModuleNotFound      = errors.New("research module not found")
	ErrResearchModuleUnavailable   = errors.New("research module is not installed")
)

type VoiceOptimizer interface {
	Optimize(context.Context, string) (string, error)
}

type StreamingVoiceOptimizer interface {
	OptimizeStream(context.Context, string, func(string)) (string, error)
}

type namedVoiceOptimizer interface {
	ProviderName() string
}

type TTSAgent interface {
	Synthesize(context.Context, string) (agents.TTSResult, error)
}

type TTSWithVoice interface {
	SynthesizeWithVoice(context.Context, string, string, string) (agents.TTSResult, error)
}

type TTSWithReference interface {
	SynthesizeWithReference(context.Context, string, string, string) (agents.TTSResult, error)
}

type TTSWithSSML interface {
	SynthesizeSSML(context.Context, string, string, string, string) (agents.TTSResult, error)
}

type TTSWithProfileArtifact interface {
	SynthesizeWithProfileArtifact(context.Context, string, agents.VoiceProfileArtifact, string) (agents.TTSResult, error)
}

type TTSEngineRegistration struct {
	ID          string
	Agent       TTSAgent
	Diagnostics TTSEngineDiagnostics
}

type VoiceProfileLikenessScorer interface {
	ScoreVoiceProfileLikeness(context.Context, VoiceProfileLikenessRequest) (VoiceProfileLikenessResult, error)
}

type VoiceProfileLikenessRequest struct {
	ReferencePath string
	GeneratedPath string
	Model         string
	Token         string
}

type VoiceProfileLikenessResult struct {
	Score             float64
	SpeakerSimilarity float64
	EmbeddingModel    string
	Reason            string
}

type VoiceChecker interface {
	Check(context.Context, string, []byte) (agents.VoiceCheckResult, error)
}

type Options struct {
	MaxRetries                           int
	SegmentMaxRunes                      int
	SegmentWorkers                       int
	StudioSegmentMaxRunes                int
	StudioSegmentWorkers                 int
	StudioSegmentWorkersAdaptive         int
	StudioSegmentMaxRunesAdaptive        int
	SourcePrepSentenceMaxRunes           int
	ReferenceWorkerCount                 int
	JobDataDir                           string
	ProjectDataDir                       string
	BookSourceDir                        string
	SourcePrepDir                        string
	ProgressDataDir                      string
	PlaybackSessionDir                   string
	VoiceDataDir                         string
	FFMPEGPath                           string
	SourceURLAllowPrivate                bool
	BookPDFPythonPath                    string
	BookPDFExtractorScriptPath           string
	BookPDFRequireTextExtractor          bool
	VoiceProfileDir                      string
	VoiceProfileSourceDir                string
	MaxProfileBytes                      int64
	VoiceProfileReferenceMinSeconds      int
	VoiceProfileReferenceTargetSeconds   int
	VoiceProfileReferenceMaxSeconds      int
	VoiceProfileDiarizationModel         string
	VoiceProfileDiarizationModelPath     string
	VoiceProfileDiarizationLocalModelDir string
	VoiceProfileDiarizationToken         string
	VoiceProfileCredentialsPath          string
	VoiceProfileAnalysisPythonPath       string
	VoiceProfileAnalysisScriptPath       string
	VoiceProfileAnalysisStrategyVersion  string
	VoiceProfileSourceAnalyzer           VoiceProfileSourceAnalyzer
	VoiceProfileDenoiseProvider          string
	VoiceProfileDenoiseStrength          string
	VoiceProfileEmbeddingModel           string
	VoiceProfileEmbeddingScriptPath      string
	VoiceProfileLikenessCalibrationText  string
	VoiceProfileLikenessTimeoutSeconds   int
	VoiceProfileLikenessScorer           VoiceProfileLikenessScorer
	VoiceProfileArtifactPythonPath       string
	VoiceProfileArtifactScriptPath       string
	VoiceProfileArtifactTimeoutSeconds   int
	VoiceProfileArtifactSteps            int
	ResearchModules                      []ResearchModuleConfig
	ResearchModulePromptDisabled         bool
	ResearchModuleCloneTimeoutSeconds    int
	Alignment                            AlignmentOptions
	DefaultTTSEngine                     string
	TTSEngines                           []TTSEngineRegistration
}

const (
	defaultSegmentMaxRunes                     = 300
	defaultSegmentWorkers                      = 2
	defaultStudioSegmentMaxRunes               = 220
	defaultStudioSegmentWorkers                = 4
	defaultStudioAdaptiveSegmentWorkers        = 6
	defaultStudioAdaptiveSegmentMaxRunes       = 180
	defaultSourcePrepSentenceMaxRunes          = 420
	defaultJobDataDir                          = "./data/jobs"
	defaultProjectDataDir                      = "./data/projects"
	defaultBookSourceDir                       = "./data/book-sources"
	defaultSourcePrepDir                       = "./data/source-preps"
	defaultProgressDataDir                     = "./data/progress"
	defaultPlaybackSessionDir                  = "./data/playback-sessions"
	defaultVoiceDataDir                        = "./data/voices"
	defaultFFMPEGPath                          = "ffmpeg"
	defaultBookPDFPythonPath                   = "./.venv/bin/python"
	defaultBookPDFExtractorScriptPath          = "./adapters/pdf/cli.py"
	defaultVoiceProfileDir                     = "./data/voice-profiles"
	defaultVoiceProfileSourceDir               = "./data/voice-profile-sources"
	defaultMaxProfileBytes                     = 0
	defaultVoiceProfileReferenceMinSeconds     = 20
	defaultVoiceProfileReferenceTargetSeconds  = 45
	defaultVoiceProfileReferenceMaxSeconds     = 60
	defaultVoiceProfileDiarizationModel        = "pyannote/speaker-diarization-community-1"
	defaultVoiceProfileCredentialsPath         = "./data/local-credentials/huggingface.json"
	defaultVoiceProfileAnalysisPythonPath      = "python3"
	defaultVoiceProfileAnalysisScriptPath      = "./scripts/profile_analyze.py"
	defaultVoiceProfileAnalysisStrategyVersion = "speaker-aware-v1"
	defaultVoiceProfileDenoiseProvider         = "ffmpeg"
	defaultVoiceProfileDenoiseStrength         = "balanced"
	defaultVoiceProfileEmbeddingModel          = "pyannote/embedding"
	defaultVoiceProfileEmbeddingScriptPath     = "./scripts/profile_likeness.py"
	defaultVoiceProfileLikenessCalibrationText = "This is a short voice clone calibration sample for measuring speaker likeness."
	defaultVoiceProfileLikenessTimeoutSeconds  = 120
	defaultVoiceProfileArtifactPythonPath      = "./.venv-voice-embed/bin/python"
	defaultVoiceProfileArtifactScriptPath      = "./scripts/profile_embed_artifact.py"
	defaultVoiceProfileArtifactTimeoutSeconds  = 3600
	defaultResearchModuleCloneTimeoutSeconds   = 180
)

type storedVoiceProfile struct {
	VoiceProfile
}

type storedBookSource struct {
	BookSource
}

type Service struct {
	optimizer     VoiceOptimizer
	tts           TTSAgent
	ttsEngines    map[string]TTSEngineRegistration
	defaultTTS    string
	checker       VoiceChecker
	options       Options
	mu            sync.RWMutex
	jobs          map[string]storedJob
	projects      map[string]VoiceProject
	books         map[string]storedBookSource
	sourcePreps   map[string]PreparedSource
	progress      map[string]PlaybackProgress
	sessions      map[string]PlaybackSession
	profiles      map[string]storedVoiceProfile
	sources       map[string]storedVoiceProfileSource
	voices        map[string]Voice
	jobCancels    map[string]context.CancelFunc
	jobDone       map[string]chan struct{}
	sourceCancels map[string]context.CancelFunc
	targetCancels map[string]context.CancelFunc
}

type resolvedJobConfig struct {
	runMode         RunMode
	performanceMode PerformanceMode
	pipelineOptions PipelineOptions
}

func resolveJobConfig(request CreateJobRequest) resolvedJobConfig {
	runMode := request.RunMode
	switch runMode {
	case RunModeDraftPreview, RunModeFastCreate, RunModeCheckedMaster, RunModePublishMaster:
	default:
		runMode = RunModeCheckedMaster
	}

	performanceMode := request.PerformanceMode
	switch performanceMode {
	case PerformanceModeBalanced, PerformanceModeThroughput, PerformanceModeQuality:
	default:
		if request.AdaptiveMode {
			performanceMode = PerformanceModeThroughput
		} else if runMode == RunModePublishMaster {
			performanceMode = PerformanceModeQuality
		} else {
			performanceMode = PerformanceModeBalanced
		}
	}

	options := defaultsForRunMode(runMode)
	options.TextPreprocess = boolOption(request.PipelineOptions.TextPreprocess, options.TextPreprocess)
	options.VoiceClone = boolOption(request.PipelineOptions.VoiceClone, options.VoiceClone)
	options.ASRCheck = boolOption(request.PipelineOptions.ASRCheck, options.ASRCheck)
	options.AutoRetry = boolOption(request.PipelineOptions.AutoRetry, options.AutoRetry)
	options.ArrivalPlayback = boolOption(request.PipelineOptions.ArrivalPlayback, options.ArrivalPlayback)
	options.QualityReport = boolOption(request.PipelineOptions.QualityReport, options.QualityReport)

	return resolvedJobConfig{
		runMode:         runMode,
		performanceMode: performanceMode,
		pipelineOptions: options,
	}
}

func defaultsForRunMode(runMode RunMode) PipelineOptions {
	switch runMode {
	case RunModeDraftPreview:
		return PipelineOptions{
			TextPreprocess:  true,
			VoiceClone:      false,
			ASRCheck:        false,
			AutoRetry:       false,
			ArrivalPlayback: true,
			QualityReport:   false,
		}
	case RunModeFastCreate:
		return PipelineOptions{
			TextPreprocess:  true,
			VoiceClone:      true,
			ASRCheck:        false,
			AutoRetry:       false,
			ArrivalPlayback: true,
			QualityReport:   true,
		}
	case RunModePublishMaster:
		return PipelineOptions{
			TextPreprocess:  true,
			VoiceClone:      true,
			ASRCheck:        true,
			AutoRetry:       true,
			ArrivalPlayback: true,
			QualityReport:   true,
		}
	default:
		return PipelineOptions{
			TextPreprocess:  true,
			VoiceClone:      true,
			ASRCheck:        true,
			AutoRetry:       true,
			ArrivalPlayback: true,
			QualityReport:   true,
		}
	}
}

func boolOption(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

func resolvedConfigFromJob(job VoiceJob) resolvedJobConfig {
	if job.RunMode == "" {
		return resolveJobConfig(CreateJobRequest{AdaptiveMode: job.AdaptiveMode})
	}
	performanceMode := job.PerformanceMode
	if performanceMode == "" {
		if job.AdaptiveMode {
			performanceMode = PerformanceModeThroughput
		} else {
			performanceMode = PerformanceModeBalanced
		}
	}
	options := job.PipelineOptions
	if options == (PipelineOptions{}) {
		options = defaultsForRunMode(job.RunMode)
	}
	return resolvedJobConfig{
		runMode:         job.RunMode,
		performanceMode: performanceMode,
		pipelineOptions: options,
	}
}

func NewService(optimizer VoiceOptimizer, tts TTSAgent, checker VoiceChecker, options Options) *Service {
	requestedStudioSegmentWorkers := options.StudioSegmentWorkers
	if options.MaxRetries <= 0 {
		options.MaxRetries = 3
	}
	if options.SegmentMaxRunes <= 0 {
		options.SegmentMaxRunes = defaultSegmentMaxRunes
	}
	if options.SegmentWorkers <= 0 {
		options.SegmentWorkers = defaultSegmentWorkers
	}
	if options.StudioSegmentWorkers <= 0 {
		options.StudioSegmentWorkers = options.SegmentWorkers
		if options.StudioSegmentWorkers < defaultStudioSegmentWorkers {
			options.StudioSegmentWorkers = defaultStudioSegmentWorkers
		}
	}
	if options.StudioSegmentMaxRunes <= 0 {
		options.StudioSegmentMaxRunes = options.SegmentMaxRunes
		if options.StudioSegmentMaxRunes > defaultStudioSegmentMaxRunes {
			options.StudioSegmentMaxRunes = defaultStudioSegmentMaxRunes
		}
	}
	if options.StudioSegmentWorkersAdaptive <= 0 {
		if requestedStudioSegmentWorkers > 0 {
			options.StudioSegmentWorkersAdaptive = options.StudioSegmentWorkers * 2
		} else {
			options.StudioSegmentWorkersAdaptive = defaultStudioAdaptiveSegmentWorkers
		}
	}
	if options.StudioSegmentMaxRunesAdaptive <= 0 {
		options.StudioSegmentMaxRunesAdaptive = options.StudioSegmentMaxRunes
		if options.StudioSegmentMaxRunesAdaptive > defaultStudioAdaptiveSegmentMaxRunes {
			options.StudioSegmentMaxRunesAdaptive = defaultStudioAdaptiveSegmentMaxRunes
		}
	}
	if options.SourcePrepSentenceMaxRunes <= 0 {
		options.SourcePrepSentenceMaxRunes = defaultSourcePrepSentenceMaxRunes
	}
	if strings.TrimSpace(options.JobDataDir) == "" {
		options.JobDataDir = defaultJobDataDir
	}
	if strings.TrimSpace(options.ProjectDataDir) == "" {
		options.ProjectDataDir = defaultProjectDataDir
	}
	if strings.TrimSpace(options.BookSourceDir) == "" {
		options.BookSourceDir = defaultBookSourceDir
	}
	if strings.TrimSpace(options.SourcePrepDir) == "" {
		options.SourcePrepDir = defaultSourcePrepDir
	}
	if strings.TrimSpace(options.ProgressDataDir) == "" {
		options.ProgressDataDir = defaultProgressDataDir
	}
	if strings.TrimSpace(options.PlaybackSessionDir) == "" {
		options.PlaybackSessionDir = defaultPlaybackSessionDir
	}
	if strings.TrimSpace(options.VoiceDataDir) == "" {
		options.VoiceDataDir = defaultVoiceDataDir
	}
	if strings.TrimSpace(options.FFMPEGPath) == "" {
		options.FFMPEGPath = defaultFFMPEGPath
	}
	if strings.TrimSpace(options.BookPDFPythonPath) == "" {
		options.BookPDFPythonPath = defaultBookPDFPythonPath
	}
	if strings.TrimSpace(options.BookPDFExtractorScriptPath) == "" {
		options.BookPDFExtractorScriptPath = defaultBookPDFExtractorScriptPath
	}
	if strings.TrimSpace(options.VoiceProfileDir) == "" {
		options.VoiceProfileDir = defaultVoiceProfileDir
	}
	if strings.TrimSpace(options.VoiceProfileSourceDir) == "" {
		options.VoiceProfileSourceDir = defaultVoiceProfileSourceDir
	}
	if options.MaxProfileBytes < 0 {
		options.MaxProfileBytes = defaultMaxProfileBytes
	}
	if options.VoiceProfileReferenceMinSeconds <= 0 {
		options.VoiceProfileReferenceMinSeconds = defaultVoiceProfileReferenceMinSeconds
	}
	if options.VoiceProfileReferenceTargetSeconds <= 0 {
		options.VoiceProfileReferenceTargetSeconds = defaultVoiceProfileReferenceTargetSeconds
	}
	if options.VoiceProfileReferenceMaxSeconds <= 0 {
		options.VoiceProfileReferenceMaxSeconds = defaultVoiceProfileReferenceMaxSeconds
	}
	if options.VoiceProfileReferenceTargetSeconds < options.VoiceProfileReferenceMinSeconds {
		options.VoiceProfileReferenceTargetSeconds = options.VoiceProfileReferenceMinSeconds
	}
	if strings.TrimSpace(options.VoiceProfileDiarizationModel) == "" {
		options.VoiceProfileDiarizationModel = defaultVoiceProfileDiarizationModel
	}
	if strings.TrimSpace(options.VoiceProfileCredentialsPath) == "" {
		options.VoiceProfileCredentialsPath = defaultVoiceProfileCredentialsPath
	}
	if strings.TrimSpace(options.VoiceProfileAnalysisPythonPath) == "" {
		options.VoiceProfileAnalysisPythonPath = defaultVoiceProfileAnalysisPythonPath
	}
	if strings.TrimSpace(options.VoiceProfileAnalysisScriptPath) == "" {
		options.VoiceProfileAnalysisScriptPath = defaultVoiceProfileAnalysisScriptPath
	}
	if strings.TrimSpace(options.VoiceProfileAnalysisStrategyVersion) == "" {
		options.VoiceProfileAnalysisStrategyVersion = defaultVoiceProfileAnalysisStrategyVersion
	}
	if strings.TrimSpace(options.VoiceProfileDenoiseProvider) == "" {
		options.VoiceProfileDenoiseProvider = defaultVoiceProfileDenoiseProvider
	}
	if strings.TrimSpace(options.VoiceProfileDenoiseStrength) == "" {
		options.VoiceProfileDenoiseStrength = defaultVoiceProfileDenoiseStrength
	}
	if strings.TrimSpace(options.VoiceProfileEmbeddingModel) == "" {
		options.VoiceProfileEmbeddingModel = defaultVoiceProfileEmbeddingModel
	}
	if strings.TrimSpace(options.VoiceProfileEmbeddingScriptPath) == "" {
		options.VoiceProfileEmbeddingScriptPath = defaultVoiceProfileEmbeddingScriptPath
	}
	if strings.TrimSpace(options.VoiceProfileLikenessCalibrationText) == "" {
		options.VoiceProfileLikenessCalibrationText = defaultVoiceProfileLikenessCalibrationText
	}
	if options.VoiceProfileLikenessTimeoutSeconds <= 0 {
		options.VoiceProfileLikenessTimeoutSeconds = defaultVoiceProfileLikenessTimeoutSeconds
	}
	if strings.TrimSpace(options.VoiceProfileArtifactPythonPath) == "" {
		options.VoiceProfileArtifactPythonPath = defaultVoiceProfileArtifactPythonPath
	}
	if strings.TrimSpace(options.VoiceProfileArtifactScriptPath) == "" {
		options.VoiceProfileArtifactScriptPath = defaultVoiceProfileArtifactScriptPath
	}
	if options.VoiceProfileArtifactTimeoutSeconds <= 0 {
		options.VoiceProfileArtifactTimeoutSeconds = defaultVoiceProfileArtifactTimeoutSeconds
	}
	if options.ResearchModuleCloneTimeoutSeconds <= 0 {
		options.ResearchModuleCloneTimeoutSeconds = defaultResearchModuleCloneTimeoutSeconds
	}
	if len(options.ResearchModules) == 0 {
		options.ResearchModules = defaultResearchModuleConfigs()
	} else {
		options.ResearchModules = normalizeResearchModuleConfigs(options.ResearchModules)
	}
	if options.VoiceProfileSourceAnalyzer == nil {
		options.VoiceProfileSourceAnalyzer = newPythonProfileSourceAnalyzer(options)
	}
	if options.VoiceProfileLikenessScorer == nil {
		options.VoiceProfileLikenessScorer = newPythonProfileLikenessScorer(options)
	}
	defaultTTS, ttsEngines := initializeTTSEngines(options.DefaultTTSEngine, tts, options.TTSEngines)

	service := &Service{
		optimizer:     optimizer,
		tts:           tts,
		ttsEngines:    ttsEngines,
		defaultTTS:    defaultTTS,
		checker:       checker,
		options:       options,
		jobs:          map[string]storedJob{},
		projects:      map[string]VoiceProject{},
		books:         map[string]storedBookSource{},
		sourcePreps:   map[string]PreparedSource{},
		progress:      map[string]PlaybackProgress{},
		sessions:      map[string]PlaybackSession{},
		profiles:      map[string]storedVoiceProfile{},
		sources:       map[string]storedVoiceProfileSource{},
		voices:        map[string]Voice{},
		jobCancels:    map[string]context.CancelFunc{},
		jobDone:       map[string]chan struct{}{},
		sourceCancels: map[string]context.CancelFunc{},
		targetCancels: map[string]context.CancelFunc{},
	}
	service.loadCloneVoices()
	service.reloadProjects()
	service.reloadBookSources()
	service.reloadSourcePreps()
	service.reloadVoiceProfileSources()
	service.reloadProgress()
	service.reloadPlaybackSessions()
	service.reloadProfiles()
	service.reloadJobs()
	return service
}

func (service *Service) resolveSegmentSettings(isReferenceProfile bool, adaptiveMode bool) (segmentWorkers int, segmentMaxRunes int) {
	if adaptiveMode {
		return service.resolveSegmentSettingsForMode(isReferenceProfile, PerformanceModeThroughput)
	}
	return service.resolveSegmentSettingsForMode(isReferenceProfile, PerformanceModeBalanced)
}

func (service *Service) resolveSegmentSettingsForMode(isReferenceProfile bool, performanceMode PerformanceMode) (segmentWorkers int, segmentMaxRunes int) {
	segmentWorkers = service.options.SegmentWorkers
	segmentMaxRunes = service.options.SegmentMaxRunes

	if isReferenceProfile {
		segmentWorkers = service.options.StudioSegmentWorkers
		segmentMaxRunes = service.options.StudioSegmentMaxRunes
	}

	if isReferenceProfile && performanceMode == PerformanceModeThroughput {
		if service.options.StudioSegmentWorkersAdaptive > segmentWorkers {
			segmentWorkers = service.options.StudioSegmentWorkersAdaptive
		}
		if service.options.StudioSegmentMaxRunesAdaptive > 0 && service.options.StudioSegmentMaxRunesAdaptive < segmentMaxRunes {
			segmentMaxRunes = service.options.StudioSegmentMaxRunesAdaptive
		}
	}

	if performanceMode == PerformanceModeQuality {
		segmentWorkers = 1
		if isReferenceProfile && service.options.SegmentMaxRunes > segmentMaxRunes {
			segmentMaxRunes = service.options.SegmentMaxRunes
		}
	}
	if isReferenceProfile &&
		service.options.ReferenceWorkerCount > 0 &&
		segmentWorkers > service.options.ReferenceWorkerCount {
		segmentWorkers = service.options.ReferenceWorkerCount
	}

	if segmentWorkers <= 0 {
		segmentWorkers = defaultSegmentWorkers
	}
	if segmentMaxRunes <= 0 {
		segmentMaxRunes = defaultSegmentMaxRunes
	}

	return segmentWorkers, segmentMaxRunes
}

// Options exposes the normalized runtime options used by this service.
func (service *Service) Options() Options {
	return service.options
}

func (service *Service) CreateJob(ctx context.Context, request CreateJobRequest) (VoiceJob, error) {
	job, err := service.prepareCreateJob(request)
	if err != nil {
		return VoiceJob{}, err
	}

	service.save(job)
	runCtx, cancel := context.WithCancel(context.Background())
	service.registerJobCancel(job.ID, cancel)
	go service.runJob(runCtx, job.ID)

	return job.VoiceJob, nil
}

func (service *Service) CancelJob(id string) error {
	service.mu.Lock()
	job, ok := service.jobs[id]
	if !ok {
		service.mu.Unlock()
		return ErrJobNotFound
	}

	if job.Status == JobStatusCompleted || job.Status == JobStatusFailed || job.Status == JobStatusCancelled {
		service.mu.Unlock()
		return nil
	}

	cancel := service.jobCancels[id]
	delete(service.jobCancels, id)

	now := time.Now().UTC()
	job.Status = JobStatusCancelled
	if job.Stages.Optimization == StageStatusRunning {
		job.Stages.Optimization = StageStatusFailed
	}
	if job.Stages.Synthesis == StageStatusRunning {
		job.Stages.Synthesis = StageStatusFailed
	}
	if job.Stages.Checker == StageStatusRunning {
		job.Stages.Checker = StageStatusFailed
	}
	job.audioPartialPCM = nil
	job.audioPartialReady = false
	job.audioSegments = nil
	job.AudioSegmentDurationsMS = nil
	job.AudioSegmentLatenciesMS = nil
	job.Error = "cancelled by request"
	job.TerminalReason = JobTerminalReasonUserCancelled
	job.Retriable = true
	job.CompletedAt = &now
	setProgress(&job, string(JobStatusCancelled), "Job cancelled", "Processing was cancelled by user request.", job.Retries.CurrentSegment, job.Retries.TotalSegments)
	service.jobs[id] = job
	service.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	service.waitForJobRuntime(id, 2*time.Second)

	return nil
}

func (service *Service) registerJobCancel(id string, cancel context.CancelFunc) {
	service.mu.Lock()
	service.jobCancels[id] = cancel
	service.jobDone[id] = make(chan struct{})
	service.mu.Unlock()
}

func (service *Service) clearJobCancel(id string) {
	service.mu.Lock()
	delete(service.jobCancels, id)
	done := service.jobDone[id]
	delete(service.jobDone, id)
	service.mu.Unlock()

	if done != nil {
		close(done)
	}
}

func (service *Service) waitForJobRuntime(id string, timeout time.Duration) {
	service.mu.RLock()
	done := service.jobDone[id]
	service.mu.RUnlock()
	if done == nil {
		return
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-done:
	case <-timer.C:
	}
}

func (service *Service) CreateVoiceProfile(
	ctx context.Context,
	name string,
	language string,
	sourcePath string,
	sourceFileName string,
	sourceBytes int64,
) (VoiceProfile, error) {
	autoValidate := false
	profile, err := service.CreateVoiceProfileWithOptions(
		ctx,
		name,
		language,
		sourcePath,
		sourceFileName,
		sourceBytes,
		VoiceProfileCreationOptions{AutoValidate: &autoValidate},
	)
	if err != nil {
		return VoiceProfile{}, err
	}
	return service.measureAndPersistVoiceProfileLikeness(ctx, profile.ID)
}

func (service *Service) CreateVoiceProfileWithOptions(
	ctx context.Context,
	name string,
	language string,
	sourcePath string,
	sourceFileName string,
	sourceBytes int64,
	options VoiceProfileCreationOptions,
) (VoiceProfile, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		cleanName = "Custom voice"
	}
	cleanLanguage := strings.TrimSpace(language)
	if cleanLanguage == "" {
		cleanLanguage = "en"
	}

	select {
	case <-ctx.Done():
		return VoiceProfile{}, ctx.Err()
	default:
	}

	if service.options.MaxProfileBytes > 0 && sourceBytes > service.options.MaxProfileBytes {
		return VoiceProfile{}, fmt.Errorf("%w", ErrProfileTooLarge)
	}

	audioInfo, err := inspectAudioFile(sourcePath)
	if err != nil {
		return VoiceProfile{}, fmt.Errorf("validate uploaded profile audio: %w", err)
	}
	if !audioInfo.hasAudio {
		return VoiceProfile{}, ErrProfileMissingAudio
	}

	fileInfo, err := os.Stat(sourcePath)
	if err != nil {
		return VoiceProfile{}, err
	}

	profileID := newID()
	now := time.Now().UTC()
	targetIDs := normalizeVoiceProfileTargetIDs(options.Targets)
	if len(targetIDs) == 0 {
		return VoiceProfile{}, ErrProfileArtifactUnsupported
	}
	profile := storedVoiceProfile{
		VoiceProfile: VoiceProfile{
			ID:           profileID,
			Name:         cleanName,
			Language:     cleanLanguage,
			SourceFile:   sourceFileName,
			SourceBytes:  fileInfo.Size(),
			Status:       VoiceProfileStatusPending,
			CloneTargets: newVoiceProfileTargets(targetIDs, options.autoValidate(), now),
			CreatedAt:    now,
			UpdatedAt:    now,
		},
	}
	if sourceBytes > 0 {
		profile.SourceBytes = sourceBytes
	}

	outputDir, err := filepath.Abs(filepath.Join(service.options.VoiceProfileDir, profileID))
	if err != nil {
		return VoiceProfile{}, err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return VoiceProfile{}, err
	}

	referencePath := filepath.Join(outputDir, "reference.wav")
	extraction, err := extractProfileAudio(
		ctx,
		sourcePath,
		referencePath,
		audioInfo.streamIndex,
		service.options.VoiceProfileReferenceMaxSeconds,
		audioInfo.durationMS,
	)
	if err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfile{}, fmt.Errorf("%w: %s", ErrProfileExtractionFailed, err)
	}

	durationMS, err := audioDurationMilliseconds(referencePath)
	if err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfile{}, fmt.Errorf("%w: %s", ErrProfileExtractionFailed, err)
	}

	profile.Status = VoiceProfileStatusReady
	profile.SourceDurationMS = extraction.sourceDurationMS
	profile.ReferencePath = referencePath
	profile.ReferenceAudio = filepath.Base(referencePath)
	profile.ReferenceDurationMS = durationMS
	if extraction.referenceDurationMS > 0 {
		profile.ReferenceDurationMS = extraction.referenceDurationMS
	}
	profile.ReferenceTrimmed = extraction.referenceTrimmed
	profile.ReferenceSampleStrategy = extraction.referenceSampleStrategy
	profile.AudioFormat = "audio/wav"
	profile.DurationMS = durationMS
	profile.UpdatedAt = time.Now().UTC()
	likenessReason := "Target validation is queued."
	if !options.autoValidate() {
		likenessReason = "Target validation is not started."
	}
	likeness := pendingVoiceProfileLikeness(
		likenessReason,
		strings.TrimSpace(service.options.VoiceProfileLikenessCalibrationText),
	)
	profile.Likeness = &likeness

	if err := service.persistVoiceProfile(profile); err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfile{}, err
	}

	result := profile.VoiceProfile
	if options.autoValidate() {
		service.startVoiceProfileTargetPreparation(profile.ID, targetIDs, true)
	}
	return result, nil
}

func (service *Service) measureAndPersistVoiceProfileLikeness(ctx context.Context, profileID string) (VoiceProfile, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		return VoiceProfile{}, err
	}
	outputDir := service.options.VoiceProfileDir
	if strings.TrimSpace(profile.ReferencePath) != "" {
		outputDir = filepath.Dir(profile.ReferencePath)
	}
	likeness := service.measureVoiceProfileLikeness(ctx, profile.VoiceProfile, outputDir)
	profile.Likeness = &likeness
	if err := service.persistVoiceProfile(profile); err != nil {
		return VoiceProfile{}, err
	}
	return profile.VoiceProfile, nil
}

func (service *Service) MaxProfileBytes() int64 {
	service.mu.RLock()
	defer service.mu.RUnlock()

	return service.options.MaxProfileBytes
}

func (service *Service) ListVoiceProfiles() []VoiceProfile {
	service.mu.RLock()
	defer service.mu.RUnlock()

	profiles := make([]VoiceProfile, 0, len(service.profiles))
	for _, profile := range service.profiles {
		profiles = append(profiles, profile.VoiceProfile)
	}
	return profiles
}

func (service *Service) GetVoiceProfile(id string) (VoiceProfile, error) {
	service.mu.RLock()
	profile, ok := service.profiles[id]
	service.mu.RUnlock()
	if !ok {
		return VoiceProfile{}, ErrProfileNotFound
	}
	return profile.VoiceProfile, nil
}

func (service *Service) DeleteVoiceProfile(id string) error {
	service.mu.Lock()
	profile, ok := service.profiles[id]
	delete(service.profiles, id)
	service.mu.Unlock()
	if !ok {
		return ErrProfileNotFound
	}

	if profile.ReferencePath != "" {
		_ = os.RemoveAll(filepath.Dir(profile.ReferencePath))
	}
	return nil
}

func (service *Service) getVoiceProfile(id string) (storedVoiceProfile, error) {
	service.mu.RLock()
	profile, ok := service.profiles[id]
	service.mu.RUnlock()
	if !ok {
		return storedVoiceProfile{}, ErrProfileNotFound
	}
	return profile, nil
}

func (service *Service) updateVoiceProfile(profile storedVoiceProfile) {
	service.mu.Lock()
	profile.UpdatedAt = time.Now().UTC()
	service.profiles[profile.ID] = profile
	service.mu.Unlock()
}

func (service *Service) reloadProfiles() {
	baseDir, err := filepath.Abs(service.options.VoiceProfileDir)
	if err != nil {
		return
	}
	profiles := make(map[string]storedVoiceProfile)

	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		metadataPath := filepath.Join(baseDir, entry.Name(), "profile.json")
		metadataBytes, err := os.ReadFile(metadataPath)
		if err != nil {
			continue
		}

		var profile VoiceProfile
		if err := json.Unmarshal(metadataBytes, &profile); err != nil {
			continue
		}
		if strings.TrimSpace(profile.ID) == "" {
			continue
		}

		cleaned := storedVoiceProfile{VoiceProfile: profile}
		if cleaned.Status == "" {
			cleaned.Status = VoiceProfileStatusPending
		}
		if cleaned.CreatedAt.IsZero() {
			cleaned.CreatedAt = time.Now().UTC()
		}
		if cleaned.UpdatedAt.IsZero() {
			cleaned.UpdatedAt = cleaned.CreatedAt
		}
		if len(cleaned.CloneArtifacts) == 0 {
			cleaned.CloneArtifacts = nil
		}
		if len(cleaned.CloneTargets) == 0 {
			cleaned.CloneTargets = nil
		}
		profiles[cleaned.ID] = cleaned
	}

	service.mu.Lock()
	service.profiles = profiles
	service.mu.Unlock()
}

func (service *Service) GetJob(id string) (VoiceJob, error) {
	job, err := service.resolveStoredJob(id)
	if err != nil {
		return VoiceJob{}, err
	}

	return service.hydrateTimingSummary(job.VoiceJob), nil
}

func (service *Service) GetAudio(id string) ([]byte, string, error) {
	job, err := service.resolveStoredJob(id)
	if err != nil {
		return nil, "", err
	}

	contentType := job.ContentType
	if contentType == "" {
		contentType = "audio/wav"
	}
	if len(job.audio) > 0 {
		return job.audio, contentType, nil
	}
	if job.AudioPath != "" {
		audioBytes, err := os.ReadFile(job.AudioPath)
		if err != nil {
			return nil, "", fmt.Errorf("read saved audio: %w", err)
		}

		return audioBytes, contentType, nil
	}

	return nil, "", ErrAudioNotReady
}

func (service *Service) GetPartialAudio(id string) ([]byte, string, error) {
	job, err := service.resolveStoredJob(id)
	if err != nil {
		return nil, "", err
	}

	var contentType string
	var partialPCM []byte
	var partialSpec audio.WAVSpec
	var isReady bool
	var completedAudio []byte
	var completedAudioPath string
	contentType = job.ContentType
	if contentType == "" {
		contentType = "audio/wav"
	}
	isReady = job.audioPartialReady && len(job.audioPartialPCM) > 0
	if isReady {
		partialPCM = append(partialPCM, job.audioPartialPCM...)
		partialSpec = job.audioPartialSpec
	} else if len(job.audio) > 0 {
		completedAudio = append(completedAudio, job.audio...)
	} else {
		completedAudioPath = job.AudioPath
	}

	if !isReady {
		if len(completedAudio) > 0 {
			return completedAudio, contentType, nil
		}
		if completedAudioPath != "" {
			audioBytes, err := os.ReadFile(completedAudioPath)
			if err != nil {
				return nil, "", fmt.Errorf("read saved audio: %w", err)
			}
			return audioBytes, contentType, nil
		}
		return nil, "", ErrAudioNotReady
	}

	audioBytes := audio.BuildPCM16WAV(partialPCM, partialSpec)
	if len(audioBytes) == 0 {
		return nil, "", ErrAudioNotReady
	}

	return audioBytes, contentType, nil
}

func (service *Service) GetAudioSegment(id string, index int) ([]byte, string, error) {
	job, err := service.resolveStoredJob(id)
	if err != nil {
		return nil, "", err
	}

	contentType := job.ContentType
	if contentType == "" {
		contentType = "audio/wav"
	}
	if index <= 0 {
		return nil, "", ErrAudioNotReady
	}
	if index > len(job.audioSegments) {
		return nil, "", ErrAudioNotReady
	}

	segment := job.audioSegments[index-1]
	if len(segment) == 0 {
		return nil, "", ErrAudioNotReady
	}

	segmentAudio := make([]byte, len(segment))
	copy(segmentAudio, segment)
	return segmentAudio, contentType, nil
}

func (service *Service) runJob(ctx context.Context, id string) {
	defer service.clearJobCancel(id)

	job, err := service.snapshot(id)
	if err != nil {
		return
	}
	config := resolvedConfigFromJob(job)

	service.updateJob(id, func(job *storedJob) {
		job.Status = JobStatusOptimizing
		job.Stages.Optimization = StageStatusRunning
		job.Optimizer = optimizerName(service.optimizer)
		setProgress(job, string(JobStatusOptimizing), "Optimizing source text", fmt.Sprintf("%d characters queued.", len([]rune(job.InputText))), 0, 0)
	})

	optimizedText := job.InputText
	if config.pipelineOptions.TextPreprocess {
		optimizedText, err = service.optimizeText(ctx, id, job.InputText)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				if errors.Is(ctx.Err(), context.Canceled) {
					service.cancelJobByID(id)
				} else {
					service.failJobByID(id, fmt.Errorf("optimize text cancelled unexpectedly: %w", err))
				}
				return
			}

			service.failJobByID(id, fmt.Errorf("optimize text: %w", err))
			return
		}
	} else {
		service.updateJob(id, func(job *storedJob) {
			job.Optimizer = "disabled"
			job.OptimizedText = job.InputText
			setProgress(job, string(JobStatusOptimizing), "Using source text", "Text preprocessing is disabled for this run.", 0, 0)
		})
	}

	if !job.SpeechRenderApplied {
		rendered := service.RenderSpeechText(optimizedText, SpeechRenderOptions{
			ProjectID:      job.ProjectID,
			VoiceProfileID: job.VoiceProfileID,
			Locale:         job.Locale,
			TTSEngine:      job.TTSEngine,
			FallbackLang:   job.TTSLanguage,
		})
		optimizedText = rendered.PlainText
		service.updateJob(id, func(job *storedJob) {
			job.Locale = rendered.Locale
			job.SegmentationWarnings = uniqueStrings(append(job.SegmentationWarnings, rendered.Warnings...))
			job.SpeechRenderApplied = true
		})
	}

	service.updateJob(id, func(job *storedJob) {
		job.OptimizedText = optimizedText
		job.Stages.Optimization = StageStatusDone
		job.Status = JobStatusSynthesizing
		job.Stages.Synthesis = StageStatusRunning
		setProgress(job, string(JobStatusSynthesizing), "Preparing synthesis segments", fmt.Sprintf("%d optimized characters ready.", len([]rune(optimizedText))), 0, 0)
	})

	profileID := strings.TrimSpace(job.VoiceProfileID)
	profileRef := ""
	var profileArtifact *VoiceProfileCloneArtifact
	profileLanguage := strings.TrimSpace(job.VoiceProfileLanguage)
	ttsVoice := strings.TrimSpace(job.TTSVoice)
	ttsLanguage := strings.TrimSpace(job.TTSLanguage)
	ttsEngine := strings.TrimSpace(job.TTSEngine)
	if strings.TrimSpace(job.VoiceID) != "" {
		voice, err := service.ResolveVoice(job.VoiceID)
		if err != nil {
			service.failJobByID(id, err)
			return
		}
		switch voice.Kind {
		case VoiceKindNative:
			if ttsVoice == "" {
				ttsVoice = voiceSynthesisName(voice)
			}
			if ttsLanguage == "" {
				ttsLanguage = voice.LangCode
			}
		case VoiceKindClone:
			if profileID == "" {
				profileRef = voice.ReferenceAudioPath
				profileLanguage = voice.LangCode
			}
		}
	}
	if profileID != "" {
		profile, err := service.getVoiceProfile(profileID)
		if err != nil {
			if errors.Is(ctx.Err(), context.Canceled) {
				service.cancelJobByID(id)
				return
			}

			service.failJobByID(id, fmt.Errorf("load voice profile: %w", err))
			return
		}
		profileRef = profile.ReferencePath
		if profileRef == "" {
			service.failJobByID(id, ErrProfileMissingAudio)
			return
		}
		if profileLanguage == "" {
			profileLanguage = profile.Language
		}
		if artifact := service.readyVoiceProfileArtifact(profile.VoiceProfile, ttsEngine); artifact != nil {
			profileArtifact = artifact
		}
	}

	isReferenceProfile := profileRef != "" && profileArtifact == nil
	result, check, err := service.synthesizeUntilComplete(
		ctx,
		id,
		optimizedText,
		profileArtifact,
		isReferenceProfile,
		profileRef,
		profileLanguage,
		ttsVoice,
		ttsLanguage,
		ttsEngine,
		config.performanceMode,
		config.pipelineOptions,
	)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			if errors.Is(ctx.Err(), context.Canceled) {
				service.cancelJobByID(id)
			} else {
				service.failJobByID(id, fmt.Errorf("synthesis cancelled unexpectedly: %w", err))
			}
			return
		}

		service.updateJob(id, func(job *storedJob) {
			job.ContentType = result.ContentType
			job.DurationMS = result.DurationMS
			job.Provider = result.Provider
			job.Voice = result.Voice
			job.audio = result.Audio
			job.VoiceCheck = toVoiceCheck(check)
		})
		service.failJobByID(id, err)
		return
	}

	service.updateJob(id, func(job *storedJob) {
		setProgress(job, string(JobStatusChecking), "Saving final audio", "Writing completed WAV output to local job storage.", job.Retries.TotalSegments, job.Retries.TotalSegments)
	})

	audioPath, err := service.writeJobAudio(id, result.Audio)
	if err != nil {
		service.failJobByID(id, fmt.Errorf("save completed audio: %w", err))
		return
	}

	now := time.Now().UTC()
	var metadataErr error
	service.updateJob(id, func(job *storedJob) {
		job.AudioURL = fmt.Sprintf("/api/voice-jobs/%s/audio", job.ID)
		job.AudioReadySegments = job.Retries.TotalSegments
		job.AudioPath = audioPath
		job.audioPartialPCM = nil
		job.audioPartialReady = false
		job.ContentType = result.ContentType
		job.DurationMS = result.DurationMS
		job.Provider = result.Provider
		job.Voice = result.Voice
		job.VoiceCheck = toVoiceCheck(check)
		job.QualityReport = buildQualityReport(job.VoiceJob, config.pipelineOptions, check)
		setProgress(job, string(JobStatusChecking), "Preparing read-along timing", "Writing highlight-map and timing sidecars.", job.Retries.TotalSegments, job.Retries.TotalSegments)
	})
	if _, err := service.refreshTimingArtifacts(ctx, id, true); err != nil {
		service.updateJob(id, func(job *storedJob) {
			job.SegmentationWarnings = uniqueStrings(append(job.SegmentationWarnings, "final timing unavailable: "+err.Error()))
		})
	}
	service.updateJob(id, func(job *storedJob) {
		job.Status = JobStatusCompleted
		job.Stages.Synthesis = StageStatusDone
		job.Stages.Checker = StageStatusDone
		job.CompletedAt = &now
		completedDetail := "All generated segments passed voice checking."
		if !config.pipelineOptions.ASRCheck {
			completedDetail = "Audio generated with ASR checking disabled for this run."
		}
		setProgress(job, string(JobStatusCompleted), "Audio ready", completedDetail, job.Retries.TotalSegments, job.Retries.TotalSegments)
		metadataErr = service.writeJobMetadata(job.VoiceJob)
	})
	if metadataErr != nil {
		service.failJobByID(id, fmt.Errorf("save job metadata: %w", metadataErr))
	}
}

func (service *Service) resolveStoredJob(id string) (storedJob, error) {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		return storedJob{}, ErrJobNotFound
	}

	service.mu.RLock()
	job, ok := service.jobs[cleanID]
	service.mu.RUnlock()
	if ok {
		return job, nil
	}

	job, err := service.loadPersistedJob(cleanID)
	if err != nil {
		return storedJob{}, err
	}
	service.save(job)
	return job, nil
}

func (service *Service) loadPersistedJob(id string) (storedJob, error) {
	metadataPath := filepath.Join(service.options.JobDataDir, id, "metadata.json")
	metadataBytes, err := os.ReadFile(metadataPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return storedJob{}, ErrJobNotFound
		}
		return storedJob{}, err
	}

	var job VoiceJob
	if err := json.Unmarshal(metadataBytes, &job); err != nil {
		return storedJob{}, err
	}
	if strings.TrimSpace(job.ID) == "" {
		return storedJob{}, ErrJobNotFound
	}
	if strings.TrimSpace(job.ProjectID) == "" {
		job.ProjectID = defaultProjectID
	}
	if job.AudioURL == "" && job.AudioPath != "" {
		job.AudioURL = "/api/voice-jobs/" + job.ID + "/audio"
	}
	job = service.hydrateTimingSummary(job)
	if job.CreatedAt.IsZero() {
		job.CreatedAt = time.Now().UTC()
	}
	if job.UpdatedAt.IsZero() {
		job.UpdatedAt = job.CreatedAt
	}

	return storedJob{VoiceJob: job}, nil
}

func (service *Service) optimizeText(ctx context.Context, id string, inputText string) (string, error) {
	streamingOptimizer, ok := service.optimizer.(StreamingVoiceOptimizer)
	if !ok {
		return service.optimizer.Optimize(ctx, inputText)
	}

	var streamed strings.Builder
	streamedRuneCount := 0
	optimizedText, err := streamingOptimizer.OptimizeStream(ctx, inputText, func(delta string) {
		if delta == "" {
			return
		}

		streamedRuneCount += utf8.RuneCountInString(delta)
		streamed.WriteString(delta)
		preview := stripStreamingPreview(streamed.String())
		service.updateJob(id, func(job *storedJob) {
			job.OptimizedText = preview
			setProgress(
				job,
				string(JobStatusOptimizing),
				"Streaming optimized text",
				fmt.Sprintf("%d optimized characters received so far.", streamedRuneCount),
				0,
				0,
			)
		})
	})
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(optimizedText), nil
}

func (service *Service) synthesizeUntilComplete(
	ctx context.Context,
	id string,
	optimizedText string,
	profileArtifact *VoiceProfileCloneArtifact,
	isReferenceProfile bool,
	profileReferencePath string,
	profileLanguage string,
	ttsVoice string,
	ttsLanguage string,
	ttsEngine string,
	performanceMode PerformanceMode,
	pipelineOptions PipelineOptions,
) (agents.TTSResult, agents.VoiceCheckResult, error) {
	segmentWorkers, segmentMaxRunes := service.resolveSegmentSettingsForMode(isReferenceProfile, performanceMode)
	maxAttempts := service.options.MaxRetries
	if !pipelineOptions.AutoRetry {
		maxAttempts = 1
	}
	if maxAttempts <= 0 {
		maxAttempts = 1
	}

	var mergedResult agents.TTSResult
	var lastCheck agents.VoiceCheckResult
	segments := splitTextSegments(optimizedText, segmentMaxRunes)
	if len(segments) == 0 {
		return mergedResult, lastCheck, ErrEmptyText
	}

	service.updateJob(id, func(job *storedJob) {
		job.Segments = make([]JobSegment, len(segments))
		for index, text := range segments {
			job.Segments[index] = JobSegment{
				Index:  index + 1,
				Text:   text,
				Status: "pending",
			}
		}
		if pipelineOptions.ASRCheck {
			job.Stages.Checker = StageStatusRunning
		} else {
			job.Stages.Checker = StageStatusDone
		}
		job.Retries.TotalSegments = len(segments)
		job.Retries.MaxRetries = maxAttempts
		checkDetail := "synthesized and checked"
		if !pipelineOptions.ASRCheck {
			checkDetail = "synthesized without ASR checking"
		}
		setProgress(
			job,
			string(JobStatusSynthesizing),
			"Starting segmented synthesis",
			fmt.Sprintf("%d segments will be %s. workers=%d, max-runes=%d.", len(segments), checkDetail, segmentWorkers, segmentMaxRunes),
			0,
			len(segments),
		)
	})
	if err := service.writeJobSpeechPlan(id); err != nil {
		service.updateJob(id, func(job *storedJob) {
			job.SegmentationWarnings = uniqueStrings(append(job.SegmentationWarnings, "speech plan unavailable: "+err.Error()))
		})
	}

	type segmentResult struct {
		index              int
		audio              []byte
		audioPCM           []byte
		audioSpec          audio.WAVSpec
		audioDurationMS    int
		attempts           int
		check              agents.VoiceCheckResult
		latencyMS          int
		contentType        string
		provider           string
		voice              string
		nativeTimingEvents []alignment.NativeTimingEvent
		err                error
		transcript         string
		similarity         float64
	}

	totalAttempts := 0
	totalSegments := len(segments)
	mergedSegmentsPCM := make([]byte, 0, 4096)
	transcripts := make([]string, 0, totalSegments)
	similarities := make([]float64, 0, totalSegments)
	var segmentAudioSpec audio.WAVSpec
	var segmentAudioSpecSet bool
	var segmentAudioSpecMu sync.Mutex

	if segmentWorkers > totalSegments {
		segmentWorkers = totalSegments
	}
	if segmentWorkers <= 0 {
		segmentWorkers = defaultSegmentWorkers
	}

	pipelineCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	processSegment := func(segmentIndex int) segmentResult {
		output := segmentResult{
			index: segmentIndex,
		}
		if segmentIndex <= 0 || segmentIndex > totalSegments {
			output.err = fmt.Errorf("segment index out-of-range: %d", segmentIndex)
			return output
		}

		expectedSegment := segments[segmentIndex-1]
		resumeText := expectedSegment
		committedSegmentPCM := make([]byte, 0)
		committedSegmentDurationMS := 0
		segmentStart := time.Now()

		for attempt := 1; attempt <= maxAttempts; attempt++ {
			if pipelineCtx.Err() != nil {
				output.err = pipelineCtx.Err()
				return output
			}

			output.attempts += 1
			service.updateJob(id, func(job *storedJob) {
				updateJobSegment(job, segmentIndex, func(segment *JobSegment) {
					segment.Status = "running"
					segment.Attempts = output.attempts
					segment.Reason = "Synthesizing reference segment"
				})
				job.Retries.CurrentSegment = segmentIndex
				job.Retries.SegmentAttempts = output.attempts
				job.Retries.TotalSegments = totalSegments
			})

			synthesize := func() (agents.TTSResult, error) {
				resolvedEngine, agent, err := service.resolveTTSEngine(ttsEngine, isReferenceProfile)
				if err != nil {
					return agents.TTSResult{}, err
				}
				var agentArtifact *agents.VoiceProfileArtifact
				if profileArtifact != nil {
					artifact := service.profileArtifactForAgent(*profileArtifact)
					agentArtifact = &artifact
				}
				result, err := synthesizeWithAgent(
					pipelineCtx,
					agent,
					resumeText,
					agentArtifact,
					isReferenceProfile,
					profileReferencePath,
					profileLanguage,
					ttsVoice,
					ttsLanguage,
					ssmlForSegment(resumeText, firstNonEmpty(ttsLanguage, profileLanguage)),
					service.ttsEngineSupportsSSML(resolvedEngine),
				)
				if result.Provider == "" {
					result.Provider = resolvedEngine
				}
				return result, err
			}

			result, err := synthesize()
			if err != nil {
				if pipelineCtx.Err() != nil {
					output.err = pipelineCtx.Err()
					return output
				}
				if errors.Is(err, context.Canceled) {
					output.err = fmt.Errorf("synthesis provider cancelled segment %d unexpectedly: %w", segmentIndex, err)
					return output
				}
				output.err = fmt.Errorf("synthesize text for segment %d: %w", segmentIndex, err)
				return output
			}

			candidateAudioSpec, candidatePCM, err := audio.ParsePCM16WAV(result.Audio)
			if err != nil {
				output.err = fmt.Errorf("parse synthesized audio for segment %d: %w", segmentIndex, err)
				return output
			}

			segmentSpec := candidateAudioSpec
			segmentAudioSpecMu.Lock()
			if !segmentAudioSpecSet {
				segmentAudioSpec = candidateAudioSpec
				segmentAudioSpecSet = true
			} else if candidateAudioSpec != segmentAudioSpec {
				segmentAudioSpecMu.Unlock()
				output.err = fmt.Errorf(
					"synthesize audio format changed between attempts for segment %d",
					segmentIndex,
				)
				return output
			}
			segmentSpec = segmentAudioSpec
			segmentAudioSpecMu.Unlock()

			candidateSegmentPCM := candidatePCM
			candidateSegmentAudio := result.Audio
			if len(committedSegmentPCM) > 0 {
				candidateSegmentPCM = append(
					committedSegmentPCM[:len(committedSegmentPCM):len(committedSegmentPCM)],
					candidatePCM...,
				)
				candidateSegmentAudio = audio.BuildPCM16WAV(candidateSegmentPCM, segmentSpec)
			}

			if !pipelineOptions.ASRCheck {
				output.audio = candidateSegmentAudio
				output.audioPCM = candidateSegmentPCM
				output.audioSpec = segmentSpec
				output.audioDurationMS = committedSegmentDurationMS + result.DurationMS
				output.latencyMS = int(time.Since(segmentStart).Milliseconds())
				output.transcript = expectedSegment
				output.similarity = 0
				output.contentType = result.ContentType
				output.provider = result.Provider
				output.voice = result.Voice
				output.nativeTimingEvents = result.TimingEvents
				output.check = agents.VoiceCheckResult{
					Complete:    true,
					Transcript:  expectedSegment,
					NeedsResume: false,
					Reason:      "ASR check disabled for this run",
					Provider:    "disabled",
					Similarity:  0,
				}
				return output
			}

			service.updateJob(id, func(job *storedJob) {
				updateJobSegment(job, segmentIndex, func(segment *JobSegment) {
					segment.Status = "checking"
					segment.Attempts = output.attempts
					segment.DurationMS = committedSegmentDurationMS + result.DurationMS
					segment.Reason = "Checking synthesized audio"
				})
			})

			check, err := service.checker.Check(pipelineCtx, expectedSegment, candidateSegmentAudio)
			if err != nil {
				if pipelineCtx.Err() != nil {
					output.err = pipelineCtx.Err()
					return output
				}
				if errors.Is(err, context.Canceled) {
					output.err = fmt.Errorf("voice checker cancelled segment %d unexpectedly: %w", segmentIndex, err)
					return output
				}
				output.err = fmt.Errorf("check audio for segment %d: %w", segmentIndex, err)
				return output
			}
			output.check = check

			if check.Complete {
				output.audio = candidateSegmentAudio
				output.audioPCM = candidateSegmentPCM
				output.audioSpec = segmentSpec
				output.audioDurationMS = committedSegmentDurationMS + result.DurationMS
				output.latencyMS = int(time.Since(segmentStart).Milliseconds())
				output.transcript = check.Transcript
				output.similarity = check.Similarity
				output.contentType = result.ContentType
				output.provider = result.Provider
				output.voice = result.Voice
				output.nativeTimingEvents = result.TimingEvents
				return output
			}

			if check.NeedsResume && strings.TrimSpace(check.ResumeText) != "" && attempt < maxAttempts {
				committedSegmentPCM = candidateSegmentPCM
				committedSegmentDurationMS += result.DurationMS
				resumeText = check.ResumeText
				continue
			}

			if attempt < maxAttempts {
				continue
			}

			output.err = fmt.Errorf(
				"segment %d reached max retries without completion: %s",
				segmentIndex,
				check.Reason,
			)
			return output
		}

		output.err = fmt.Errorf(
			"segment %d reached max retries without completion",
			segmentIndex,
		)
		return output
	}

	jobs := make(chan int, segmentWorkers)
	results := make(chan segmentResult, segmentWorkers)

	var workerWg sync.WaitGroup
	worker := func() {
		defer workerWg.Done()

		for segmentIndex := range jobs {
			output := processSegment(segmentIndex)
			select {
			case <-pipelineCtx.Done():
				return
			case results <- output:
			}
		}
	}

	for workerIndex := 0; workerIndex < segmentWorkers; workerIndex += 1 {
		workerWg.Add(1)
		go worker()
	}

	go func() {
		defer close(jobs)
		for segmentIndex := 1; segmentIndex <= totalSegments; segmentIndex += 1 {
			select {
			case <-pipelineCtx.Done():
				return
			case jobs <- segmentIndex:
			}
		}
	}()

	go func() {
		workerWg.Wait()
		close(results)
	}()

	pending := make(map[int]segmentResult, totalSegments)
	nextSegment := 1
	var failureErr error
	failedSegment := 0
	totalDurationMS := 0
	contentType := "audio/wav"
	provider := ""
	voice := ""

	for result := range results {
		if errors.Is(pipelineCtx.Err(), context.Canceled) {
			failureErr = context.Canceled
			break
		}

		if failureErr != nil {
			continue
		}

		if result.err != nil {
			if errors.Is(result.err, context.Canceled) && pipelineCtx.Err() != nil {
				failureErr = context.Canceled
				continue
			}

			totalAttempts += result.attempts
			failureErr = result.err
			failedSegment = result.index
			service.updateJob(id, func(job *storedJob) {
				job.Retries.Attempts = totalAttempts
				job.Retries.SegmentAttempts = result.attempts
				job.Retries.CurrentSegment = result.index
				job.Retries.TotalSegments = totalSegments
				updateJobSegment(job, result.index, func(segment *JobSegment) {
					segment.Status = "failed"
					segment.Attempts = result.attempts
					segment.DurationMS = result.audioDurationMS
					segment.LatencyMS = result.latencyMS
					segment.Similarity = result.similarity
					segment.Reason = result.err.Error()
				})
			})
			cancel()
			if result.check.Complete {
				lastCheck = result.check
			}
			continue
		}

		pending[result.index] = result
		for {
			nextResult, ok := pending[nextSegment]
			if !ok {
				break
			}

			delete(pending, nextSegment)

			segmentStartMS := totalDurationMS
			mergedSegmentsPCM = append(mergedSegmentsPCM, nextResult.audioPCM...)
			totalAttempts += nextResult.attempts
			totalDurationMS += nextResult.audioDurationMS
			transcripts = append(transcripts, nextResult.transcript)
			similarities = append(similarities, nextResult.similarity)
			lastCheck = nextResult.check
			contentType = nextResult.contentType
			provider = nextResult.provider
			voice = nextResult.voice

			service.updateJob(id, func(job *storedJob) {
				job.AudioReadySegments = nextSegment
				job.audioSegments = append(job.audioSegments, nextResult.audio)
				job.audioPartialPCM = append(job.audioPartialPCM, nextResult.audioPCM...)
				job.audioPartialSpec = nextResult.audioSpec
				job.audioPartialReady = true
				job.nativeTimingEvents = append(
					job.nativeTimingEvents,
					alignment.OffsetNativeEvents(nextResult.nativeTimingEvents, segmentStartMS, nextSegment)...,
				)
				job.AudioSegmentDurationsMS = append(
					job.AudioSegmentDurationsMS,
					nextResult.audioDurationMS,
				)
				job.AudioSegmentLatenciesMS = append(
					job.AudioSegmentLatenciesMS,
					nextResult.latencyMS,
				)
				updateJobSegment(job, nextSegment, func(segment *JobSegment) {
					segment.Status = "ready"
					segment.Attempts = nextResult.attempts
					segment.DurationMS = nextResult.audioDurationMS
					segment.LatencyMS = nextResult.latencyMS
					segment.Similarity = nextResult.similarity
					segment.Reason = nextResult.check.Reason
				})
				job.AudioPartialURL = fmt.Sprintf("/api/voice-jobs/%s/audio/partial", job.ID)
				job.ContentType = nextResult.contentType
				job.DurationMS = totalDurationMS
				job.Provider = nextResult.provider
				job.Voice = nextResult.voice
				job.Retries.Attempts = totalAttempts
				job.Retries.SegmentAttempts = nextResult.attempts
				job.Retries.CurrentSegment = nextSegment
				job.Retries.TotalSegments = totalSegments
				job.VoiceCheck = toVoiceCheck(nextResult.check)
				progressMessage := fmt.Sprintf("Checked segment %d of %d", nextSegment, totalSegments)
				if !pipelineOptions.ASRCheck {
					progressMessage = fmt.Sprintf("Synthesized segment %d of %d", nextSegment, totalSegments)
				}
				progressStage := string(JobStatusChecking)
				if !pipelineOptions.ASRCheck {
					progressStage = string(JobStatusSynthesizing)
				}
				setProgress(
					job,
					progressStage,
					progressMessage,
					nextResult.check.Reason,
					nextSegment,
					totalSegments,
				)
			})
			if _, err := service.refreshTimingArtifacts(pipelineCtx, id, false); err != nil && !errors.Is(err, alignment.ErrNoTimingInput) {
				service.updateJob(id, func(job *storedJob) {
					job.SegmentationWarnings = uniqueStrings(append(job.SegmentationWarnings, "partial timing unavailable: "+err.Error()))
				})
			}

			nextSegment += 1
		}
	}

	if failureErr != nil {
		if errors.Is(failureErr, context.Canceled) && pipelineCtx.Err() != nil {
			return mergedResult, lastCheck, context.Canceled
		}

		service.updateJob(id, func(job *storedJob) {
			job.Stages.Synthesis = StageStatusDone
			job.Stages.Checker = StageStatusFailed
			job.Retries.CurrentSegment = failedSegment
			job.Retries.TotalSegments = totalSegments
			job.VoiceCheck = toVoiceCheck(lastCheck)
			setProgress(
				job,
				string(JobStatusFailed),
				fmt.Sprintf("Segment %d failed", failedSegment),
				failureErr.Error(),
				failedSegment,
				totalSegments,
			)
		})
		return mergedResult, lastCheck, failureErr
	}

	if len(transcripts) != totalSegments {
		return mergedResult, lastCheck, ErrRetryExhaust
	}

	if segmentAudioSpecSet {
		mergedResult.Audio = audio.BuildPCM16WAV(mergedSegmentsPCM, segmentAudioSpec)
	}
	mergedResult.DurationMS = totalDurationMS
	mergedResult.ContentType = contentType
	mergedResult.Provider = provider
	mergedResult.Voice = voice

	return mergedResult, aggregateVoiceCheck(transcripts, similarities, lastCheck.Provider), nil
}

func (service *Service) writeJobAudio(id string, audioBytes []byte) (string, error) {
	return service.writeJobAudioFile(id, "audio.wav", audioBytes)
}

func (service *Service) writeJobAudioFile(id string, filename string, audioBytes []byte) (string, error) {
	if len(audioBytes) == 0 {
		return "", ErrAudioNotReady
	}

	outputDir, err := filepath.Abs(filepath.Join(service.options.JobDataDir, id))
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", err
	}

	tmpFile, err := os.CreateTemp(outputDir, filename+".*")
	if err != nil {
		return "", err
	}
	tmpName := tmpFile.Name()

	if _, err := tmpFile.Write(audioBytes); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return "", err
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return "", err
	}
	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpName)
		return "", err
	}

	audioPath := filepath.Join(outputDir, filename)
	if err := os.Rename(tmpName, audioPath); err != nil {
		_ = os.Remove(tmpName)
		return "", err
	}
	if err := os.Chmod(audioPath, 0o644); err != nil {
		_ = os.Remove(audioPath)
		return "", err
	}

	return audioPath, nil
}

func (service *Service) writeJobMetadata(job VoiceJob) error {
	if job.AudioPath == "" {
		return nil
	}

	metadataPath := filepath.Join(filepath.Dir(job.AudioPath), "metadata.json")
	payload, err := json.MarshalIndent(job, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(metadataPath, append(payload, '\n'), 0o644)
}

func writeJSON(path string, payload interface{}) error {
	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(encoded, '\n'), 0o644)
}

type audioInspection struct {
	streamIndex int
	hasAudio    bool
	durationMS  int
}

type profileAudioExtraction struct {
	sourceDurationMS        int
	referenceDurationMS     int
	referenceTrimmed        bool
	referenceSampleStrategy string
}

func extractProfileAudio(
	ctx context.Context,
	inputPath string,
	outputPath string,
	audioStreamIndex int,
	referenceMaxSeconds int,
	sourceDurationMS int,
) (profileAudioExtraction, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	maxDurationMS := referenceMaxSeconds * 1000
	extraction := profileAudioExtraction{sourceDurationMS: sourceDurationMS}
	copiedFromWav, wavSourceDurationMS, wavReferenceDurationMS, wavTrimmed, err := tryCopyReferencePCM16WAV(
		inputPath,
		outputPath,
		maxDurationMS,
	)
	if err != nil {
		return extraction, fmt.Errorf("validate profile audio file: %w", err)
	}
	if copiedFromWav {
		if extraction.sourceDurationMS <= 0 {
			extraction.sourceDurationMS = wavSourceDurationMS
		}
		extraction.referenceDurationMS = wavReferenceDurationMS
		extraction.referenceTrimmed = wavTrimmed
		if wavTrimmed {
			extraction.referenceSampleStrategy = fmt.Sprintf("pcm16-wav-first-%ds", referenceMaxSeconds)
		} else {
			extraction.referenceSampleStrategy = "pcm16-wav-full"
		}
		return extraction, nil
	}

	if _, err := exec.LookPath("ffmpeg"); err != nil {
		if _, ffprobeErr := exec.LookPath("ffprobe"); ffprobeErr != nil {
			return extraction, fmt.Errorf("audio inspection tools missing: ffprobe and ffmpeg are unavailable in PATH")
		}
		return extraction, fmt.Errorf(
			"ffmpeg is required to extract non-WAV profile audio in this environment: %w",
			err,
		)
	}

	baseArgs := []string{
		"-hide_banner",
		"-loglevel",
		"error",
		"-nostdin",
		"-y",
		"-i",
		inputPath,
	}
	if referenceMaxSeconds > 0 {
		baseArgs = append(baseArgs, "-t", strconv.Itoa(referenceMaxSeconds))
	}
	baseArgs = append(
		baseArgs,
		"-vn",
		"-acodec",
		"pcm_s16le",
		"-ac",
		"1",
		"-ar",
		"24000",
		"-f",
		"wav",
	)

	attempts := make([]string, 0, 2)
	if audioStreamIndex >= 0 {
		attempts = append(attempts, fmt.Sprintf("0:%d", audioStreamIndex))
	}
	attempts = append(attempts, "")

	var lastErr error
	for _, audioMap := range attempts {
		commandArgs := make([]string, 0, len(baseArgs)+3)
		commandArgs = append(commandArgs, baseArgs...)
		if audioMap != "" {
			commandArgs = append(commandArgs, "-map", audioMap)
		}
		commandArgs = append(commandArgs, outputPath)

		output, err := exec.CommandContext(
			ctx,
			"ffmpeg",
			commandArgs...,
		).CombinedOutput()
		if err != nil {
			lastErr = fmt.Errorf("ffmpeg extraction failed with map %q: %w: %s", audioMap, err, strings.TrimSpace(string(output)))
			_ = os.Remove(outputPath)
			continue
		}

		stat, statErr := os.Stat(outputPath)
		if statErr == nil && stat.Size() > 0 {
			referenceDurationMS, durationErr := audioDurationMilliseconds(outputPath)
			if durationErr != nil {
				return extraction, durationErr
			}
			extraction.referenceDurationMS = referenceDurationMS
			extraction.referenceTrimmed = referenceMaxSeconds > 0 &&
				extraction.sourceDurationMS > referenceMaxSeconds*1000+500
			if extraction.referenceTrimmed {
				extraction.referenceSampleStrategy = fmt.Sprintf("ffmpeg-first-audio-stream-first-%ds", referenceMaxSeconds)
			} else {
				extraction.referenceSampleStrategy = "ffmpeg-first-audio-stream-full"
			}
			return extraction, nil
		}
		if statErr == nil {
			lastErr = fmt.Errorf("ffmpeg extraction produced empty output with map %q", audioMap)
			_ = os.Remove(outputPath)
			continue
		}
		lastErr = fmt.Errorf("ffmpeg extraction output not available with map %q: %w", audioMap, statErr)
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("ffmpeg extraction completed without generating audio")
	}

	return extraction, lastErr
}

func tryCopyReferencePCM16WAV(
	inputPath string,
	outputPath string,
	maxDurationMS int,
) (bool, int, int, bool, error) {
	header := make([]byte, 12)
	source, err := os.Open(inputPath)
	if err != nil {
		return false, 0, 0, false, err
	}
	readCount, readErr := io.ReadFull(source, header)
	_ = source.Close()
	if readErr != nil || readCount < len(header) {
		return false, 0, 0, false, nil
	}
	if string(header[0:4]) != "RIFF" || string(header[8:12]) != "WAVE" {
		return false, 0, 0, false, nil
	}

	raw, err := os.ReadFile(inputPath)
	if err != nil {
		return false, 0, 0, false, err
	}

	spec, data, err := audio.ParsePCM16WAV(raw)
	if err != nil {
		return false, 0, 0, false, nil
	}

	sourceDurationMS := audio.DurationMSForWAVData(len(data), spec)
	trimmedWAV, _, referenceDurationMS, trimmed, err := audio.TrimPCM16WAV(raw, maxDurationMS)
	if err != nil {
		return true, sourceDurationMS, 0, false, err
	}
	if !trimmed {
		return true, sourceDurationMS, referenceDurationMS, false, copyFile(inputPath, outputPath)
	}

	return true, sourceDurationMS, referenceDurationMS, true, os.WriteFile(outputPath, trimmedWAV, 0o644)
}

func copyFile(sourcePath string, destinationPath string) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer source.Close()

	destination, err := os.Create(destinationPath)
	if err != nil {
		return err
	}
	defer destination.Close()

	_, err = io.Copy(destination, source)
	return err
}

func audioDurationMilliseconds(wavPath string) (int, error) {
	wavBytes, err := os.ReadFile(wavPath)
	if err != nil {
		return 0, err
	}

	spec, data, err := audio.ParsePCM16WAV(wavBytes)
	if err != nil {
		return 0, err
	}

	return audio.DurationMSForWAVData(len(data), spec), nil
}

func inspectAudioFile(path string) (audioInspection, error) {
	if _, err := os.Stat(path); err != nil {
		return audioInspection{streamIndex: -1}, err
	}

	if _, err := exec.LookPath("ffprobe"); err == nil {
		return containsAudioFileWithFFProbe(path)
	}

	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return audioInspection{streamIndex: -1, hasAudio: true}, nil
	}

	return containsAudioFileWithFFmpeg(path)
}

func containsAudioFile(path string) (int, bool, error) {
	info, err := inspectAudioFile(path)
	return info.streamIndex, info.hasAudio, err
}

func containsAudioFileWithFFProbe(path string) (audioInspection, error) {
	command := exec.CommandContext(
		context.Background(),
		"ffprobe",
		"-v",
		"error",
		"-print_format",
		"json",
		"-show_streams",
		"-show_format",
		path,
	)
	output, err := command.CombinedOutput()
	if err != nil {
		return audioInspection{streamIndex: -1}, fmt.Errorf("ffprobe check failed: %w: %s", err, strings.TrimSpace(string(output)))
	}

	var probePayload struct {
		Streams []struct {
			CodecType string `json:"codec_type"`
			Index     int    `json:"index"`
			Duration  string `json:"duration"`
		} `json:"streams"`
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}

	if err := json.Unmarshal(output, &probePayload); err != nil {
		return audioInspection{streamIndex: -1}, fmt.Errorf("parse ffprobe output: %w", err)
	}

	for _, stream := range probePayload.Streams {
		if strings.EqualFold(stream.CodecType, "audio") {
			durationMS := parseDurationSecondsToMS(stream.Duration)
			if durationMS <= 0 {
				durationMS = parseDurationSecondsToMS(probePayload.Format.Duration)
			}
			return audioInspection{
				streamIndex: stream.Index,
				hasAudio:    true,
				durationMS:  durationMS,
			}, nil
		}
	}

	return audioInspection{streamIndex: -1}, nil
}

func containsAudioFileWithFFmpeg(path string) (audioInspection, error) {
	command := exec.CommandContext(
		context.Background(),
		"ffmpeg",
		"-hide_banner",
		"-v",
		"info",
		"-nostdin",
		"-i",
		path,
	)
	output, err := command.CombinedOutput()
	outputText := strings.TrimSpace(string(output))

	if err != nil && outputText != "" {
		lowerOutput := strings.ToLower(outputText)
		if strings.Contains(lowerOutput, "invalid data") ||
			strings.Contains(lowerOutput, "unknown format") ||
			strings.Contains(lowerOutput, "error while") {
			return audioInspection{streamIndex: -1}, fmt.Errorf("ffmpeg inspect failed: %w: %s", err, outputText)
		}
	}

	audioStreamIndex := parseAudioStreamIndexFromFFmpegOutput(output)
	if audioStreamIndex >= 0 {
		return audioInspection{
			streamIndex: audioStreamIndex,
			hasAudio:    true,
		}, nil
	}

	return audioInspection{streamIndex: -1}, nil
}

func parseDurationSecondsToMS(value string) int {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || strings.EqualFold(trimmed, "N/A") {
		return 0
	}
	seconds, err := strconv.ParseFloat(trimmed, 64)
	if err != nil || seconds <= 0 {
		return 0
	}
	return int(seconds*1000 + 0.5)
}

func parseAudioStreamIndexFromFFmpegOutput(output []byte) int {
	audioStreamRe := regexp.MustCompile(`Stream #\d+:([0-9]+).*Audio:`)
	for _, line := range strings.Split(string(output), "\n") {
		matches := audioStreamRe.FindStringSubmatch(line)
		if len(matches) != 2 {
			continue
		}

		streamIndex, parseErr := strconv.Atoi(matches[1])
		if parseErr == nil {
			return streamIndex
		}
	}

	return -1
}

func aggregateVoiceCheck(transcripts []string, similarities []float64, provider string) agents.VoiceCheckResult {
	if len(transcripts) == 0 {
		return agents.VoiceCheckResult{
			Complete: false,
			Reason:   "checker did not produce any segment transcripts",
			Provider: provider,
		}
	}

	totalSimilarity := 0.0
	for _, similarity := range similarities {
		totalSimilarity += similarity
	}
	averageSimilarity := 0.0
	if len(similarities) > 0 {
		averageSimilarity = totalSimilarity / float64(len(similarities))
	}
	if provider == "" {
		provider = "unknown"
	}
	reason := "all generated segments passed voice checking"
	if provider == "disabled" {
		reason = "ASR check disabled for this run"
	}

	return agents.VoiceCheckResult{
		Complete:    true,
		Transcript:  strings.Join(transcripts, "\n\n"),
		NeedsResume: false,
		Reason:      reason,
		Provider:    provider,
		Similarity:  averageSimilarity,
	}
}

func buildQualityReport(job VoiceJob, options PipelineOptions, check agents.VoiceCheckResult) *JobQualityReport {
	if !options.QualityReport {
		return nil
	}

	segmentCount := len(job.Segments)
	totalLatencyMS := 0
	similarityTotal := 0.0
	similarityCount := 0
	for _, segment := range job.Segments {
		totalLatencyMS += segment.LatencyMS
		if segment.Similarity > 0 {
			similarityTotal += segment.Similarity
			similarityCount += 1
		}
	}

	averageLatencyMS := 0
	if segmentCount > 0 {
		averageLatencyMS = totalLatencyMS / segmentCount
	}
	averageSimilarity := check.Similarity
	if similarityCount > 0 {
		averageSimilarity = similarityTotal / float64(similarityCount)
	}

	inputRunes := utf8.RuneCountInString(strings.TrimSpace(job.InputText))
	optimizedRunes := utf8.RuneCountInString(strings.TrimSpace(job.OptimizedText))
	preprocessChangedPct := 0.0
	if inputRunes > 0 {
		diff := optimizedRunes - inputRunes
		if diff < 0 {
			diff = -diff
		}
		preprocessChangedPct = float64(diff) / float64(inputRunes)
	}

	retryCount := job.Retries.Attempts - segmentCount
	if retryCount < 0 {
		retryCount = 0
	}

	reason := "Quality report generated from segment telemetry."
	if !options.ASRCheck {
		reason = "Quality report generated without ASR checker confidence."
	}

	return &JobQualityReport{
		Enabled:              true,
		PreprocessChangedPct: preprocessChangedPct,
		RetryCount:           retryCount,
		AverageSimilarity:    averageSimilarity,
		AverageLatencyMS:     averageLatencyMS,
		SegmentCount:         segmentCount,
		ReferenceProfile:     job.VoiceProfileID != "" || strings.HasPrefix(job.VoiceID, "clone_"),
		Reason:               reason,
	}
}

func stripStreamingPreview(value string) string {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}

	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimPrefix(trimmed, "text")
	trimmed = strings.TrimPrefix(trimmed, "markdown")
	return strings.TrimSpace(strings.TrimSuffix(trimmed, "```"))
}

func splitTextSegments(text string, maxRunes int) []string {
	cleanText := strings.TrimSpace(text)
	if cleanText == "" {
		return nil
	}
	if maxRunes <= 0 {
		maxRunes = defaultSegmentMaxRunes
	}

	pieces := splitSentencePieces(cleanText)
	segments := make([]string, 0, len(pieces))
	currentParts := make([]string, 0, maxRunes/2)
	currentRunes := 0
	for _, piece := range pieces {
		partRunes := utf8.RuneCountInString(piece)
		if len(currentParts) == 0 {
			currentParts = append(currentParts, piece)
			currentRunes = partRunes
			continue
		}

		if currentRunes+1+partRunes > maxRunes {
			segments = append(segments, strings.Join(currentParts, " "))
			currentParts = currentParts[:0]
			currentParts = append(currentParts, piece)
			currentRunes = partRunes
			continue
		}

		currentParts = append(currentParts, piece)
		currentRunes += 1 + partRunes
	}
	if len(currentParts) > 0 {
		segments = append(segments, strings.Join(currentParts, " "))
	}

	if len(segments) == 0 {
		return []string{cleanText}
	}

	return segments
}

func splitSentencePieces(text string) []string {
	pieces := make([]string, 0)
	pieceStart := 0

	for index := 0; index < len(text); {
		value, size := utf8.DecodeRuneInString(text[index:])
		nextIndex := index + size
		nextIsBoundary := nextIndex == len(text)
		if !nextIsBoundary {
			nextRune, _ := utf8.DecodeRuneInString(text[nextIndex:])
			if isBoundaryWhitespace(nextRune) {
				nextIsBoundary = true
			}
		}

		if value == '\n' || ((value == '.' || value == '?' || value == '!') && nextIsBoundary) {
			piece := strings.TrimSpace(text[pieceStart:nextIndex])
			if piece != "" {
				pieces = append(pieces, piece)
			}
			pieceStart = nextIndex
		}

		index = nextIndex
	}

	if pieceStart < len(text) {
		if piece := strings.TrimSpace(text[pieceStart:]); piece != "" {
			pieces = append(pieces, piece)
		}
	}

	if len(pieces) == 0 {
		pieces = append(pieces, strings.TrimSpace(text))
	}

	return pieces
}

func splitLongPiece(piece string, maxRunes int) []string {
	if utf8.RuneCountInString(piece) <= maxRunes {
		return []string{piece}
	}

	words := strings.Fields(piece)
	parts := make([]string, 0, len(words))
	currentParts := make([]string, 0, 8)
	currentRunes := 0
	for _, word := range words {
		wordRunes := utf8.RuneCountInString(word)
		if len(currentParts) == 0 {
			currentParts = append(currentParts, word)
			currentRunes = wordRunes
			continue
		}

		if currentRunes+1+wordRunes <= maxRunes {
			currentParts = append(currentParts, word)
			currentRunes += 1 + wordRunes
			continue
		}

		parts = append(parts, strings.Join(currentParts, " "))
		currentParts = currentParts[:0]
		currentParts = append(currentParts, word)
		currentRunes = wordRunes
	}
	if len(currentParts) > 0 {
		parts = append(parts, strings.Join(currentParts, " "))
	}
	if len(parts) == 0 {
		trimmed := strings.TrimSpace(piece)
		if trimmed != "" {
			parts = append(parts, trimmed)
		}
	}

	return parts

}

func isBoundaryWhitespace(value rune) bool {
	return value == ' ' || value == '\n' || value == '\t' || value == '\r'
}

func formatMilliseconds(milliseconds int) string {
	if milliseconds <= 0 {
		return "unknown duration"
	}

	duration := time.Duration(milliseconds) * time.Millisecond
	minutes := int(duration.Minutes())
	seconds := int(duration.Seconds()) % 60
	if minutes > 0 {
		return fmt.Sprintf("%dm %02ds", minutes, seconds)
	}

	return fmt.Sprintf("%.1fs", float64(milliseconds)/1000)
}

func (service *Service) snapshot(id string) (VoiceJob, error) {
	service.mu.RLock()
	defer service.mu.RUnlock()

	job, ok := service.jobs[id]
	if !ok {
		return VoiceJob{}, ErrJobNotFound
	}

	return job.VoiceJob, nil
}

func (service *Service) failJobByID(id string, err error) {
	reason, retriable := classifyJobFailure(err)
	service.updateJob(id, func(job *storedJob) {
		job.Status = JobStatusFailed
		job.audioPartialPCM = nil
		job.audioPartialReady = false
		job.audioSegments = nil
		job.nativeTimingEvents = nil
		job.AudioSegmentDurationsMS = nil
		job.AudioSegmentLatenciesMS = nil
		job.Error = err.Error()
		if job.Stages.Optimization == StageStatusRunning {
			job.Stages.Optimization = StageStatusFailed
		}
		if job.Stages.Synthesis == StageStatusRunning {
			job.Stages.Synthesis = StageStatusFailed
		}
		if job.Stages.Checker == StageStatusRunning {
			job.Stages.Checker = StageStatusFailed
		}
		now := time.Now().UTC()
		job.CompletedAt = &now
		job.TerminalReason = reason
		job.Retriable = retriable
		setProgress(job, string(JobStatusFailed), "Job failed", err.Error(), job.Retries.CurrentSegment, job.Retries.TotalSegments)
	})
}

func (service *Service) cancelJobByID(id string) {
	service.updateJob(id, func(job *storedJob) {
		job.Status = JobStatusCancelled
		job.audioPartialPCM = nil
		job.audioPartialReady = false
		job.audioSegments = nil
		job.nativeTimingEvents = nil
		job.AudioSegmentDurationsMS = nil
		job.AudioSegmentLatenciesMS = nil
		job.Error = "cancelled by request"
		if job.Stages.Optimization == StageStatusRunning {
			job.Stages.Optimization = StageStatusFailed
		}
		if job.Stages.Synthesis == StageStatusRunning {
			job.Stages.Synthesis = StageStatusFailed
		}
		if job.Stages.Checker == StageStatusRunning {
			job.Stages.Checker = StageStatusFailed
		}
		now := time.Now().UTC()
		job.CompletedAt = &now
		job.TerminalReason = JobTerminalReasonUserCancelled
		job.Retriable = true
		setProgress(job, string(JobStatusCancelled), "Job cancelled", "Processing was cancelled by user request.", job.Retries.CurrentSegment, job.Retries.TotalSegments)
	})
}

func classifyJobFailure(err error) (JobTerminalReason, bool) {
	if err == nil {
		return JobTerminalReasonProviderFailed, true
	}
	message := err.Error()
	lowerMessage := strings.ToLower(message)
	if errors.Is(err, context.DeadlineExceeded) ||
		strings.Contains(lowerMessage, "timed out") ||
		strings.Contains(lowerMessage, "timeout") ||
		strings.Contains(lowerMessage, "deadline exceeded") {
		return JobTerminalReasonProviderTimeout, true
	}
	if strings.Contains(message, "voice checker cancelled") {
		return JobTerminalReasonValidationFailed, true
	}
	if strings.Contains(message, "reached max retries without completion") {
		return JobTerminalReasonValidationFailed, true
	}
	if strings.Contains(message, "cancelled unexpectedly") {
		return JobTerminalReasonProviderFailed, true
	}
	if errors.Is(err, context.Canceled) {
		return JobTerminalReasonSystemCancelled, true
	}
	if errors.Is(err, ErrRetryExhaust) {
		return JobTerminalReasonValidationFailed, true
	}
	if errors.Is(err, ErrVoiceNotFound) ||
		errors.Is(err, ErrProfileNotFound) ||
		errors.Is(err, ErrProfileMissingAudio) ||
		errors.Is(err, ErrProfileUnsupported) ||
		errors.Is(err, ErrProfileArtifactMissing) ||
		errors.Is(err, ErrProfileArtifactUnsupported) {
		return JobTerminalReasonConfigurationFailed, false
	}
	return JobTerminalReasonProviderFailed, true
}

func (service *Service) save(job storedJob) {
	service.mu.Lock()
	defer service.mu.Unlock()

	service.jobs[job.ID] = job
}

func (service *Service) updateJob(id string, mutate func(*storedJob)) {
	service.mu.Lock()
	defer service.mu.Unlock()

	job, ok := service.jobs[id]
	if !ok {
		return
	}

	mutate(&job)
	job.UpdatedAt = time.Now().UTC()
	service.jobs[id] = job
}

func toVoiceCheck(check agents.VoiceCheckResult) VoiceCheck {
	return VoiceCheck{
		Complete:    check.Complete,
		Transcript:  check.Transcript,
		ResumeText:  check.ResumeText,
		NeedsResume: check.NeedsResume,
		Reason:      check.Reason,
		Provider:    check.Provider,
		Similarity:  check.Similarity,
	}
}

func updateJobSegment(job *storedJob, segmentIndex int, mutate func(*JobSegment)) {
	if segmentIndex <= 0 || segmentIndex > len(job.Segments) {
		return
	}
	mutate(&job.Segments[segmentIndex-1])
}

func optimizerName(optimizer VoiceOptimizer) string {
	named, ok := optimizer.(namedVoiceOptimizer)
	if !ok {
		return "unknown"
	}

	return named.ProviderName()
}

func initialStages() PipelineStages {
	return PipelineStages{
		Optimization: StageStatusWaiting,
		Synthesis:    StageStatusWaiting,
		Checker:      StageStatusWaiting,
	}
}

func setProgress(job *storedJob, activeStage string, message string, detail string, currentSegment int, totalSegments int) {
	startedAt := time.Now().UTC()
	job.Progress = JobProgress{
		Message:        message,
		Detail:         detail,
		ActiveStage:    activeStage,
		CurrentSegment: currentSegment,
		TotalSegments:  totalSegments,
		StartedAt:      &startedAt,
	}
}

func newID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}

	return hex.EncodeToString(bytes)
}
