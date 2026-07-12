package pipeline

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type projectBundleSourceFile struct {
	role       string
	bundlePath string
	sourcePath string
	bytes      int64
	sha256     string
}

func bundleFile(role string, bundlePath string, sourcePath string) (projectBundleSourceFile, bool) {
	info, err := os.Stat(sourcePath)
	if err != nil || info.IsDir() {
		return projectBundleSourceFile{}, false
	}
	hash, err := hashFile(sourcePath)
	if err != nil {
		hash = ""
	}
	return projectBundleSourceFile{
		role:       role,
		bundlePath: bundlePath,
		sourcePath: sourcePath,
		bytes:      info.Size(),
		sha256:     hash,
	}, true
}

func addFileToZip(zipWriter *zip.Writer, bundlePath string, sourcePath string) error {
	if !isSafeBundlePath(bundlePath) {
		return fmt.Errorf("unsafe bundle path %q", bundlePath)
	}
	source, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer source.Close()
	writer, err := zipWriter.Create(bundlePath)
	if err != nil {
		return err
	}
	_, err = io.Copy(writer, source)
	return err
}

func readProjectBundleManifest(bundlePath string) (ProjectBundleManifest, []*zip.File, error) {
	reader, err := zip.OpenReader(bundlePath)
	if err != nil {
		return ProjectBundleManifest{}, nil, fmt.Errorf("%w: unable to open bundle", ErrProjectBundleInvalid)
	}
	defer reader.Close()

	files := make([]*zip.File, 0, len(reader.File))
	var manifest ProjectBundleManifest
	foundManifest := false
	for _, file := range reader.File {
		if !isSafeBundlePath(file.Name) {
			return ProjectBundleManifest{}, nil, fmt.Errorf("%w: unsafe path %q", ErrProjectBundleInvalid, file.Name)
		}
		files = append(files, file)
		if file.Name != projectBundleManifestPath {
			continue
		}
		handle, err := file.Open()
		if err != nil {
			return ProjectBundleManifest{}, nil, err
		}
		decoder := json.NewDecoder(handle)
		err = decoder.Decode(&manifest)
		_ = handle.Close()
		if err != nil {
			return ProjectBundleManifest{}, nil, fmt.Errorf("%w: manifest is not valid JSON", ErrProjectBundleInvalid)
		}
		foundManifest = true
	}
	if !foundManifest {
		return ProjectBundleManifest{}, nil, fmt.Errorf("%w: manifest.json missing", ErrProjectBundleInvalid)
	}
	return manifest, files, nil
}

func bundleManifestFilesForRoleAndID(
	_ []VoiceProfileReferenceSpan,
	id string,
	role string,
	fileByPath map[string]*zip.File,
) []*zip.File {
	prefix := ""
	if role == "profile_reference" {
		prefix = filepath.ToSlash(filepath.Join("profiles", id))
	}
	if role == "job_audio" {
		prefix = filepath.ToSlash(filepath.Join("jobs", id))
	}
	files := make([]*zip.File, 0)
	for path, file := range fileByPath {
		if strings.HasPrefix(path, prefix+"/") {
			files = append(files, file)
		}
	}
	sort.SliceStable(files, func(left int, right int) bool {
		return files[left].Name < files[right].Name
	})
	return files
}

func (service *Service) writeImportedJobMetadata(job VoiceJob) error {
	outputDir := filepath.Join(service.options.JobDataDir, job.ID)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, "metadata.json"), job)
}

func (service *Service) writeVoiceProfileMetadata(profile VoiceProfile) error {
	outputDir := filepath.Join(service.options.VoiceProfileDir, profile.ID)
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, "metadata.json"), profile)
}

func extractZipFile(file *zip.File, outputPath string) error {
	if file == nil {
		return nil
	}
	if !isSafeBundlePath(file.Name) {
		return fmt.Errorf("%w: unsafe path %q", ErrProjectBundleInvalid, file.Name)
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return err
	}
	source, err := file.Open()
	if err != nil {
		return err
	}
	defer source.Close()
	tempFile, err := os.CreateTemp(filepath.Dir(outputPath), filepath.Base(outputPath)+".*")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	if _, err := io.Copy(tempFile, source); err != nil {
		_ = tempFile.Close()
		_ = os.Remove(tempPath)
		return err
	}
	if err := tempFile.Close(); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	if err := os.Rename(tempPath, outputPath); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	return os.Chmod(outputPath, 0o644)
}

