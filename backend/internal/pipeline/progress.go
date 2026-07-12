package pipeline

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

const (
	durableProgressSchemaVersion   = "durable-progress.v1"
	resumeResolutionSchemaVersion  = "resume-resolution.v1"
	durableProgressDirName         = "durable"
	durableProgressRemapConfidence = 0.8
)

var writeJSONAtomicForDurableProgress = writeJSONAtomic

func (service *Service) ListProjectProgress(projectID string) ([]PlaybackProgress, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return nil, err
	}
	service.mu.RLock()
	items := make([]PlaybackProgress, 0)
	for _, progress := range service.progress {
		if progress.ProjectID == project.ID && !progress.Hidden {
			items = append(items, clonePlaybackProgress(progress))
		}
	}
	service.mu.RUnlock()
	sort.SliceStable(items, func(left int, right int) bool {
		return items[left].UpdatedAt.After(items[right].UpdatedAt)
	})
	return items, nil
}

func (service *Service) UpdatePlaybackProgress(targetID string, update PlaybackProgressUpdate) (PlaybackProgress, error) {
	targetID = strings.TrimSpace(targetID)
	if targetID == "" {
		targetID = strings.TrimSpace(update.TargetID)
	}
	if targetID == "" {
		return PlaybackProgress{}, fmt.Errorf("progress target id is required")
	}
	projectID := strings.TrimSpace(update.ProjectID)
	if projectID == "" {
		projectID = defaultProjectID
	}
	if _, err := service.GetProject(projectID); err != nil {
		return PlaybackProgress{}, err
	}

	now := time.Now().UTC()
	service.mu.RLock()
	progress, exists := service.progress[targetID]
	service.mu.RUnlock()
	if !exists {
		progress = PlaybackProgress{
			TargetID:  targetID,
			ProjectID: projectID,
			CreatedAt: now,
		}
	}
	progress.ProjectID = projectID
	if strings.TrimSpace(update.JobID) != "" {
		progress.JobID = strings.TrimSpace(update.JobID)
	}
	if strings.TrimSpace(update.BookSourceID) != "" {
		progress.BookSourceID = strings.TrimSpace(update.BookSourceID)
	}
	if strings.TrimSpace(update.PreparedSourceID) != "" {
		progress.PreparedSourceID = strings.TrimSpace(update.PreparedSourceID)
	}
	if update.BookScope != nil {
		progress.BookScope = cloneBookScope(update.BookScope)
	}
	if update.CurrentTimeSec >= 0 {
		progress.CurrentTimeSec = update.CurrentTimeSec
	}
	if update.DurationSec > 0 {
		progress.Progress = clampFloat(progress.CurrentTimeSec/update.DurationSec, 0, 1)
	} else if update.Progress >= 0 {
		progress.Progress = clampFloat(update.Progress, 0, 1)
	}
	if update.ActiveWordIndex >= 0 {
		progress.ActiveWordIndex = update.ActiveWordIndex
	}
	if update.ReadingPosition != nil {
		progress.ReadingPosition = cloneReadingPosition(update.ReadingPosition)
	}
	if update.Hidden != nil {
		progress.Hidden = *update.Hidden
	}
	if progress.StartedAt == nil {
		startedAt := now
		progress.StartedAt = &startedAt
	}
	if update.Finished {
		progress.Finished = true
		progress.Progress = 1
		finishedAt := now
		progress.FinishedAt = &finishedAt
	}
	if update.AddBookmark != nil {
		bookmark := *update.AddBookmark
		if strings.TrimSpace(bookmark.ID) == "" {
			bookmark.ID = newID()
		}
		if bookmark.CreatedAt.IsZero() {
			bookmark.CreatedAt = now
		}
		progress.Bookmarks = append(progress.Bookmarks, bookmark)
	}
	progress.UpdatedAt = now

	service.mu.Lock()
	service.progress[targetID] = progress
	service.mu.Unlock()
	if err := service.writePlaybackProgress(progress); err != nil {
		return PlaybackProgress{}, err
	}
	return clonePlaybackProgress(progress), nil
}

func (service *Service) StartPlaybackSession(update PlaybackProgressUpdate) (PlaybackSession, error) {
	targetID := strings.TrimSpace(update.TargetID)
	if targetID == "" {
		return PlaybackSession{}, fmt.Errorf("progress target id is required")
	}
	projectID := strings.TrimSpace(update.ProjectID)
	if projectID == "" {
		projectID = defaultProjectID
	}
	if _, err := service.GetProject(projectID); err != nil {
		return PlaybackSession{}, err
	}
	now := time.Now().UTC()
	session := PlaybackSession{
		ID:               newID(),
		TargetID:         targetID,
		ProjectID:        projectID,
		JobID:            strings.TrimSpace(update.JobID),
		BookSourceID:     strings.TrimSpace(update.BookSourceID),
		PreparedSourceID: strings.TrimSpace(update.PreparedSourceID),
		BookScope:        cloneBookScope(update.BookScope),
		CurrentTimeSec:   update.CurrentTimeSec,
		ActiveWordIndex:  update.ActiveWordIndex,
		ReadingPosition:  cloneReadingPosition(update.ReadingPosition),
		Status:           PlaybackSessionStatusOpen,
		StartedAt:        now,
		UpdatedAt:        now,
	}
	service.mu.Lock()
	service.sessions[session.ID] = session
	service.mu.Unlock()
	if err := service.writePlaybackSession(session); err != nil {
		return PlaybackSession{}, err
	}
	_, _ = service.UpdatePlaybackProgress(targetID, update)
	return session, nil
}

