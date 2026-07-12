package pipeline

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

func TestApplyRepairOverlayPersistsImmutableOverlaySupersedesManifestsMarksAffectedArtifactsAndRemapsProgress(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-001", "Dr Nguyen shipped v1.", "")
	oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
	oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-affected", "audio-unaffected"})
	oldReadalong.HighlightMapIDs = []string{"highlight-affected", "highlight-untracked"}
	oldReadalong.ProgressIDs = []string{"progress-repair-old", "progress-not-listed"}
	if _, err := service.PersistReadingUnitManifest(oldReading); err != nil {
		t.Fatalf("PersistReadingUnitManifest old returned error: %v", err)
	}
	if _, err := service.PersistReadalongManifest(oldReadalong); err != nil {
		t.Fatalf("PersistReadalongManifest old returned error: %v", err)
	}
	fromLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	toLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 28, "/children/1")
	oldProgress := testDurableProgress("progress-repair-old", oldReadalong.ManifestID, "sr-md-001", "audio-affected", DurableProgressStateCurrent)
	oldProgress.Position.UnitID = "unit-md-0001"
	oldProgress.LocatorEnvelope.Locator = &fromLocator
	oldProgress.LocatorEnvelope.TextQuote = "Dr Nguyen shipped v1."
	oldProgress.Position.TextQuote = "Dr Nguyen shipped v1."
	if _, err := service.PersistDurableProgress(oldProgress); err != nil {
		t.Fatalf("PersistDurableProgress old returned error: %v", err)
	}
	notListed := testDurableProgress("progress-not-listed", oldReadalong.ManifestID, "sr-md-001", "audio-affected", DurableProgressStateCurrent)
	notListed.Position.UnitID = "unit-md-0001"
	if _, err := service.PersistDurableProgress(notListed); err != nil {
		t.Fatalf("PersistDurableProgress not-listed returned error: %v", err)
	}

	overlay := repairOverlayFixture(fromLocator)
	newReading := repairReadingManifest("rum-md-repaired", "sr-md-002", 2)
	newReading.Units[0].Fingerprint = "fp-unit-md-0001-v2"
	newReadalong := repairReadalongManifest("ram-md-repaired", newReading.ManifestID, "sr-md-002", 2, []string{"audio-new-compatible"})
	revisionMap := repairRevisionMapFixture("revmap-repair-001", fromLocator, toLocator)

	application, err := service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
		Overlay:                   overlay,
		RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one.", WorkStatus: SourceLifecycleWorkStatusComplete},
		ReadingUnitManifest:       newReading,
		ReadalongManifest:         newReadalong,
		RevisionMap:               revisionMap,
		FromReadingUnitManifestID: oldReading.ManifestID,
		FromReadalongManifestID:   oldReadalong.ManifestID,
		AudioArtifacts: []ResumeAudioArtifactEvidence{
			{ArtifactID: "audio-affected", SourceID: "contract-markdown", SourceRevisionID: "sr-md-001", ReadalongManifestID: oldReadalong.ManifestID, UnitID: "unit-md-0001", SegmentID: "seg-0001", State: AudioArtifactStateChecked},
			{ArtifactID: "audio-unaffected", SourceID: "contract-markdown", SourceRevisionID: "sr-md-001", ReadalongManifestID: oldReadalong.ManifestID, UnitID: "unit-md-0002", SegmentID: "seg-0002", State: AudioArtifactStateChecked},
			{ArtifactID: "audio-missing-unit", SourceID: "contract-markdown", SourceRevisionID: "sr-md-001", ReadalongManifestID: oldReadalong.ManifestID, State: AudioArtifactStateChecked},
		},
		HighlightMapIDs: []string{"highlight-affected", "highlight-untracked", "highlight-missing"},
	})
	if err != nil {
		t.Fatalf("ApplyRepairOverlay returned error: %v", err)
	}
	if application.Overlay.OverlayID != "repair-md-001" || application.SourceRevision.RevisionID != "sr-md-002" || application.SourceRevision.RepairOverlayID != "repair-md-001" {
		t.Fatalf("application overlay/source revision = %#v/%#v, want repaired revision evidence", application.Overlay, application.SourceRevision)
	}
	if application.ReadalongManifest.ManifestID != "ram-md-repaired" || !stringSliceContains(application.ReadalongManifest.RepairOverlayIDs, "repair-md-001") {
		t.Fatalf("repaired readalong = %#v, want repair overlay binding", application.ReadalongManifest)
	}
	if len(application.StaleAudioArtifacts) != 1 || application.StaleAudioArtifacts[0].ArtifactID != "audio-affected" || application.StaleAudioArtifacts[0].NewState != AudioArtifactStateStale {
		t.Fatalf("stale artifacts = %#v, want only affected artifact marked stale", application.StaleAudioArtifacts)
	}
	if len(application.PreservedAudioArtifacts) != 2 {
		t.Fatalf("preserved artifacts = %#v, want unaffected and missing-unit artifacts preserved", application.PreservedAudioArtifacts)
	}
	if len(application.StaleHighlightArtifacts) != 2 || application.StaleHighlightArtifacts[0].ArtifactKind != "highlight_map" || application.StaleHighlightArtifacts[0].ArtifactID != "highlight-affected" || application.StaleHighlightArtifacts[1].ArtifactID != "highlight-untracked" {
		t.Fatalf("stale highlight artifacts = %#v, want manifest highlight maps marked stale", application.StaleHighlightArtifacts)
	}
	if len(application.PreservedHighlightIDs) != 1 || application.PreservedHighlightIDs[0] != "highlight-missing" {
		t.Fatalf("preserved highlight IDs = %#v, want only non-manifest highlight preserved", application.PreservedHighlightIDs)
	}
	if len(application.SupersededProgress) != 1 || application.SupersededProgress[0].ProgressID != "progress-repair-old" || application.SupersededProgress[0].State != DurableProgressStateSuperseded {
		t.Fatalf("superseded progress = %#v, want affected old progress superseded", application.SupersededProgress)
	}

	oldRevision, err := service.sourceRevisionForRepair("contract-markdown", "sr-md-001")
	if err != nil {
		t.Fatalf("old source revision lookup returned error: %v", err)
	}
	if oldRevision.RevisionState != SourceRevisionStateSuperseded || oldRevision.SupersededByRevisionID != "sr-md-002" {
		t.Fatalf("old source revision = %#v, want superseded by repaired revision", oldRevision)
	}
	storedOldReading, err := service.GetReadingUnitManifest(oldReading.ManifestID)
	if err != nil {
		t.Fatalf("GetReadingUnitManifest old returned error: %v", err)
	}
	if storedOldReading.State != ManifestSnapshotStateSuperseded || storedOldReading.SupersededByManifestID != newReading.ManifestID {
		t.Fatalf("old reading manifest = %#v, want superseded by repaired manifest", storedOldReading)
	}
	storedOldReadalong, err := service.GetReadalongManifest(oldReadalong.ManifestID)
	if err != nil {
		t.Fatalf("GetReadalongManifest old returned error: %v", err)
	}
	if storedOldReadalong.State != ManifestSnapshotStateSuperseded || storedOldReadalong.SupersededByManifestID != newReadalong.ManifestID {
		t.Fatalf("old readalong manifest = %#v, want superseded by repaired manifest", storedOldReadalong)
	}
	storedProgress, err := service.GetDurableProgress("progress-repair-old")
	if err != nil {
		t.Fatalf("GetDurableProgress old returned error: %v", err)
	}
	if storedProgress.State != DurableProgressStateSuperseded || metadataString(storedProgress.Metadata, "repairOverlayId") != "repair-md-001" || metadataString(storedProgress.Metadata, "revisionMapId") != "revmap-repair-001" {
		t.Fatalf("stored progress = %#v, want repair supersession metadata", storedProgress)
	}
	storedNotListed, err := service.GetDurableProgress("progress-not-listed")
	if err != nil {
		t.Fatalf("GetDurableProgress not-listed returned error: %v", err)
	}
	if storedNotListed.State == DurableProgressStateSuperseded {
		t.Fatalf("not-listed progress = %#v, should not supersede without manifest + revision-map progress evidence", storedNotListed)
	}

	resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: "progress-repair-old", SourceRevisionID: "sr-md-002"})
	if err != nil {
		t.Fatalf("ResolveResumeProgress repaired returned error: %v", err)
	}
	if resolution.Decision != ResumeDecisionAutoResumeRemapped || resolution.RevisionMapID != "revmap-repair-001" || resolution.StaleProgressID != "progress-repair-old" {
		t.Fatalf("resolution = %#v, want stored repair revision-map remap", resolution)
	}
	if resolution.ResolvedLocatorEnvelope.Locator == nil || !locatorsEqual(*resolution.ResolvedLocatorEnvelope.Locator, toLocator) {
		t.Fatalf("resolved locator = %#v, want repaired to locator", resolution.ResolvedLocatorEnvelope.Locator)
	}

	replay, err := service.ReplaySourceManifestEvents("contract-markdown", 0, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents returned error: %v", err)
	}
	if !sourceManifestReplayContainsRepairOverlay(replay, "repair-md-001") {
		t.Fatalf("events = %#v, want repair_overlay_created event", replay.Events)
	}

	reloaded := NewService(nil, nil, nil, options)
	reloadedOverlay, err := reloaded.GetRepairOverlay("repair-md-001")
	if err != nil {
		t.Fatalf("reloaded GetRepairOverlay returned error: %v", err)
	}
	if reloadedOverlay.TargetRevisionID != "sr-md-002" || metadataString(reloadedOverlay.Metadata, "toReadalongManifestId") != "ram-md-repaired" {
		t.Fatalf("reloaded overlay = %#v, want immutable overlay with manifest evidence", reloadedOverlay)
	}
	reloadedMap, err := reloaded.GetRevisionMap("revmap-repair-001")
	if err != nil {
		t.Fatalf("reloaded GetRevisionMap returned error: %v", err)
	}
	if reloadedMap.OverlayID != "repair-md-001" || metadataString(reloadedMap.Metadata, "fromReadalongManifestId") != "ram-md-old" {
		t.Fatalf("reloaded revision map = %#v, want repair overlay and from manifest evidence", reloadedMap)
	}
	reloadedResolution, err := reloaded.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: "progress-repair-old", SourceRevisionID: "sr-md-002"})
	if err != nil || reloadedResolution.Decision != ResumeDecisionAutoResumeRemapped {
		t.Fatalf("reloaded resolution = %#v, err = %v, want auto_resume_remapped", reloadedResolution, err)
	}
}

