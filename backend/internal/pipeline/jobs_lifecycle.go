package pipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (service *Service) DeleteVoiceJob(id string) error {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		return ErrJobNotFound
	}
	if _, err := service.resolveStoredJob(cleanID); err != nil {
		return err
	}

	now := time.Now().UTC()
	progressToPersist := make([]PlaybackProgress, 0)
	progressIDsToRemove := make([]string, 0)
	sessionIDsToRemove := make([]string, 0)

	service.mu.Lock()
	job, ok := service.jobs[cleanID]
	if !ok {
		service.mu.Unlock()
		return ErrJobNotFound
	}
	if !jobStatusIsTerminal(job.Status) {
		service.mu.Unlock()
		return fmt.Errorf("%w: cancel job %s before deleting it", ErrJobInUse, cleanID)
	}
	for jobID, candidate := range service.jobs {
		if candidate.RetryOfJobID == cleanID && !jobStatusIsTerminal(candidate.Status) {
			service.mu.Unlock()
			return fmt.Errorf("%w: active retry %s depends on job %s", ErrJobInUse, jobID, cleanID)
		}
	}

	delete(service.jobs, cleanID)
	delete(service.jobCancels, cleanID)

	for targetID, progress := range service.progress {
		if progress.JobID != cleanID {
			continue
		}
		if targetID == "job:"+cleanID {
			delete(service.progress, targetID)
			progressIDsToRemove = append(progressIDsToRemove, targetID)
			continue
		}
		progress.JobID = ""
		progress.UpdatedAt = now
		service.progress[targetID] = progress
		progressToPersist = append(progressToPersist, clonePlaybackProgress(progress))
	}
	for sessionID, session := range service.sessions {
		if session.JobID == cleanID {
			delete(service.sessions, sessionID)
			sessionIDsToRemove = append(sessionIDsToRemove, sessionID)
		}
	}
	service.mu.Unlock()

	for _, progress := range progressToPersist {
		if err := service.writePlaybackProgress(progress); err != nil {
			return err
		}
	}
	for _, targetID := range progressIDsToRemove {
		if err := os.RemoveAll(filepath.Join(service.options.ProgressDataDir, safeDataPathID(targetID))); err != nil {
			return err
		}
	}
	for _, sessionID := range sessionIDsToRemove {
		if err := os.RemoveAll(filepath.Join(service.options.PlaybackSessionDir, safeDataPathID(sessionID))); err != nil {
			return err
		}
	}
	return os.RemoveAll(filepath.Join(service.options.JobDataDir, cleanID))
}
