package pipeline

import (
	"context"
	"fmt"
	"os"
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

func newVoiceProfileTargets(targets []string, autoValidate bool, now time.Time) map[string]VoiceProfileTarget {
	targetIDs := normalizeVoiceProfileTargetIDs(targets)
	status := VoiceProfileTargetStatusSelected
	if autoValidate {
		status = VoiceProfileTargetStatusQueued
	}
	items := make(map[string]VoiceProfileTarget, len(targetIDs))
	for _, id := range targetIDs {
		items[id] = VoiceProfileTarget{
			ID:        id,
			Label:     voiceProfileTargetLabel(id),
			EngineID:  voiceProfileTargetEngineID(id),
			ModuleID:  voiceProfileTargetModuleID(id),
			Status:    status,
			Selected:  true,
			CreatedAt: now,
			UpdatedAt: now,
		}
	}
	return items
}

func cloneVoiceProfileTargets(targets map[string]VoiceProfileTarget) map[string]VoiceProfileTarget {
	if len(targets) == 0 {
		return map[string]VoiceProfileTarget{}
	}
	cloned := make(map[string]VoiceProfileTarget, len(targets))
	for key, target := range targets {
		if target.Validation != nil {
			validation := *target.Validation
			target.Validation = &validation
		}
		cloned[key] = target
	}
	return cloned
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

func voiceProfileTargetReadyForEngine(profile VoiceProfile, engineID string) bool {
	targetID := voiceProfileTargetIDForEngine(engineID)
	if targetID == "" {
		return true
	}
	if target, ok := profile.CloneTargets[targetID]; ok {
		return target.Status == VoiceProfileTargetStatusReady
	}
	if len(profile.CloneTargets) > 0 {
		return false
	}
	if targetID == VoiceProfileTargetKokoroClone {
		return true
	}
	switch targetID {
	case VoiceProfileTargetKokoroEmbed:
		artifact := profile.CloneArtifacts[ResearchModuleKokoroEmbed]
		return artifact.Status == VoiceProfileCloneArtifactStatusReady
	case VoiceProfileTargetSupertonicEmbed:
		artifact := profile.CloneArtifacts[ResearchModuleSupertonicEmbed]
		return artifact.Status == VoiceProfileCloneArtifactStatusReady
	default:
		return true
	}
}

func (service *Service) QueueVoiceProfileTarget(ctx context.Context, profileID string, targetID string, autoValidate bool) (VoiceProfile, error) {
	targets := normalizeVoiceProfileTargetIDs([]string{targetID})
	if len(targets) == 0 {
		return VoiceProfile{}, ErrProfileArtifactUnsupported
	}
	profile, err := service.queueVoiceProfileTargets(profileID, targets, autoValidate)
	if err != nil {
		return VoiceProfile{}, err
	}
	if autoValidate {
		service.startVoiceProfileTargetPreparation(profile.ID, targets, true)
	}
	_ = ctx
	return profile, nil
}

func (service *Service) CancelVoiceProfileTarget(profileID string, targetID string) (VoiceProfile, error) {
	targetID = normalizeVoiceProfileTargetID(targetID)
	cancel := service.takeVoiceProfileTargetCancel(profileID, targetID)
	if cancel != nil {
		cancel()
	}
	return service.cancelVoiceProfileTargetByID(profileID, targetID)
}

func (service *Service) queueVoiceProfileTargets(profileID string, targets []string, autoValidate bool) (VoiceProfile, error) {
	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		return VoiceProfile{}, err
	}
	targetIDs := normalizeVoiceProfileTargetIDs(targets)
	if len(targetIDs) == 0 {
		return VoiceProfile{}, ErrProfileArtifactUnsupported
	}
	now := time.Now().UTC()
	profile.CloneTargets = cloneVoiceProfileTargets(profile.CloneTargets)
	for _, targetID := range targetIDs {
		target := profile.CloneTargets[targetID]
		if target.ID == "" {
			target.ID = targetID
			target.Label = voiceProfileTargetLabel(targetID)
			target.EngineID = voiceProfileTargetEngineID(targetID)
			target.ModuleID = voiceProfileTargetModuleID(targetID)
			target.CreatedAt = now
		}
		target.Selected = true
		target.UpdatedAt = now
		target.Error = ""
		if autoValidate {
			target.Status = VoiceProfileTargetStatusQueued
		} else if target.Status == "" ||
			target.Status == VoiceProfileTargetStatusFailed ||
			target.Status == VoiceProfileTargetStatusCancelled {
			target.Status = VoiceProfileTargetStatusSelected
		}
		profile.CloneTargets[targetID] = target
	}
	if err := service.persistVoiceProfile(profile); err != nil {
		return VoiceProfile{}, err
	}
	return profile.VoiceProfile, nil
}

func (service *Service) startVoiceProfileTargetPreparation(profileID string, targets []string, autoValidate bool) {
	targetIDs := normalizeVoiceProfileTargetIDs(targets)
	go func() {
		for _, targetID := range targetIDs {
			if service.voiceProfileTargetIsCancelled(profileID, targetID) {
				continue
			}
			runCtx, cancel := context.WithCancel(context.Background())
			service.registerVoiceProfileTargetCancel(profileID, targetID, cancel)
			func(ctx context.Context, targetID string) {
				defer service.clearVoiceProfileTargetCancel(profileID, targetID)
				service.prepareVoiceProfileTarget(ctx, profileID, targetID, autoValidate)
			}(runCtx, targetID)
		}
	}()
}

func (service *Service) voiceProfileTargetIsCancelled(profileID string, targetID string) bool {
	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		return true
	}
	target := profile.CloneTargets[normalizeVoiceProfileTargetID(targetID)]
	return target.Status == VoiceProfileTargetStatusCancelled
}