func TestRepairOverlayCreationFailsClosedForMissingOrMismatchedEvidenceAndImmutableReplay(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-001", "Dr Nguyen shipped v1.", "")
	oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
	oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-affected"})
	if _, err := service.PersistReadingUnitManifest(oldReading); err != nil {
		t.Fatalf("PersistReadingUnitManifest old returned error: %v", err)
	}
	if _, err := service.PersistReadalongManifest(oldReadalong); err != nil {
		t.Fatalf("PersistReadalongManifest old returned error: %v", err)
	}
	locator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	overlay := repairOverlayFixture(locator)

	if _, err := service.PersistRepairOverlay(overlay); err != nil {
		t.Fatalf("PersistRepairOverlay first returned error: %v", err)
	}
	if _, err := service.PersistRepairOverlay(overlay); err != nil {
		t.Fatalf("PersistRepairOverlay identical replay returned error: %v", err)
	}
	divergent := overlay
	divergent.Summary = "different repair payload"
	if _, err := service.PersistRepairOverlay(divergent); !errors.Is(err, ErrRepairOverlayInvalid) {
		t.Fatalf("PersistRepairOverlay divergent error = %v, want ErrRepairOverlayInvalid", err)
	}

	_, err := service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
		Overlay:                   overlay,
		RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
		ReadingUnitManifest:       repairReadingManifest("rum-md-repaired", "sr-md-002", 2),
		ReadalongManifest:         repairReadalongManifest("ram-md-repaired", "rum-md-repaired", "sr-md-002", 2, []string{"audio-new"}),
		RevisionMap:               repairRevisionMapFixture("revmap-repair-closed", locator, locator),
		FromReadingUnitManifestID: oldReading.ManifestID,
		FromReadalongManifestID:   "missing-readalong",
	})
	if !errors.Is(err, ErrRepairOverlayInvalid) {
		t.Fatalf("ApplyRepairOverlay missing from readalong error = %v, want ErrRepairOverlayInvalid", err)
	}

	wrongTarget := repairReadingManifest("rum-wrong-target", "sr-other", 2)
	_, err = service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
		Overlay:                   overlay,
		RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
		ReadingUnitManifest:       wrongTarget,
		ReadalongManifest:         repairReadalongManifest("ram-md-repaired", wrongTarget.ManifestID, "sr-md-002", 2, []string{"audio-new"}),
		RevisionMap:               repairRevisionMapFixture("revmap-repair-wrong-target", locator, locator),
		FromReadingUnitManifestID: oldReading.ManifestID,
		FromReadalongManifestID:   oldReadalong.ManifestID,
	})
	if !errors.Is(err, ErrRepairOverlayInvalid) {
		t.Fatalf("ApplyRepairOverlay wrong target manifest error = %v, want ErrRepairOverlayInvalid", err)
	}

	mismatchedMap := repairRevisionMapFixture("revmap-repair-mismatched-overlay", locator, locator)
	mismatchedMap.OverlayID = "repair-other"
	_, err = service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
		Overlay:                   overlay,
		RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
		ReadingUnitManifest:       repairReadingManifest("rum-md-repaired", "sr-md-002", 2),
		ReadalongManifest:         repairReadalongManifest("ram-md-repaired", "rum-md-repaired", "sr-md-002", 2, []string{"audio-new"}),
		RevisionMap:               mismatchedMap,
		FromReadingUnitManifestID: oldReading.ManifestID,
		FromReadalongManifestID:   oldReadalong.ManifestID,
	})
	if !errors.Is(err, ErrRevisionMapInvalid) {
		t.Fatalf("ApplyRepairOverlay mismatched overlay map error = %v, want ErrRevisionMapInvalid", err)
	}
}

