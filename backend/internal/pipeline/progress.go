package pipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

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