func (service *Service) prepareVoiceProfileTarget(ctx context.Context, profileID string, targetID string, autoValidate bool) {
	targetID = normalizeVoiceProfileTargetID(targetID)
	if isContextCancellation(ctx, nil) {
		_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
		return
	}
	switch targetID {
	case VoiceProfileTargetKokoroClone:
		if autoValidate {
			service.validateVoiceProfileTarget(ctx, profileID, targetID)
			return
		}
		if isContextCancellation(ctx, nil) {
			_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
			return
		}
		_, _ = service.updateVoiceProfileTarget(profileID, targetID, VoiceProfileTargetStatusReady, nil)
	case VoiceProfileTargetKokoroEmbed, VoiceProfileTargetSupertonicEmbed:
		moduleID := voiceProfileTargetModuleID(targetID)
		if moduleID == "" {
			_, _ = service.failVoiceProfileTarget(profileID, targetID, "unsupported profile target")
			return
		}
		_, _ = service.updateVoiceProfileTarget(profileID, targetID, VoiceProfileTargetStatusBuilding, nil)
		if _, err := service.BuildVoiceProfileArtifact(ctx, profileID, moduleID, nil); err != nil {
			if isContextCancellation(ctx, err) {
				_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
				return
			}
			_, _ = service.failVoiceProfileTarget(profileID, targetID, err.Error())
			return
		}
		if autoValidate {
			service.validateVoiceProfileTarget(ctx, profileID, targetID)
			return
		}
		if isContextCancellation(ctx, nil) {
			_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
			return
		}
		_, _ = service.updateVoiceProfileTarget(profileID, targetID, VoiceProfileTargetStatusReady, nil)
	default:
		_, _ = service.failVoiceProfileTarget(profileID, targetID, "unsupported profile target")
	}
}

