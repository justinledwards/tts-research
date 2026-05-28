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
	runtime := voiceEmbedRuntimeDiagnostics{}
	status := "missing"
	reason := "Optional module is not installed. Clone it locally to enable profile artifact builds."
	setup := module.Setup
	if installed {
		runtime = service.voiceEmbedRuntimeDiagnostics(module)
		if runtime.ready {
			runtime = service.voiceEmbedSupertonicAssetDiagnostics(runtime, localPath, module)
		}
		status = "ready"
		reason = "Installed locally. Profile artifacts can be built now."
		if !runtime.ready {
			status = "setup-needed"
			reason = runtime.reason
			setup = strings.TrimSpace(strings.Join([]string{module.Setup, runtime.setup}, " "))
		}
	}
	cloneAllowed := !installed && strings.TrimSpace(module.RepoURL) != "" && strings.TrimSpace(localPath) != ""
	return ResearchModuleDiagnostics{
		ID:                  module.ID,
		Label:               module.Label,
		RepoURL:             module.RepoURL,
		Ref:                 module.Ref,
		LocalPath:           localPath,
		EngineID:            module.EngineID,
		Status:              status,
		Installed:           installed,
		RuntimeReady:        runtime.ready,
		MissingDependencies: runtime.missingDependencies,
		CloneAllowed:        cloneAllowed,
		Prompt:              !service.options.ResearchModulePromptDisabled,
		Reason:              reason,
		Setup:               setup,
		SetupCommand:        runtime.setupCommand,
	}
}

type voiceEmbedRuntimeDiagnostics struct {
	ready               bool
	reason              string
	setup               string
	setupCommand        string
	missingDependencies []string
}

func (service *Service) voiceEmbedRuntimeDiagnostics(module ResearchModuleConfig) voiceEmbedRuntimeDiagnostics {
	if os.Getenv("VOICE_EMBED_FAKE_ARTIFACT") == "1" {
		return voiceEmbedRuntimeDiagnostics{ready: true}
	}
	pythonPath := strings.TrimSpace(service.options.VoiceProfileArtifactPythonPath)
	if pythonPath == "" {
		pythonPath = defaultVoiceProfileArtifactPythonPath
	}
	resolvedPath, ok := resolveCommandExecutable(
		pythonPath,
		artifactCommandFallbackRoots(module.LocalPath, service.options.VoiceProfileArtifactScriptPath)...,
	)
	if !ok {
		return voiceEmbedRuntimeDiagnostics{
			ready:        false,
			reason:       fmt.Sprintf("Voice Embed runtime executable not found or not executable at %s. %s", pythonPath, missingKokoroPythonPathHint),
			setup:        fmt.Sprintf("Run `%s` after reviewing the upstream requirements.", voiceEmbedRuntimeSetupCommand),
			setupCommand: voiceEmbedRuntimeSetupCommand,
		}
	}
	return service.voiceEmbedDependencyDiagnostics(resolvedPath, module)
}

func (service *Service) voiceEmbedSupertonicAssetDiagnostics(
	runtime voiceEmbedRuntimeDiagnostics,
	modulePath string,
	module ResearchModuleConfig,
) voiceEmbedRuntimeDiagnostics {
	if module.ID != ResearchModuleSupertonicEmbed {
		return runtime
	}
	if runtime.ready == false {
		return runtime
	}
	if _, err := os.Stat(modulePath); err != nil {
		return voiceEmbedRuntimeDiagnostics{
			ready:        false,
			reason:       fmt.Sprintf("Supertonic embed prerequisite missing. Upstream directory missing at %s. %s", modulePath, missingSupertonicAssetsHint),
			setup:        fmt.Sprintf("Copy %s into %s or rerun upstream setup.", missingSupertonicAssetsHint, modulePath),
			setupCommand: voiceEmbedRuntimeSetupCommand,
		}
	}

	for _, required := range supertonicEmbedRequiredFiles {
		path := filepath.Join(modulePath, required)
		if _, err := os.Stat(path); err != nil {
			return voiceEmbedRuntimeDiagnostics{
				ready:        false,
				reason:       fmt.Sprintf("Supertonic embed prerequisite missing required file: %s. %s", path, missingSupertonicAssetsHint),
				setup:        fmt.Sprintf("Copy %s to %s and retry.", missingSupertonicAssetsHint, filepath.Dir(modulePath)),
				setupCommand: voiceEmbedRuntimeSetupCommand,
			}
		}
	}

	voiceStyleFiles, err := filepath.Glob(filepath.Join(modulePath, "voice_styles", "*.json"))
	if err != nil || len(voiceStyleFiles) == 0 {
		return voiceEmbedRuntimeDiagnostics{
			ready:        false,
			reason:       fmt.Sprintf("Supertonic embed prerequisite missing: no voice style JSON files found in %s. %s", filepath.Join(modulePath, "voice_styles"), missingSupertonicAssetsHint),
			setup:        fmt.Sprintf("Copy %s and a valid voice style JSON file into %s, then retry.", missingSupertonicAssetsHint, filepath.Join(modulePath, "voice_styles")),
			setupCommand: voiceEmbedRuntimeSetupCommand,
		}
	}

	return runtime
}

