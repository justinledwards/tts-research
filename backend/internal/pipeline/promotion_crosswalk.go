package pipeline

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	promotionCrosswalkSchemaVersion = "promotion-crosswalk.v1"
	promotionCrosswalkDirName       = "promotion-crosswalks"
)

type PromotionCrosswalkIDMapping struct {
	FromID     string  `json:"from"`
	ToID       string  `json:"to"`
	Confidence float64 `json:"confidence,omitempty"`
}

type PromotionCrosswalkIdentityMappings struct {
	SourceRevisionIDs      []PromotionCrosswalkIDMapping `json:"sourceRevisionIds"`
	ExtractionRevisionIDs  []PromotionCrosswalkIDMapping `json:"extractionRevisionIds,omitempty"`
	ReadingUnitManifestIDs []PromotionCrosswalkIDMapping `json:"readingUnitManifestIds,omitempty"`
	ReadalongManifestIDs   []PromotionCrosswalkIDMapping `json:"readalongManifestIds,omitempty"`
	ReadingUnitIDs         []PromotionCrosswalkIDMapping `json:"readingUnitIds"`
	AudioArtifactIDs       []PromotionCrosswalkIDMapping `json:"audioArtifactIds"`
	HighlightMapIDs        []PromotionCrosswalkIDMapping `json:"highlightMapIds,omitempty"`
	ProgressIDs            []PromotionCrosswalkIDMapping `json:"progressIds"`
	RepairOverlayIDs       []PromotionCrosswalkIDMapping `json:"repairOverlayIds,omitempty"`
}

type PromotionCrosswalk struct {
	SchemaVersion    string                             `json:"schemaVersion"`
	CrosswalkID      string                             `json:"crosswalkId"`
	PromotedAt       time.Time                          `json:"promotedAt"`
	FromSourceID     string                             `json:"fromSourceId"`
	ToSourceID       string                             `json:"toSourceId"`
	FromManifestID   string                             `json:"fromManifestId"`
	ToManifestID     string                             `json:"toManifestId"`
	IdentityMappings PromotionCrosswalkIdentityMappings `json:"identityMappings"`
	Metadata         map[string]any                     `json:"metadata,omitempty"`

	TemporarySourceID             string                        `json:"-"`
	TemporarySourceRevisionID     string                        `json:"-"`
	ProjectID                     string                        `json:"-"`
	ProjectSourceID               string                        `json:"-"`
	ProjectSourceRevisionID       string                        `json:"-"`
	CreatedAt                     time.Time                     `json:"-"`
	SourceIDMappings              []PromotionCrosswalkIDMapping `json:"-"`
	RevisionIDMappings            []PromotionCrosswalkIDMapping `json:"-"`
	ExtractionRevisionIDMappings  []PromotionCrosswalkIDMapping `json:"-"`
	ReadingUnitManifestIDMappings []PromotionCrosswalkIDMapping `json:"-"`
	ReadalongManifestIDMappings   []PromotionCrosswalkIDMapping `json:"-"`
	AudioArtifactIDMappings       []PromotionCrosswalkIDMapping `json:"-"`
	HighlightMapIDMappings        []PromotionCrosswalkIDMapping `json:"-"`
	ProgressIDMappings            []PromotionCrosswalkIDMapping `json:"-"`
	BookmarkIDMappings            []PromotionCrosswalkIDMapping `json:"-"`
	UnitIDMappings                []PromotionCrosswalkIDMapping `json:"-"`
	SegmentIDMappings             []PromotionCrosswalkIDMapping `json:"-"`
}

func (service *Service) PersistPromotionCrosswalk(crosswalk PromotionCrosswalk) (PromotionCrosswalk, error) {
	crosswalk = normalizePromotionCrosswalk(crosswalk)
	if err := service.writePromotionCrosswalk(crosswalk); err != nil {
		return PromotionCrosswalk{}, err
	}
	service.mu.Lock()
	service.promotionCrosswalks[crosswalk.CrosswalkID] = clonePromotionCrosswalk(crosswalk)
	service.mu.Unlock()
	publishPromotionCrosswalkEvent(service, crosswalk)
	return clonePromotionCrosswalk(crosswalk), nil
}

func (service *Service) GetPromotionCrosswalk(crosswalkID string) (PromotionCrosswalk, error) {
	cleanID := strings.TrimSpace(crosswalkID)
	if cleanID == "" {
		return PromotionCrosswalk{}, ErrManifestSnapshotNotFound
	}
	service.mu.RLock()
	crosswalk, ok := service.promotionCrosswalks[cleanID]
	service.mu.RUnlock()
	if !ok {
		return PromotionCrosswalk{}, ErrManifestSnapshotNotFound
	}
	return clonePromotionCrosswalk(crosswalk), nil
}

