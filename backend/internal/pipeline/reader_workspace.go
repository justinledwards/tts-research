package pipeline

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

const (
	ReaderWorkspaceSchemaVersion = "reader_workspace_snapshot.v1"
	readerWorkspaceFilename      = "reader-workspace.json"
	readerWorkspaceMaxBytes      = 64 * 1024
	readerWorkspaceMaxJSONInt    = int64(1<<53 - 1)
	readerWorkspaceMaxRate       = 4.0
)

var (
	ErrReaderWorkspaceInvalid = errors.New("reader workspace snapshot is invalid")
	ErrReaderWorkspaceStale   = errors.New("reader workspace precondition is stale")
)

// ReaderWorkspaceSnapshot is the bounded server-authoritative restoration projection.
// Compatibility fields are always recomputed from pipeline state and never trusted from a client.
type ReaderWorkspaceSnapshot struct {
	SchemaVersion        string                     `json:"schemaVersion"`
	ProjectID            string                     `json:"projectId"`
	ProjectRevision      uint64                     `json:"projectRevision"`
	ReadMode             string                     `json:"readMode"`
	SourceID             string                     `json:"sourceId"`
	SourceRevisionID     string                     `json:"sourceRevisionId"`
	SourceContentHash    string                     `json:"sourceContentHash"`
	RunID                *string                    `json:"runId"`
	RunCompatibilityKey  *string                    `json:"runCompatibilityKey"`
	MediaManifestVersion *uint64                    `json:"mediaManifestVersion"`
	TimingRevision       *uint64                    `json:"timingRevision"`
	SyncFidelity         *SyncFidelity              `json:"syncFidelity"`
	ReaderLocator        *contentir.LocatorEnvelope `json:"readerLocator"`
	PlaybackCursorMS     *int64                     `json:"playbackCursorMs"`
	PlaybackRate         *float64                   `json:"playbackRate"`
	FollowPreference     *bool                      `json:"followPreference"`
	UpdatedAt            time.Time                  `json:"updatedAt"`
}

// ReaderWorkspaceReadProjection is the minimum public pipeline evidence needed
// to explain source/run compatibility without exposing mutable internals.
type ReaderWorkspaceReadProjection struct {
	ProjectID            string       `json:"projectId"`
	SourceID             string       `json:"sourceId,omitempty"`
	SourceRevisionID     string       `json:"sourceRevisionId,omitempty"`
	SourceContentHash    string       `json:"sourceContentHash,omitempty"`
	SourceReady          bool         `json:"sourceReady"`
	RunID                string       `json:"runId,omitempty"`
	RunCompleted         bool         `json:"runCompleted"`
	RunCompatibilityKey  string       `json:"runCompatibilityKey,omitempty"`
	MediaManifestVersion uint64       `json:"mediaManifestVersion,omitempty"`
	TimingRevision       uint64       `json:"timingRevision,omitempty"`
	SyncFidelity         SyncFidelity `json:"syncFidelity"`
}

type ReaderWorkspaceWriteCondition struct {
	IfMatch     string
	IfNoneMatch bool
}

type ReaderWorkspaceResult struct {
	Snapshot  ReaderWorkspaceSnapshot
	ETag      string
	Persisted bool
}

