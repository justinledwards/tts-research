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
	return warnings
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
