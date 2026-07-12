package pipeline

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

func TestDurableProgressPersistsCanonicalAndRejectsMismatchedContext(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	first := testDurableProgress("progress-one", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(first); err != nil {
		t.Fatalf("PersistDurableProgress first returned error: %v", err)
	}
	second := testDurableProgress("progress-two", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	second.UpdatedAt = first.UpdatedAt.Add(time.Second)
	if _, err := service.PersistDurableProgress(second); err != nil {
		t.Fatalf("PersistDurableProgress second returned error: %v", err)
	}

	old, err := service.GetDurableProgress("progress-one")
	if err != nil {
		t.Fatalf("GetDurableProgress old returned error: %v", err)
	}
	if old.Canonical {
		t.Fatalf("old progress canonical = true, want demoted after newer canonical write")
	}
	canonical, err := service.GetCanonicalDurableProgress("contract-markdown", "ram-md-002", DurableProgressKindResume)
	if err != nil {
		t.Fatalf("GetCanonicalDurableProgress returned error: %v", err)
	}
	if canonical.ProgressID != "progress-two" || !canonical.Canonical {
		t.Fatalf("canonical progress = %#v, want progress-two only", canonical)
	}

	reloaded := NewService(nil, nil, nil, options)
	reloadedCanonical, err := reloaded.GetCanonicalDurableProgress("contract-markdown", "ram-md-002", DurableProgressKindResume)
	if err != nil {
		t.Fatalf("reloaded GetCanonicalDurableProgress returned error: %v", err)
	}
	if reloadedCanonical.ProgressID != "progress-two" {
		t.Fatalf("reloaded canonical progress ID = %q, want progress-two", reloadedCanonical.ProgressID)
	}

	mismatchedLocator := testDurableProgress("progress-bad-locator", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	mismatchedLocator.LocatorEnvelope.SourceID = "other-source"
	if _, err := service.PersistDurableProgress(mismatchedLocator); !errors.Is(err, ErrDurableProgressInvalid) {
		t.Fatalf("PersistDurableProgress locator mismatch error = %v, want ErrDurableProgressInvalid", err)
	}

	mismatchedAudio := testDurableProgress("progress-bad-audio", "ram-md-002", "sr-md-002", "missing-audio", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(mismatchedAudio); !errors.Is(err, ErrDurableProgressInvalid) {
		t.Fatalf("PersistDurableProgress audio mismatch error = %v, want ErrDurableProgressInvalid", err)
	}

	mismatchedRevision := testDurableProgress("progress-bad-revision", "ram-md-002", "sr-other", "audio-md-checked", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(mismatchedRevision); !errors.Is(err, ErrDurableProgressInvalid) {
		t.Fatalf("PersistDurableProgress revision mismatch error = %v, want ErrDurableProgressInvalid", err)
	}
}

func TestDurableProgressConcurrentCanonicalWritesLeaveSingleCanonical(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	const writers = 12
	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for index := 0; index < writers; index++ {
		index := index
		wg.Add(1)
		go func() {
			defer wg.Done()
			progress := testDurableProgress(fmt.Sprintf("progress-concurrent-%02d", index), "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
			progress.UpdatedAt = progress.UpdatedAt.Add(time.Duration(index) * time.Millisecond)
			_, err := service.PersistDurableProgress(progress)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent PersistDurableProgress returned error: %v", err)
		}
	}

	assertSingleCanonicalDurableProgressInMemory(t, service, "contract-markdown", "ram-md-002", DurableProgressKindResume)
	assertSingleCanonicalDurableProgressOnDisk(t, service, "contract-markdown", "ram-md-002", DurableProgressKindResume)

	reloaded := NewService(nil, nil, nil, options)
	assertSingleCanonicalDurableProgressInMemory(t, reloaded, "contract-markdown", "ram-md-002", DurableProgressKindResume)
	assertSingleCanonicalDurableProgressOnDisk(t, reloaded, "contract-markdown", "ram-md-002", DurableProgressKindResume)
}

func TestDurableProgressReloadReconcilesDuplicateCanonicalRecords(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	older := testDurableProgress("progress-duplicate-older", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	newer := testDurableProgress("progress-duplicate-newer", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	newer.UpdatedAt = older.UpdatedAt.Add(time.Minute)
	if err := service.writeDurableProgress(older); err != nil {
		t.Fatalf("write older duplicate returned error: %v", err)
	}
	if err := service.writeDurableProgress(newer); err != nil {
		t.Fatalf("write newer duplicate returned error: %v", err)
	}

	reloaded := NewService(nil, nil, nil, options)
	canonical, err := reloaded.GetCanonicalDurableProgress("contract-markdown", "ram-md-002", DurableProgressKindResume)
	if err != nil {
		t.Fatalf("reloaded canonical returned error: %v", err)
	}
	if canonical.ProgressID != "progress-duplicate-newer" {
		t.Fatalf("reloaded canonical ID = %q, want deterministic newest duplicate", canonical.ProgressID)
	}
	oldProgress, err := reloaded.GetDurableProgress("progress-duplicate-older")
	if err != nil {
		t.Fatalf("reloaded old duplicate returned error: %v", err)
	}
	if oldProgress.Canonical {
		t.Fatalf("old duplicate remained canonical in memory after reload reconciliation")
	}
	assertSingleCanonicalDurableProgressOnDisk(t, reloaded, "contract-markdown", "ram-md-002", DurableProgressKindResume)
	var oldDisk DurableProgress
	readSourceLifecycleJSON(t, durableProgressDiskPath(reloaded, "progress-duplicate-older"), &oldDisk)
	if oldDisk.Canonical {
		t.Fatalf("old duplicate remained canonical on disk after reload reconciliation")
	}
}

func TestDurableProgressReloadPromotesNewestRecordWhenContextHasZeroCanonical(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	older := testDurableProgress("progress-zero-a", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	older.Canonical = false
	tieLow := testDurableProgress("progress-zero-b", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	tieLow.Canonical = false
	tieLow.UpdatedAt = older.UpdatedAt.Add(time.Minute)
	tieHigh := testDurableProgress("progress-zero-c", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	tieHigh.Canonical = false
	tieHigh.UpdatedAt = tieLow.UpdatedAt
	for _, progress := range []DurableProgress{older, tieLow, tieHigh} {
		if err := service.writeDurableProgress(progress); err != nil {
			t.Fatalf("write zero-canonical progress %s returned error: %v", progress.ProgressID, err)
		}
	}

	reloaded := NewService(nil, nil, nil, options)
	canonical, err := reloaded.GetCanonicalDurableProgress("contract-markdown", "ram-md-002", DurableProgressKindResume)
	if err != nil {
		t.Fatalf("reloaded zero-canonical progress returned error: %v", err)
	}
	if canonical.ProgressID != "progress-zero-c" {
		t.Fatalf("zero-canonical winner = %q, want newest and highest progress ID tie-break", canonical.ProgressID)
	}
	assertSingleCanonicalDurableProgressOnDisk(t, reloaded, "contract-markdown", "ram-md-002", DurableProgressKindResume)
}

func TestDurableProgressCanonicalDemotionWriteFailurePreservesPreviousCanonical(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	first := testDurableProgress("progress-failure-old", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(first); err != nil {
		t.Fatalf("PersistDurableProgress first returned error: %v", err)
	}
	writeErr := errors.New("injected durable progress demotion failure")
	withDurableProgressJSONWriter(t, func(path string, payload interface{}) error {
		if progress, ok := payload.(DurableProgress); ok && progress.ProgressID == "progress-failure-old" && !progress.Canonical {
			return writeErr
		}
		return writeJSONAtomic(path, payload)
	})
	second := testDurableProgress("progress-failure-new", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	second.UpdatedAt = first.UpdatedAt.Add(time.Second)
	if _, err := service.PersistDurableProgress(second); !errors.Is(err, writeErr) {
		t.Fatalf("PersistDurableProgress failure error = %v, want injected write error", err)
	}
	canonical, err := service.GetCanonicalDurableProgress("contract-markdown", "ram-md-002", DurableProgressKindResume)
	if err != nil {
		t.Fatalf("GetCanonicalDurableProgress returned error: %v", err)
	}
	if canonical.ProgressID != "progress-failure-old" {
		t.Fatalf("canonical after demotion failure = %q, want previous canonical", canonical.ProgressID)
	}
	if _, err := os.Stat(durableProgressDiskPath(service, "progress-failure-new")); !os.IsNotExist(err) {
		t.Fatalf("new failed progress disk stat error = %v, want not persisted", err)
	}
	assertSingleCanonicalDurableProgressOnDisk(t, service, "contract-markdown", "ram-md-002", DurableProgressKindResume)
}

func TestDurableProgressReloadPromotesDeterministicCanonicalAfterNewWriteFailure(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	first := testDurableProgress("progress-new-write-failure-old", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(first); err != nil {
		t.Fatalf("PersistDurableProgress first returned error: %v", err)
	}
	writeErr := errors.New("injected durable progress new canonical failure")
	withDurableProgressJSONWriter(t, func(path string, payload interface{}) error {
		if progress, ok := payload.(DurableProgress); ok && progress.ProgressID == "progress-new-write-failure-new" && progress.Canonical {
			return writeErr
		}
		return writeJSONAtomic(path, payload)
	})
	second := testDurableProgress("progress-new-write-failure-new", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	second.UpdatedAt = first.UpdatedAt.Add(time.Second)
	if _, err := service.PersistDurableProgress(second); !errors.Is(err, writeErr) {
		t.Fatalf("PersistDurableProgress new canonical failure error = %v, want injected write error", err)
	}
	canonical, err := service.GetCanonicalDurableProgress("contract-markdown", "ram-md-002", DurableProgressKindResume)
	if err != nil {
		t.Fatalf("GetCanonicalDurableProgress after failed write returned error: %v", err)
	}
	if canonical.ProgressID != "progress-new-write-failure-old" {
		t.Fatalf("in-memory canonical after failed write = %q, want previous canonical", canonical.ProgressID)
	}
	if _, err := os.Stat(durableProgressDiskPath(service, "progress-new-write-failure-new")); !os.IsNotExist(err) {
		t.Fatalf("new failed progress disk stat error = %v, want not persisted", err)
	}
	if diskCanonicalCount(t, service, "contract-markdown", "ram-md-002", DurableProgressKindResume) != 0 {
		t.Fatalf("disk should have zero canonical records before reload to exercise crash recovery path")
	}

	reloaded := NewService(nil, nil, nil, options)
	reloadedCanonical := assertSingleCanonicalDurableProgressInMemory(t, reloaded, "contract-markdown", "ram-md-002", DurableProgressKindResume)
	if reloadedCanonical.ProgressID != "progress-new-write-failure-old" {
		t.Fatalf("reloaded canonical after failed new write = %q, want previous durable record", reloadedCanonical.ProgressID)
	}
	diskCanonical := assertSingleCanonicalDurableProgressOnDisk(t, reloaded, "contract-markdown", "ram-md-002", DurableProgressKindResume)
	if diskCanonical.ProgressID != "progress-new-write-failure-old" {
		t.Fatalf("disk canonical after reload reconciliation = %q, want previous durable record", diskCanonical.ProgressID)
	}
}

func TestDurableProgressReloadSkipsInvalidContextRecords(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	valid := testDurableProgress("progress-valid-reload", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	invalid := testDurableProgress("progress-invalid-reload", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	invalid.LocatorEnvelope.SourceID = "other-source"
	if err := service.writeDurableProgress(valid); err != nil {
		t.Fatalf("write valid progress returned error: %v", err)
	}
	if err := service.writeDurableProgress(invalid); err != nil {
		t.Fatalf("write invalid progress returned error: %v", err)
	}

	reloaded := NewService(nil, nil, nil, options)
	if _, err := reloaded.GetDurableProgress("progress-invalid-reload"); !errors.Is(err, ErrProgressNotFound) {
		t.Fatalf("invalid progress reload error = %v, want ErrProgressNotFound", err)
	}
	canonical, err := reloaded.GetCanonicalDurableProgress("contract-markdown", "ram-md-002", DurableProgressKindResume)
	if err != nil {
		t.Fatalf("valid canonical reload returned error: %v", err)
	}
	if canonical.ProgressID != "progress-valid-reload" {
		t.Fatalf("canonical after invalid reload = %q, want valid record", canonical.ProgressID)
	}
	assertSingleCanonicalDurableProgressInMemory(t, reloaded, "contract-markdown", "ram-md-002", DurableProgressKindResume)
}

func TestResumeResolverReturnsDeterministicCurrentDegradedAudioSourceRetryAndFailedDecisions(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	current := testDurableProgress("progress-current", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(current); err != nil {
		t.Fatalf("PersistDurableProgress current returned error: %v", err)
	}
	resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID: "progress-current",
		AudioArtifacts: []ResumeAudioArtifactEvidence{
			checkedAudioEvidence("audio-md-checked", "ram-md-002", "sr-md-002", AudioArtifactStateChecked, nil),
		},
		SyncFidelityDecisions: []SyncFidelityDecision{
			exactSyncDecision("sync-current", "audio-md-checked", "ram-md-002", "sr-md-002"),
		},
	})
	if err != nil {
		t.Fatalf("ResolveResumeProgress current returned error: %v", err)
	}
	if resolution.Decision != ResumeDecisionAutoResumeCurrent {
		t.Fatalf("current decision = %#v, want auto_resume_current", resolution)
	}

	degraded := exactSyncDecision("sync-degraded", "audio-md-checked", "ram-md-002", "sr-md-002")
	degraded.Fidelity = SyncFidelityBlock
	degraded.ExactAllowed = false
	degraded.FallbackReason = "low resource downgrade"
	resolution, err = service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:            "progress-current",
		SyncFidelityDecisions: []SyncFidelityDecision{degraded},
		AudioArtifacts:        []ResumeAudioArtifactEvidence{checkedAudioEvidence("audio-md-checked", "ram-md-002", "sr-md-002", AudioArtifactStateChecked, nil)},
	})
	if err != nil || resolution.Decision != ResumeDecisionAutoResumeDegraded {
		t.Fatalf("degraded resolution = %#v, err = %v, want auto_resume_degraded", resolution, err)
	}

	audioOnly := degraded
	audioOnly.DecisionID = "sync-audio-only"
	audioOnly.Fidelity = SyncFidelityAudioOnly
	resolution, err = service.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: "progress-current", SyncFidelityDecisions: []SyncFidelityDecision{audioOnly}})
	if err != nil || resolution.Decision != ResumeDecisionResumeAudioOnly {
		t.Fatalf("audio-only resolution = %#v, err = %v, want resume_audio_only", resolution, err)
	}

	sourceOnlyProgress := testDurableProgress("progress-source-only", "ram-md-002", "sr-md-002", "", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(sourceOnlyProgress); err != nil {
		t.Fatalf("PersistDurableProgress source-only returned error: %v", err)
	}
	resolution, err = service.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: "progress-source-only"})
	if err != nil || resolution.Decision != ResumeDecisionResumeSourceOnly {
		t.Fatalf("source-only resolution = %#v, err = %v, want resume_source_only", resolution, err)
	}

	retryProgress := testDurableProgress("progress-retry", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(retryProgress); err != nil {
		t.Fatalf("PersistDurableProgress retry returned error: %v", err)
	}
	resolution, err = service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:     "progress-retry",
		AudioArtifacts: []ResumeAudioArtifactEvidence{checkedAudioEvidence("audio-md-checked", "ram-md-002", "sr-md-002", AudioArtifactStateRetryable, &AudioArtifactRetryMetadata{Retryable: true, Scope: AudioArtifactRetryScopeArtifact})},
	})
	if err != nil || resolution.Decision != ResumeDecisionOfferRetry || resolution.RetryArtifactID != "audio-md-checked" {
		t.Fatalf("retry resolution = %#v, err = %v, want offer_retry", resolution, err)
	}

	failedProgress := testDurableProgress("progress-failed", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateFailed)
	if _, err := service.PersistDurableProgress(failedProgress); err != nil {
		t.Fatalf("PersistDurableProgress failed returned error: %v", err)
	}
	resolution, err = service.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: "progress-failed"})
	if err != nil || resolution.Decision != ResumeDecisionBlockedFailed {
		t.Fatalf("failed resolution = %#v, err = %v, want blocked_failed", resolution, err)
	}
}

func TestResumeResolverRemapsStaleProgressOnlyWithSameSourceHighConfidenceRevisionMap(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-old", "ram-md-old", "audio-md-old", ManifestSnapshotStateCurrent)
	persistProgressFixtureManifests(t, service, "sr-md-003", "rum-md-new", "ram-md-new", "audio-md-new", ManifestSnapshotStateCurrent)
	stale := testDurableProgress("progress-stale", "ram-md-old", "sr-md-002", "audio-md-old", DurableProgressStateStale)
	if _, err := service.PersistDurableProgress(stale); err != nil {
		t.Fatalf("PersistDurableProgress stale returned error: %v", err)
	}

	resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:       "progress-stale",
		SourceRevisionID: "sr-md-003",
		RevisionMaps:     []RevisionMap{revisionMapFixture("revmap-high", "contract-markdown", "sr-md-002", "sr-md-003", 0.95, 0.94)},
	})
	if err != nil {
		t.Fatalf("ResolveResumeProgress remap returned error: %v", err)
	}
	if resolution.Decision != ResumeDecisionAutoResumeRemapped || resolution.RevisionMapID != "revmap-high" || resolution.StaleProgressID != "progress-stale" {
		t.Fatalf("remap resolution = %#v, want auto_resume_remapped through revmap-high", resolution)
	}

	lowConfidence, err := service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:       "progress-stale",
		SourceRevisionID: "sr-md-003",
		RevisionMaps:     []RevisionMap{revisionMapFixture("revmap-low", "contract-markdown", "sr-md-002", "sr-md-003", 0.95, 0.60)},
	})
	if err != nil || lowConfidence.Decision != ResumeDecisionOfferOldVsRepaired {
		t.Fatalf("low-confidence resolution = %#v, err = %v, want offer_old_vs_repaired", lowConfidence, err)
	}

	wrongSource, err := service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:       "progress-stale",
		SourceRevisionID: "sr-md-003",
		RevisionMaps:     []RevisionMap{revisionMapFixture("revmap-wrong-source", "other-source", "sr-md-002", "sr-md-003", 0.95, 0.94)},
	})
	if err != nil || wrongSource.Decision != ResumeDecisionOfferOldVsRepaired {
		t.Fatalf("wrong-source resolution = %#v, err = %v, want offer_old_vs_repaired", wrongSource, err)
	}
}

func TestResumeResolverRemappedDecisionUsesRevisionMapLocatorMapping(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-old", "ram-md-old", "audio-md-old", ManifestSnapshotStateCurrent)
	persistProgressFixtureManifests(t, service, "sr-md-003", "rum-md-new", "ram-md-new", "audio-md-new", ManifestSnapshotStateCurrent)
	fromLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	toLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 28, "/children/1")
	stale := testDurableProgress("progress-stale-locator", "ram-md-old", "sr-md-002", "audio-md-old", DurableProgressStateSuperseded)
	stale.LocatorEnvelope.Locator = &fromLocator
	stale.LocatorEnvelope.TextQuote = "Dr Nguyen shipped v1."
	stale.Position.TextQuote = "Dr Nguyen shipped v1."
	if _, err := service.PersistDurableProgress(stale); err != nil {
		t.Fatalf("PersistDurableProgress stale locator returned error: %v", err)
	}

	revisionMap := revisionMapFixture("revmap-locator", "contract-markdown", "sr-md-002", "sr-md-003", 0.95, 0.94)
	revisionMap.LocatorMappings = []RevisionMapLocatorMapping{{FromLocator: &fromLocator, ToLocator: &toLocator, Confidence: 0.94}}
	resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:       "progress-stale-locator",
		SourceRevisionID: "sr-md-003",
		RevisionMaps:     []RevisionMap{revisionMap},
	})
	if err != nil {
		t.Fatalf("ResolveResumeProgress locator remap returned error: %v", err)
	}
	if resolution.Decision != ResumeDecisionAutoResumeRemapped {
		t.Fatalf("locator remap decision = %#v, want auto_resume_remapped", resolution)
	}
	if resolution.ResolvedLocatorEnvelope.SourceID != "contract-markdown" || resolution.ResolvedLocatorEnvelope.Kind != "resume" {
		t.Fatalf("resolved locator envelope context = %#v, want current source/resume kind", resolution.ResolvedLocatorEnvelope)
	}
	if resolution.ResolvedLocatorEnvelope.Locator == nil || !locatorsEqual(*resolution.ResolvedLocatorEnvelope.Locator, toLocator) {
		t.Fatalf("resolved locator = %#v, want mapped toLocator %#v", resolution.ResolvedLocatorEnvelope.Locator, toLocator)
	}
	if locatorsEqual(*resolution.ResolvedLocatorEnvelope.Locator, fromLocator) {
		t.Fatalf("resolved locator still equals stale fromLocator, want mapped toLocator")
	}
}

