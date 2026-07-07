package pipeline

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	readingUnitManifestSchemaVersion = "reading-unit-manifest.v1"
	readalongManifestSchemaVersion   = "readalong-manifest.v1"

	manifestSnapshotDirName = "manifests"
	manifestSnapshotExt     = ".json"
)

var writeJSONAtomicForManifestSnapshots = writeJSONAtomic

type ManifestSnapshotKind string

const (
	ManifestSnapshotKindReadingUnit ManifestSnapshotKind = "reading-unit"
	ManifestSnapshotKindReadalong   ManifestSnapshotKind = "readalong"
)

type ManifestSnapshotState string

const (
	ManifestSnapshotStateCurrent              ManifestSnapshotState = "current"
	ManifestSnapshotStateDegraded             ManifestSnapshotState = "degraded"
	ManifestSnapshotStateSuperseded           ManifestSnapshotState = "superseded"
	ManifestSnapshotStateStale                ManifestSnapshotState = "stale"
	ManifestSnapshotStateFailed               ManifestSnapshotState = "failed"
	ManifestSnapshotStateInterruptedRetriable ManifestSnapshotState = "interrupted_retriable"
)

type ReadingUnitReadiness string

const (
	ReadingUnitReadinessPendingExtraction ReadingUnitReadiness = "pending_extraction"
	ReadingUnitReadinessBlocked           ReadingUnitReadiness = "blocked"
	ReadingUnitReadinessReadable          ReadingUnitReadiness = "readable"
	ReadingUnitReadinessNarratable        ReadingUnitReadiness = "narratable"
	ReadingUnitReadinessAlignable         ReadingUnitReadiness = "alignable"
)

type ReadingUnitManifest struct {
	SchemaVersion          string                     `json:"schemaVersion"`
	ManifestID             string                     `json:"manifestId"`
	SourceID               string                     `json:"sourceId"`
	SourceRevisionID       string                     `json:"sourceRevisionId"`
	ExtractionRevisionID   string                     `json:"extractionRevisionId"`
	ManifestRevision       int                        `json:"manifestRevision"`
	State                  ManifestSnapshotState      `json:"state"`
	GeneratedAt            time.Time                  `json:"generatedAt"`
	SupersededByManifestID string                     `json:"supersededByManifestId,omitempty"`
	Units                  []ReadingUnitManifestUnit  `json:"units"`
	Summary                ReadingUnitManifestSummary `json:"summary"`
	Warnings               []string                   `json:"warnings,omitempty"`
	Metadata               map[string]any             `json:"metadata,omitempty"`
}

type ReadingUnitManifestUnit struct {
	UnitID        string               `json:"unitId"`
	OrderKey      string               `json:"orderKey"`
	NodeID        string               `json:"nodeId,omitempty"`
	Readiness     ReadingUnitReadiness `json:"readiness"`
	ContentIRID   string               `json:"contentIrId,omitempty"`
	Locator       map[string]any       `json:"locator,omitempty"`
	Fingerprint   string               `json:"fingerprint"`
	BlockedReason string               `json:"blockedReason,omitempty"`
	Warnings      []string             `json:"warnings,omitempty"`
	Provenance    map[string]any       `json:"provenance,omitempty"`
}

type ReadingUnitManifestSummary struct {
	UnitCount       int   `json:"unitCount"`
	ReadableCount   int   `json:"readableCount"`
	NarratableCount int   `json:"narratableCount"`
	BlockedCount    int   `json:"blockedCount"`
	PendingCount    int   `json:"pendingCount"`
	Degraded        *bool `json:"degraded,omitempty"`
}

