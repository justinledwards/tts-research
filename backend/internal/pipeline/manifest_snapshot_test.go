package pipeline

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func TestPersistReadingUnitManifestStoresAndReloadsSchemaShapedSnapshot(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	generatedAt := time.Date(2026, 5, 17, 1, 12, 4, 0, time.UTC)
	degraded := false

	manifest, err := service.PersistReadingUnitManifest(ReadingUnitManifest{
		ManifestID:           "rum/unsafe:001",
		SourceID:             "source/unsafe:alpha",
		SourceRevisionID:     "rev/unsafe:one",
		ExtractionRevisionID: "er-md-001",
		ManifestRevision:     1,
		State:                ManifestSnapshotStateCurrent,
		GeneratedAt:          generatedAt,
		Units: []ReadingUnitManifestUnit{
			{
				UnitID:      "unit-md-0001",
				OrderKey:    "00000001",
				NodeID:      "md-0001",
				Readiness:   ReadingUnitReadinessAlignable,
				ContentIRID: "contract-markdown",
				Locator: map[string]any{
					"type": "markdown",
					"markdown": map[string]any{
						"path":        "contract.md",
						"lineStart":   float64(3),
						"lineEnd":     float64(3),
						"columnStart": float64(1),
						"columnEnd":   float64(28),
						"astPath":     "/children/1",
					},
				},
				Fingerprint: "fp-unit-md-0001-v1",
				Warnings:    []string{},
			},
		},
		Summary: ReadingUnitManifestSummary{
			UnitCount:       1,
			ReadableCount:   1,
			NarratableCount: 1,
			BlockedCount:    0,
			PendingCount:    0,
			Degraded:        &degraded,
		},
	})
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest returned error: %v", err)
	}
	if manifest.SchemaVersion != readingUnitManifestSchemaVersion {
		t.Fatalf("schemaVersion = %q, want %q", manifest.SchemaVersion, readingUnitManifestSchemaVersion)
	}

	stored, err := service.GetReadingUnitManifest("rum/unsafe:001")
	if err != nil {
		t.Fatalf("GetReadingUnitManifest returned error: %v", err)
	}
	if stored.SourceID != "source/unsafe:alpha" || stored.SourceRevisionID != "rev/unsafe:one" || stored.State != ManifestSnapshotStateCurrent {
		t.Fatalf("stored manifest = %#v, want schema-shaped source/revision/current state", stored)
	}
	if stored.Units[0].Locator["type"] != "markdown" || stored.Units[0].Fingerprint != "fp-unit-md-0001-v1" {
		t.Fatalf("stored unit = %#v, want locator and fingerprint preserved", stored.Units[0])
	}

	manifestPath := filepath.Join(
		options.SourceLifecycleDataDir,
		sourceLifecycleDataPathID("source/unsafe:alpha"),
		"revisions",
		sourceLifecycleDataPathID("rev/unsafe:one"),
		manifestSnapshotDirName,
		string(ManifestSnapshotKindReadingUnit),
		sourceLifecycleDataPathID("rum/unsafe:001")+manifestSnapshotExt,
	)
	var disk ReadingUnitManifest
	readSourceLifecycleJSON(t, manifestPath, &disk)
	if disk.ManifestID != "rum/unsafe:001" || disk.Units[0].Readiness != ReadingUnitReadinessAlignable {
		t.Fatalf("disk manifest = %#v, want snapshot under safe source/revision path", disk)
	}

	reloaded := NewService(nil, nil, nil, options)
	reloadedCurrent, err := reloaded.GetCurrentReadingUnitManifest("source/unsafe:alpha", "rev/unsafe:one")
	if err != nil {
		t.Fatalf("reloaded GetCurrentReadingUnitManifest returned error: %v", err)
	}
	if reloadedCurrent.ManifestID != "rum/unsafe:001" || reloadedCurrent.GeneratedAt != generatedAt {
		t.Fatalf("reloaded current = %#v, want persisted current manifest", reloadedCurrent)
	}
}

