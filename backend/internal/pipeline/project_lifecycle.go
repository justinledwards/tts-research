package pipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var regexpInvalidDownloadFilename = regexp.MustCompile(`[^a-z0-9.-]+`)

func (service *Service) DeleteProject(id string) error {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		cleanID = defaultProjectID
	}
	if cleanID == defaultProjectID {
		return ErrProjectProtected
	}
	project, err := service.GetProject(cleanID)
	if err != nil {
		return err
	}
	if err := service.removeProjectJobs(cleanID); err != nil {
		return err
	}
	if err := service.removeProjectBookSources(cleanID); err != nil {
		return err
	}
	if err := service.removeProjectPreparedSources(cleanID); err != nil {
		return err
	}
	if err := service.removeProjectPlaybackState(cleanID); err != nil {
		return err
	}

	service.mu.Lock()
	delete(service.projects, cleanID)
	delete(service.projects, project.ID)
	for key, candidate := range service.projects {
		if candidate.ID == project.ID || key == cleanID || looksLikeProjectKeyAlias(key, project.ID) {
			delete(service.projects, key)
		}
	}
	service.mu.Unlock()
	return os.RemoveAll(filepath.Join(service.options.ProjectDataDir, project.ID))
}

func (service *Service) GetProjectStorageSummary(id string) (ProjectStorageSummary, error) {
	project, err := service.GetProject(id)
	if err != nil {
		return ProjectStorageSummary{}, err
	}
	summary := ProjectStorageSummary{
		ProjectID:   project.ID,
		ProjectName: project.Name,
		Directories: map[string]string{
			"jobs":             service.options.JobDataDir,
			"books":            service.options.BookSourceDir,
			"preparedSources":  service.options.SourcePrepDir,
			"progress":         service.options.ProgressDataDir,
			"playbackSessions": service.options.PlaybackSessionDir,
			"projects":         filepath.Join(service.options.ProjectDataDir, project.ID),
		},
		UpdatedAt: time.Now().UTC(),
	}

	service.mu.RLock()
	jobs := make([]storedJob, 0)
	for _, job := range service.jobs {
		if job.ProjectID == project.ID {
			jobs = append(jobs, job)
		}
	}
	books := make([]storedBookSource, 0)
	for _, book := range service.books {
		if book.ProjectID == project.ID {
			books = append(books, book)
		}
	}
	sources := make([]PreparedSource, 0)
	for _, source := range service.sourcePreps {
		if source.ProjectID == project.ID {
			sources = append(sources, source)
		}
	}
	service.mu.RUnlock()

	sort.SliceStable(jobs, func(left int, right int) bool {
		return jobs[left].UpdatedAt.After(jobs[right].UpdatedAt)
	})

	summary.JobCount = len(jobs)
	summary.BookSourceCount = len(books)
	summary.PreparedSourceCount = len(sources)
	for _, job := range jobs {
		jobDir := filepath.Join(service.options.JobDataDir, job.ID)
		summary.JobBytes += directorySize(jobDir)
		audioBytes := fileSize(job.AudioPath)
		summary.GeneratedAudioBytes += audioBytes
		if strings.TrimSpace(job.AudioURL) != "" || strings.TrimSpace(job.AudioPath) != "" {
			summary.Downloads = append(summary.Downloads, ProjectStorageDownload{
				Kind:      "final_audio",
				Label:     downloadLabel("Final audio", job),
				URL:       fmt.Sprintf("/api/voice-jobs/%s/audio", job.ID),
				FileName:  safeDownloadFilename(project.Name, job, "final", ".wav"),
				Bytes:     audioBytes,
				JobID:     job.ID,
				Available: strings.TrimSpace(job.AudioPath) != "" || len(job.audio) > 0,
			})
		}
		if strings.TrimSpace(job.AudioPartialURL) != "" {
			summary.Downloads = append(summary.Downloads, ProjectStorageDownload{
				Kind:      "partial_audio",
				Label:     downloadLabel("Arrival audio", job),
				URL:       fmt.Sprintf("/api/voice-jobs/%s/audio/partial", job.ID),
				FileName:  safeDownloadFilename(project.Name, job, "arrival", ".wav"),
				JobID:     job.ID,
				Available: true,
			})
		}
		for index := 1; index <= job.AudioReadySegments && index <= len(job.Segments); index++ {
			summary.Downloads = append(summary.Downloads, ProjectStorageDownload{
				Kind:      "segment_audio",
				Label:     fmt.Sprintf("Segment %d audio", index),
				URL:       fmt.Sprintf("/api/voice-jobs/%s/audio/segment/%d", job.ID, index),
				FileName:  safeDownloadFilename(project.Name, job, fmt.Sprintf("segment-%02d", index), ".wav"),
				JobID:     job.ID,
				Segment:   index,
				Available: true,
			})
		}
	}
	for _, book := range books {
		summary.BookSourceBytes += book.SourceBytes
		summary.TotalBytes += directorySize(filepath.Join(service.options.BookSourceDir, book.ID))
	}
	for _, source := range sources {
		if source.SourceBytes > 0 {
			summary.PreparedSourceBytes += source.SourceBytes
		}
		summary.TotalBytes += directorySize(filepath.Join(service.options.SourcePrepDir, source.ID))
	}
	summary.TotalBytes += summary.JobBytes
	if summary.TotalBytes == 0 {
		summary.TotalBytes = summary.JobBytes + summary.BookSourceBytes + summary.PreparedSourceBytes
	}
	return summary, nil
}