type ReadalongManifest struct {
	SchemaVersion            string                `json:"schemaVersion"`
	ManifestID               string                `json:"manifestId"`
	SourceID                 string                `json:"sourceId"`
	SourceRevisionID         string                `json:"sourceRevisionId"`
	ExtractionRevisionID     string                `json:"extractionRevisionId"`
	ReadingUnitManifestID    string                `json:"readingUnitManifestId"`
	ManifestRevision         int                   `json:"manifestRevision"`
	State                    ManifestSnapshotState `json:"state"`
	GeneratedAt              time.Time             `json:"generatedAt"`
	SupersededByManifestID   string                `json:"supersededByManifestId,omitempty"`
	UnitIDs                  []string              `json:"unitIds"`
	SpeechPlanIDs            []string              `json:"speechPlanIds,omitempty"`
	AudioArtifactIDs         []string              `json:"audioArtifactIds,omitempty"`
	HighlightMapIDs          []string              `json:"highlightMapIds,omitempty"`
	ArtifactCompatibilityIDs []string              `json:"artifactCompatibilityIds,omitempty"`
	SyncFidelityDecisionIDs  []string              `json:"syncFidelityDecisionIds,omitempty"`
	ProgressIDs              []string              `json:"progressIds,omitempty"`
	RepairOverlayIDs         []string              `json:"repairOverlayIds,omitempty"`
	Warnings                 []string              `json:"warnings,omitempty"`
	Metadata                 map[string]any        `json:"metadata,omitempty"`
}

type manifestCurrentKey struct {
	Kind             ManifestSnapshotKind
	SourceID         string
	SourceRevisionID string
}

func (service *Service) PersistReadingUnitManifest(manifest ReadingUnitManifest) (ReadingUnitManifest, error) {
	normalized, err := normalizeReadingUnitManifest(manifest)
	if err != nil {
		return ReadingUnitManifest{}, err
	}
	key := manifestCurrentKey{Kind: ManifestSnapshotKindReadingUnit, SourceID: normalized.SourceID, SourceRevisionID: normalized.SourceRevisionID}

	var previous ReadingUnitManifest
	hasPrevious := false
	service.mu.RLock()
	if normalized.State == ManifestSnapshotStateCurrent {
		if previousID := service.currentManifests[key]; previousID != "" && previousID != normalized.ManifestID {
			if candidate, ok := service.readingUnits[previousID]; ok {
				previous = cloneReadingUnitManifest(candidate)
				hasPrevious = true
			}
		}
	}
	service.mu.RUnlock()

	if hasPrevious {
		updatedPrevious := cloneReadingUnitManifest(previous)
		updatedPrevious.State = ManifestSnapshotStateSuperseded
		updatedPrevious.SupersededByManifestID = normalized.ManifestID
		if err := service.writeReadingUnitManifest(normalized); err != nil {
			return ReadingUnitManifest{}, err
		}
		previousWriteErr := service.writeReadingUnitManifest(updatedPrevious)
		service.mu.Lock()
		if previousWriteErr == nil {
			service.readingUnits[previous.ManifestID] = cloneReadingUnitManifest(updatedPrevious)
		} else {
			service.readingUnits[previous.ManifestID] = cloneReadingUnitManifest(previous)
		}
		service.readingUnits[normalized.ManifestID] = cloneReadingUnitManifest(normalized)
		service.rebuildManifestIndexesLocked()
		service.mu.Unlock()
		if previousWriteErr != nil {
			return cloneReadingUnitManifest(normalized), previousWriteErr
		}
		return cloneReadingUnitManifest(normalized), nil
	}

	if err := service.writeReadingUnitManifest(normalized); err != nil {
		return ReadingUnitManifest{}, err
	}
	service.mu.Lock()
	service.readingUnits[normalized.ManifestID] = cloneReadingUnitManifest(normalized)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
	return cloneReadingUnitManifest(normalized), nil
}

func (service *Service) PersistReadalongManifest(manifest ReadalongManifest) (ReadalongManifest, error) {
	normalized, err := normalizeReadalongManifest(manifest)
	if err != nil {
		return ReadalongManifest{}, err
	}
	key := manifestCurrentKey{Kind: ManifestSnapshotKindReadalong, SourceID: normalized.SourceID, SourceRevisionID: normalized.SourceRevisionID}

	var previous ReadalongManifest
	hasPrevious := false
	service.mu.RLock()
	if normalized.State == ManifestSnapshotStateCurrent {
		if previousID := service.currentManifests[key]; previousID != "" && previousID != normalized.ManifestID {
			if candidate, ok := service.readalongs[previousID]; ok {
				previous = cloneReadalongManifest(candidate)
				hasPrevious = true
			}
		}
	}
	service.mu.RUnlock()

	if hasPrevious {
		updatedPrevious := cloneReadalongManifest(previous)
		updatedPrevious.State = ManifestSnapshotStateSuperseded
		updatedPrevious.SupersededByManifestID = normalized.ManifestID
		if err := service.writeReadalongManifest(normalized); err != nil {
			return ReadalongManifest{}, err
		}
		previousWriteErr := service.writeReadalongManifest(updatedPrevious)
		service.mu.Lock()
		if previousWriteErr == nil {
			service.readalongs[previous.ManifestID] = cloneReadalongManifest(updatedPrevious)
		} else {
			service.readalongs[previous.ManifestID] = cloneReadalongManifest(previous)
		}
		service.readalongs[normalized.ManifestID] = cloneReadalongManifest(normalized)
		service.rebuildManifestIndexesLocked()
		service.mu.Unlock()
		if previousWriteErr != nil {
			return cloneReadalongManifest(normalized), previousWriteErr
		}
		return cloneReadalongManifest(normalized), nil
	}

	if err := service.writeReadalongManifest(normalized); err != nil {
		return ReadalongManifest{}, err
	}
	service.mu.Lock()
	service.readalongs[normalized.ManifestID] = cloneReadalongManifest(normalized)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
	return cloneReadalongManifest(normalized), nil
}

