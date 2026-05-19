package agents

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
	"github.com/justinedwards/tts-research/backend/internal/audio"
)

type TTSResult struct {
	Audio        []byte
	ContentType  string
	DurationMS   int
	Provider     string
	Voice        string
	TimingEvents []alignment.NativeTimingEvent
}

type VoiceProfileArtifact struct {
	ModuleID string
	EngineID string
	Kind     string
	Path     string
	File     string
}

type MockTTSAgent struct{}

func NewMockTTSAgent() *MockTTSAgent {
	return &MockTTSAgent{}
}

func (agent *MockTTSAgent) Synthesize(ctx context.Context, text string) (TTSResult, error) {
	return agent.SynthesizeWithVoice(ctx, text, "silent", "")
}

func (agent *MockTTSAgent) SynthesizeWithVoice(_ context.Context, text string, voice string, _ string) (TTSResult, error) {
	durationMS := audio.DurationForText(text)
	wav, err := audio.SilentWAV(durationMS)
	if err != nil {
		return TTSResult{}, err
	}

	return TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  durationMS,
		Provider:    "mock",
		Voice:       strings.TrimSpace(voice),
	}, nil
}

type KokoroConfig struct {
	PythonPath                         string
	ReferencePythonPath                string
	EmbedPythonPath                    string
	ScriptPath                         string
	ReferenceScriptPath                string
	EmbedScriptPath                    string
	ReferenceModulePath                string
	EmbedModulePath                    string
	ReferenceWorkerCount               int
	DataDir                            string
	LangCode                           string
	Voice                              string
	Speed                              float64
	Device                             string
	TimeoutSeconds                     int
	ReferenceTimeoutSeconds            int
	ReferenceWorkerReadyTimeoutSeconds int
}

type kokoroReferenceWorker struct {
	command *exec.Cmd
	stdin   io.WriteCloser
	stdout  *bufio.Reader
}

type kokoroMetadata struct {
	Provider    string  `json:"provider"`
	RepoID      string  `json:"repoId"`
	Voice       string  `json:"voice"`
	LangCode    string  `json:"langCode"`
	Speed       float64 `json:"speed"`
	SampleRate  int     `json:"sampleRate"`
	SampleCount int     `json:"sampleCount"`
	DurationMS  int     `json:"durationMs"`
}

type cloneServerResponse struct {
	kokoroMetadata
	ID     string `json:"id,omitempty"`
	Error  string `json:"error,omitempty"`
	Output string `json:"output,omitempty"`
	Type   string `json:"type,omitempty"`
}

type KokoroTTSAgent struct {
	config                   KokoroConfig
	referenceWorkers         chan *kokoroReferenceWorker
	referenceWorkerInit      sync.Once
	referenceWorkerInitErr   error
	referenceWorkerRequestID uint64
}

func NewKokoroTTSAgent(config KokoroConfig) *KokoroTTSAgent {
	if config.PythonPath == "" {
		config.PythonPath = "./.venv/bin/python"
	}
	if config.ReferencePythonPath == "" {
		config.ReferencePythonPath = config.PythonPath
	}
	if config.EmbedPythonPath == "" {
		config.EmbedPythonPath = config.ReferencePythonPath
	}
	if config.ScriptPath == "" {
		config.ScriptPath = "./scripts/kokoro_synth.py"
	}
	if config.ReferenceScriptPath == "" {
		config.ReferenceScriptPath = "./scripts/kokoro_clone.py"
	}
	if config.EmbedScriptPath == "" {
		config.EmbedScriptPath = "./scripts/kokoro_embed_synth.py"
	}
	if config.DataDir == "" {
		config.DataDir = "./data/kokoro"
	}
	if config.LangCode == "" {
		config.LangCode = "a"
	}
	if config.Voice == "" {
		config.Voice = "af_heart"
	}
	if config.Speed <= 0 {
		config.Speed = 1
	}
	if config.Device == "" {
		config.Device = "auto"
	}
	if config.ReferenceWorkerCount <= 0 {
		config.ReferenceWorkerCount = 1
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 180
	}
	if config.ReferenceTimeoutSeconds <= 0 {
		config.ReferenceTimeoutSeconds = config.TimeoutSeconds
	}
	if config.ReferenceWorkerReadyTimeoutSeconds <= 0 {
		config.ReferenceWorkerReadyTimeoutSeconds = config.TimeoutSeconds
	}

	return &KokoroTTSAgent{
		config:           config,
		referenceWorkers: make(chan *kokoroReferenceWorker, max(1, config.ReferenceWorkerCount)),
	}
}