func TestResumeResolverStaleOrSupersededSameManifestRequiresRevisionMap(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)

	for _, state := range []DurableProgressState{DurableProgressStateStale, DurableProgressStateSuperseded} {
		progress := testDurableProgress("progress-same-"+string(state), "ram-md-002", "sr-md-002", "", state)
		if _, err := service.PersistDurableProgress(progress); err != nil {
			t.Fatalf("PersistDurableProgress %s returned error: %v", state, err)
		}
		resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: progress.ProgressID})
		if err != nil {
			t.Fatalf("ResolveResumeProgress %s returned error: %v", state, err)
		}
		if resolution.Decision != ResumeDecisionOfferOldVsRepaired {
			t.Fatalf("%s same-manifest resolution = %#v, want offer_old_vs_repaired instead of current-path decision", state, resolution)
		}
	}
}

func TestResumeResolverRejectsMissingLowConfidenceAmbiguousOrWrongSourceLocatorMappings(t *testing.T) {
	fromLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 22, "/children/1")
	toLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 28, "/children/1")
	for _, testCase := range []struct {
		name   string
		mutate func(*RevisionMap)
	}{
		{
			name: "missing",
			mutate: func(revisionMap *RevisionMap) {
				revisionMap.LocatorMappings = nil
			},
		},
		{
			name: "low-confidence",
			mutate: func(revisionMap *RevisionMap) {
				revisionMap.LocatorMappings[0].Confidence = 0.60
			},
		},
		{
			name: "ambiguous",
			mutate: func(revisionMap *RevisionMap) {
				revisionMap.LocatorMappings = append(revisionMap.LocatorMappings, revisionMap.LocatorMappings[0])
			},
		},
		{
			name: "wrong-source-envelope",
			mutate: func(revisionMap *RevisionMap) {
				toEnvelope := contentir.LocatorEnvelope{SchemaVersion: contentir.LocatorEnvelopeVersion, Kind: "resume", SourceID: "other-source", Locator: &toLocator}
				revisionMap.LocatorMappings[0].ToLocator = nil
				revisionMap.LocatorMappings[0].ToLocatorEnvelope = &toEnvelope
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			service := newSourceLifecycleTestService(t)
			persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-old", "ram-md-old", "audio-md-old", ManifestSnapshotStateCurrent)
			persistProgressFixtureManifests(t, service, "sr-md-003", "rum-md-new", "ram-md-new", "audio-md-new", ManifestSnapshotStateCurrent)
			stale := testDurableProgress("progress-stale-"+testCase.name, "ram-md-old", "sr-md-002", "audio-md-old", DurableProgressStateStale)
			stale.LocatorEnvelope.Locator = &fromLocator
			if _, err := service.PersistDurableProgress(stale); err != nil {
				t.Fatalf("PersistDurableProgress stale returned error: %v", err)
			}
			revisionMap := revisionMapFixture("revmap-"+testCase.name, "contract-markdown", "sr-md-002", "sr-md-003", 0.95, 0.94)
			revisionMap.LocatorMappings = []RevisionMapLocatorMapping{{FromLocator: &fromLocator, ToLocator: &toLocator, Confidence: 0.94}}
			testCase.mutate(&revisionMap)
			resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{
				ProgressID:       stale.ProgressID,
				SourceRevisionID: "sr-md-003",
				RevisionMaps:     []RevisionMap{revisionMap},
			})
			if err != nil {
				t.Fatalf("ResolveResumeProgress returned error: %v", err)
			}
			if resolution.Decision != ResumeDecisionOfferOldVsRepaired {
				t.Fatalf("resolution = %#v, want offer_old_vs_repaired when locator mapping is %s", resolution, testCase.name)
			}
		})
	}
}

