package pipeline

import (
	"fmt"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/policy"
)

func (service *Service) prepareCreateJob(request CreateJobRequest) (storedJob, error) {
	inputText := strings.TrimSpace(request.Text)
	projectID := strings.TrimSpace(request.ProjectID)
	bookSourceID := strings.TrimSpace(request.BookSourceID)
	preparedSourceID := strings.TrimSpace(request.PreparedSourceID)
	temporarySourceID := strings.TrimSpace(request.TemporarySourceID)
	progressTargetID := strings.TrimSpace(request.ProgressTargetID)
	speechPolicyProfile := strings.TrimSpace(request.SpeechPolicyProfile)
	speechPolicyOverrides := policy.NormalizeOverrides(request.SpeechPolicyOverrides)
	sourceKind := strings.TrimSpace(request.SourceKind)
	voiceProfileID := strings.TrimSpace(request.VoiceProfileID)
	voiceLanguage := strings.TrimSpace(request.VoiceLanguage)
	ttsEngine := normalizeTTSEngineID(request.TTSEngine)
	engineOptions := sanitizeEngineOptions(request.EngineOptions)
	ttsVoice := strings.TrimSpace(request.TTSVoice)
	ttsLanguage := strings.TrimSpace(request.TTSLanguage)
	config := resolveJobConfig(request)
	voiceID := strings.TrimSpace(request.VoiceID)
	var selectedVoice Voice
	usesCloneVoice := false
	adaptiveMode := config.performanceMode == PerformanceModeThroughput
	maxRetries := service.options.MaxRetries
	if !config.pipelineOptions.AutoRetry {
		maxRetries = 1
	}
	if inputText == "" {
		return storedJob{}, ErrEmptyText
	}
	if projectID == "" && temporarySourceID == "" {
		projectID = defaultProjectID
	}
	if temporarySourceID != "" {
		if _, err := service.getTemporarySource(temporarySourceID, true); err != nil {
			return storedJob{}, err
		}
	} else {
		if _, err := service.GetProject(projectID); err != nil {
			return storedJob{}, err
		}
	}
	if voiceID != "" {
		voice, err := service.ResolveVoice(voiceID)
		if err != nil {
			return storedJob{}, err
		}
		selectedVoice = voice
		switch voice.Kind {
		case VoiceKindNative:
			if (ttsEngine == TTSEngineKokoro || ttsEngine == TTSEngineAuto) && ttsVoice == "" {
				ttsVoice = voiceSynthesisName(voice)
			}
			if (ttsEngine == TTSEngineKokoro || ttsEngine == TTSEngineAuto) && ttsLanguage == "" {
				ttsLanguage = voice.LangCode
			}
		case VoiceKindClone:
			usesCloneVoice = true
			if normalizeTTSEngineID(request.TTSEngine) == TTSEngineAuto {
				ttsEngine = TTSEngineKokoroClone
			}
			if voiceLanguage == "" {
				voiceLanguage = voice.LangCode
			}
		}
	}
	if voiceProfileID != "" && !config.pipelineOptions.VoiceClone {
		voiceProfileID = ""
		voiceLanguage = ""
	}
	if usesCloneVoice && !config.pipelineOptions.VoiceClone {
		usesCloneVoice = false
		voiceID = ""
		if normalizeTTSEngineID(request.TTSEngine) == TTSEngineAuto {
			ttsEngine = TTSEngineAuto
		}
	}
	if voiceProfileID != "" {
		profile, err := service.GetVoiceProfile(voiceProfileID)
		if err != nil {
			return storedJob{}, err
		}
		if profile.Status != VoiceProfileStatusReady {
			return storedJob{}, fmt.Errorf("voice profile not ready: %s", profile.ID)
		}
		if voiceLanguage == "" && profile.Language != "" {
			voiceLanguage = profile.Language
		}
		if !voiceProfileTargetReadyForEngine(profile, ttsEngine) {
			return storedJob{}, fmt.Errorf("%w: prepare the %s target for %s first", ErrProfileArtifactMissing, voiceProfileTargetLabel(voiceProfileTargetIDForEngine(ttsEngine)), profile.Name)
		}
		if service.readyVoiceProfileArtifact(profile, ttsEngine) == nil {
			switch normalizeTTSEngineID(ttsEngine) {
			case TTSEngineSupertonic, TTSEngineKokoroEmbed:
				return storedJob{}, fmt.Errorf("%w: build the %s artifact for %s first", ErrProfileArtifactMissing, normalizeTTSEngineID(ttsEngine), profile.Name)
			}
		}
	}
	isReferenceRequest := voiceProfileID != "" || usesCloneVoice
	if voiceProfileID != "" {
		profile, _ := service.GetVoiceProfile(voiceProfileID)
		if service.readyVoiceProfileArtifact(profile, ttsEngine) != nil {
			isReferenceRequest = false
		}
	}
	if _, _, err := service.resolveTTSEngine(ttsEngine, isReferenceRequest); err != nil {
		return storedJob{}, err
	}

	now := time.Now().UTC()
	voiceProfileName := ""
	if voiceProfileID != "" {
		profile, _ := service.GetVoiceProfile(voiceProfileID)
		voiceProfileName = profile.Name
	} else if usesCloneVoice {
		voiceProfileName = selectedVoice.Name
	}

	return storedJob{
		VoiceJob: VoiceJob{
			ID:                    newID(),
			ProjectID:             projectID,
			BookSourceID:          bookSourceID,
			BookScope:             cloneBookScope(request.BookScope),
			PreparedSourceID:      preparedSourceID,
			TemporarySourceID:     temporarySourceID,
			SelectedBlockIDs:      append([]string(nil), request.SelectedBlockIDs...),
			SourceKind:            sourceKind,
			ProgressTargetID:      progressTargetID,
			SpeechPolicyProfile:   speechPolicyProfile,
			SpeechPolicyOverrides: speechPolicyOverrides,
			Locale:                request.Locale,
			SpeechRenderApplied:   request.SpeechRenderApplied,
			Status:                JobStatusQueued,
			Phase:                 JobPipelinePhaseSubmit,
			Stages:                initialStages(),
			AdaptiveMode:          adaptiveMode,
			RunMode:               config.runMode,
			PerformanceMode:       config.performanceMode,
			PipelineOptions:       config.pipelineOptions,
			VoiceProfileID:        voiceProfileID,
			VoiceProfileName:      voiceProfileName,
			VoiceProfileLanguage:  voiceLanguage,
			VoiceID:               voiceID,
			TTSEngine:             ttsEngine,
			EngineOptions:         engineOptions,
			TTSVoice:              ttsVoice,
			TTSLanguage:           ttsLanguage,
			InputText:             inputText,
			Progress: JobProgress{
				Message: "Queued",
				Detail:  "Waiting to start voice optimization.",
			},
			Retries: RetryMetadata{
				MaxRetries: maxRetries,
				Attempts:   0,
			},
			CreatedAt: now,
			UpdatedAt: now,
		},
	}, nil
}
