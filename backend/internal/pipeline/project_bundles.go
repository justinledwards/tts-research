package pipeline

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	projectBundleVersion      = "voice-studio.bundle.v1"
	projectBundleAppVersion   = "1.0"
	projectBundleManifestPath = "manifest.json"
)

func (service *Service) GetProjectBundleSummary(projectID string) (ProjectBundleSummary, error) {
	manifest, files, err := service.buildProjectBundleManifest(projectID)
	if err != nil {
		return ProjectBundleSummary{}, err
	}

	estimatedBytes := int64(0)
	for _, file := range files {
		estimatedBytes += file.bytes
	}
	manifestBytes, err := json.Marshal(manifest)
	if err == nil {
		estimatedBytes += int64(len(manifestBytes))
	}

	return ProjectBundleSummary{
		ProjectID:      manifest.Project.ID,
		ProjectName:    manifest.Project.Name,
		Version:        projectBundleVersion,
		FileName:       projectBundleFileName(manifest.Project.Name),
		EstimatedBytes: estimatedBytes,
		ChapterCount:   len(manifest.Jobs),
		ProfileCount:   len(manifest.Profiles),
		GeneratedAudio: countBundleGeneratedAudio(files),
		DurationMS:     manifest.Quality.GeneratedDurationMS,
		Contents: []ProjectBundleContentItem{
			{Key: "projectMetadata", Label: "Project metadata", Included: true, Required: true, EstimatedBytes: int64(len(manifestBytes))},
			{Key: "sourceText", Label: "Source text", Included: true, Required: true},
			{Key: "normalizedScript", Label: "Script (normalized)", Included: true, Required: true},
			{Key: "voiceReferences", Label: "Voice profile references", Included: true, Required: false, EstimatedBytes: sumBundleFileRole(files, "profile_reference")},
			{Key: "generatedAudio", Label: "Generated audio", Included: true, Required: false, EstimatedBytes: sumBundleFileRole(files, "job_audio")},
			{Key: "waveformPeaks", Label: "Waveform peaks", Included: true, Required: false},
			{Key: "telemetry", Label: "Telemetry & per-segment data", Included: true, Required: false},
			{Key: "qualityReport", Label: "Quality report", Included: true, Required: false},
			{Key: "settings", Label: "Settings and run configuration", Included: true, Required: false},
		},
		Warnings:  bundleWarnings(manifest, files),
		CreatedAt: manifest.CreatedAt,
	}, nil
}

func (service *Service) ExportProjectBundle(projectID string) ([]byte, string, error) {
	manifest, files, err := service.buildProjectBundleManifest(projectID)
	if err != nil {
		return nil, "", err
	}

	tempFile, err := os.CreateTemp("", "voice-studio-bundle-*.zip")
	if err != nil {
		return nil, "", err
	}
	tempPath := tempFile.Name()
	defer os.Remove(tempPath)

	zipWriter := zip.NewWriter(tempFile)
	manifestWriter, err := zipWriter.Create(projectBundleManifestPath)
	if err != nil {
		_ = zipWriter.Close()
		_ = tempFile.Close()
		return nil, "", err
	}
	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		_ = zipWriter.Close()
		_ = tempFile.Close()
		return nil, "", err
	}
	if _, err := manifestWriter.Write(append(manifestBytes, '\n')); err != nil {
		_ = zipWriter.Close()
		_ = tempFile.Close()
		return nil, "", err
	}

	for _, file := range files {
		if err := addFileToZip(zipWriter, file.bundlePath, file.sourcePath); err != nil {
			_ = zipWriter.Close()
			_ = tempFile.Close()
			return nil, "", err
		}
	}
	if err := zipWriter.Close(); err != nil {
		_ = tempFile.Close()
		return nil, "", err
	}
	if err := tempFile.Close(); err != nil {
		return nil, "", err
	}
	bundleBytes, err := os.ReadFile(tempPath)
	if err != nil {
		return nil, "", err
	}
	return bundleBytes, projectBundleFileName(manifest.Project.Name), nil
}

