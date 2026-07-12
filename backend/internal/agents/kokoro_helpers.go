package agents

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/audio"
)

func runKokoroCommand(command *exec.Cmd) (string, string, error) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	err := command.Run()

	return stdout.String(), strings.TrimSpace(stderr.String()), err
}

func resolveKokoroReferenceLanguage(configLanguage string, requestedLanguage string) string {
	if clean := strings.TrimSpace(requestedLanguage); clean != "" {
		return clean
	}
	if clean := strings.TrimSpace(configLanguage); clean != "" {
		return clean
	}
	return "a"
}

func resolveKokoroMetadataFallback(stdout string, wav []byte, fallback kokoroMetadata) (kokoroMetadata, error) {
	metadata, err := parseKokoroMetadata(stdout)
	if err == nil {
		return metadata, nil
	}

	spec, pcm, pcmErr := audio.ParsePCM16WAV(wav)
	if pcmErr != nil {
		return kokoroMetadata{}, err
	}

	fallback.SampleRate = spec.SampleRate
	fallback.SampleCount = len(pcm) / (spec.BitsPerSample * spec.ChannelCount / 8)
	fallback.DurationMS = audio.DurationMSForWAVData(len(pcm), spec)

	return fallback, nil
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

func configReferenceWorkerCount(value int) int {
	if value <= 0 {
		return 1
	}

	return value
}
