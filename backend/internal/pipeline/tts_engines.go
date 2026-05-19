package pipeline

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/ssml"
)

const (
	TTSEngineAuto        = "auto"
	TTSEngineKokoro      = "kokoro"
	TTSEngineKokoroClone = "kokoro-clone"
	TTSEngineKokoroEmbed = "kokoro-embed"
	TTSEngineSupertonic  = "supertonic-3"
)

func normalizeTTSEngineID(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return TTSEngineAuto
	}
	if clean == "supertonic" {
		return TTSEngineSupertonic
	}
	return clean
}

func sanitizeEngineOptions(options map[string]string) map[string]string {
	if len(options) == 0 {
		return nil
	}
	clean := make(map[string]string, len(options))
	for key, value := range options {
		cleanKey := strings.TrimSpace(key)
		if cleanKey == "" {
			continue
		}
		clean[cleanKey] = strings.TrimSpace(value)
	}
	if len(clean) == 0 {
		return nil
	}
	return clean
}

func initializeTTSEngines(defaultEngine string, defaultAgent TTSAgent, registrations []TTSEngineRegistration) (string, map[string]TTSEngineRegistration) {
	normalizedDefault := normalizeTTSEngineID(defaultEngine)
	if normalizedDefault == TTSEngineAuto {
		normalizedDefault = TTSEngineKokoro
	}

	engines := make(map[string]TTSEngineRegistration, len(registrations)+2)
	for _, registration := range registrations {
		id := normalizeTTSEngineID(registration.ID)
		if id == TTSEngineAuto || id == "" {
			continue
		}
		registration.ID = id
		registration.Diagnostics.ID = id
		registration.Diagnostics.Default = false
		engines[id] = registration
	}

	if _, ok := engines[normalizedDefault]; !ok {
		engines[normalizedDefault] = TTSEngineRegistration{
			ID:    normalizedDefault,
			Agent: defaultAgent,
			Diagnostics: TTSEngineDiagnostics{
				ID:            normalizedDefault,
				Label:         defaultEngineLabel(normalizedDefault),
				Status:        "ready",
				Local:         true,
				SupportsVoice: true,
			},
		}
	}
	if _, ok := engines[TTSEngineKokoroClone]; !ok {
		if _, supportsReference := defaultAgent.(TTSWithReference); supportsReference {
			engines[TTSEngineKokoroClone] = TTSEngineRegistration{
				ID:    TTSEngineKokoroClone,
				Agent: defaultAgent,
				Diagnostics: TTSEngineDiagnostics{
					ID:                TTSEngineKokoroClone,
					Label:             "Kokoro Clone",
					Status:            "ready",
					Local:             true,
					SupportsVoice:     true,
					SupportsReference: true,
					Setup:             "Uses the selected Voice Profile reference with the Kokoro clone worker.",
				},
			}
		}
	}

	if normalizedDefault == TTSEngineKokoroClone {
		normalizedDefault = TTSEngineKokoro
	}
	for id, registration := range engines {
		diagnostics := registration.Diagnostics
		diagnostics.ID = id
		diagnostics.Default = id == normalizedDefault
		registration.Diagnostics = diagnostics
		engines[id] = registration
	}
	return normalizedDefault, engines
}

func defaultEngineLabel(id string) string {
	switch id {
	case TTSEngineKokoro:
		return "Kokoro"
	case TTSEngineKokoroClone:
		return "Kokoro Clone"
	case TTSEngineKokoroEmbed:
		return "Kokoro Embed"
	case TTSEngineSupertonic:
		return "Supertonic 3"
	default:
		if id == "" {
			return "TTS"
		}
		return id
	}
}