func (service *Service) reloadPromotionCrosswalks() {
	baseDir := service.sourceLifecycleBaseDir()
	sourceEntries, err := os.ReadDir(baseDir)
	if err != nil {
		return
	}
	items := map[string]PromotionCrosswalk{}
	for _, sourceEntry := range sourceEntries {
		if !sourceEntry.IsDir() {
			continue
		}
		dir := filepath.Join(baseDir, sourceEntry.Name(), promotionCrosswalkDirName)
		entries, readErr := os.ReadDir(dir)
		if readErr != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
				continue
			}
			data, readErr := os.ReadFile(filepath.Join(dir, entry.Name()))
			if readErr != nil {
				continue
			}
			var crosswalk PromotionCrosswalk
			if err := jsonUnmarshal(data, &crosswalk); err != nil || strings.TrimSpace(crosswalk.CrosswalkID) == "" {
				continue
			}
			crosswalk = normalizePromotionCrosswalk(crosswalk)
			items[crosswalk.CrosswalkID] = clonePromotionCrosswalk(crosswalk)
		}
	}
	service.mu.Lock()
	service.promotionCrosswalks = items
	service.mu.Unlock()
}

func normalizePromotionCrosswalk(crosswalk PromotionCrosswalk) PromotionCrosswalk {
	crosswalk.SchemaVersion = firstNonEmpty(strings.TrimSpace(crosswalk.SchemaVersion), promotionCrosswalkSchemaVersion)
	crosswalk.CrosswalkID = strings.TrimSpace(crosswalk.CrosswalkID)
	crosswalk.TemporarySourceID = firstNonEmpty(strings.TrimSpace(crosswalk.TemporarySourceID), strings.TrimSpace(crosswalk.FromSourceID))
	crosswalk.ProjectSourceID = firstNonEmpty(strings.TrimSpace(crosswalk.ProjectSourceID), strings.TrimSpace(crosswalk.ToSourceID))
	crosswalk.FromSourceID = firstNonEmpty(strings.TrimSpace(crosswalk.FromSourceID), crosswalk.TemporarySourceID)
	crosswalk.ToSourceID = firstNonEmpty(strings.TrimSpace(crosswalk.ToSourceID), crosswalk.ProjectSourceID)
	crosswalk.TemporarySourceRevisionID = strings.TrimSpace(crosswalk.TemporarySourceRevisionID)
	crosswalk.ProjectID = strings.TrimSpace(crosswalk.ProjectID)
	crosswalk.ProjectSourceRevisionID = strings.TrimSpace(crosswalk.ProjectSourceRevisionID)
	crosswalk.FromManifestID = strings.TrimSpace(crosswalk.FromManifestID)
	crosswalk.ToManifestID = strings.TrimSpace(crosswalk.ToManifestID)
	if crosswalk.CreatedAt.IsZero() {
		crosswalk.CreatedAt = crosswalk.PromotedAt
	}
	if crosswalk.PromotedAt.IsZero() {
		crosswalk.PromotedAt = crosswalk.CreatedAt
	}
	if crosswalk.PromotedAt.IsZero() {
		crosswalk.PromotedAt = time.Now().UTC()
	}
	crosswalk.PromotedAt = crosswalk.PromotedAt.UTC()
	crosswalk.CreatedAt = crosswalk.PromotedAt
	if crosswalk.CrosswalkID == "" {
		crosswalk.CrosswalkID = deterministicManifestID("pcw", crosswalk.FromSourceID, crosswalk.ProjectID, crosswalk.ToSourceID, crosswalk.PromotedAt.Format(time.RFC3339Nano))
	}
	if len(crosswalk.RevisionIDMappings) == 0 {
		crosswalk.RevisionIDMappings = crosswalk.IdentityMappings.SourceRevisionIDs
	}
	if len(crosswalk.ExtractionRevisionIDMappings) == 0 {
		crosswalk.ExtractionRevisionIDMappings = crosswalk.IdentityMappings.ExtractionRevisionIDs
	}
	if len(crosswalk.ReadingUnitManifestIDMappings) == 0 {
		crosswalk.ReadingUnitManifestIDMappings = crosswalk.IdentityMappings.ReadingUnitManifestIDs
	}
	if len(crosswalk.ReadalongManifestIDMappings) == 0 {
		crosswalk.ReadalongManifestIDMappings = crosswalk.IdentityMappings.ReadalongManifestIDs
	}
	if len(crosswalk.UnitIDMappings) == 0 {
		crosswalk.UnitIDMappings = crosswalk.IdentityMappings.ReadingUnitIDs
	}
	if len(crosswalk.AudioArtifactIDMappings) == 0 {
		crosswalk.AudioArtifactIDMappings = crosswalk.IdentityMappings.AudioArtifactIDs
	}
	if len(crosswalk.HighlightMapIDMappings) == 0 {
		crosswalk.HighlightMapIDMappings = crosswalk.IdentityMappings.HighlightMapIDs
	}
	if len(crosswalk.ProgressIDMappings) == 0 {
		crosswalk.ProgressIDMappings = crosswalk.IdentityMappings.ProgressIDs
	}
	crosswalk.SourceIDMappings = normalizePromotionMappings(crosswalk.SourceIDMappings)
	crosswalk.RevisionIDMappings = normalizePromotionMappings(crosswalk.RevisionIDMappings)
	crosswalk.ExtractionRevisionIDMappings = normalizePromotionMappings(crosswalk.ExtractionRevisionIDMappings)
	crosswalk.ReadingUnitManifestIDMappings = normalizePromotionMappings(crosswalk.ReadingUnitManifestIDMappings)
	crosswalk.ReadalongManifestIDMappings = normalizePromotionMappings(crosswalk.ReadalongManifestIDMappings)
	crosswalk.AudioArtifactIDMappings = normalizePromotionMappings(crosswalk.AudioArtifactIDMappings)
	crosswalk.HighlightMapIDMappings = normalizePromotionMappings(crosswalk.HighlightMapIDMappings)
	crosswalk.ProgressIDMappings = normalizePromotionMappings(crosswalk.ProgressIDMappings)
	crosswalk.BookmarkIDMappings = normalizePromotionMappings(crosswalk.BookmarkIDMappings)
	crosswalk.UnitIDMappings = normalizePromotionMappings(crosswalk.UnitIDMappings)
	crosswalk.SegmentIDMappings = normalizePromotionMappings(crosswalk.SegmentIDMappings)
	crosswalk.Metadata = cloneManifestMetadata(crosswalk.Metadata)
	if crosswalk.Metadata == nil {
		crosswalk.Metadata = map[string]any{}
	}
	if len(crosswalk.BookmarkIDMappings) > 0 {
		crosswalk.Metadata["bookmarkIdMappings"] = promotionMappingsMetadata(crosswalk.BookmarkIDMappings)
	}
	if len(crosswalk.SegmentIDMappings) > 0 {
		crosswalk.Metadata["segmentIdMappings"] = promotionMappingsMetadata(crosswalk.SegmentIDMappings)
	}
	crosswalk.IdentityMappings = PromotionCrosswalkIdentityMappings{
		SourceRevisionIDs:      nonNilPromotionMappings(crosswalk.RevisionIDMappings),
		ExtractionRevisionIDs:  crosswalk.ExtractionRevisionIDMappings,
		ReadingUnitManifestIDs: crosswalk.ReadingUnitManifestIDMappings,
		ReadalongManifestIDs:   crosswalk.ReadalongManifestIDMappings,
		ReadingUnitIDs:         nonNilPromotionMappings(crosswalk.UnitIDMappings),
		AudioArtifactIDs:       nonNilPromotionMappings(crosswalk.AudioArtifactIDMappings),
		HighlightMapIDs:        crosswalk.HighlightMapIDMappings,
		ProgressIDs:            nonNilPromotionMappings(crosswalk.ProgressIDMappings),
	}
	crosswalk.FromManifestID = firstNonEmpty(crosswalk.FromManifestID, firstMappingFrom(crosswalk.ReadalongManifestIDMappings), crosswalk.TemporarySourceRevisionID, crosswalk.FromSourceID)
	crosswalk.ToManifestID = firstNonEmpty(crosswalk.ToManifestID, firstMappingTo(crosswalk.ReadalongManifestIDMappings), crosswalk.ProjectSourceRevisionID, crosswalk.ToSourceID)
	return crosswalk
}

