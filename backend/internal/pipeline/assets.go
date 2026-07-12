package pipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (service *Service) RenamePreparedSource(id string, name string) (PreparedSource, error) {
	cleanID := strings.TrimSpace(id)
	cleanName := cleanAssetName(name, "Untitled source")

	service.mu.RLock()
	source, ok := service.sourcePreps[cleanID]
	service.mu.RUnlock()
	if !ok {
		return PreparedSource{}, ErrPreparedSourceNotFound
	}

	source = clonePreparedSource(source)
	source.Title = cleanName
	if source.SourceReadiness != nil {
		source.SourceReadiness.Title = cleanName
	}
	source.UpdatedAt = time.Now().UTC()
	service.updatePreparedSource(source)
	if err := service.writePreparedSourceMetadata(source); err != nil {
		return PreparedSource{}, err
	}
	return service.GetPreparedSource(source.ID)
}

func (service *Service) DeletePreparedSource(id string) error {
	cleanID := strings.TrimSpace(id)
	service.mu.Lock()
	if _, ok := service.sourcePreps[cleanID]; !ok {
		service.mu.Unlock()
		return ErrPreparedSourceNotFound
	}
	if jobID := activeJobIDForPreparedSource(service.jobs, cleanID); jobID != "" {
		service.mu.Unlock()
		return fmt.Errorf("%w: active job %s uses prepared source %s", ErrAssetInUse, jobID, cleanID)
	}
	delete(service.sourcePreps, cleanID)
	service.mu.Unlock()

	return os.RemoveAll(filepath.Join(service.options.SourcePrepDir, cleanID))
}

func (service *Service) RenameBookSource(id string, name string) (BookSource, error) {
	cleanID := strings.TrimSpace(id)
	cleanName := cleanAssetName(name, "Untitled source")

	service.mu.RLock()
	stored, ok := service.books[cleanID]
	service.mu.RUnlock()
	if !ok {
		return BookSource{}, ErrBookSourceNotFound
	}

	book := stored.BookSource
	book.Title = cleanName
	if book.SourceReadiness != nil {
		book.SourceReadiness.Title = cleanName
	}
	book.UpdatedAt = time.Now().UTC()
	ensureBookStructureMetadata(&book)
	book = ensureBookSourceReadiness(book)
	service.updateBookSource(storedBookSource{BookSource: book})
	if err := service.writeBookSourceMetadata(book); err != nil {
		return BookSource{}, err
	}
	return service.GetBookSource(book.ID)
}

func (service *Service) DeleteBookSource(id string) error {
	cleanID := strings.TrimSpace(id)
	service.mu.Lock()
	if _, ok := service.books[cleanID]; !ok {
		service.mu.Unlock()
		return ErrBookSourceNotFound
	}
	if jobID := activeJobIDForBookSource(service.jobs, cleanID); jobID != "" {
		service.mu.Unlock()
		return fmt.Errorf("%w: active job %s uses book source %s", ErrAssetInUse, jobID, cleanID)
	}
	delete(service.books, cleanID)
	service.mu.Unlock()

	return os.RemoveAll(filepath.Join(service.options.BookSourceDir, cleanID))
}

func (service *Service) RenameVoiceProfile(id string, name string) (VoiceProfile, error) {
	cleanID := strings.TrimSpace(id)
	cleanName := cleanAssetName(name, "Untitled voice")

	profile, err := service.getVoiceProfile(cleanID)
	if err != nil {
		return VoiceProfile{}, err
	}
	profile.Name = cleanName
	if err := service.persistVoiceProfile(profile); err != nil {
		return VoiceProfile{}, err
	}
	return service.GetVoiceProfile(profile.ID)
}

func (service *Service) voiceProfileInUseByActiveJob(id string) string {
	cleanID := strings.TrimSpace(id)
	service.mu.RLock()
	defer service.mu.RUnlock()

	for jobID, job := range service.jobs {
		if job.VoiceProfileID == cleanID && !jobStatusIsTerminal(job.Status) {
			return jobID
		}
	}
	return ""
}

func (service *Service) customSpeechPolicyProfileInUse(projectID string, profileID string) string {
	cleanProjectID := strings.TrimSpace(projectID)
	cleanProfileID := strings.TrimSpace(profileID)
	if cleanProjectID == "" || cleanProfileID == "" {
		return ""
	}

	service.mu.RLock()
	defer service.mu.RUnlock()

	for _, project := range service.projects {
		if project.ID == cleanProjectID && project.SpeechPolicyProfile == cleanProfileID {
			return "project default"
		}
	}
	for _, book := range service.books {
		if book.ProjectID == cleanProjectID && book.SourceSpeechPolicyProfile == cleanProfileID {
			return "book source " + book.ID
		}
	}
	for _, source := range service.sourcePreps {
		if source.ProjectID == cleanProjectID && source.SourceSpeechPolicyProfile == cleanProfileID {
			return "prepared source " + source.ID
		}
	}
	return ""
}

func activeJobIDForPreparedSource(jobs map[string]storedJob, sourceID string) string {
	for jobID, job := range jobs {
		if job.PreparedSourceID == sourceID && !jobStatusIsTerminal(job.Status) {
			return jobID
		}
	}
	return ""
}

func activeJobIDForBookSource(jobs map[string]storedJob, sourceID string) string {
	for jobID, job := range jobs {
		if job.BookSourceID == sourceID && !jobStatusIsTerminal(job.Status) {
			return jobID
		}
	}
	return ""
}

func jobStatusIsTerminal(status JobStatus) bool {
	return status == JobStatusCompleted || status == JobStatusFailed || status == JobStatusCancelled
}

func cleanAssetName(name string, fallback string) string {
	cleanName := strings.Join(strings.Fields(name), " ")
	if cleanName == "" {
		return fallback
	}
	return cleanName
}