func (service *Service) GetReadingUnitManifest(manifestID string) (ReadingUnitManifest, error) {
	cleanID := strings.TrimSpace(manifestID)
	if cleanID == "" {
		return ReadingUnitManifest{}, ErrManifestSnapshotNotFound
	}
	service.mu.RLock()
	manifest, ok := service.readingUnits[cleanID]
	service.mu.RUnlock()
	if !ok {
		return ReadingUnitManifest{}, ErrManifestSnapshotNotFound
	}
	return cloneReadingUnitManifest(manifest), nil
}

func (service *Service) GetReadalongManifest(manifestID string) (ReadalongManifest, error) {
	cleanID := strings.TrimSpace(manifestID)
	if cleanID == "" {
		return ReadalongManifest{}, ErrManifestSnapshotNotFound
	}
	service.mu.RLock()
	manifest, ok := service.readalongs[cleanID]
	service.mu.RUnlock()
	if !ok {
		return ReadalongManifest{}, ErrManifestSnapshotNotFound
	}
	return cloneReadalongManifest(manifest), nil
}

func (service *Service) GetCurrentReadingUnitManifest(sourceID string, sourceRevisionID string) (ReadingUnitManifest, error) {
	key, err := currentManifestKey(ManifestSnapshotKindReadingUnit, sourceID, sourceRevisionID)
	if err != nil {
		return ReadingUnitManifest{}, err
	}
	service.mu.RLock()
	manifestID := service.currentManifests[key]
	manifest, ok := service.readingUnits[manifestID]
	service.mu.RUnlock()
	if manifestID == "" || !ok {
		return ReadingUnitManifest{}, ErrManifestSnapshotNotFound
	}
	return cloneReadingUnitManifest(manifest), nil
}

func (service *Service) GetCurrentReadalongManifest(sourceID string, sourceRevisionID string) (ReadalongManifest, error) {
	key, err := currentManifestKey(ManifestSnapshotKindReadalong, sourceID, sourceRevisionID)
	if err != nil {
		return ReadalongManifest{}, err
	}
	service.mu.RLock()
	manifestID := service.currentManifests[key]
	manifest, ok := service.readalongs[manifestID]
	service.mu.RUnlock()
	if manifestID == "" || !ok {
		return ReadalongManifest{}, ErrManifestSnapshotNotFound
	}
	return cloneReadalongManifest(manifest), nil
}

func (service *Service) ListReadalongManifestsByReadingUnitManifestID(readingUnitManifestID string) ([]ReadalongManifest, error) {
	cleanID := strings.TrimSpace(readingUnitManifestID)
	if cleanID == "" {
		return nil, ErrManifestSnapshotNotFound
	}
	service.mu.RLock()
	idsByManifest := service.readalongsByReadingUnitManifest[cleanID]
	manifests := make([]ReadalongManifest, 0, len(idsByManifest))
	for manifestID := range idsByManifest {
		if manifest, ok := service.readalongs[manifestID]; ok {
			manifests = append(manifests, cloneReadalongManifest(manifest))
		}
	}
	service.mu.RUnlock()
	if len(manifests) == 0 {
		return nil, ErrManifestSnapshotNotFound
	}
	sort.Slice(manifests, func(left int, right int) bool {
		if manifests[left].ManifestRevision != manifests[right].ManifestRevision {
			return manifests[left].ManifestRevision < manifests[right].ManifestRevision
		}
		return manifests[left].ManifestID < manifests[right].ManifestID
	})
	return manifests, nil
}