func summarizeBundleQuality(jobs []VoiceJob, profiles []VoiceProfile) ProjectBundleQuality {
	durationMS := 0
	similarityTotal := 0.0
	similarityCount := 0
	likenessTotal := 0.0
	likenessCount := 0
	warnings := 0
	for _, job := range jobs {
		durationMS += job.DurationMS
		if job.VoiceCheck.Similarity > 0 {
			similarityTotal += job.VoiceCheck.Similarity
			similarityCount += 1
		}
		if job.Status == JobStatusFailed || strings.TrimSpace(job.Error) != "" {
			warnings += 1
		}
	}
	for _, profile := range profiles {
		if profile.Likeness != nil && profile.Likeness.Score > 0 {
			likenessTotal += profile.Likeness.Score
			likenessCount += 1
		}
	}
	avgSimilarity := averageOrZero(similarityTotal, similarityCount)
	avgLikeness := averageOrZero(likenessTotal, likenessCount)
	score := int(82)
	if avgSimilarity > 0 || avgLikeness > 0 {
		score = int((max(avgSimilarity, avgLikeness) * 100) + 0.5)
	}
	return ProjectBundleQuality{
		OverallScore:        clampInt(score, 0, 100),
		AverageLikeness:     avgLikeness,
		CheckerConfidence:   avgSimilarity,
		GeneratedDurationMS: durationMS,
		WarningCount:        warnings,
	}
}

func averageOrZero(total float64, count int) float64 {
	if count <= 0 {
		return 0
	}
	return total / float64(count)
}

func bundleWarnings(manifest ProjectBundleManifest, files []projectBundleSourceFile) []string {
	warnings := bundleManifestWarnings(manifest)
	if len(files) == 0 {
		warnings = append(warnings, "No generated audio or voice references are included yet.")
	}
	if !manifest.GeneratedAudioIncluded && manifest.OmittedGeneratedAudio > 0 {
		warnings = append(warnings, fmt.Sprintf("%d generated audio file(s) were intentionally omitted.", manifest.OmittedGeneratedAudio))
	}
	return warnings
}

func bundleManifestWarnings(manifest ProjectBundleManifest) []string {
	warnings := make([]string, 0)
	if len(manifest.Jobs) == 0 {
		warnings = append(warnings, "Project has no jobs yet.")
	}
	if len(manifest.Books) > 0 {
		warnings = append(warnings, "Book source metadata is included without raw uploaded PDF/EPUB files.")
	}
	if manifest.Quality.WarningCount > 0 {
		warnings = append(warnings, fmt.Sprintf("%d job warning(s) are included in the quality report.", manifest.Quality.WarningCount))
	}
	if !manifest.GeneratedAudioIncluded && manifest.OmittedGeneratedAudio > 0 {
		warnings = append(warnings, "Generated audio is not included; imported jobs will need regeneration before playback.")
	}
	return warnings
}

