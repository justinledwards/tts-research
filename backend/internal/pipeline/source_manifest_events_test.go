package pipeline

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestSourceManifestEventsSequenceSubjectIdentityAndSnapshotFallback(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	createdAt := time.Date(2026, 5, 17, 1, 12, 0, 0, time.UTC)

	envelope, revision, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "contract-markdown",
		RevisionID: "sr-md-002",
		RawText:    "# Contract\n\nReadable source.",
		CreatedAt:  createdAt,
		WorkStatus: SourceLifecycleWorkStatusRunning,
	})
	if err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}
	if err := service.UpdateSourceLifecycleWorkStatus(envelope.SourceID, revision.RevisionID, SourceLifecycleWorkStatusComplete); err != nil {
		t.Fatalf("UpdateSourceLifecycleWorkStatus returned error: %v", err)
	}

	readingUnit, err := service.PersistReadingUnitManifest(testReadingUnitManifest("rum-md-002", 1, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest returned error: %v", err)
	}
	readalong, err := service.PersistReadalongManifest(testReadalongManifest("ram-md-002", readingUnit.ManifestID, 1, ManifestSnapshotStateCurrent))
	if err != nil {
		t.Fatalf("PersistReadalongManifest returned error: %v", err)
	}

	replay, err := service.ReplaySourceManifestEvents("contract-markdown", 0, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents returned error: %v", err)
	}
	if replay.Gap || replay.SnapshotRequired {
		t.Fatalf("replay gap/snapshot = %v/%v, want no gap", replay.Gap, replay.SnapshotRequired)
	}
	if len(replay.Events) != 4 {
		t.Fatalf("replay events = %d, want 4: %#v", len(replay.Events), replay.Events)
	}
	wantTypes := []SourceManifestEventType{
		SourceManifestEventSourceRevisionCreated,
		SourceManifestEventExtractionRevisionUpdated,
		SourceManifestEventReadingUnitManifestWritten,
		SourceManifestEventReadalongManifestWritten,
	}
	for index, event := range replay.Events {
		wantSequence := int64(index + 1)
		if event.Sequence != wantSequence || event.Cursor != sourceManifestCursor("contract-markdown", wantSequence) || event.EventID == "" {
			t.Fatalf("event[%d] identity = %#v, want deterministic sequence/cursor/event ID", index, event)
		}
		if event.EventType != wantTypes[index] || event.SchemaVersion != sourceManifestEventSchemaVersion || !event.SnapshotAvailable {
			t.Fatalf("event[%d] type/schema/snapshot = %#v, want %q schema snapshot", index, event, wantTypes[index])
		}
	}
	if replay.Events[0].Subject.SourceRevisionID != "sr-md-002" || replay.Events[0].Subject.State != string(SourceRevisionStateCurrent) {
		t.Fatalf("source event subject = %#v, want source revision/current binding", replay.Events[0].Subject)
	}
	if replay.Events[1].Subject.SourceRevisionID != "sr-md-002" || replay.Events[1].Subject.State != string(SourceLifecycleWorkStatusComplete) {
		t.Fatalf("status event subject = %#v, want source revision/complete binding", replay.Events[1].Subject)
	}
	if replay.Events[2].Subject.SourceRevisionID != "sr-md-002" || replay.Events[2].Subject.ExtractionRevisionID != "er-md-002" || replay.Events[2].Subject.ReadingUnitManifestID != readingUnit.ManifestID || replay.Events[2].SnapshotManifestID != readingUnit.ManifestID {
		t.Fatalf("reading-unit event = %#v, want source/revision/extraction/manifest binding", replay.Events[2])
	}
	if replay.Events[3].Subject.SourceRevisionID != "sr-md-002" || replay.Events[3].Subject.ExtractionRevisionID != "er-md-002" || replay.Events[3].Subject.ReadingUnitManifestID != readingUnit.ManifestID || replay.Events[3].Subject.ReadalongManifestID != readalong.ManifestID || replay.Events[3].SnapshotManifestID != readalong.ManifestID {
		t.Fatalf("readalong event = %#v, want source/revision/extraction/readalong binding", replay.Events[3])
	}

	afterFirst, err := service.ReplaySourceManifestEvents("contract-markdown", 1, 2)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents after first returned error: %v", err)
	}
	if !afterFirst.Gap || !afterFirst.SnapshotRequired || len(afterFirst.Events) != 2 || afterFirst.Events[0].Sequence != 2 || afterFirst.Events[1].Sequence != 3 || afterFirst.LatestSequence != 4 || afterFirst.NextCursor != "contract-markdown:3" {
		t.Fatalf("limited replay = %#v, want seq 2 and 3 plus snapshot-required truncated-backlog signal", afterFirst)
	}

	snapshot, err := service.GetSourceManifestSnapshot("contract-markdown", "")
	if err != nil {
		t.Fatalf("GetSourceManifestSnapshot returned error: %v", err)
	}
	if snapshot.SourceEnvelope == nil || snapshot.SourceRevision == nil || snapshot.SourceEnvelope.CurrentRevisionID != "sr-md-002" || snapshot.SourceRevision.RevisionID != "sr-md-002" {
		t.Fatalf("snapshot source lifecycle = %#v/%#v, want authoritative lifecycle", snapshot.SourceEnvelope, snapshot.SourceRevision)
	}
	if snapshot.CurrentReadingUnitManifest == nil || snapshot.CurrentReadingUnitManifest.ManifestID != readingUnit.ManifestID || snapshot.CurrentReadalongManifest == nil || snapshot.CurrentReadalongManifest.ManifestID != readalong.ManifestID {
		t.Fatalf("snapshot manifests = %#v/%#v, want current authoritative manifests", snapshot.CurrentReadingUnitManifest, snapshot.CurrentReadalongManifest)
	}
	if snapshot.LatestSequence != 4 || snapshot.Cursor != "contract-markdown:4" {
		t.Fatalf("snapshot cursor/latest = %q/%d, want contract-markdown:4", snapshot.Cursor, snapshot.LatestSequence)
	}
}