func (service *Service) reloadManifestSnapshots() {
	baseDir := service.sourceLifecycleBaseDir()
	sourceEntries, err := os.ReadDir(baseDir)
	if err != nil {
		return
	}
	readingUnits := map[string]ReadingUnitManifest{}
	readalongs := map[string]ReadalongManifest{}
	for _, sourceEntry := range sourceEntries {
		if !sourceEntry.IsDir() {
			continue
		}
		revisionRoot := filepath.Join(baseDir, sourceEntry.Name(), "revisions")
		revisionEntries, readRevisionErr := os.ReadDir(revisionRoot)
		if readRevisionErr != nil {
			continue
		}
		for _, revisionEntry := range revisionEntries {
			if !revisionEntry.IsDir() {
				continue
			}
			revisionDir := filepath.Join(revisionRoot, revisionEntry.Name())
			service.loadReadingUnitManifestsFromDir(filepath.Join(revisionDir, manifestSnapshotDirName, string(ManifestSnapshotKindReadingUnit)), readingUnits)
			service.loadReadalongManifestsFromDir(filepath.Join(revisionDir, manifestSnapshotDirName, string(ManifestSnapshotKindReadalong)), readalongs)
		}
	}
	service.mu.Lock()
	service.readingUnits = readingUnits
	service.readalongs = readalongs
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
}

func (service *Service) loadReadingUnitManifestsFromDir(dir string, manifests map[string]ReadingUnitManifest) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != manifestSnapshotExt {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(dir, entry.Name()))
		if readErr != nil {
			continue
		}
		var manifest ReadingUnitManifest
		if err := jsonUnmarshal(data, &manifest); err != nil {
			continue
		}
		normalized, err := normalizeReadingUnitManifest(manifest)
		if err != nil {
			continue
		}
		manifests[normalized.ManifestID] = cloneReadingUnitManifest(normalized)
	}
}

func (service *Service) loadReadalongManifestsFromDir(dir string, manifests map[string]ReadalongManifest) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != manifestSnapshotExt {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(dir, entry.Name()))
		if readErr != nil {
			continue
		}
		var manifest ReadalongManifest
		if err := jsonUnmarshal(data, &manifest); err != nil {
			continue
		}
		normalized, err := normalizeReadalongManifest(manifest)
		if err != nil {
			continue
		}
		manifests[normalized.ManifestID] = cloneReadalongManifest(normalized)
	}
}

func (service *Service) writeReadingUnitManifest(manifest ReadingUnitManifest) error {
	path := service.readingUnitManifestPath(manifest)
	return writeJSONAtomicForManifestSnapshots(path, manifest)
}

func (service *Service) writeReadalongManifest(manifest ReadalongManifest) error {
	path := service.readalongManifestPath(manifest)
	return writeJSONAtomicForManifestSnapshots(path, manifest)
}

func (service *Service) readingUnitManifestPath(manifest ReadingUnitManifest) string {
	return filepath.Join(
		service.manifestSnapshotRevisionDir(manifest.SourceID, manifest.SourceRevisionID),
		string(ManifestSnapshotKindReadingUnit),
		sourceLifecycleDataPathID(manifest.ManifestID)+manifestSnapshotExt,
	)
}

func (service *Service) readalongManifestPath(manifest ReadalongManifest) string {
	return filepath.Join(
		service.manifestSnapshotRevisionDir(manifest.SourceID, manifest.SourceRevisionID),
		string(ManifestSnapshotKindReadalong),
		sourceLifecycleDataPathID(manifest.ManifestID)+manifestSnapshotExt,
	)
}

func (service *Service) manifestSnapshotRevisionDir(sourceID string, sourceRevisionID string) string {
	return filepath.Join(
		service.sourceLifecycleBaseDir(),
		sourceLifecycleDataPathID(sourceID),
		"revisions",
		sourceLifecycleDataPathID(sourceRevisionID),
		manifestSnapshotDirName,
	)
}