func (service *Service) SyncPlaybackSession(id string, update PlaybackProgressUpdate) (PlaybackSession, error) {
	service.mu.RLock()
	session, ok := service.sessions[strings.TrimSpace(id)]
	service.mu.RUnlock()
	if !ok {
		return PlaybackSession{}, ErrPlaybackSessionNotFound
	}
	if session.Status == PlaybackSessionStatusClosed {
		return session, nil
	}
	session.CurrentTimeSec = update.CurrentTimeSec
	if update.ActiveWordIndex >= 0 {
		session.ActiveWordIndex = update.ActiveWordIndex
	}
	if update.ReadingPosition != nil {
		session.ReadingPosition = cloneReadingPosition(update.ReadingPosition)
	}
	session.UpdatedAt = time.Now().UTC()
	service.mu.Lock()
	service.sessions[session.ID] = session
	service.mu.Unlock()
	if err := service.writePlaybackSession(session); err != nil {
		return PlaybackSession{}, err
	}
	update.TargetID = session.TargetID
	update.ProjectID = session.ProjectID
	update.JobID = session.JobID
	update.BookSourceID = session.BookSourceID
	update.PreparedSourceID = session.PreparedSourceID
	update.BookScope = cloneBookScope(session.BookScope)
	update.ReadingPosition = cloneReadingPosition(session.ReadingPosition)
	_, _ = service.UpdatePlaybackProgress(session.TargetID, update)
	return session, nil
}

func (service *Service) ClosePlaybackSession(id string, update PlaybackProgressUpdate) (PlaybackSession, error) {
	session, err := service.SyncPlaybackSession(id, update)
	if err != nil {
		return PlaybackSession{}, err
	}
	now := time.Now().UTC()
	session.Status = PlaybackSessionStatusClosed
	session.ClosedAt = &now
	session.UpdatedAt = now
	service.mu.Lock()
	service.sessions[session.ID] = session
	service.mu.Unlock()
	if err := service.writePlaybackSession(session); err != nil {
		return PlaybackSession{}, err
	}
	return session, nil
}

func (service *Service) PersistDurableProgress(progress DurableProgress) (DurableProgress, error) {
	normalized, err := service.normalizeDurableProgress(progress)
	if err != nil {
		return DurableProgress{}, err
	}

	if !normalized.Canonical {
		if err := service.writeDurableProgress(normalized); err != nil {
			return DurableProgress{}, err
		}
		service.mu.Lock()
		service.durableProgress[normalized.ProgressID] = cloneDurableProgress(normalized)
		service.mu.Unlock()
		publishDurableProgressEvent(service, normalized)
		return cloneDurableProgress(normalized), nil
	}

	service.mu.Lock()
	var demoted []DurableProgress
	for _, existing := range service.durableProgress {
		if existing.ProgressID != normalized.ProgressID && durableProgressCanonicalContextMatches(existing, normalized) && existing.Canonical {
			existing.Canonical = false
			demoted = append(demoted, cloneDurableProgress(existing))
		}
	}
	sort.SliceStable(demoted, func(left int, right int) bool {
		return demoted[left].ProgressID < demoted[right].ProgressID
	})
	for _, previous := range demoted {
		if err := service.writeDurableProgress(previous); err != nil {
			service.mu.Unlock()
			return DurableProgress{}, err
		}
	}
	if err := service.writeDurableProgress(normalized); err != nil {
		service.mu.Unlock()
		return DurableProgress{}, err
	}

	for _, previous := range demoted {
		service.durableProgress[previous.ProgressID] = cloneDurableProgress(previous)
	}
	service.durableProgress[normalized.ProgressID] = cloneDurableProgress(normalized)
	service.mu.Unlock()
	publishDurableProgressEvent(service, normalized)
	return cloneDurableProgress(normalized), nil
}

func (service *Service) GetDurableProgress(progressID string) (DurableProgress, error) {
	cleanID := strings.TrimSpace(progressID)
	if cleanID == "" {
		return DurableProgress{}, ErrProgressNotFound
	}
	service.mu.RLock()
	progress, ok := service.durableProgress[cleanID]
	service.mu.RUnlock()
	if !ok {
		return DurableProgress{}, ErrProgressNotFound
	}
	return cloneDurableProgress(progress), nil
}

func (service *Service) GetCanonicalDurableProgress(sourceID string, readalongManifestID string, kind DurableProgressKind) (DurableProgress, error) {
	cleanSourceID := strings.TrimSpace(sourceID)
	cleanReadalongManifestID := strings.TrimSpace(readalongManifestID)
	if kind == "" {
		kind = DurableProgressKindResume
	}
	service.mu.RLock()
	items := make([]DurableProgress, 0)
	for _, progress := range service.durableProgress {
		if !progress.Canonical || progress.Kind != kind {
			continue
		}
		if cleanSourceID != "" && progress.SourceID != cleanSourceID {
			continue
		}
		if cleanReadalongManifestID != "" && progress.ReadalongManifestID != cleanReadalongManifestID {
			continue
		}
		items = append(items, cloneDurableProgress(progress))
	}
	service.mu.RUnlock()
	if len(items) == 0 {
		return DurableProgress{}, ErrProgressNotFound
	}
	sort.SliceStable(items, func(left int, right int) bool {
		if !items[left].UpdatedAt.Equal(items[right].UpdatedAt) {
			return items[left].UpdatedAt.After(items[right].UpdatedAt)
		}
		return items[left].ProgressID > items[right].ProgressID
	})
	return items[0], nil
}