func firstMissingSupertonicEmbedAsset(modulePath string) string {
	if _, err := os.Stat(modulePath); err != nil {
		return modulePath
	}

	for _, required := range supertonicEmbedRequiredFiles {
		path := filepath.Join(modulePath, required)
		if _, err := os.Stat(path); err != nil {
			return path
		}
	}

	voiceStyleFiles, err := filepath.Glob(filepath.Join(modulePath, "voice_styles", "*.json"))
	if err != nil || len(voiceStyleFiles) == 0 {
		return filepath.Join(modulePath, "voice_styles")
	}

	return ""
}

func resolveCommandExecutable(command string, fallbackRoots ...string) (string, bool) {
	command = strings.TrimSpace(command)
	if command == "" {
		return command, false
	}
	command = filepath.Clean(command)

	if !filepath.IsAbs(command) && strings.ContainsAny(command, `/\\`) {
		if abs, err := filepath.Abs(command); err == nil {
			if resolved, ok := resolveExecutableCandidate(abs); ok {
				return resolved, true
			}
		}
		roots := dedupeStrings(fallbackRoots...)
		for _, root := range roots {
			candidate := filepath.Clean(filepath.Join(root, command))
			if resolved, ok := resolveExecutableCandidate(candidate); ok {
				return resolved, true
			}
		}
		// fallback for paths that are invalid from all candidates
		if command, err := filepath.Abs(command); err == nil {
			return command, false
		}
		return command, false
	}

	resolved, err := exec.LookPath(command)
	if err != nil {
		return command, false
	}
	if _, ok := resolveExecutableCandidate(resolved); !ok {
		return resolved, false
	}
	return resolved, true
}

func resolveExecutableCandidate(path string) (string, bool) {
	info, err := os.Stat(path)
	if err != nil {
		return path, false
	}
	if !info.Mode().IsRegular() || info.Mode()&0111 == 0 {
		return path, false
	}
	return path, true
}

func artifactCommandFallbackRoots(modulePath string, scriptPath string) []string {
	moduleDir := strings.TrimSpace(modulePath)
	scriptValue := strings.TrimSpace(scriptPath)
	roots := []string{""}

	if moduleDir != "" {
		roots = append(roots, moduleDir, filepath.Dir(moduleDir), filepath.Join(moduleDir, ".."))
	}
	if scriptValue != "" {
		scriptDir := filepath.Dir(scriptValue)
		roots = append(roots, scriptDir, filepath.Dir(scriptDir))
		if absScript, err := filepath.Abs(scriptValue); err == nil {
			absScriptDir := filepath.Dir(absScript)
			roots = append(roots, absScriptDir, filepath.Dir(absScriptDir))
		}
	}
	return dedupeStrings(roots...)
}

func copyDirectoryTree(src, dst string) error {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		sourcePath := filepath.Join(src, entry.Name())
		targetPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDirectoryTree(sourcePath, targetPath); err != nil {
				return err
			}
			continue
		}
		if err := copyFile(sourcePath, targetPath); err != nil {
			return err
		}
	}
	return nil
}

func dedupeStrings(values ...string) []string {
	seen := map[string]struct{}{}
	output := make([]string, 0, len(values))
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		output = append(output, clean)
	}
	return output
}

func resolveSupertonicEmbedModelCacheDir(modulePath string) (string, error) {
	moduleRoot := filepath.Dir(filepath.Clean(modulePath))
	repoRoot := moduleRoot
	if filepath.Base(moduleRoot) == "upstreams" {
		repoRoot = filepath.Clean(filepath.Join(moduleRoot, ".."))
	}
	envPath := strings.TrimSpace(os.Getenv("SUPERTONIC_MODEL_DIR"))
	candidates := []string{}
	if envPath != "" {
		candidates = append(
			candidates,
			envPath,
			filepath.Join(repoRoot, envPath),
			filepath.Join(filepath.Dir(modulePath), envPath),
		)
	} else {
		candidates = append(
			candidates,
			filepath.Join(repoRoot, "backend", "model-cache", "supertonic"),
			filepath.Join(moduleRoot, "..", "backend", "model-cache", "supertonic"),
			filepath.Join(moduleRoot, "..", "..", "backend", "model-cache", "supertonic"),
			filepath.Join(moduleRoot, "..", "..", "..", "backend", "model-cache", "supertonic"),
		)
	}
	candidates = append(
		candidates,
		filepath.Join(modulePath, "..", "model-cache", "supertonic"),
		filepath.Join(moduleRoot, "..", "model-cache", "supertonic"),
		"backend/model-cache/supertonic",
	)
	candidates = dedupeStrings(candidates...)
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		candidate = filepath.Clean(candidate)
		if path := strings.TrimSpace(candidate); path != "" {
			if !filepath.IsAbs(path) {
				if abs, err := filepath.Abs(path); err == nil {
					path = abs
				}
			}
			if _, err := os.Stat(path); err == nil {
				return path, nil
			}
		}
	}
	return "", fmt.Errorf("no Supertonic model cache found for module path %s", modulePath)
}

