package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const convertedReferenceFilename = "reference.wav"

var unsafeFilenamePattern = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func (service *Service) ListVoices() []Voice {
	service.mu.RLock()
	defer service.mu.RUnlock()

	voices := nativeVoices()
	for _, voice := range service.voices {
		voice.ReferenceAudioPath = ""
		voices = append(voices, voice)
	}

	sort.SliceStable(voices, func(left int, right int) bool {
		if voices[left].Kind != voices[right].Kind {
			return voices[left].Kind == VoiceKindNative
		}

		return voices[left].Name < voices[right].Name
	})

	return voices
}

func (service *Service) ResolveVoice(id string) (Voice, error) {
	trimmedID := strings.TrimSpace(id)
	if trimmedID == "" {
		trimmedID = defaultNativeVoiceID()
	}

	for _, voice := range nativeVoices() {
		if voice.ID == trimmedID {
			return voice, nil
		}
	}

	service.mu.RLock()
	voice, ok := service.voices[trimmedID]
	service.mu.RUnlock()
	if !ok {
		return Voice{}, ErrVoiceNotFound
	}

	return voice, nil
}

func (service *Service) CreateCloneVoice(ctx context.Context, upload VoiceUpload) (Voice, error) {
	if upload.Reader == nil {
		return Voice{}, fmt.Errorf("%w: file is required", ErrInvalidVoice)
	}

	name := strings.TrimSpace(upload.Name)
	if name == "" {
		name = strings.TrimSpace(upload.Filename)
	}
	if name == "" {
		name = "Cloned voice"
	}

	id := "clone_" + newID()
	voiceDir, err := filepath.Abs(filepath.Join(service.options.VoiceDataDir, id))
	if err != nil {
		return Voice{}, err
	}
	if err := os.MkdirAll(voiceDir, 0o755); err != nil {
		return Voice{}, fmt.Errorf("create voice dir: %w", err)
	}

	sourceFilename := safeFilename(upload.Filename)
	sourcePath := filepath.Join(voiceDir, sourceFilename)
	sourceFile, err := os.OpenFile(sourcePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return Voice{}, fmt.Errorf("create uploaded voice file: %w", err)
	}
	if _, err := io.Copy(sourceFile, upload.Reader); err != nil {
		_ = sourceFile.Close()
		return Voice{}, fmt.Errorf("write uploaded voice file: %w", err)
	}
	if err := sourceFile.Close(); err != nil {
		return Voice{}, fmt.Errorf("close uploaded voice file: %w", err)
	}

	referenceAudioPath := filepath.Join(voiceDir, convertedReferenceFilename)
	if err := service.convertReferenceAudio(ctx, sourcePath, referenceAudioPath); err != nil {
		return Voice{}, err
	}

	now := time.Now().UTC()
	voice := Voice{
		ID:                 id,
		Name:               name,
		Kind:               VoiceKindClone,
		Provider:           "kokoclone",
		LangCode:           "en",
		ReferenceAudioURL:  fmt.Sprintf("/api/voices/%s/reference-audio", id),
		ReferenceAudioPath: referenceAudioPath,
		SourceFilename:     upload.Filename,
		CreatedAt:          now,
	}
	if err := writeVoiceMetadata(voiceDir, voice); err != nil {
		return Voice{}, fmt.Errorf("write voice metadata: %w", err)
	}

	service.mu.Lock()
	service.voices[id] = voice
	service.mu.Unlock()

	voice.ReferenceAudioPath = ""
	return voice, nil
}

func (service *Service) GetVoiceReferenceAudio(id string) ([]byte, string, error) {
	voice, err := service.ResolveVoice(id)
	if err != nil {
		return nil, "", err
	}
	if voice.Kind != VoiceKindClone || voice.ReferenceAudioPath == "" {
		return nil, "", ErrVoiceNotFound
	}

	audioBytes, err := os.ReadFile(voice.ReferenceAudioPath)
	if err != nil {
		return nil, "", fmt.Errorf("read voice reference audio: %w", err)
	}

	return audioBytes, "audio/wav", nil
}