func (service *Service) ResolveResumeProgress(request ResumeResolutionRequest) (ResumeResolution, error) {
	requestedAt := request.RequestedAt.UTC()
	if requestedAt.IsZero() {
		requestedAt = time.Now().UTC()
	}
	progress, err := service.resolveProgressForResume(request)
	if err != nil {
		return ResumeResolution{}, err
	}
	resolution := ResumeResolution{
		SchemaVersion:               resumeResolutionSchemaVersion,
		ResolutionID:                deterministicManifestID("resume", progress.ProgressID, requestedAt.Format(time.RFC3339Nano)),
		ProgressID:                  progress.ProgressID,
		SourceID:                    progress.SourceID,
		RequestedAt:                 requestedAt,
		ResolvedReadalongManifestID: progress.ReadalongManifestID,
		ResolvedLocatorEnvelope:     cloneLocatorEnvelope(progress.LocatorEnvelope),
	}
	if strings.TrimSpace(request.SourceID) != "" && strings.TrimSpace(request.SourceID) != progress.SourceID {
		return blockedResumeResolution(resolution, "requested source does not match durable progress source"), nil
	}
	if progress.LocatorEnvelope.SourceID != progress.SourceID {
		return blockedResumeResolution(resolution, "durable progress locator source does not match progress source"), nil
	}

	currentManifest, currentErr := service.resolveReadalongForResume(progress, request)
	if currentErr != nil || currentManifest.SourceID != progress.SourceID {
		return blockedResumeResolution(resolution, "current readalong manifest is missing or mismatched"), nil
	}
	resolution.ResolvedReadalongManifestID = currentManifest.ManifestID
	if !readalongManifestContainsUnit(currentManifest, progress.Position.UnitID) && progress.State != DurableProgressStateStale && progress.State != DurableProgressStateSuperseded {
		return blockedResumeResolution(resolution, "durable progress unit is not present in resolved readalong manifest"), nil
	}

	artifact := matchingResumeAudioArtifact(progress, currentManifest, request.AudioArtifacts)
	if retryArtifact(progress, artifact) {
		resolution.Decision = ResumeDecisionOfferRetry
		resolution.Reason = "progress or audio artifact is retryable"
		if artifact != nil {
			resolution.RetryArtifactID = artifact.ArtifactID
		} else {
			resolution.RetryArtifactID = progress.AudioArtifactID
		}
		return resolution, nil
	}
	if progress.State == DurableProgressStateFailed {
		return blockedResumeResolution(resolution, "durable progress is terminal failed"), nil
	}

	requiresRevisionMap := progress.State == DurableProgressStateStale || progress.State == DurableProgressStateSuperseded || progress.ReadalongManifestID != currentManifest.ManifestID || progress.SourceRevisionID != currentManifest.SourceRevisionID
	if requiresRevisionMap {
		revisionMaps := request.RevisionMaps
		if len(revisionMaps) == 0 {
			revisionMaps = service.revisionMapsForResume(progress, currentManifest)
		}
		mapped, ok, ambiguous := mapStaleProgress(progress, currentManifest, revisionMaps)
		if ok && !ambiguous {
			resolution.Decision = ResumeDecisionAutoResumeRemapped
			resolution.Reason = "stale progress remapped through revision map with high confidence"
			resolution.RevisionMapID = mapped.RevisionMapID
			resolution.StaleProgressID = progress.ProgressID
			resolution.ResolvedLocatorEnvelope = cloneLocatorEnvelope(mapped.ResolvedLocatorEnvelope)
			if mapped.ToUnitID != "" {
				resolution.Metadata = map[string]any{"mappedUnitId": mapped.ToUnitID}
			}
			return resolution, nil
		}
		resolution.Decision = ResumeDecisionOfferOldVsRepaired
		resolution.Reason = "stale or superseded progress cannot be remapped with unambiguous high confidence"
		resolution.Offers = []string{"resume_old_manifest", "open_repaired_manifest"}
		return resolution, nil
	}

	if progress.ReadalongManifestID == currentManifest.ManifestID && progress.SourceRevisionID == currentManifest.SourceRevisionID {
		resolution.ResolvedLocatorEnvelope = cloneLocatorEnvelope(progress.LocatorEnvelope)
		return resolveCurrentManifestResume(resolution, progress, currentManifest, artifact, request.SyncFidelityDecisions), nil
	}

	return blockedResumeResolution(resolution, "progress context is not compatible with the resolved manifest"), nil
}

func clonePlaybackProgress(progress PlaybackProgress) PlaybackProgress {
	progress.BookScope = cloneBookScope(progress.BookScope)
	progress.ReadingPosition = cloneReadingPosition(progress.ReadingPosition)
	if len(progress.Bookmarks) > 0 {
		bookmarks := make([]ProgressBookmark, len(progress.Bookmarks))
		copy(bookmarks, progress.Bookmarks)
		for index := range bookmarks {
			bookmarks[index].ReadingPosition = cloneReadingPosition(bookmarks[index].ReadingPosition)
		}
		progress.Bookmarks = bookmarks
	}
	return progress
}

func (service *Service) reloadProgress() {
	baseDir, err := filepath.Abs(service.options.ProgressDataDir)
	if err != nil {
		return
	}
	items := make(map[string]PlaybackProgress)
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), playbackProgressFilename))
		if readErr != nil {
			continue
		}
		var progress PlaybackProgress
		if err := jsonUnmarshal(metadataBytes, &progress); err != nil || progress.TargetID == "" {
			continue
		}
		items[progress.TargetID] = progress
	}
	service.mu.Lock()
	service.progress = items
	service.mu.Unlock()
}