func (agent *KokoroTTSAgent) Synthesize(ctx context.Context, text string) (TTSResult, error) {
	return agent.synthesizeWithConfig(ctx, text, agent.config)
}

func (agent *KokoroTTSAgent) SynthesizeWithVoice(ctx context.Context, text string, voice string, langCode string) (TTSResult, error) {
	config := agent.config
	if cleanVoice := strings.TrimSpace(voice); cleanVoice != "" {
		config.Voice = cleanVoice
	}
	if cleanLangCode := strings.TrimSpace(langCode); cleanLangCode != "" {
		config.LangCode = cleanLangCode
	}
	return agent.synthesizeWithConfig(ctx, text, config)
}

func (agent *KokoroTTSAgent) SynthesizeWithProfileArtifact(
	ctx context.Context,
	text string,
	artifact VoiceProfileArtifact,
	langCode string,
) (TTSResult, error) {
	config := agent.config
	if cleanLangCode := strings.TrimSpace(langCode); cleanLangCode != "" {
		config.LangCode = cleanLangCode
	}
	return agent.synthesizeWithEmbedArtifact(ctx, text, artifact, config)
}

func (agent *KokoroTTSAgent) synthesizeWithConfig(ctx context.Context, text string, config KokoroConfig) (TTSResult, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	if err := os.MkdirAll(config.DataDir, 0o755); err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro data dir: %w", err)
	}

	workDir, err := os.MkdirTemp(config.DataDir, "synth-*")
	if err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro work dir: %w", err)
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	textPath := filepath.Join(workDir, "input.txt")
	outputPath := filepath.Join(workDir, "output.wav")
	if err := os.WriteFile(textPath, []byte(text), 0o600); err != nil {
		return TTSResult{}, fmt.Errorf("write kokoro input: %w", err)
	}

	command := exec.CommandContext(
		ctx,
		config.PythonPath,
		config.ScriptPath,
		"--text-file",
		textPath,
		"--output",
		outputPath,
		"--lang-code",
		config.LangCode,
		"--voice",
		config.Voice,
		"--speed",
		fmt.Sprintf("%g", config.Speed),
		"--device",
		config.Device,
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return TTSResult{}, fmt.Errorf("kokoro synthesis timed out after %d seconds", config.TimeoutSeconds)
		}

		return TTSResult{}, fmt.Errorf("kokoro synthesis failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	metadata, err := parseKokoroMetadata(stdout.String())
	if err != nil {
		return TTSResult{}, err
	}

	wav, err := os.ReadFile(outputPath)
	if err != nil {
		return TTSResult{}, fmt.Errorf("read kokoro output: %w", err)
	}

	return TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  metadata.DurationMS,
		Provider:    metadata.Provider,
		Voice:       metadata.Voice,
	}, nil
}