func TestPersistReadalongManifestRetrievesByManifestCurrentAndReadingUnitManifestID(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	generatedAt := time.Date(2026, 5, 17, 1, 12, 5, 0, time.UTC)

	manifest, err := service.PersistReadalongManifest(ReadalongManifest{
		ManifestID:               "ram-md-002",
		SourceID:                 "contract-markdown",
		SourceRevisionID:         "sr-md-002",
		ExtractionRevisionID:     "er-md-002",
		ReadingUnitManifestID:    "rum-md-002",
		ManifestRevision:         2,
		State:                    ManifestSnapshotStateCurrent,
		GeneratedAt:              generatedAt,
		UnitIDs:                  []string{"unit-md-0001"},
		SpeechPlanIDs:            []string{"contract-markdown"},
		AudioArtifactIDs:         []string{"audio-md-checked", "audio-md-interrupted"},
		HighlightMapIDs:          []string{"contract-audio-word"},
		ArtifactCompatibilityIDs: []string{"compat-md-checked"},
		SyncFidelityDecisionIDs:  []string{"sync-md-exact", "sync-md-low-resource"},
		ProgressIDs:              []string{"progress-md-current", "progress-md-remapped"},
		RepairOverlayIDs:         []string{"repair-md-001"},
	})
	if err != nil {
		t.Fatalf("PersistReadalongManifest returned error: %v", err)
	}
	if manifest.SchemaVersion != readalongManifestSchemaVersion {
		t.Fatalf("schemaVersion = %q, want %q", manifest.SchemaVersion, readalongManifestSchemaVersion)
	}

	byID, err := service.GetReadalongManifest("ram-md-002")
	if err != nil {
		t.Fatalf("GetReadalongManifest returned error: %v", err)
	}
	if !reflect.DeepEqual(byID.AudioArtifactIDs, []string{"audio-md-checked", "audio-md-interrupted"}) {
		t.Fatalf("audioArtifactIds = %#v, want schema-shaped IDs", byID.AudioArtifactIDs)
	}

	current, err := service.GetCurrentReadalongManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("GetCurrentReadalongManifest returned error: %v", err)
	}
	if current.ManifestID != "ram-md-002" {
		t.Fatalf("current manifest ID = %q, want ram-md-002", current.ManifestID)
	}

	byReadingUnit, err := service.ListReadalongManifestsByReadingUnitManifestID("rum-md-002")
	if err != nil {
		t.Fatalf("ListReadalongManifestsByReadingUnitManifestID returned error: %v", err)
	}
	if len(byReadingUnit) != 1 || byReadingUnit[0].ManifestID != "ram-md-002" {
		t.Fatalf("readalong manifests by reading-unit manifest = %#v, want ram-md-002", byReadingUnit)
	}

	reloaded := NewService(nil, nil, nil, options)
	reloadedByReadingUnit, err := reloaded.ListReadalongManifestsByReadingUnitManifestID("rum-md-002")
	if err != nil {
		t.Fatalf("reloaded ListReadalongManifestsByReadingUnitManifestID returned error: %v", err)
	}
	if len(reloadedByReadingUnit) != 1 || reloadedByReadingUnit[0].ManifestID != "ram-md-002" {
		t.Fatalf("reloaded readalong manifests by reading-unit manifest = %#v, want ram-md-002", reloadedByReadingUnit)
	}
}

func TestManifestSnapshotsSupersedePreviousCurrentPerSourceRevisionAndKind(t *testing.T) {
	service := newSourceLifecycleTestService(t)

	first, err := service.PersistReadingUnitManifest(testReadingUnitManifest("rum-md-001", 1, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest first returned error: %v", err)
	}
	secondInput := testReadingUnitManifest("rum-md-002", 2, ManifestSnapshotStateCurrent)
	secondInput.Units[0].Fingerprint = "fp-unit-md-0001-v2"
	second, err := service.PersistReadingUnitManifest(secondInput)
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest second returned error: %v", err)
	}
	if first.ManifestID == second.ManifestID {
		t.Fatalf("test setup produced same manifest ID %q", first.ManifestID)
	}

	superseded, err := service.GetReadingUnitManifest("rum-md-001")
	if err != nil {
		t.Fatalf("GetReadingUnitManifest superseded returned error: %v", err)
	}
	if superseded.State != ManifestSnapshotStateSuperseded || superseded.SupersededByManifestID != "rum-md-002" {
		t.Fatalf("superseded reading-unit manifest = %#v, want superseded by rum-md-002", superseded)
	}
	current, err := service.GetCurrentReadingUnitManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("GetCurrentReadingUnitManifest returned error: %v", err)
	}
	if current.ManifestID != "rum-md-002" || current.Units[0].Fingerprint != "fp-unit-md-0001-v2" {
		t.Fatalf("current reading-unit manifest = %#v, want rum-md-002", current)
	}

	_, err = service.PersistReadalongManifest(testReadalongManifest("ram-md-001", "rum-md-001", 1, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadalongManifest first returned error: %v", err)
	}
	_, err = service.PersistReadalongManifest(testReadalongManifest("ram-md-002", "rum-md-002", 2, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadalongManifest second returned error: %v", err)
	}
	oldReadalong, err := service.GetReadalongManifest("ram-md-001")
	if err != nil {
		t.Fatalf("GetReadalongManifest superseded returned error: %v", err)
	}
	if oldReadalong.State != ManifestSnapshotStateSuperseded || oldReadalong.SupersededByManifestID != "ram-md-002" {
		t.Fatalf("superseded readalong manifest = %#v, want superseded by ram-md-002", oldReadalong)
	}
	currentReadalong, err := service.GetCurrentReadalongManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("GetCurrentReadalongManifest returned error: %v", err)
	}
	if currentReadalong.ManifestID != "ram-md-002" || currentReadalong.ReadingUnitManifestID != "rum-md-002" {
		t.Fatalf("current readalong manifest = %#v, want ram-md-002 tied to rum-md-002", currentReadalong)
	}
}