func TestStoredRepairRevisionMapMissingManifestEvidenceOffersOldVsRepaired(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-001", "Dr Nguyen shipped v1.", "")
	persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-002", "Doctor Nguyen shipped version one.", "repair-md-001")
	oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
	oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-old"})
	newReading := repairReadingManifest("rum-md-repaired", "sr-md-002", 2)
	newReadalong := repairReadalongManifest("ram-md-repaired", newReading.ManifestID, "sr-md-002", 2, []string{"audio-new"})
	for _, manifest := range []ReadingUnitManifest{oldReading, newReading} {
		if _, err := service.PersistReadingUnitManifest(manifest); err != nil {
			t.Fatalf("PersistReadingUnitManifest %s returned error: %v", manifest.ManifestID, err)
		}
	}
	for _, manifest := range []ReadalongManifest{oldReadalong, newReadalong} {
		if _, err := service.PersistReadalongManifest(manifest); err != nil {
			t.Fatalf("PersistReadalongManifest %s returned error: %v", manifest.ManifestID, err)
		}
	}
	progress := testDurableProgress("progress-repair-stale-no-evidence", oldReadalong.ManifestID, "sr-md-001", "audio-old", DurableProgressStateSuperseded)
	if _, err := service.PersistDurableProgress(progress); err != nil {
		t.Fatalf("PersistDurableProgress returned error: %v", err)
	}
	fromLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	toLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 28, "/children/1")
	revisionMap := repairRevisionMapFixture("revmap-missing-manifest-evidence", fromLocator, toLocator)
	revisionMap.ProgressMappings = []RevisionMapProgressMapping{{FromProgressID: progress.ProgressID, ToProgressID: "progress-repair-remapped", Confidence: 0.93}}
	revisionMap.OverlayID = "repair-md-001"
	revisionMap.Metadata = nil
	if _, err := service.PersistRevisionMap(revisionMap); err != nil {
		t.Fatalf("PersistRevisionMap returned error: %v", err)
	}
	resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: progress.ProgressID, SourceRevisionID: "sr-md-002"})
	if err != nil {
		t.Fatalf("ResolveResumeProgress returned error: %v", err)
	}
	if resolution.Decision != ResumeDecisionOfferOldVsRepaired {
		t.Fatalf("resolution = %#v, want offer_old_vs_repaired without exact repair manifest evidence", resolution)
	}

	revisionMapWithManifest := repairRevisionMapFixture("revmap-missing-progress-evidence", fromLocator, toLocator)
	revisionMapWithManifest.Metadata = map[string]any{
		"fromReadingUnitManifestId": oldReading.ManifestID,
		"fromReadalongManifestId":   oldReadalong.ManifestID,
		"toReadingUnitManifestId":   newReading.ManifestID,
		"toReadalongManifestId":     newReadalong.ManifestID,
	}
	revisionMapWithManifest.ProgressMappings = nil
	if _, err := service.PersistRevisionMap(revisionMapWithManifest); err != nil {
		t.Fatalf("PersistRevisionMap no-progress returned error: %v", err)
	}
	resolution, err = service.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: progress.ProgressID, SourceRevisionID: "sr-md-002"})
	if err != nil {
		t.Fatalf("ResolveResumeProgress no-progress returned error: %v", err)
	}
	if resolution.Decision != ResumeDecisionOfferOldVsRepaired {
		t.Fatalf("resolution without repair progress mapping = %#v, want offer_old_vs_repaired", resolution)
	}
}