func (agent *KokoroTTSAgent) synthesizeWithEmbedArtifact(
	ctx context.Context,
	text string,
	artifact VoiceProfileArtifact,
	config KokoroConfig,
) (TTSResult, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.ReferenceTimeoutSeconds)*time.Second)
	defer cancel()

	stylePath := strings.TrimSpace(artifact.Path)
	if stylePath == "" {
		return TTSResult{}, errors.New("kokoro embed artifact path is required")
	}
	if _, err := os.Stat(stylePath); err != nil {
		return TTSResult{}, fmt.Errorf("kokoro embed artifact not found: %w", err)
	}
	if err := os.MkdirAll(config.DataDir, 0o755); err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro data dir: %w", err)
	}

	workDir, err := os.MkdirTemp(config.DataDir, "synth-embed-*")
	if err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro embed work dir: %w", err)
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	textPath := filepath.Join(workDir, "input.txt")
	outputPath := filepath.Join(workDir, "output.wav")
	if err := os.WriteFile(textPath, []byte(text), 0o600); err != nil {
		return TTSResult{}, fmt.Errorf("write kokoro embed input: %w", err)
	}

	command := exec.CommandContext(
		ctx,
		config.EmbedPythonPath,
		config.EmbedScriptPath,
		"--text-file",
		textPath,
		"--output",
		outputPath,
		"--style-file",
		stylePath,
		"--lang-code",
		config.LangCode,
		"--speed",
		fmt.Sprintf("%g", config.Speed),
		"--device",
		config.Device,
	)
	if modulePath := strings.TrimSpace(config.EmbedModulePath); modulePath != "" {
		command.Args = append(command.Args, "--upstream-dir", modulePath)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return TTSResult{}, fmt.Errorf(
				"%w: kokoro embed synthesis timed out after %d seconds",
				context.DeadlineExceeded,
				config.ReferenceTimeoutSeconds,
			)
		}
		return TTSResult{}, fmt.Errorf("kokoro embed synthesis failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	metadata, parseErr := parseKokoroMetadata(stdout.String())
	wav, err := os.ReadFile(outputPath)
	if err != nil {
		return TTSResult{}, fmt.Errorf("read kokoro embed output: %w", err)
	}
	if parseErr != nil {
		spec, pcm, pcmErr := audio.ParsePCM16WAV(wav)
		if pcmErr != nil {
			return TTSResult{}, fmt.Errorf("parse kokoro embed metadata: %w", parseErr)
		}
		metadata = kokoroMetadata{
			Provider:    "kokoro-embed",
			RepoID:      "hexgrad/Kokoro-82M",
			Voice:       firstNonEmptyString(artifact.File, artifact.ModuleID, "kokoro-embed"),
			LangCode:    config.LangCode,
			SampleRate:  spec.SampleRate,
			SampleCount: len(pcm) / (spec.BitsPerSample * spec.ChannelCount / 8),
			DurationMS:  audio.DurationMSForWAVData(len(pcm), spec),
		}
	}
	if metadata.DurationMS <= 0 {
		return TTSResult{}, errors.New("kokoro embed output did not include a positive duration")
	}
	if metadata.Provider == "" {
		metadata.Provider = "kokoro-embed"
	}
	if metadata.Voice == "" {
		metadata.Voice = firstNonEmptyString(artifact.File, artifact.ModuleID, "kokoro-embed")
	}

	return TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  metadata.DurationMS,
		Provider:    metadata.Provider,
		Voice:       metadata.Voice,
	}, nil
}

func (agent *KokoroTTSAgent) SynthesizeWithReference(
	ctx context.Context,
	text string,
	referenceAudioPath string,
	referenceLanguage string,
) (TTSResult, error) {
	config := agent.config
	if strings.TrimSpace(referenceAudioPath) == "" {
		return TTSResult{}, errors.New("reference audio path is required")
	}
	if _, err := os.Stat(referenceAudioPath); err != nil {
		return TTSResult{}, fmt.Errorf("reference audio path not found: %w", err)
	}

	if config.ReferenceWorkerCount > 0 {
		result, err := agent.synthesizeWithReferenceWorker(ctx, text, referenceAudioPath, referenceLanguage)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return TTSResult{}, err
			}

			oneshot, oneshotErr := agent.synthesizeWithReferenceOneShot(ctx, text, referenceAudioPath, referenceLanguage)
			if oneshotErr == nil {
				return oneshot, nil
			}

			return TTSResult{}, fmt.Errorf("kokoro reference synthesis failed: %w: fallback failed: %s", err, oneshotErr)
		}

		return result, nil
	}

	return agent.synthesizeWithReferenceOneShot(ctx, text, referenceAudioPath, referenceLanguage)
}