func (service *Service) validateVoiceProfileTarget(ctx context.Context, profileID string, targetID string) {
	targetID = normalizeVoiceProfileTargetID(targetID)
	if isContextCancellation(ctx, nil) {
		_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
		return
	}
	_, _ = service.updateVoiceProfileTarget(profileID, targetID, VoiceProfileTargetStatusValidating, func(target *VoiceProfileTarget) {
		target.Validation = &VoiceProfileTargetValidation{Status: VoiceProfileTargetStatusValidating}
	})
	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		if isContextCancellation(ctx, err) {
			_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
			return
		}
		_, _ = service.failVoiceProfileTarget(profileID, targetID, err.Error())
		return
	}
	expectedTranscript, transcriptProvider := service.referenceTranscriptForProfile(ctx, profile.VoiceProfile)
	result, generatedPath, err := service.synthesizeVoiceProfileTargetSample(ctx, profile.VoiceProfile, targetID, expectedTranscript)
	if err != nil {
		if isContextCancellation(ctx, err) {
			_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
			return
		}
		if voiceProfileTargetHasReadyArtifact(profile.VoiceProfile, targetID) {
			validation := failedReadyTargetValidation(
				fmt.Sprintf("target validation sample failed: %s", err.Error()),
				result,
				generatedPath,
				expectedTranscript,
				"",
				transcriptProvider,
			)
			_, _ = service.completeVoiceProfileTargetValidation(profileID, targetID, validation)
			return
		}
		_, _ = service.failVoiceProfileTarget(profileID, targetID, err.Error())
		return
	}
	if service.checker == nil {
		if isContextCancellation(ctx, nil) {
			_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
			return
		}
		validation := failedReadyTargetValidation(
			"target transcript validation is not configured",
			result,
			generatedPath,
			expectedTranscript,
			"",
			firstNonEmpty(transcriptProvider, result.Provider),
		)
		_, _ = service.completeVoiceProfileTargetValidation(profileID, targetID, validation)
		return
	}
	check, err := service.checker.Check(ctx, expectedTranscript, result.Audio)
	if err != nil {
		if isContextCancellation(ctx, err) {
			_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
			return
		}
		validation := failedReadyTargetValidation(
			fmt.Sprintf("target transcript validation failed: %s", err.Error()),
			result,
			generatedPath,
			expectedTranscript,
			"",
			firstNonEmpty(transcriptProvider, result.Provider),
		)
		_, _ = service.completeVoiceProfileTargetValidation(profileID, targetID, validation)
		return
	}
	transcriptSimilarity := clamp01(check.Similarity)
	speakerScore := VoiceProfileLikenessResult{}
	if service.options.VoiceProfileLikenessScorer != nil {
		activeToken, _ := service.activeVoiceProfileHuggingFaceToken()
		if setupWarning := service.voiceProfileSpeakerLikenessSetupWarning(activeToken); setupWarning != "" {
			validation := failedReadyTargetValidation(
				setupWarning,
				result,
				generatedPath,
				expectedTranscript,
				check.Transcript,
				firstNonEmpty(check.Provider, transcriptProvider, result.Provider),
			)
			validation.TranscriptSimilarity = transcriptSimilarity
			validation.Score = transcriptSimilarity
			if targetID == VoiceProfileTargetKokoroClone {
				_ = service.updateVoiceProfileLikenessFailureFromTarget(profileID, validation)
			}
			_, _ = service.completeVoiceProfileTargetValidation(profileID, targetID, validation)
			return
		}
		speakerScore, err = service.options.VoiceProfileLikenessScorer.ScoreVoiceProfileLikeness(ctx, VoiceProfileLikenessRequest{
			ReferencePath: profile.ReferencePath,
			GeneratedPath: generatedPath,
			Model:         service.options.VoiceProfileEmbeddingModel,
			Token:         activeToken,
		})
		if err != nil {
			if isContextCancellation(ctx, err) {
				_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
				return
			}
			validation := failedReadyTargetValidation(
				fmt.Sprintf("target speaker likeness failed: %s", err.Error()),
				result,
				generatedPath,
				expectedTranscript,
				check.Transcript,
				firstNonEmpty(check.Provider, transcriptProvider, result.Provider),
			)
			validation.TranscriptSimilarity = transcriptSimilarity
			validation.Score = transcriptSimilarity
			if targetID == VoiceProfileTargetKokoroClone {
				_ = service.updateVoiceProfileLikenessFailureFromTarget(profileID, validation)
			}
			_, _ = service.completeVoiceProfileTargetValidation(profileID, targetID, validation)
			return
		}
	}
	if isContextCancellation(ctx, nil) {
		_, _ = service.cancelVoiceProfileTargetByID(profileID, targetID)
		return
	}
	speakerSimilarity := clamp01(speakerScore.SpeakerSimilarity)
	if speakerSimilarity == 0 && speakerScore.Score > 0 {
		speakerSimilarity = clamp01(speakerScore.Score)
	}
	combined := transcriptSimilarity
	if speakerSimilarity > 0 {
		combined = clamp01((speakerSimilarity + transcriptSimilarity) / 2)
	}
	now := time.Now().UTC()
	validation := VoiceProfileTargetValidation{
		Status:               VoiceProfileTargetStatusReady,
		Score:                combined,
		SpeakerSimilarity:    speakerSimilarity,
		TranscriptSimilarity: transcriptSimilarity,
		GeneratedAudio:       filepath.Base(generatedPath),
		GeneratedPath:        generatedPath,
		ExpectedTranscript:   expectedTranscript,
		ASRTranscript:        check.Transcript,
		Provider:             firstNonEmpty(check.Provider, transcriptProvider, result.Provider),
		Model:                speakerScore.EmbeddingModel,
		MeasuredAt:           &now,
	}
	if targetID == VoiceProfileTargetKokoroClone {
		_ = service.updateVoiceProfileLikenessFromTarget(profileID, validation)
	}
	_, _ = service.completeVoiceProfileTargetValidation(profileID, targetID, validation)
}