func (service *Service) reloadDurableProgress() {
	baseDir, err := filepath.Abs(service.durableProgressBaseDir())
	if err != nil {
		return
	}
	items := make(map[string]DurableProgress)
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), playbackProgressFilename))
		if readErr != nil {
			continue
		}
		var progress DurableProgress
		if err := jsonUnmarshal(metadataBytes, &progress); err != nil || progress.ProgressID == "" {
			continue
		}
		if progress.UpdatedAt.IsZero() {
			progress.UpdatedAt = time.Unix(0, 0).UTC()
		}
		normalized, normalizeErr := service.normalizeDurableProgress(progress)
		if normalizeErr != nil {
			continue
		}
		items[normalized.ProgressID] = cloneDurableProgress(normalized)
	}
	items = service.reconcileDurableProgressCanonicalRecords(items)
	service.mu.Lock()
	service.durableProgress = items
	service.mu.Unlock()
}

func (service *Service) reconcileDurableProgressCanonicalRecords(items map[string]DurableProgress) map[string]DurableProgress {
	recordsByContext := make(map[durableProgressCanonicalKey][]DurableProgress)
	for _, progress := range items {
		key := durableProgressCanonicalContextKey(progress)
		recordsByContext[key] = append(recordsByContext[key], cloneDurableProgress(progress))
	}
	for _, records := range recordsByContext {
		canonicals := make([]DurableProgress, 0)
		for _, progress := range records {
			if progress.Canonical {
				canonicals = append(canonicals, cloneDurableProgress(progress))
			}
		}
		switch {
		case len(canonicals) == 0:
			sortDurableProgressCanonicalWinners(records)
			winner := records[0]
			winner.Canonical = true
			items[winner.ProgressID] = cloneDurableProgress(winner)
			_ = service.writeDurableProgress(winner)
		case len(canonicals) > 1:
			sortDurableProgressCanonicalWinners(canonicals)
			winnerID := canonicals[0].ProgressID
			for _, duplicate := range canonicals[1:] {
				duplicate.Canonical = false
				items[duplicate.ProgressID] = cloneDurableProgress(duplicate)
				_ = service.writeDurableProgress(duplicate)
			}
			winner := items[winnerID]
			if !winner.Canonical {
				winner.Canonical = true
				items[winner.ProgressID] = cloneDurableProgress(winner)
				_ = service.writeDurableProgress(winner)
			}
		}
	}
	return items
}

func (service *Service) reloadPlaybackSessions() {
	baseDir, err := filepath.Abs(service.options.PlaybackSessionDir)
	if err != nil {
		return
	}
	items := make(map[string]PlaybackSession)
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), playbackSessionFilename))
		if readErr != nil {
			continue
		}
		var session PlaybackSession
		if err := jsonUnmarshal(metadataBytes, &session); err != nil || session.ID == "" {
			continue
		}
		items[session.ID] = session
	}
	service.mu.Lock()
	service.sessions = items
	service.mu.Unlock()
}

func (service *Service) writePlaybackProgress(progress PlaybackProgress) error {
	outputDir, err := filepath.Abs(filepath.Join(service.options.ProgressDataDir, safeDataPathID(progress.TargetID)))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, playbackProgressFilename), progress)
}

func (service *Service) writePlaybackSession(session PlaybackSession) error {
	outputDir, err := filepath.Abs(filepath.Join(service.options.PlaybackSessionDir, safeDataPathID(session.ID)))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, playbackSessionFilename), session)
}