func (agent *KokoroTTSAgent) synthesizeWithReferenceWorker(
	ctx context.Context,
	text string,
	referenceAudioPath string,
	referenceLanguage string,
) (TTSResult, error) {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.ReferenceTimeoutSeconds)*time.Second)
	defer cancel()

	if err := os.MkdirAll(config.DataDir, 0o755); err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro data dir: %w", err)
	}

	outputFile, err := os.CreateTemp(config.DataDir, "synth-clone-*.wav")
	if err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro clone output file: %w", err)
	}
	outputPath := outputFile.Name()
	if err := outputFile.Close(); err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro clone output file: %w", err)
	}
	defer func() {
		_ = os.Remove(outputPath)
	}()

	voiceLanguage := strings.TrimSpace(referenceLanguage)
	if voiceLanguage == "" {
		voiceLanguage = config.LangCode
	}
	if voiceLanguage == "" {
		voiceLanguage = "a"
	}

	if err := agent.ensureReferenceWorkers(ctx); err != nil {
		return TTSResult{}, err
	}

	worker, err := agent.acquireReferenceWorker(ctx)
	if err != nil {
		return TTSResult{}, err
	}

	requestID := strconv.FormatUint(atomic.AddUint64(&agent.referenceWorkerRequestID, 1), 10)
	request := map[string]string{
		"id":     requestID,
		"text":   text,
		"lang":   voiceLanguage,
		"ref":    referenceAudioPath,
		"output": outputPath,
	}
	payload, err := json.Marshal(request)
	if err != nil {
		agent.stopReferenceWorker(worker)
		agent.spawnReferenceWorkerReplacement()
		return TTSResult{}, err
	}

	if _, err := worker.stdin.Write(append(payload, '\n')); err != nil {
		agent.stopReferenceWorker(worker)
		agent.spawnReferenceWorkerReplacement()
		return TTSResult{}, fmt.Errorf("write kokoro clone request: %w", err)
	}

	line, err := readLineWithContext(ctx, worker.stdout)
	if err != nil {
		agent.stopReferenceWorker(worker)
		agent.spawnReferenceWorkerReplacement()
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return TTSResult{}, fmt.Errorf(
				"%w: kokoro reference synthesis timed out after %d seconds",
				context.DeadlineExceeded,
				config.ReferenceTimeoutSeconds,
			)
		}

		return TTSResult{}, fmt.Errorf("read kokoro clone response: %w", err)
	}
	agent.releaseReferenceWorker(worker)

	var response cloneServerResponse
	if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &response); err != nil {
		agent.stopReferenceWorker(worker)
		agent.spawnReferenceWorkerReplacement()
		return TTSResult{}, fmt.Errorf("parse kokoro clone response: %w", err)
	}
	if strings.TrimSpace(response.Error) != "" {
		return TTSResult{}, errors.New(response.Error)
	}
	if response.ID != "" && response.ID != requestID {
		agent.stopReferenceWorker(worker)
		agent.spawnReferenceWorkerReplacement()
		return TTSResult{}, fmt.Errorf("kokoro clone response id %q did not match request id %q", response.ID, requestID)
	}

	wavPath := outputPath
	if strings.TrimSpace(response.Output) != "" {
		wavPath = response.Output
	}

	wav, err := os.ReadFile(wavPath)
	if err != nil {
		return TTSResult{}, fmt.Errorf("read kokoro clone output: %w", err)
	}

	metadata, parseErr := parseKokoroMetadata(line)
	if parseErr != nil {
		spec, pcm, pcmErr := audio.ParsePCM16WAV(wav)
		if pcmErr != nil {
			return TTSResult{}, fmt.Errorf("parse kokoro clone metadata: %w", parseErr)
		}

		metadata = kokoroMetadata{
			Provider:    "kokoro-clone",
			RepoID:      "koko-clone",
			Voice:       "clone",
			LangCode:    voiceLanguage,
			SampleRate:  spec.SampleRate,
			SampleCount: len(pcm) / (spec.BitsPerSample * spec.ChannelCount / 8),
			DurationMS:  audio.DurationMSForWAVData(len(pcm), spec),
		}
	}
	if metadata.DurationMS <= 0 {
		return TTSResult{}, errors.New("kokoro clone output did not include a positive duration")
	}

	return TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  metadata.DurationMS,
		Provider:    metadata.Provider,
		Voice:       metadata.Voice,
	}, nil
}

