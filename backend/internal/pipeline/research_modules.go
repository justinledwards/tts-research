package pipeline

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	ResearchModuleSupertonicEmbed = "supertonic-embed"
	ResearchModuleKokoroEmbed     = "kokoro-embed"
)

type ResearchModuleConfig struct {
	ID        string
	Label     string
	RepoURL   string
	Ref       string
	LocalPath string
	EngineID  string
	Setup     string
}

func defaultResearchModuleConfigs() []ResearchModuleConfig {
	return normalizeResearchModuleConfigs([]ResearchModuleConfig{
		{
			ID:        ResearchModuleSupertonicEmbed,
			Label:     "Supertonic Embed",
			RepoURL:   "https://github.com/kdrkdrkdr/supertonic.embed.git",
			Ref:       "main",
			LocalPath: "../.upstreams/supertonic.embed",
			EngineID:  TTSEngineSupertonic,
			Setup:     "Optional CUDA/PyTorch module for building Supertonic style JSON artifacts from a reference WAV.",
		},
		{
			ID:        ResearchModuleKokoroEmbed,
			Label:     "Kokoro Embed",
			RepoURL:   "https://github.com/kdrkdrkdr/kokoro.embed.git",
			Ref:       "main",
			LocalPath: "../.upstreams/kokoro.embed",
			EngineID:  TTSEngineKokoroEmbed,
			Setup:     "Optional CUDA/PyTorch module for building Kokoro style-vector artifacts from a reference WAV.",
		},
	})
}

func normalizeResearchModuleConfigs(configs []ResearchModuleConfig) []ResearchModuleConfig {
	normalized := make([]ResearchModuleConfig, 0, len(configs))
	for _, config := range configs {
		config.ID = normalizeResearchModuleID(config.ID)
		if config.ID == "" {
			continue
		}
		if strings.TrimSpace(config.Ref) == "" {
			config.Ref = "main"
		}
		if strings.TrimSpace(config.Label) == "" {
			config.Label = config.ID
		}
		if strings.TrimSpace(config.LocalPath) == "" {
			switch config.ID {
			case ResearchModuleSupertonicEmbed:
				config.LocalPath = "../.upstreams/supertonic.embed"
			case ResearchModuleKokoroEmbed:
				config.LocalPath = "../.upstreams/kokoro.embed"
			}
		}
		if strings.TrimSpace(config.RepoURL) == "" {
			switch config.ID {
			case ResearchModuleSupertonicEmbed:
				config.RepoURL = "https://github.com/kdrkdrkdr/supertonic.embed.git"
			case ResearchModuleKokoroEmbed:
				config.RepoURL = "https://github.com/kdrkdrkdr/kokoro.embed.git"
			}
		}
		if strings.TrimSpace(config.EngineID) == "" {
			switch config.ID {
			case ResearchModuleSupertonicEmbed:
				config.EngineID = TTSEngineSupertonic
			case ResearchModuleKokoroEmbed:
				config.EngineID = TTSEngineKokoroEmbed
			}
		}
		normalized = append(normalized, config)
	}
	return normalized
}

func normalizeResearchModuleID(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	switch clean {
	case "supertonic.embed", "supertonic_embed":
		return ResearchModuleSupertonicEmbed
	case "kokoro.embed", "kokoro_embed":
		return ResearchModuleKokoroEmbed
	default:
		return clean
	}
}

func (service *Service) ListResearchModules() []ResearchModuleDiagnostics {
	modules := service.researchModules()
	diagnostics := make([]ResearchModuleDiagnostics, 0, len(modules))
	for _, module := range modules {
		diagnostics = append(diagnostics, service.researchModuleDiagnostics(module))
	}
	return diagnostics
}