func TestApplyRepairOverlayFailsBeforePartialDurableWritesWhenSourcePersistenceFails(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-001", "Dr Nguyen shipped v1.", "")
	oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
	oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-affected"})
	oldReadalong.ProgressIDs = []string{"progress-repair-old"}
	if _, err := service.PersistReadingUnitManifest(oldReading); err != nil {
		t.Fatalf("PersistReadingUnitManifest old returned error: %v", err)
	}
	if _, err := service.PersistReadalongManifest(oldReadalong); err != nil {
		t.Fatalf("PersistReadalongManifest old returned error: %v", err)
	}
	locator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	originalPersist := persistSourceLifecycleForRepairOverlay
	persistSourceLifecycleForRepairOverlay = func(*Service, SourceLifecyclePersistRequest) (SourceEnvelope, SourceRevision, error) {
		return SourceEnvelope{}, SourceRevision{}, errors.New("forced source persistence failure")
	}
	t.Cleanup(func() { persistSourceLifecycleForRepairOverlay = originalPersist })
	_, err := service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
		Overlay:                   repairOverlayFixture(locator),
		RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
		ReadingUnitManifest:       repairReadingManifest("rum-md-repaired", "sr-md-002", 2),
		ReadalongManifest:         repairReadalongManifest("ram-md-repaired", "rum-md-repaired", "sr-md-002", 2, []string{"audio-new"}),
		RevisionMap:               repairRevisionMapFixture("revmap-repair-failure", locator, locator),
		FromReadingUnitManifestID: oldReading.ManifestID,
		FromReadalongManifestID:   oldReadalong.ManifestID,
	})
	if err == nil {
		t.Fatalf("ApplyRepairOverlay error = nil, want forced source persistence failure")
	}
	storedOldReading, err := service.GetReadingUnitManifest(oldReading.ManifestID)
	if err != nil {
		t.Fatalf("GetReadingUnitManifest old returned error: %v", err)
	}
	storedOldReadalong, err := service.GetReadalongManifest(oldReadalong.ManifestID)
	if err != nil {
		t.Fatalf("GetReadalongManifest old returned error: %v", err)
	}
	if storedOldReading.State != ManifestSnapshotStateCurrent || storedOldReadalong.State != ManifestSnapshotStateCurrent {
		t.Fatalf("old manifests = %#v/%#v, want unchanged current after early failure", storedOldReading, storedOldReadalong)
	}
	if _, err := service.GetRepairOverlay("repair-md-001"); err != nil {
		t.Fatalf("GetRepairOverlay after source failure returned error = %v, want durable repair evidence retained before source mutation", err)
	}
	if _, err := service.GetRevisionMap("revmap-repair-failure"); err != nil {
		t.Fatalf("GetRevisionMap after source failure returned error = %v, want durable repair evidence retained before source mutation", err)
	}
}