func (service *Service) PreviewProjectBundle(bundlePath string) (ProjectBundlePreview, error) {
	manifest, files, err := readProjectBundleManifest(bundlePath)
	if err != nil {
		return ProjectBundlePreview{
			Valid:  false,
			Errors: []string{err.Error()},
		}, nil
	}

	estimatedBytes := int64(0)
	for _, file := range files {
		estimatedBytes += int64(file.UncompressedSize64)
	}
	preview := ProjectBundlePreview{
		Valid:          true,
		Version:        manifest.Version,
		ProjectName:    manifest.Project.Name,
		ChapterCount:   len(manifest.Jobs),
		ProfileCount:   len(manifest.Profiles),
		GeneratedAudio: countManifestGeneratedAudio(manifest),
		EstimatedBytes: estimatedBytes,
		Quality:        manifest.Quality,
		Compatibility:  []string{"Manifest compatible", "Project metadata readable"},
		Warnings:       bundleManifestWarnings(manifest),
		Manifest:       &manifest,
	}
	if manifest.Version != projectBundleVersion {
		preview.Valid = false
		preview.Errors = append(preview.Errors, fmt.Sprintf("unsupported bundle version %q", manifest.Version))
	}
	return preview, nil
}

func (service *Service) ImportProjectBundle(bundlePath string, request ProjectBundleImportRequest) (ProjectBundleImportResult, error) {
	preview, err := service.PreviewProjectBundle(bundlePath)
	if err != nil {
		return ProjectBundleImportResult{}, err
	}
	if !preview.Valid || preview.Manifest == nil {
		if len(preview.Errors) > 0 {
			return ProjectBundleImportResult{}, fmt.Errorf("%w: %s", ErrProjectBundleInvalid, strings.Join(preview.Errors, "; "))
		}
		return ProjectBundleImportResult{}, ErrProjectBundleInvalid
	}

	mode := request.Mode
	switch mode {
	case BundleImportModeCopy, BundleImportModeMerge, BundleImportModeReplace:
	default:
		mode = BundleImportModeCopy
	}

	targetProject, err := service.resolveBundleImportProject(*preview.Manifest, request.ProjectID, mode)
	if err != nil {
		return ProjectBundleImportResult{}, err
	}
	if mode == BundleImportModeReplace {
		if err := service.removeProjectJobs(targetProject.ID); err != nil {
			return ProjectBundleImportResult{}, err
		}
		if err := service.removeProjectBookSources(targetProject.ID); err != nil {
			return ProjectBundleImportResult{}, err
		}
	}

	reader, err := zip.OpenReader(bundlePath)
	if err != nil {
		return ProjectBundleImportResult{}, err
	}
	defer reader.Close()
	fileByPath := map[string]*zip.File{}
	for _, file := range reader.File {
		fileByPath[file.Name] = file
	}

	profileIDMap := map[string]string{}
	importedProfiles := make([]VoiceProfile, 0, len(preview.Manifest.Profiles))
	for _, profile := range preview.Manifest.Profiles {
		imported, copyErr := service.importBundleProfile(profile, fileByPath, profileIDMap)
		if copyErr != nil {
			return ProjectBundleImportResult{}, copyErr
		}
		importedProfiles = append(importedProfiles, imported)
	}

	for _, book := range preview.Manifest.Books {
		if copyErr := service.importBundleBookSource(book, targetProject.ID); copyErr != nil {
			return ProjectBundleImportResult{}, copyErr
		}
	}

	importedJobs := make([]VoiceJob, 0, len(preview.Manifest.Jobs))
	for _, job := range preview.Manifest.Jobs {
		imported, copyErr := service.importBundleJob(job, targetProject.ID, fileByPath, profileIDMap)
		if copyErr != nil {
			return ProjectBundleImportResult{}, copyErr
		}
		importedJobs = append(importedJobs, imported)
	}

	return ProjectBundleImportResult{
		Project:  targetProject,
		Jobs:     importedJobs,
		Profiles: importedProfiles,
		Warnings: preview.Warnings,
	}, nil
}

