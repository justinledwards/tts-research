package pipeline

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	sourceEnvelopeSchemaVersion = "source-envelope.v1"
	sourceRevisionSchemaVersion = "source-revision.v1"

	sourceLifecycleEnvelopeFilename = "envelope.json"
	sourceLifecycleRevisionFilename = "revision.json"
	sourceLifecycleRawDir           = "raw"

	sourceLifecycleWorkStatusMetadataKey        = "workStatus"
	sourceLifecycleInterruptedAtMetadataKey     = "interruptedAt"
	sourceLifecycleInterruptedReasonMetadataKey = "interruptedReason"
)

var (
	writeJSONAtomicForSourceLifecycle = writeJSONAtomic
	writeFileAtomicForSourceLifecycle = writeFileAtomic
)

type SourceEnvelopeKind string

const (
	SourceEnvelopeKindProject              SourceEnvelopeKind = "project"
	SourceEnvelopeKindQuickListenTemporary SourceEnvelopeKind = "quick_listen_temporary"
	SourceEnvelopeKindImported             SourceEnvelopeKind = "imported"
)

type SourceOriginMethod string

const (
	SourceOriginMethodUpload    SourceOriginMethod = "upload"
	SourceOriginMethodURL       SourceOriginMethod = "url"
	SourceOriginMethodPaste     SourceOriginMethod = "paste"
	SourceOriginMethodGenerated SourceOriginMethod = "generated"
)

type SourceEnvelopeLifecycle string

const (
	SourceEnvelopeLifecycleActive    SourceEnvelopeLifecycle = "active"
	SourceEnvelopeLifecycleTemporary SourceEnvelopeLifecycle = "temporary"
	SourceEnvelopeLifecyclePromoted  SourceEnvelopeLifecycle = "promoted"
	SourceEnvelopeLifecycleArchived  SourceEnvelopeLifecycle = "archived"
	SourceEnvelopeLifecycleDeleted   SourceEnvelopeLifecycle = "deleted"
)

type SourceRevisionState string

const (
	SourceRevisionStateCurrent    SourceRevisionState = "current"
	SourceRevisionStateSuperseded SourceRevisionState = "superseded"
	SourceRevisionStateArchived   SourceRevisionState = "archived"
)

type SourceLifecycleWorkStatus string

const (
	SourceLifecycleWorkStatusQueued               SourceLifecycleWorkStatus = "queued"
	SourceLifecycleWorkStatusRunning              SourceLifecycleWorkStatus = "running"
	SourceLifecycleWorkStatusComplete             SourceLifecycleWorkStatus = "complete"
	SourceLifecycleWorkStatusCompleteWithWarnings SourceLifecycleWorkStatus = "complete_with_warnings"
	SourceLifecycleWorkStatusFailed               SourceLifecycleWorkStatus = "failed"
	SourceLifecycleWorkStatusCancelled            SourceLifecycleWorkStatus = "cancelled"
	SourceLifecycleWorkStatusInterruptedRetriable SourceLifecycleWorkStatus = "interrupted_retriable"
)

type SourceOrigin struct {
	Method      SourceOriginMethod `json:"method"`
	URI         string             `json:"uri,omitempty"`
	FileName    string             `json:"fileName,omitempty"`
	ContentType string             `json:"contentType,omitempty"`
	ContentHash string             `json:"contentHash,omitempty"`
	ByteLength  int64              `json:"byteLength,omitempty"`
}

type SourceEnvelope struct {
	SchemaVersion      string                  `json:"schemaVersion"`
	SourceID           string                  `json:"sourceId"`
	SourceKind         SourceEnvelopeKind      `json:"sourceKind"`
	Origin             SourceOrigin            `json:"origin"`
	ProjectID          string                  `json:"projectId"`
	CreatedAt          time.Time               `json:"createdAt"`
	CurrentRevisionID  string                  `json:"currentRevisionId"`
	Lifecycle          SourceEnvelopeLifecycle `json:"lifecycle"`
	ExpiresAt          *time.Time              `json:"expiresAt,omitempty"`
	PromotedToSourceID string                  `json:"promotedToSourceId,omitempty"`
	Metadata           map[string]any          `json:"metadata,omitempty"`
}

type SourceRawArtifact struct {
	ArtifactID  string `json:"artifactId"`
	URI         string `json:"uri"`
	SHA256      string `json:"sha256"`
	ContentType string `json:"contentType,omitempty"`
	ByteLength  int64  `json:"byteLength,omitempty"`
}