func (agent *KokoroTTSAgent) synthesizeWithReferenceOneShot(
	ctx context.Context,
	text string,
	referenceAudioPath string,
	referenceLanguage string,
) (TTSResult, error) {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.ReferenceTimeoutSeconds)*time.Second)
	defer cancel()

	if err := os.MkdirAll(config.DataDir, 0o755); err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro data dir: %w", err)
	}

	workDir, err := os.MkdirTemp(config.DataDir, "synth-*")
	if err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro work dir: %w", err)
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	textPath := filepath.Join(workDir, "input.txt")
	outputPath := filepath.Join(workDir, "output.wav")
	if err := os.WriteFile(textPath, []byte(text), 0o600); err != nil {
		return TTSResult{}, fmt.Errorf("write kokoro input: %w", err)
	}

	voiceLanguage := strings.TrimSpace(referenceLanguage)
	if voiceLanguage == "" {
		voiceLanguage = config.LangCode
	}
	if voiceLanguage == "" {
		voiceLanguage = "a"
	}

	command := exec.CommandContext(
		ctx,
		config.ReferencePythonPath,
		config.ReferenceScriptPath,
		"--text-file",
		textPath,
		"--output",
		outputPath,
		"--lang",
		voiceLanguage,
		"--ref",
		referenceAudioPath,
	)
	if modulePath := strings.TrimSpace(config.ReferenceModulePath); modulePath != "" {
		command.Args = append(
			command.Args,
			"--module-path",
			modulePath,
		)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return TTSResult{}, fmt.Errorf(
				"%w: kokoro reference synthesis timed out after %d seconds",
				context.DeadlineExceeded,
				config.ReferenceTimeoutSeconds,
			)
		}

		return TTSResult{}, fmt.Errorf("kokoro reference synthesis failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	wav, err := os.ReadFile(outputPath)
	if err != nil {
		return TTSResult{}, fmt.Errorf("read kokoro clone output: %w", err)
	}

	metadata, parseErr := parseKokoroMetadata(stdout.String())
	if parseErr != nil {
		spec, pcm, pcmErr := audio.ParsePCM16WAV(wav)
		if pcmErr != nil {
			return TTSResult{}, fmt.Errorf("parse kokoro clone metadata: %w", parseErr)
		}

		metadata = kokoroMetadata{
			Provider:    "kokoro-clone",
			RepoID:      "koko-clone",
			Voice:       "clone",
			LangCode:    voiceLanguage,
			SampleRate:  spec.SampleRate,
			SampleCount: len(pcm) / (spec.BitsPerSample * spec.ChannelCount / 8),
			DurationMS:  audio.DurationMSForWAVData(len(pcm), spec),
		}
	}
	if metadata.DurationMS <= 0 {
		return TTSResult{}, errors.New("kokoro clone output did not include a positive duration")
	}

	return TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  metadata.DurationMS,
		Provider:    metadata.Provider,
		Voice:       metadata.Voice,
	}, nil
}

func (agent *KokoroTTSAgent) ensureReferenceWorkers(ctx context.Context) error {
	agent.referenceWorkerInit.Do(func() {
		workerCount := configReferenceWorkerCount(agent.config.ReferenceWorkerCount)
		startedWorkers := make([]*kokoroReferenceWorker, 0, workerCount)

		for i := 0; i < workerCount; i++ {
			if ctx.Err() != nil {
				agent.referenceWorkerInitErr = ctx.Err()
				break
			}

			readyCtx, readyCancel := context.WithTimeout(
				ctx,
				time.Duration(agent.config.ReferenceWorkerReadyTimeoutSeconds)*time.Second,
			)
			worker, startErr := agent.startReferenceWorker(readyCtx)
			readyCancel()
			if startErr != nil {
				agent.referenceWorkerInitErr = startErr
				break
			}
			startedWorkers = append(startedWorkers, worker)
		}

		if agent.referenceWorkerInitErr != nil {
			for _, worker := range startedWorkers {
				agent.stopReferenceWorker(worker)
			}
			return
		}

		for _, worker := range startedWorkers {
			agent.referenceWorkers <- worker
		}
	})

	return agent.referenceWorkerInitErr
}

