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

type ProjectBundleExportOptions struct {
	IncludeGeneratedAudio bool
}

func defaultProjectBundleExportOptions() ProjectBundleExportOptions {
	return ProjectBundleExportOptions{IncludeGeneratedAudio: true}
}

func resolveProjectBundleExportOptions(options []ProjectBundleExportOptions) ProjectBundleExportOptions {
	if len(options) == 0 {
		return defaultProjectBundleExportOptions()
	}
	return options[0]
}

func (service *Service) GetProjectBundleSummary(projectID string, options ...ProjectBundleExportOptions) (ProjectBundleSummary, error) {
	exportOptions := resolveProjectBundleExportOptions(options)
	manifest, files, err := service.buildProjectBundleManifest(projectID, exportOptions)
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
		ProjectID:              manifest.Project.ID,
		ProjectName:            manifest.Project.Name,
		Version:                projectBundleVersion,
		FileName:               projectBundleFileName(manifest.Project.Name),
		EstimatedBytes:         estimatedBytes,
		ChapterCount:           len(manifest.Jobs),
		ProfileCount:           len(manifest.Profiles),
		GeneratedAudio:         countBundleGeneratedAudio(files),
		GeneratedAudioIncluded: manifest.GeneratedAudioIncluded,
		OmittedGeneratedAudio:  manifest.OmittedGeneratedAudio,
		OmittedGeneratedBytes:  manifest.OmittedGeneratedBytes,
		DurationMS:             manifest.Quality.GeneratedDurationMS,
		Contents:               manifest.Contents,
		Excluded:               manifest.Excluded,
		Warnings:               bundleWarnings(manifest, files),
		CreatedAt:              manifest.CreatedAt,
	}, nil
}