func TestApplyRepairOverlayOverlayOrRevisionMapFailureLeavesOldStateCurrent(t *testing.T) {
	for _, testCase := range []struct {
		name        string
		failOn      string
		mapID       string
		wantMap     bool
		wantOverlay bool
	}{
		{name: "overlay", failOn: "repair-md-001", mapID: "revmap-repair-overlay-write-failure", wantMap: false, wantOverlay: false},
		{name: "revision-map", failOn: "revmap-repair-map-write-failure", mapID: "revmap-repair-map-write-failure", wantMap: false, wantOverlay: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			service := newSourceLifecycleTestService(t)
			persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-001", "Dr Nguyen shipped v1.", "")
			oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
			oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-affected"})
			oldReadalong.ProgressIDs = []string{"progress-repair-old"}
			if _, err := service.PersistReadingUnitManifest(oldReading); err != nil {
				t.Fatalf("PersistReadingUnitManifest old returned error: %v", err)
			}
			if _, err := service.PersistReadalongManifest(oldReadalong); err != nil {
				t.Fatalf("PersistReadalongManifest old returned error: %v", err)
			}
			locator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
			originalWriter := writeJSONAtomicForRepairOverlays
			writeJSONAtomicForRepairOverlays = func(path string, payload interface{}) error {
				if strings.Contains(path, testCase.failOn) {
					return errors.New("forced repair evidence write failure")
				}
				return originalWriter(path, payload)
			}
			t.Cleanup(func() { writeJSONAtomicForRepairOverlays = originalWriter })
			_, err := service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
				Overlay:                   repairOverlayFixture(locator),
				RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
				ReadingUnitManifest:       repairReadingManifest("rum-md-repaired", "sr-md-002", 2),
				ReadalongManifest:         repairReadalongManifest("ram-md-repaired", "rum-md-repaired", "sr-md-002", 2, []string{"audio-new"}),
				RevisionMap:               repairRevisionMapFixture(testCase.mapID, locator, locator),
				FromReadingUnitManifestID: oldReading.ManifestID,
				FromReadalongManifestID:   oldReadalong.ManifestID,
			})
			if err == nil {
				t.Fatalf("ApplyRepairOverlay error = nil, want forced %s write failure", testCase.name)
			}
			storedOldReading, err := service.GetReadingUnitManifest(oldReading.ManifestID)
			if err != nil {
				t.Fatalf("GetReadingUnitManifest old returned error: %v", err)
			}
			storedOldReadalong, err := service.GetReadalongManifest(oldReadalong.ManifestID)
			if err != nil {
				t.Fatalf("GetReadalongManifest old returned error: %v", err)
			}
			if storedOldReading.State != ManifestSnapshotStateCurrent || storedOldReadalong.State != ManifestSnapshotStateCurrent {
				t.Fatalf("old manifests = %#v/%#v, want unchanged current after %s failure", storedOldReading, storedOldReadalong, testCase.name)
			}
			if _, err := service.sourceRevisionForRepair("contract-markdown", "sr-md-002"); !errors.Is(err, ErrSourceLifecycleNotFound) {
				t.Fatalf("target source revision lookup error = %v, want ErrSourceLifecycleNotFound before source mutation", err)
			}
			_, overlayErr := service.GetRepairOverlay("repair-md-001")
			if testCase.wantOverlay && overlayErr != nil {
				t.Fatalf("GetRepairOverlay after map failure returned error: %v, want preexisting overlay evidence", overlayErr)
			}
			if !testCase.wantOverlay && !errors.Is(overlayErr, ErrRepairOverlayNotFound) {
				t.Fatalf("GetRepairOverlay after overlay failure error = %v, want ErrRepairOverlayNotFound", overlayErr)
			}
			_, mapErr := service.GetRevisionMap(testCase.mapID)
			if testCase.wantMap && mapErr != nil {
				t.Fatalf("GetRevisionMap returned error: %v", mapErr)
			}
			if !testCase.wantMap && !errors.Is(mapErr, ErrRevisionMapNotFound) {
				t.Fatalf("GetRevisionMap after %s failure error = %v, want ErrRevisionMapNotFound", testCase.name, mapErr)
			}
		})
	}
}

func TestApplyRepairOverlayProgressFailureLeavesOldManifestsCurrent(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-001", "Dr Nguyen shipped v1.", "")
	oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
	oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-affected"})
	oldReadalong.ProgressIDs = []string{"progress-repair-old"}
	if _, err := service.PersistReadingUnitManifest(oldReading); err != nil {
		t.Fatalf("PersistReadingUnitManifest old returned error: %v", err)
	}
	if _, err := service.PersistReadalongManifest(oldReadalong); err != nil {
		t.Fatalf("PersistReadalongManifest old returned error: %v", err)
	}
	locator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	progress := testDurableProgress("progress-repair-old", oldReadalong.ManifestID, "sr-md-001", "audio-affected", DurableProgressStateCurrent)
	progress.Position.UnitID = "unit-md-0001"
	if _, err := service.PersistDurableProgress(progress); err != nil {
		t.Fatalf("PersistDurableProgress returned error: %v", err)
	}
	originalWriter := writeJSONAtomicForDurableProgress
	writeJSONAtomicForDurableProgress = func(path string, payload interface{}) error {
		if durable, ok := payload.(DurableProgress); ok && durable.ProgressID == "progress-repair-old" && durable.State == DurableProgressStateSuperseded {
			return errors.New("forced durable progress write failure")
		}
		return originalWriter(path, payload)
	}
	t.Cleanup(func() { writeJSONAtomicForDurableProgress = originalWriter })
	_, err := service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
		Overlay:                   repairOverlayFixture(locator),
		RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
		ReadingUnitManifest:       repairReadingManifest("rum-md-repaired", "sr-md-002", 2),
		ReadalongManifest:         repairReadalongManifest("ram-md-repaired", "rum-md-repaired", "sr-md-002", 2, []string{"audio-new"}),
		RevisionMap:               repairRevisionMapFixture("revmap-repair-progress-failure", locator, locator),
		FromReadingUnitManifestID: oldReading.ManifestID,
		FromReadalongManifestID:   oldReadalong.ManifestID,
		AudioArtifacts:            []ResumeAudioArtifactEvidence{{ArtifactID: "audio-affected", SourceID: "contract-markdown", SourceRevisionID: "sr-md-001", ReadalongManifestID: oldReadalong.ManifestID, UnitID: "unit-md-0001", State: AudioArtifactStateChecked}},
	})
	if err == nil {
		t.Fatalf("ApplyRepairOverlay error = nil, want forced durable progress write failure")
	}
	storedOldReading, err := service.GetReadingUnitManifest(oldReading.ManifestID)
	if err != nil {
		t.Fatalf("GetReadingUnitManifest old returned error: %v", err)
	}
	storedOldReadalong, err := service.GetReadalongManifest(oldReadalong.ManifestID)
	if err != nil {
		t.Fatalf("GetReadalongManifest old returned error: %v", err)
	}
	if storedOldReading.State != ManifestSnapshotStateCurrent || storedOldReadalong.State != ManifestSnapshotStateCurrent {
		t.Fatalf("old manifests = %#v/%#v, want unchanged current when progress supersession fails", storedOldReading, storedOldReadalong)
	}
	storedProgress, err := service.GetDurableProgress("progress-repair-old")
	if err != nil {
		t.Fatalf("GetDurableProgress returned error: %v", err)
	}
	if storedProgress.State != DurableProgressStateCurrent {
		t.Fatalf("progress = %#v, want unchanged current after failed supersession write", storedProgress)
	}
}