func persistProgressFixtureManifests(t *testing.T, service *Service, sourceRevisionID string, readingUnitManifestID string, readalongManifestID string, audioArtifactID string, state ManifestSnapshotState) {
	t.Helper()
	reading := testReadingUnitManifest(readingUnitManifestID, 2, state)
	reading.SourceRevisionID = sourceRevisionID
	reading.GeneratedAt = time.Date(2026, 5, 17, 1, 12, 2, 0, time.UTC)
	if _, err := service.PersistReadingUnitManifest(reading); err != nil {
		t.Fatalf("PersistReadingUnitManifest(%s) returned error: %v", readingUnitManifestID, err)
	}
	readalong := testReadalongManifest(readalongManifestID, readingUnitManifestID, 2, state)
	readalong.SourceRevisionID = sourceRevisionID
	readalong.AudioArtifactIDs = []string{audioArtifactID}
	readalong.SyncFidelityDecisionIDs = []string{"sync-" + readalongManifestID}
	readalong.ProgressIDs = []string{"progress-current"}
	readalong.GeneratedAt = time.Date(2026, 5, 17, 1, 13, 2, 0, time.UTC)
	if _, err := service.PersistReadalongManifest(readalong); err != nil {
		t.Fatalf("PersistReadalongManifest(%s) returned error: %v", readalongManifestID, err)
	}
}