func (service *Service) voiceProfileSpeakerLikenessSetupWarning(activeToken string) string {
	model := strings.TrimSpace(service.options.VoiceProfileEmbeddingModel)
	if model == "" {
		model = defaultVoiceProfileEmbeddingModel
	}
	if strings.TrimSpace(activeToken) != "" {
		return ""
	}
	modelKey := strings.ToLower(model)
	if modelKey == defaultVoiceProfileEmbeddingModel || strings.HasPrefix(modelKey, "pyannote/") {
		return fmt.Sprintf(
			"target speaker likeness needs access to %s. Set PYANNOTE_AUTH_TOKEN or HF_TOKEN, or set VOICE_PROFILE_EMBEDDING_MODEL to a local embedding model. Rendering remains available.",
			model,
		)
	}
	return ""
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

func (service *Service) referenceTranscriptForProfile(ctx context.Context, profile VoiceProfile) (string, string) {
	fallback := strings.TrimSpace(service.options.VoiceProfileLikenessCalibrationText)
	if fallback == "" {
		fallback = defaultVoiceProfileLikenessCalibrationText
	}
	referencePath := strings.TrimSpace(profile.ReferencePath)
	if referencePath == "" || service.checker == nil {
		return fallback, ""
	}
	audioBytes, err := os.ReadFile(referencePath)
	if err != nil {
		return fallback, ""
	}
	check, err := service.checker.Check(ctx, "", audioBytes)
	if err != nil {
		return fallback, ""
	}
	transcript := strings.TrimSpace(check.Transcript)
	if transcript == "" {
		return fallback, check.Provider
	}
	return transcript, check.Provider
}

func (service *Service) synthesizeVoiceProfileTargetSample(
	ctx context.Context,
	profile VoiceProfile,
	targetID string,
	text string,
) (agents.TTSResult, string, error) {
	if strings.TrimSpace(profile.ReferencePath) == "" {
		return agents.TTSResult{}, "", ErrProfileMissingAudio
	}
	targetID = normalizeVoiceProfileTargetID(targetID)
	outputDir := filepath.Join(filepath.Dir(profile.ReferencePath), "validations", safeDataPathID(targetID))
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return agents.TTSResult{}, "", err
	}
	var result agents.TTSResult
	var err error
	switch targetID {
	case VoiceProfileTargetKokoroClone:
		_, agent, resolveErr := service.resolveTTSEngine(TTSEngineKokoroClone, true)
		if resolveErr != nil {
			return agents.TTSResult{}, "", resolveErr
		}
		withReference, ok := agent.(TTSWithReference)
		if !ok {
			return agents.TTSResult{}, "", ErrProfileUnsupported
		}
		result, err = withReference.SynthesizeWithReference(ctx, text, profile.ReferencePath, profile.Language)
	case VoiceProfileTargetKokoroEmbed, VoiceProfileTargetSupertonicEmbed:
		engineID := voiceProfileTargetEngineID(targetID)
		_, agent, resolveErr := service.resolveTTSEngine(engineID, false)
		if resolveErr != nil {
			return agents.TTSResult{}, "", resolveErr
		}
		withArtifact, ok := agent.(TTSWithProfileArtifact)
		if !ok {
			return agents.TTSResult{}, "", ErrProfileArtifactUnsupported
		}
		artifact := service.readyVoiceProfileArtifact(profile, engineID)
		if artifact == nil {
			return agents.TTSResult{}, "", ErrProfileArtifactMissing
		}
		result, err = withArtifact.SynthesizeWithProfileArtifact(ctx, text, service.profileArtifactForAgent(*artifact), profile.Language)
	default:
		return agents.TTSResult{}, "", ErrProfileArtifactUnsupported
	}
	if err != nil {
		return agents.TTSResult{}, "", err
	}
	outputPath := filepath.Join(outputDir, "sample.wav")
	if err := os.WriteFile(outputPath, result.Audio, 0o644); err != nil {
		return agents.TTSResult{}, "", err
	}
	return result, outputPath, nil
}