func (service *Service) GetReaderWorkspace(projectID string) (ReaderWorkspaceResult, error) {
	cleanID, err := service.readerWorkspaceProjectID(projectID)
	if err != nil {
		return ReaderWorkspaceResult{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.readerWorkspaceCurrentLocked(cleanID)
}

func (service *Service) PutReaderWorkspace(projectID string, requested ReaderWorkspaceSnapshot, condition ReaderWorkspaceWriteCondition) (ReaderWorkspaceResult, error) {
	cleanID, err := service.readerWorkspaceProjectID(projectID)
	if err != nil {
		return ReaderWorkspaceResult{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	current, err := service.readerWorkspaceCurrentLocked(cleanID)
	if err != nil {
		return ReaderWorkspaceResult{}, err
	}
	if condition.IfNoneMatch {
		if current.Persisted {
			return current, ErrReaderWorkspaceStale
		}
	} else if strings.TrimSpace(condition.IfMatch) == "" || condition.IfMatch != current.ETag {
		return current, ErrReaderWorkspaceStale
	}
	requested.ProjectID = cleanID
	requested.ProjectRevision = current.Snapshot.ProjectRevision + 1
	requested.SchemaVersion = ReaderWorkspaceSchemaVersion
	requested.UpdatedAt = time.Now().UTC()
	validated, err := service.validateReaderWorkspaceLocked(requested)
	if err != nil {
		return current, err
	}
	if err := writeReaderWorkspaceAtomic(service.readerWorkspacePath(cleanID), validated); err != nil {
		return current, err
	}
	return ReaderWorkspaceResult{Snapshot: validated, ETag: readerWorkspaceETag(validated), Persisted: true}, nil
}

func (service *Service) ReaderWorkspaceProjection(projectID, sourceID, runID string) (ReaderWorkspaceReadProjection, error) {
	cleanID, err := service.readerWorkspaceProjectID(projectID)
	if err != nil {
		return ReaderWorkspaceReadProjection{}, err
	}
	service.mu.RLock()
	defer service.mu.RUnlock()
	return service.readerWorkspaceProjectionLocked(cleanID, strings.TrimSpace(sourceID), strings.TrimSpace(runID)), nil
}

func (service *Service) readerWorkspaceCurrentLocked(projectID string) (ReaderWorkspaceResult, error) {
	path := service.readerWorkspacePath(projectID)
	payload, err := readBoundedFile(path, readerWorkspaceMaxBytes)
	if err == nil {
		var raw struct {
			SchemaVersion string `json:"schemaVersion"`
		}
		if json.Unmarshal(payload, &raw) != nil {
			return ReaderWorkspaceResult{}, fmt.Errorf("%w: malformed persisted JSON", ErrReaderWorkspaceInvalid)
		}
		var snapshot ReaderWorkspaceSnapshot
		switch raw.SchemaVersion {
		case "", "reader_workspace_snapshot.v0":
			snapshot, err = service.migrateReaderWorkspaceV0Locked(projectID, payload)
		case ReaderWorkspaceSchemaVersion:
			err = json.Unmarshal(payload, &snapshot)
		default:
			err = fmt.Errorf("%w: unsupported schema version", ErrReaderWorkspaceInvalid)
		}
		if err != nil {
			return ReaderWorkspaceResult{}, err
		}
		if snapshot.ProjectID != projectID {
			return ReaderWorkspaceResult{}, fmt.Errorf("%w: project mismatch", ErrReaderWorkspaceInvalid)
		}
		snapshot = service.restoreReaderWorkspaceLocked(snapshot)
		return ReaderWorkspaceResult{Snapshot: snapshot, ETag: readerWorkspaceETag(snapshot), Persisted: true}, nil
	}
	if !os.IsNotExist(err) {
		return ReaderWorkspaceResult{}, err
	}
	snapshot := service.fallbackReaderWorkspaceLocked(projectID)
	return ReaderWorkspaceResult{Snapshot: snapshot, ETag: readerWorkspaceETag(snapshot)}, nil
}

func (service *Service) migrateReaderWorkspaceV0Locked(projectID string, payload []byte) (ReaderWorkspaceSnapshot, error) {
	var legacy struct {
		ProjectID        string          `json:"projectId"`
		SourceID         string          `json:"sourceId"`
		RunID            string          `json:"runId"`
		ReaderLocator    json.RawMessage `json:"readerLocator"`
		PlaybackCursorMS int64           `json:"playbackCursorMs"`
		UpdatedAt        time.Time       `json:"updatedAt"`
	}
	if err := json.Unmarshal(payload, &legacy); err != nil {
		return ReaderWorkspaceSnapshot{}, fmt.Errorf("%w: malformed v0 JSON", ErrReaderWorkspaceInvalid)
	}
	if legacy.ProjectID != "" && legacy.ProjectID != projectID {
		return ReaderWorkspaceSnapshot{}, fmt.Errorf("%w: project mismatch", ErrReaderWorkspaceInvalid)
	}
	projection := service.readerWorkspaceProjectionLocked(projectID, legacy.SourceID, legacy.RunID)
	snapshot := snapshotFromProjection(projection, 0)
	if len(legacy.ReaderLocator) > 0 && string(legacy.ReaderLocator) != "null" {
		var locator contentir.LocatorEnvelope
		if err := json.Unmarshal(legacy.ReaderLocator, &locator); err == nil {
			snapshot.ReaderLocator = &locator
		}
	}
	snapshot.PlaybackCursorMS = pointer(legacy.PlaybackCursorMS)
	snapshot.UpdatedAt = legacy.UpdatedAt
	if snapshot.UpdatedAt.IsZero() {
		snapshot.UpdatedAt = time.Unix(0, 0).UTC()
	}
	return service.restoreReaderWorkspaceLocked(snapshot), nil
}

func (service *Service) restoreReaderWorkspaceLocked(saved ReaderWorkspaceSnapshot) ReaderWorkspaceSnapshot {
	revision := saved.ProjectRevision
	projection := service.readerWorkspaceProjectionLocked(saved.ProjectID, saved.SourceID, stringValue(saved.RunID))
	if !projection.SourceReady || saved.SourceRevisionID != "" && saved.SourceRevisionID != projection.SourceRevisionID || saved.SourceContentHash != "" && saved.SourceContentHash != projection.SourceContentHash {
		fallback := service.fallbackReaderWorkspaceLocked(saved.ProjectID)
		fallback.ProjectRevision = revision
		fallback.UpdatedAt = saved.UpdatedAt
		return fallback
	}
	result := snapshotFromProjection(projection, revision)
	result.PlaybackRate = pointer(normalizePlaybackRate(floatValue(saved.PlaybackRate)))
	result.FollowPreference = clonePointer(saved.FollowPreference)
	result.UpdatedAt = saved.UpdatedAt
	if result.UpdatedAt.IsZero() {
		result.UpdatedAt = time.Unix(0, 0).UTC()
	}
	result.ReaderLocator = cloneWorkspaceLocator(saved.ReaderLocator)
	result.PlaybackCursorMS = normalizedWorkspaceCursor(saved.PlaybackCursorMS)

	// A source-only checkpoint is independently useful and must not acquire an
	// incidental completed run during restore. An explicitly saved run, however,
	// must still be backed by the same completed server-compatible run.
	if saved.RunID == nil {
		clearWorkspaceRunBindings(&result)
	} else if !projection.RunCompleted || saved.RunCompatibilityKey != nil && stringValue(saved.RunCompatibilityKey) != projection.RunCompatibilityKey {
		clearWorkspaceRunBindings(&result)
		degradeWorkspaceCheckpoint(&result)
	}
	if !service.readerWorkspaceLocatorCompatibleLocked(projection.SourceID, saved.ReaderLocator) {
		clearWorkspaceRunBindings(&result)
		degradeWorkspaceCheckpoint(&result)
	}
	return result
}

func (service *Service) validateReaderWorkspaceLocked(requested ReaderWorkspaceSnapshot) (ReaderWorkspaceSnapshot, error) {
	locatorBytes, locatorErr := json.Marshal(requested.ReaderLocator)
	if locatorErr != nil || len(locatorBytes) > 16*1024 {
		return ReaderWorkspaceSnapshot{}, fmt.Errorf("%w: reader locator is invalid or too large", ErrReaderWorkspaceInvalid)
	}
	if requested.PlaybackCursorMS != nil && (*requested.PlaybackCursorMS < 0 || *requested.PlaybackCursorMS > readerWorkspaceMaxJSONInt) {
		return ReaderWorkspaceSnapshot{}, fmt.Errorf("%w: playback cursor must be between 0 and %d", ErrReaderWorkspaceInvalid, readerWorkspaceMaxJSONInt)
	}
	if requested.PlaybackRate != nil && !isValidPlaybackRate(*requested.PlaybackRate) {
		return ReaderWorkspaceSnapshot{}, fmt.Errorf("%w: playback rate must be finite, greater than 0, and at most %g", ErrReaderWorkspaceInvalid, readerWorkspaceMaxRate)
	}
	projection := service.readerWorkspaceProjectionLocked(requested.ProjectID, requested.SourceID, stringValue(requested.RunID))
	if requested.SourceID != "" && !projection.SourceReady {
		return ReaderWorkspaceSnapshot{}, fmt.Errorf("%w: source is not ready", ErrReaderWorkspaceInvalid)
	}
	validated := snapshotFromProjection(projection, requested.ProjectRevision)
	validated.ReaderLocator = cloneWorkspaceLocator(requested.ReaderLocator)
	if requested.PlaybackCursorMS != nil {
		validated.PlaybackCursorMS = clonePointer(requested.PlaybackCursorMS)
	}
	if requested.PlaybackRate != nil {
		validated.PlaybackRate = clonePointer(requested.PlaybackRate)
	}
	validated.FollowPreference = clonePointer(requested.FollowPreference)
	validated.UpdatedAt = requested.UpdatedAt
	if requested.RunID == nil {
		clearWorkspaceRunBindings(&validated)
	} else if !projection.RunCompleted {
		clearWorkspaceRunBindings(&validated)
		degradeWorkspaceCheckpoint(&validated)
	}
	if !service.readerWorkspaceLocatorCompatibleLocked(projection.SourceID, requested.ReaderLocator) {
		clearWorkspaceRunBindings(&validated)
		degradeWorkspaceCheckpoint(&validated)
	}
	encoded, err := json.Marshal(validated)
	if err != nil || len(encoded) > readerWorkspaceMaxBytes {
		return ReaderWorkspaceSnapshot{}, fmt.Errorf("%w: snapshot exceeds size limit", ErrReaderWorkspaceInvalid)
	}
	return validated, nil
}

func (service *Service) fallbackReaderWorkspaceLocked(projectID string) ReaderWorkspaceSnapshot {
	projection := service.readerWorkspaceProjectionLocked(projectID, "", "")
	return snapshotFromProjection(projection, 0)
}

func (service *Service) readerWorkspaceProjectionLocked(projectID, preferredSourceID, preferredRunID string) ReaderWorkspaceReadProjection {
	projection := ReaderWorkspaceReadProjection{ProjectID: projectID, SyncFidelity: SyncFidelitySourceOnly}
	type candidate struct {
		id, revision, hash string
		updated            time.Time
	}
	candidates := make([]candidate, 0)
	for _, source := range service.sourcePreps {
		if source.ProjectID == projectID && source.Status == PreparedSourceStatusReady {
			hash := readerWorkspaceHash(source.Text, source.SpeechText)
			candidates = append(candidates, candidate{source.ID, service.readerWorkspaceSourceRevisionLocked(source.ID, hash), hash, source.UpdatedAt})
		}
	}
	for _, stored := range service.books {
		source := stored.BookSource
		if source.ProjectID == projectID && source.Status == BookSourceStatusReady {
			hash := readerWorkspaceHash(source.Text)
			candidates = append(candidates, candidate{source.ID, service.readerWorkspaceSourceRevisionLocked(source.ID, hash), hash, source.UpdatedAt})
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].updated.After(candidates[j].updated) })
	chooseSource := func(id string) bool {
		for _, item := range candidates {
			if item.id == id {
				projection.SourceID, projection.SourceRevisionID, projection.SourceContentHash, projection.SourceReady = item.id, item.revision, item.hash, true
				return true
			}
		}
		return false
	}
	if preferredSourceID != "" {
		chooseSource(preferredSourceID)
	}

	type runCandidate struct {
		job     VoiceJob
		source  candidate
		updated time.Time
	}
	runs := make([]runCandidate, 0)
	for _, stored := range service.jobs {
		job := stored.VoiceJob
		if job.ProjectID != projectID || job.Status != JobStatusCompleted || (job.AudioURL == "" && job.AudioPath == "") {
			continue
		}
		sourceID := firstNonEmpty(job.PreparedSourceID, job.BookSourceID)
		for _, item := range candidates {
			// The durable job/source timestamps are the minimum truthful binding
			// available for legacy jobs: a run predating the current source fact
			// cannot be compatible with that revision.
			if item.id == sourceID && !job.CreatedAt.IsZero() && !job.CreatedAt.Before(item.updated) {
				runs = append(runs, runCandidate{job, item, job.UpdatedAt})
				break
			}
		}
	}
	sort.SliceStable(runs, func(i, j int) bool { return runs[i].updated.After(runs[j].updated) })
	var selected *runCandidate
	for index := range runs {
		if preferredRunID != "" && runs[index].job.ID == preferredRunID && (preferredSourceID == "" || runs[index].source.id == preferredSourceID) {
			selected = &runs[index]
			break
		}
	}
	if selected == nil && preferredRunID == "" {
		for index := range runs {
			if preferredSourceID == "" || runs[index].source.id == preferredSourceID {
				selected = &runs[index]
				break
			}
		}
	}
	if selected != nil {
		projection.SourceID, projection.SourceRevisionID, projection.SourceContentHash, projection.SourceReady = selected.source.id, selected.source.revision, selected.source.hash, true
		projection.RunID = selected.job.ID
		projection.RunCompleted = true
		projection.RunCompatibilityKey = readerWorkspaceHash(projectID, selected.source.id, selected.source.revision, selected.source.hash, selected.job.ID)
		projection.MediaManifestVersion = readerWorkspaceJSONHash(selected.job.PartialAudioManifest, selected.job.AudioURL, selected.job.DurationMS)
		projection.TimingRevision = readerWorkspaceJSONHash(selected.job.Timing)
		if selected.job.Timing != nil && selected.job.Timing.SyncFidelity != nil {
			projection.SyncFidelity = selected.job.Timing.SyncFidelity.Fidelity
		} else {
			projection.SyncFidelity = SyncFidelityAudioOnly
		}
	} else if !projection.SourceReady && len(candidates) > 0 {
		chooseSource(candidates[0].id)
	}
	if !projection.SourceReady {
		projection.SyncFidelity = SyncFidelityNone
	}
	return projection
}

func snapshotFromProjection(projection ReaderWorkspaceReadProjection, revision uint64) ReaderWorkspaceSnapshot {
	snapshot := ReaderWorkspaceSnapshot{
		SchemaVersion: ReaderWorkspaceSchemaVersion, ProjectID: projection.ProjectID, ProjectRevision: revision, ReadMode: "paused",
		SourceID: projection.SourceID, SourceRevisionID: projection.SourceRevisionID, SourceContentHash: projection.SourceContentHash,
		PlaybackRate: pointer(1.0), UpdatedAt: time.Unix(0, 0).UTC(),
	}
	fidelity := projection.SyncFidelity
	snapshot.SyncFidelity = &fidelity
	if projection.RunCompleted {
		snapshot.RunID = pointer(projection.RunID)
		snapshot.RunCompatibilityKey = pointer(projection.RunCompatibilityKey)
		snapshot.MediaManifestVersion = pointer(projection.MediaManifestVersion)
		snapshot.TimingRevision = pointer(projection.TimingRevision)
	}
	return snapshot
}

func clearWorkspaceRunBindings(snapshot *ReaderWorkspaceSnapshot) {
	snapshot.RunID = nil
	snapshot.RunCompatibilityKey = nil
	snapshot.MediaManifestVersion = nil
	snapshot.TimingRevision = nil
	fidelity := SyncFidelitySourceOnly
	if snapshot.SourceID == "" {
		fidelity = SyncFidelityNone
	}
	snapshot.SyncFidelity = &fidelity
}

func degradeWorkspaceCheckpoint(snapshot *ReaderWorkspaceSnapshot) {
	snapshot.ReaderLocator = nil
	snapshot.PlaybackCursorMS = pointer(int64(0))
}

func normalizedWorkspaceCursor(cursor *int64) *int64 {
	if cursor == nil {
		return nil
	}
	return pointer(clampCursor(*cursor))
}

func (service *Service) readerWorkspaceLocatorCompatibleLocked(sourceID string, locator *contentir.LocatorEnvelope) bool {
	if locator == nil {
		return true
	}
	if locator.SourceID != "" && locator.SourceID != sourceID {
		return false
	}
	if locator.NodeID == "" {
		return false
	}
	if source, ok := service.sourcePreps[sourceID]; ok {
		for _, block := range source.Blocks {
			if block.ID == locator.NodeID {
				return true
			}
		}
		return false
	}
	if stored, ok := service.books[sourceID]; ok {
		for _, section := range stored.Sections {
			if section.ID == locator.NodeID {
				return true
			}
		}
		for _, chapter := range stored.Chapters {
			if chapter.ID == locator.NodeID {
				return true
			}
		}
	}
	return false
}

func (service *Service) readerWorkspaceProjectID(id string) (string, error) {
	clean := strings.TrimSpace(id)
	if clean == "" {
		clean = defaultProjectID
	}
	if clean != filepath.Base(clean) || clean == "." || clean == ".." || strings.ContainsAny(clean, `/\\`) {
		return "", ErrProjectNotFound
	}
	service.mu.RLock()
	_, ok := service.projects[clean]
	service.mu.RUnlock()
	if !ok {
		return "", ErrProjectNotFound
	}
	return clean, nil
}

func (service *Service) readerWorkspacePath(projectID string) string {
	return filepath.Join(service.options.ProjectDataDir, projectID, readerWorkspaceFilename)
}

func (service *Service) readerWorkspaceSourceRevisionLocked(sourceID, contentHash string) string {
	if envelope, ok := service.sourceEnvelopes[sourceID]; ok && strings.TrimSpace(envelope.CurrentRevisionID) != "" {
		return envelope.CurrentRevisionID
	}
	return "source-" + contentHash[:16]
}

func readerWorkspaceETag(snapshot ReaderWorkspaceSnapshot) string {
	encoded, _ := json.Marshal(snapshot)
	sum := sha256.Sum256(encoded)
	return fmt.Sprintf("\"rw-%d-%s\"", snapshot.ProjectRevision, hex.EncodeToString(sum[:8]))
}

func readerWorkspaceHash(parts ...string) string {
	hash := sha256.New()
	for _, part := range parts {
		_, _ = io.WriteString(hash, part)
		_, _ = hash.Write([]byte{0})
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func readerWorkspaceJSONHash(values ...any) uint64 {
	payload, _ := json.Marshal(values)
	sum := sha256.Sum256(payload)
	return binary.BigEndian.Uint64(sum[:8]) & ((1 << 53) - 1)
}

func normalizePlaybackRate(rate float64) float64 {
	if !isValidPlaybackRate(rate) {
		return 1
	}
	return rate
}

func isValidPlaybackRate(rate float64) bool {
	return !math.IsNaN(rate) && !math.IsInf(rate, 0) && rate > 0 && rate <= readerWorkspaceMaxRate
}

func clampCursor(cursor int64) int64 {
	if cursor < 0 {
		return 0
	}
	return cursor
}

func pointer[T any](value T) *T {
	return &value
}

func clonePointer[T any](value *T) *T {
	if value == nil {
		return nil
	}
	return pointer(*value)
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func floatValue(value *float64) float64 {
	if value == nil {
		return 1
	}
	return *value
}

func int64Value(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}

func cloneWorkspaceLocator(value *contentir.LocatorEnvelope) *contentir.LocatorEnvelope {
	if value == nil {
		return nil
	}
	clone := cloneLocatorEnvelope(*value)
	return &clone
}

func readBoundedFile(path string, limit int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	payload, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(payload)) > limit {
		return nil, fmt.Errorf("%w: persisted snapshot exceeds size limit", ErrReaderWorkspaceInvalid)
	}
	return payload, nil
}

func writeReaderWorkspaceAtomic(path string, snapshot ReaderWorkspaceSnapshot) error {
	payload, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')
	if len(payload) > readerWorkspaceMaxBytes {
		return fmt.Errorf("%w: snapshot exceeds size limit", ErrReaderWorkspaceInvalid)
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	temp, err := os.CreateTemp(dir, ".reader-workspace-*")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if _, err = temp.Write(payload); err == nil {
		err = temp.Sync()
	}
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err := os.Rename(tempPath, path); err != nil {
		return err
	}
	directory, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