type SourceRevision struct {
	SchemaVersion          string              `json:"schemaVersion"`
	RevisionID             string              `json:"revisionId"`
	SourceID               string              `json:"sourceId"`
	CreatedAt              time.Time           `json:"createdAt"`
	RevisionOrdinal        int                 `json:"revisionOrdinal"`
	RevisionState          SourceRevisionState `json:"revisionState"`
	ContentHash            string              `json:"contentHash"`
	SourceFingerprint      string              `json:"sourceFingerprint,omitempty"`
	RawArtifact            SourceRawArtifact   `json:"rawArtifact"`
	SupersedesRevisionID   string              `json:"supersedesRevisionId,omitempty"`
	SupersededByRevisionID string              `json:"supersededByRevisionId,omitempty"`
	RepairOverlayID        string              `json:"repairOverlayId,omitempty"`
	Metadata               map[string]any      `json:"metadata,omitempty"`
}

type SourceLifecyclePersistRequest struct {
	SourceID               string
	RevisionID             string
	ProjectID              string
	SourceKind             SourceEnvelopeKind
	Lifecycle              SourceEnvelopeLifecycle
	Origin                 SourceOrigin
	RawBytes               []byte
	RawText                string
	RawPath                string
	RawArtifactID          string
	RawArtifactFileName    string
	RawArtifactContentType string
	WorkStatus             SourceLifecycleWorkStatus
	RevisionWorkStatus     SourceLifecycleWorkStatus
	CreatedAt              time.Time
	ExpiresAt              *time.Time
	PromotedToSourceID     string
	Metadata               map[string]any
	RevisionMetadata       map[string]any
}

