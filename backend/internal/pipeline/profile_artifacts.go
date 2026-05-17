package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
)

type profileArtifactBuildOutput struct {
	ModuleID     string            `json:"moduleId"`
	EngineID     string            `json:"engineId"`
	Kind         string            `json:"kind"`
	File         string            `json:"file"`
	Path         string            `json:"path"`
	Loss         float64           `json:"loss"`
	Score        float64           `json:"score"`
	Steps        int               `json:"steps"`
	BaseStyle    string            `json:"baseStyle"`
	UpstreamRef  string            `json:"upstreamRef"`
	ModelVersion string            `json:"modelVersion"`
	Metadata     map[string]string `json:"metadata"`
}

func (service *Service) BuildVoiceProfileArtifact(
	ctx context.Context,
	profileID string,
	moduleID string,
) (VoiceProfile, error) {
	module, err := service.researchModuleConfig(moduleID)
	if err != nil {
		return VoiceProfile{}, err
	}
	if module.ID != ResearchModuleSupertonicEmbed && module.ID != ResearchModuleKokoroEmbed {
		return VoiceProfile{}, ErrProfileArtifactUnsupported
	}
	diagnostics := service.researchModuleDiagnostics(module)
	if !diagnostics.Installed {
		return VoiceProfile{}, fmt.Errorf("%w: %s", ErrResearchModuleUnavailable, module.ID)
	}

	profile, err := service.getVoiceProfile(profileID)
	if err != nil {
		return VoiceProfile{}, err
	}
	if strings.TrimSpace(profile.ReferencePath) == "" {
		return VoiceProfile{}, ErrProfileMissingAudio
	}
	if _, err := os.Stat(profile.ReferencePath); err != nil {
		return VoiceProfile{}, fmt.Errorf("%w: %s", ErrProfileMissingAudio, err)
	}

	now := time.Now().UTC()
	profile.CloneArtifacts = cloneVoiceProfileArtifacts(profile.CloneArtifacts)
	profile.CloneArtifacts[module.ID] = VoiceProfileCloneArtifact{
		ModuleID:    module.ID,
		EngineID:    module.EngineID,
		Kind:        "style-json",
		Status:      VoiceProfileCloneArtifactStatusBuilding,
		UpstreamRef: module.Ref,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := service.persistVoiceProfile(profile); err != nil {
		return VoiceProfile{}, err
	}

	artifactDir := filepath.Join(filepath.Dir(profile.ReferencePath), "artifacts", module.ID)
	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		return VoiceProfile{}, err
	}

	result, buildErr := service.runVoiceProfileArtifactBuilder(ctx, profile.VoiceProfile, module, artifactDir)
	profile, reloadErr := service.getVoiceProfile(profileID)
	if reloadErr != nil {
		return VoiceProfile{}, reloadErr
	}
	profile.CloneArtifacts = cloneVoiceProfileArtifacts(profile.CloneArtifacts)
	previous := profile.CloneArtifacts[module.ID]
	if previous.CreatedAt.IsZero() {
		previous.CreatedAt = now
	}
	previous.UpdatedAt = time.Now().UTC()
	previous.ModuleID = module.ID
	previous.EngineID = module.EngineID
	previous.Kind = "style-json"
	previous.UpstreamRef = module.Ref
	if buildErr != nil {
		previous.Status = VoiceProfileCloneArtifactStatusFailed
		previous.Error = buildErr.Error()
		profile.CloneArtifacts[module.ID] = previous
		_ = service.persistVoiceProfile(profile)
		return profile.VoiceProfile, buildErr
	}

	if result.ModuleID == "" {
		result.ModuleID = module.ID
	}
	if result.EngineID == "" {
		result.EngineID = module.EngineID
	}
	if result.Kind == "" {
		result.Kind = "style-json"
	}
	previous.ModuleID = result.ModuleID
	previous.EngineID = result.EngineID
	previous.Kind = result.Kind
	previous.File = result.File
	previous.Path = result.Path
	previous.Loss = result.Loss
	previous.Score = result.Score
	previous.Steps = result.Steps
	previous.BaseStyle = result.BaseStyle
	previous.UpstreamRef = firstNonEmpty(result.UpstreamRef, module.Ref)
	previous.ModelVersion = result.ModelVersion
	previous.Metadata = result.Metadata
	previous.Status = VoiceProfileCloneArtifactStatusReady
	previous.Error = ""
	profile.CloneArtifacts[module.ID] = previous
	if err := service.persistVoiceProfile(profile); err != nil {
		return VoiceProfile{}, err
	}
	return profile.VoiceProfile, nil
}

