package pipeline

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	repairOverlaySchemaVersion = "repair-overlay.v1"
	revisionMapSchemaVersion   = "revision-map.v1"

	repairOverlayDirName = "repairs"
	revisionMapDirName   = "revision-maps"
)

var writeJSONAtomicForRepairOverlays = writeJSONAtomic
var persistSourceLifecycleForRepairOverlay = (*Service).PersistSourceLifecycle

func (service *Service) PersistRepairOverlay(overlay RepairOverlay) (RepairOverlay, error) {
	normalized, err := service.normalizeRepairOverlay(overlay)
	if err != nil {
		return RepairOverlay{}, err
	}
	service.mu.RLock()
	existing, exists := service.repairOverlays[normalized.OverlayID]
	service.mu.RUnlock()
	if exists {
		if repairOverlaysEqual(existing, normalized) {
			return cloneRepairOverlay(existing), nil
		}
		return RepairOverlay{}, fmt.Errorf("%w: overlay %q is immutable and already exists with different payload", ErrRepairOverlayInvalid, normalized.OverlayID)
	}
	if err := service.writeRepairOverlay(normalized); err != nil {
		return RepairOverlay{}, err
	}
	service.mu.Lock()
	service.repairOverlays[normalized.OverlayID] = cloneRepairOverlay(normalized)
	service.mu.Unlock()
	publishRepairOverlayEvent(service, normalized)
	return cloneRepairOverlay(normalized), nil
}

func (service *Service) GetRepairOverlay(overlayID string) (RepairOverlay, error) {
	cleanID := strings.TrimSpace(overlayID)
	if cleanID == "" {
		return RepairOverlay{}, ErrRepairOverlayNotFound
	}
	service.mu.RLock()
	overlay, ok := service.repairOverlays[cleanID]
	service.mu.RUnlock()
	if !ok {
		return RepairOverlay{}, ErrRepairOverlayNotFound
	}
	return cloneRepairOverlay(overlay), nil
}

func (service *Service) PersistRevisionMap(revisionMap RevisionMap) (RevisionMap, error) {
	normalized, err := service.normalizeRevisionMap(revisionMap)
	if err != nil {
		return RevisionMap{}, err
	}
	if _, err := service.sourceRevisionForRepair(normalized.SourceID, normalized.FromSourceRevisionID); err != nil {
		return RevisionMap{}, err
	}
	if _, err := service.sourceRevisionForRepair(normalized.SourceID, normalized.ToSourceRevisionID); err != nil {
		return RevisionMap{}, err
	}
	if err := service.writeRevisionMap(normalized); err != nil {
		return RevisionMap{}, err
	}
	service.mu.Lock()
	service.revisionMaps[normalized.RevisionMapID] = cloneRevisionMap(normalized)
	service.mu.Unlock()
	return cloneRevisionMap(normalized), nil
}

func (service *Service) persistRepairRevisionMapEvidence(revisionMap RevisionMap) (RevisionMap, error) {
	normalized, err := service.normalizeRevisionMap(revisionMap)
	if err != nil {
		return RevisionMap{}, err
	}
	if normalized.Cause != RevisionMapCauseRepairOverlay || strings.TrimSpace(normalized.OverlayID) == "" {
		return RevisionMap{}, fmt.Errorf("%w: repair revision map evidence requires repair overlay cause and overlay ID", ErrRevisionMapInvalid)
	}
	if _, err := service.sourceRevisionForRepair(normalized.SourceID, normalized.FromSourceRevisionID); err != nil {
		return RevisionMap{}, err
	}
	if err := service.writeRevisionMap(normalized); err != nil {
		return RevisionMap{}, err
	}
	service.mu.Lock()
	service.revisionMaps[normalized.RevisionMapID] = cloneRevisionMap(normalized)
	service.mu.Unlock()
	return cloneRevisionMap(normalized), nil
}

func (service *Service) GetRevisionMap(revisionMapID string) (RevisionMap, error) {
	cleanID := strings.TrimSpace(revisionMapID)
	if cleanID == "" {
		return RevisionMap{}, ErrRevisionMapNotFound
	}
	service.mu.RLock()
	revisionMap, ok := service.revisionMaps[cleanID]
	service.mu.RUnlock()
	if !ok {
		return RevisionMap{}, ErrRevisionMapNotFound
	}
	return cloneRevisionMap(revisionMap), nil
}