func (service *Service) PersistSourceLifecycle(request SourceLifecyclePersistRequest) (SourceEnvelope, SourceRevision, error) {
	now := request.CreatedAt.UTC()
	if now.IsZero() {
		now = time.Now().UTC()
	}
	sourceID := strings.TrimSpace(request.SourceID)
	if sourceID == "" {
		sourceID = "source_" + newID()
	}
	revisionID := strings.TrimSpace(request.RevisionID)
	if revisionID == "" {
		revisionID = "rev_" + newID()
	}
	projectID := strings.TrimSpace(request.ProjectID)
	if projectID == "" {
		projectID = defaultProjectID
	}
	sourceKind := request.SourceKind
	if sourceKind == "" {
		sourceKind = SourceEnvelopeKindProject
	}
	lifecycle := request.Lifecycle
	if lifecycle == "" {
		if sourceKind == SourceEnvelopeKindQuickListenTemporary {
			lifecycle = SourceEnvelopeLifecycleTemporary
		} else {
			lifecycle = SourceEnvelopeLifecycleActive
		}
	}

	rawBytes, err := sourceLifecycleRawBytes(request)
	if err != nil {
		return SourceEnvelope{}, SourceRevision{}, err
	}
	checksum := sha256.Sum256(rawBytes)
	checksumHex := hex.EncodeToString(checksum[:])
	contentHash := "sha256:" + checksumHex

	origin := request.Origin
	if origin.Method == "" {
		origin.Method = SourceOriginMethodGenerated
	}
	if strings.TrimSpace(origin.ContentType) == "" {
		origin.ContentType = strings.TrimSpace(request.RawArtifactContentType)
	}
	if origin.ByteLength == 0 && len(rawBytes) > 0 {
		origin.ByteLength = int64(len(rawBytes))
	}
	if strings.TrimSpace(origin.ContentHash) == "" {
		origin.ContentHash = contentHash
	}

	baseDir := service.sourceLifecycleBaseDir()
	revisionDir := filepath.Join(baseDir, sourceLifecycleDataPathID(sourceID), "revisions", sourceLifecycleDataPathID(revisionID))
	rawDir := filepath.Join(revisionDir, sourceLifecycleRawDir)
	if err := os.MkdirAll(rawDir, 0o755); err != nil {
		return SourceEnvelope{}, SourceRevision{}, err
	}
	rawArtifactID := strings.TrimSpace(request.RawArtifactID)
	if rawArtifactID == "" {
		rawArtifactID = "raw-source"
	}
	rawFileName := safeFilename(firstNonEmpty(request.RawArtifactFileName, rawArtifactID+sourceLifecycleRawExtension(origin.ContentType)))
	rawPath := filepath.Join(rawDir, rawFileName)
	if err := writeFileAtomicForSourceLifecycle(rawPath, rawBytes, 0o644); err != nil {
		return SourceEnvelope{}, SourceRevision{}, err
	}

	service.mu.RLock()
	previousEnvelope, hasPreviousEnvelope := service.sourceEnvelopes[sourceID]
	if hasPreviousEnvelope {
		previousEnvelope = cloneSourceEnvelope(previousEnvelope)
	}
	previousRevision := SourceRevision{}
	hasPreviousRevision := false
	if hasPreviousEnvelope && previousEnvelope.CurrentRevisionID != "" {
		previousRevision, hasPreviousRevision = service.sourceRevisions[previousEnvelope.CurrentRevisionID]
		if hasPreviousRevision {
			previousRevision = cloneSourceRevision(previousRevision)
		}
	}
	service.mu.RUnlock()

	revisionOrdinal := 1
	supersedesRevisionID := ""
	if hasPreviousEnvelope && previousEnvelope.CurrentRevisionID != "" && previousEnvelope.CurrentRevisionID != revisionID {
		supersedesRevisionID = previousEnvelope.CurrentRevisionID
		if hasPreviousRevision && previousRevision.RevisionOrdinal > 0 {
			revisionOrdinal = previousRevision.RevisionOrdinal + 1
		} else {
			revisionOrdinal = 2
		}
	}

	envelopeMetadata := cloneSourceLifecycleMetadata(request.Metadata)
	envelopeStatus := request.WorkStatus
	if envelopeStatus == "" {
		envelopeStatus = SourceLifecycleWorkStatusComplete
	}
	envelopeMetadata[sourceLifecycleWorkStatusMetadataKey] = string(envelopeStatus)

	revisionMetadata := cloneSourceLifecycleMetadata(request.RevisionMetadata)
	revisionStatus := request.RevisionWorkStatus
	if revisionStatus == "" {
		revisionStatus = envelopeStatus
	}
	revisionMetadata[sourceLifecycleWorkStatusMetadataKey] = string(revisionStatus)
	revisionMetadata["path"] = rawPath

	envelope := SourceEnvelope{
		SchemaVersion:      sourceEnvelopeSchemaVersion,
		SourceID:           sourceID,
		SourceKind:         sourceKind,
		Origin:             origin,
		ProjectID:          projectID,
		CreatedAt:          now,
		CurrentRevisionID:  revisionID,
		Lifecycle:          lifecycle,
		ExpiresAt:          request.ExpiresAt,
		PromotedToSourceID: strings.TrimSpace(request.PromotedToSourceID),
		Metadata:           envelopeMetadata,
	}
	if hasPreviousEnvelope && !previousEnvelope.CreatedAt.IsZero() {
		envelope.CreatedAt = previousEnvelope.CreatedAt
	}
	revision := SourceRevision{
		SchemaVersion:     sourceRevisionSchemaVersion,
		RevisionID:        revisionID,
		SourceID:          sourceID,
		CreatedAt:         now,
		RevisionOrdinal:   revisionOrdinal,
		RevisionState:     SourceRevisionStateCurrent,
		ContentHash:       contentHash,
		SourceFingerprint: contentHash,
		RawArtifact: SourceRawArtifact{
			ArtifactID:  rawArtifactID,
			URI:         rawPath,
			SHA256:      checksumHex,
			ContentType: firstNonEmpty(request.RawArtifactContentType, origin.ContentType),
			ByteLength:  int64(len(rawBytes)),
		},
		SupersedesRevisionID: supersedesRevisionID,
		Metadata:             revisionMetadata,
	}

	if err := service.writeSourceRevision(revision); err != nil {
		return SourceEnvelope{}, SourceRevision{}, err
	}
	if err := service.writeSourceEnvelope(envelope); err != nil {
		_ = service.removeSourceRevision(revision.SourceID, revision.RevisionID)
		return SourceEnvelope{}, SourceRevision{}, err
	}
	if supersedesRevisionID != "" && hasPreviousRevision {
		updatedPreviousRevision := cloneSourceRevision(previousRevision)
		updatedPreviousRevision.RevisionState = SourceRevisionStateSuperseded
		updatedPreviousRevision.SupersededByRevisionID = revisionID
		if err := service.writeSourceRevision(updatedPreviousRevision); err != nil {
			if hasPreviousEnvelope {
				_ = service.writeSourceEnvelope(previousEnvelope)
			}
			_ = service.removeSourceRevision(revision.SourceID, revision.RevisionID)
			return SourceEnvelope{}, SourceRevision{}, err
		}
		previousRevision = updatedPreviousRevision
	}

	service.mu.Lock()
	service.sourceEnvelopes[sourceID] = cloneSourceEnvelope(envelope)
	if supersedesRevisionID != "" && hasPreviousRevision {
		service.sourceRevisions[supersedesRevisionID] = cloneSourceRevision(previousRevision)
	}
	service.sourceRevisions[revisionID] = cloneSourceRevision(revision)
	service.mu.Unlock()

	publishSourceLifecycleCreatedEvent(service, envelope, revision)

	return cloneSourceEnvelope(envelope), cloneSourceRevision(revision), nil
}