func syncSupertonicEmbedAssets(modulePath string) error {
	if _, err := os.Stat(modulePath); err != nil {
		return fmt.Errorf("Supertonic module not available at %s", modulePath)
	}
	cacheDir, err := resolveSupertonicEmbedModelCacheDir(modulePath)
	if err != nil {
		return err
	}
	sourceOnnx := filepath.Join(cacheDir, "onnx")
	sourceStyles := filepath.Join(cacheDir, "voice_styles")
	targetOnnx := filepath.Join(modulePath, "onnx")
	targetStyles := filepath.Join(modulePath, "voice_styles")
	if err := copyDirectoryTree(sourceOnnx, targetOnnx); err != nil {
		return fmt.Errorf("copy supertonic onnx assets: %w", err)
	}
	if err := copyDirectoryTree(sourceStyles, targetStyles); err != nil {
		return fmt.Errorf("copy supertonic voice style assets: %w", err)
	}
	return nil
}

func (service *Service) voiceEmbedDependencyDiagnostics(
	pythonPath string,
	module ResearchModuleConfig,
) voiceEmbedRuntimeDiagnostics {
	required := voiceEmbedRequiredPythonModules(module.ID)
	if len(required) == 0 {
		return voiceEmbedRuntimeDiagnostics{ready: true}
	}
	args := append([]string{"-c", voiceEmbedDependencyProbeScript(module.ID)}, required...)
	command := exec.Command(pythonPath, args...)
	output, err := command.CombinedOutput()
	cleanOutput := strings.TrimSpace(string(output))
	missing := compactStrings(strings.Split(strings.TrimSpace(string(output)), "\n"))
	if err != nil && len(missing) == 0 {
		reason := fmt.Sprintf("Voice Embed runtime dependency probe failed for %s.", module.Label)
		if cleanOutput != "" {
			reason = fmt.Sprintf("%s %s", strings.TrimSuffix(reason, "."), cleanOutput)
		}
		return voiceEmbedRuntimeDiagnostics{
			ready:        false,
			reason:       reason,
			setup:        fmt.Sprintf("Run `%s` after reviewing the upstream requirements.", voiceEmbedRuntimeSetupCommand),
			setupCommand: voiceEmbedRuntimeSetupCommand,
		}
	}
	if len(missing) > 0 {
		missingModel := false
		for _, dependency := range missing {
			if dependency == "en_core_web_sm" {
				missingModel = true
				break
			}
		}
		reason := fmt.Sprintf("Voice Embed runtime is missing Python dependencies for %s: %s.", module.Label, strings.Join(missing, ", "))
		if missingModel {
			reason = fmt.Sprintf(
				"%s %s",
				reason,
				missingKokoroSpacyModelHint,
			)
		}
		return voiceEmbedRuntimeDiagnostics{
			ready:               false,
			reason:              reason,
			setup:               fmt.Sprintf("Run `%s` after reviewing the upstream requirements.", voiceEmbedRuntimeSetupCommand),
			setupCommand:        voiceEmbedRuntimeSetupCommand,
			missingDependencies: missing,
		}
	}
	return voiceEmbedRuntimeDiagnostics{ready: true}
}

func voiceEmbedRequiredPythonModules(moduleID string) []string {
	switch normalizeResearchModuleID(moduleID) {
	case ResearchModuleKokoroEmbed:
		return []string{
			"kokoro",
			"librosa",
			"numpy",
			"soundfile",
			"torch",
			"torchaudio",
			"spacy",
			"en_core_web_sm",
			"transformers",
		}
	case ResearchModuleSupertonicEmbed:
		return []string{"librosa", "numpy", "onnx", "onnx2torch", "onnxruntime", "onnxslim", "soundfile", "torch", "torchaudio", "transformers"}
	default:
		return nil
	}
}

func voiceEmbedDependencyProbeScript(moduleID string) string {
	module := strings.TrimSpace(normalizeResearchModuleID(moduleID))
	if module == ResearchModuleKokoroEmbed {
		return `import importlib.util
import sys

missing = []
spacy_module = None
for name in sys.argv[1:]:
    if name == "en_core_web_sm":
        if spacy_module is None:
            continue
        try:
            spacy_module.load(name)
        except Exception:
            missing.append(name)
        continue
    if importlib.util.find_spec(name) is None:
        missing.append(name)
        continue
    if name == "spacy":
        import spacy as spacy_module
if missing:
    print("\n".join(missing))
    raise SystemExit(1)
`
	}

	return `import importlib.util
import sys

missing = [name for name in sys.argv[1:] if importlib.util.find_spec(name) is None]
if missing:
    print("\n".join(missing))
    raise SystemExit(1)
`
}

func compactStrings(values []string) []string {
	compacted := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		compacted = append(compacted, clean)
	}
	return compacted
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