func (service *Service) ListTTSEngines() []TTSEngineDiagnostics {
	service.mu.RLock()
	defer service.mu.RUnlock()

	engines := make([]TTSEngineDiagnostics, 0, len(service.ttsEngines)+1)
	engines = append(engines, TTSEngineDiagnostics{
		ID:      TTSEngineAuto,
		Label:   "Auto",
		Status:  "ready",
		Default: false,
		Local:   true,
		Reason:  "Chooses Kokoro for dependable long-form reading and Kokoro Clone when a voice profile is selected.",
		Setup:   "Use Auto unless you are evaluating a specific model.",
	})
	for id, registration := range service.ttsEngines {
		diagnostics := registration.Diagnostics
		diagnostics.ID = id
		diagnostics.Default = id == service.defaultTTS
		if diagnostics.Status == "" {
			if registration.Agent == nil {
				diagnostics.Status = "unavailable"
			} else {
				diagnostics.Status = "ready"
			}
		}
		engines = append(engines, diagnostics)
	}
	sort.SliceStable(engines, func(left int, right int) bool {
		order := map[string]int{
			TTSEngineAuto:        0,
			TTSEngineKokoro:      1,
			TTSEngineKokoroClone: 2,
			TTSEngineKokoroEmbed: 3,
			TTSEngineSupertonic:  4,
			"dramabox":           5,
			"scenema-audio":      6,
		}
		leftOrder, leftOK := order[engines[left].ID]
		rightOrder, rightOK := order[engines[right].ID]
		if leftOK && rightOK {
			return leftOrder < rightOrder
		}
		if leftOK {
			return true
		}
		if rightOK {
			return false
		}
		return engines[left].Label < engines[right].Label
	})
	return engines
}

func (service *Service) resolveTTSEngine(engineID string, isReferenceProfile bool) (string, TTSAgent, error) {
	requested := normalizeTTSEngineID(engineID)
	if requested == TTSEngineAuto {
		if isReferenceProfile {
			requested = TTSEngineKokoroClone
		} else {
			requested = service.defaultTTS
		}
	}
	if requested == TTSEngineKokoroClone && !isReferenceProfile {
		requested = TTSEngineKokoro
	}

	service.mu.RLock()
	registration, ok := service.ttsEngines[requested]
	service.mu.RUnlock()
	if !ok || registration.Agent == nil {
		return requested, nil, fmt.Errorf("tts engine %q is unavailable", requested)
	}
	if isReferenceProfile {
		if _, ok := registration.Agent.(TTSWithReference); !ok {
			return requested, nil, ErrProfileUnsupported
		}
	}
	return requested, registration.Agent, nil
}

func (service *Service) ttsEngineSupportsSSML(engineID string) bool {
	service.mu.RLock()
	registration, ok := service.ttsEngines[normalizeTTSEngineID(engineID)]
	service.mu.RUnlock()
	return ok && registration.Diagnostics.SupportsSSML
}

func synthesizeWithAgent(
	ctx context.Context,
	agent TTSAgent,
	text string,
	profileArtifact *agents.VoiceProfileArtifact,
	isReferenceProfile bool,
	referencePath string,
	referenceLanguage string,
	voice string,
	language string,
	ssmlText string,
	supportsSSML bool,
) (agents.TTSResult, error) {
	if profileArtifact != nil {
		withArtifact, ok := agent.(TTSWithProfileArtifact)
		if !ok {
			return agents.TTSResult{}, ErrProfileArtifactUnsupported
		}
		return withArtifact.SynthesizeWithProfileArtifact(ctx, text, *profileArtifact, firstNonEmpty(language, referenceLanguage))
	}
	if isReferenceProfile {
		withReference, ok := agent.(TTSWithReference)
		if !ok {
			return agents.TTSResult{}, ErrProfileUnsupported
		}
		return withReference.SynthesizeWithReference(ctx, text, referencePath, referenceLanguage)
	}
	if withVoice, ok := agent.(TTSWithVoice); ok &&
		(strings.TrimSpace(voice) != "" || strings.TrimSpace(language) != "") {
		if supportsSSML {
			if withSSML, ok := agent.(TTSWithSSML); ok && strings.TrimSpace(ssmlText) != "" {
				return withSSML.SynthesizeSSML(ctx, ssmlText, text, voice, language)
			}
		}
		return withVoice.SynthesizeWithVoice(ctx, text, voice, language)
	}
	if supportsSSML {
		if withSSML, ok := agent.(TTSWithSSML); ok && strings.TrimSpace(ssmlText) != "" {
			return withSSML.SynthesizeSSML(ctx, ssmlText, text, voice, language)
		}
	}
	result, err := agent.Synthesize(ctx, text)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return agents.TTSResult{}, err
		}
		return agents.TTSResult{}, err
	}
	return result, nil
}

func ssmlForSegment(text string, language string) string {
	return ssml.Serialize(ssml.Document{Text: text, Lang: language})
}