func (service *Service) UpdateSourceLifecycleWorkStatus(sourceID string, revisionID string, status SourceLifecycleWorkStatus) error {
	cleanSourceID := strings.TrimSpace(sourceID)
	cleanRevisionID := strings.TrimSpace(revisionID)
	if cleanSourceID == "" || cleanRevisionID == "" || status == "" {
		return nil
	}
	service.mu.RLock()
	envelope, hasEnvelope := service.sourceEnvelopes[cleanSourceID]
	revision, hasRevision := service.sourceRevisions[cleanRevisionID]
	service.mu.RUnlock()
	if hasEnvelope {
		envelope = cloneSourceEnvelope(envelope)
		if envelope.Metadata == nil {
			envelope.Metadata = map[string]any{}
		}
		envelope.Metadata[sourceLifecycleWorkStatusMetadataKey] = string(status)
	}
	if hasRevision {
		revision = cloneSourceRevision(revision)
		if revision.Metadata == nil {
			revision.Metadata = map[string]any{}
		}
		revision.Metadata[sourceLifecycleWorkStatusMetadataKey] = string(status)
	}
	if hasRevision {
		if err := service.writeSourceRevision(revision); err != nil {
			return err
		}
	}
	if hasEnvelope {
		if err := service.writeSourceEnvelope(envelope); err != nil {
			if hasRevision {
				service.mu.RLock()
				oldRevision := cloneSourceRevision(service.sourceRevisions[cleanRevisionID])
				service.mu.RUnlock()
				_ = service.writeSourceRevision(oldRevision)
			}
			return err
		}
	}
	service.mu.Lock()
	if hasEnvelope {
		service.sourceEnvelopes[cleanSourceID] = cloneSourceEnvelope(envelope)
	}
	if hasRevision {
		service.sourceRevisions[cleanRevisionID] = cloneSourceRevision(revision)
	}
	service.mu.Unlock()
	if hasEnvelope && hasRevision {
		publishSourceLifecycleStatusEvent(service, envelope, revision, status)
	}
	return nil
}

func (service *Service) reloadSourceLifecycle() {
	baseDir := service.sourceLifecycleBaseDir()
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return
	}
	now := time.Now().UTC()
	envelopes := make(map[string]SourceEnvelope)
	revisions := make(map[string]SourceRevision)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		sourceDir := filepath.Join(baseDir, entry.Name())
		envelopePath := filepath.Join(sourceDir, sourceLifecycleEnvelopeFilename)
		metadataBytes, readErr := os.ReadFile(envelopePath)
		if readErr != nil {
			continue
		}
		var envelope SourceEnvelope
		if err := jsonUnmarshal(metadataBytes, &envelope); err != nil || strings.TrimSpace(envelope.SourceID) == "" {
			continue
		}
		candidateEnvelope := cloneSourceEnvelope(envelope)
		if markSourceEnvelopeInterrupted(&candidateEnvelope, now) {
			if err := writeJSONAtomicForSourceLifecycle(envelopePath, candidateEnvelope); err == nil {
				envelope = candidateEnvelope
			}
		}
		envelopes[envelope.SourceID] = cloneSourceEnvelope(envelope)

		revisionEntries, readRevisionsErr := os.ReadDir(filepath.Join(sourceDir, "revisions"))
		if readRevisionsErr != nil {
			continue
		}
		for _, revisionEntry := range revisionEntries {
			if !revisionEntry.IsDir() {
				continue
			}
			revisionPath := filepath.Join(sourceDir, "revisions", revisionEntry.Name(), sourceLifecycleRevisionFilename)
			revisionBytes, readRevisionErr := os.ReadFile(revisionPath)
			if readRevisionErr != nil {
				continue
			}
			var revision SourceRevision
			if err := jsonUnmarshal(revisionBytes, &revision); err != nil || strings.TrimSpace(revision.RevisionID) == "" {
				continue
			}
			candidateRevision := cloneSourceRevision(revision)
			if markSourceRevisionInterrupted(&candidateRevision, now) {
				if err := writeJSONAtomicForSourceLifecycle(revisionPath, candidateRevision); err == nil {
					revision = candidateRevision
				}
			}
			revisions[revision.RevisionID] = cloneSourceRevision(revision)
		}
	}
	service.mu.Lock()
	service.sourceEnvelopes = envelopes
	service.sourceRevisions = revisions
	service.mu.Unlock()
}

