package pipeline

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/agents"
)

const voicePreviewMaxRunes = 320

type VoicePreviewResult struct {
	Audio       []byte
	ContentType string
	DurationMS  int
	Provider    string
	Voice       string
}

func (service *Service) CreateVoicePreview(
	ctx context.Context,
	request CreateJobRequest,
) (VoicePreviewResult, error) {
	request.Text = trimVoicePreviewText(request.Text)
	job, err := service.prepareCreateJob(request)
	if err != nil {
		return VoicePreviewResult{}, err
	}

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
			return VoicePreviewResult{}, err
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
			return VoicePreviewResult{}, fmt.Errorf("load voice profile: %w", err)
		}
		profileRef = profile.ReferencePath
		if profileRef == "" {
			return VoicePreviewResult{}, ErrProfileMissingAudio
		}
		if profileLanguage == "" {
			profileLanguage = profile.Language
		}
		if artifact := service.readyVoiceProfileArtifact(profile.VoiceProfile, ttsEngine); artifact != nil {
			profileArtifact = artifact
		}
	}

	isReferenceProfile := profileRef != "" && profileArtifact == nil
	resolvedEngine, agent, err := service.resolveTTSEngine(ttsEngine, isReferenceProfile)
	if err != nil {
		return VoicePreviewResult{}, err
	}
	var agentArtifact *agents.VoiceProfileArtifact
	if profileArtifact != nil {
		artifact := service.profileArtifactForAgent(*profileArtifact)
		agentArtifact = &artifact
	}
	result, err := synthesizeWithAgent(
		ctx,
		agent,
		job.InputText,
		agentArtifact,
		isReferenceProfile,
		profileRef,
		profileLanguage,
		ttsVoice,
		ttsLanguage,
		ssmlForSegment(job.InputText, firstNonEmpty(ttsLanguage, profileLanguage)),
		service.ttsEngineSupportsSSML(resolvedEngine),
	)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return VoicePreviewResult{}, err
		}
		return VoicePreviewResult{}, fmt.Errorf("synthesize voice preview: %w", err)
	}
	if len(result.Audio) == 0 {
		return VoicePreviewResult{}, fmt.Errorf("synthesize voice preview: empty audio")
	}
	if result.Provider == "" {
		result.Provider = resolvedEngine
	}
	if result.ContentType == "" {
		result.ContentType = "audio/wav"
	}
	return VoicePreviewResult{
		Audio:       result.Audio,
		ContentType: result.ContentType,
		DurationMS:  result.DurationMS,
		Provider:    result.Provider,
		Voice:       result.Voice,
	}, nil
}

func trimVoicePreviewText(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	runes := []rune(trimmed)
	if len(runes) <= voicePreviewMaxRunes {
		return trimmed
	}
	return strings.TrimSpace(string(runes[:voicePreviewMaxRunes]))
}