func (service *Service) ApplyRepairOverlay(request RepairOverlayApplicationRequest) (RepairOverlayApplication, error) {
	overlay, err := service.normalizeRepairOverlay(request.Overlay)
	if err != nil {
		return RepairOverlayApplication{}, err
	}
	fromReadingUnitID := strings.TrimSpace(request.FromReadingUnitManifestID)
	fromReadalongID := strings.TrimSpace(request.FromReadalongManifestID)
	if fromReadingUnitID == "" || fromReadalongID == "" {
		return RepairOverlayApplication{}, fmt.Errorf("%w: from reading-unit and readalong manifest IDs are required", ErrRepairOverlayInvalid)
	}
	fromReadingUnit, err := service.GetReadingUnitManifest(fromReadingUnitID)
	if err != nil {
		return RepairOverlayApplication{}, fmt.Errorf("%w: from reading-unit manifest is required", ErrRepairOverlayInvalid)
	}
	fromReadalong, err := service.GetReadalongManifest(fromReadalongID)
	if err != nil {
		return RepairOverlayApplication{}, fmt.Errorf("%w: from readalong manifest is required", ErrRepairOverlayInvalid)
	}
	if err := validateRepairOverlayFromManifests(overlay, fromReadingUnit, fromReadalong); err != nil {
		return RepairOverlayApplication{}, err
	}

	readingUnit := cloneReadingUnitManifest(request.ReadingUnitManifest)
	readalong := cloneReadalongManifest(request.ReadalongManifest)
	if err := validateRepairOverlayTargetManifests(overlay, readingUnit, readalong); err != nil {
		return RepairOverlayApplication{}, err
	}
	readalong.RepairOverlayIDs = appendUniqueString(readalong.RepairOverlayIDs, overlay.OverlayID)
	readalong.Metadata = ensureManifestMetadata(readalong.Metadata)
	readalong.Metadata["repairOverlayId"] = overlay.OverlayID
	readalong.Metadata["supersedesReadalongManifestId"] = fromReadalong.ManifestID
	readingUnit.Metadata = ensureManifestMetadata(readingUnit.Metadata)
	readingUnit.Metadata["repairOverlayId"] = overlay.OverlayID
	readingUnit.Metadata["supersedesReadingUnitManifestId"] = fromReadingUnit.ManifestID

	revisionMap := cloneRevisionMap(request.RevisionMap)
	if strings.TrimSpace(revisionMap.OverlayID) != "" && strings.TrimSpace(revisionMap.OverlayID) != overlay.OverlayID {
		return RepairOverlayApplication{}, fmt.Errorf("%w: revision map overlay ID must match applied repair overlay", ErrRevisionMapInvalid)
	}
	revisionMap.OverlayID = overlay.OverlayID
	revisionMap.Cause = RevisionMapCauseRepairOverlay
	revisionMap.Metadata = ensureManifestMetadata(revisionMap.Metadata)
	revisionMap.Metadata["fromReadingUnitManifestId"] = fromReadingUnit.ManifestID
	revisionMap.Metadata["fromReadalongManifestId"] = fromReadalong.ManifestID
	revisionMap.Metadata["toReadingUnitManifestId"] = readingUnit.ManifestID
	revisionMap.Metadata["toReadalongManifestId"] = readalong.ManifestID
	normalizedMap, err := service.normalizeRevisionMap(revisionMap)
	if err != nil {
		return RepairOverlayApplication{}, err
	}
	if err := validateRepairRevisionMapManifestBindings(normalizedMap, fromReadingUnit, fromReadalong, readingUnit, readalong); err != nil {
		return RepairOverlayApplication{}, err
	}

	persistedOverlayInput := cloneRepairOverlay(overlay)
	persistedOverlayInput.Metadata = ensureManifestMetadata(persistedOverlayInput.Metadata)
	persistedOverlayInput.Metadata["fromReadingUnitManifestId"] = fromReadingUnit.ManifestID
	persistedOverlayInput.Metadata["fromReadalongManifestId"] = fromReadalong.ManifestID
	persistedOverlayInput.Metadata["toReadingUnitManifestId"] = readingUnit.ManifestID
	persistedOverlayInput.Metadata["toReadalongManifestId"] = readalong.ManifestID
	persistedOverlay, err := service.PersistRepairOverlay(persistedOverlayInput)
	if err != nil {
		return RepairOverlayApplication{}, err
	}
	persistedMap, err := service.persistRepairRevisionMapEvidence(normalizedMap)
	if err != nil {
		return RepairOverlayApplication{}, err
	}

	staleArtifacts, preservedArtifacts := markRepairAffectedAudioArtifactsStale(persistedOverlay, fromReadalong, request.AudioArtifacts)
	staleHighlights, preservedHighlights := markRepairAffectedHighlightArtifactsStale(persistedOverlay, fromReadalong, request.HighlightMapIDs)
	supersededProgress, originalProgress, err := service.supersedeRepairAffectedProgress(persistedOverlay, persistedMap, fromReadalong)
	if err != nil {
		return RepairOverlayApplication{}, err
	}

	pendingReadingUnit := cloneReadingUnitManifest(readingUnit)
	pendingReadingUnit.State = ManifestSnapshotStateDegraded
	pendingReadalong := cloneReadalongManifest(readalong)
	pendingReadalong.State = ManifestSnapshotStateDegraded
	persistedReadingUnit, err := service.PersistReadingUnitManifest(pendingReadingUnit)
	if err != nil {
		service.rollbackRepairProgress(originalProgress)
		return RepairOverlayApplication{}, err
	}
	persistedReadalong, err := service.PersistReadalongManifest(pendingReadalong)
	if err != nil {
		service.rollbackRepairProgress(originalProgress)
		service.removeReadingUnitManifest(persistedReadingUnit)
		return RepairOverlayApplication{}, err
	}

	repairedSource, err := service.repairSourceLifecycleRequest(overlay, request.RepairedSource)
	if err != nil {
		service.rollbackRepairProgress(originalProgress)
		service.removeReadingUnitManifest(persistedReadingUnit)
		service.removeReadalongManifest(persistedReadalong)
		return RepairOverlayApplication{}, err
	}
	_, sourceRevision, err := persistSourceLifecycleForRepairOverlay(service, repairedSource)
	if err != nil {
		service.rollbackRepairProgress(originalProgress)
		service.removeReadingUnitManifest(persistedReadingUnit)
		service.removeReadalongManifest(persistedReadalong)
		return RepairOverlayApplication{}, err
	}
	rollback := func(cause error) (RepairOverlayApplication, error) {
		service.rollbackRepairProgress(originalProgress)
		service.removeReadingUnitManifest(persistedReadingUnit)
		service.removeReadalongManifest(persistedReadalong)
		service.rollbackRepairSourceLifecycle(overlay.SourceID, overlay.SourceRevisionID, overlay.TargetRevisionID)
		return RepairOverlayApplication{}, cause
	}

	currentReadingUnit := cloneReadingUnitManifest(persistedReadingUnit)
	currentReadingUnit.State = ManifestSnapshotStateCurrent
	currentReadalong := cloneReadalongManifest(persistedReadalong)
	currentReadalong.State = ManifestSnapshotStateCurrent
	if err := service.supersedeReadingUnitManifestAcrossRevision(fromReadingUnit.ManifestID, currentReadingUnit.ManifestID); err != nil {
		return rollback(err)
	}
	if err := service.supersedeReadalongManifestAcrossRevision(fromReadalong.ManifestID, currentReadalong.ManifestID); err != nil {
		service.restoreReadingUnitManifest(fromReadingUnit)
		return rollback(err)
	}
	persistedReadingUnit, err = service.promoteRepairReadingUnitManifest(currentReadingUnit)
	if err != nil {
		service.restoreReadingUnitManifest(fromReadingUnit)
		service.restoreReadalongManifest(fromReadalong)
		return rollback(err)
	}
	persistedReadalong, err = service.promoteRepairReadalongManifest(currentReadalong)
	if err != nil {
		service.restoreReadingUnitManifest(fromReadingUnit)
		service.restoreReadalongManifest(fromReadalong)
		service.restoreReadingUnitManifest(pendingReadingUnit)
		return rollback(err)
	}

	return RepairOverlayApplication{
		Overlay:                 persistedOverlay,
		SourceRevision:          sourceRevision,
		ReadingUnitManifest:     persistedReadingUnit,
		ReadalongManifest:       persistedReadalong,
		RevisionMap:             persistedMap,
		StaleAudioArtifacts:     staleArtifacts,
		PreservedAudioArtifacts: preservedArtifacts,
		StaleHighlightArtifacts: staleHighlights,
		PreservedHighlightIDs:   preservedHighlights,
		SupersededProgress:      supersededProgress,
	}, nil
}