func (service *Service) writeSourceEnvelope(envelope SourceEnvelope) error {
	outputDir := filepath.Join(service.sourceLifecycleBaseDir(), sourceLifecycleDataPathID(envelope.SourceID))
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSONAtomicForSourceLifecycle(filepath.Join(outputDir, sourceLifecycleEnvelopeFilename), envelope)
}

func (service *Service) writeSourceRevision(revision SourceRevision) error {
	outputDir := filepath.Join(service.sourceLifecycleBaseDir(), sourceLifecycleDataPathID(revision.SourceID), "revisions", sourceLifecycleDataPathID(revision.RevisionID))
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSONAtomicForSourceLifecycle(filepath.Join(outputDir, sourceLifecycleRevisionFilename), revision)
}

func (service *Service) removeSourceRevision(sourceID string, revisionID string) error {
	return os.RemoveAll(filepath.Join(service.sourceLifecycleBaseDir(), sourceLifecycleDataPathID(sourceID), "revisions", sourceLifecycleDataPathID(revisionID)))
}

func (service *Service) sourceLifecycleBaseDir() string {
	baseDir, err := filepath.Abs(service.options.SourceLifecycleDataDir)
	if err != nil {
		return service.options.SourceLifecycleDataDir
	}
	return baseDir
}

func writeJSONAtomic(path string, payload interface{}) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tempFile, err := os.CreateTemp(dir, "."+filepath.Base(path)+"-*")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if err := writeJSON(tempPath, payload); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	return nil
}

func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tempFile, err := os.CreateTemp(dir, "."+filepath.Base(path)+"-*")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	if _, err := tempFile.Write(data); err != nil {
		_ = tempFile.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := tempFile.Chmod(perm); err != nil {
		_ = tempFile.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := tempFile.Close(); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	return nil
}

func sourceLifecycleDataPathID(id string) string {
	trimmed := strings.TrimSpace(id)
	cleaned := safeDataPathID(trimmed)
	if cleaned == "" {
		return "id-" + sourceLifecycleShortHash(trimmed)
	}
	if cleaned != trimmed {
		return cleaned + "-" + sourceLifecycleShortHash(trimmed)
	}
	return cleaned
}

func sourceLifecycleShortHash(value string) string {
	checksum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(checksum[:])[:12]
}

func sourceLifecycleRawBytes(request SourceLifecyclePersistRequest) ([]byte, error) {
	if request.RawBytes != nil {
		return append([]byte(nil), request.RawBytes...), nil
	}
	if request.RawText != "" {
		return []byte(request.RawText), nil
	}
	if strings.TrimSpace(request.RawPath) != "" {
		return os.ReadFile(request.RawPath)
	}
	return []byte{}, nil
}

func sourceLifecycleRawExtension(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "text/markdown", "text/x-markdown":
		return ".md"
	case "text/html", "application/xhtml+xml":
		return ".html"
	case "application/json":
		return ".json"
	case "text/plain", "":
		return ".txt"
	default:
		return ".bin"
	}
}

func markSourceEnvelopeInterrupted(envelope *SourceEnvelope, interruptedAt time.Time) bool {
	if envelope == nil || !sourceLifecycleWorkStatusIsActive(metadataWorkStatus(envelope.Metadata)) {
		return false
	}
	if envelope.Metadata == nil {
		envelope.Metadata = map[string]any{}
	}
	envelope.Metadata[sourceLifecycleWorkStatusMetadataKey] = string(SourceLifecycleWorkStatusInterruptedRetriable)
	envelope.Metadata[sourceLifecycleInterruptedAtMetadataKey] = interruptedAt.Format(time.RFC3339Nano)
	envelope.Metadata[sourceLifecycleInterruptedReasonMetadataKey] = "service startup detected orphaned active source work"
	return true
}