func currentManifestKey(kind ManifestSnapshotKind, sourceID string, sourceRevisionID string) (manifestCurrentKey, error) {
	cleanSourceID := strings.TrimSpace(sourceID)
	cleanSourceRevisionID := strings.TrimSpace(sourceRevisionID)
	if kind == "" || cleanSourceID == "" || cleanSourceRevisionID == "" {
		return manifestCurrentKey{}, ErrManifestSnapshotNotFound
	}
	return manifestCurrentKey{Kind: kind, SourceID: cleanSourceID, SourceRevisionID: cleanSourceRevisionID}, nil
}

func normalizeReadingUnitManifest(manifest ReadingUnitManifest) (ReadingUnitManifest, error) {
	manifest.SchemaVersion = firstNonEmpty(strings.TrimSpace(manifest.SchemaVersion), readingUnitManifestSchemaVersion)
	manifest.ManifestID = strings.TrimSpace(manifest.ManifestID)
	manifest.SourceID = strings.TrimSpace(manifest.SourceID)
	manifest.SourceRevisionID = strings.TrimSpace(manifest.SourceRevisionID)
	manifest.ExtractionRevisionID = strings.TrimSpace(manifest.ExtractionRevisionID)
	manifest.SupersededByManifestID = strings.TrimSpace(manifest.SupersededByManifestID)
	if manifest.SchemaVersion != readingUnitManifestSchemaVersion || manifest.SourceID == "" || manifest.SourceRevisionID == "" || manifest.ExtractionRevisionID == "" {
		return ReadingUnitManifest{}, fmt.Errorf("%w: reading-unit manifest requires schemaVersion, sourceId, sourceRevisionId, and extractionRevisionId", ErrManifestSnapshotInvalid)
	}
	if manifest.ManifestRevision <= 0 {
		manifest.ManifestRevision = 1
	}
	if manifest.ManifestID == "" {
		manifest.ManifestID = deterministicManifestID("rum", manifest.SourceID, manifest.SourceRevisionID, manifest.ExtractionRevisionID, fmt.Sprint(manifest.ManifestRevision))
	}
	if manifest.State == "" {
		manifest.State = ManifestSnapshotStateCurrent
	}
	if !validManifestSnapshotState(manifest.State) {
		return ReadingUnitManifest{}, fmt.Errorf("%w: unsupported reading-unit manifest state %q", ErrManifestSnapshotInvalid, manifest.State)
	}
	if manifest.GeneratedAt.IsZero() {
		manifest.GeneratedAt = time.Now().UTC()
	} else {
		manifest.GeneratedAt = manifest.GeneratedAt.UTC()
	}
	if len(manifest.Units) == 0 {
		return ReadingUnitManifest{}, fmt.Errorf("%w: reading-unit manifest requires at least one unit", ErrManifestSnapshotInvalid)
	}
	for index := range manifest.Units {
		unit := &manifest.Units[index]
		unit.UnitID = strings.TrimSpace(unit.UnitID)
		unit.OrderKey = strings.TrimSpace(unit.OrderKey)
		unit.NodeID = strings.TrimSpace(unit.NodeID)
		unit.ContentIRID = strings.TrimSpace(unit.ContentIRID)
		unit.Fingerprint = strings.TrimSpace(unit.Fingerprint)
		unit.BlockedReason = strings.TrimSpace(unit.BlockedReason)
		if unit.UnitID == "" || unit.OrderKey == "" || unit.Fingerprint == "" || !validReadingUnitReadiness(unit.Readiness) {
			return ReadingUnitManifest{}, fmt.Errorf("%w: reading-unit manifest unit requires unitId, orderKey, readiness, and fingerprint", ErrManifestSnapshotInvalid)
		}
	}
	return cloneReadingUnitManifest(manifest), nil
}