func (service *Service) normalizeRepairOverlay(overlay RepairOverlay) (RepairOverlay, error) {
	overlay.SchemaVersion = firstNonEmpty(strings.TrimSpace(overlay.SchemaVersion), repairOverlaySchemaVersion)
	overlay.OverlayID = strings.TrimSpace(overlay.OverlayID)
	overlay.SourceID = strings.TrimSpace(overlay.SourceID)
	overlay.SourceRevisionID = strings.TrimSpace(overlay.SourceRevisionID)
	overlay.TargetRevisionID = strings.TrimSpace(overlay.TargetRevisionID)
	overlay.CreatedBy = strings.TrimSpace(overlay.CreatedBy)
	overlay.Summary = strings.TrimSpace(overlay.Summary)
	overlay.Immutable = true
	if overlay.SchemaVersion != repairOverlaySchemaVersion || overlay.OverlayID == "" || overlay.SourceID == "" || overlay.SourceRevisionID == "" || overlay.TargetRevisionID == "" || overlay.Summary == "" {
		return RepairOverlay{}, fmt.Errorf("%w: overlayId, sourceId, sourceRevisionId, targetRevisionId, and summary are required", ErrRepairOverlayInvalid)
	}
	if overlay.SourceRevisionID == overlay.TargetRevisionID {
		return RepairOverlay{}, fmt.Errorf("%w: target revision must differ from source revision", ErrRepairOverlayInvalid)
	}
	if overlay.CreatedAt.IsZero() {
		overlay.CreatedAt = time.Now().UTC()
	} else {
		overlay.CreatedAt = overlay.CreatedAt.UTC()
	}
	if len(overlay.Changes) == 0 {
		return RepairOverlay{}, fmt.Errorf("%w: at least one repair change is required", ErrRepairOverlayInvalid)
	}
	for index := range overlay.Changes {
		change := &overlay.Changes[index]
		change.ChangeID = strings.TrimSpace(change.ChangeID)
		change.UnitID = strings.TrimSpace(change.UnitID)
		change.Reason = strings.TrimSpace(change.Reason)
		change.BeforeText = strings.TrimSpace(change.BeforeText)
		change.AfterText = strings.TrimSpace(change.AfterText)
		if change.ChangeID == "" || change.UnitID == "" || change.Reason == "" || !validRepairOverlayOperation(change.Operation) {
			return RepairOverlay{}, fmt.Errorf("%w: repair changes require changeId, valid op, unitId, and reason", ErrRepairOverlayInvalid)
		}
	}
	if _, err := service.sourceRevisionForRepair(overlay.SourceID, overlay.SourceRevisionID); err != nil {
		return RepairOverlay{}, err
	}
	return cloneRepairOverlay(overlay), nil
}

