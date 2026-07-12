package pipeline

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/audio"
)

func normalizeProfileSourceAudio(
	ctx context.Context,
	inputPath string,
	outputPath string,
	audioStreamIndex int,
) (int, error) {
	copied, durationMS, err := tryCopyNormalizedPCM16WAV(inputPath, outputPath)
	if err != nil {
		return 0, err
	}
	if copied {
		return durationMS, nil
	}

	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return 0, fmt.Errorf("ffmpeg is required to normalize this media source: %w", err)
	}

	baseArgs := []string{
		"-hide_banner",
		"-loglevel",
		"error",
		"-nostdin",
		"-y",
		"-i",
		inputPath,
		"-vn",
		"-acodec",
		"pcm_s16le",
		"-ac",
		"1",
		"-ar",
		"24000",
		"-f",
		"wav",
	}
	attempts := make([]string, 0, 2)
	if audioStreamIndex >= 0 {
		attempts = append(attempts, fmt.Sprintf("0:%d", audioStreamIndex))
	}
	attempts = append(attempts, "")

	var lastErr error
	for _, audioMap := range attempts {
		commandArgs := make([]string, 0, len(baseArgs)+3)
		commandArgs = append(commandArgs, baseArgs...)
		if audioMap != "" {
			commandArgs = append(commandArgs, "-map", audioMap)
		}
		commandArgs = append(commandArgs, outputPath)

		output, err := exec.CommandContext(ctx, "ffmpeg", commandArgs...).CombinedOutput()
		if err != nil {
			lastErr = fmt.Errorf("ffmpeg normalization failed with map %q: %w: %s", audioMap, err, strings.TrimSpace(string(output)))
			_ = os.Remove(outputPath)
			continue
		}
		stat, statErr := os.Stat(outputPath)
		if statErr == nil && stat.Size() > 0 {
			return audioDurationMilliseconds(outputPath)
		}
		if statErr == nil {
			lastErr = fmt.Errorf("ffmpeg normalization produced empty output with map %q", audioMap)
			_ = os.Remove(outputPath)
			continue
		}
		lastErr = fmt.Errorf("ffmpeg normalization output not available with map %q: %w", audioMap, statErr)
	}
	if lastErr == nil {
		lastErr = errors.New("ffmpeg normalization completed without output")
	}
	return 0, lastErr
}

func tryCopyNormalizedPCM16WAV(inputPath string, outputPath string) (bool, int, error) {
	header := make([]byte, 12)
	source, err := os.Open(inputPath)
	if err != nil {
		return false, 0, err
	}
	readCount, readErr := io.ReadFull(source, header)
	_ = source.Close()
	if readErr != nil || readCount < len(header) {
		return false, 0, nil
	}
	if string(header[0:4]) != "RIFF" || string(header[8:12]) != "WAVE" {
		return false, 0, nil
	}

	raw, err := os.ReadFile(inputPath)
	if err != nil {
		return false, 0, err
	}
	spec, data, err := audio.ParsePCM16WAV(raw)
	if err != nil {
		return false, 0, nil
	}
	if spec.SampleRate != 24000 || spec.ChannelCount != 1 || spec.BitsPerSample != 16 {
		return false, 0, nil
	}

	return true, audio.DurationMSForWAVData(len(data), spec), copyFile(inputPath, outputPath)
}