func TestSourceManifestEventReplayGapRequiresSnapshotFallback(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "gap-source",
		RevisionID: "gap-rev",
		RawText:    "gap source",
		WorkStatus: SourceLifecycleWorkStatusComplete,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}
	for index := 0; index < sourceManifestEventReplayLimit+5; index++ {
		service.publishSourceManifestEvent(sourceManifestEventHint{
			SourceID:          "gap-source",
			OccurredAt:        time.Date(2026, 5, 17, 2, 0, index, 0, time.UTC),
			EventType:         SourceManifestEventExtractionRevisionUpdated,
			SnapshotAvailable: true,
			Subject: SourceManifestEventSubject{
				SourceRevisionID: "gap-rev",
				State:            string(SourceLifecycleWorkStatusRunning),
			},
		})
	}

	replay, err := service.ReplaySourceManifestEvents("gap-source", 1, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents returned error: %v", err)
	}
	if !replay.Gap || !replay.SnapshotRequired {
		t.Fatalf("replay gap/snapshot = %v/%v, want gap requiring snapshot", replay.Gap, replay.SnapshotRequired)
	}
	if len(replay.Events) != sourceManifestEventReplayLimit {
		t.Fatalf("retained replay events = %d, want bounded %d", len(replay.Events), sourceManifestEventReplayLimit)
	}
	if replay.Events[0].Sequence <= 2 {
		t.Fatalf("first retained sequence = %d, want old events trimmed after afterSequence=1", replay.Events[0].Sequence)
	}

	snapshot, err := service.GetSourceManifestSnapshot("gap-source", "gap-rev")
	if err != nil {
		t.Fatalf("GetSourceManifestSnapshot returned error: %v", err)
	}
	if snapshot.SourceRevision == nil || snapshot.SourceRevision.RevisionID != "gap-rev" || snapshot.LatestSequence != int64(sourceManifestEventReplayLimit+6) {
		t.Fatalf("snapshot = %#v, want fallback lifecycle at latest sequence", snapshot)
	}
}

