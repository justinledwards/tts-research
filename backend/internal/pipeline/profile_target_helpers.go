package pipeline

import (
	"path/filepath"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
)

const (
	VoiceProfileTargetKokoroClone     = TTSEngineKokoroClone
	VoiceProfileTargetKokoroEmbed     = ResearchModuleKokoroEmbed
	VoiceProfileTargetSupertonicEmbed = ResearchModuleSupertonicEmbed
)

type VoiceProfileCreationOptions struct {
	Targets      []string
	AutoValidate *bool
}

func (options VoiceProfileCreationOptions) autoValidate() bool {
	return options.AutoValidate == nil || *options.AutoValidate
}

func defaultVoiceProfileTargetIDs() []string {
	return []string{VoiceProfileTargetKokoroClone}
}

func normalizeVoiceProfileTargetID(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	switch clean {
	case "", "kokoclone", "koko-clone", "kokoro.reference", "kokoro-reference":
		return VoiceProfileTargetKokoroClone
	case TTSEngineKokoroClone:
		return VoiceProfileTargetKokoroClone
	case "kokoro.embed", "kokoro_embed", TTSEngineKokoroEmbed:
		return VoiceProfileTargetKokoroEmbed
	case "supertonic", TTSEngineSupertonic, "supertonic.embed", "supertonic_embed", ResearchModuleSupertonicEmbed:
		return VoiceProfileTargetSupertonicEmbed
	default:
		return clean
	}
}

func normalizeVoiceProfileTargetIDs(targets []string) []string {
	if len(targets) == 0 {
		return defaultVoiceProfileTargetIDs()
	}
	normalized := make([]string, 0, len(targets))
	seen := map[string]struct{}{}
	hasExplicitTarget := false
	for _, target := range targets {
		if strings.TrimSpace(target) == "" {
			continue
		}
		hasExplicitTarget = true
		id := normalizeVoiceProfileTargetID(target)
		if id == "" {
			continue
		}
		switch id {
		case VoiceProfileTargetKokoroClone, VoiceProfileTargetKokoroEmbed, VoiceProfileTargetSupertonicEmbed:
		default:
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		normalized = append(normalized, id)
	}
	if len(normalized) == 0 && !hasExplicitTarget {
		return defaultVoiceProfileTargetIDs()
	}
	return normalized
}

func voiceProfileTargetLabel(id string) string {
	switch normalizeVoiceProfileTargetID(id) {
	case VoiceProfileTargetKokoroClone:
		return "Kokoro Clone"
	case VoiceProfileTargetKokoroEmbed:
		return "Kokoro Embed"
	case VoiceProfileTargetSupertonicEmbed:
		return "Supertonic Embed"
	default:
		return id
	}
}

func voiceProfileTargetEngineID(id string) string {
	switch normalizeVoiceProfileTargetID(id) {
	case VoiceProfileTargetKokoroClone:
		return TTSEngineKokoroClone
	case VoiceProfileTargetKokoroEmbed:
		return TTSEngineKokoroEmbed
	case VoiceProfileTargetSupertonicEmbed:
		return TTSEngineSupertonic
	default:
		return normalizeTTSEngineID(id)
	}
}

func voiceProfileTargetModuleID(id string) string {
	switch normalizeVoiceProfileTargetID(id) {
	case VoiceProfileTargetKokoroEmbed:
		return ResearchModuleKokoroEmbed
	case VoiceProfileTargetSupertonicEmbed:
		return ResearchModuleSupertonicEmbed
	default:
		return ""
	}
}

func voiceProfileTargetIDForEngine(engineID string) string {
	switch normalizeTTSEngineID(engineID) {
	case TTSEngineAuto, TTSEngineKokoro, TTSEngineKokoroClone:
		return VoiceProfileTargetKokoroClone
	case TTSEngineKokoroEmbed:
		return VoiceProfileTargetKokoroEmbed
	case TTSEngineSupertonic:
		return VoiceProfileTargetSupertonicEmbed
	default:
		return ""
	}
}

func failedReadyTargetValidation(
	message string,
	result agents.TTSResult,
	generatedPath string,
	expectedTranscript string,
	asrTranscript string,
	provider string,
) VoiceProfileTargetValidation {
	now := time.Now().UTC()
	generatedAudio := ""
	if strings.TrimSpace(generatedPath) != "" {
		generatedAudio = filepath.Base(generatedPath)
	}
	return VoiceProfileTargetValidation{
		Status:             VoiceProfileTargetStatusFailed,
		GeneratedAudio:     generatedAudio,
		GeneratedPath:      generatedPath,
		ExpectedTranscript: expectedTranscript,
		ASRTranscript:      asrTranscript,
		Provider:           firstNonEmpty(provider, result.Provider),
		MeasuredAt:         &now,
		Error:              message,
	}
}

func voiceProfileTargetHasReadyArtifact(profile VoiceProfile, targetID string) bool {
	moduleID := voiceProfileTargetModuleID(targetID)
	if moduleID == "" {
		return false
	}
	artifact := profile.CloneArtifacts[moduleID]
	return artifact.Status == VoiceProfileCloneArtifactStatusReady && strings.TrimSpace(artifact.Path) != ""
}

func voiceProfileTargetCancelKey(profileID string, targetID string) string {
	return strings.TrimSpace(profileID) + ":" + normalizeVoiceProfileTargetID(targetID)
}
