package pipeline

import (
	"os"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/highlightmap"
)

func mergePromotionCrosswalk(target *PromotionCrosswalk, source PromotionCrosswalk) {
	if target == nil {
		return
	}
	target.SourceIDMappings = append(target.SourceIDMappings, source.SourceIDMappings...)
	target.RevisionIDMappings = append(target.RevisionIDMappings, source.RevisionIDMappings...)
	target.ExtractionRevisionIDMappings = append(target.ExtractionRevisionIDMappings, source.ExtractionRevisionIDMappings...)
	target.ReadingUnitManifestIDMappings = append(target.ReadingUnitManifestIDMappings, source.ReadingUnitManifestIDMappings...)
	target.ReadalongManifestIDMappings = append(target.ReadalongManifestIDMappings, source.ReadalongManifestIDMappings...)
	target.AudioArtifactIDMappings = append(target.AudioArtifactIDMappings, source.AudioArtifactIDMappings...)
	target.HighlightMapIDMappings = append(target.HighlightMapIDMappings, source.HighlightMapIDMappings...)
	target.ProgressIDMappings = append(target.ProgressIDMappings, source.ProgressIDMappings...)
	target.BookmarkIDMappings = append(target.BookmarkIDMappings, source.BookmarkIDMappings...)
	target.UnitIDMappings = append(target.UnitIDMappings, source.UnitIDMappings...)
	target.SegmentIDMappings = append(target.SegmentIDMappings, source.SegmentIDMappings...)
}

func idMappingsForSlices(from []string, to []string) []PromotionCrosswalkIDMapping {
	limit := len(from)
	if len(to) < limit {
		limit = len(to)
	}
	mappings := make([]PromotionCrosswalkIDMapping, 0, limit)
	for index := 0; index < limit; index++ {
		if strings.TrimSpace(from[index]) == "" || strings.TrimSpace(to[index]) == "" || from[index] == to[index] {
			continue
		}
		mappings = append(mappings, PromotionCrosswalkIDMapping{FromID: from[index], ToID: to[index]})
	}
	return mappings
}

func remapManifestMetadata(metadata map[string]any, idMap map[string]string) map[string]any {
	remapped := remapAnyStringMap(metadata, idMap)
	if remapped == nil {
		remapped = map[string]any{}
	}
	return remapped
}

func remapAnyStringMap(input map[string]any, idMap map[string]string) map[string]any {
	if input == nil {
		return nil
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = remapAnyValue(value, idMap)
	}
	return output
}

func remapAnyValue(value any, idMap map[string]string) any {
	switch typed := value.(type) {
	case string:
		return remapStringID(typed, idMap)
	case map[string]any:
		return remapAnyStringMap(typed, idMap)
	case []any:
		output := make([]any, len(typed))
		for index := range typed {
			output[index] = remapAnyValue(typed[index], idMap)
		}
		return output
	default:
		return value
	}
}

func remapStringSlice(values []string, idMap map[string]string) []string {
	if values == nil {
		return nil
	}
	output := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			output = append(output, remapStringID(trimmed, idMap))
		}
	}
	return output
}

func remapStringID(value string, idMap map[string]string) string {
	if mapped := idMap[value]; mapped != "" {
		return mapped
	}
	remapped := value
	for from, to := range idMap {
		if from == "" || to == "" || from == to {
			continue
		}
		remapped = strings.ReplaceAll(remapped, from, to)
	}
	return remapped
}

func remapPipelineReadingPosition(position *ReadingPosition, temporarySourceID string, promotedSourceID string) *ReadingPosition {
	if position == nil {
		return nil
	}
	remapped := *position
	if remapped.TemporarySourceID == temporarySourceID {
		remapped.TemporarySourceID = ""
	}
	if remapped.BookSourceID == "" || remapped.BookSourceID == temporarySourceID {
		remapped.BookSourceID = promotedSourceID
	}
	remap := temporaryToPreparedScopeIDMap(temporarySourceID, promotedSourceID)
	remapped.ScopeKey = remapStringID(remapped.ScopeKey, remap)
	if remapped.LocatorEnvelope != nil {
		envelope := remapLocatorEnvelopeWithMap(*remapped.LocatorEnvelope, temporarySourceID, promotedSourceID, remap)
		remapped.LocatorEnvelope = &envelope
	}
	return &remapped
}