func projectBundleContentManifest(
	manifest ProjectBundleManifest,
	files []projectBundleSourceFile,
	omittedGeneratedAudio int,
	omittedGeneratedBytes int64,
) ([]ProjectBundleContentItem, []ProjectBundleContentItem) {
	audioBytes := sumBundleFileRole(files, "job_audio")
	contents := []ProjectBundleContentItem{
		{Key: "projectMetadata", Label: "Project metadata", Detail: "Project identity, speech policy, run settings, and portable manifest.", Included: true, Required: true},
		{Key: "sourceText", Label: "Source text", Detail: "Prepared source and book metadata already normalized for narration.", Included: true, Required: true},
		{Key: "normalizedScript", Label: "Script (normalized)", Detail: "Listener-ready text, segments, warnings, and per-job quality state.", Included: true, Required: true},
		{Key: "voiceReferences", Label: "Voice profile references", Detail: "Reference audio for voice profiles used by exported jobs.", Included: sumBundleFileRole(files, "profile_reference") > 0, Required: false, EstimatedBytes: sumBundleFileRole(files, "profile_reference")},
		{Key: "generatedAudio", Label: "Generated audio", Detail: "Rendered job audio for offline review and playback.", Included: manifest.GeneratedAudioIncluded && audioBytes > 0, Required: false, EstimatedBytes: audioBytes},
		{Key: "waveformPeaks", Label: "Waveform peaks", Detail: "Embedded timing and playback review data when present.", Included: true, Required: false},
		{Key: "telemetry", Label: "Telemetry & per-segment data", Detail: "Segment timing, retry, and checker metrics used in quality review.", Included: true, Required: false},
		{Key: "qualityReport", Label: "Quality report", Detail: "Job and voice quality summaries for independent review.", Included: true, Required: false},
		{Key: "settings", Label: "Settings and run configuration", Detail: "Portable narration settings and speech policy selections.", Included: true, Required: false},
	}
	excluded := []ProjectBundleContentItem{
		{Key: "providerSecrets", Label: "Provider secrets and credential files", Detail: "Environment tokens, credential files, and secret-like metadata are never exported.", Included: false, Required: false},
		{Key: "modelPaths", Label: "Model cache directories and absolute model paths", Detail: "Machine-specific model/cache locations stay local.", Included: false, Required: false},
		{Key: "rawUploads", Label: "Raw uploaded PDF/EPUB/source files", Detail: "Bundles carry prepared source metadata, not original raw uploads.", Included: false, Required: false},
		{Key: "browserUiState", Label: "Browser UI state and local cache", Detail: "Local UI memory, browser cache, and presentation preferences are excluded.", Included: false, Required: false},
		{Key: "partialAudio", Label: "Transient partial audio", Detail: "In-progress audio fragments and temporary runtime state are excluded.", Included: false, Required: false},
	}
	if omittedGeneratedAudio > 0 {
		excluded = append(excluded, ProjectBundleContentItem{
			Key:            "generatedAudioOmitted",
			Label:          "Generated audio omitted by export choice",
			Detail:         "The manifest records omitted audio so import can report that playback must be regenerated.",
			Included:       false,
			Required:       false,
			EstimatedBytes: omittedGeneratedBytes,
		})
	}
	return contents, excluded
}

func sanitizeBundleJob(job VoiceJob) VoiceJob {
	job.AudioPath = ""
	job.AudioURL = ""
	job.AudioPartialURL = ""
	if job.Timing != nil {
		timing := *job.Timing
		timing.HighlightMapURL = ""
		timing.HighlightMapV2URL = ""
		timing.FragmentTimingURL = ""
		timing.TokenTimingURL = ""
		timing.AlignmentQualityURL = ""
		job.Timing = &timing
	}
	job.EngineOptions = sanitizeStringMap(job.EngineOptions)
	return job
}

func sanitizeBundleProfile(profile VoiceProfile) VoiceProfile {
	profile.SourceFile = filepath.Base(profile.SourceFile)
	profile.ReferencePath = ""
	for key, target := range profile.CloneTargets {
		target.Metadata = sanitizeStringMap(target.Metadata)
		if target.Validation != nil {
			validation := *target.Validation
			validation.GeneratedPath = ""
			target.Validation = &validation
		}
		profile.CloneTargets[key] = target
	}
	for key, artifact := range profile.CloneArtifacts {
		artifact.Path = ""
		artifact.Metadata = sanitizeStringMap(artifact.Metadata)
		profile.CloneArtifacts[key] = artifact
	}
	return profile
}

func sanitizeBundleBookSource(book BookSource) BookSource {
	book.SourceFile = filepath.Base(book.SourceFile)
	return book
}

func sanitizeStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return input
	}
	output := map[string]string{}
	for key, value := range input {
		normalized := strings.ToLower(key)
		if strings.Contains(normalized, "secret") ||
			strings.Contains(normalized, "token") ||
			strings.Contains(normalized, "credential") ||
			strings.Contains(normalized, "key") ||
			strings.Contains(normalized, "cache") ||
			strings.Contains(normalized, "path") {
			continue
		}
		if filepath.IsAbs(value) {
			continue
		}
		output[key] = value
	}
	return output
}