func TestApplyRepairOverlaySupersedesMappedProgressEvenWhenAudioEvidenceOmitted(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-001", "Dr Nguyen shipped v1.", "")
	oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
	oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-affected"})
	oldReadalong.ProgressIDs = []string{"progress-repair-old"}
	if _, err := service.PersistReadingUnitManifest(oldReading); err != nil {
		t.Fatalf("PersistReadingUnitManifest old returned error: %v", err)
	}
	if _, err := service.PersistReadalongManifest(oldReadalong); err != nil {
		t.Fatalf("PersistReadalongManifest old returned error: %v", err)
	}
	fromLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	toLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 28, "/children/1")
	progress := testDurableProgress("progress-repair-old", oldReadalong.ManifestID, "sr-md-001", "audio-affected", DurableProgressStateCurrent)
	progress.Position.UnitID = "unit-md-0001"
	progress.LocatorEnvelope.Locator = &fromLocator
	if _, err := service.PersistDurableProgress(progress); err != nil {
		t.Fatalf("PersistDurableProgress returned error: %v", err)
	}
	application, err := service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
		Overlay:                   repairOverlayFixture(fromLocator),
		RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
		ReadingUnitManifest:       repairReadingManifest("rum-md-repaired", "sr-md-002", 2),
		ReadalongManifest:         repairReadalongManifest("ram-md-repaired", "rum-md-repaired", "sr-md-002", 2, []string{"audio-new"}),
		RevisionMap:               repairRevisionMapFixture("revmap-repair-no-audio-evidence", fromLocator, toLocator),
		FromReadingUnitManifestID: oldReading.ManifestID,
		FromReadalongManifestID:   oldReadalong.ManifestID,
		AudioArtifacts:            nil,
	})
	if err != nil {
		t.Fatalf("ApplyRepairOverlay returned error: %v", err)
	}
	if len(application.SupersededProgress) != 1 || application.SupersededProgress[0].ProgressID != "progress-repair-old" {
		t.Fatalf("superseded progress = %#v, want mapped affected progress superseded without caller audio evidence", application.SupersededProgress)
	}
	storedProgress, err := service.GetDurableProgress("progress-repair-old")
	if err != nil {
		t.Fatalf("GetDurableProgress returned error: %v", err)
	}
	if storedProgress.State != DurableProgressStateSuperseded {
		t.Fatalf("stored progress = %#v, want superseded", storedProgress)
	}
	resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:          "progress-repair-old",
		SourceRevisionID:    "sr-md-001",
		ReadalongManifestID: oldReadalong.ManifestID,
		AudioArtifacts:      []ResumeAudioArtifactEvidence{{ArtifactID: "audio-affected", SourceID: "contract-markdown", SourceRevisionID: "sr-md-001", ReadalongManifestID: oldReadalong.ManifestID, UnitID: "unit-md-0001", State: AudioArtifactStateChecked}},
	})
	if err != nil {
		t.Fatalf("ResolveResumeProgress old checked audio returned error: %v", err)
	}
	if resolution.Decision == ResumeDecisionAutoResumeCurrent {
		t.Fatalf("resolution = %#v, must not auto-resume current from superseded repair progress", resolution)
	}
}

func TestApplyRepairOverlayLateFailureRollsBackTargetCurrentState(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		failOn func(path string, payload interface{}) bool
	}{
		{
			name: "target-readalong-write",
			failOn: func(_ string, payload interface{}) bool {
				manifest, ok := payload.(ReadalongManifest)
				return ok && manifest.ManifestID == "ram-md-repaired"
			},
		},
		{
			name: "old-reading-supersession",
			failOn: func(_ string, payload interface{}) bool {
				manifest, ok := payload.(ReadingUnitManifest)
				return ok && manifest.ManifestID == "rum-md-old" && manifest.State == ManifestSnapshotStateSuperseded
			},
		},
		{
			name: "old-readalong-supersession",
			failOn: func(_ string, payload interface{}) bool {
				manifest, ok := payload.(ReadalongManifest)
				return ok && manifest.ManifestID == "ram-md-old" && manifest.State == ManifestSnapshotStateSuperseded
			},
		},
		{
			name: "target-reading-promotion",
			failOn: func(_ string, payload interface{}) bool {
				manifest, ok := payload.(ReadingUnitManifest)
				return ok && manifest.ManifestID == "rum-md-repaired" && manifest.State == ManifestSnapshotStateCurrent
			},
		},
		{
			name: "target-readalong-promotion",
			failOn: func(_ string, payload interface{}) bool {
				manifest, ok := payload.(ReadalongManifest)
				return ok && manifest.ManifestID == "ram-md-repaired" && manifest.State == ManifestSnapshotStateCurrent
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			service := newSourceLifecycleTestService(t)
			persistRepairSourceRevision(t, service, "contract-markdown", "sr-md-001", "Dr Nguyen shipped v1.", "")
			oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
			oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-affected"})
			oldReadalong.ProgressIDs = []string{"progress-repair-old"}
			if _, err := service.PersistReadingUnitManifest(oldReading); err != nil {
				t.Fatalf("PersistReadingUnitManifest old returned error: %v", err)
			}
			if _, err := service.PersistReadalongManifest(oldReadalong); err != nil {
				t.Fatalf("PersistReadalongManifest old returned error: %v", err)
			}
			locator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
			progress := testDurableProgress("progress-repair-old", oldReadalong.ManifestID, "sr-md-001", "audio-affected", DurableProgressStateCurrent)
			progress.Position.UnitID = "unit-md-0001"
			if _, err := service.PersistDurableProgress(progress); err != nil {
				t.Fatalf("PersistDurableProgress returned error: %v", err)
			}
			originalWriter := writeJSONAtomicForManifestSnapshots
			writeJSONAtomicForManifestSnapshots = func(path string, payload interface{}) error {
				if testCase.failOn(path, payload) {
					return errors.New("forced manifest write failure")
				}
				return originalWriter(path, payload)
			}
			t.Cleanup(func() { writeJSONAtomicForManifestSnapshots = originalWriter })
			_, err := service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
				Overlay:                   repairOverlayFixture(locator),
				RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
				ReadingUnitManifest:       repairReadingManifest("rum-md-repaired", "sr-md-002", 2),
				ReadalongManifest:         repairReadalongManifest("ram-md-repaired", "rum-md-repaired", "sr-md-002", 2, []string{"audio-new"}),
				RevisionMap:               repairRevisionMapFixture("revmap-repair-"+testCase.name, locator, locator),
				FromReadingUnitManifestID: oldReading.ManifestID,
				FromReadalongManifestID:   oldReadalong.ManifestID,
			})
			if err == nil {
				t.Fatalf("ApplyRepairOverlay error = nil, want forced %s failure", testCase.name)
			}
			assertRepairFailureLeavesOldStateCurrent(t, service, oldReading.ManifestID, oldReadalong.ManifestID, "progress-repair-old")
		})
	}
}