func (service *Service) normalizeDurableProgress(progress DurableProgress) (DurableProgress, error) {
	progress.SchemaVersion = firstNonEmpty(strings.TrimSpace(progress.SchemaVersion), durableProgressSchemaVersion)
	progress.ProgressID = strings.TrimSpace(progress.ProgressID)
	progress.SourceID = strings.TrimSpace(progress.SourceID)
	progress.SourceRevisionID = strings.TrimSpace(progress.SourceRevisionID)
	progress.ReadalongManifestID = strings.TrimSpace(progress.ReadalongManifestID)
	progress.AudioArtifactID = strings.TrimSpace(progress.AudioArtifactID)
	progress.Position.UnitID = strings.TrimSpace(progress.Position.UnitID)
	progress.Position.SegmentID = strings.TrimSpace(progress.Position.SegmentID)
	progress.Position.TextQuote = strings.TrimSpace(progress.Position.TextQuote)
	progress.LocatorEnvelope.SourceID = strings.TrimSpace(progress.LocatorEnvelope.SourceID)
	progress.LocatorEnvelope.Kind = strings.TrimSpace(progress.LocatorEnvelope.Kind)
	progress.LocatorEnvelope.NodeID = strings.TrimSpace(progress.LocatorEnvelope.NodeID)
	progress.LocatorEnvelope.ScopeKey = strings.TrimSpace(progress.LocatorEnvelope.ScopeKey)
	progress.LocatorEnvelope.TextQuote = strings.TrimSpace(progress.LocatorEnvelope.TextQuote)
	if progress.SchemaVersion != durableProgressSchemaVersion || progress.ProgressID == "" || progress.SourceID == "" || progress.SourceRevisionID == "" || progress.ReadalongManifestID == "" {
		return DurableProgress{}, fmt.Errorf("%w: progressId, sourceId, sourceRevisionId, and readalongManifestId are required", ErrDurableProgressInvalid)
	}
	if !validDurableProgressKind(progress.Kind) || !validDurableProgressState(progress.State) {
		return DurableProgress{}, fmt.Errorf("%w: unsupported durable progress kind or state", ErrDurableProgressInvalid)
	}
	if progress.UpdatedAt.IsZero() {
		progress.UpdatedAt = time.Now().UTC()
	} else {
		progress.UpdatedAt = progress.UpdatedAt.UTC()
	}
	if progress.LocatorEnvelope.SchemaVersion == "" {
		progress.LocatorEnvelope.SchemaVersion = "locator-envelope.v1"
	}
	if progress.LocatorEnvelope.SchemaVersion != "locator-envelope.v1" || progress.LocatorEnvelope.SourceID != progress.SourceID || progress.LocatorEnvelope.Kind != string(progress.Kind) || progress.Position.UnitID == "" {
		return DurableProgress{}, fmt.Errorf("%w: locator envelope and position must match progress source/kind and unit", ErrDurableProgressInvalid)
	}
	manifest, err := service.GetReadalongManifest(progress.ReadalongManifestID)
	if err != nil {
		return DurableProgress{}, fmt.Errorf("%w: readalong manifest is required for durable progress", ErrDurableProgressInvalid)
	}
	if manifest.SourceID != progress.SourceID || manifest.SourceRevisionID != progress.SourceRevisionID {
		return DurableProgress{}, fmt.Errorf("%w: durable progress source/revision does not match readalong manifest", ErrDurableProgressInvalid)
	}
	if !readalongManifestContainsUnit(manifest, progress.Position.UnitID) {
		return DurableProgress{}, fmt.Errorf("%w: durable progress position unit is not in readalong manifest", ErrDurableProgressInvalid)
	}
	if progress.AudioArtifactID != "" && !stringSliceContains(manifest.AudioArtifactIDs, progress.AudioArtifactID) {
		return DurableProgress{}, fmt.Errorf("%w: durable progress audio artifact is not in readalong manifest", ErrDurableProgressInvalid)
	}
	return cloneDurableProgress(progress), nil
}

func validDurableProgressKind(kind DurableProgressKind) bool {
	switch kind {
	case DurableProgressKindResume, DurableProgressKindBookmark, DurableProgressKindHighlight:
		return true
	default:
		return false
	}
}

func validDurableProgressState(state DurableProgressState) bool {
	switch state {
	case DurableProgressStateCurrent, DurableProgressStateDegraded, DurableProgressStateStale, DurableProgressStateSuperseded, DurableProgressStateFailed, DurableProgressStateInterruptedRetriable, DurableProgressStateRemapped:
		return true
	default:
		return false
	}
}

func durableProgressCanonicalContextMatches(left DurableProgress, right DurableProgress) bool {
	return left.SourceID == right.SourceID && left.ReadalongManifestID == right.ReadalongManifestID && left.Kind == right.Kind
}

type durableProgressCanonicalKey struct {
	sourceID            string
	readalongManifestID string
	kind                DurableProgressKind
}

func durableProgressCanonicalContextKey(progress DurableProgress) durableProgressCanonicalKey {
	return durableProgressCanonicalKey{
		sourceID:            progress.SourceID,
		readalongManifestID: progress.ReadalongManifestID,
		kind:                progress.Kind,
	}
}

func sortDurableProgressCanonicalWinners(items []DurableProgress) {
	sort.SliceStable(items, func(left int, right int) bool {
		if !items[left].UpdatedAt.Equal(items[right].UpdatedAt) {
			return items[left].UpdatedAt.After(items[right].UpdatedAt)
		}
		return items[left].ProgressID > items[right].ProgressID
	})
}

func (service *Service) resolveProgressForResume(request ResumeResolutionRequest) (DurableProgress, error) {
	if cleanID := strings.TrimSpace(request.ProgressID); cleanID != "" {
		return service.GetDurableProgress(cleanID)
	}
	manifestID := strings.TrimSpace(request.ReadalongManifestID)
	if manifestID == "" && strings.TrimSpace(request.SourceID) != "" && strings.TrimSpace(request.SourceRevisionID) != "" {
		if manifest, err := service.GetCurrentReadalongManifest(request.SourceID, request.SourceRevisionID); err == nil {
			manifestID = manifest.ManifestID
		}
	}
	return service.GetCanonicalDurableProgress(request.SourceID, manifestID, request.Kind)
}

func (service *Service) resolveReadalongForResume(progress DurableProgress, request ResumeResolutionRequest) (ReadalongManifest, error) {
	if cleanID := strings.TrimSpace(request.ReadalongManifestID); cleanID != "" {
		return service.GetReadalongManifest(cleanID)
	}
	revisionID := firstNonEmpty(strings.TrimSpace(request.SourceRevisionID), progress.SourceRevisionID)
	current, err := service.GetCurrentReadalongManifest(progress.SourceID, revisionID)
	if err == nil {
		return current, nil
	}
	return service.GetReadalongManifest(progress.ReadalongManifestID)
}