func validateProjectBundleFiles(manifest ProjectBundleManifest, bundlePath string) []ProjectBundleValidationItem {
	items := []ProjectBundleValidationItem{
		{Key: "manifest", Label: "Manifest", Detail: "manifest.json is readable.", Status: "ok"},
	}
	reader, err := zip.OpenReader(bundlePath)
	if err != nil {
		return append(items, ProjectBundleValidationItem{Key: "zip", Label: "Bundle ZIP", Detail: "Bundle could not be reopened for checksum validation.", Status: "error", Blocking: true})
	}
	defer reader.Close()
	fileByPath := map[string]*zip.File{}
	for _, file := range reader.File {
		fileByPath[file.Name] = file
	}
	for _, expected := range manifest.Files {
		file := fileByPath[expected.Path]
		if file == nil {
			items = append(items, ProjectBundleValidationItem{Key: "missing:" + expected.Path, Label: "Missing file", Detail: fmt.Sprintf("%s is listed in the manifest but missing from the ZIP.", expected.Path), Status: "error", Blocking: true})
			continue
		}
		if expected.SHA256 == "" {
			continue
		}
		actual, err := hashZipFile(file)
		if err != nil || actual != expected.SHA256 {
			items = append(items, ProjectBundleValidationItem{Key: "hash:" + expected.Path, Label: "Hash mismatch", Detail: fmt.Sprintf("%s did not match its manifest checksum.", expected.Path), Status: "error", Blocking: true})
		}
	}
	if bundleContainsLegacyLocalPaths(manifest) {
		items = append(items, ProjectBundleValidationItem{Key: "legacyLocalPaths", Label: "Legacy local paths", Detail: "This bundle contains legacy local path fields; import ignores them and writes new local paths.", Status: "warning"})
	}
	if manifest.OmittedGeneratedAudio > 0 {
		items = append(items, ProjectBundleValidationItem{Key: "audioOmitted", Label: "Generated audio omitted", Detail: "Generated audio was intentionally excluded from export.", Status: "warning"})
	}
	return items
}

func hashZipFile(file *zip.File) (string, error) {
	handle, err := file.Open()
	if err != nil {
		return "", err
	}
	defer handle.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, handle); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func bundleContainsLegacyLocalPaths(manifest ProjectBundleManifest) bool {
	for _, job := range manifest.Jobs {
		if filepath.IsAbs(job.AudioPath) || filepath.IsAbs(job.AudioPartialURL) {
			return true
		}
	}
	for _, profile := range manifest.Profiles {
		if filepath.IsAbs(profile.ReferencePath) {
			return true
		}
		for _, artifact := range profile.CloneArtifacts {
			if filepath.IsAbs(artifact.Path) {
				return true
			}
		}
	}
	return false
}

func countBundleGeneratedAudio(files []projectBundleSourceFile) int {
	count := 0
	for _, file := range files {
		if file.role == "job_audio" {
			count += 1
		}
	}
	return count
}

func countManifestGeneratedAudio(manifest ProjectBundleManifest) int {
	count := 0
	for _, file := range manifest.Files {
		if file.Role == "job_audio" {
			count += 1
		}
	}
	return count
}

func sumBundleFileRole(files []projectBundleSourceFile, role string) int64 {
	total := int64(0)
	for _, file := range files {
		if file.role == role {
			total += file.bytes
		}
	}
	return total
}

func hashFile(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func hashString(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}

func isSafeBundlePath(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	if filepath.IsAbs(path) {
		return false
	}
	clean := filepath.Clean(path)
	return clean != "." && clean != ".." && !strings.HasPrefix(clean, ".."+string(filepath.Separator))
}

func projectBundleFileName(projectName string) string {
	name := strings.ToLower(strings.TrimSpace(projectName))
	if name == "" {
		name = "voice-studio-project"
	}
	replacer := strings.NewReplacer(" ", "-", "/", "-", "\\", "-", ":", "-", ".", "-")
	name = replacer.Replace(name)
	name = strings.Trim(name, "-")
	if name == "" {
		name = "voice-studio-project"
	}
	return name + ".voice-studio.zip"
}