func remapHighlightReadingPosition(position highlightmap.ReadingPosition, temporarySourceID string, promotedSourceID string) highlightmap.ReadingPosition {
	if position.BookSourceID == "" || position.BookSourceID == temporarySourceID {
		position.BookSourceID = promotedSourceID
	}
	remap := temporaryToPreparedScopeIDMap(temporarySourceID, promotedSourceID)
	position.ScopeKey = remapStringID(position.ScopeKey, remap)
	if position.LocatorEnvelope != nil {
		envelope := remapLocatorEnvelopeWithMap(*position.LocatorEnvelope, temporarySourceID, promotedSourceID, remap)
		position.LocatorEnvelope = &envelope
	}
	return position
}

func remapLocatorEnvelope(envelope contentir.LocatorEnvelope, temporarySourceID string, promotedSourceID string) contentir.LocatorEnvelope {
	return remapLocatorEnvelopeWithMap(envelope, temporarySourceID, promotedSourceID, temporaryToPreparedScopeIDMap(temporarySourceID, promotedSourceID))
}

func remapLocatorEnvelopeWithMap(envelope contentir.LocatorEnvelope, temporarySourceID string, promotedSourceID string, idMap map[string]string) contentir.LocatorEnvelope {
	if envelope.SourceID == "" || envelope.SourceID == temporarySourceID {
		envelope.SourceID = promotedSourceID
	}
	envelope.ScopeKey = remapStringID(envelope.ScopeKey, idMap)
	return envelope
}

func temporaryToPreparedScopeIDMap(temporarySourceID string, promotedSourceID string) map[string]string {
	return map[string]string{
		progressTargetForTemporarySource(temporarySourceID): progressTargetForPreparedSource(promotedSourceID),
		temporarySourceID: promotedSourceID,
	}
}

func rewritePromotedTimingArtifacts(jobDir string, temporaryJobID string, promotedJobID string, temporarySourceID string, promotedSourceID string) error {
	idMap := map[string]string{
		temporaryJobID:    promotedJobID,
		temporarySourceID: promotedSourceID,
	}
	fragments, fragmentsErr := highlightmap.ReadFragmentTiming(jobDir)
	tokens, tokensErr := highlightmap.ReadTokenTiming(jobDir)
	highlight, highlightErr := highlightmap.ReadHighlightMap(jobDir)
	if highlightErr == nil {
		highlight.JobID = promotedJobID
		highlight.BookSourceID = promotedSourceID
		highlight.ScopeKey = remapStringID(highlight.ScopeKey, idMap)
		for index := range highlight.Fragments {
			highlight.Fragments[index].ReadingPosition = remapHighlightReadingPosition(highlight.Fragments[index].ReadingPosition, temporarySourceID, promotedSourceID)
		}
		for index := range highlight.Tokens {
			highlight.Tokens[index].ReadingPosition = remapHighlightReadingPosition(highlight.Tokens[index].ReadingPosition, temporarySourceID, promotedSourceID)
		}
		if fragmentsErr == nil {
			fragments.JobID = promotedJobID
		}
		if tokensErr == nil {
			tokens.JobID = promotedJobID
		}
		if fragmentsErr == nil && tokensErr == nil {
			if err := highlightmap.PersistArtifacts(jobDir, highlight, fragments, tokens); err != nil {
				return err
			}
		}
	} else if !os.IsNotExist(highlightErr) {
		// Missing legacy highlight maps are allowed for partial artifacts; read errors from
		// corrupt files should still fail promotion rather than preserving stale IDs.
		return highlightErr
	}
	v2, v2Err := highlightmap.ReadHighlightMapV2(jobDir)
	if v2Err == nil {
		v2.SourceID = promotedSourceID
		v2.ScopeKey = remapStringID(v2.ScopeKey, idMap)
		v2.GeneratedAudioID = promotedJobID
		v2.SpeechPlanID = remapStringID(v2.SpeechPlanID, idMap)
		v2.Metadata = remapAnyStringMap(v2.Metadata, idMap)
		for index := range v2.Entries {
			entry := &v2.Entries[index]
			entry.SourceID = promotedSourceID
			entry.ScopeKey = remapStringID(entry.ScopeKey, idMap)
			entry.GeneratedAudioID = promotedJobID
			entry.SpeechPlanID = remapStringID(entry.SpeechPlanID, idMap)
			entry.SourceWordID = remapStringID(entry.SourceWordID, idMap)
			entry.NodeID = remapStringID(entry.NodeID, idMap)
			entry.ReadingPosition = remapHighlightReadingPosition(entry.ReadingPosition, temporarySourceID, promotedSourceID)
		}
		if err := highlightmap.PersistHighlightMapV2(jobDir, v2); err != nil {
			return err
		}
	} else if !os.IsNotExist(v2Err) {
		return v2Err
	}
	return nil
}