func (agent *KokoroTTSAgent) startReferenceWorker(ctx context.Context) (*kokoroReferenceWorker, error) {
	config := agent.config
	command := exec.CommandContext(
		ctx,
		config.ReferencePythonPath,
		config.ReferenceScriptPath,
		"--server",
		"--device",
		config.Device,
	)
	if modulePath := strings.TrimSpace(config.ReferenceModulePath); modulePath != "" {
		command.Args = append(command.Args, "--module-path", modulePath)
	}
	command.Stderr = os.Stderr

	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create clone worker stdin: %w", err)
	}
	stdoutPipe, err := command.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create clone worker stdout: %w", err)
	}
	stdout := bufio.NewReader(stdoutPipe)

	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start kokoro clone worker: %w", err)
	}

	readyLine, err := readLineWithContext(ctx, stdout)
	if err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf(
				"%w: kokoro clone worker did not load within %d seconds",
				context.DeadlineExceeded,
				config.ReferenceWorkerReadyTimeoutSeconds,
			)
		}
		return nil, fmt.Errorf("read kokoro clone worker readiness: %w", err)
	}

	var response cloneServerResponse
	if err := json.Unmarshal([]byte(strings.TrimSpace(readyLine)), &response); err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		return nil, fmt.Errorf("parse kokoro clone worker readiness: %w", err)
	}
	if response.Type != "ready" {
		_ = command.Process.Kill()
		_ = command.Wait()
		return nil, fmt.Errorf("kokoro clone worker readiness unexpected: %s", strings.TrimSpace(readyLine))
	}

	return &kokoroReferenceWorker{
		command: command,
		stdin:   stdin,
		stdout:  stdout,
	}, nil
}

func (agent *KokoroTTSAgent) acquireReferenceWorker(ctx context.Context) (*kokoroReferenceWorker, error) {
	select {
	case worker := <-agent.referenceWorkers:
		return worker, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (agent *KokoroTTSAgent) releaseReferenceWorker(worker *kokoroReferenceWorker) {
	if worker == nil {
		return
	}

	select {
	case agent.referenceWorkers <- worker:
	default:
		agent.stopReferenceWorker(worker)
	}
}

func (agent *KokoroTTSAgent) stopReferenceWorker(worker *kokoroReferenceWorker) {
	if worker == nil {
		return
	}

	_ = worker.stdin.Close()
	if worker.command.Process != nil {
		_ = worker.command.Process.Kill()
	}
	_ = worker.command.Wait()
}

func (agent *KokoroTTSAgent) spawnReferenceWorkerReplacement() {
	config := agent.config
	go func() {
		ctx, cancel := context.WithTimeout(
			context.Background(),
			time.Duration(config.ReferenceWorkerReadyTimeoutSeconds)*time.Second,
		)
		defer cancel()

		replacement, err := agent.startReferenceWorker(ctx)
		if err != nil {
			return
		}

		select {
		case agent.referenceWorkers <- replacement:
		default:
			agent.stopReferenceWorker(replacement)
		}
	}()
}

func configReferenceWorkerCount(value int) int {
	if value <= 0 {
		return 1
	}

	return value
}

func parseKokoroMetadata(stdout string) (kokoroMetadata, error) {
	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	for index := len(lines) - 1; index >= 0; index-- {
		line := strings.TrimSpace(lines[index])
		if line == "" {
			continue
		}

		var metadata kokoroMetadata
		if err := json.Unmarshal([]byte(line), &metadata); err != nil {
			return kokoroMetadata{}, fmt.Errorf("parse kokoro metadata: %w", err)
		}
		if metadata.DurationMS <= 0 {
			return kokoroMetadata{}, errors.New("kokoro metadata did not include a positive duration")
		}

		return metadata, nil
	}

	return kokoroMetadata{}, errors.New("kokoro did not return metadata")
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if clean := strings.TrimSpace(value); clean != "" {
			return clean
		}
	}
	return ""
}

func max(a int, b int) int {
	if a > b {
		return a
	}
	return b
}