func (service *Service) buildProjectBundleManifest(projectID string) (ProjectBundleManifest, []projectBundleSourceFile, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return ProjectBundleManifest{}, nil, err
	}
	jobs, err := service.ListProjectJobs(project.ID)
	if err != nil {
		return ProjectBundleManifest{}, nil, err
	}
	books, err := service.ListProjectBookSources(project.ID)
	if err != nil {
		return ProjectBundleManifest{}, nil, err
	}

	service.mu.RLock()
	profilesByID := make(map[string]VoiceProfile)
	for _, profile := range service.profiles {
		profilesByID[profile.ID] = profile.VoiceProfile
	}
	service.mu.RUnlock()

	profileIDs := map[string]bool{}
	for _, job := range jobs {
		if strings.TrimSpace(job.VoiceProfileID) != "" {
			profileIDs[job.VoiceProfileID] = true
		}
	}
	profiles := make([]VoiceProfile, 0, len(profileIDs))
	for profileID := range profileIDs {
		if profile, ok := profilesByID[profileID]; ok {
			profiles = append(profiles, profile)
		}
	}
	sort.SliceStable(profiles, func(left int, right int) bool {
		return profiles[left].Name < profiles[right].Name
	})

	files := make([]projectBundleSourceFile, 0)
	manifestFiles := make([]ProjectBundleFile, 0)
	for _, job := range jobs {
		if strings.TrimSpace(job.AudioPath) == "" {
			continue
		}
		file, ok := bundleFile("job_audio", filepath.ToSlash(filepath.Join("jobs", job.ID, "audio.wav")), job.AudioPath)
		if ok {
			files = append(files, file)
			manifestFiles = append(manifestFiles, ProjectBundleFile{Role: file.role, Path: file.bundlePath, Bytes: file.bytes, SHA256: file.sha256})
		}
	}
	for _, profile := range profiles {
		if strings.TrimSpace(profile.ReferencePath) == "" {
			continue
		}
		file, ok := bundleFile("profile_reference", filepath.ToSlash(filepath.Join("profiles", profile.ID, "reference.wav")), profile.ReferencePath)
		if ok {
			files = append(files, file)
			manifestFiles = append(manifestFiles, ProjectBundleFile{Role: file.role, Path: file.bundlePath, Bytes: file.bytes, SHA256: file.sha256})
		}
	}

	now := time.Now().UTC()
	manifest := ProjectBundleManifest{
		Version:    projectBundleVersion,
		CreatedAt:  now,
		AppVersion: projectBundleAppVersion,
		Project:    project,
		Jobs:       jobs,
		Profiles:   profiles,
		Books:      books,
		Files:      manifestFiles,
		ProviderVersions: map[string]string{
			"tts":         "kokoro",
			"checker":     "qwen",
			"diarization": "pyannote-local",
		},
		Quality: summarizeBundleQuality(jobs, profiles),
		Hashes:  map[string]string{},
	}
	manifest.Hashes["project"] = hashString(project.ID + project.Name)
	return manifest, files, nil
}

func (service *Service) resolveBundleImportProject(
	manifest ProjectBundleManifest,
	projectID string,
	mode BundleImportMode,
) (VoiceProject, error) {
	applyPolicyMetadata := func(project VoiceProject, replace bool) (VoiceProject, error) {
		if replace {
			project.SpeechPolicyProfiles = cloneCustomSpeechPolicyProfiles(manifest.Project.SpeechPolicyProfiles)
		} else {
			byID := map[string]CustomSpeechPolicyProfile{}
			for _, profile := range project.SpeechPolicyProfiles {
				byID[profile.ID] = profile
			}
			for _, profile := range manifest.Project.SpeechPolicyProfiles {
				byID[profile.ID] = profile
			}
			project.SpeechPolicyProfiles = project.SpeechPolicyProfiles[:0]
			for _, profile := range byID {
				project.SpeechPolicyProfiles = append(project.SpeechPolicyProfiles, profile)
			}
			sort.SliceStable(project.SpeechPolicyProfiles, func(left int, right int) bool {
				return project.SpeechPolicyProfiles[left].Name < project.SpeechPolicyProfiles[right].Name
			})
		}
		if strings.TrimSpace(manifest.Project.SpeechPolicyProfile) != "" {
			project.SpeechPolicyProfile = manifest.Project.SpeechPolicyProfile
		}
		project = normalizeProjectSpeechPolicy(project)
		project.UpdatedAt = time.Now().UTC()
		if err := service.writeProject(project); err != nil {
			return VoiceProject{}, err
		}
		service.mu.Lock()
		service.projects[project.ID] = project
		service.mu.Unlock()
		return project, nil
	}
	switch mode {
	case BundleImportModeMerge:
		project, err := service.GetProject(projectID)
		if err != nil {
			return VoiceProject{}, err
		}
		return applyPolicyMetadata(project, false)
	case BundleImportModeReplace:
		project, err := service.GetProject(projectID)
		if err != nil {
			return VoiceProject{}, err
		}
		project, err = service.UpdateProject(project.ID, manifest.Project.Name)
		if err != nil {
			return VoiceProject{}, err
		}
		return applyPolicyMetadata(project, true)
	default:
		project, err := service.CreateProject(manifest.Project.Name + " (Imported)")
		if err != nil {
			return VoiceProject{}, err
		}
		return applyPolicyMetadata(project, true)
	}
}