func (service *Service) CloneResearchModule(ctx context.Context, id string) (ResearchModuleDiagnostics, error) {
	module, err := service.researchModuleConfig(id)
	if err != nil {
		return ResearchModuleDiagnostics{}, err
	}
	diagnostics := service.researchModuleDiagnostics(module)
	if diagnostics.Installed {
		return diagnostics, nil
	}
	if !diagnostics.CloneAllowed {
		return diagnostics, fmt.Errorf("%w: clone is not configured for %s", ErrResearchModuleUnavailable, module.ID)
	}

	localPath, err := filepath.Abs(module.LocalPath)
	if err != nil {
		return ResearchModuleDiagnostics{}, err
	}
	if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
		return ResearchModuleDiagnostics{}, fmt.Errorf("create research module parent dir: %w", err)
	}

	timeout := time.Duration(service.options.ResearchModuleCloneTimeoutSeconds) * time.Second
	cloneCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	args := []string{"clone", "--depth", "1"}
	if strings.TrimSpace(module.Ref) != "" {
		args = append(args, "--branch", module.Ref)
	}
	args = append(args, module.RepoURL, localPath)
	command := exec.CommandContext(cloneCtx, "git", args...)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		if cloneCtx.Err() == context.DeadlineExceeded {
			return ResearchModuleDiagnostics{}, fmt.Errorf("clone %s timed out after %d seconds", module.ID, service.options.ResearchModuleCloneTimeoutSeconds)
		}
		return ResearchModuleDiagnostics{}, fmt.Errorf("clone %s: %w: %s", module.ID, err, strings.TrimSpace(stderr.String()))
	}
	return service.researchModuleDiagnostics(module), nil
}

func (service *Service) researchModuleConfig(id string) (ResearchModuleConfig, error) {
	cleanID := normalizeResearchModuleID(id)
	for _, module := range service.researchModules() {
		if module.ID == cleanID {
			return module, nil
		}
	}
	return ResearchModuleConfig{}, ErrResearchModuleNotFound
}

func (service *Service) researchModules() []ResearchModuleConfig {
	service.mu.RLock()
	defer service.mu.RUnlock()
	return append([]ResearchModuleConfig(nil), service.options.ResearchModules...)
}

func (service *Service) researchModuleDiagnostics(module ResearchModuleConfig) ResearchModuleDiagnostics {
	localPath, err := filepath.Abs(module.LocalPath)
	if err != nil {
		localPath = module.LocalPath
	}
	installed := researchModuleInstalled(localPath, module.ID)
	status := "missing"
	reason := "Optional module is not installed. Clone it locally to enable profile artifact builds."
	if installed {
		status = "ready"
		reason = "Installed locally. Profile artifacts can be built when the Python runtime dependencies are ready."
	}
	cloneAllowed := !installed && strings.TrimSpace(module.RepoURL) != "" && strings.TrimSpace(localPath) != ""
	return ResearchModuleDiagnostics{
		ID:           module.ID,
		Label:        module.Label,
		RepoURL:      module.RepoURL,
		Ref:          module.Ref,
		LocalPath:    localPath,
		EngineID:     module.EngineID,
		Status:       status,
		Installed:    installed,
		CloneAllowed: cloneAllowed,
		Prompt:       !service.options.ResearchModulePromptDisabled,
		Reason:       reason,
		Setup:        module.Setup,
	}
}

func researchModuleInstalled(localPath string, moduleID string) bool {
	info, err := os.Stat(localPath)
	if err != nil || !info.IsDir() {
		return false
	}
	if _, err := os.Stat(filepath.Join(localPath, ".git")); err == nil {
		return true
	}
	if _, err := os.Stat(filepath.Join(localPath, "optimize_style.py")); err == nil {
		return true
	}
	switch moduleID {
	case ResearchModuleSupertonicEmbed:
		_, err = os.Stat(filepath.Join(localPath, "helper.py"))
		return err == nil
	case ResearchModuleKokoroEmbed:
		_, err = os.Stat(filepath.Join(localPath, "main.py"))
		return err == nil
	default:
		return true
	}
}
