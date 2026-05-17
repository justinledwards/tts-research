package alignment

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

type gentleResponse struct {
	Words []gentleWord `json:"words"`
}

type gentleWord struct {
	Case        string  `json:"case"`
	Aligned     string  `json:"alignedWord"`
	Word        string  `json:"word"`
	Start       float64 `json:"start"`
	End         float64 `json:"end"`
	StartOffset int     `json:"startOffset"`
	EndOffset   int     `json:"endOffset"`
	Phones      []any   `json:"phones"`
}

func alignWithGentle(ctx context.Context, request AlignRequest, options AlignerOptions) (NormalizedTiming, error) {
	baseURL := strings.TrimSpace(options.GentleURL)
	if baseURL == "" {
		return NormalizedTiming{}, fmt.Errorf("%w: gentle url is not configured", ErrAlignerUnavailable)
	}
	if request.AudioPath == "" {
		return NormalizedTiming{}, fmt.Errorf("%w: gentle requires audio", ErrAlignerUnavailable)
	}
	endpoint, err := gentleTranscriptionURL(baseURL)
	if err != nil {
		return NormalizedTiming{}, err
	}

	audioFile, err := os.Open(request.AudioPath)
	if err != nil {
		return NormalizedTiming{}, err
	}
	defer audioFile.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	audioPart, err := writer.CreateFormFile("audio", filepath.Base(request.AudioPath))
	if err != nil {
		return NormalizedTiming{}, err
	}
	if _, err := io.Copy(audioPart, audioFile); err != nil {
		return NormalizedTiming{}, err
	}
	if err := writer.WriteField("transcript", joinSegments(request.Segments)); err != nil {
		return NormalizedTiming{}, err
	}
	if err := writer.Close(); err != nil {
		return NormalizedTiming{}, err
	}

	commandCtx, cancel := context.WithTimeout(ctx, options.Timeout)
	defer cancel()
	httpRequest, err := http.NewRequestWithContext(commandCtx, http.MethodPost, endpoint, &body)
	if err != nil {
		return NormalizedTiming{}, err
	}
	httpRequest.Header.Set("Content-Type", writer.FormDataContentType())

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		return NormalizedTiming{}, fmt.Errorf("gentle request failed: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		return NormalizedTiming{}, fmt.Errorf("gentle returned %s: %s", response.Status, strings.TrimSpace(string(data)))
	}

	var payload gentleResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return NormalizedTiming{}, err
	}
	tokens := make([]TokenTiming, 0, len(payload.Words))
	for _, word := range payload.Words {
		if !strings.EqualFold(word.Case, "success") || word.End <= word.Start {
			continue
		}
		text := strings.TrimSpace(firstNonEmpty(word.Aligned, word.Word))
		if text == "" {
			continue
		}
		tokens = append(tokens, TokenTiming{
			Index:        len(tokens),
			SegmentIndex: segmentIndexForToken(TokenTiming{Text: text}, request.Segments),
			Text:         text,
			StartMS:      int(word.Start * 1000),
			EndMS:        int(word.End * 1000),
			Confidence:   defaultConfidence(0, TimingSourceGentle),
			Source:       TimingSourceGentle,
		})
	}
	if len(tokens) == 0 {
		return NormalizedTiming{}, fmt.Errorf("%w: gentle produced no successful word timings", ErrAlignerUnavailable)
	}
	raw := RawTiming{Source: TimingSourceGentle, DurationMS: request.DurationMS, Tokens: tokens}
	return NormalizeTiming(NormalizeRequest{
		JobID:      request.JobID,
		DurationMS: request.DurationMS,
		Segments:   request.Segments,
		Raw:        &raw,
	})
}

func gentleTranscriptionURL(base string) (string, error) {
	parsed, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("%w: gentle url must include scheme and host", ErrAlignerUnavailable)
	}
	path := strings.TrimRight(parsed.Path, "/")
	if !strings.HasSuffix(path, "/transcriptions") {
		path += "/transcriptions"
	}
	parsed.Path = path
	query := parsed.Query()
	if query.Get("async") == "" {
		query.Set("async", "false")
	}
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