func TestManifestSnapshotStorageRejectsAndReportsMissingIDs(t *testing.T) {
	service := newSourceLifecycleTestService(t)

	_, err := service.GetReadingUnitManifest("")
	if !errors.Is(err, ErrManifestSnapshotNotFound) {
		t.Fatalf("GetReadingUnitManifest empty error = %v, want ErrManifestSnapshotNotFound", err)
	}
	_, err = service.GetCurrentReadalongManifest("contract-markdown", "")
	if !errors.Is(err, ErrManifestSnapshotNotFound) {
		t.Fatalf("GetCurrentReadalongManifest empty revision error = %v, want ErrManifestSnapshotNotFound", err)
	}
	_, err = service.ListReadalongManifestsByReadingUnitManifestID("missing-rum")
	if !errors.Is(err, ErrManifestSnapshotNotFound) {
		t.Fatalf("ListReadalongManifestsByReadingUnitManifestID missing error = %v, want ErrManifestSnapshotNotFound", err)
	}

	missingSource := testReadingUnitManifest("rum-missing-source", 1, ManifestSnapshotStateCurrent)
	missingSource.SourceID = ""
	_, err = service.PersistReadingUnitManifest(missingSource)
	if !errors.Is(err, ErrManifestSnapshotInvalid) {
		t.Fatalf("PersistReadingUnitManifest missing source error = %v, want ErrManifestSnapshotInvalid", err)
	}
	missingReadingUnitManifestID := testReadalongManifest("ram-missing-rum", "", 1, ManifestSnapshotStateCurrent)
	_, err = service.PersistReadalongManifest(missingReadingUnitManifestID)
	if !errors.Is(err, ErrManifestSnapshotInvalid) {
		t.Fatalf("PersistReadalongManifest missing reading-unit manifest ID error = %v, want ErrManifestSnapshotInvalid", err)
	}
}