func (service *Service) normalizeRevisionMap(revisionMap RevisionMap) (RevisionMap, error) {
	revisionMap.SchemaVersion = firstNonEmpty(strings.TrimSpace(revisionMap.SchemaVersion), revisionMapSchemaVersion)
	revisionMap.RevisionMapID = strings.TrimSpace(revisionMap.RevisionMapID)
	revisionMap.SourceID = strings.TrimSpace(revisionMap.SourceID)
	revisionMap.FromSourceRevisionID = strings.TrimSpace(revisionMap.FromSourceRevisionID)
	revisionMap.ToSourceRevisionID = strings.TrimSpace(revisionMap.ToSourceRevisionID)
	revisionMap.OverlayID = strings.TrimSpace(revisionMap.OverlayID)
	if revisionMap.SchemaVersion != revisionMapSchemaVersion || revisionMap.RevisionMapID == "" || revisionMap.SourceID == "" || revisionMap.FromSourceRevisionID == "" || revisionMap.ToSourceRevisionID == "" {
		return RevisionMap{}, fmt.Errorf("%w: revisionMapId, sourceId, fromSourceRevisionId, and toSourceRevisionId are required", ErrRevisionMapInvalid)
	}
	if revisionMap.FromSourceRevisionID == revisionMap.ToSourceRevisionID {
		return RevisionMap{}, fmt.Errorf("%w: revision map revisions must differ", ErrRevisionMapInvalid)
	}
	if revisionMap.GeneratedAt.IsZero() {
		revisionMap.GeneratedAt = time.Now().UTC()
	} else {
		revisionMap.GeneratedAt = revisionMap.GeneratedAt.UTC()
	}
	if !validRevisionMapCause(revisionMap.Cause) || revisionMap.Confidence < 0 || revisionMap.Confidence > 1 || len(revisionMap.UnitMappings) == 0 {
		return RevisionMap{}, fmt.Errorf("%w: valid cause, confidence, and unit mappings are required", ErrRevisionMapInvalid)
	}
	for index := range revisionMap.UnitMappings {
		mapping := &revisionMap.UnitMappings[index]
		mapping.FromUnitID = strings.TrimSpace(mapping.FromUnitID)
		mapping.ToUnitID = strings.TrimSpace(mapping.ToUnitID)
		mapping.Status = strings.TrimSpace(mapping.Status)
		if mapping.FromUnitID == "" || mapping.ToUnitID == "" || mapping.Confidence < 0 || mapping.Confidence > 1 || !validRevisionMapUnitStatus(mapping.Status) {
			return RevisionMap{}, fmt.Errorf("%w: unit mappings require from/to unit IDs, valid confidence, and valid status", ErrRevisionMapInvalid)
		}
	}
	for index := range revisionMap.LocatorMappings {
		mapping := &revisionMap.LocatorMappings[index]
		mapping.Status = strings.TrimSpace(mapping.Status)
		mapping.TextQuote = strings.TrimSpace(mapping.TextQuote)
		if mapping.Confidence < 0 || mapping.Confidence > 1 || !validRevisionMapUnitStatus(mapping.Status) {
			return RevisionMap{}, fmt.Errorf("%w: locator mappings require valid confidence and status", ErrRevisionMapInvalid)
		}
		if mapping.FromLocator == nil && mapping.FromLocatorEnvelope == nil {
			return RevisionMap{}, fmt.Errorf("%w: locator mappings require from locator evidence", ErrRevisionMapInvalid)
		}
		if mapping.ToLocator == nil && mapping.ToLocatorEnvelope == nil {
			return RevisionMap{}, fmt.Errorf("%w: locator mappings require to locator evidence", ErrRevisionMapInvalid)
		}
	}
	for index := range revisionMap.ProgressMappings {
		mapping := &revisionMap.ProgressMappings[index]
		mapping.FromProgressID = strings.TrimSpace(mapping.FromProgressID)
		mapping.ToProgressID = strings.TrimSpace(mapping.ToProgressID)
		if mapping.FromProgressID == "" || mapping.ToProgressID == "" || mapping.Confidence < 0 || mapping.Confidence > 1 {
			return RevisionMap{}, fmt.Errorf("%w: progress mappings require from/to progress IDs and valid confidence", ErrRevisionMapInvalid)
		}
	}
	return cloneRevisionMap(revisionMap), nil
}

func validRepairOverlayOperation(operation RepairOverlayOperation) bool {
	switch operation {
	case RepairOverlayOperationReplaceText, RepairOverlayOperationInsertText, RepairOverlayOperationDeleteText, RepairOverlayOperationMarkBlocked, RepairOverlayOperationMetadataPatch:
		return true
	default:
		return false
	}
}

func validRevisionMapCause(cause RevisionMapCause) bool {
	switch cause {
	case RevisionMapCauseRepairOverlay, RevisionMapCauseExtractionCorrection, RevisionMapCausePromotion:
		return true
	default:
		return false
	}
}

func validRevisionMapUnitStatus(status string) bool {
	switch status {
	case "", "matched", "changed", "deleted", "inserted", "blocked":
		return true
	default:
		return false
	}
}

func validateRepairOverlayFromManifests(overlay RepairOverlay, readingUnit ReadingUnitManifest, readalong ReadalongManifest) error {
	if readingUnit.ManifestID == "" || readalong.ManifestID == "" || readingUnit.SourceID != overlay.SourceID || readalong.SourceID != overlay.SourceID || readingUnit.SourceRevisionID != overlay.SourceRevisionID || readalong.SourceRevisionID != overlay.SourceRevisionID {
		return fmt.Errorf("%w: repair overlay source/revision must match from manifests", ErrRepairOverlayInvalid)
	}
	if readingUnit.State != ManifestSnapshotStateCurrent || readalong.State != ManifestSnapshotStateCurrent {
		return fmt.Errorf("%w: repair overlay requires current from manifests", ErrRepairOverlayInvalid)
	}
	if readalong.ReadingUnitManifestID != readingUnit.ManifestID {
		return fmt.Errorf("%w: from readalong manifest must bind the from reading-unit manifest", ErrRepairOverlayInvalid)
	}
	for _, change := range overlay.Changes {
		if !readingUnitManifestContainsUnit(readingUnit, change.UnitID) || !readalongManifestContainsUnit(readalong, change.UnitID) {
			return fmt.Errorf("%w: repair change unit %q is not present in from manifests", ErrRepairOverlayInvalid, change.UnitID)
		}
	}
	return nil
}

func validateRepairOverlayTargetManifests(overlay RepairOverlay, readingUnit ReadingUnitManifest, readalong ReadalongManifest) error {
	if readingUnit.ManifestID == "" || readalong.ManifestID == "" || readingUnit.SourceID != overlay.SourceID || readalong.SourceID != overlay.SourceID || readingUnit.SourceRevisionID != overlay.TargetRevisionID || readalong.SourceRevisionID != overlay.TargetRevisionID {
		return fmt.Errorf("%w: repair target manifests must match overlay source and target revision", ErrRepairOverlayInvalid)
	}
	if readalong.ReadingUnitManifestID != readingUnit.ManifestID {
		return fmt.Errorf("%w: target readalong manifest must bind target reading-unit manifest", ErrRepairOverlayInvalid)
	}
	for _, change := range overlay.Changes {
		if !readingUnitManifestContainsUnit(readingUnit, change.UnitID) || !readalongManifestContainsUnit(readalong, change.UnitID) {
			return fmt.Errorf("%w: repair change unit %q is not present in target manifests", ErrRepairOverlayInvalid, change.UnitID)
		}
	}
	return nil
}