func TestSourceManifestEventLimitedReplayRequiresSnapshotFallback(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	for sequence := 1; sequence <= 4; sequence++ {
		service.publishSourceManifestEvent(sourceManifestEventHint{
			SourceID:          "limited-replay-source",
			OccurredAt:        time.Date(2026, 5, 17, 2, 30, sequence, 0, time.UTC),
			EventType:         SourceManifestEventExtractionRevisionUpdated,
			SnapshotAvailable: true,
			Subject:           SourceManifestEventSubject{SourceRevisionID: "limited-replay-rev", State: string(SourceLifecycleWorkStatusRunning)},
		})
	}

	replay, err := service.ReplaySourceManifestEvents("limited-replay-source", 0, 2)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents returned error: %v", err)
	}
	if !replay.Gap || !replay.SnapshotRequired {
		t.Fatalf("limited replay gap/snapshot = %v/%v, want snapshot-required truncation signal", replay.Gap, replay.SnapshotRequired)
	}
	if replay.LatestSequence != 4 || replay.NextCursor != "limited-replay-source:2" || len(replay.Events) != 2 || replay.Events[0].Sequence != 1 || replay.Events[1].Sequence != 2 {
		t.Fatalf("limited replay = %#v, want first two events and latest sequence 4", replay)
	}

	subscription, streamReplay, err := service.SubscribeSourceManifestEvents("limited-replay-source", 0, 2)
	if err != nil {
		t.Fatalf("SubscribeSourceManifestEvents returned error: %v", err)
	}
	defer subscription.Close()
	if !streamReplay.Gap || !streamReplay.SnapshotRequired || len(streamReplay.Events) != 2 || streamReplay.LatestSequence != 4 {
		t.Fatalf("stream replay = %#v, want same truncation signal before live subscription", streamReplay)
	}
}

func TestSourceManifestEventReplayAfterReloadRequiresSnapshotFallback(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "reload-source",
		RevisionID: "reload-rev",
		RawText:    "reload source",
		CreatedAt:  time.Date(2026, 5, 17, 3, 0, 0, 0, time.UTC),
		WorkStatus: SourceLifecycleWorkStatusComplete,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}
	readingUnit := testReadingUnitManifest("reload-rum", 1, ManifestSnapshotStateCurrent)
	readingUnit.SourceID = "reload-source"
	readingUnit.SourceRevisionID = "reload-rev"
	readingUnit.ExtractionRevisionID = "reload-er"
	if _, err := service.PersistReadingUnitManifest(readingUnit); err != nil {
		t.Fatalf("PersistReadingUnitManifest returned error: %v", err)
	}
	readalong := testReadalongManifest("reload-ram", "reload-rum", 1, ManifestSnapshotStateCurrent)
	readalong.SourceID = "reload-source"
	readalong.SourceRevisionID = "reload-rev"
	readalong.ExtractionRevisionID = "reload-er"
	if _, err := service.PersistReadalongManifest(readalong); err != nil {
		t.Fatalf("PersistReadalongManifest returned error: %v", err)
	}
	beforeReload, err := service.ReplaySourceManifestEvents("reload-source", 0, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents before reload returned error: %v", err)
	}
	if beforeReload.LatestSequence == 0 {
		t.Fatalf("before reload latest sequence = 0, want nonzero cursor setup")
	}

	reloaded := NewService(nil, nil, nil, options)
	replay, err := reloaded.ReplaySourceManifestEvents("reload-source", beforeReload.LatestSequence, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents after reload returned error: %v", err)
	}
	if !replay.Gap || !replay.SnapshotRequired || len(replay.Events) != 0 {
		t.Fatalf("post-reload replay = %#v, want empty-log nonzero cursor to require snapshot", replay)
	}
	snapshot, err := reloaded.GetSourceManifestSnapshot("reload-source", "")
	if err != nil {
		t.Fatalf("GetSourceManifestSnapshot after reload returned error: %v", err)
	}
	if snapshot.SourceEnvelope == nil || snapshot.SourceEnvelope.CurrentRevisionID != "reload-rev" || snapshot.CurrentReadingUnitManifest == nil || snapshot.CurrentReadingUnitManifest.ManifestID != "reload-rum" || snapshot.CurrentReadalongManifest == nil || snapshot.CurrentReadalongManifest.ManifestID != "reload-ram" {
		t.Fatalf("snapshot after reload = %#v, want durable lifecycle/manifests for fallback", snapshot)
	}
}