func (service *Service) ExportProjectBundle(projectID string, options ...ProjectBundleExportOptions) ([]byte, string, error) {
	exportOptions := resolveProjectBundleExportOptions(options)
	manifest, files, err := service.buildProjectBundleManifest(projectID, exportOptions)
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
	validation := validateProjectBundleFiles(manifest, bundlePath)
	dependencies := service.bundleDependencies(manifest)
	conflicts := service.bundleConflicts(manifest)
	warnings := bundleManifestWarnings(manifest)
	for _, item := range validation {
		if item.Status == "warning" {
			warnings = append(warnings, item.Detail)
		}
	}
	for _, dependency := range dependencies {
		if dependency.Missing || dependency.Status == "unavailable" || dependency.Status == "setup-needed" {
			warnings = append(warnings, dependency.Detail)
		}
	}
	for _, conflict := range conflicts {
		if !conflict.Blocking {
			warnings = append(warnings, conflict.Detail)
		}
	}
	preview := ProjectBundlePreview{
		Valid:                true,
		Version:              manifest.Version,
		ProjectName:          manifest.Project.Name,
		ChapterCount:         len(manifest.Jobs),
		ProfileCount:         len(manifest.Profiles),
		GeneratedAudio:       countManifestGeneratedAudio(manifest),
		EstimatedBytes:       estimatedBytes,
		Quality:              manifest.Quality,
		Compatibility:        []string{"Manifest compatible", "Project metadata readable"},
		Warnings:             compactStrings(warnings),
		Manifest:             &manifest,
		Contents:             manifest.Contents,
		Excluded:             manifest.Excluded,
		Conflicts:            conflicts,
		Dependencies:         dependencies,
		Validation:           validation,
		AvailableImportModes: []BundleImportMode{BundleImportModeCopy, BundleImportModeMerge, BundleImportModeReplace},
		RecommendedMode:      BundleImportModeCopy,
	}
	if manifest.Version != projectBundleVersion {
		preview.Valid = false
		preview.Errors = append(preview.Errors, fmt.Sprintf("unsupported bundle version %q", manifest.Version))
	}
	for _, item := range validation {
		if item.Blocking {
			preview.Valid = false
			preview.Errors = append(preview.Errors, item.Detail)
		}
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

	targetProject, originalTargetJobs, originalTargetBooks, createdProject, err := service.prepareBundleImportProject(*preview.Manifest, request.ProjectID, mode)
	if err != nil {
		return ProjectBundleImportResult{}, err
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
	importedBooks := make([]BookSource, 0, len(preview.Manifest.Books))
	importedJobs := make([]VoiceJob, 0, len(preview.Manifest.Jobs))
	committed := false
	defer func() {
		if !committed {
			service.cleanupFailedBundleImport(createdProject, targetProject.ID, importedProfiles, importedBooks, importedJobs)
		}
	}()
	for _, profile := range preview.Manifest.Profiles {
		imported, copyErr := service.importBundleProfile(profile, fileByPath, profileIDMap)
		if copyErr != nil {
			return ProjectBundleImportResult{}, copyErr
		}
		importedProfiles = append(importedProfiles, imported)
	}

	for _, book := range preview.Manifest.Books {
		imported, copyErr := service.importBundleBookSource(book, targetProject.ID)
		if copyErr != nil {
			return ProjectBundleImportResult{}, copyErr
		}
		importedBooks = append(importedBooks, imported)
	}

	for _, job := range preview.Manifest.Jobs {
		imported, copyErr := service.importBundleJob(job, targetProject.ID, fileByPath, profileIDMap)
		if copyErr != nil {
			return ProjectBundleImportResult{}, copyErr
		}
		importedJobs = append(importedJobs, imported)
	}
	targetProject, err = service.commitBundleImportProject(*preview.Manifest, targetProject, originalTargetJobs, originalTargetBooks, mode)
	if err != nil {
		return ProjectBundleImportResult{}, err
	}
	committed = true

	return ProjectBundleImportResult{
		Project:  targetProject,
		Jobs:     importedJobs,
		Profiles: importedProfiles,
		Warnings: preview.Warnings,
	}, nil
}

func (service *Service) buildProjectBundleManifest(projectID string, options ProjectBundleExportOptions) (ProjectBundleManifest, []projectBundleSourceFile, error) {
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

	sanitizedJobs := make([]VoiceJob, 0, len(jobs))
	for _, job := range jobs {
		sanitizedJobs = append(sanitizedJobs, sanitizeBundleJob(job))
	}
	sanitizedProfiles := make([]VoiceProfile, 0, len(profiles))
	for _, profile := range profiles {
		sanitizedProfiles = append(sanitizedProfiles, sanitizeBundleProfile(profile))
	}
	sanitizedBooks := make([]BookSource, 0, len(books))
	for _, book := range books {
		sanitizedBooks = append(sanitizedBooks, sanitizeBundleBookSource(book))
	}

	files := make([]projectBundleSourceFile, 0)
	manifestFiles := make([]ProjectBundleFile, 0)
	omittedGeneratedAudio := 0
	omittedGeneratedBytes := int64(0)
	for _, job := range jobs {
		if strings.TrimSpace(job.AudioPath) == "" {
			continue
		}
		file, ok := bundleFile("job_audio", filepath.ToSlash(filepath.Join("jobs", job.ID, "audio.wav")), job.AudioPath)
		if ok {
			if options.IncludeGeneratedAudio {
				files = append(files, file)
				manifestFiles = append(manifestFiles, ProjectBundleFile{Role: file.role, Path: file.bundlePath, Bytes: file.bytes, SHA256: file.sha256})
			} else {
				omittedGeneratedAudio += 1
				omittedGeneratedBytes += file.bytes
			}
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
		Version:                projectBundleVersion,
		CreatedAt:              now,
		AppVersion:             projectBundleAppVersion,
		Project:                project,
		Jobs:                   sanitizedJobs,
		Profiles:               sanitizedProfiles,
		Books:                  sanitizedBooks,
		Files:                  manifestFiles,
		ProviderVersions:       service.bundleProviderVersions(jobs),
		Quality:                summarizeBundleQuality(jobs, profiles),
		Hashes:                 map[string]string{},
		GeneratedAudioIncluded: options.IncludeGeneratedAudio,
		OmittedGeneratedAudio:  omittedGeneratedAudio,
		OmittedGeneratedBytes:  omittedGeneratedBytes,
	}
	manifest.Hashes["project"] = hashString(project.ID + project.Name)
	manifest.Contents, manifest.Excluded = projectBundleContentManifest(manifest, files, omittedGeneratedAudio, omittedGeneratedBytes)
	return manifest, files, nil
}

func (service *Service) bundleProviderVersions(jobs []VoiceJob) map[string]string {
	engines := service.ListTTSEngines()
	statusByID := map[string]string{}
	for _, engine := range engines {
		statusByID[engine.ID] = engine.Status
	}
	versions := map[string]string{}
	for _, job := range jobs {
		engineID := normalizeTTSEngineID(job.TTSEngine)
		if strings.TrimSpace(engineID) == "" {
			engineID = TTSEngineAuto
		}
		if _, ok := versions["tts:"+engineID]; ok {
			continue
		}
		status := statusByID[engineID]
		if status == "" {
			status = "unknown"
		}
		versions["tts:"+engineID] = status
	}
	if len(versions) == 0 {
		versions["tts"] = "none"
	}
	return versions
}

func (service *Service) bundleDependencies(manifest ProjectBundleManifest) []ProjectBundleDependency {
	engines := service.ListTTSEngines()
	engineByID := map[string]TTSEngineDiagnostics{}
	for _, engine := range engines {
		engineByID[engine.ID] = engine
	}
	seen := map[string]bool{}
	dependencies := make([]ProjectBundleDependency, 0)
	for _, job := range manifest.Jobs {
		engineID := normalizeTTSEngineID(job.TTSEngine)
		if strings.TrimSpace(engineID) == "" {
			engineID = TTSEngineAuto
		}
		if seen[engineID] {
			continue
		}
		seen[engineID] = true
		engine, ok := engineByID[engineID]
		if !ok {
			dependencies = append(dependencies, ProjectBundleDependency{
				Key:     "tts:" + engineID,
				Label:   "TTS engine " + engineID,
				Detail:  fmt.Sprintf("%s is referenced by the bundle but is not available in this runtime.", engineID),
				Status:  "missing",
				Missing: true,
			})
			continue
		}
		status := engine.Status
		if status == "" {
			status = "ready"
		}
		detail := fmt.Sprintf("%s is available for imported jobs.", engine.Label)
		if status != "ready" {
			detail = firstNonEmpty(engine.Reason, engine.Setup, fmt.Sprintf("%s is present but not ready.", engine.Label))
		}
		dependencies = append(dependencies, ProjectBundleDependency{
			Key:            "tts:" + engineID,
			Label:          engine.Label,
			Detail:         detail,
			Status:         status,
			CurrentVersion: engine.Metadata["modelVersion"],
			Missing:        status == "missing",
		})
	}
	if len(dependencies) == 0 {
		dependencies = append(dependencies, ProjectBundleDependency{
			Key:    "tts:none",
			Label:  "TTS engine",
			Detail: "No generated jobs require a TTS engine yet.",
			Status: "ready",
		})
	}
	return dependencies
}

func (service *Service) bundleConflicts(manifest ProjectBundleManifest) []ProjectBundleConflict {
	conflicts := make([]ProjectBundleConflict, 0)
	profileIDs := map[string]bool{}
	for _, profile := range manifest.Profiles {
		profileIDs[profile.ID] = true
		if strings.TrimSpace(profile.ReferenceAudio) != "" && len(bundleManifestFilesByPrefix(manifest, "profiles/"+profile.ID+"/")) == 0 {
			conflicts = append(conflicts, ProjectBundleConflict{
				Key:      "voice-reference:" + profile.ID,
				Label:    "Voice reference missing",
				Detail:   fmt.Sprintf("Voice profile %q is included without its reference audio file.", profile.Name),
				Severity: "warning",
			})
		}
	}
	for _, job := range manifest.Jobs {
		if strings.TrimSpace(job.VoiceProfileID) != "" && !profileIDs[job.VoiceProfileID] {
			conflicts = append(conflicts, ProjectBundleConflict{
				Key:         "voice-profile:" + job.VoiceProfileID,
				Label:       "Voice profile missing",
				Detail:      fmt.Sprintf("Job %q references a voice profile that is not included in the bundle.", job.ID),
				Severity:    "error",
				Blocking:    true,
				Resolutions: []BundleImportMode{BundleImportModeCopy},
			})
		}
		if job.Status == JobStatusCompleted && len(bundleManifestFilesByPrefix(manifest, "jobs/"+job.ID+"/")) == 0 {
			conflicts = append(conflicts, ProjectBundleConflict{
				Key:         "generated-audio:" + job.ID,
				Label:       "Generated audio unavailable",
				Detail:      "A completed job has no generated audio in the bundle; playback will require regeneration after import.",
				Severity:    "warning",
				Resolutions: []BundleImportMode{BundleImportModeCopy, BundleImportModeMerge, BundleImportModeReplace},
			})
		}
	}

	service.mu.RLock()
	defer service.mu.RUnlock()
	for _, project := range service.projects {
		if strings.EqualFold(strings.TrimSpace(project.Name), strings.TrimSpace(manifest.Project.Name)) {
			conflicts = append(conflicts, ProjectBundleConflict{
				Key:         "project-name:" + project.ID,
				Label:       "Project name exists",
				Detail:      fmt.Sprintf("A local project named %q already exists.", manifest.Project.Name),
				Severity:    "warning",
				Resolutions: []BundleImportMode{BundleImportModeCopy, BundleImportModeMerge, BundleImportModeReplace},
			})
			break
		}
	}
	for _, localBook := range service.books {
		for _, bundleBook := range manifest.Books {
			if duplicateBundleBookSource(localBook.BookSource, bundleBook) {
				conflicts = append(conflicts, ProjectBundleConflict{
					Key:         "source-duplicate:" + localBook.ID,
					Label:       "Source duplicate",
					Detail:      fmt.Sprintf("A local source resembling %q already exists.", firstNonEmpty(bundleBook.Title, bundleBook.SourceFile, "imported source")),
					Severity:    "warning",
					Resolutions: []BundleImportMode{BundleImportModeCopy, BundleImportModeMerge, BundleImportModeReplace},
				})
				return conflicts
			}
		}
	}
	return conflicts
}

func bundleManifestFilesByPrefix(manifest ProjectBundleManifest, prefix string) []ProjectBundleFile {
	matches := make([]ProjectBundleFile, 0)
	for _, file := range manifest.Files {
		if strings.HasPrefix(file.Path, prefix) {
			matches = append(matches, file)
		}
	}
	return matches
}

func duplicateBundleBookSource(left BookSource, right BookSource) bool {
	if left.SourceBytes > 0 && right.SourceBytes > 0 &&
		left.SourceBytes == right.SourceBytes &&
		strings.EqualFold(filepath.Base(left.SourceFile), filepath.Base(right.SourceFile)) {
		return true
	}
	return strings.TrimSpace(left.Title) != "" &&
		strings.EqualFold(strings.TrimSpace(left.Title), strings.TrimSpace(right.Title))
}

func (service *Service) prepareBundleImportProject(
	manifest ProjectBundleManifest,
	projectID string,
	mode BundleImportMode,
) (VoiceProject, []VoiceJob, []BookSource, bool, error) {
	switch mode {
	case BundleImportModeMerge, BundleImportModeReplace:
		project, err := service.GetProject(projectID)
		if err != nil {
			return VoiceProject{}, nil, nil, false, err
		}
		jobs, err := service.ListProjectJobs(project.ID)
		if err != nil {
			return VoiceProject{}, nil, nil, false, err
		}
		books, err := service.ListProjectBookSources(project.ID)
		if err != nil {
			return VoiceProject{}, nil, nil, false, err
		}
		return project, jobs, books, false, nil
	default:
		project, err := service.CreateProject(manifest.Project.Name + " (Imported)")
		if err != nil {
			return VoiceProject{}, nil, nil, false, err
		}
		return project, nil, nil, true, nil
	}
}

func (service *Service) commitBundleImportProject(
	manifest ProjectBundleManifest,
	project VoiceProject,
	originalJobs []VoiceJob,
	originalBooks []BookSource,
	mode BundleImportMode,
) (VoiceProject, error) {
	if mode == BundleImportModeReplace {
		if err := service.removeJobsByID(jobIDs(originalJobs)); err != nil {
			return VoiceProject{}, err
		}
		if err := service.removeBookSourcesByID(bookIDs(originalBooks)); err != nil {
			return VoiceProject{}, err
		}
		project.Name = manifest.Project.Name
	}
	replacePolicy := mode == BundleImportModeCopy || mode == BundleImportModeReplace
	return service.applyBundlePolicyMetadata(manifest, project, replacePolicy)
}

func (service *Service) applyBundlePolicyMetadata(
	manifest ProjectBundleManifest,
	project VoiceProject,
	replace bool,
) (VoiceProject, error) {
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

func (service *Service) cleanupFailedBundleImport(
	createdProject bool,
	projectID string,
	profiles []VoiceProfile,
	books []BookSource,
	jobs []VoiceJob,
) {
	if createdProject {
		_ = service.DeleteProject(projectID)
	} else {
		_ = service.removeJobsByID(jobIDs(jobs))
		_ = service.removeBookSourcesByID(bookIDs(books))
	}
	_ = service.removeVoiceProfilesByID(profileIDs(profiles))
}

func jobIDs(jobs []VoiceJob) []string {
	ids := make([]string, 0, len(jobs))
	for _, job := range jobs {
		ids = append(ids, job.ID)
	}
	return ids
}

func bookIDs(books []BookSource) []string {
	ids := make([]string, 0, len(books))
	for _, book := range books {
		ids = append(ids, book.ID)
	}
	return ids
}

func profileIDs(profiles []VoiceProfile) []string {
	ids := make([]string, 0, len(profiles))
	for _, profile := range profiles {
		ids = append(ids, profile.ID)
	}
	return ids
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
	if job.AudioURL == "" && job.Status == JobStatusCompleted {
		job.Status = JobStatusFailed
		job.Error = "Generated audio was not included in the imported bundle. Regenerate audio before playback."
		job.TerminalReason = JobTerminalReasonConfigurationFailed
		job.FailureKind = JobFailureKindEngine
		job.Retriable = true
		job.CompletedAt = nil
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

func (service *Service) removeJobsByID(ids []string) error {
	for _, id := range ids {
		cleanID := strings.TrimSpace(id)
		if cleanID == "" {
			continue
		}
		service.mu.Lock()
		delete(service.jobs, cleanID)
		service.mu.Unlock()
		if err := os.RemoveAll(filepath.Join(service.options.JobDataDir, cleanID)); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) removeBookSourcesByID(ids []string) error {
	for _, id := range ids {
		cleanID := strings.TrimSpace(id)
		if cleanID == "" {
			continue
		}
		service.mu.Lock()
		delete(service.books, cleanID)
		service.mu.Unlock()
		outputDir, err := filepath.Abs(filepath.Join(service.options.BookSourceDir, cleanID))
		if err == nil {
			if removeErr := os.RemoveAll(outputDir); removeErr != nil {
				return removeErr
			}
		}
	}
	return nil
}

func (service *Service) removeVoiceProfilesByID(ids []string) error {
	for _, id := range ids {
		cleanID := strings.TrimSpace(id)
		if cleanID == "" {
			continue
		}
		service.mu.Lock()
		delete(service.profiles, cleanID)
		service.mu.Unlock()
		if err := os.RemoveAll(filepath.Join(service.options.VoiceProfileDir, cleanID)); err != nil {
			return err
		}
	}
	return nil
}