func validateRepairRevisionMapManifestBindings(revisionMap RevisionMap, fromReadingUnit ReadingUnitManifest, fromReadalong ReadalongManifest, toReadingUnit ReadingUnitManifest, toReadalong ReadalongManifest) error {
	if revisionMap.SourceID != fromReadalong.SourceID || revisionMap.SourceID != toReadalong.SourceID || revisionMap.FromSourceRevisionID != fromReadalong.SourceRevisionID || revisionMap.ToSourceRevisionID != toReadalong.SourceRevisionID {
		return fmt.Errorf("%w: revision map source/revision bindings do not match repair manifests", ErrRevisionMapInvalid)
	}
	if revisionMap.Cause != RevisionMapCauseRepairOverlay || revisionMap.OverlayID == "" || metadataString(revisionMap.Metadata, "fromReadingUnitManifestId") != fromReadingUnit.ManifestID || metadataString(revisionMap.Metadata, "fromReadalongManifestId") != fromReadalong.ManifestID || metadataString(revisionMap.Metadata, "toReadingUnitManifestId") != toReadingUnit.ManifestID || metadataString(revisionMap.Metadata, "toReadalongManifestId") != toReadalong.ManifestID {
		return fmt.Errorf("%w: repair revision map requires exact from/to manifest evidence", ErrRevisionMapInvalid)
	}
	for _, mapping := range revisionMap.UnitMappings {
		if !readingUnitManifestContainsUnit(fromReadingUnit, mapping.FromUnitID) || !readalongManifestContainsUnit(fromReadalong, mapping.FromUnitID) {
			return fmt.Errorf("%w: revision map from unit %q is not in from manifests", ErrRevisionMapInvalid, mapping.FromUnitID)
		}
		if mapping.Status != "deleted" && !readingUnitManifestContainsUnit(toReadingUnit, mapping.ToUnitID) {
			return fmt.Errorf("%w: revision map to unit %q is not in target reading-unit manifest", ErrRevisionMapInvalid, mapping.ToUnitID)
		}
		if mapping.Status != "deleted" && !readalongManifestContainsUnit(toReadalong, mapping.ToUnitID) {
			return fmt.Errorf("%w: revision map to unit %q is not in target readalong manifest", ErrRevisionMapInvalid, mapping.ToUnitID)
		}
	}
	return nil
}

func (service *Service) supersedeReadingUnitManifestAcrossRevision(manifestID string, supersededByManifestID string) error {
	manifest, err := service.GetReadingUnitManifest(manifestID)
	if err != nil {
		return err
	}
	manifest.State = ManifestSnapshotStateSuperseded
	manifest.SupersededByManifestID = strings.TrimSpace(supersededByManifestID)
	if manifest.SupersededByManifestID == "" {
		return fmt.Errorf("%w: superseding reading-unit manifest ID is required", ErrManifestSnapshotInvalid)
	}
	if err := service.writeReadingUnitManifest(manifest); err != nil {
		return err
	}
	service.mu.Lock()
	service.readingUnits[manifest.ManifestID] = cloneReadingUnitManifest(manifest)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
	return nil
}

func (service *Service) supersedeReadalongManifestAcrossRevision(manifestID string, supersededByManifestID string) error {
	manifest, err := service.GetReadalongManifest(manifestID)
	if err != nil {
		return err
	}
	manifest.State = ManifestSnapshotStateSuperseded
	manifest.SupersededByManifestID = strings.TrimSpace(supersededByManifestID)
	if manifest.SupersededByManifestID == "" {
		return fmt.Errorf("%w: superseding readalong manifest ID is required", ErrManifestSnapshotInvalid)
	}
	if err := service.writeReadalongManifest(manifest); err != nil {
		return err
	}
	service.mu.Lock()
	service.readalongs[manifest.ManifestID] = cloneReadalongManifest(manifest)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
	return nil
}

func markRepairAffectedAudioArtifactsStale(overlay RepairOverlay, fromReadalong ReadalongManifest, artifacts []ResumeAudioArtifactEvidence) ([]RepairOverlayAffectedArtifact, []ResumeAudioArtifactEvidence) {
	affectedUnits := repairOverlayAffectedUnits(overlay)
	stale := make([]RepairOverlayAffectedArtifact, 0)
	preserved := make([]ResumeAudioArtifactEvidence, 0)
	for _, artifact := range artifacts {
		artifact.ArtifactID = strings.TrimSpace(artifact.ArtifactID)
		artifact.SourceID = strings.TrimSpace(artifact.SourceID)
		artifact.SourceRevisionID = strings.TrimSpace(artifact.SourceRevisionID)
		artifact.ReadalongManifestID = strings.TrimSpace(artifact.ReadalongManifestID)
		artifact.UnitID = strings.TrimSpace(artifact.UnitID)
		artifact.SegmentID = strings.TrimSpace(artifact.SegmentID)
		if artifact.ArtifactID != "" && artifact.SourceID == overlay.SourceID && artifact.SourceRevisionID == overlay.SourceRevisionID && artifact.ReadalongManifestID == fromReadalong.ManifestID && affectedUnits[artifact.UnitID] && stringSliceContains(fromReadalong.AudioArtifactIDs, artifact.ArtifactID) && readalongManifestContainsUnit(fromReadalong, artifact.UnitID) {
			stale = append(stale, RepairOverlayAffectedArtifact{
				ArtifactID:          artifact.ArtifactID,
				ArtifactKind:        "audio",
				SourceID:            artifact.SourceID,
				SourceRevisionID:    artifact.SourceRevisionID,
				ReadalongManifestID: artifact.ReadalongManifestID,
				UnitID:              artifact.UnitID,
				SegmentID:           artifact.SegmentID,
				PreviousState:       artifact.State,
				NewState:            AudioArtifactStateStale,
				Reason:              "repair overlay superseded affected unit artifact",
			})
			continue
		}
		preserved = append(preserved, artifact)
	}
	return stale, preserved
}