func TestSourceManifestEventsPublishOnlyAfterDurableSnapshotPair(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	writeErr := errors.New("injected readalong write failure")
	withManifestSnapshotJSONWriter(t, func(path string, payload interface{}) error {
		if manifest, ok := payload.(ReadalongManifest); ok && manifest.ManifestID == "ram-md-failed" {
			return writeErr
		}
		return writeJSONAtomic(path, payload)
	})

	_, _, err := service.persistIncrementalManifestSnapshotPair(
		testReadingUnitManifest("rum-md-failed", 1, ManifestSnapshotStateCurrent),
		testReadalongManifest("ram-md-failed", "rum-md-failed", 1, ManifestSnapshotStateCurrent),
	)
	if !errors.Is(err, writeErr) {
		t.Fatalf("persistIncrementalManifestSnapshotPair error = %v, want injected write failure", err)
	}
	replay, err := service.ReplaySourceManifestEvents("contract-markdown", 0, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents returned error: %v", err)
	}
	if len(replay.Events) != 0 {
		t.Fatalf("events after failed pair = %#v, want none before both manifests are durable", replay.Events)
	}
}

func TestSourceManifestEventsSuppressManifestWrittenWhenPreviousSupersedeWriteFails(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	if _, err := service.PersistReadingUnitManifest(testReadingUnitManifest("rum-md-001", 1, ManifestSnapshotStateCurrent)); err != nil {
		t.Fatalf("PersistReadingUnitManifest first returned error: %v", err)
	}
	baseline, err := service.ReplaySourceManifestEvents("contract-markdown", 0, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents baseline returned error: %v", err)
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

	if _, err := service.PersistReadingUnitManifest(testReadingUnitManifest("rum-md-002", 2, ManifestSnapshotStateCurrent)); !errors.Is(err, writeErr) {
		t.Fatalf("PersistReadingUnitManifest second error = %v, want injected previous-update failure", err)
	}
	replay, err := service.ReplaySourceManifestEvents("contract-markdown", baseline.LatestSequence, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents after failed reading-unit supersede returned error: %v", err)
	}
	if len(replay.Events) != 0 {
		t.Fatalf("events after failed reading-unit supersede = %#v, want no misleading manifest-written event", replay.Events)
	}

	if _, err := service.PersistReadalongManifest(testReadalongManifest("ram-md-001", "rum-md-001", 1, ManifestSnapshotStateCurrent)); err != nil {
		t.Fatalf("PersistReadalongManifest first returned error: %v", err)
	}
	baseline, err = service.ReplaySourceManifestEvents("contract-markdown", 0, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents readalong baseline returned error: %v", err)
	}
	if _, err := service.PersistReadalongManifest(testReadalongManifest("ram-md-002", "rum-md-002", 2, ManifestSnapshotStateCurrent)); !errors.Is(err, writeErr) {
		t.Fatalf("PersistReadalongManifest second error = %v, want injected previous-update failure", err)
	}
	replay, err = service.ReplaySourceManifestEvents("contract-markdown", baseline.LatestSequence, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents after failed readalong supersede returned error: %v", err)
	}
	if len(replay.Events) != 0 {
		t.Fatalf("events after failed readalong supersede = %#v, want no misleading manifest-written event", replay.Events)
	}
}

func TestSourceManifestEventsSuppressPairWrittenWhenPreviousSupersedeWriteFails(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	if _, _, err := service.persistIncrementalManifestSnapshotPair(
		testReadingUnitManifest("rum-md-001", 1, ManifestSnapshotStateCurrent),
		testReadalongManifest("ram-md-001", "rum-md-001", 1, ManifestSnapshotStateCurrent),
	); err != nil {
		t.Fatalf("persistIncrementalManifestSnapshotPair first returned error: %v", err)
	}
	baseline, err := service.ReplaySourceManifestEvents("contract-markdown", 0, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents baseline returned error: %v", err)
	}
	if len(baseline.Events) != 2 {
		t.Fatalf("baseline events = %#v, want initial pair events", baseline.Events)
	}

	writeErr := errors.New("injected previous pair supersede write failure")
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

	_, _, err = service.persistIncrementalManifestSnapshotPair(
		testReadingUnitManifest("rum-md-002", 2, ManifestSnapshotStateCurrent),
		testReadalongManifest("ram-md-002", "rum-md-002", 2, ManifestSnapshotStateCurrent),
	)
	if !errors.Is(err, writeErr) {
		t.Fatalf("persistIncrementalManifestSnapshotPair second error = %v, want injected previous-update failure", err)
	}
	replay, err := service.ReplaySourceManifestEvents("contract-markdown", baseline.LatestSequence, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents after failed pair supersede returned error: %v", err)
	}
	if len(replay.Events) != 0 {
		t.Fatalf("events after failed pair supersede = %#v, want no misleading pair manifest-written events", replay.Events)
	}
}

func TestSourceManifestEventSubscriptionReceivesPublishedHints(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	subscription, replay, err := service.SubscribeSourceManifestEvents("bus-source", 0, 0)
	if err != nil {
		t.Fatalf("SubscribeSourceManifestEvents returned error: %v", err)
	}
	defer subscription.Close()
	if len(replay.Events) != 0 || replay.Gap {
		t.Fatalf("initial subscription replay = %#v, want empty without gap", replay)
	}
	published := service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          "bus-source",
		EventType:         SourceManifestEventExtractionRevisionUpdated,
		SnapshotAvailable: true,
		Subject:           SourceManifestEventSubject{SourceRevisionID: "bus-rev", State: "running"},
	})
	select {
	case event := <-subscription.Events():
		if event.EventID != published.EventID || event.Sequence != 1 || event.Subject.SourceRevisionID != "bus-rev" {
			t.Fatalf("subscription event = %#v, want published bus event %#v", event, published)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for source manifest subscription event")
	}
}