func (service *Service) runVoiceProfileArtifactBuilder(
	ctx context.Context,
	profile VoiceProfile,
	module ResearchModuleConfig,
	outputDir string,
) (profileArtifactBuildOutput, error) {
	timeout := time.Duration(service.options.VoiceProfileArtifactTimeoutSeconds) * time.Second
	buildCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	modulePath, err := filepath.Abs(module.LocalPath)
	if err != nil {
		return profileArtifactBuildOutput{}, err
	}
	scriptPath := strings.TrimSpace(service.options.VoiceProfileArtifactScriptPath)
	if scriptPath == "" {
		scriptPath = defaultVoiceProfileArtifactScriptPath
	}
	args := []string{
		scriptPath,
		"--module-id", module.ID,
		"--profile-id", profile.ID,
		"--reference", profile.ReferencePath,
		"--output-dir", outputDir,
		"--upstream-dir", modulePath,
		"--upstream-ref", module.Ref,
	}
	if service.options.VoiceProfileArtifactSteps > 0 {
		args = append(args, "--steps", fmt.Sprintf("%d", service.options.VoiceProfileArtifactSteps))
	}

	command := exec.CommandContext(buildCtx, service.options.VoiceProfileArtifactPythonPath, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		if buildCtx.Err() == context.DeadlineExceeded {
			return profileArtifactBuildOutput{}, fmt.Errorf("voice profile artifact build timed out after %d seconds", service.options.VoiceProfileArtifactTimeoutSeconds)
		}
		return profileArtifactBuildOutput{}, fmt.Errorf("voice profile artifact build failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	var result profileArtifactBuildOutput
	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	for index := len(lines) - 1; index >= 0; index-- {
		line := strings.TrimSpace(lines[index])
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}
		if err := json.Unmarshal([]byte(line), &result); err == nil && result.Path != "" {
			break
		}
	}
	if strings.TrimSpace(result.Path) == "" {
		return profileArtifactBuildOutput{}, errors.New("voice profile artifact builder did not return an artifact path")
	}
	if !filepath.IsAbs(result.Path) {
		result.Path = filepath.Join(outputDir, result.Path)
	}
	if result.File == "" {
		result.File = filepath.Base(result.Path)
	}
	if _, err := os.Stat(result.Path); err != nil {
		return profileArtifactBuildOutput{}, fmt.Errorf("voice profile artifact output missing: %w", err)
	}
	return result, nil
}

func (service *Service) readyVoiceProfileArtifact(
	profile VoiceProfile,
	engineID string,
) *VoiceProfileCloneArtifact {
	if len(profile.CloneArtifacts) == 0 {
		return nil
	}
	requested := normalizeTTSEngineID(engineID)
	moduleIDs := []string{}
	switch requested {
	case TTSEngineSupertonic:
		moduleIDs = []string{ResearchModuleSupertonicEmbed}
	case TTSEngineKokoroEmbed:
		moduleIDs = []string{ResearchModuleKokoroEmbed}
	case TTSEngineKokoro:
		moduleIDs = []string{ResearchModuleKokoroEmbed}
	case TTSEngineAuto:
		moduleIDs = []string{ResearchModuleKokoroEmbed}
	default:
		return nil
	}
	for _, moduleID := range moduleIDs {
		artifact := profile.CloneArtifacts[moduleID]
		if artifact.Status == VoiceProfileCloneArtifactStatusReady && strings.TrimSpace(artifact.Path) != "" {
			copyArtifact := artifact
			return &copyArtifact
		}
	}
	return nil
}

func (service *Service) profileArtifactForAgent(artifact VoiceProfileCloneArtifact) agents.VoiceProfileArtifact {
	return agents.VoiceProfileArtifact{
		ModuleID: artifact.ModuleID,
		EngineID: artifact.EngineID,
		Kind:     artifact.Kind,
		Path:     artifact.Path,
		File:     artifact.File,
	}
}

func (service *Service) persistVoiceProfile(profile storedVoiceProfile) error {
	if profile.CloneArtifacts != nil && len(profile.CloneArtifacts) == 0 {
		profile.CloneArtifacts = nil
	}
	profile.UpdatedAt = time.Now().UTC()
	outputDir := filepath.Join(service.options.VoiceProfileDir, profile.ID)
	if strings.TrimSpace(profile.ReferencePath) != "" {
		outputDir = filepath.Dir(profile.ReferencePath)
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(outputDir, "profile.json"), profile.VoiceProfile); err != nil {
		return err
	}
	service.updateVoiceProfile(profile)
	return nil
}

func cloneVoiceProfileArtifacts(
	artifacts map[string]VoiceProfileCloneArtifact,
) map[string]VoiceProfileCloneArtifact {
	if len(artifacts) == 0 {
		return map[string]VoiceProfileCloneArtifact{}
	}
	cloned := make(map[string]VoiceProfileCloneArtifact, len(artifacts))
	for key, artifact := range artifacts {
		cloned[key] = artifact
	}
	return cloned
}