func normalizeReadalongManifest(manifest ReadalongManifest) (ReadalongManifest, error) {
	manifest.SchemaVersion = firstNonEmpty(strings.TrimSpace(manifest.SchemaVersion), readalongManifestSchemaVersion)
	manifest.ManifestID = strings.TrimSpace(manifest.ManifestID)
	manifest.SourceID = strings.TrimSpace(manifest.SourceID)
	manifest.SourceRevisionID = strings.TrimSpace(manifest.SourceRevisionID)
	manifest.ExtractionRevisionID = strings.TrimSpace(manifest.ExtractionRevisionID)
	manifest.ReadingUnitManifestID = strings.TrimSpace(manifest.ReadingUnitManifestID)
	manifest.SupersededByManifestID = strings.TrimSpace(manifest.SupersededByManifestID)
	if manifest.SchemaVersion != readalongManifestSchemaVersion || manifest.SourceID == "" || manifest.SourceRevisionID == "" || manifest.ExtractionRevisionID == "" || manifest.ReadingUnitManifestID == "" {
		return ReadalongManifest{}, fmt.Errorf("%w: readalong manifest requires schemaVersion, sourceId, sourceRevisionId, extractionRevisionId, and readingUnitManifestId", ErrManifestSnapshotInvalid)
	}
	if manifest.ManifestRevision <= 0 {
		manifest.ManifestRevision = 1
	}
	if manifest.ManifestID == "" {
		manifest.ManifestID = deterministicManifestID("ram", manifest.SourceID, manifest.SourceRevisionID, manifest.ExtractionRevisionID, manifest.ReadingUnitManifestID, fmt.Sprint(manifest.ManifestRevision))
	}
	if manifest.State == "" {
		manifest.State = ManifestSnapshotStateCurrent
	}
	if !validManifestSnapshotState(manifest.State) {
		return ReadalongManifest{}, fmt.Errorf("%w: unsupported readalong manifest state %q", ErrManifestSnapshotInvalid, manifest.State)
	}
	if manifest.GeneratedAt.IsZero() {
		manifest.GeneratedAt = time.Now().UTC()
	} else {
		manifest.GeneratedAt = manifest.GeneratedAt.UTC()
	}
	manifest.UnitIDs = trimStringSlice(manifest.UnitIDs)
	if manifest.UnitIDs == nil {
		manifest.UnitIDs = []string{}
	}
	manifest.SpeechPlanIDs = trimStringSlice(manifest.SpeechPlanIDs)
	manifest.AudioArtifactIDs = trimStringSlice(manifest.AudioArtifactIDs)
	manifest.HighlightMapIDs = trimStringSlice(manifest.HighlightMapIDs)
	manifest.ArtifactCompatibilityIDs = trimStringSlice(manifest.ArtifactCompatibilityIDs)
	manifest.SyncFidelityDecisionIDs = trimStringSlice(manifest.SyncFidelityDecisionIDs)
	manifest.ProgressIDs = trimStringSlice(manifest.ProgressIDs)
	manifest.RepairOverlayIDs = trimStringSlice(manifest.RepairOverlayIDs)
	return cloneReadalongManifest(manifest), nil
}

func validManifestSnapshotState(state ManifestSnapshotState) bool {
	switch state {
	case ManifestSnapshotStateCurrent, ManifestSnapshotStateDegraded, ManifestSnapshotStateSuperseded, ManifestSnapshotStateStale, ManifestSnapshotStateFailed, ManifestSnapshotStateInterruptedRetriable:
		return true
	default:
		return false
	}
}

func validReadingUnitReadiness(readiness ReadingUnitReadiness) bool {
	switch readiness {
	case ReadingUnitReadinessPendingExtraction, ReadingUnitReadinessBlocked, ReadingUnitReadinessReadable, ReadingUnitReadinessNarratable, ReadingUnitReadinessAlignable:
		return true
	default:
		return false
	}
}

func deterministicManifestID(prefix string, parts ...string) string {
	checksum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return prefix + "-" + hex.EncodeToString(checksum[:])[:16]
}

func trimStringSlice(values []string) []string {
	if values == nil {
		return nil
	}
	output := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			output = append(output, trimmed)
		}
	}
	return output
}

func (service *Service) rebuildManifestIndexesLocked() {
	service.currentManifests = map[manifestCurrentKey]string{}
	service.readalongsByReadingUnitManifest = map[string]map[string]struct{}{}
	for _, manifest := range service.readingUnits {
		if manifest.State == ManifestSnapshotStateCurrent {
			service.setCurrentManifestIfNewerLocked(ManifestSnapshotKindReadingUnit, manifest.SourceID, manifest.SourceRevisionID, manifest.ManifestID, manifest.ManifestRevision, manifest.GeneratedAt)
		}
	}
	for _, manifest := range service.readalongs {
		if manifest.State == ManifestSnapshotStateCurrent {
			service.setCurrentManifestIfNewerLocked(ManifestSnapshotKindReadalong, manifest.SourceID, manifest.SourceRevisionID, manifest.ManifestID, manifest.ManifestRevision, manifest.GeneratedAt)
		}
		readingUnitManifestID := strings.TrimSpace(manifest.ReadingUnitManifestID)
		if readingUnitManifestID != "" {
			if service.readalongsByReadingUnitManifest[readingUnitManifestID] == nil {
				service.readalongsByReadingUnitManifest[readingUnitManifestID] = map[string]struct{}{}
			}
			service.readalongsByReadingUnitManifest[readingUnitManifestID][manifest.ManifestID] = struct{}{}
		}
	}
}