func (service *Service) importBundleProfile(
	profile VoiceProfile,
	fileByPath map[string]*zip.File,
	profileIDMap map[string]string,
) (VoiceProfile, error) {
	originalID := profile.ID
	nextID := newID()
	profile.ID = nextID
	profileIDMap[originalID] = nextID
	if strings.TrimSpace(profile.Name) == "" {
		profile.Name = "Imported Voice"
	}
	now := time.Now().UTC()
	profile.CreatedAt = now
	profile.UpdatedAt = now
	profile.ReferencePath = ""
	profile.ReferenceAudio = ""
	for _, file := range bundleManifestFilesForRoleAndID(profile.ReferenceSpans, originalID, "profile_reference", fileByPath) {
		outputDir := filepath.Join(service.options.VoiceProfileDir, nextID)
		if err := os.MkdirAll(outputDir, 0o755); err != nil {
			return VoiceProfile{}, err
		}
		outputPath := filepath.Join(outputDir, "reference.wav")
		if err := extractZipFile(file, outputPath); err != nil {
			return VoiceProfile{}, err
		}
		profile.ReferencePath = outputPath
		profile.ReferenceAudio = "reference.wav"
		break
	}
	if profile.ReferencePath == "" {
		if file := fileByPath[filepath.ToSlash(filepath.Join("profiles", originalID, "reference.wav"))]; file != nil {
			outputDir := filepath.Join(service.options.VoiceProfileDir, nextID)
			if err := os.MkdirAll(outputDir, 0o755); err != nil {
				return VoiceProfile{}, err
			}
			outputPath := filepath.Join(outputDir, "reference.wav")
			if err := extractZipFile(file, outputPath); err != nil {
				return VoiceProfile{}, err
			}
			profile.ReferencePath = outputPath
			profile.ReferenceAudio = "reference.wav"
		}
	}
	if err := service.writeVoiceProfileMetadata(profile); err != nil {
		return VoiceProfile{}, err
	}
	service.mu.Lock()
	service.profiles[profile.ID] = storedVoiceProfile{VoiceProfile: profile}
	service.mu.Unlock()
	return profile, nil
}

func (service *Service) importBundleJob(
	job VoiceJob,
	projectID string,
	fileByPath map[string]*zip.File,
	profileIDMap map[string]string,
) (VoiceJob, error) {
	originalID := job.ID
	job.ID = newID()
	job.ProjectID = projectID
	if mappedProfileID, ok := profileIDMap[job.VoiceProfileID]; ok {
		job.VoiceProfileID = mappedProfileID
	}
	now := time.Now().UTC()
	job.CreatedAt = now
	job.UpdatedAt = now
	job.CompletedAt = nil
	job.AudioURL = ""
	job.AudioPath = ""
	job.AudioPartialURL = ""
	if file := fileByPath[filepath.ToSlash(filepath.Join("jobs", originalID, "audio.wav"))]; file != nil {
		outputDir := filepath.Join(service.options.JobDataDir, job.ID)
		if err := os.MkdirAll(outputDir, 0o755); err != nil {
			return VoiceJob{}, err
		}
		outputPath := filepath.Join(outputDir, "audio.wav")
		if err := extractZipFile(file, outputPath); err != nil {
			return VoiceJob{}, err
		}
		job.AudioPath = outputPath
		job.AudioURL = "/api/voice-jobs/" + job.ID + "/audio"
	}
	if err := service.writeImportedJobMetadata(job); err != nil {
		return VoiceJob{}, err
	}
	service.mu.Lock()
	service.jobs[job.ID] = storedJob{VoiceJob: job}
	service.mu.Unlock()
	return job, nil
}

func (service *Service) removeProjectJobs(projectID string) error {
	service.mu.Lock()
	ids := make([]string, 0)
	for id, job := range service.jobs {
		if job.ProjectID == projectID {
			ids = append(ids, id)
			delete(service.jobs, id)
		}
	}
	service.mu.Unlock()
	for _, id := range ids {
		if err := os.RemoveAll(filepath.Join(service.options.JobDataDir, id)); err != nil {
			return err
		}
	}
	return nil
}