func testDurableProgress(id string, readalongManifestID string, sourceRevisionID string, audioArtifactID string, state DurableProgressState) DurableProgress {
	locator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 28, "/children/1")
	return DurableProgress{
		ProgressID:          id,
		SourceID:            "contract-markdown",
		ReadalongManifestID: readalongManifestID,
		SourceRevisionID:    sourceRevisionID,
		AudioArtifactID:     audioArtifactID,
		Kind:                DurableProgressKindResume,
		State:               state,
		UpdatedAt:           time.Date(2026, 5, 17, 1, 14, 0, 0, time.UTC),
		Canonical:           true,
		LocatorEnvelope: contentir.LocatorEnvelope{
			SchemaVersion:   contentir.LocatorEnvelopeVersion,
			Kind:            "resume",
			SourceID:        "contract-markdown",
			NodeID:          "md-0001",
			ScopeKey:        "document",
			ActiveWordIndex: 1,
			Locator:         &locator,
			TextQuote:       "Doctor Nguyen shipped version one.",
		},
		Position: DurableProgressPosition{
			UnitID:          "unit-md-0001",
			SegmentID:       "seg-0001",
			ActiveWordIndex: 1,
			AudioOffsetMS:   280,
			TextQuote:       "Doctor Nguyen shipped version one.",
		},
	}
}

