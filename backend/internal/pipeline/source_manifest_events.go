package pipeline

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

const (
	sourceManifestEventSchemaVersion = "source-manifest-event.v1"
	sourceManifestEventReplayLimit   = 256
)

type SourceManifestEventType string

const (
	SourceManifestEventSourceRevisionCreated        SourceManifestEventType = "source_revision_created"
	SourceManifestEventExtractionRevisionUpdated    SourceManifestEventType = "extraction_revision_updated"
	SourceManifestEventReadingUnitManifestWritten   SourceManifestEventType = "reading_unit_manifest_written"
	SourceManifestEventReadalongManifestWritten     SourceManifestEventType = "readalong_manifest_written"
	SourceManifestEventAudioArtifactUpdated         SourceManifestEventType = "audio_artifact_updated"
	SourceManifestEventProgressUpdated              SourceManifestEventType = "progress_updated"
	SourceManifestEventRepairOverlayCreated         SourceManifestEventType = "repair_overlay_created"
	SourceManifestEventPromotionCrosswalkCreated    SourceManifestEventType = "promotion_crosswalk_created"
	SourceManifestEventArtifactInterruptedRetriable SourceManifestEventType = "artifact_interrupted_retriable"
)

type SourceManifestEventSubject struct {
	SourceRevisionID      string `json:"sourceRevisionId,omitempty"`
	ExtractionRevisionID  string `json:"extractionRevisionId,omitempty"`
	ReadingUnitManifestID string `json:"readingUnitManifestId,omitempty"`
	ReadalongManifestID   string `json:"readalongManifestId,omitempty"`
	AudioArtifactID       string `json:"audioArtifactId,omitempty"`
	ProgressID            string `json:"progressId,omitempty"`
	RepairOverlayID       string `json:"repairOverlayId,omitempty"`
	PromotionCrosswalkID  string `json:"promotionCrosswalkId,omitempty"`
	State                 string `json:"state,omitempty"`
}

type SourceManifestEvent struct {
	SchemaVersion      string                     `json:"schemaVersion"`
	EventID            string                     `json:"eventId"`
	SourceID           string                     `json:"sourceId"`
	Sequence           int64                      `json:"sequence"`
	OccurredAt         time.Time                  `json:"occurredAt"`
	EventType          SourceManifestEventType    `json:"eventType"`
	SnapshotAvailable  bool                       `json:"snapshotAvailable"`
	Cursor             string                     `json:"cursor,omitempty"`
	Subject            SourceManifestEventSubject `json:"subject"`
	SnapshotManifestID string                     `json:"snapshotManifestId,omitempty"`
	Metadata           map[string]any             `json:"metadata,omitempty"`
}

type SourceManifestEventReplay struct {
	SourceID         string                `json:"sourceId"`
	AfterSequence    int64                 `json:"afterSequence"`
	Events           []SourceManifestEvent `json:"events"`
	Gap              bool                  `json:"gap"`
	SnapshotRequired bool                  `json:"snapshotRequired"`
	LatestSequence   int64                 `json:"latestSequence"`
	NextCursor       string                `json:"nextCursor,omitempty"`
}

type SourceManifestSnapshotFallback struct {
	SourceID                   string               `json:"sourceId"`
	SourceRevisionID           string               `json:"sourceRevisionId,omitempty"`
	Cursor                     string               `json:"cursor,omitempty"`
	LatestSequence             int64                `json:"latestSequence"`
	SourceEnvelope             *SourceEnvelope      `json:"sourceEnvelope,omitempty"`
	SourceRevision             *SourceRevision      `json:"sourceRevision,omitempty"`
	CurrentReadingUnitManifest *ReadingUnitManifest `json:"currentReadingUnitManifest,omitempty"`
	CurrentReadalongManifest   *ReadalongManifest   `json:"currentReadalongManifest,omitempty"`
}

type SourceManifestSubscription struct {
	log *sourceManifestEventLog
	id  int64
	ch  <-chan SourceManifestEvent
}