func (service *Service) failVoiceProfileTarget(profileID string, targetID string, message string) (VoiceProfile, error) {
	return service.updateVoiceProfileTarget(profileID, targetID, VoiceProfileTargetStatusFailed, func(target *VoiceProfileTarget) {
		target.Error = message
		target.Validation = &VoiceProfileTargetValidation{
			Status: VoiceProfileTargetStatusFailed,
			Error:  message,
		}
	})
}

func (service *Service) cancelVoiceProfileTargetByID(profileID string, targetID string) (VoiceProfile, error) {
	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		return VoiceProfile{}, err
	}
	targetID = normalizeVoiceProfileTargetID(targetID)
	profile.CloneTargets = cloneVoiceProfileTargets(profile.CloneTargets)
	target := profile.CloneTargets[targetID]
	if target.ID == "" {
		return profile.VoiceProfile, nil
	}

	moduleID := target.ModuleID
	if moduleID == "" {
		moduleID = voiceProfileTargetModuleID(targetID)
	}
	profile.CloneArtifacts = cloneVoiceProfileArtifacts(profile.CloneArtifacts)
	artifact := profile.CloneArtifacts[moduleID]
	artifactWasBuilding := moduleID != "" && artifact.Status == VoiceProfileCloneArtifactStatusBuilding
	targetIsTerminal :=
		target.Status == VoiceProfileTargetStatusReady ||
			target.Status == VoiceProfileTargetStatusFailed ||
			target.Status == VoiceProfileTargetStatusCancelled
	if targetIsTerminal && !artifactWasBuilding {
		return profile.VoiceProfile, nil
	}

	now := time.Now().UTC()
	if !targetIsTerminal {
		target.Status = VoiceProfileTargetStatusCancelled
		target.Error = "cancelled by request"
		target.UpdatedAt = now
	}
	if target.Validation != nil && target.Validation.Status == VoiceProfileTargetStatusValidating {
		target.Validation.Status = VoiceProfileTargetStatusCancelled
		target.Validation.Error = "cancelled by request"
		target.Validation.MeasuredAt = &now
	}
	profile.CloneTargets[targetID] = target
	if artifactWasBuilding {
		artifact.Status = VoiceProfileCloneArtifactStatusCancelled
		artifact.Error = "cancelled by request"
		artifact.UpdatedAt = now
		profile.CloneArtifacts[moduleID] = artifact
	}
	if err := service.persistVoiceProfile(profile); err != nil {
		return VoiceProfile{}, err
	}
	return profile.VoiceProfile, nil
}