func markRepairAffectedHighlightArtifactsStale(overlay RepairOverlay, fromReadalong ReadalongManifest, highlightMapIDs []string) ([]RepairOverlayAffectedArtifact, []string) {
	affectedUnits := repairOverlayAffectedUnits(overlay)
	stale := make([]RepairOverlayAffectedArtifact, 0)
	preserved := make([]string, 0)
	for _, highlightID := range trimStringSlice(highlightMapIDs) {
		if stringSliceContains(fromReadalong.HighlightMapIDs, highlightID) && len(affectedUnits) > 0 {
			stale = append(stale, RepairOverlayAffectedArtifact{
				ArtifactID:          highlightID,
				ArtifactKind:        "highlight_map",
				SourceID:            overlay.SourceID,
				SourceRevisionID:    overlay.SourceRevisionID,
				ReadalongManifestID: fromReadalong.ManifestID,
				NewState:            AudioArtifactStateStale,
				Reason:              "repair overlay superseded affected highlight map",
			})
			continue
		}
		preserved = append(preserved, highlightID)
	}
	return stale, preserved
}

func (service *Service) supersedeRepairAffectedProgress(overlay RepairOverlay, revisionMap RevisionMap, fromReadalong ReadalongManifest) ([]DurableProgress, []DurableProgress, error) {
	affectedUnits := repairOverlayAffectedUnits(overlay)
	mappedProgress := repairRevisionMapProgressIDs(revisionMap)
	service.mu.RLock()
	candidates := make([]DurableProgress, 0)
	for _, progress := range service.durableProgress {
		if progress.SourceID == overlay.SourceID && progress.SourceRevisionID == overlay.SourceRevisionID && progress.ReadalongManifestID == fromReadalong.ManifestID && affectedUnits[progress.Position.UnitID] && stringSliceContains(fromReadalong.ProgressIDs, progress.ProgressID) && mappedProgress[progress.ProgressID] {
			candidates = append(candidates, cloneDurableProgress(progress))
		}
	}
	service.mu.RUnlock()
	sort.SliceStable(candidates, func(left int, right int) bool { return candidates[left].ProgressID < candidates[right].ProgressID })
	updated := make([]DurableProgress, 0, len(candidates))
	originals := make([]DurableProgress, 0, len(candidates))
	for _, original := range candidates {
		progress := cloneDurableProgress(original)
		progress.State = DurableProgressStateSuperseded
		progress.Metadata = ensureManifestMetadata(progress.Metadata)
		progress.Metadata["repairOverlayId"] = overlay.OverlayID
		progress.Metadata["revisionMapId"] = revisionMap.RevisionMapID
		progress.Metadata["supersededByReadalongManifestId"] = metadataString(revisionMap.Metadata, "toReadalongManifestId")
		progress.UpdatedAt = maxTime(progress.UpdatedAt, overlay.CreatedAt)
		if err := service.writeDurableProgress(progress); err != nil {
			service.rollbackRepairProgress(originals)
			return nil, nil, err
		}
		service.mu.Lock()
		service.durableProgress[progress.ProgressID] = cloneDurableProgress(progress)
		service.mu.Unlock()
		publishDurableProgressEvent(service, progress)
		originals = append(originals, original)
		updated = append(updated, cloneDurableProgress(progress))
	}
	return updated, originals, nil
}

func (service *Service) repairSourceLifecycleRequest(overlay RepairOverlay, request SourceLifecyclePersistRequest) (SourceLifecyclePersistRequest, error) {
	service.mu.RLock()
	envelope, ok := service.sourceEnvelopes[overlay.SourceID]
	service.mu.RUnlock()
	if !ok || envelope.CurrentRevisionID != overlay.SourceRevisionID {
		return SourceLifecyclePersistRequest{}, fmt.Errorf("%w: repair overlay source envelope must exist at the source revision", ErrSourceLifecycleNotFound)
	}
	envelope = cloneSourceEnvelope(envelope)
	repaired := request
	repaired.SourceID = overlay.SourceID
	repaired.RevisionID = overlay.TargetRevisionID
	repaired.ProjectID = envelope.ProjectID
	repaired.SourceKind = envelope.SourceKind
	repaired.Lifecycle = envelope.Lifecycle
	repaired.ExpiresAt = envelope.ExpiresAt
	repaired.PromotedToSourceID = envelope.PromotedToSourceID
	if repaired.Metadata == nil {
		repaired.Metadata = cloneSourceLifecycleMetadata(envelope.Metadata)
	}
	repaired.RepairOverlayID = overlay.OverlayID
	if repaired.RevisionMetadata == nil {
		repaired.RevisionMetadata = map[string]any{}
	}
	repaired.RevisionMetadata["repairOverlayId"] = overlay.OverlayID
	return repaired, nil
}

func (service *Service) rollbackRepairProgress(originals []DurableProgress) {
	for _, progress := range originals {
		_ = service.writeDurableProgress(progress)
		service.mu.Lock()
		service.durableProgress[progress.ProgressID] = cloneDurableProgress(progress)
		service.mu.Unlock()
	}
}

func (service *Service) rollbackRepairSourceLifecycle(sourceID string, oldRevisionID string, targetRevisionID string) {
	service.mu.RLock()
	envelope, hasEnvelope := service.sourceEnvelopes[sourceID]
	oldRevision, hasOldRevision := service.sourceRevisions[oldRevisionID]
	service.mu.RUnlock()
	if hasEnvelope {
		envelope = cloneSourceEnvelope(envelope)
		envelope.CurrentRevisionID = oldRevisionID
		_ = service.writeSourceEnvelope(envelope)
	}
	if hasOldRevision {
		oldRevision = cloneSourceRevision(oldRevision)
		oldRevision.RevisionState = SourceRevisionStateCurrent
		oldRevision.SupersededByRevisionID = ""
		_ = service.writeSourceRevision(oldRevision)
	}
	_ = service.removeSourceRevision(sourceID, targetRevisionID)
	service.mu.Lock()
	if hasEnvelope {
		service.sourceEnvelopes[sourceID] = cloneSourceEnvelope(envelope)
	}
	if hasOldRevision {
		service.sourceRevisions[oldRevisionID] = cloneSourceRevision(oldRevision)
	}
	delete(service.sourceRevisions, targetRevisionID)
	service.mu.Unlock()
}

