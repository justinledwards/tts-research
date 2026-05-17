package alignment

import (
	"strings"
	"time"
)

type NativeTimingEvent struct {
	ID           string       `json:"id,omitempty"`
	SegmentIndex int          `json:"segmentIndex,omitempty"`
	Text         string       `json:"text"`
	StartMS      int          `json:"startMs"`
	EndMS        int          `json:"endMs"`
	Confidence   float64      `json:"confidence,omitempty"`
	Source       TimingSource `json:"source,omitempty"`
}

func NormalizeNativeEvents(request NormalizeRequest) (NormalizedTiming, bool) {
	if !NativeEventsTrustworthy(request.NativeEvents, request.DurationMS) {
		return NormalizedTiming{}, false
	}
	generatedAt := request.GeneratedAt
	if generatedAt.IsZero() {
		generatedAt = time.Now().UTC()
	}
	fragments := make([]FragmentTiming, 0)
	tokens := make([]TokenTiming, 0, len(request.NativeEvents))
	for _, event := range request.NativeEvents {
		text := strings.TrimSpace(event.Text)
		if text == "" {
			continue
		}
		source := event.Source
		if source == "" {
			source = TimingSourceNative
		}
		segmentIndex := event.SegmentIndex
		if segmentIndex <= 0 {
			segmentIndex = 1
		}
		token := TokenTiming{
			Index:         len(tokens),
			FragmentIndex: len(fragments),
			SegmentIndex:  segmentIndex,
			Text:          text,
			StartMS:       event.StartMS,
			EndMS:         event.EndMS,
			Confidence:    defaultConfidence(event.Confidence, source),
			Source:        source,
		}
		tokens = append(tokens, token)
		fragments = append(fragments, FragmentTiming{
			Index:        len(fragments),
			SegmentIndex: segmentIndex,
			Text:         text,
			StartMS:      event.StartMS,
			EndMS:        event.EndMS,
			Confidence:   token.Confidence,
			Source:       source,
			TokenStart:   token.Index,
			TokenEnd:     token.Index,
		})
	}
	if len(tokens) == 0 {
		return NormalizedTiming{}, false
	}
	durationMS := firstPositive(request.DurationMS, tokens[len(tokens)-1].EndMS)
	fragments, tokens, drift := CorrectDrift(fragments, tokens, durationMS)
	confidence := summarizeConfidence(fragments, tokens, 0.9, TimingSourceNative)
	return artifacts(request.JobID, TimingSourceNative, statusForTiming(len(request.Segments), fragments), durationMS, generatedAt, confidence, drift, fragments, tokens, nil), true
}

func NativeEventsTrustworthy(events []NativeTimingEvent, durationMS int) bool {
	if len(events) == 0 {
		return false
	}
	lastEnd := -1
	trusted := 0
	for _, event := range events {
		if strings.TrimSpace(event.Text) == "" {
			continue
		}
		if event.StartMS < 0 || event.EndMS <= event.StartMS {
			return false
		}
		if lastEnd > event.StartMS {
			return false
		}
		if durationMS > 0 && event.EndMS > durationMS+500 {
			return false
		}
		if event.Confidence > 0 && event.Confidence < 0.5 {
			return false
		}
		lastEnd = event.EndMS
		trusted++
	}
	return trusted > 0
}

func OffsetNativeEvents(events []NativeTimingEvent, offsetMS int, segmentIndex int) []NativeTimingEvent {
	if len(events) == 0 {
		return nil
	}
	output := make([]NativeTimingEvent, 0, len(events))
	for _, event := range events {
		event.StartMS += offsetMS
		event.EndMS += offsetMS
		if event.SegmentIndex <= 0 {
			event.SegmentIndex = segmentIndex
		}
		if event.Source == "" {
			event.Source = TimingSourceNative
		}
		output = append(output, event)
	}
	return output
}