func (service *Service) completeVoiceProfileTargetValidation(
	profileID string,
	targetID string,
	validation VoiceProfileTargetValidation,
) (VoiceProfile, error) {
	return service.updateVoiceProfileTarget(profileID, targetID, VoiceProfileTargetStatusReady, func(target *VoiceProfileTarget) {
		target.Error = ""
		target.Validation = &validation
		target.Metadata = map[string]string{
			"sampleProvider": validation.Provider,
		}
	})
}

func (service *Service) updateVoiceProfileTarget(
	profileID string,
	targetID string,
	status VoiceProfileTargetStatus,
	mutate func(*VoiceProfileTarget),
) (VoiceProfile, error) {
	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		return VoiceProfile{}, err
	}
	now := time.Now().UTC()
	targetID = normalizeVoiceProfileTargetID(targetID)
	profile.CloneTargets = cloneVoiceProfileTargets(profile.CloneTargets)
	target := profile.CloneTargets[targetID]
	if target.ID == "" {
		target.ID = targetID
		target.Label = voiceProfileTargetLabel(targetID)
		target.EngineID = voiceProfileTargetEngineID(targetID)
		target.ModuleID = voiceProfileTargetModuleID(targetID)
		target.CreatedAt = now
	}
	target.Selected = true
	target.Status = status
	target.UpdatedAt = now
	if mutate != nil {
		mutate(&target)
	}
	profile.CloneTargets[targetID] = target
	if err := service.persistVoiceProfile(profile); err != nil {
		return VoiceProfile{}, err
	}
	return profile.VoiceProfile, nil
}

func (service *Service) registerVoiceProfileTargetCancel(profileID string, targetID string, cancel context.CancelFunc) {
	service.mu.Lock()
	service.targetCancels[voiceProfileTargetCancelKey(profileID, targetID)] = cancel
	service.mu.Unlock()
}

func (service *Service) takeVoiceProfileTargetCancel(profileID string, targetID string) context.CancelFunc {
	service.mu.Lock()
	key := voiceProfileTargetCancelKey(profileID, targetID)
	cancel := service.targetCancels[key]
	delete(service.targetCancels, key)
	service.mu.Unlock()
	return cancel
}

func (service *Service) clearVoiceProfileTargetCancel(profileID string, targetID string) {
	service.mu.Lock()
	delete(service.targetCancels, voiceProfileTargetCancelKey(profileID, targetID))
	service.mu.Unlock()
}

func voiceProfileTargetCancelKey(profileID string, targetID string) string {
	return strings.TrimSpace(profileID) + ":" + normalizeVoiceProfileTargetID(targetID)
}

func (service *Service) updateVoiceProfileLikenessFromTarget(profileID string, validation VoiceProfileTargetValidation) error {
	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		return err
	}
	likeness := VoiceProfileLikeness{
		Status:            voiceProfileLikenessStatusReady,
		Score:             validation.Score,
		SpeakerSimilarity: validation.SpeakerSimilarity,
		EmbeddingModel:    validation.Model,
		CalibrationText:   validation.ExpectedTranscript,
		MeasuredAt:        validation.MeasuredAt,
		Reason:            "target validation likeness score",
	}
	profile.Likeness = &likeness
	return service.persistVoiceProfile(profile)
}

func (service *Service) updateVoiceProfileLikenessFailureFromTarget(profileID string, validation VoiceProfileTargetValidation) error {
	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		return err
	}
	likeness := failedVoiceProfileLikeness(validation.Error, validation.ExpectedTranscript)
	profile.Likeness = &likeness
	return service.persistVoiceProfile(profile)
}
