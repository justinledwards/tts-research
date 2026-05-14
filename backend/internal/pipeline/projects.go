package pipeline

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	defaultProjectID   = "default"
	defaultProjectName = "The Future of Clean Energy"
	projectMetadata    = "project.json"
)

func (service *Service) ListProjects() []VoiceProject {
	service.mu.RLock()
	defer service.mu.RUnlock()

	projects := make([]VoiceProject, 0, len(service.projects))
	for _, project := range service.projects {
		projects = append(projects, project)
	}
	sort.SliceStable(projects, func(left int, right int) bool {
		if projects[left].ID == defaultProjectID {
			return true
		}
		if projects[right].ID == defaultProjectID {
			return false
		}
		return projects[left].UpdatedAt.After(projects[right].UpdatedAt)
	})
	return projects
}

func (service *Service) GetProject(id string) (VoiceProject, error) {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		cleanID = defaultProjectID
	}

	service.mu.RLock()
	project, ok := service.projects[cleanID]
	if !ok {
		for _, candidate := range service.projects {
			if candidate.ID == cleanID {
				project = candidate
				ok = true
				break
			}
		}
	}
	service.mu.RUnlock()
	if !ok {
		return VoiceProject{}, ErrProjectNotFound
	}
	return project, nil
}

func (service *Service) CreateProject(name string) (VoiceProject, error) {
	now := time.Now().UTC()
	project := VoiceProject{
		ID:        newID(),
		Name:      cleanProjectName(name),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := service.writeProject(project); err != nil {
		return VoiceProject{}, err
	}
	service.mu.Lock()
	service.projects[project.ID] = project
	service.mu.Unlock()
	return project, nil
}

func (service *Service) UpdateProject(id string, name string) (VoiceProject, error) {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		cleanID = defaultProjectID
	}
	service.mu.Lock()
	project, ok := service.projects[cleanID]
	if !ok {
		service.mu.Unlock()
		return VoiceProject{}, ErrProjectNotFound
	}
	project.Name = cleanProjectName(name)
	project.UpdatedAt = time.Now().UTC()
	service.projects[cleanID] = project
	service.mu.Unlock()

	if err := service.writeProject(project); err != nil {
		return VoiceProject{}, err
	}
	return project, nil
}

func (service *Service) ListProjectJobs(projectID string) ([]VoiceJob, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return nil, err
	}

	service.mu.RLock()
	jobs := make([]VoiceJob, 0)
	for _, job := range service.jobs {
		jobProjectID := job.ProjectID
		if strings.TrimSpace(jobProjectID) == "" {
			jobProjectID = defaultProjectID
		}
		if jobProjectID == project.ID {
			jobs = append(jobs, job.VoiceJob)
		}
	}
	service.mu.RUnlock()

	sort.SliceStable(jobs, func(left int, right int) bool {
		return jobs[left].UpdatedAt.After(jobs[right].UpdatedAt)
	})
	return jobs, nil
}

func (service *Service) reloadProjects() {
	baseDir, err := filepath.Abs(service.options.ProjectDataDir)
	if err != nil {
		return
	}
	projects := make(map[string]VoiceProject)
	entries, err := os.ReadDir(baseDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), projectMetadata))
			if readErr != nil {
				continue
			}
			var project VoiceProject
			if err := json.Unmarshal(metadataBytes, &project); err != nil {
				continue
			}
			if strings.TrimSpace(project.ID) == "" {
				continue
			}
			if strings.TrimSpace(project.Name) == "" {
				project.Name = defaultProjectName
			}
			if project.CreatedAt.IsZero() {
				project.CreatedAt = time.Now().UTC()
			}
			if project.UpdatedAt.IsZero() {
				project.UpdatedAt = project.CreatedAt
			}
			projects[project.ID] = project
		}
	} else if os.IsNotExist(err) {
		_ = os.MkdirAll(baseDir, 0o755)
	}

	if _, ok := projects[defaultProjectID]; !ok {
		now := time.Now().UTC()
		projects[defaultProjectID] = VoiceProject{
			ID:        defaultProjectID,
			Name:      defaultProjectName,
			CreatedAt: now,
			UpdatedAt: now,
		}
	}

	service.mu.Lock()
	service.projects = projects
	service.mu.Unlock()

	_ = service.writeProject(projects[defaultProjectID])
}

func (service *Service) reloadJobs() {
	baseDir, err := filepath.Abs(service.options.JobDataDir)
	if err != nil {
		return
	}
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}

	jobs := make(map[string]storedJob)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), "metadata.json"))
		if readErr != nil {
			continue
		}
		var job VoiceJob
		if err := json.Unmarshal(metadataBytes, &job); err != nil {
			continue
		}
		if strings.TrimSpace(job.ID) == "" {
			continue
		}
		if strings.TrimSpace(job.ProjectID) == "" {
			job.ProjectID = defaultProjectID
		}
		if job.AudioURL == "" && job.AudioPath != "" {
			job.AudioURL = "/api/voice-jobs/" + job.ID + "/audio"
		}
		if job.CreatedAt.IsZero() {
			job.CreatedAt = time.Now().UTC()
		}
		if job.UpdatedAt.IsZero() {
			job.UpdatedAt = job.CreatedAt
		}
		jobs[job.ID] = storedJob{VoiceJob: job}
	}

	service.mu.Lock()
	for id, job := range jobs {
		service.jobs[id] = job
	}
	service.mu.Unlock()
}

func (service *Service) writeProject(project VoiceProject) error {
	outputDir, err := filepath.Abs(filepath.Join(service.options.ProjectDataDir, project.ID))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, projectMetadata), project)
}

func cleanProjectName(name string) string {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return "Untitled Project"
	}
	return clean
}