func TestApplyRepairOverlayPreservesExistingSourceEnvelopeLifecycle(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	expiresAt := time.Date(2026, 5, 18, 1, 10, 0, 0, time.UTC)
	_, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:           "contract-markdown",
		RevisionID:         "sr-md-001",
		ProjectID:          "project-special",
		SourceKind:         SourceEnvelopeKindQuickListenTemporary,
		Lifecycle:          SourceEnvelopeLifecycleTemporary,
		ExpiresAt:          &expiresAt,
		PromotedToSourceID: "promoted-target",
		Metadata:           map[string]any{"owner": "quick-listen"},
		RawText:            "Dr Nguyen shipped v1.",
	})
	if err != nil {
		t.Fatalf("PersistSourceLifecycle temporary returned error: %v", err)
	}
	oldReading := repairReadingManifest("rum-md-old", "sr-md-001", 1)
	oldReadalong := repairReadalongManifest("ram-md-old", oldReading.ManifestID, "sr-md-001", 1, []string{"audio-affected"})
	if _, err := service.PersistReadingUnitManifest(oldReading); err != nil {
		t.Fatalf("PersistReadingUnitManifest old returned error: %v", err)
	}
	if _, err := service.PersistReadalongManifest(oldReadalong); err != nil {
		t.Fatalf("PersistReadalongManifest old returned error: %v", err)
	}
	locator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	_, err = service.ApplyRepairOverlay(RepairOverlayApplicationRequest{
		Overlay:                   repairOverlayFixture(locator),
		RepairedSource:            SourceLifecyclePersistRequest{RawText: "Doctor Nguyen shipped version one."},
		ReadingUnitManifest:       repairReadingManifest("rum-md-repaired", "sr-md-002", 2),
		ReadalongManifest:         repairReadalongManifest("ram-md-repaired", "rum-md-repaired", "sr-md-002", 2, []string{"audio-new"}),
		RevisionMap:               repairRevisionMapFixture("revmap-repair-envelope-preserve", locator, locator),
		FromReadingUnitManifestID: oldReading.ManifestID,
		FromReadalongManifestID:   oldReadalong.ManifestID,
	})
	if err != nil {
		t.Fatalf("ApplyRepairOverlay returned error: %v", err)
	}
	service.mu.RLock()
	envelope := cloneSourceEnvelope(service.sourceEnvelopes["contract-markdown"])
	service.mu.RUnlock()
	if envelope.ProjectID != "project-special" || envelope.SourceKind != SourceEnvelopeKindQuickListenTemporary || envelope.Lifecycle != SourceEnvelopeLifecycleTemporary || envelope.PromotedToSourceID != "promoted-target" || envelope.ExpiresAt == nil || !envelope.ExpiresAt.Equal(expiresAt) || envelope.CurrentRevisionID != "sr-md-002" {
		t.Fatalf("source envelope = %#v, want repair to preserve existing lifecycle/identity fields while moving current revision", envelope)
	}
}