func denoiseProfileSourceAudio(
	ctx context.Context,
	rawPath string,
	cleanPath string,
	provider string,
	strength string,
) (VoiceProfileDenoiseMetadata, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" {
		provider = defaultVoiceProfileDenoiseProvider
	}
	strength = strings.ToLower(strings.TrimSpace(strength))
	if strength == "" {
		strength = defaultVoiceProfileDenoiseStrength
	}

	before := pcmNoiseSummaryForPath(rawPath)
	metadata := VoiceProfileDenoiseMetadata{
		Provider:        provider,
		Strength:        strength,
		RawAudio:        normalizedProfileSourceFilename,
		CleanAudio:      cleanedProfileSourceFilename,
		RawPath:         rawPath,
		CleanPath:       cleanPath,
		NoiseRiskBefore: before.noiseRisk,
		SNRBeforeDB:     approximateSNRDB(before.noiseRisk),
	}

	if provider == "none" {
		if err := copyFile(rawPath, cleanPath); err != nil {
			return metadata, err
		}
		after := pcmNoiseSummaryForPath(cleanPath)
		metadata.NoiseRiskAfter = after.noiseRisk
		metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
		metadata.Reason = "Denoise disabled; using normalized audio for analysis."
		return metadata, nil
	}
	if provider == "ffmpeg" && strength != "strong" && before.noiseRisk <= denoiseFastPathNoiseRisk {
		if err := copyFile(rawPath, cleanPath); err != nil {
			return metadata, err
		}
		after := pcmNoiseSummaryForPath(cleanPath)
		metadata.Applied = false
		metadata.NoiseRiskAfter = after.noiseRisk
		metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
		metadata.Reason = "Source already measures clean; skipped denoise to preserve speech detail."
		return metadata, nil
	}
	if provider != "ffmpeg" {
		metadata.Warnings = append(metadata.Warnings, fmt.Sprintf("Unknown denoise provider %q; using normalized audio.", provider))
		if err := copyFile(rawPath, cleanPath); err != nil {
			return metadata, err
		}
		after := pcmNoiseSummaryForPath(cleanPath)
		metadata.Provider = "none"
		metadata.NoiseRiskAfter = after.noiseRisk
		metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
		metadata.Reason = "Denoise provider was not recognized."
		return metadata, nil
	}

	if _, err := exec.LookPath("ffmpeg"); err != nil {
		metadata.Warnings = append(metadata.Warnings, "ffmpeg was not available, so denoise fell back to normalized audio.")
		if copyErr := copyFile(rawPath, cleanPath); copyErr != nil {
			return metadata, copyErr
		}
		after := pcmNoiseSummaryForPath(cleanPath)
		metadata.Applied = false
		metadata.NoiseRiskAfter = after.noiseRisk
		metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
		metadata.Reason = "ffmpeg denoise unavailable; using normalized audio."
		return metadata, nil
	}

	var lastErr error
	for _, filter := range denoiseFilterCandidates(strength) {
		args := []string{
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-y",
			"-i",
			rawPath,
			"-af",
			filter,
			"-acodec",
			"pcm_s16le",
			"-ac",
			"1",
			"-ar",
			"24000",
			"-f",
			"wav",
			cleanPath,
		}
		output, err := exec.CommandContext(ctx, "ffmpeg", args...).CombinedOutput()
		if err != nil {
			lastErr = fmt.Errorf("ffmpeg denoise failed: %w: %s", err, strings.TrimSpace(string(output)))
			_ = os.Remove(cleanPath)
			continue
		}
		if stat, statErr := os.Stat(cleanPath); statErr == nil && stat.Size() > 0 {
			after := pcmNoiseSummaryForPath(cleanPath)
			metadata.Applied = true
			metadata.NoiseRiskAfter = after.noiseRisk
			metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
			metadata.Reason = "Applied conservative local ffmpeg denoise before speaker analysis."
			return metadata, nil
		}
		lastErr = errors.New("ffmpeg denoise produced empty output")
		_ = os.Remove(cleanPath)
	}

	metadata.Warnings = append(metadata.Warnings, "ffmpeg denoise failed, so analysis used normalized audio.")
	if lastErr != nil {
		metadata.Warnings = append(metadata.Warnings, lastErr.Error())
	}
	if err := copyFile(rawPath, cleanPath); err != nil {
		return metadata, err
	}
	after := pcmNoiseSummaryForPath(cleanPath)
	metadata.Applied = false
	metadata.NoiseRiskAfter = after.noiseRisk
	metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
	metadata.Reason = "Denoise fallback used normalized audio."
	return metadata, nil
}

func denoiseFilterCandidates(strength string) []string {
	switch strength {
	case "gentle":
		return []string{
			"highpass=f=65,lowpass=f=9500,afftdn=nf=-30,loudnorm=I=-18:TP=-2:LRA=11",
			"highpass=f=65,lowpass=f=9500,loudnorm=I=-18:TP=-2:LRA=11",
		}
	case "strong":
		return []string{
			"highpass=f=90,lowpass=f=8000,afftdn=nf=-20,loudnorm=I=-18:TP=-2:LRA=11",
			"highpass=f=90,lowpass=f=8000,loudnorm=I=-18:TP=-2:LRA=11",
		}
	default:
		return []string{
			"highpass=f=70,lowpass=f=9000,afftdn=nf=-25,loudnorm=I=-18:TP=-2:LRA=11",
			"highpass=f=70,lowpass=f=9000,loudnorm=I=-18:TP=-2:LRA=11",
		}
	}
}

type pcmNoiseSummary struct {
	noiseRisk float64
}

func pcmNoiseSummaryForPath(path string) pcmNoiseSummary {
	raw, err := os.ReadFile(path)
	if err != nil {
		return pcmNoiseSummary{noiseRisk: 1}
	}
	spec, data, err := audio.ParsePCM16WAV(raw)
	if err != nil {
		return pcmNoiseSummary{noiseRisk: 1}
	}
	durationMS := audio.DurationMSForWAVData(len(data), spec)
	rms, silenceRatio, _ := pcmStatsForSpan(data, spec, 0, durationMS)
	return pcmNoiseSummary{noiseRisk: estimateNoiseRisk(rms, silenceRatio)}
}

func approximateSNRDB(noiseRisk float64) float64 {
	return math.Round((6+30*(1-clamp01(noiseRisk)))*10) / 10
}
