package highlightmap

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
)

const (
	HighlightMapFilename     = "highlight-map.json"
	HighlightMapV2Filename   = "highlight-map.v2.json"
	FragmentTimingFilename   = "fragment-timing.json"
	TokenTimingFilename      = "token-timing.json"
	AlignmentQualityFilename = "alignment-quality.json"
)

func PersistArtifacts(
	jobDir string,
	highlightMap HighlightMap,
	fragments alignment.FragmentTimingArtifact,
	tokens alignment.TokenTimingArtifact,
) error {
	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		return err
	}
	if err := writeAtomicJSON(filepath.Join(jobDir, HighlightMapFilename), highlightMap); err != nil {
		return err
	}
	if err := writeAtomicJSON(filepath.Join(jobDir, FragmentTimingFilename), fragments); err != nil {
		return err
	}
	return writeAtomicJSON(filepath.Join(jobDir, TokenTimingFilename), tokens)
}

func ReadHighlightMap(jobDir string) (HighlightMap, error) {
	var payload HighlightMap
	err := readJSON(filepath.Join(jobDir, HighlightMapFilename), &payload)
	return payload, err
}

func PersistHighlightMapV2(jobDir string, highlightMap HighlightMapV2) error {
	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		return err
	}
	return writeAtomicJSON(filepath.Join(jobDir, HighlightMapV2Filename), highlightMap)
}

func ReadHighlightMapV2(jobDir string) (HighlightMapV2, error) {
	var payload HighlightMapV2
	err := readJSON(filepath.Join(jobDir, HighlightMapV2Filename), &payload)
	return payload, err
}

func PersistAlignmentQuality(jobDir string, report any) error {
	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		return err
	}
	return writeAtomicJSON(filepath.Join(jobDir, AlignmentQualityFilename), report)
}

func ReadAlignmentQuality(jobDir string, payload any) error {
	return readJSON(filepath.Join(jobDir, AlignmentQualityFilename), payload)
}

func ReadFragmentTiming(jobDir string) (alignment.FragmentTimingArtifact, error) {
	var payload alignment.FragmentTimingArtifact
	err := readJSON(filepath.Join(jobDir, FragmentTimingFilename), &payload)
	return payload, err
}

func ReadTokenTiming(jobDir string) (alignment.TokenTimingArtifact, error) {
	var payload alignment.TokenTimingArtifact
	err := readJSON(filepath.Join(jobDir, TokenTimingFilename), &payload)
	return payload, err
}

func writeAtomicJSON(path string, payload any) error {
	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmpFile, err := os.CreateTemp(dir, filepath.Base(path)+".*")
	if err != nil {
		return err
	}
	tmpName := tmpFile.Name()
	if _, err := tmpFile.Write(append(encoded, '\n')); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return os.Chmod(path, 0o644)
}

func readJSON(path string, payload any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, payload)
}