func (subscription SourceManifestSubscription) Events() <-chan SourceManifestEvent {
	return subscription.ch
}

func (subscription SourceManifestSubscription) Close() {
	if subscription.log != nil && subscription.id > 0 {
		subscription.log.unsubscribe(subscription.id)
	}
}

type sourceManifestEventHint struct {
	SourceID           string
	OccurredAt         time.Time
	EventType          SourceManifestEventType
	SnapshotAvailable  bool
	Subject            SourceManifestEventSubject
	SnapshotManifestID string
	Metadata           map[string]any
}

type sourceManifestEventSubscriber struct {
	sourceID string
	ch       chan SourceManifestEvent
}

type sourceManifestEventLog struct {
	mu           sync.RWMutex
	maxEvents    int
	nextBySource map[string]int64
	events       map[string][]SourceManifestEvent
	subscribers  map[int64]sourceManifestEventSubscriber
	nextSubID    int64
}

func newSourceManifestEventLog(maxEvents int) *sourceManifestEventLog {
	if maxEvents <= 0 {
		maxEvents = sourceManifestEventReplayLimit
	}
	return &sourceManifestEventLog{
		maxEvents:    maxEvents,
		nextBySource: map[string]int64{},
		events:       map[string][]SourceManifestEvent{},
		subscribers:  map[int64]sourceManifestEventSubscriber{},
	}
}

func (service *Service) publishSourceManifestEvent(hint sourceManifestEventHint) SourceManifestEvent {
	if service == nil || service.sourceManifestEvents == nil {
		return SourceManifestEvent{}
	}
	return service.sourceManifestEvents.publish(hint)
}

func (log *sourceManifestEventLog) publish(hint sourceManifestEventHint) SourceManifestEvent {
	if log == nil {
		return SourceManifestEvent{}
	}
	sourceID := strings.TrimSpace(hint.SourceID)
	if sourceID == "" || hint.EventType == "" {
		return SourceManifestEvent{}
	}
	occurredAt := hint.OccurredAt.UTC()
	if occurredAt.IsZero() {
		occurredAt = time.Now().UTC()
	}

	log.mu.Lock()
	sequence := log.nextBySource[sourceID] + 1
	log.nextBySource[sourceID] = sequence
	event := SourceManifestEvent{
		SchemaVersion:      sourceManifestEventSchemaVersion,
		EventID:            deterministicSourceManifestEventID(sourceID, sequence),
		SourceID:           sourceID,
		Sequence:           sequence,
		OccurredAt:         occurredAt,
		EventType:          hint.EventType,
		SnapshotAvailable:  hint.SnapshotAvailable,
		Cursor:             sourceManifestCursor(sourceID, sequence),
		Subject:            cloneSourceManifestEventSubject(hint.Subject),
		SnapshotManifestID: strings.TrimSpace(hint.SnapshotManifestID),
		Metadata:           cloneManifestMetadata(hint.Metadata),
	}
	log.events[sourceID] = append(log.events[sourceID], event)
	if len(log.events[sourceID]) > log.maxEvents {
		start := len(log.events[sourceID]) - log.maxEvents
		log.events[sourceID] = append([]SourceManifestEvent(nil), log.events[sourceID][start:]...)
	}
	subscribers := make([]sourceManifestEventSubscriber, 0, len(log.subscribers))
	for _, subscriber := range log.subscribers {
		if subscriber.sourceID == sourceID {
			subscribers = append(subscribers, subscriber)
		}
	}
	log.mu.Unlock()

	for _, subscriber := range subscribers {
		select {
		case subscriber.ch <- cloneSourceManifestEvent(event):
		default:
		}
	}
	return cloneSourceManifestEvent(event)
}