func resolveCurrentManifestResume(resolution ResumeResolution, progress DurableProgress, manifest ReadalongManifest, artifact *ResumeAudioArtifactEvidence, decisions []SyncFidelityDecision) ResumeResolution {
	if artifact != nil {
		switch artifact.State {
		case AudioArtifactStateStale, AudioArtifactStateReplaced:
			resolution.Decision = ResumeDecisionResumeSourceOnly
			resolution.Reason = "audio artifact is stale or replaced; source-only resume is safest"
			return resolution
		case AudioArtifactStateFailed:
			return blockedResumeResolution(resolution, "audio artifact evidence is failed or incompatible")
		}
	}
	if manifest.State == ManifestSnapshotStateSuperseded || manifest.State == ManifestSnapshotStateStale {
		return blockedResumeResolution(resolution, "readalong manifest is superseded or stale; revision-map remap is required")
	}
	if progress.State == DurableProgressStateDegraded || manifest.State == ManifestSnapshotStateDegraded {
		resolution.Decision = ResumeDecisionAutoResumeDegraded
		resolution.Reason = "progress or manifest is degraded; resume with degraded fidelity"
		return resolution
	}
	if progress.State == DurableProgressStateRemapped {
		resolution.Decision = ResumeDecisionAutoResumeRemapped
		resolution.Reason = "progress was already remapped onto the resolved manifest"
		resolution.StaleProgressID = strings.TrimSpace(progress.MetadataString("staleProgressId"))
		return resolution
	}
	decision := matchingSyncFidelityDecision(progress, manifest, decisions)
	if decision != nil {
		switch decision.Fidelity {
		case SyncFidelityExactWord:
			if decision.ExactAllowed && decision.Evidence.ArtifactCompatible && artifact != nil && artifact.State == AudioArtifactStateChecked {
				resolution.Decision = ResumeDecisionAutoResumeCurrent
				resolution.Reason = "progress manifest is current and checked audio is compatible"
				return resolution
			}
		case SyncFidelityPhrase, SyncFidelityBlock:
			resolution.Decision = ResumeDecisionAutoResumeDegraded
			resolution.Reason = firstNonEmpty(decision.FallbackReason, "sync fidelity is degraded but source/audio remain resumable")
			return resolution
		case SyncFidelityAudioOnly:
			resolution.Decision = ResumeDecisionResumeAudioOnly
			resolution.Reason = firstNonEmpty(decision.FallbackReason, "playable audio is available without trustworthy source sync")
			return resolution
		case SyncFidelitySourceOnly, SyncFidelityNone:
			resolution.Decision = ResumeDecisionResumeSourceOnly
			resolution.Reason = firstNonEmpty(decision.FallbackReason, "source reading is available without playable synced audio")
			return resolution
		}
	}
	if artifact != nil {
		switch artifact.State {
		case AudioArtifactStateChecked:
			resolution.Decision = ResumeDecisionAutoResumeCurrent
			resolution.Reason = "progress manifest is current and checked audio artifact evidence matches"
		case AudioArtifactStateUnchecked, AudioArtifactStateGenerating:
			resolution.Decision = ResumeDecisionAutoResumeDegraded
			resolution.Reason = "audio artifact is present but not checked; resume in degraded mode"
		case AudioArtifactStateStale, AudioArtifactStateReplaced:
			resolution.Decision = ResumeDecisionResumeSourceOnly
			resolution.Reason = "audio artifact is stale or replaced; source-only resume is safest"
		default:
			resolution = blockedResumeResolution(resolution, "audio artifact evidence is failed or incompatible")
		}
		return resolution
	}
	if progress.AudioArtifactID == "" {
		resolution.Decision = ResumeDecisionResumeSourceOnly
		resolution.Reason = "durable progress has no audio artifact; source-only resume is available"
		return resolution
	}
	return blockedResumeResolution(resolution, "checked audio or sync fidelity evidence is missing for current progress")
}

func blockedResumeResolution(resolution ResumeResolution, reason string) ResumeResolution {
	resolution.Decision = ResumeDecisionBlockedFailed
	resolution.Reason = reason
	return resolution
}

type mappedProgressResult struct {
	RevisionMapID           string
	ToUnitID                string
	ResolvedLocatorEnvelope contentir.LocatorEnvelope
}

func mapStaleProgress(progress DurableProgress, current ReadalongManifest, maps []RevisionMap) (mappedProgressResult, bool, bool) {
	var matched mappedProgressResult
	matchCount := 0
	for _, candidate := range maps {
		if strings.TrimSpace(candidate.SourceID) != progress.SourceID || strings.TrimSpace(candidate.FromSourceRevisionID) != progress.SourceRevisionID || strings.TrimSpace(candidate.ToSourceRevisionID) != current.SourceRevisionID || candidate.Confidence < durableProgressRemapConfidence {
			continue
		}
		if !revisionMapManifestEvidenceMatches(candidate, progress, current) {
			continue
		}
		if !progressMappingAllows(candidate, progress.ProgressID) {
			continue
		}
		for _, unitMapping := range candidate.UnitMappings {
			status := strings.TrimSpace(unitMapping.Status)
			if status == "" {
				status = "matched"
			}
			if unitMapping.FromUnitID != progress.Position.UnitID || unitMapping.Confidence < durableProgressRemapConfidence || (status != "matched" && status != "changed") || !readalongManifestContainsUnit(current, unitMapping.ToUnitID) {
				continue
			}
			locatorEnvelope, locatorOK, locatorAmbiguous := mappedLocatorEnvelope(candidate, progress, current)
			if locatorAmbiguous {
				matchCount += 2
				continue
			}
			if !locatorOK {
				continue
			}
			matched = mappedProgressResult{RevisionMapID: strings.TrimSpace(candidate.RevisionMapID), ToUnitID: strings.TrimSpace(unitMapping.ToUnitID), ResolvedLocatorEnvelope: locatorEnvelope}
			matchCount++
		}
	}
	return matched, matchCount == 1, matchCount > 1
}