func TestSourceManifestSnapshotRejectsMismatchedSourceRevisionBinding(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{SourceID: "source-a", RevisionID: "rev-a", RawText: "a"}); err != nil {
		t.Fatalf("PersistSourceLifecycle source-a returned error: %v", err)
	}
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{SourceID: "source-b", RevisionID: "rev-b", RawText: "b"}); err != nil {
		t.Fatalf("PersistSourceLifecycle source-b returned error: %v", err)
	}
	_, err := service.GetSourceManifestSnapshot("source-a", "rev-b")
	if !errors.Is(err, ErrSourceLifecycleNotFound) {
		t.Fatalf("GetSourceManifestSnapshot mismatched revision error = %v, want ErrSourceLifecycleNotFound", err)
	}
}

func TestSourceManifestEventClonesMetadata(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	metadata := map[string]any{"nested": map[string]any{"value": "original"}, "items": []any{map[string]any{"id": "item-original"}}}
	event := service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          "clone-source",
		EventType:         SourceManifestEventExtractionRevisionUpdated,
		SnapshotAvailable: true,
		Subject:           SourceManifestEventSubject{SourceRevisionID: "clone-rev", State: "running"},
		Metadata:          metadata,
	})
	metadata["nested"].(map[string]any)["value"] = "mutated"
	metadata["items"].([]any)[0].(map[string]any)["id"] = "mutated"
	stored, err := service.ReplaySourceManifestEvents("clone-source", 0, 0)
	if err != nil {
		t.Fatalf("ReplaySourceManifestEvents returned error: %v", err)
	}
	if event.Metadata["nested"].(map[string]any)["value"] != "original" || stored.Events[0].Metadata["items"].([]any)[0].(map[string]any)["id"] != "item-original" {
		t.Fatalf("event metadata was not cloned: event=%#v stored=%#v", event.Metadata, stored.Events[0].Metadata)
	}
	stored.Events[0].Metadata["nested"].(map[string]any)["value"] = "getter-mutated"
	fresh, _ := service.ReplaySourceManifestEvents("clone-source", 0, 0)
	if !reflect.DeepEqual(fresh.Events[0].Metadata["nested"], map[string]any{"value": "original"}) {
		t.Fatalf("fresh metadata = %#v, want original after getter mutation", fresh.Events[0].Metadata)
	}
}