func (service *Service) ReplaySourceManifestEvents(sourceID string, afterSequence int64, limit int) (SourceManifestEventReplay, error) {
	cleanSourceID := strings.TrimSpace(sourceID)
	if cleanSourceID == "" {
		return SourceManifestEventReplay{}, ErrSourceManifestEventInvalid
	}
	if afterSequence < 0 {
		return SourceManifestEventReplay{}, ErrSourceManifestEventInvalid
	}
	if service == nil || service.sourceManifestEvents == nil {
		return SourceManifestEventReplay{SourceID: cleanSourceID, AfterSequence: afterSequence}, nil
	}
	replay := service.sourceManifestEvents.replay(cleanSourceID, afterSequence, limit)
	return replay, nil
}

func (service *Service) SubscribeSourceManifestEvents(sourceID string, afterSequence int64, limit int) (SourceManifestSubscription, SourceManifestEventReplay, error) {
	cleanSourceID := strings.TrimSpace(sourceID)
	if cleanSourceID == "" || afterSequence < 0 {
		return SourceManifestSubscription{}, SourceManifestEventReplay{}, ErrSourceManifestEventInvalid
	}
	if service == nil || service.sourceManifestEvents == nil {
		return SourceManifestSubscription{}, SourceManifestEventReplay{SourceID: cleanSourceID, AfterSequence: afterSequence}, nil
	}
	subscription, replay := service.sourceManifestEvents.subscribe(cleanSourceID, afterSequence, limit)
	return subscription, replay, nil
}

func (log *sourceManifestEventLog) replay(sourceID string, afterSequence int64, limit int) SourceManifestEventReplay {
	if limit <= 0 || limit > sourceManifestEventReplayLimit {
		limit = sourceManifestEventReplayLimit
	}
	log.mu.RLock()
	retained := log.events[sourceID]
	latest := log.nextBySource[sourceID]
	selected, gap := selectSourceManifestEventsForReplay(retained, afterSequence, limit)
	log.mu.RUnlock()
	return sourceManifestEventReplayFromSelected(sourceID, afterSequence, selected, gap, latest)
}

func (log *sourceManifestEventLog) subscribe(sourceID string, afterSequence int64, limit int) (SourceManifestSubscription, SourceManifestEventReplay) {
	if limit <= 0 || limit > sourceManifestEventReplayLimit {
		limit = sourceManifestEventReplayLimit
	}
	log.mu.Lock()
	retained := log.events[sourceID]
	latest := log.nextBySource[sourceID]
	selected, gap := selectSourceManifestEventsForReplay(retained, afterSequence, limit)
	log.nextSubID++
	id := log.nextSubID
	ch := make(chan SourceManifestEvent, sourceManifestEventReplayLimit)
	log.subscribers[id] = sourceManifestEventSubscriber{sourceID: sourceID, ch: ch}
	log.mu.Unlock()
	return SourceManifestSubscription{log: log, id: id, ch: ch}, sourceManifestEventReplayFromSelected(sourceID, afterSequence, selected, gap, latest)
}

func (log *sourceManifestEventLog) unsubscribe(id int64) {
	log.mu.Lock()
	delete(log.subscribers, id)
	log.mu.Unlock()
}

func selectSourceManifestEventsForReplay(retained []SourceManifestEvent, afterSequence int64, limit int) ([]SourceManifestEvent, bool) {
	if len(retained) == 0 {
		return []SourceManifestEvent{}, afterSequence > 0
	}
	firstRetainedSequence := retained[0].Sequence
	gap := afterSequence > 0 && afterSequence+1 < firstRetainedSequence
	selected := make([]SourceManifestEvent, 0, len(retained))
	for _, event := range retained {
		if event.Sequence > afterSequence {
			selected = append(selected, cloneSourceManifestEvent(event))
		}
	}
	if len(selected) > limit {
		gap = true
		selected = selected[:limit]
	}
	return selected, gap
}