func mappedLocatorEnvelope(revisionMap RevisionMap, progress DurableProgress, current ReadalongManifest) (contentir.LocatorEnvelope, bool, bool) {
	var matched contentir.LocatorEnvelope
	matchCount := 0
	for _, mapping := range revisionMap.LocatorMappings {
		status := strings.TrimSpace(mapping.Status)
		if status == "" {
			status = "matched"
		}
		if mapping.Confidence < durableProgressRemapConfidence || (status != "matched" && status != "changed") {
			continue
		}
		fromEnvelope, fromOK := revisionMapMappingFromEnvelope(mapping, progress)
		if !fromOK || !locatorEnvelopeMatchesProgress(fromEnvelope, progress) {
			continue
		}
		toEnvelope, toOK := revisionMapMappingToEnvelope(mapping, progress, current)
		if !toOK || !locatorEnvelopeMatchesCurrent(toEnvelope, progress, current) {
			continue
		}
		matched = cloneLocatorEnvelope(toEnvelope)
		matchCount++
	}
	return matched, matchCount == 1, matchCount > 1
}

func revisionMapMappingFromEnvelope(mapping RevisionMapLocatorMapping, progress DurableProgress) (contentir.LocatorEnvelope, bool) {
	if mapping.FromLocatorEnvelope != nil {
		return cloneLocatorEnvelope(*mapping.FromLocatorEnvelope), true
	}
	if mapping.FromLocator == nil {
		return contentir.LocatorEnvelope{}, false
	}
	envelope := cloneLocatorEnvelope(progress.LocatorEnvelope)
	locator := cloneLocator(*mapping.FromLocator)
	envelope.Locator = &locator
	return envelope, true
}

func revisionMapMappingToEnvelope(mapping RevisionMapLocatorMapping, progress DurableProgress, current ReadalongManifest) (contentir.LocatorEnvelope, bool) {
	if mapping.ToLocatorEnvelope != nil {
		envelope := cloneLocatorEnvelope(*mapping.ToLocatorEnvelope)
		if envelope.SchemaVersion == "" {
			envelope.SchemaVersion = contentir.LocatorEnvelopeVersion
		}
		return envelope, true
	}
	if mapping.ToLocator == nil {
		return contentir.LocatorEnvelope{}, false
	}
	envelope := cloneLocatorEnvelope(progress.LocatorEnvelope)
	envelope.SchemaVersion = contentir.LocatorEnvelopeVersion
	envelope.SourceID = current.SourceID
	envelope.Kind = string(progress.Kind)
	locator := cloneLocator(*mapping.ToLocator)
	envelope.Locator = &locator
	return envelope, true
}

func locatorEnvelopeMatchesProgress(envelope contentir.LocatorEnvelope, progress DurableProgress) bool {
	if strings.TrimSpace(envelope.SchemaVersion) != "" && strings.TrimSpace(envelope.SchemaVersion) != contentir.LocatorEnvelopeVersion {
		return false
	}
	if strings.TrimSpace(envelope.SourceID) != progress.SourceID || strings.TrimSpace(envelope.Kind) != string(progress.Kind) {
		return false
	}
	if envelope.Locator == nil || progress.LocatorEnvelope.Locator == nil {
		return false
	}
	return locatorsEqual(*envelope.Locator, *progress.LocatorEnvelope.Locator)
}

func locatorEnvelopeMatchesCurrent(envelope contentir.LocatorEnvelope, progress DurableProgress, current ReadalongManifest) bool {
	if strings.TrimSpace(envelope.SchemaVersion) != "" && strings.TrimSpace(envelope.SchemaVersion) != contentir.LocatorEnvelopeVersion {
		return false
	}
	if strings.TrimSpace(envelope.SourceID) != current.SourceID || strings.TrimSpace(envelope.Kind) != string(progress.Kind) {
		return false
	}
	return envelope.Locator != nil
}

func locatorsEqual(left contentir.Locator, right contentir.Locator) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	if leftErr != nil || rightErr != nil {
		return false
	}
	return string(leftJSON) == string(rightJSON)
}

func cloneLocator(locator contentir.Locator) contentir.Locator {
	var cloned contentir.Locator
	data, err := json.Marshal(locator)
	if err != nil {
		return locator
	}
	if err := json.Unmarshal(data, &cloned); err != nil {
		return locator
	}
	return cloned
}

func revisionMapManifestEvidenceMatches(revisionMap RevisionMap, progress DurableProgress, current ReadalongManifest) bool {
	if revisionMap.Cause != RevisionMapCauseRepairOverlay && strings.TrimSpace(revisionMap.OverlayID) == "" {
		return true
	}
	if strings.TrimSpace(revisionMap.OverlayID) == "" {
		return false
	}
	fromReadalongManifestID := metadataString(revisionMap.Metadata, "fromReadalongManifestId")
	toReadalongManifestID := metadataString(revisionMap.Metadata, "toReadalongManifestId")
	if fromReadalongManifestID == "" || toReadalongManifestID == "" {
		return false
	}
	return fromReadalongManifestID == progress.ReadalongManifestID && toReadalongManifestID == current.ManifestID
}

