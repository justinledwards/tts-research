package pipeline

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (service *Service) transcriptForAudioPath(
	ctx context.Context,
	expectedText string,
	audioPath string,
) TranscriptMetadata {
	now := time.Now().UTC()
	path := strings.TrimSpace(audioPath)
	if path == "" {
		return TranscriptMetadata{
			GeneratedAt: &now,
			Error:       "audio artifact path is not available",
		}
	}
	if service.checker == nil {
		return TranscriptMetadata{
			GeneratedAt: &now,
			Error:       "voice transcript checker is not configured",
		}
	}
	audioBytes, err := os.ReadFile(path)
	if err != nil {
		return TranscriptMetadata{
			GeneratedAt: &now,
			Error:       fmt.Sprintf("read audio artifact: %s", err.Error()),
		}
	}
	check, err := service.checker.Check(ctx, strings.TrimSpace(expectedText), audioBytes)
	if err != nil {
		return TranscriptMetadata{
			GeneratedAt: &now,
			Error:       fmt.Sprintf("transcribe audio artifact: %s", err.Error()),
		}
	}
	model := strings.TrimSpace(check.Provider)
	return TranscriptMetadata{
		Text:        strings.TrimSpace(check.Transcript),
		GeneratedAt: &now,
		Model:       model,
		Provider:    model,
		Confidence:  clamp01(check.Similarity),
	}
}

func transcriptErrorMetadata(message string) TranscriptMetadata {
	now := time.Now().UTC()
	return TranscriptMetadata{
		GeneratedAt: &now,
		Error:       strings.TrimSpace(message),
	}
}

func (service *Service) RefreshPreparedSourceTranscript(
	ctx context.Context,
	id string,
) (PreparedSource, error) {
	service.mu.RLock()
	source, ok := service.sourcePreps[strings.TrimSpace(id)]
	service.mu.RUnlock()
	if !ok {
		return PreparedSource{}, ErrPreparedSourceNotFound
	}
	source = clonePreparedSource(source)
	path := preparedSourceTranscriptAudioPath(source)
	expectedText := strings.TrimSpace(firstNonEmpty(source.SpeechText, source.Text))
	transcript := TranscriptMetadata{}
	if path == "" {
		transcript = transcriptErrorMetadata("prepared source has no audio artifact metadata")
	} else {
		transcript = service.transcriptForAudioPath(ctx, expectedText, path)
	}
	setPreparedSourceTranscript(&source, transcript)
	service.updatePreparedSource(source)
	if err := service.writePreparedSourceMetadata(source); err != nil {
		return PreparedSource{}, err
	}
	return service.GetPreparedSource(source.ID)
}

func (service *Service) RefreshVoiceProfileSourceTranscript(
	ctx context.Context,
	id string,
) (VoiceProfileSource, error) {
	source, err := service.GetVoiceProfileSource(id)
	if err != nil {
		return VoiceProfileSource{}, err
	}
	path := voiceProfileSourceTranscriptAudioPath(source)
	transcript := TranscriptMetadata{}
	if path == "" {
		transcript = transcriptErrorMetadata("voice source has no normalized audio artifact")
	} else {
		transcript = service.transcriptForAudioPath(ctx, "", path)
	}
	service.updateVoiceProfileSourceByID(source.ID, func(stored *storedVoiceProfileSource) {
		setVoiceProfileSourceTranscript(&stored.VoiceProfileSource, transcript)
	})
	return service.GetVoiceProfileSource(source.ID)
}

func (service *Service) RefreshVoiceProfileCandidateTranscript(
	ctx context.Context,
	sourceID string,
	candidateID string,
) (VoiceProfileCandidate, error) {
	_, candidate, err := service.getVoiceProfileSourceCandidate(sourceID, candidateID)
	if err != nil {
		return VoiceProfileCandidate{}, err
	}
	path := strings.TrimSpace(candidate.ReferencePath)
	transcript := TranscriptMetadata{}
	if path == "" {
		transcript = transcriptErrorMetadata("voice candidate has no stitched reference audio artifact")
	} else {
		transcript = service.transcriptForAudioPath(ctx, "", path)
	}
	var updated VoiceProfileCandidate
	found := false
	service.updateVoiceProfileSourceByID(sourceID, func(source *storedVoiceProfileSource) {
		for index := range source.Candidates {
			if source.Candidates[index].ID != candidateID {
				continue
			}
			setVoiceProfileCandidateTranscript(&source.Candidates[index], transcript)
			updated = source.Candidates[index]
			found = true
			return
		}
	})
	if !found {
		return VoiceProfileCandidate{}, ErrProfileCandidateNotFound
	}
	return normalizeVoiceProfileCandidateTranscriptFields(updated), nil
}

func preparedSourceTranscriptAudioPath(source PreparedSource) string {
	for _, key := range []string{
		"audioPath",
		"normalizedAudioPath",
		"normalizedPath",
		"analyzedMediaPath",
		"analysisPath",
		"mediaPath",
		"sourcePath",
	} {
		value := strings.TrimSpace(transcriptMetadataString(source.Metadata, key))
		if value == "" {
			continue
		}
		if filepath.IsAbs(value) {
			return value
		}
		if abs, err := filepath.Abs(value); err == nil {
			return abs
		}
		return value
	}
	return ""
}