func (service *Service) setCurrentManifestIfNewerLocked(kind ManifestSnapshotKind, sourceID string, sourceRevisionID string, manifestID string, revision int, generatedAt time.Time) {
	key := manifestCurrentKey{Kind: kind, SourceID: sourceID, SourceRevisionID: sourceRevisionID}
	previousID := service.currentManifests[key]
	if previousID == "" {
		service.currentManifests[key] = manifestID
		return
	}
	previousRevision := 0
	previousGeneratedAt := time.Time{}
	switch kind {
	case ManifestSnapshotKindReadingUnit:
		previous := service.readingUnits[previousID]
		previousRevision = previous.ManifestRevision
		previousGeneratedAt = previous.GeneratedAt
	case ManifestSnapshotKindReadalong:
		previous := service.readalongs[previousID]
		previousRevision = previous.ManifestRevision
		previousGeneratedAt = previous.GeneratedAt
	}
	if revision > previousRevision || (revision == previousRevision && generatedAt.After(previousGeneratedAt)) || (revision == previousRevision && generatedAt.Equal(previousGeneratedAt) && manifestID > previousID) {
		service.currentManifests[key] = manifestID
	}
}

func cloneReadingUnitManifest(manifest ReadingUnitManifest) ReadingUnitManifest {
	manifest.Units = cloneReadingUnitManifestUnits(manifest.Units)
	manifest.Warnings = cloneStringSlice(manifest.Warnings)
	manifest.Metadata = cloneManifestMetadata(manifest.Metadata)
	return manifest
}

func cloneReadingUnitManifestUnits(units []ReadingUnitManifestUnit) []ReadingUnitManifestUnit {
	if units == nil {
		return nil
	}
	output := make([]ReadingUnitManifestUnit, len(units))
	for index, unit := range units {
		output[index] = unit
		output[index].Locator = cloneManifestMetadata(unit.Locator)
		output[index].Warnings = cloneStringSlice(unit.Warnings)
		output[index].Provenance = cloneManifestMetadata(unit.Provenance)
	}
	return output
}

func cloneReadalongManifest(manifest ReadalongManifest) ReadalongManifest {
	manifest.UnitIDs = cloneRequiredStringSlice(manifest.UnitIDs)
	manifest.SpeechPlanIDs = cloneStringSlice(manifest.SpeechPlanIDs)
	manifest.AudioArtifactIDs = cloneStringSlice(manifest.AudioArtifactIDs)
	manifest.HighlightMapIDs = cloneStringSlice(manifest.HighlightMapIDs)
	manifest.ArtifactCompatibilityIDs = cloneStringSlice(manifest.ArtifactCompatibilityIDs)
	manifest.SyncFidelityDecisionIDs = cloneStringSlice(manifest.SyncFidelityDecisionIDs)
	manifest.ProgressIDs = cloneStringSlice(manifest.ProgressIDs)
	manifest.RepairOverlayIDs = cloneStringSlice(manifest.RepairOverlayIDs)
	manifest.Warnings = cloneStringSlice(manifest.Warnings)
	manifest.Metadata = cloneManifestMetadata(manifest.Metadata)
	return manifest
}

func cloneRequiredStringSlice(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	return append([]string(nil), values...)
}

func cloneManifestMetadata(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = cloneManifestMetadataValue(value)
	}
	return output
}

func cloneManifestMetadataValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		if typed == nil {
			return map[string]any(nil)
		}
		return cloneManifestMetadata(typed)
	case []any:
		if typed == nil {
			return []any(nil)
		}
		output := make([]any, len(typed))
		for index, item := range typed {
			output[index] = cloneManifestMetadataValue(item)
		}
		return output
	case []string:
		return append([]string(nil), typed...)
	default:
		return value
	}
}