func (service *Service) convertReferenceAudio(ctx context.Context, sourcePath string, outputPath string) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	command := exec.CommandContext(
		ctx,
		service.options.FFMPEGPath,
		"-hide_banner",
		"-loglevel",
		"error",
		"-nostdin",
		"-y",
		"-i",
		sourcePath,
		"-map",
		"0:a:0",
		"-vn",
		"-ac",
		"1",
		"-ar",
		"24000",
		"-t",
		"10",
		"-c:a",
		"pcm_s16le",
		outputPath,
	)

	output, err := command.CombinedOutput()
	if err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("convert reference audio timed out: %w", ctx.Err())
		}

		return fmt.Errorf("convert reference audio with ffmpeg: %w: %s", err, strings.TrimSpace(string(output)))
	}

	info, err := os.Stat(outputPath)
	if err != nil {
		return fmt.Errorf("stat converted reference audio: %w", err)
	}
	if info.Size() <= 44 {
		return fmt.Errorf("%w: converted reference audio is empty", ErrInvalidVoice)
	}

	return nil
}

func (service *Service) loadCloneVoices() {
	root := strings.TrimSpace(service.options.VoiceDataDir)
	if root == "" {
		return
	}

	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		metadataPath := filepath.Join(root, entry.Name(), "metadata.json")
		payload, err := os.ReadFile(metadataPath)
		if err != nil {
			continue
		}

		var voice Voice
		if err := json.Unmarshal(payload, &voice); err != nil {
			continue
		}
		if voice.ID == "" || voice.Kind != VoiceKindClone {
			continue
		}
		if voice.ReferenceAudioPath == "" {
			voice.ReferenceAudioPath = filepath.Join(root, entry.Name(), convertedReferenceFilename)
		}
		if voice.ReferenceAudioURL == "" {
			voice.ReferenceAudioURL = fmt.Sprintf("/api/voices/%s/reference-audio", voice.ID)
		}

		service.voices[voice.ID] = voice
	}
}

func writeVoiceMetadata(voiceDir string, voice Voice) error {
	payload, err := json.MarshalIndent(voice, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(voiceDir, "metadata.json"), append(payload, '\n'), 0o600)
}

func nativeVoices() []Voice {
	createdAt := time.Time{}
	return []Voice{
		{ID: "kokoro:af_heart", Name: "Heart", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "a", CreatedAt: createdAt},
		{ID: "kokoro:af_bella", Name: "Bella", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "a", CreatedAt: createdAt},
		{ID: "kokoro:af_nicole", Name: "Nicole", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "a", CreatedAt: createdAt},
		{ID: "kokoro:af_sarah", Name: "Sarah", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "a", CreatedAt: createdAt},
		{ID: "kokoro:af_sky", Name: "Sky", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "a", CreatedAt: createdAt},
		{ID: "kokoro:am_adam", Name: "Adam", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "a", CreatedAt: createdAt},
		{ID: "kokoro:am_michael", Name: "Michael", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "a", CreatedAt: createdAt},
		{ID: "kokoro:bf_emma", Name: "Emma", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "b", CreatedAt: createdAt},
		{ID: "kokoro:bf_isabella", Name: "Isabella", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "b", CreatedAt: createdAt},
		{ID: "kokoro:bm_george", Name: "George", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "b", CreatedAt: createdAt},
		{ID: "kokoro:bm_lewis", Name: "Lewis", Kind: VoiceKindNative, Provider: "kokoro", LangCode: "b", CreatedAt: createdAt},
	}
}

func defaultNativeVoiceID() string {
	return "kokoro:af_heart"
}

func safeFilename(value string) string {
	base := filepath.Base(strings.TrimSpace(value))
	if base == "." || base == string(filepath.Separator) || base == "" {
		base = "upload"
	}
	base = unsafeFilenamePattern.ReplaceAllString(base, "_")
	if base == "" {
		return "upload"
	}

	return base
}