func sourceManifestEventReplayFromSelected(sourceID string, afterSequence int64, selected []SourceManifestEvent, gap bool, latest int64) SourceManifestEventReplay {
	nextCursor := ""
	if len(selected) > 0 {
		nextCursor = selected[len(selected)-1].Cursor
	} else if latest > 0 {
		nextCursor = sourceManifestCursor(sourceID, latest)
	}
	return SourceManifestEventReplay{
		SourceID:         sourceID,
		AfterSequence:    afterSequence,
		Events:           selected,
		Gap:              gap,
		SnapshotRequired: gap,
		LatestSequence:   latest,
		NextCursor:       nextCursor,
	}
}

func (service *Service) GetSourceManifestSnapshot(sourceID string, sourceRevisionID string) (SourceManifestSnapshotFallback, error) {
	cleanSourceID := strings.TrimSpace(sourceID)
	cleanRevisionID := strings.TrimSpace(sourceRevisionID)
	if cleanSourceID == "" {
		return SourceManifestSnapshotFallback{}, ErrSourceLifecycleNotFound
	}
	service.mu.RLock()
	envelope, hasEnvelope := service.sourceEnvelopes[cleanSourceID]
	if hasEnvelope {
		envelope = cloneSourceEnvelope(envelope)
		if cleanRevisionID == "" {
			cleanRevisionID = envelope.CurrentRevisionID
		}
	}
	revision, hasRevision := service.sourceRevisions[cleanRevisionID]
	if hasRevision {
		revision = cloneSourceRevision(revision)
	}
	var readingUnit *ReadingUnitManifest
	if cleanRevisionID != "" {
		key := manifestCurrentKey{Kind: ManifestSnapshotKindReadingUnit, SourceID: cleanSourceID, SourceRevisionID: cleanRevisionID}
		if manifestID := service.currentManifests[key]; manifestID != "" {
			if manifest, ok := service.readingUnits[manifestID]; ok {
				clone := cloneReadingUnitManifest(manifest)
				readingUnit = &clone
			}
		}
	}
	var readalong *ReadalongManifest
	if cleanRevisionID != "" {
		key := manifestCurrentKey{Kind: ManifestSnapshotKindReadalong, SourceID: cleanSourceID, SourceRevisionID: cleanRevisionID}
		if manifestID := service.currentManifests[key]; manifestID != "" {
			if manifest, ok := service.readalongs[manifestID]; ok {
				clone := cloneReadalongManifest(manifest)
				readalong = &clone
			}
		}
	}
	service.mu.RUnlock()
	if !hasEnvelope || cleanRevisionID == "" || !hasRevision || revision.SourceID != cleanSourceID {
		return SourceManifestSnapshotFallback{}, ErrSourceLifecycleNotFound
	}
	latestSequence := int64(0)
	if service.sourceManifestEvents != nil {
		latestSequence = service.sourceManifestEvents.latestSequence(cleanSourceID)
	}
	return SourceManifestSnapshotFallback{
		SourceID:                   cleanSourceID,
		SourceRevisionID:           cleanRevisionID,
		Cursor:                     sourceManifestCursor(cleanSourceID, latestSequence),
		LatestSequence:             latestSequence,
		SourceEnvelope:             &envelope,
		SourceRevision:             &revision,
		CurrentReadingUnitManifest: readingUnit,
		CurrentReadalongManifest:   readalong,
	}, nil
}

func (log *sourceManifestEventLog) latestSequence(sourceID string) int64 {
	log.mu.RLock()
	defer log.mu.RUnlock()
	return log.nextBySource[sourceID]
}

func publishSourceLifecycleCreatedEvent(service *Service, envelope SourceEnvelope, revision SourceRevision) {
	service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          revision.SourceID,
		OccurredAt:        revision.CreatedAt,
		EventType:         SourceManifestEventSourceRevisionCreated,
		SnapshotAvailable: true,
		Subject: SourceManifestEventSubject{
			SourceRevisionID: revision.RevisionID,
			State:            string(revision.RevisionState),
		},
		Metadata: map[string]any{
			"currentRevisionId": envelope.CurrentRevisionID,
			"workStatus":        string(metadataWorkStatus(revision.Metadata)),
		},
	})
}