func assertRepairFailureLeavesOldStateCurrent(t *testing.T, service *Service, oldReadingID string, oldReadalongID string, progressID string) {
	t.Helper()
	storedOldReading, err := service.GetReadingUnitManifest(oldReadingID)
	if err != nil {
		t.Fatalf("GetReadingUnitManifest old returned error: %v", err)
	}
	storedOldReadalong, err := service.GetReadalongManifest(oldReadalongID)
	if err != nil {
		t.Fatalf("GetReadalongManifest old returned error: %v", err)
	}
	if storedOldReading.State != ManifestSnapshotStateCurrent || storedOldReadalong.State != ManifestSnapshotStateCurrent {
		t.Fatalf("old manifests = %#v/%#v, want unchanged current after failed repair", storedOldReading, storedOldReadalong)
	}
	storedProgress, err := service.GetDurableProgress(progressID)
	if err != nil {
		t.Fatalf("GetDurableProgress returned error: %v", err)
	}
	if storedProgress.State != DurableProgressStateCurrent {
		t.Fatalf("progress = %#v, want unchanged current after failed repair", storedProgress)
	}
	service.mu.RLock()
	envelope := cloneSourceEnvelope(service.sourceEnvelopes["contract-markdown"])
	_, hasTargetRevision := service.sourceRevisions["sr-md-002"]
	service.mu.RUnlock()
	if envelope.CurrentRevisionID != "sr-md-001" || hasTargetRevision {
		t.Fatalf("source envelope current=%q targetRevision=%v, want old revision current and no target revision after failed repair", envelope.CurrentRevisionID, hasTargetRevision)
	}
	if _, err := service.GetCurrentReadingUnitManifest("contract-markdown", "sr-md-002"); !errors.Is(err, ErrManifestSnapshotNotFound) {
		t.Fatalf("current target reading lookup error = %v, want ErrManifestSnapshotNotFound", err)
	}
	if _, err := service.GetCurrentReadalongManifest("contract-markdown", "sr-md-002"); !errors.Is(err, ErrManifestSnapshotNotFound) {
		t.Fatalf("current target readalong lookup error = %v, want ErrManifestSnapshotNotFound", err)
	}
}

func repairOverlayFixture(locator contentir.Locator) RepairOverlay {
	return RepairOverlay{
		OverlayID:        "repair-md-001",
		SourceID:         "contract-markdown",
		SourceRevisionID: "sr-md-001",
		TargetRevisionID: "sr-md-002",
		CreatedAt:        time.Date(2026, 5, 17, 1, 10, 0, 0, time.UTC),
		CreatedBy:        "test",
		Changes: []RepairOverlayChange{
			{ChangeID: "repair-change-001", Operation: RepairOverlayOperationReplaceText, UnitID: "unit-md-0001", Locator: &locator, BeforeText: "Dr Nguyen shipped v1.", AfterText: "Doctor Nguyen shipped version one.", Reason: "expand abbreviation and version for readalong clarity"},
		},
		Summary: "Immutable repair overlay expands source text without mutating the original manifest.",
	}
}

func repairRevisionMapFixture(id string, fromLocator contentir.Locator, toLocator contentir.Locator) RevisionMap {
	return RevisionMap{
		RevisionMapID:        id,
		SourceID:             "contract-markdown",
		FromSourceRevisionID: "sr-md-001",
		ToSourceRevisionID:   "sr-md-002",
		GeneratedAt:          time.Date(2026, 5, 17, 1, 12, 6, 0, time.UTC),
		Cause:                RevisionMapCauseRepairOverlay,
		OverlayID:            "repair-md-001",
		Confidence:           0.94,
		UnitMappings: []RevisionMapUnitMapping{
			{FromUnitID: "unit-md-0001", ToUnitID: "unit-md-0001", Confidence: 0.97, Status: "changed"},
			{FromUnitID: "unit-md-0002", ToUnitID: "unit-md-0002", Confidence: 0.99, Status: "matched"},
		},
		LocatorMappings:  []RevisionMapLocatorMapping{{FromLocator: &fromLocator, ToLocator: &toLocator, Confidence: 0.94, Status: "changed", TextQuote: "Dr Nguyen shipped v1."}},
		ProgressMappings: []RevisionMapProgressMapping{{FromProgressID: "progress-repair-old", ToProgressID: "progress-repair-remapped", Confidence: 0.93}},
	}
}

func repairReadingManifest(manifestID string, sourceRevisionID string, revision int) ReadingUnitManifest {
	manifest := testReadingUnitManifest(manifestID, revision, ManifestSnapshotStateCurrent)
	manifest.SourceRevisionID = sourceRevisionID
	manifest.ExtractionRevisionID = "er-" + sourceRevisionID
	manifest.Units = append(manifest.Units, ReadingUnitManifestUnit{UnitID: "unit-md-0002", OrderKey: "00000002", NodeID: "md-0002", Readiness: ReadingUnitReadinessAlignable, ContentIRID: "contract-markdown", Locator: map[string]any{"type": "markdown"}, Fingerprint: "fp-unit-md-0002-v1"})
	manifest.Summary.UnitCount = 2
	manifest.Summary.ReadableCount = 2
	manifest.Summary.NarratableCount = 2
	return manifest
}

func repairReadalongManifest(manifestID string, readingUnitManifestID string, sourceRevisionID string, revision int, audioIDs []string) ReadalongManifest {
	manifest := testReadalongManifest(manifestID, readingUnitManifestID, revision, ManifestSnapshotStateCurrent)
	manifest.SourceRevisionID = sourceRevisionID
	manifest.ExtractionRevisionID = "er-" + sourceRevisionID
	manifest.UnitIDs = []string{"unit-md-0001", "unit-md-0002"}
	manifest.AudioArtifactIDs = append([]string(nil), audioIDs...)
	return manifest
}

func persistRepairSourceRevision(t *testing.T, service *Service, sourceID string, revisionID string, rawText string, repairOverlayID string) {
	t.Helper()
	_, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{SourceID: sourceID, RevisionID: revisionID, RawText: rawText, RepairOverlayID: repairOverlayID, WorkStatus: SourceLifecycleWorkStatusComplete})
	if err != nil {
		t.Fatalf("PersistSourceLifecycle(%s/%s) returned error: %v", sourceID, revisionID, err)
	}
}

func sourceManifestReplayContainsRepairOverlay(replay SourceManifestEventReplay, overlayID string) bool {
	for _, event := range replay.Events {
		if event.EventType == SourceManifestEventRepairOverlayCreated && event.Subject.RepairOverlayID == overlayID {
			return true
		}
	}
	return false
}
