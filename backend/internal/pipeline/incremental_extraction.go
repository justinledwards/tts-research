package pipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

const incrementalExtractionMetadataVersion = "epub-html-incremental-extraction.v1"

// IncrementalExtractionSnapshot is emitted to the in-process observer after each
// durable reading-unit/readalong snapshot pair is written. It is intentionally a
// narrow proof hook, not an event stream; QQP-429 owns source/manifest events.
type IncrementalExtractionSnapshot struct {
	Kind                 BookSourceKind
	SourceID             string
	SourceRevisionID     string
	ExtractionRevisionID string
	ReadingUnitManifest  ReadingUnitManifest
	ReadalongManifest    ReadalongManifest
}

func incrementalBookSourceKind(kind BookSourceKind) bool {
	switch kind {
	case BookSourceKindHTML, BookSourceKindEPUB:
		return true
	default:
		return false
	}
}

func bookSourceRevisionID(bookID string) string {
	return strings.TrimSpace(bookID) + "-rev"
}

func bookSourceExtractionRevisionID(book BookSource, sourceRevisionID string, document contentir.Document) string {
	return deterministicManifestID(
		"er",
		book.ID,
		sourceRevisionID,
		string(book.Kind),
		firstNonEmpty(document.AdapterVersion, "content-ir-adapter"),
	)
}

func bookSourceLifecycleContentType(kind BookSourceKind, sourceFileName string) string {
	switch kind {
	case BookSourceKindHTML:
		switch strings.ToLower(filepath.Ext(sourceFileName)) {
		case ".zip":
			return "application/zip"
		case ".xhtml":
			return "application/xhtml+xml"
		default:
			return "text/html"
		}
	case BookSourceKindEPUB:
		return "application/epub+zip"
	default:
		return "application/octet-stream"
	}
}

func sourceLifecycleRequestFromBookSource(book BookSource, sourcePath string, sourceRevisionID string) SourceLifecyclePersistRequest {
	contentType := bookSourceLifecycleContentType(book.Kind, book.SourceFile)
	return SourceLifecyclePersistRequest{
		SourceID:   book.ID,
		RevisionID: sourceRevisionID,
		ProjectID:  book.ProjectID,
		SourceKind: SourceEnvelopeKindProject,
		Lifecycle:  SourceEnvelopeLifecycleActive,
		Origin: SourceOrigin{
			Method:      SourceOriginMethodUpload,
			FileName:    book.SourceFile,
			ContentType: contentType,
			ByteLength:  book.SourceBytes,
		},
		RawPath:                sourcePath,
		RawArtifactContentType: contentType,
		RawArtifactFileName:    book.SourceFile,
		WorkStatus:             SourceLifecycleWorkStatusRunning,
		RevisionWorkStatus:     SourceLifecycleWorkStatusRunning,
		Metadata: map[string]any{
			"bookSourceKind": string(book.Kind),
			"proof":          incrementalExtractionMetadataVersion,
		},
		RevisionMetadata: map[string]any{
			"bookSourceKind": string(book.Kind),
			"proof":          incrementalExtractionMetadataVersion,
		},
	}
}