func TestManifestSnapshotStorageCreatesDeterministicIDsWhenManifestIDIsOmitted(t *testing.T) {
	service := newSourceLifecycleTestService(t)

	first, err := service.PersistReadingUnitManifest(testReadingUnitManifest("", 3, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest first returned error: %v", err)
	}
	second, err := service.PersistReadingUnitManifest(testReadingUnitManifest("", 3, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest second returned error: %v", err)
	}
	if first.ManifestID == "" || first.ManifestID != second.ManifestID {
		t.Fatalf("deterministic reading-unit manifest IDs = %q/%q, want same non-empty ID", first.ManifestID, second.ManifestID)
	}

	readalongFirst, err := service.PersistReadalongManifest(testReadalongManifest("", first.ManifestID, 3, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadalongManifest first returned error: %v", err)
	}
	readalongSecond, err := service.PersistReadalongManifest(testReadalongManifest("", first.ManifestID, 3, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadalongManifest second returned error: %v", err)
	}
	if readalongFirst.ManifestID == "" || readalongFirst.ManifestID != readalongSecond.ManifestID {
		t.Fatalf("deterministic readalong manifest IDs = %q/%q, want same non-empty ID", readalongFirst.ManifestID, readalongSecond.ManifestID)
	}
}

func TestManifestSnapshotNewCurrentWriteFailureLeavesPreviousCurrent(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	firstReadingUnit, err := service.PersistReadingUnitManifest(testReadingUnitManifest("rum-md-001", 1, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest first returned error: %v", err)
	}
	firstReadalong, err := service.PersistReadalongManifest(testReadalongManifest("ram-md-001", "rum-md-001", 1, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadalongManifest first returned error: %v", err)
	}

	writeErr := errors.New("injected new manifest write failure")
	withManifestSnapshotJSONWriter(t, func(path string, payload interface{}) error {
		switch manifest := payload.(type) {
		case ReadingUnitManifest:
			if manifest.ManifestID == "rum-md-002" {
				return writeErr
			}
		case ReadalongManifest:
			if manifest.ManifestID == "ram-md-002" {
				return writeErr
			}
		}
		return writeJSONAtomic(path, payload)
	})

	if _, err := service.PersistReadingUnitManifest(testReadingUnitManifest("rum-md-002", 2, ManifestSnapshotStateCurrent)); !errors.Is(err, writeErr) {
		t.Fatalf("PersistReadingUnitManifest second error = %v, want injected new-write failure", err)
	}
	currentReadingUnit, err := service.GetCurrentReadingUnitManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("GetCurrentReadingUnitManifest after failed write returned error: %v", err)
	}
	if currentReadingUnit.ManifestID != firstReadingUnit.ManifestID {
		t.Fatalf("memory current reading-unit = %q, want previous %q", currentReadingUnit.ManifestID, firstReadingUnit.ManifestID)
	}
	var diskReadingUnit ReadingUnitManifest
	readSourceLifecycleJSON(t, service.readingUnitManifestPath(firstReadingUnit), &diskReadingUnit)
	if diskReadingUnit.State != ManifestSnapshotStateCurrent || diskReadingUnit.SupersededByManifestID != "" {
		t.Fatalf("disk previous reading-unit = %#v, want still current after failed new write", diskReadingUnit)
	}
	if _, statErr := os.Stat(service.readingUnitManifestPath(testReadingUnitManifest("rum-md-002", 2, ManifestSnapshotStateCurrent))); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("new reading-unit manifest stat error = %v, want not exist after failed new write", statErr)
	}

	if _, err := service.PersistReadalongManifest(testReadalongManifest("ram-md-002", "rum-md-002", 2, ManifestSnapshotStateCurrent)); !errors.Is(err, writeErr) {
		t.Fatalf("PersistReadalongManifest second error = %v, want injected new-write failure", err)
	}
	currentReadalong, err := service.GetCurrentReadalongManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("GetCurrentReadalongManifest after failed write returned error: %v", err)
	}
	if currentReadalong.ManifestID != firstReadalong.ManifestID {
		t.Fatalf("memory current readalong = %q, want previous %q", currentReadalong.ManifestID, firstReadalong.ManifestID)
	}
	var diskReadalong ReadalongManifest
	readSourceLifecycleJSON(t, service.readalongManifestPath(firstReadalong), &diskReadalong)
	if diskReadalong.State != ManifestSnapshotStateCurrent || diskReadalong.SupersededByManifestID != "" {
		t.Fatalf("disk previous readalong = %#v, want still current after failed new write", diskReadalong)
	}
	if _, statErr := os.Stat(service.readalongManifestPath(testReadalongManifest("ram-md-002", "rum-md-002", 2, ManifestSnapshotStateCurrent))); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("new readalong manifest stat error = %v, want not exist after failed new write", statErr)
	}
}

func TestManifestSnapshotPreviousSupersedeWriteFailureKeepsDeterministicCurrent(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	firstReadingUnit, err := service.PersistReadingUnitManifest(testReadingUnitManifest("rum-md-001", 1, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest first returned error: %v", err)
	}
	firstReadalong, err := service.PersistReadalongManifest(testReadalongManifest("ram-md-001", "rum-md-001", 1, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadalongManifest first returned error: %v", err)
	}

	writeErr := errors.New("injected previous supersede write failure")
	withManifestSnapshotJSONWriter(t, func(path string, payload interface{}) error {
		switch manifest := payload.(type) {
		case ReadingUnitManifest:
			if manifest.ManifestID == "rum-md-001" && manifest.State == ManifestSnapshotStateSuperseded {
				return writeErr
			}
		case ReadalongManifest:
			if manifest.ManifestID == "ram-md-001" && manifest.State == ManifestSnapshotStateSuperseded {
				return writeErr
			}
		}
		return writeJSONAtomic(path, payload)
	})

	secondReadingUnit := testReadingUnitManifest("rum-md-002", 2, ManifestSnapshotStateCurrent)
	if _, err := service.PersistReadingUnitManifest(secondReadingUnit); !errors.Is(err, writeErr) {
		t.Fatalf("PersistReadingUnitManifest second error = %v, want injected previous-update failure", err)
	}
	currentReadingUnit, err := service.GetCurrentReadingUnitManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("GetCurrentReadingUnitManifest after previous-update failure returned error: %v", err)
	}
	if currentReadingUnit.ManifestID != "rum-md-002" {
		t.Fatalf("memory current reading-unit = %q, want new rum-md-002", currentReadingUnit.ManifestID)
	}
	previousReadingUnit, err := service.GetReadingUnitManifest(firstReadingUnit.ManifestID)
	if err != nil {
		t.Fatalf("GetReadingUnitManifest previous returned error: %v", err)
	}
	if previousReadingUnit.State != ManifestSnapshotStateCurrent || previousReadingUnit.SupersededByManifestID != "" {
		t.Fatalf("memory previous reading-unit = %#v, want to match unsuperseded disk state after failed previous update", previousReadingUnit)
	}
	var diskPreviousReadingUnit ReadingUnitManifest
	readSourceLifecycleJSON(t, service.readingUnitManifestPath(firstReadingUnit), &diskPreviousReadingUnit)
	if diskPreviousReadingUnit.State != ManifestSnapshotStateCurrent || diskPreviousReadingUnit.SupersededByManifestID != "" {
		t.Fatalf("disk previous reading-unit = %#v, want still current after failed previous update", diskPreviousReadingUnit)
	}
	var diskNewReadingUnit ReadingUnitManifest
	readSourceLifecycleJSON(t, service.readingUnitManifestPath(secondReadingUnit), &diskNewReadingUnit)
	if diskNewReadingUnit.ManifestID != "rum-md-002" || diskNewReadingUnit.State != ManifestSnapshotStateCurrent {
		t.Fatalf("disk new reading-unit = %#v, want persisted current", diskNewReadingUnit)
	}

	secondReadalong := testReadalongManifest("ram-md-002", "rum-md-002", 2, ManifestSnapshotStateCurrent)
	if _, err := service.PersistReadalongManifest(secondReadalong); !errors.Is(err, writeErr) {
		t.Fatalf("PersistReadalongManifest second error = %v, want injected previous-update failure", err)
	}
	currentReadalong, err := service.GetCurrentReadalongManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("GetCurrentReadalongManifest after previous-update failure returned error: %v", err)
	}
	if currentReadalong.ManifestID != "ram-md-002" {
		t.Fatalf("memory current readalong = %q, want new ram-md-002", currentReadalong.ManifestID)
	}
	previousReadalong, err := service.GetReadalongManifest(firstReadalong.ManifestID)
	if err != nil {
		t.Fatalf("GetReadalongManifest previous returned error: %v", err)
	}
	if previousReadalong.State != ManifestSnapshotStateCurrent || previousReadalong.SupersededByManifestID != "" {
		t.Fatalf("memory previous readalong = %#v, want to match unsuperseded disk state after failed previous update", previousReadalong)
	}
	var diskPreviousReadalong ReadalongManifest
	readSourceLifecycleJSON(t, service.readalongManifestPath(firstReadalong), &diskPreviousReadalong)
	if diskPreviousReadalong.State != ManifestSnapshotStateCurrent || diskPreviousReadalong.SupersededByManifestID != "" {
		t.Fatalf("disk previous readalong = %#v, want still current after failed previous update", diskPreviousReadalong)
	}
	var diskNewReadalong ReadalongManifest
	readSourceLifecycleJSON(t, service.readalongManifestPath(secondReadalong), &diskNewReadalong)
	if diskNewReadalong.ManifestID != "ram-md-002" || diskNewReadalong.State != ManifestSnapshotStateCurrent {
		t.Fatalf("disk new readalong = %#v, want persisted current", diskNewReadalong)
	}

	reloaded := NewService(nil, nil, nil, options)
	reloadedReadingUnit, err := reloaded.GetCurrentReadingUnitManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("reloaded GetCurrentReadingUnitManifest returned error: %v", err)
	}
	if reloadedReadingUnit.ManifestID != "rum-md-002" {
		t.Fatalf("reloaded current reading-unit = %q, want deterministic newer current rum-md-002", reloadedReadingUnit.ManifestID)
	}
	reloadedReadalong, err := reloaded.GetCurrentReadalongManifest("contract-markdown", "sr-md-002")
	if err != nil {
		t.Fatalf("reloaded GetCurrentReadalongManifest returned error: %v", err)
	}
	if reloadedReadalong.ManifestID != "ram-md-002" {
		t.Fatalf("reloaded current readalong = %q, want deterministic newer current ram-md-002", reloadedReadalong.ManifestID)
	}
}

func TestManifestSnapshotStorageDeepClonesNestedMetadataValues(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	readingUnitInput := testReadingUnitManifest("rum-md-deep-clone", 4, ManifestSnapshotStateCurrent)
	readingUnitInput.Metadata = map[string]any{
		"nested":  map[string]any{"name": "original"},
		"items":   []any{map[string]any{"id": "item-original"}},
		"strings": []string{"alpha", "beta"},
	}
	readingUnitInput.Units[0].Locator = map[string]any{
		"markdown": map[string]any{"path": "original.md"},
		"spans":    []any{map[string]any{"offset": float64(1)}},
	}
	readingUnitInput.Units[0].Provenance = map[string]any{
		"steps": []any{map[string]any{"tool": "extractor"}},
	}
	if _, err := service.PersistReadingUnitManifest(readingUnitInput); err != nil {
		t.Fatalf("PersistReadingUnitManifest returned error: %v", err)
	}

	readingUnitInput.Metadata["nested"].(map[string]any)["name"] = "mutated-input"
	readingUnitInput.Metadata["items"].([]any)[0].(map[string]any)["id"] = "mutated-input"
	readingUnitInput.Metadata["strings"].([]string)[0] = "mutated-input"
	readingUnitInput.Units[0].Locator["markdown"].(map[string]any)["path"] = "mutated-input.md"
	readingUnitInput.Units[0].Locator["spans"].([]any)[0].(map[string]any)["offset"] = float64(99)
	readingUnitInput.Units[0].Provenance["steps"].([]any)[0].(map[string]any)["tool"] = "mutated-input"

	storedReadingUnit, err := service.GetReadingUnitManifest("rum-md-deep-clone")
	if err != nil {
		t.Fatalf("GetReadingUnitManifest returned error: %v", err)
	}
	storedReadingUnit.Metadata["nested"].(map[string]any)["name"] = "mutated-getter"
	storedReadingUnit.Metadata["items"].([]any)[0].(map[string]any)["id"] = "mutated-getter"
	storedReadingUnit.Metadata["strings"].([]string)[1] = "mutated-getter"
	storedReadingUnit.Units[0].Locator["markdown"].(map[string]any)["path"] = "mutated-getter.md"
	storedReadingUnit.Units[0].Locator["spans"].([]any)[0].(map[string]any)["offset"] = float64(100)
	storedReadingUnit.Units[0].Provenance["steps"].([]any)[0].(map[string]any)["tool"] = "mutated-getter"

	freshReadingUnit, err := service.GetReadingUnitManifest("rum-md-deep-clone")
	if err != nil {
		t.Fatalf("GetReadingUnitManifest fresh returned error: %v", err)
	}
	if freshReadingUnit.Metadata["nested"].(map[string]any)["name"] != "original" || freshReadingUnit.Metadata["items"].([]any)[0].(map[string]any)["id"] != "item-original" || !reflect.DeepEqual(freshReadingUnit.Metadata["strings"], []string{"alpha", "beta"}) {
		t.Fatalf("fresh reading-unit metadata = %#v, want original nested values", freshReadingUnit.Metadata)
	}
	if freshReadingUnit.Units[0].Locator["markdown"].(map[string]any)["path"] != "original.md" || freshReadingUnit.Units[0].Locator["spans"].([]any)[0].(map[string]any)["offset"] != float64(1) {
		t.Fatalf("fresh reading-unit locator = %#v, want original nested values", freshReadingUnit.Units[0].Locator)
	}
	if freshReadingUnit.Units[0].Provenance["steps"].([]any)[0].(map[string]any)["tool"] != "extractor" {
		t.Fatalf("fresh reading-unit provenance = %#v, want original nested values", freshReadingUnit.Units[0].Provenance)
	}

	readalongInput := testReadalongManifest("ram-md-deep-clone", "rum-md-deep-clone", 4, ManifestSnapshotStateCurrent)
	readalongInput.Metadata = map[string]any{
		"nested":  map[string]any{"name": "readalong-original"},
		"items":   []any{map[string]any{"id": "readalong-item-original"}},
		"strings": []string{"gamma", "delta"},
	}
	if _, err := service.PersistReadalongManifest(readalongInput); err != nil {
		t.Fatalf("PersistReadalongManifest returned error: %v", err)
	}
	readalongInput.Metadata["nested"].(map[string]any)["name"] = "mutated-input"
	readalongInput.Metadata["items"].([]any)[0].(map[string]any)["id"] = "mutated-input"
	readalongInput.Metadata["strings"].([]string)[0] = "mutated-input"

	storedReadalong, err := service.GetReadalongManifest("ram-md-deep-clone")
	if err != nil {
		t.Fatalf("GetReadalongManifest returned error: %v", err)
	}
	storedReadalong.Metadata["nested"].(map[string]any)["name"] = "mutated-getter"
	storedReadalong.Metadata["items"].([]any)[0].(map[string]any)["id"] = "mutated-getter"
	storedReadalong.Metadata["strings"].([]string)[1] = "mutated-getter"

	freshReadalong, err := service.GetReadalongManifest("ram-md-deep-clone")
	if err != nil {
		t.Fatalf("GetReadalongManifest fresh returned error: %v", err)
	}
	if freshReadalong.Metadata["nested"].(map[string]any)["name"] != "readalong-original" || freshReadalong.Metadata["items"].([]any)[0].(map[string]any)["id"] != "readalong-item-original" || !reflect.DeepEqual(freshReadalong.Metadata["strings"], []string{"gamma", "delta"}) {
		t.Fatalf("fresh readalong metadata = %#v, want original nested values", freshReadalong.Metadata)
	}
}

func withManifestSnapshotJSONWriter(t *testing.T, writer func(path string, payload interface{}) error) {
	t.Helper()
	previous := writeJSONAtomicForManifestSnapshots
	writeJSONAtomicForManifestSnapshots = writer
	t.Cleanup(func() {
		writeJSONAtomicForManifestSnapshots = previous
	})
}

func testReadingUnitManifest(manifestID string, revision int, state ManifestSnapshotState) ReadingUnitManifest {
	degraded := false
	return ReadingUnitManifest{
		ManifestID:           manifestID,
		SourceID:             "contract-markdown",
		SourceRevisionID:     "sr-md-002",
		ExtractionRevisionID: "er-md-002",
		ManifestRevision:     revision,
		State:                state,
		GeneratedAt:          time.Date(2026, 5, 17, 1, 12, revision, 0, time.UTC),
		Units: []ReadingUnitManifestUnit{
			{
				UnitID:      "unit-md-0001",
				OrderKey:    "00000001",
				NodeID:      "md-0001",
				Readiness:   ReadingUnitReadinessAlignable,
				ContentIRID: "contract-markdown",
				Locator: map[string]any{
					"type": "markdown",
				},
				Fingerprint: "fp-unit-md-0001-v1",
			},
		},
		Summary: ReadingUnitManifestSummary{
			UnitCount:       1,
			ReadableCount:   1,
			NarratableCount: 1,
			BlockedCount:    0,
			PendingCount:    0,
			Degraded:        &degraded,
		},
	}
}

func testReadalongManifest(manifestID string, readingUnitManifestID string, revision int, state ManifestSnapshotState) ReadalongManifest {
	return ReadalongManifest{
		ManifestID:            manifestID,
		SourceID:              "contract-markdown",
		SourceRevisionID:      "sr-md-002",
		ExtractionRevisionID:  "er-md-002",
		ReadingUnitManifestID: readingUnitManifestID,
		ManifestRevision:      revision,
		State:                 state,
		GeneratedAt:           time.Date(2026, 5, 17, 1, 13, revision, 0, time.UTC),
		UnitIDs:               []string{"unit-md-0001"},
		SpeechPlanIDs:         []string{"contract-markdown"},
	}
}