func markSourceRevisionInterrupted(revision *SourceRevision, interruptedAt time.Time) bool {
	if revision == nil || !sourceLifecycleWorkStatusIsActive(metadataWorkStatus(revision.Metadata)) {
		return false
	}
	if revision.Metadata == nil {
		revision.Metadata = map[string]any{}
	}
	revision.Metadata[sourceLifecycleWorkStatusMetadataKey] = string(SourceLifecycleWorkStatusInterruptedRetriable)
	revision.Metadata[sourceLifecycleInterruptedAtMetadataKey] = interruptedAt.Format(time.RFC3339Nano)
	revision.Metadata[sourceLifecycleInterruptedReasonMetadataKey] = "service startup detected orphaned active source revision work"
	return true
}

func metadataWorkStatus(metadata map[string]any) SourceLifecycleWorkStatus {
	if len(metadata) == 0 {
		return ""
	}
	if value, ok := metadata[sourceLifecycleWorkStatusMetadataKey].(string); ok {
		return SourceLifecycleWorkStatus(value)
	}
	return ""
}

func sourceLifecycleWorkStatusIsActive(status SourceLifecycleWorkStatus) bool {
	switch status {
	case SourceLifecycleWorkStatusQueued, SourceLifecycleWorkStatusRunning:
		return true
	default:
		return false
	}
}

func cloneSourceEnvelope(envelope SourceEnvelope) SourceEnvelope {
	envelope.Metadata = cloneSourceLifecycleMetadata(envelope.Metadata)
	if envelope.ExpiresAt != nil {
		expiresAt := *envelope.ExpiresAt
		envelope.ExpiresAt = &expiresAt
	}
	return envelope
}

func cloneSourceRevision(revision SourceRevision) SourceRevision {
	revision.Metadata = cloneSourceLifecycleMetadata(revision.Metadata)
	return revision
}

func cloneSourceLifecycleMetadata(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func sourceLifecycleRequestFromPreparedSource(source PreparedSource, rawText string, rawBytes []byte, status SourceLifecycleWorkStatus) SourceLifecyclePersistRequest {
	method := SourceOriginMethodPaste
	uri := ""
	if source.Kind == PreparedSourceKindURL {
		method = SourceOriginMethodURL
		uri = source.SourceURL
	} else if source.Kind == PreparedSourceKindFile {
		method = SourceOriginMethodUpload
	}
	contentType := firstNonEmpty(source.SourceContentType, "text/plain")
	return SourceLifecyclePersistRequest{
		SourceID:   source.ID,
		RevisionID: source.ID + "-rev",
		ProjectID:  source.ProjectID,
		SourceKind: SourceEnvelopeKindProject,
		Lifecycle:  SourceEnvelopeLifecycleActive,
		Origin: SourceOrigin{
			Method:      method,
			URI:         uri,
			FileName:    source.SourceName,
			ContentType: contentType,
			ByteLength:  int64(len(rawBytes)),
		},
		RawText:                rawText,
		RawBytes:               rawBytes,
		RawArtifactContentType: contentType,
		RawArtifactFileName:    source.SourceName,
		WorkStatus:             status,
	}
}

func sourceLifecycleRequestFromTemporarySource(session TemporarySourceSession, rawText string, rawBytes []byte, status SourceLifecycleWorkStatus) SourceLifecyclePersistRequest {
	method := SourceOriginMethodPaste
	uri := ""
	if PreparedSourceKind(session.Kind) == PreparedSourceKindURL {
		method = SourceOriginMethodURL
		uri = session.SourceURL
	} else if PreparedSourceKind(session.Kind) == PreparedSourceKindFile {
		method = SourceOriginMethodUpload
	}
	contentType := firstNonEmpty(session.SourceContentType, "text/plain")
	if rawBytes == nil {
		rawBytes = []byte(rawText)
	}
	return SourceLifecyclePersistRequest{
		SourceID:   session.ID,
		RevisionID: session.ID + "-rev",
		ProjectID:  defaultProjectID,
		SourceKind: SourceEnvelopeKindQuickListenTemporary,
		Lifecycle:  SourceEnvelopeLifecycleTemporary,
		ExpiresAt:  &session.ExpiresAt,
		Origin: SourceOrigin{
			Method:      method,
			URI:         uri,
			FileName:    session.SourceName,
			ContentType: contentType,
			ByteLength:  int64(len(rawBytes)),
		},
		RawText:                rawText,
		RawBytes:               append([]byte(nil), rawBytes...),
		RawArtifactContentType: contentType,
		RawArtifactFileName:    session.SourceName,
		WorkStatus:             status,
	}
}