func (service *Service) persistIncrementalBookSourceManifests(
	ctx context.Context,
	book BookSource,
	document contentir.Document,
	sourceRevisionID string,
	generatedAt time.Time,
) error {
	if !incrementalBookSourceKind(book.Kind) {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if len(document.Nodes) == 0 {
		return fmt.Errorf("incremental %s extraction produced no readable units", book.Kind)
	}
	sourceRevisionID = strings.TrimSpace(sourceRevisionID)
	if sourceRevisionID == "" {
		sourceRevisionID = bookSourceRevisionID(book.ID)
	}
	extractionRevisionID := bookSourceExtractionRevisionID(book, sourceRevisionID, document)
	manifestUnits := make([]ReadingUnitManifestUnit, 0, len(document.Nodes))
	unitIDs := make([]string, 0, len(document.Nodes))
	warnings := incrementalDocumentWarnings(document)
	for index, node := range document.Nodes {
		if err := ctx.Err(); err != nil {
			return err
		}
		unit, err := readingUnitManifestUnitFromContentIRNode(document, node, index)
		if err != nil {
			return err
		}
		manifestUnits = append(manifestUnits, unit)
		unitIDs = append(unitIDs, unit.UnitID)
		revision := index + 1
		complete := revision == len(document.Nodes)
		prefixWarnings := incrementalWarningsForPrefix(document, revision, warnings)
		degraded := len(prefixWarnings) > 0
		readingUnitManifest, readalongManifest, err := service.persistIncrementalManifestSnapshotPair(ReadingUnitManifest{
			SourceID:             book.ID,
			SourceRevisionID:     sourceRevisionID,
			ExtractionRevisionID: extractionRevisionID,
			ManifestRevision:     revision,
			State:                ManifestSnapshotStateCurrent,
			GeneratedAt:          generatedAt.UTC().Add(time.Duration(revision) * time.Nanosecond),
			Units:                cloneReadingUnitManifestUnits(manifestUnits),
			Summary: ReadingUnitManifestSummary{
				UnitCount:       len(manifestUnits),
				ReadableCount:   len(manifestUnits),
				NarratableCount: 0,
				BlockedCount:    0,
				PendingCount:    0,
				Degraded:        &degraded,
			},
			Warnings: prefixWarnings,
			Metadata: map[string]any{
				"complete":          complete,
				"format":            string(book.Kind),
				"proof":             incrementalExtractionMetadataVersion,
				"sourceType":        document.SourceType,
				"snapshotUnitCount": len(manifestUnits),
			},
		}, ReadalongManifest{
			SourceID:             book.ID,
			SourceRevisionID:     sourceRevisionID,
			ExtractionRevisionID: extractionRevisionID,
			ManifestRevision:     revision,
			State:                ManifestSnapshotStateCurrent,
			GeneratedAt:          generatedAt.UTC().Add(time.Duration(revision) * time.Nanosecond),
			UnitIDs:              cloneStringSlice(unitIDs),
			Warnings:             prefixWarnings,
			Metadata: map[string]any{
				"complete":          complete,
				"format":            string(book.Kind),
				"proof":             incrementalExtractionMetadataVersion,
				"snapshotUnitCount": len(unitIDs),
			},
		})
		if err != nil {
			return err
		}
		if observer := service.options.incrementalExtractionObserver; observer != nil {
			observer(ctx, IncrementalExtractionSnapshot{
				Kind:                 book.Kind,
				SourceID:             book.ID,
				SourceRevisionID:     sourceRevisionID,
				ExtractionRevisionID: extractionRevisionID,
				ReadingUnitManifest:  readingUnitManifest,
				ReadalongManifest:    readalongManifest,
			})
		}
	}
	return nil
}

func (service *Service) persistIncrementalManifestSnapshotPair(readingUnit ReadingUnitManifest, readalong ReadalongManifest) (ReadingUnitManifest, ReadalongManifest, error) {
	normalizedReadingUnit, err := normalizeReadingUnitManifest(readingUnit)
	if err != nil {
		return ReadingUnitManifest{}, ReadalongManifest{}, err
	}
	readalong.ReadingUnitManifestID = normalizedReadingUnit.ManifestID
	normalizedReadalong, err := normalizeReadalongManifest(readalong)
	if err != nil {
		return ReadingUnitManifest{}, ReadalongManifest{}, err
	}
	if normalizedReadalong.SourceID != normalizedReadingUnit.SourceID || normalizedReadalong.SourceRevisionID != normalizedReadingUnit.SourceRevisionID || normalizedReadalong.ExtractionRevisionID != normalizedReadingUnit.ExtractionRevisionID || normalizedReadalong.ManifestRevision != normalizedReadingUnit.ManifestRevision {
		return ReadingUnitManifest{}, ReadalongManifest{}, fmt.Errorf("%w: incremental reading-unit/readalong manifest pair bindings do not match", ErrManifestSnapshotInvalid)
	}

	readingUnitKey := manifestCurrentKey{Kind: ManifestSnapshotKindReadingUnit, SourceID: normalizedReadingUnit.SourceID, SourceRevisionID: normalizedReadingUnit.SourceRevisionID}
	readalongKey := manifestCurrentKey{Kind: ManifestSnapshotKindReadalong, SourceID: normalizedReadalong.SourceID, SourceRevisionID: normalizedReadalong.SourceRevisionID}
	var previousReadingUnit ReadingUnitManifest
	var previousReadalong ReadalongManifest
	hasPreviousReadingUnit := false
	hasPreviousReadalong := false
	service.mu.RLock()
	if normalizedReadingUnit.State == ManifestSnapshotStateCurrent {
		if previousID := service.currentManifests[readingUnitKey]; previousID != "" && previousID != normalizedReadingUnit.ManifestID {
			if candidate, ok := service.readingUnits[previousID]; ok {
				previousReadingUnit = cloneReadingUnitManifest(candidate)
				hasPreviousReadingUnit = true
			}
		}
	}
	if normalizedReadalong.State == ManifestSnapshotStateCurrent {
		if previousID := service.currentManifests[readalongKey]; previousID != "" && previousID != normalizedReadalong.ManifestID {
			if candidate, ok := service.readalongs[previousID]; ok {
				previousReadalong = cloneReadalongManifest(candidate)
				hasPreviousReadalong = true
			}
		}
	}
	service.mu.RUnlock()

	if err := service.writeReadingUnitManifest(normalizedReadingUnit); err != nil {
		return ReadingUnitManifest{}, ReadalongManifest{}, err
	}
	if err := service.writeReadalongManifest(normalizedReadalong); err != nil {
		failedReadingUnit := cloneReadingUnitManifest(normalizedReadingUnit)
		failedReadingUnit.State = ManifestSnapshotStateFailed
		failedReadingUnit.SupersededByManifestID = ""
		if failedErr := service.writeReadingUnitManifest(failedReadingUnit); failedErr != nil {
			removeErr := os.Remove(service.readingUnitManifestPath(normalizedReadingUnit))
			if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
				return ReadingUnitManifest{}, ReadalongManifest{}, errors.Join(err, failedErr, removeErr)
			}
			return ReadingUnitManifest{}, ReadalongManifest{}, errors.Join(err, failedErr)
		}
		return ReadingUnitManifest{}, ReadalongManifest{}, err
	}

	var previousWriteErr error
	var updatedPreviousReadingUnit ReadingUnitManifest
	previousReadingUnitWriteErr := error(nil)
	if hasPreviousReadingUnit {
		updatedPreviousReadingUnit = cloneReadingUnitManifest(previousReadingUnit)
		updatedPreviousReadingUnit.State = ManifestSnapshotStateSuperseded
		updatedPreviousReadingUnit.SupersededByManifestID = normalizedReadingUnit.ManifestID
		if err := service.writeReadingUnitManifest(updatedPreviousReadingUnit); err != nil {
			previousReadingUnitWriteErr = err
			previousWriteErr = errors.Join(previousWriteErr, err)
		}
	}
	var updatedPreviousReadalong ReadalongManifest
	previousReadalongWriteErr := error(nil)
	if hasPreviousReadalong {
		updatedPreviousReadalong = cloneReadalongManifest(previousReadalong)
		updatedPreviousReadalong.State = ManifestSnapshotStateSuperseded
		updatedPreviousReadalong.SupersededByManifestID = normalizedReadalong.ManifestID
		if err := service.writeReadalongManifest(updatedPreviousReadalong); err != nil {
			previousReadalongWriteErr = err
			previousWriteErr = errors.Join(previousWriteErr, err)
		}
	}

	service.mu.Lock()
	if hasPreviousReadingUnit {
		if previousReadingUnitWriteErr == nil {
			service.readingUnits[previousReadingUnit.ManifestID] = cloneReadingUnitManifest(updatedPreviousReadingUnit)
		} else {
			service.readingUnits[previousReadingUnit.ManifestID] = cloneReadingUnitManifest(previousReadingUnit)
		}
	}
	if hasPreviousReadalong {
		if previousReadalongWriteErr == nil {
			service.readalongs[previousReadalong.ManifestID] = cloneReadalongManifest(updatedPreviousReadalong)
		} else {
			service.readalongs[previousReadalong.ManifestID] = cloneReadalongManifest(previousReadalong)
		}
	}
	service.readingUnits[normalizedReadingUnit.ManifestID] = cloneReadingUnitManifest(normalizedReadingUnit)
	service.readalongs[normalizedReadalong.ManifestID] = cloneReadalongManifest(normalizedReadalong)
	service.rebuildManifestIndexesLocked()
	service.mu.Unlock()
	if previousWriteErr != nil {
		return cloneReadingUnitManifest(normalizedReadingUnit), cloneReadalongManifest(normalizedReadalong), previousWriteErr
	}
	publishReadingUnitManifestEvent(service, normalizedReadingUnit)
	publishReadalongManifestEvent(service, normalizedReadalong)
	return cloneReadingUnitManifest(normalizedReadingUnit), cloneReadalongManifest(normalizedReadalong), nil
}