func voiceProfileSourceTranscriptAudioPath(source VoiceProfileSource) string {
	return strings.TrimSpace(firstNonEmpty(source.CleanedPath, source.NormalizedPath))
}

func transcriptMetadataString(metadata map[string]any, key string) string {
	if len(metadata) == 0 {
		return ""
	}
	value, ok := metadata[key]
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return ""
	}
}

func setPreparedSourceTranscript(source *PreparedSource, transcript TranscriptMetadata) {
	source.TranscriptMetadata = cloneTranscriptMetadata(&transcript)
	source.Transcript = transcript.Text
	source.TranscriptGeneratedAt = cloneTimePtr(transcript.GeneratedAt)
	source.TranscriptModel = transcript.Model
	source.TranscriptError = transcript.Error
	source.TranscriptConfidence = transcript.Confidence
}

func setVoiceProfileSourceTranscript(source *VoiceProfileSource, transcript TranscriptMetadata) {
	source.TranscriptMetadata = cloneTranscriptMetadata(&transcript)
	source.Transcript = transcript.Text
	source.TranscriptGeneratedAt = cloneTimePtr(transcript.GeneratedAt)
	source.TranscriptModel = transcript.Model
	source.TranscriptError = transcript.Error
	source.TranscriptConfidence = transcript.Confidence
}

func setVoiceProfileCandidateTranscript(candidate *VoiceProfileCandidate, transcript TranscriptMetadata) {
	candidate.TranscriptMetadata = cloneTranscriptMetadata(&transcript)
	candidate.Transcript = transcript.Text
	candidate.TranscriptGeneratedAt = cloneTimePtr(transcript.GeneratedAt)
	candidate.TranscriptModel = transcript.Model
	candidate.TranscriptError = transcript.Error
	candidate.TranscriptConfidence = transcript.Confidence
}

func normalizePreparedSourceTranscriptFields(source PreparedSource) PreparedSource {
	metadata := normalizeTranscriptMetadata(
		source.TranscriptMetadata,
		source.Transcript,
		source.TranscriptGeneratedAt,
		source.TranscriptModel,
		source.TranscriptError,
		source.TranscriptConfidence,
	)
	if metadata == nil {
		return source
	}
	setPreparedSourceTranscript(&source, *metadata)
	return source
}

func normalizeVoiceProfileSourceTranscriptFields(source VoiceProfileSource) VoiceProfileSource {
	metadata := normalizeTranscriptMetadata(
		source.TranscriptMetadata,
		source.Transcript,
		source.TranscriptGeneratedAt,
		source.TranscriptModel,
		source.TranscriptError,
		source.TranscriptConfidence,
	)
	if metadata != nil {
		setVoiceProfileSourceTranscript(&source, *metadata)
	}
	for index := range source.Candidates {
		source.Candidates[index] = normalizeVoiceProfileCandidateTranscriptFields(source.Candidates[index])
	}
	return source
}

func normalizeVoiceProfileCandidateTranscriptFields(candidate VoiceProfileCandidate) VoiceProfileCandidate {
	metadata := normalizeTranscriptMetadata(
		candidate.TranscriptMetadata,
		candidate.Transcript,
		candidate.TranscriptGeneratedAt,
		candidate.TranscriptModel,
		candidate.TranscriptError,
		candidate.TranscriptConfidence,
	)
	if metadata == nil {
		return candidate
	}
	setVoiceProfileCandidateTranscript(&candidate, *metadata)
	return candidate
}

func normalizeTranscriptMetadata(
	metadata *TranscriptMetadata,
	text string,
	generatedAt *time.Time,
	model string,
	transcriptError string,
	confidence float64,
) *TranscriptMetadata {
	normalized := cloneTranscriptMetadata(metadata)
	if normalized == nil {
		if strings.TrimSpace(text) == "" &&
			generatedAt == nil &&
			strings.TrimSpace(model) == "" &&
			strings.TrimSpace(transcriptError) == "" &&
			confidence == 0 {
			return nil
		}
		normalized = &TranscriptMetadata{}
	}
	if strings.TrimSpace(normalized.Text) == "" {
		normalized.Text = strings.TrimSpace(text)
	}
	if normalized.GeneratedAt == nil {
		normalized.GeneratedAt = cloneTimePtr(generatedAt)
	}
	if strings.TrimSpace(normalized.Model) == "" {
		normalized.Model = strings.TrimSpace(model)
	}
	if strings.TrimSpace(normalized.Provider) == "" {
		normalized.Provider = normalized.Model
	}
	if strings.TrimSpace(normalized.Error) == "" {
		normalized.Error = strings.TrimSpace(transcriptError)
	}
	if normalized.Confidence == 0 {
		normalized.Confidence = clamp01(confidence)
	}
	return normalized
}

func cloneTranscriptMetadata(metadata *TranscriptMetadata) *TranscriptMetadata {
	if metadata == nil {
		return nil
	}
	cloned := *metadata
	cloned.GeneratedAt = cloneTimePtr(metadata.GeneratedAt)
	return &cloned
}

func cloneTimePtr(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