func progressMappingAllows(revisionMap RevisionMap, progressID string) bool {
	if len(revisionMap.ProgressMappings) == 0 {
		return revisionMap.Cause != RevisionMapCauseRepairOverlay && strings.TrimSpace(revisionMap.OverlayID) == ""
	}
	for _, mapping := range revisionMap.ProgressMappings {
		if strings.TrimSpace(mapping.FromProgressID) == progressID && mapping.Confidence >= durableProgressRemapConfidence && strings.TrimSpace(mapping.ToProgressID) != "" {
			return true
		}
	}
	return false
}

func matchingResumeAudioArtifact(progress DurableProgress, manifest ReadalongManifest, artifacts []ResumeAudioArtifactEvidence) *ResumeAudioArtifactEvidence {
	if progress.AudioArtifactID == "" {
		return nil
	}
	for index := range artifacts {
		artifact := &artifacts[index]
		if strings.TrimSpace(artifact.ArtifactID) != progress.AudioArtifactID {
			continue
		}
		if artifact.SourceID == progress.SourceID && artifact.SourceRevisionID == manifest.SourceRevisionID && artifact.ReadalongManifestID == manifest.ManifestID && stringSliceContains(manifest.AudioArtifactIDs, artifact.ArtifactID) && resumeAudioArtifactUnitMatches(progress, *artifact) {
			return artifact
		}
	}
	return nil
}

func resumeAudioArtifactUnitMatches(progress DurableProgress, artifact ResumeAudioArtifactEvidence) bool {
	if strings.TrimSpace(artifact.UnitID) == "" || strings.TrimSpace(artifact.UnitID) != progress.Position.UnitID {
		return false
	}
	if strings.TrimSpace(progress.Position.SegmentID) != "" {
		return strings.TrimSpace(artifact.SegmentID) == progress.Position.SegmentID
	}
	if artifact.Retry != nil && artifact.Retry.Scope == AudioArtifactRetryScopeSegment {
		return strings.TrimSpace(artifact.SegmentID) != ""
	}
	return true
}

func matchingSyncFidelityDecision(progress DurableProgress, manifest ReadalongManifest, decisions []SyncFidelityDecision) *SyncFidelityDecision {
	for index := range decisions {
		decision := &decisions[index]
		if decision.SourceID != progress.SourceID || decision.SourceRevisionID != manifest.SourceRevisionID || decision.ReadalongManifestID != manifest.ManifestID {
			continue
		}
		if progress.AudioArtifactID != "" && decision.AudioArtifactID != progress.AudioArtifactID {
			continue
		}
		return decision
	}
	return nil
}

func retryArtifact(progress DurableProgress, artifact *ResumeAudioArtifactEvidence) bool {
	if progress.State == DurableProgressStateInterruptedRetriable {
		return true
	}
	if artifact == nil {
		return false
	}
	if artifact.State == AudioArtifactStateRetryable || artifact.State == AudioArtifactStateInterruptedRetriable {
		return true
	}
	return artifact.Retry != nil && artifact.Retry.Retryable
}

func readalongManifestContainsUnit(manifest ReadalongManifest, unitID string) bool {
	return stringSliceContains(manifest.UnitIDs, unitID)
}

func stringSliceContains(values []string, target string) bool {
	cleanTarget := strings.TrimSpace(target)
	if cleanTarget == "" {
		return false
	}
	for _, value := range values {
		if strings.TrimSpace(value) == cleanTarget {
			return true
		}
	}
	return false
}

func cloneDurableProgress(progress DurableProgress) DurableProgress {
	progress.LocatorEnvelope = cloneLocatorEnvelope(progress.LocatorEnvelope)
	progress.Metadata = cloneManifestMetadata(progress.Metadata)
	return progress
}

func cloneLocatorEnvelope(envelope contentir.LocatorEnvelope) contentir.LocatorEnvelope {
	var cloned contentir.LocatorEnvelope
	data, err := json.Marshal(envelope)
	if err != nil {
		return envelope
	}
	if err := json.Unmarshal(data, &cloned); err != nil {
		return envelope
	}
	return cloned
}

func (progress DurableProgress) MetadataString(key string) string {
	if progress.Metadata == nil {
		return ""
	}
	value, _ := progress.Metadata[key].(string)
	return strings.TrimSpace(value)
}

func (service *Service) writeDurableProgress(progress DurableProgress) error {
	outputDir, err := filepath.Abs(filepath.Join(service.options.ProgressDataDir, durableProgressDirName, safeDataPathID(progress.ProgressID)))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSONAtomicForDurableProgress(filepath.Join(outputDir, playbackProgressFilename), progress)
}

func (service *Service) durableProgressBaseDir() string {
	return filepath.Join(service.options.ProgressDataDir, durableProgressDirName)
}

func publishDurableProgressEvent(service *Service, progress DurableProgress) {
	service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          progress.SourceID,
		OccurredAt:        progress.UpdatedAt,
		EventType:         SourceManifestEventProgressUpdated,
		SnapshotAvailable: true,
		Subject: SourceManifestEventSubject{
			SourceRevisionID:    progress.SourceRevisionID,
			ReadalongManifestID: progress.ReadalongManifestID,
			AudioArtifactID:     progress.AudioArtifactID,
			ProgressID:          progress.ProgressID,
			State:               string(progress.State),
		},
		SnapshotManifestID: progress.ReadalongManifestID,
		Metadata: map[string]any{
			"kind":      string(progress.Kind),
			"canonical": progress.Canonical,
		},
	})
}

func safeDataPathID(id string) string {
	replacer := strings.NewReplacer("/", "_", "\\", "_", ":", "_", " ", "_")
	return strings.Trim(replacer.Replace(id), "._")
}

func clampFloat(value float64, minValue float64, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}