func readingUnitManifestUnitFromContentIRNode(document contentir.Document, node contentir.Node, index int) (ReadingUnitManifestUnit, error) {
	positionKey := fmt.Sprintf("%08d", index+1)
	unitID := strings.TrimSpace(node.NodeID)
	if unitID == "" {
		unitID = deterministicManifestID("unit", document.SourceID, positionKey, node.OrderKey, node.NormalisedText)
	}
	orderKey := strings.TrimSpace(node.OrderKey)
	if orderKey == "" {
		orderKey = positionKey
	}
	fingerprint := metadataValueString(node.Metadata, "fingerprint")
	if fingerprint == "" {
		fingerprint = deterministicManifestID("fp", document.SourceID, unitID, orderKey, node.NormalisedText)
	}
	locator, err := manifestMapFromJSON(node.Provenance.Locator)
	if err != nil {
		return ReadingUnitManifestUnit{}, fmt.Errorf("encode %s locator for reading-unit manifest: %w", unitID, err)
	}
	provenance, err := manifestMapFromJSON(node.Provenance)
	if err != nil {
		return ReadingUnitManifestUnit{}, fmt.Errorf("encode %s provenance for reading-unit manifest: %w", unitID, err)
	}
	return ReadingUnitManifestUnit{
		UnitID:      unitID,
		OrderKey:    orderKey,
		NodeID:      node.NodeID,
		Readiness:   ReadingUnitReadinessReadable,
		ContentIRID: document.ID,
		Locator:     locator,
		Fingerprint: fingerprint,
		Warnings:    contentIRStringSlice(node.Warnings),
		Provenance:  provenance,
	}, nil
}

func incrementalDocumentWarnings(document contentir.Document) []string {
	warnings := metadataValueStringSlice(document.Metadata, "warnings")
	for _, node := range document.Nodes {
		warnings = append(warnings, node.Warnings...)
	}
	return uniqueStrings(warnings)
}

func incrementalWarningsForPrefix(document contentir.Document, count int, documentWarnings []string) []string {
	warnings := make([]string, 0)
	if count >= len(document.Nodes) {
		warnings = append(warnings, documentWarnings...)
	} else {
		for _, node := range document.Nodes[:count] {
			warnings = append(warnings, node.Warnings...)
		}
	}
	return uniqueStrings(warnings)
}

func manifestMapFromJSON(value any) (map[string]any, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var output map[string]any
	if err := json.Unmarshal(data, &output); err != nil {
		return nil, err
	}
	return output, nil
}