func (service *Service) promoteRepairReadingUnitManifest(manifest ReadingUnitManifest) (ReadingUnitManifest, error) {
	if err := service.writeReadingUnitManifest(manifest); err != nil {
		return ReadingUnitManifest{}, err
	}
	service.mu.Lock()
	service.readingUnits[manifest.ManifestID] = cloneReadingUnitManifest(manifest)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
	return cloneReadingUnitManifest(manifest), nil
}

func (service *Service) promoteRepairReadalongManifest(manifest ReadalongManifest) (ReadalongManifest, error) {
	if err := service.writeReadalongManifest(manifest); err != nil {
		return ReadalongManifest{}, err
	}
	service.mu.Lock()
	service.readalongs[manifest.ManifestID] = cloneReadalongManifest(manifest)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
	return cloneReadalongManifest(manifest), nil
}

func (service *Service) restoreReadingUnitManifest(manifest ReadingUnitManifest) {
	_ = service.writeReadingUnitManifest(manifest)
	service.mu.Lock()
	service.readingUnits[manifest.ManifestID] = cloneReadingUnitManifest(manifest)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
}

func (service *Service) restoreReadalongManifest(manifest ReadalongManifest) {
	_ = service.writeReadalongManifest(manifest)
	service.mu.Lock()
	service.readalongs[manifest.ManifestID] = cloneReadalongManifest(manifest)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
}

func (service *Service) removeReadingUnitManifest(manifest ReadingUnitManifest) {
	_ = os.Remove(service.readingUnitManifestPath(manifest))
	service.mu.Lock()
	delete(service.readingUnits, manifest.ManifestID)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
}

func (service *Service) removeReadalongManifest(manifest ReadalongManifest) {
	_ = os.Remove(service.readalongManifestPath(manifest))
	service.mu.Lock()
	delete(service.readalongs, manifest.ManifestID)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
}

func repairRevisionMapProgressIDs(revisionMap RevisionMap) map[string]bool {
	progressIDs := map[string]bool{}
	for _, mapping := range revisionMap.ProgressMappings {
		if strings.TrimSpace(mapping.FromProgressID) != "" && mapping.Confidence >= durableProgressRemapConfidence && strings.TrimSpace(mapping.ToProgressID) != "" {
			progressIDs[strings.TrimSpace(mapping.FromProgressID)] = true
		}
	}
	return progressIDs
}

func (service *Service) sourceRevisionForRepair(sourceID string, revisionID string) (SourceRevision, error) {
	cleanSourceID := strings.TrimSpace(sourceID)
	cleanRevisionID := strings.TrimSpace(revisionID)
	if cleanSourceID == "" || cleanRevisionID == "" {
		return SourceRevision{}, fmt.Errorf("%w: source and revision are required", ErrSourceLifecycleNotFound)
	}
	service.mu.RLock()
	revision, ok := service.sourceRevisions[cleanRevisionID]
	service.mu.RUnlock()
	if !ok || revision.SourceID != cleanSourceID {
		return SourceRevision{}, fmt.Errorf("%w: source revision is missing or mismatched", ErrSourceLifecycleNotFound)
	}
	return cloneSourceRevision(revision), nil
}

func (service *Service) revisionMapsForResume(progress DurableProgress, current ReadalongManifest) []RevisionMap {
	service.mu.RLock()
	maps := make([]RevisionMap, 0)
	for _, revisionMap := range service.revisionMaps {
		if revisionMap.SourceID == progress.SourceID && revisionMap.FromSourceRevisionID == progress.SourceRevisionID && revisionMap.ToSourceRevisionID == current.SourceRevisionID {
			maps = append(maps, cloneRevisionMap(revisionMap))
		}
	}
	service.mu.RUnlock()
	sort.SliceStable(maps, func(left int, right int) bool { return maps[left].RevisionMapID < maps[right].RevisionMapID })
	return maps
}

func repairOverlayAffectedUnits(overlay RepairOverlay) map[string]bool {
	units := map[string]bool{}
	for _, change := range overlay.Changes {
		if unitID := strings.TrimSpace(change.UnitID); unitID != "" {
			units[unitID] = true
		}
	}
	return units
}

func readingUnitManifestContainsUnit(manifest ReadingUnitManifest, unitID string) bool {
	cleanUnitID := strings.TrimSpace(unitID)
	if cleanUnitID == "" {
		return false
	}
	for _, unit := range manifest.Units {
		if strings.TrimSpace(unit.UnitID) == cleanUnitID {
			return true
		}
	}
	return false
}

func appendUniqueString(values []string, value string) []string {
	clean := strings.TrimSpace(value)
	if clean == "" || stringSliceContains(values, clean) {
		return trimStringSlice(values)
	}
	output := trimStringSlice(values)
	return append(output, clean)
}

func ensureManifestMetadata(metadata map[string]any) map[string]any {
	if metadata == nil {
		return map[string]any{}
	}
	return cloneManifestMetadata(metadata)
}

func maxTime(left time.Time, right time.Time) time.Time {
	if left.IsZero() || right.After(left) {
		return right.UTC()
	}
	return left.UTC()
}

func repairOverlaysEqual(left RepairOverlay, right RepairOverlay) bool {
	leftJSON, leftErr := json.Marshal(cloneRepairOverlay(left))
	rightJSON, rightErr := json.Marshal(cloneRepairOverlay(right))
	return leftErr == nil && rightErr == nil && string(leftJSON) == string(rightJSON)
}

func cloneRepairOverlay(overlay RepairOverlay) RepairOverlay {
	overlay.Changes = cloneRepairOverlayChanges(overlay.Changes)
	overlay.Metadata = cloneManifestMetadata(overlay.Metadata)
	return overlay
}

func cloneRepairOverlayChanges(changes []RepairOverlayChange) []RepairOverlayChange {
	if changes == nil {
		return nil
	}
	output := make([]RepairOverlayChange, len(changes))
	for index, change := range changes {
		output[index] = change
		if change.Locator != nil {
			locator := cloneLocator(*change.Locator)
			output[index].Locator = &locator
		}
	}
	return output
}