func assertSingleCanonicalDurableProgressInMemory(t *testing.T, service *Service, sourceID string, readalongManifestID string, kind DurableProgressKind) DurableProgress {
	t.Helper()
	service.mu.RLock()
	matches := make([]DurableProgress, 0)
	for _, progress := range service.durableProgress {
		if progress.Canonical && progress.SourceID == sourceID && progress.ReadalongManifestID == readalongManifestID && progress.Kind == kind {
			matches = append(matches, cloneDurableProgress(progress))
		}
	}
	service.mu.RUnlock()
	if len(matches) != 1 {
		t.Fatalf("canonical durable progress in memory count = %d, want 1: %#v", len(matches), matches)
	}
	return matches[0]
}

func assertSingleCanonicalDurableProgressOnDisk(t *testing.T, service *Service, sourceID string, readalongManifestID string, kind DurableProgressKind) DurableProgress {
	t.Helper()
	matches := durableProgressCanonicalsOnDisk(t, service, sourceID, readalongManifestID, kind)
	if len(matches) != 1 {
		t.Fatalf("canonical durable progress on disk count = %d, want 1: %#v", len(matches), matches)
	}
	return matches[0]
}

func diskCanonicalCount(t *testing.T, service *Service, sourceID string, readalongManifestID string, kind DurableProgressKind) int {
	t.Helper()
	return len(durableProgressCanonicalsOnDisk(t, service, sourceID, readalongManifestID, kind))
}