func publishSourceLifecycleStatusEvent(service *Service, envelope SourceEnvelope, revision SourceRevision, status SourceLifecycleWorkStatus) {
	service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          revision.SourceID,
		OccurredAt:        time.Now().UTC(),
		EventType:         SourceManifestEventExtractionRevisionUpdated,
		SnapshotAvailable: true,
		Subject: SourceManifestEventSubject{
			SourceRevisionID: revision.RevisionID,
			State:            string(status),
		},
		Metadata: map[string]any{
			"currentRevisionId": envelope.CurrentRevisionID,
			"workStatus":        string(status),
		},
	})
}

func publishReadingUnitManifestEvent(service *Service, manifest ReadingUnitManifest) {
	service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          manifest.SourceID,
		OccurredAt:        manifest.GeneratedAt,
		EventType:         SourceManifestEventReadingUnitManifestWritten,
		SnapshotAvailable: true,
		Subject: SourceManifestEventSubject{
			SourceRevisionID:      manifest.SourceRevisionID,
			ExtractionRevisionID:  manifest.ExtractionRevisionID,
			ReadingUnitManifestID: manifest.ManifestID,
			State:                 string(manifest.State),
		},
		SnapshotManifestID: manifest.ManifestID,
		Metadata: map[string]any{
			"manifestRevision": manifest.ManifestRevision,
			"unitCount":        manifest.Summary.UnitCount,
		},
	})
}

func publishReadalongManifestEvent(service *Service, manifest ReadalongManifest) {
	service.publishSourceManifestEvent(sourceManifestEventHint{
		SourceID:          manifest.SourceID,
		OccurredAt:        manifest.GeneratedAt,
		EventType:         SourceManifestEventReadalongManifestWritten,
		SnapshotAvailable: true,
		Subject: SourceManifestEventSubject{
			SourceRevisionID:      manifest.SourceRevisionID,
			ExtractionRevisionID:  manifest.ExtractionRevisionID,
			ReadingUnitManifestID: manifest.ReadingUnitManifestID,
			ReadalongManifestID:   manifest.ManifestID,
			State:                 string(manifest.State),
		},
		SnapshotManifestID: manifest.ManifestID,
		Metadata: map[string]any{
			"manifestRevision": manifest.ManifestRevision,
			"unitCount":        len(manifest.UnitIDs),
		},
	})
}

func deterministicSourceManifestEventID(sourceID string, sequence int64) string {
	return fmt.Sprintf("evt-%s-%06d", sourceLifecycleDataPathID(sourceID), sequence)
}

func sourceManifestCursor(sourceID string, sequence int64) string {
	if strings.TrimSpace(sourceID) == "" || sequence <= 0 {
		return ""
	}
	return fmt.Sprintf("%s:%d", sourceID, sequence)
}

func cloneSourceManifestEvent(event SourceManifestEvent) SourceManifestEvent {
	event.Subject = cloneSourceManifestEventSubject(event.Subject)
	event.Metadata = cloneManifestMetadata(event.Metadata)
	return event
}

func cloneSourceManifestEventSubject(subject SourceManifestEventSubject) SourceManifestEventSubject {
	subject.SourceRevisionID = strings.TrimSpace(subject.SourceRevisionID)
	subject.ExtractionRevisionID = strings.TrimSpace(subject.ExtractionRevisionID)
	subject.ReadingUnitManifestID = strings.TrimSpace(subject.ReadingUnitManifestID)
	subject.ReadalongManifestID = strings.TrimSpace(subject.ReadalongManifestID)
	subject.AudioArtifactID = strings.TrimSpace(subject.AudioArtifactID)
	subject.ProgressID = strings.TrimSpace(subject.ProgressID)
	subject.RepairOverlayID = strings.TrimSpace(subject.RepairOverlayID)
	subject.PromotionCrosswalkID = strings.TrimSpace(subject.PromotionCrosswalkID)
	subject.State = strings.TrimSpace(subject.State)
	return subject
}