func (service *Service) removeProjectPreparedSources(projectID string) error {
	service.mu.Lock()
	ids := make([]string, 0)
	for id, source := range service.sourcePreps {
		if source.ProjectID == projectID {
			ids = append(ids, id)
			delete(service.sourcePreps, id)
		}
	}
	service.mu.Unlock()
	for _, id := range ids {
		if err := os.RemoveAll(filepath.Join(service.options.SourcePrepDir, id)); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) removeProjectPlaybackState(projectID string) error {
	service.mu.Lock()
	progressIDs := make([]string, 0)
	for id, progress := range service.progress {
		if progress.ProjectID == projectID {
			progressIDs = append(progressIDs, id)
			delete(service.progress, id)
		}
	}
	sessionIDs := make([]string, 0)
	for id, session := range service.sessions {
		if session.ProjectID == projectID {
			sessionIDs = append(sessionIDs, id)
			delete(service.sessions, id)
		}
	}
	service.mu.Unlock()

	for _, id := range progressIDs {
		if err := os.RemoveAll(filepath.Join(service.options.ProgressDataDir, safeDataPathID(id))); err != nil {
			return err
		}
	}
	for _, id := range sessionIDs {
		if err := os.RemoveAll(filepath.Join(service.options.PlaybackSessionDir, safeDataPathID(id))); err != nil {
			return err
		}
	}
	return nil
}

func directorySize(path string) int64 {
	var total int64
	_ = filepath.WalkDir(path, func(_ string, entry os.DirEntry, err error) error {
		if err != nil || entry == nil || entry.IsDir() {
			return nil
		}
		info, statErr := entry.Info()
		if statErr == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}

func fileSize(path string) int64 {
	if strings.TrimSpace(path) == "" {
		return 0
	}
	info, err := os.Stat(path)
	if err != nil {
		return 0
	}
	return info.Size()
}

func downloadLabel(prefix string, job storedJob) string {
	text := strings.TrimSpace(job.InputText)
	if text == "" {
		return prefix
	}
	return prefix + " - " + truncateString(text, 42)
}

func safeDownloadFilename(projectName string, job storedJob, suffix string, extension string) string {
	parts := []string{projectName}
	if strings.TrimSpace(job.ID) != "" {
		parts = append(parts, job.ID[:min(8, len(job.ID))])
	}
	parts = append(parts, suffix)
	name := strings.ToLower(strings.Join(parts, "-"))
	replacer := strings.NewReplacer(" ", "-", "/", "-", "\\", "-", ":", "-", "\"", "", "'", "", "_", "-")
	name = replacer.Replace(name)
	name = regexpInvalidDownloadFilename.ReplaceAllString(name, "-")
	name = strings.Trim(name, "-.")
	if name == "" {
		name = "voice-studio-audio"
	}
	return name + extension
}

func looksLikeProjectKeyAlias(key string, id string) bool {
	key = strings.TrimSpace(key)
	id = strings.TrimSpace(id)
	if len(key) != len(id) || len(id) < 2 {
		return false
	}
	return key[1:] == id[1:]
}