func durableProgressCanonicalsOnDisk(t *testing.T, service *Service, sourceID string, readalongManifestID string, kind DurableProgressKind) []DurableProgress {
	t.Helper()
	entries, err := os.ReadDir(service.durableProgressBaseDir())
	if err != nil {
		t.Fatalf("read durable progress base dir returned error: %v", err)
	}
	matches := make([]DurableProgress, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(service.durableProgressBaseDir(), entry.Name(), playbackProgressFilename))
		if readErr != nil {
			continue
		}
		var progress DurableProgress
		if err := jsonUnmarshal(metadataBytes, &progress); err != nil {
			continue
		}
		if progress.Canonical && progress.SourceID == sourceID && progress.ReadalongManifestID == readalongManifestID && progress.Kind == kind {
			matches = append(matches, progress)
		}
	}
	return matches
}

func durableProgressDiskPath(service *Service, progressID string) string {
	return filepath.Join(service.durableProgressBaseDir(), safeDataPathID(progressID), playbackProgressFilename)
}

func withDurableProgressJSONWriter(t *testing.T, writer func(path string, payload interface{}) error) {
	t.Helper()
	previous := writeJSONAtomicForDurableProgress
	writeJSONAtomicForDurableProgress = writer
	t.Cleanup(func() {
		writeJSONAtomicForDurableProgress = previous
	})
}