func normalizePromotionMappings(mappings []PromotionCrosswalkIDMapping) []PromotionCrosswalkIDMapping {
	if len(mappings) == 0 {
		return nil
	}
	seen := map[PromotionCrosswalkIDMapping]struct{}{}
	output := make([]PromotionCrosswalkIDMapping, 0, len(mappings))
	for _, mapping := range mappings {
		mapping.FromID = strings.TrimSpace(mapping.FromID)
		mapping.ToID = strings.TrimSpace(mapping.ToID)
		if mapping.FromID == "" || mapping.ToID == "" {
			continue
		}
		if mapping.Confidence < 0 || mapping.Confidence > 1 {
			mapping.Confidence = 0
		}
		if _, ok := seen[mapping]; ok {
			continue
		}
		seen[mapping] = struct{}{}
		output = append(output, mapping)
	}
	sort.SliceStable(output, func(left int, right int) bool {
		if output[left].FromID != output[right].FromID {
			return output[left].FromID < output[right].FromID
		}
		return output[left].ToID < output[right].ToID
	})
	return output
}

func nonNilPromotionMappings(mappings []PromotionCrosswalkIDMapping) []PromotionCrosswalkIDMapping {
	if len(mappings) == 0 {
		return []PromotionCrosswalkIDMapping{}
	}
	return mappings
}