func cloneRevisionMap(revisionMap RevisionMap) RevisionMap {
	revisionMap.UnitMappings = append([]RevisionMapUnitMapping(nil), revisionMap.UnitMappings...)
	revisionMap.ProgressMappings = append([]RevisionMapProgressMapping(nil), revisionMap.ProgressMappings...)
	revisionMap.LocatorMappings = cloneRevisionMapLocatorMappings(revisionMap.LocatorMappings)
	revisionMap.Metadata = cloneManifestMetadata(revisionMap.Metadata)
	return revisionMap
}

func cloneRevisionMapLocatorMappings(mappings []RevisionMapLocatorMapping) []RevisionMapLocatorMapping {
	if mappings == nil {
		return nil
	}
	output := make([]RevisionMapLocatorMapping, len(mappings))
	for index, mapping := range mappings {
		output[index] = mapping
		if mapping.FromLocator != nil {
			locator := cloneLocator(*mapping.FromLocator)
			output[index].FromLocator = &locator
		}
		if mapping.ToLocator != nil {
			locator := cloneLocator(*mapping.ToLocator)
			output[index].ToLocator = &locator
		}
		if mapping.FromLocatorEnvelope != nil {
			envelope := cloneLocatorEnvelope(*mapping.FromLocatorEnvelope)
			output[index].FromLocatorEnvelope = &envelope
		}
		if mapping.ToLocatorEnvelope != nil {
			envelope := cloneLocatorEnvelope(*mapping.ToLocatorEnvelope)
			output[index].ToLocatorEnvelope = &envelope
		}
	}
	return output
}

func (service *Service) reloadRepairOverlays() {
	baseDir := service.sourceLifecycleBaseDir()
	sourceEntries, err := os.ReadDir(baseDir)
	if err != nil {
		return
	}
	items := map[string]RepairOverlay{}
	for _, sourceEntry := range sourceEntries {
		if !sourceEntry.IsDir() {
			continue
		}
		service.loadRepairOverlaysFromDir(filepath.Join(baseDir, sourceEntry.Name(), repairOverlayDirName), items)
	}
	service.mu.Lock()
	service.repairOverlays = items
	service.mu.Unlock()
}

func (service *Service) loadRepairOverlaysFromDir(dir string, overlays map[string]RepairOverlay) {
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
		var overlay RepairOverlay
		if err := jsonUnmarshal(data, &overlay); err != nil {
			continue
		}
		normalized, normalizeErr := service.normalizeRepairOverlay(overlay)
		if normalizeErr != nil {
			continue
		}
		overlays[normalized.OverlayID] = cloneRepairOverlay(normalized)
	}
}

func (service *Service) reloadRevisionMaps() {
	baseDir := service.sourceLifecycleBaseDir()
	sourceEntries, err := os.ReadDir(baseDir)
	if err != nil {
		return
	}
	items := map[string]RevisionMap{}
	for _, sourceEntry := range sourceEntries {
		if !sourceEntry.IsDir() {
			continue
		}
		service.loadRevisionMapsFromDir(filepath.Join(baseDir, sourceEntry.Name(), revisionMapDirName), items)
	}
	service.mu.Lock()
	service.revisionMaps = items
	service.mu.Unlock()
}

func (service *Service) loadRevisionMapsFromDir(dir string, revisionMaps map[string]RevisionMap) {
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
		var revisionMap RevisionMap
		if err := jsonUnmarshal(data, &revisionMap); err != nil {
			continue
		}
		normalized, normalizeErr := service.normalizeRevisionMap(revisionMap)
		if normalizeErr != nil {
			continue
		}
		revisionMaps[normalized.RevisionMapID] = cloneRevisionMap(normalized)
	}
}

func (service *Service) writeRepairOverlay(overlay RepairOverlay) error {
	return writeJSONAtomicForRepairOverlays(service.repairOverlayPath(overlay), overlay)
}

func (service *Service) writeRevisionMap(revisionMap RevisionMap) error {
	return writeJSONAtomicForRepairOverlays(service.revisionMapPath(revisionMap), revisionMap)
}

func (service *Service) repairOverlayPath(overlay RepairOverlay) string {
	return filepath.Join(service.sourceLifecycleBaseDir(), sourceLifecycleDataPathID(overlay.SourceID), repairOverlayDirName, sourceLifecycleDataPathID(overlay.OverlayID)+manifestSnapshotExt)
}

func (service *Service) revisionMapPath(revisionMap RevisionMap) string {
	return filepath.Join(service.sourceLifecycleBaseDir(), sourceLifecycleDataPathID(revisionMap.SourceID), revisionMapDirName, sourceLifecycleDataPathID(revisionMap.RevisionMapID)+manifestSnapshotExt)
}

func publishRepairOverlayEvent(service *Service, overlay RepairOverlay) {
	service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          overlay.SourceID,
		OccurredAt:        overlay.CreatedAt,
		EventType:         SourceManifestEventRepairOverlayCreated,
		SnapshotAvailable: true,
		Subject: SourceManifestEventSubject{
			SourceRevisionID: overlay.SourceRevisionID,
			RepairOverlayID:  overlay.OverlayID,
			State:            "created",
		},
		SnapshotManifestID: metadataString(overlay.Metadata, "toReadalongManifestId"),
		Metadata: map[string]any{
			"targetRevisionId":          overlay.TargetRevisionID,
			"fromReadingUnitManifestId": metadataString(overlay.Metadata, "fromReadingUnitManifestId"),
			"fromReadalongManifestId":   metadataString(overlay.Metadata, "fromReadalongManifestId"),
			"toReadingUnitManifestId":   metadataString(overlay.Metadata, "toReadingUnitManifestId"),
			"toReadalongManifestId":     metadataString(overlay.Metadata, "toReadalongManifestId"),
		},
	})
}