func checkedAudioEvidence(id string, readalongManifestID string, sourceRevisionID string, state AudioArtifactState, retry *AudioArtifactRetryMetadata) ResumeAudioArtifactEvidence {
	return ResumeAudioArtifactEvidence{
		ArtifactID:          id,
		SourceID:            "contract-markdown",
		SourceRevisionID:    sourceRevisionID,
		ReadalongManifestID: readalongManifestID,
		UnitID:              "unit-md-0001",
		SegmentID:           "seg-0001",
		State:               state,
		Retry:               retry,
	}
}

func exactSyncDecision(id string, audioArtifactID string, readalongManifestID string, sourceRevisionID string) SyncFidelityDecision {
	return SyncFidelityDecision{
		SchemaVersion:       syncFidelityDecisionSchemaVersion,
		DecisionID:          id,
		SourceID:            "contract-markdown",
		SourceRevisionID:    sourceRevisionID,
		ReadalongManifestID: readalongManifestID,
		AudioArtifactID:     audioArtifactID,
		GeneratedAt:         time.Date(2026, 5, 17, 1, 15, 0, 0, time.UTC),
		Fidelity:            SyncFidelityExactWord,
		ExactAllowed:        true,
		Evidence: SyncFidelityEvidence{
			SourceRevisionCurrent: true,
			MappingValid:          true,
			TimingConfidence:      true,
			LowResourceMode:       false,
			ArtifactCompatible:    true,
			Confidence:            0.95,
		},
	}
}

func revisionMapFixture(id string, sourceID string, fromRevisionID string, toRevisionID string, confidence float64, unitConfidence float64) RevisionMap {
	fromLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 28, "/children/1")
	toLocator := contentir.NewMarkdownLocator("contract.md", 3, 3, 1, 28, "/children/1")
	return RevisionMap{
		SchemaVersion:        "revision-map.v1",
		RevisionMapID:        id,
		SourceID:             sourceID,
		FromSourceRevisionID: fromRevisionID,
		ToSourceRevisionID:   toRevisionID,
		GeneratedAt:          time.Date(2026, 5, 17, 1, 16, 0, 0, time.UTC),
		Cause:                RevisionMapCauseExtractionCorrection,
		Confidence:           confidence,
		UnitMappings: []RevisionMapUnitMapping{
			{FromUnitID: "unit-md-0001", ToUnitID: "unit-md-0001", Confidence: unitConfidence, Status: "matched"},
		},
		LocatorMappings: []RevisionMapLocatorMapping{
			{FromLocator: &fromLocator, ToLocator: &toLocator, Confidence: unitConfidence},
		},
	}
}