func firstMappingFrom(mappings []PromotionCrosswalkIDMapping) string {
	if len(mappings) == 0 {
		return ""
	}
	return mappings[0].FromID
}

func firstMappingTo(mappings []PromotionCrosswalkIDMapping) string {
	if len(mappings) == 0 {
		return ""
	}
	return mappings[0].ToID
}

func promotionMappingsMetadata(mappings []PromotionCrosswalkIDMapping) []map[string]any {
	items := make([]map[string]any, 0, len(mappings))
	for _, mapping := range mappings {
		item := map[string]any{"from": mapping.FromID, "to": mapping.ToID}
		if mapping.Confidence > 0 {
			item["confidence"] = mapping.Confidence
		}
		items = append(items, item)
	}
	return items
}

func (service *Service) writePromotionCrosswalk(crosswalk PromotionCrosswalk) error {
	outputDir := filepath.Join(service.sourceLifecycleBaseDir(), sourceLifecycleDataPathID(crosswalk.ProjectSourceID), promotionCrosswalkDirName)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSONAtomic(filepath.Join(outputDir, sourceLifecycleDataPathID(crosswalk.CrosswalkID)+".json"), crosswalk)
}

func (service *Service) removePromotionCrosswalk(crosswalk PromotionCrosswalk) error {
	cleanID := strings.TrimSpace(crosswalk.CrosswalkID)
	cleanSourceID := strings.TrimSpace(crosswalk.ProjectSourceID)
	if cleanID == "" || cleanSourceID == "" {
		return nil
	}
	service.mu.Lock()
	delete(service.promotionCrosswalks, cleanID)
	service.mu.Unlock()
	return os.Remove(filepath.Join(service.sourceLifecycleBaseDir(), sourceLifecycleDataPathID(cleanSourceID), promotionCrosswalkDirName, sourceLifecycleDataPathID(cleanID)+".json"))
}

func clonePromotionCrosswalk(crosswalk PromotionCrosswalk) PromotionCrosswalk {
	crosswalk.IdentityMappings.SourceRevisionIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.SourceRevisionIDs...)
	crosswalk.IdentityMappings.ExtractionRevisionIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.ExtractionRevisionIDs...)
	crosswalk.IdentityMappings.ReadingUnitManifestIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.ReadingUnitManifestIDs...)
	crosswalk.IdentityMappings.ReadalongManifestIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.ReadalongManifestIDs...)
	crosswalk.IdentityMappings.ReadingUnitIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.ReadingUnitIDs...)
	crosswalk.IdentityMappings.AudioArtifactIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.AudioArtifactIDs...)
	crosswalk.IdentityMappings.HighlightMapIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.HighlightMapIDs...)
	crosswalk.IdentityMappings.ProgressIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.ProgressIDs...)
	crosswalk.IdentityMappings.RepairOverlayIDs = append([]PromotionCrosswalkIDMapping(nil), crosswalk.IdentityMappings.RepairOverlayIDs...)
	crosswalk.SourceIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.SourceIDMappings...)
	crosswalk.RevisionIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.RevisionIDMappings...)
	crosswalk.ExtractionRevisionIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.ExtractionRevisionIDMappings...)
	crosswalk.ReadingUnitManifestIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.ReadingUnitManifestIDMappings...)
	crosswalk.ReadalongManifestIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.ReadalongManifestIDMappings...)
	crosswalk.AudioArtifactIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.AudioArtifactIDMappings...)
	crosswalk.HighlightMapIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.HighlightMapIDMappings...)
	crosswalk.ProgressIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.ProgressIDMappings...)
	crosswalk.BookmarkIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.BookmarkIDMappings...)
	crosswalk.UnitIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.UnitIDMappings...)
	crosswalk.SegmentIDMappings = append([]PromotionCrosswalkIDMapping(nil), crosswalk.SegmentIDMappings...)
	crosswalk.Metadata = cloneManifestMetadata(crosswalk.Metadata)
	return crosswalk
}

func publishPromotionCrosswalkEvent(service *Service, crosswalk PromotionCrosswalk) {
	service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          crosswalk.ProjectSourceID,
		OccurredAt:        crosswalk.CreatedAt,
		EventType:         SourceManifestEventPromotionCrosswalkCreated,
		SnapshotAvailable: true,
		Subject: SourceManifestEventSubject{
			SourceRevisionID:     crosswalk.ProjectSourceRevisionID,
			PromotionCrosswalkID: crosswalk.CrosswalkID,
			State:                "created",
		},
		Metadata: map[string]any{
			"temporarySourceId": crosswalk.TemporarySourceID,
			"projectId":         crosswalk.ProjectID,
		},
	})
}
