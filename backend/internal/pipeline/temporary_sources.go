package pipeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/policy"
	"github.com/justinedwards/tts-research/backend/internal/sourceprep"
)

const temporarySourceMetadataFilename = "temporary-source.json"
const temporarySourceIDPrefix = "tmp_"

type CreateTemporarySourceRequest struct {
	Kind                  PreparedSourceKind `json:"kind"`
	Text                  string             `json:"text,omitempty"`
	URL                   string             `json:"url,omitempty"`
	LocalPath             string             `json:"localPath,omitempty"`
	SourceName            string             `json:"sourceName,omitempty"`
	SourceContentType     string             `json:"sourceContentType,omitempty"`
	SourceBytes           int64              `json:"sourceBytes,omitempty"`
	MarkdownParseMode     string             `json:"markdownParseMode,omitempty"`
	HTMLContainerSelector string             `json:"htmlContainerSelector,omitempty"`
}

type TemporarySourcePromotionRequest struct {
	ProjectID                  string                            `json:"projectId"`
	CreateProjectName          string                            `json:"createProjectName,omitempty"`
	Title                      string                            `json:"title,omitempty"`
	SourceType                 string                            `json:"sourceType,omitempty"`
	Language                   string                            `json:"language,omitempty"`
	Scope                      string                            `json:"scope,omitempty"`
	StructureChoice            string                            `json:"structureChoice,omitempty"`
	StructureLabel             string                            `json:"structureLabel,omitempty"`
	SpeechPolicyProfile        string                            `json:"speechPolicyProfile,omitempty"`
	VoiceProfileID             string                            `json:"voiceProfileId,omitempty"`
	ConflictResolution         string                            `json:"conflictResolution,omitempty"`
	Keep                       TemporarySourcePromotionKeep      `json:"keep,omitempty"`
	PreserveGeneratedArtifacts bool                              `json:"preserveGeneratedArtifacts,omitempty"`
	ClientManifest             *TemporarySourcePromotionManifest `json:"manifest,omitempty"`
}

type TemporarySourcePromotionKeep struct {
	ExtractedSource   bool `json:"extractedSource,omitempty"`
	ReviewEdits       bool `json:"reviewEdits,omitempty"`
	LexiconOverrides  bool `json:"lexiconOverrides,omitempty"`
	PolicySourcePin   bool `json:"policySourcePin,omitempty"`
	GeneratedAudio    bool `json:"generatedAudio,omitempty"`
	TimingMaps        bool `json:"timingMaps,omitempty"`
	Bookmarks         bool `json:"bookmarks,omitempty"`
	Progress          bool `json:"progress,omitempty"`
	DiagnosticsReport bool `json:"diagnosticsReport,omitempty"`
}

type TemporarySourcePromotionManifest struct {
	TemporarySourceID string                       `json:"temporarySourceId"`
	ProjectID         string                       `json:"projectId"`
	SourceID          string                       `json:"sourceId,omitempty"`
	Title             string                       `json:"title"`
	SourceType        string                       `json:"sourceType,omitempty"`
	Language          string                       `json:"language,omitempty"`
	Scope             string                       `json:"scope,omitempty"`
	Keep              TemporarySourcePromotionKeep `json:"keep"`
	StorageImpact     int64                        `json:"storageImpactBytes,omitempty"`
	Warnings          []string                     `json:"warnings,omitempty"`
	CreatedAt         time.Time                    `json:"createdAt"`
}

func (service *Service) CreateTemporarySource(ctx context.Context, request CreateTemporarySourceRequest) (TemporarySourceSession, error) {
	kind := request.Kind
	if kind == "" {
		kind = PreparedSourceKindText
	}

	sourceText := strings.TrimSpace(request.Text)
	sourceName := strings.TrimSpace(request.SourceName)
	sourceURL := strings.TrimSpace(request.URL)
	localPath := strings.TrimSpace(request.LocalPath)
	contentType := strings.TrimSpace(request.SourceContentType)
	sourceBytes := request.SourceBytes
	var urlSafety *sourceprep.URLSafetyReport

	if kind == PreparedSourceKindURL {
		fetched, err := service.fetchReadableSourceURL(ctx, sourceURL)
		if err != nil {
			return TemporarySourceSession{}, err
		}
		sourceText = string(fetched.Bytes)
		sourceName = fetched.Filename
		sourceURL = fetched.URL
		contentType = fetched.ContentType
		sourceBytes = int64(len(fetched.Bytes))
		safety := fetched.Safety
		urlSafety = &safety
	}
	if localPath != "" {
		data, err := os.ReadFile(localPath)
		if err != nil {
			return TemporarySourceSession{}, err
		}
		sourceText = string(data)
		if sourceName == "" {
			sourceName = filepath.Base(localPath)
		}
		sourceBytes = int64(len(data))
		if kind == "" || kind == PreparedSourceKindText {
			kind = PreparedSourceKindFile
		}
	}
	if sourceName == "" {
		sourceName = "Untitled temporary source"
	}
	if strings.TrimSpace(sourceText) == "" {
		return TemporarySourceSession{}, ErrEmptyText
	}

	now := time.Now().UTC()
	id := temporarySourceIDPrefix + newID()
	markdownParseMode := normalizeMarkdownParseMode(request.MarkdownParseMode)
	preprocessed := preprocessReadableSource(
		sourceText,
		sourceName,
		contentType,
		service.options.SourcePrepSentenceMaxRunes,
		markdownParseMode,
		request.HTMLContainerSelector,
	)
	metadata := preprocessed.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	if urlSafety != nil {
		metadata["urlSafety"] = *urlSafety
		metadata["urlProvenance"] = urlProvenanceMetadata(request.URL, sourceURL)
	}
	metadata["preprocessorId"] = preprocessed.PreprocessorID
	metadata["preprocessorVersion"] = preprocessed.PreprocessorVersion
	metadata["sourceFormat"] = preprocessed.SourceFormat
	metadata["renderMode"] = preprocessed.RenderMode
	metadata["markdownParseMode"] = preprocessed.MarkdownParseMode

	source := PreparedSource{
		ID:                id,
		ProjectID:         "",
		SourceOwner:       SourceOwnerTemporary,
		TemporarySourceID: id,
		Status:            PreparedSourceStatusReady,
		Kind:              kind,
		SourceName:        sourceName,
		SourceURL:         sourceURL,
		SourceContentType: contentType,
		SourceBytes:       sourceBytes,
		Text:              sourceText,
		MarkdownParseMode: markdownParseMode,
		Title:             firstNonEmpty(preprocessed.Title, inferPreparedSourceTitle(sourceText, sourceName)),
		Blocks:            preprocessed.Blocks,
		SkippedItems:      preprocessed.SkippedItems,
		Warnings:          preprocessed.Warnings,
		Metadata:          metadata,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	source.SpeechPolicyProfile = string(policy.DefaultProfileName)
	source = applySpeechPolicyToPreparedSource(source, source.SpeechPolicyProfile, policy.Overrides{}, service.options.SourcePrepSentenceMaxRunes)
	source = service.applySpeechRenderToPreparedSource(source, SpeechRenderOptions{})
	source = service.sanitizePreparedSourceWarnings(sanitizePreparedSourceReferenceCueLeaks(source, service.options.SourcePrepSentenceMaxRunes))
	readiness := preparedSourceNeedsMetadataReadiness(source)
	source.SourceReadiness = &readiness

	session := temporarySessionFromPreparedSource(source, now, now.Add(service.options.TemporarySourceTTL))
	session.Scope = SourceArtifactScopeTemporary
	session.Artifacts = append(session.Artifacts, SourceArtifactRef{
		ID:        "source",
		Scope:     SourceArtifactScopeTemporary,
		Kind:      SourceArtifactKindExtraction,
		URL:       fmt.Sprintf("/api/temporary-sources/%s/artifacts", id),
		Bytes:     int64(len([]byte(sourceText))),
		CreatedAt: now,
		ExpiresAt: &session.ExpiresAt,
	})
	if err := service.persistTemporarySource(session); err != nil {
		return TemporarySourceSession{}, err
	}
	service.mu.Lock()
	service.temporary[session.ID] = cloneTemporarySourceSession(session)
	service.mu.Unlock()
	return session, nil
}

func (service *Service) GetTemporarySource(id string) (TemporarySourceSession, error) {
	source, err := service.getTemporarySource(id, true)
	if err != nil {
		if errors.Is(err, ErrTemporarySourceExpired) || errors.Is(err, ErrTemporarySourceNotFound) {
			return service.recoverExpiredTemporarySource(id)
		}
		return TemporarySourceSession{}, err
	}
	return source, nil
}

func (service *Service) ConfirmTemporarySourceReadiness(id string, request SourceReadinessConfirmationRequest) (TemporarySourceSession, error) {
	session, err := service.getTemporarySource(id, true)
	if err != nil {
		return TemporarySourceSession{}, err
	}
	now := time.Now().UTC()
	if title := strings.TrimSpace(request.Title); title != "" {
		session.Title = title
	}
	if profile := strings.TrimSpace(request.SpeechPolicyProfile); profile != "" {
		session.SourceSpeechPolicyProfile = profile
	}
	if session.Metadata == nil {
		session.Metadata = map[string]any{}
	}
	if language := strings.TrimSpace(request.Language); language != "" {
		session.Metadata["language"] = language
	}
	if sourceType := strings.TrimSpace(request.SourceType); sourceType != "" {
		session.Metadata["sourceType"] = sourceType
	}
	if structureChoice := strings.TrimSpace(request.StructureChoice); structureChoice != "" {
		session.Metadata["structureChoice"] = structureChoice
	}
	if voiceProfileID := strings.TrimSpace(request.VoiceProfileID); voiceProfileID != "" {
		session.Metadata["voiceProfileId"] = voiceProfileID
	}
	readiness := confirmedPreparedSourceReadiness(preparedSourceFromTemporarySession(session), request, now)
	session.SourceReadiness = &readiness
	session.Status = TemporarySourceStatePreviewable
	session.UpdatedAt = now
	session.LastAccessedAt = now
	if err := service.persistTemporarySource(session); err != nil {
		return TemporarySourceSession{}, err
	}
	service.mu.Lock()
	service.temporary[session.ID] = cloneTemporarySourceSession(session)
	service.mu.Unlock()
	return session, nil
}

func (service *Service) CreateTemporarySourceJob(ctx context.Context, id string, request CreateJobRequest) (VoiceJob, error) {
	session, err := service.getTemporarySource(id, true)
	if err != nil {
		return VoiceJob{}, err
	}
	if session.Status == TemporarySourceStateExpired || session.Status == TemporarySourceStateDiscarded {
		return VoiceJob{}, ErrTemporarySourceExpired
	}
	source := preparedSourceFromTemporarySession(session)
	source = service.sanitizePreparedSourceWarnings(applySpeechPolicyToPreparedSource(
		source,
		firstNonEmpty(request.SpeechPolicyProfile, source.SpeechPolicyProfile),
		request.SpeechPolicyOverrides,
		service.options.SourcePrepSentenceMaxRunes,
	))
	source = service.applySpeechRenderToPreparedSource(source, SpeechRenderOptions{
		VoiceProfileID: request.VoiceProfileID,
		Locale:         request.Locale,
		TTSEngine:      request.TTSEngine,
	})
	selected := map[string]struct{}{}
	for _, id := range request.SelectedBlockIDs {
		if trimmed := strings.TrimSpace(id); trimmed != "" {
			selected[trimmed] = struct{}{}
		}
	}
	parts := make([]string, 0, len(source.Blocks))
	selectedIDs := make([]string, 0)
	warnings := make([]string, 0)
	for _, block := range source.Blocks {
		if len(selected) > 0 {
			if _, ok := selected[block.ID]; !ok {
				continue
			}
		}
		if !isPreparedSourceSelectionSpeakable(block) {
			continue
		}
		parts = append(parts, strings.TrimSpace(block.SpokenText))
		selectedIDs = append(selectedIDs, block.ID)
		warnings = append(warnings, block.Warnings...)
	}
	if len(parts) == 0 {
		return VoiceJob{}, ErrEmptyText
	}
	request.ProjectID = ""
	request.PreparedSourceID = ""
	request.TemporarySourceID = session.ID
	request.SelectedBlockIDs = selectedIDs
	request.SourceKind = string(source.Kind)
	request.ProgressTargetID = progressTargetForTemporarySource(session.ID)
	request.Text = strings.Join(parts, "\n\n")
	request.SpeechRenderApplied = true
	job, err := service.CreateJob(ctx, request)
	if err != nil {
		return VoiceJob{}, err
	}
	service.updateJob(job.ID, func(stored *storedJob) {
		stored.SegmentationWarnings = uniqueStrings(warnings)
	})
	session.Status = TemporarySourceStateGenerating
	session.UpdatedAt = time.Now().UTC()
	session.LastAccessedAt = session.UpdatedAt
	session.Artifacts = upsertSourceArtifact(session.Artifacts, SourceArtifactRef{
		ID:        job.ID,
		Scope:     SourceArtifactScopeTemporary,
		Kind:      SourceArtifactKindGeneratedAudio,
		URL:       fmt.Sprintf("/api/voice-jobs/%s/audio", job.ID),
		CreatedAt: session.UpdatedAt,
		ExpiresAt: &session.ExpiresAt,
	})
	_ = service.persistTemporarySource(session)
	service.mu.Lock()
	service.temporary[session.ID] = cloneTemporarySourceSession(session)
	service.mu.Unlock()
	updated, getErr := service.GetJob(job.ID)
	if getErr == nil {
		job = updated
	}
	return job, nil
}

func (service *Service) ListTemporarySourceArtifacts(id string) ([]SourceArtifactRef, error) {
	session, err := service.getTemporarySource(id, true)
	if err != nil {
		return nil, err
	}
	return append([]SourceArtifactRef(nil), session.Artifacts...), nil
}

func (service *Service) DeleteTemporarySource(id string) error {
	session, err := service.getTemporarySource(id, false)
	if err != nil {
		return err
	}
	_, err = service.removeTemporarySource(session, TemporarySourceStateDiscarded, true)
	return err
}

func (service *Service) CleanupExpiredTemporarySources(now time.Time) ([]string, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	service.mu.RLock()
	sources := make([]TemporarySourceSession, 0, len(service.temporary))
	seen := map[string]struct{}{}
	for _, source := range service.temporary {
		seen[source.ID] = struct{}{}
		if !source.ExpiresAt.After(now) {
			sources = append(sources, cloneTemporarySourceSession(source))
		}
	}
	service.mu.RUnlock()
	for _, source := range service.loadTemporarySourceMetadataSessions() {
		if _, ok := seen[source.ID]; ok {
			continue
		}
		if source.Status == TemporarySourceStateExpired ||
			(!source.ExpiresAt.IsZero() && !source.ExpiresAt.After(now)) {
			sources = append(sources, cloneTemporarySourceSession(source))
		}
	}
	removed := make([]string, 0, len(sources))
	for _, source := range sources {
		if service.temporarySourceHasActiveJob(source.ID) {
			source.ExpiresAt = now.Add(service.options.TemporarySourceTTL)
			source.LastAccessedAt = now
			source.UpdatedAt = now
			_ = service.persistTemporarySource(source)
			service.mu.Lock()
			service.temporary[source.ID] = cloneTemporarySourceSession(source)
			service.mu.Unlock()
			continue
		}
		if _, err := service.removeTemporarySource(source, TemporarySourceStateExpired, false); err != nil {
			return removed, err
		}
		removed = append(removed, source.ID)
	}
	return removed, nil
}

func (service *Service) CleanupTemporarySource(id string, request TemporarySourceCleanupRequest) (TemporarySourceCleanupResult, error) {
	session, err := service.getTemporarySource(id, false)
	if err != nil && !errors.Is(err, ErrTemporarySourceExpired) {
		return TemporarySourceCleanupResult{}, err
	}
	if errors.Is(err, ErrTemporarySourceExpired) {
		session, err = service.recoverExpiredTemporarySource(id)
		if err != nil {
			return TemporarySourceCleanupResult{}, err
		}
	}
	action := request.Action
	if action == "" {
		action = TemporarySourceCleanupDiscardNow
	}
	switch action {
	case TemporarySourceCleanupDiscardNow:
		removed, err := service.removeTemporarySource(session, TemporarySourceStateDiscarded, true)
		if err != nil {
			return TemporarySourceCleanupResult{}, err
		}
		return TemporarySourceCleanupResult{
			TemporarySourceID: session.ID,
			Action:            action,
			Status:            TemporarySourceStateDiscarded,
			RemovedBytes:      removed,
			Message:           "Temporary source discarded.",
		}, nil
	case TemporarySourceCleanupExtendSession:
		now := time.Now().UTC()
		extendBy := time.Duration(request.ExtendByHours) * time.Hour
		if extendBy <= 0 {
			extendBy = service.options.TemporarySourceTTL
		}
		session.Status = firstActiveTemporaryStatus(session.Status)
		session.LastAccessedAt = now
		session.ExpiresAt = now.Add(extendBy)
		session.UpdatedAt = now
		session.Error = ""
		if err := service.persistTemporarySource(session); err != nil {
			return TemporarySourceCleanupResult{}, err
		}
		service.mu.Lock()
		service.temporary[session.ID] = cloneTemporarySourceSession(session)
		service.mu.Unlock()
		return TemporarySourceCleanupResult{
			TemporarySourceID: session.ID,
			Action:            action,
			Status:            session.Status,
			ExpiresAt:         &session.ExpiresAt,
			Message:           "Temporary session extended.",
			Source:            &session,
		}, nil
	case TemporarySourceCleanupRemoveAudioOnly:
		removed, err := service.removeTemporaryGeneratedAudio(session)
		if err != nil {
			return TemporarySourceCleanupResult{}, err
		}
		session.Artifacts = filterSourceArtifacts(session.Artifacts, func(artifact SourceArtifactRef) bool {
			return artifact.Kind != SourceArtifactKindGeneratedAudio &&
				artifact.Kind != SourceArtifactKindTiming &&
				artifact.Kind != SourceArtifactKindValidation
		})
		session.Status = TemporarySourceStateStale
		session.UpdatedAt = time.Now().UTC()
		session.LastAccessedAt = session.UpdatedAt
		if err := service.persistTemporarySource(session); err != nil {
			return TemporarySourceCleanupResult{}, err
		}
		service.mu.Lock()
		service.temporary[session.ID] = cloneTemporarySourceSession(session)
		service.mu.Unlock()
		return TemporarySourceCleanupResult{
			TemporarySourceID: session.ID,
			Action:            action,
			Status:            session.Status,
			RemovedBytes:      removed,
			Message:           "Generated audio removed; extracted source remains available.",
			Source:            &session,
		}, nil
	case TemporarySourceCleanupRemoveAllArtifacts:
		removed, err := service.removeTemporarySource(session, TemporarySourceStateExpired, false)
		if err != nil {
			return TemporarySourceCleanupResult{}, err
		}
		recovered, recoverErr := service.recoverExpiredTemporarySource(session.ID)
		if recoverErr == nil {
			return TemporarySourceCleanupResult{
				TemporarySourceID: session.ID,
				Action:            action,
				Status:            TemporarySourceStateExpired,
				RemovedBytes:      removed,
				Message:           "Temporary artifacts removed; recovery metadata remains.",
				Source:            &recovered,
			}, nil
		}
		return TemporarySourceCleanupResult{
			TemporarySourceID: session.ID,
			Action:            action,
			Status:            TemporarySourceStateExpired,
			RemovedBytes:      removed,
			Message:           "Temporary artifacts removed.",
		}, nil
	default:
		return TemporarySourceCleanupResult{}, fmt.Errorf("%w: unsupported cleanup action %q", ErrTemporarySourceConflict, action)
	}
}

func (service *Service) ClearExpiredTemporarySources(now time.Time) (TemporarySourceCleanupResult, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	sources := service.expiredTemporarySourceSessions(now)
	ids := make([]string, 0, len(sources))
	var removed int64
	for _, source := range sources {
		if service.temporarySourceHasActiveJob(source.ID) {
			continue
		}
		bytes, err := service.removeTemporarySource(source, TemporarySourceStateExpired, true)
		if err != nil {
			return TemporarySourceCleanupResult{}, err
		}
		removed += bytes
		ids = append(ids, source.ID)
	}
	return TemporarySourceCleanupResult{
		Action:       TemporarySourceCleanupRemoveAllArtifacts,
		Status:       TemporarySourceStateExpired,
		RemovedBytes: removed,
		Message:      fmt.Sprintf("Cleaned %d expired temporary session(s).", len(ids)),
	}, nil
}

func (service *Service) expiredTemporarySourceSessions(now time.Time) []TemporarySourceSession {
	service.mu.RLock()
	sources := make([]TemporarySourceSession, 0, len(service.temporary))
	seen := map[string]struct{}{}
	for _, source := range service.temporary {
		seen[source.ID] = struct{}{}
		if !source.ExpiresAt.After(now) || source.Status == TemporarySourceStateExpired {
			sources = append(sources, cloneTemporarySourceSession(source))
		}
	}
	service.mu.RUnlock()
	for _, source := range service.loadTemporarySourceMetadataSessions() {
		if _, ok := seen[source.ID]; ok {
			continue
		}
		if source.Status == TemporarySourceStateExpired ||
			(!source.ExpiresAt.IsZero() && !source.ExpiresAt.After(now)) {
			sources = append(sources, cloneTemporarySourceSession(source))
		}
	}
	return sources
}

func (service *Service) TemporaryStorageUsageSummary(now time.Time) TemporaryStorageUsageSummary {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	sessions := make([]TemporarySourceSession, 0)
	service.mu.RLock()
	for _, session := range service.temporary {
		sessions = append(sessions, cloneTemporarySourceSession(session))
	}
	service.mu.RUnlock()
	seen := map[string]struct{}{}
	for _, session := range sessions {
		seen[session.ID] = struct{}{}
	}
	for _, session := range service.loadTemporarySourceMetadataSessions() {
		if _, ok := seen[session.ID]; ok {
			continue
		}
		if session.Status == TemporarySourceStateExpired ||
			(!session.ExpiresAt.IsZero() && !session.ExpiresAt.After(now)) {
			sessions = append(sessions, cloneTemporarySourceSession(session))
		}
	}
	summary := TemporaryStorageUsageSummary{UpdatedAt: now}
	for _, session := range sessions {
		bytes := service.temporarySourceStorageBytes(session.ID)
		row := TemporaryStorageUsageSession{
			TemporarySourceID: session.ID,
			Title:             firstNonEmpty(session.Title, session.SourceName),
			Status:            session.Status,
			Bytes:             bytes.total,
			AudioBytes:        bytes.audio,
			ArtifactBytes:     bytes.artifact,
			SourceBytes:       bytes.source,
			ProgressBytes:     bytes.progress,
			ExpiresAt:         session.ExpiresAt,
			LastAccessedAt:    session.LastAccessedAt,
		}
		summary.Sessions = append(summary.Sessions, row)
		summary.TotalBytes += bytes.total
		summary.SourceBytes += bytes.source
		summary.ArtifactBytes += bytes.artifact
		summary.AudioBytes += bytes.audio
		summary.ProgressBytes += bytes.progress
		summary.TemporaryCount++
		if !session.ExpiresAt.After(now) || session.Status == TemporarySourceStateExpired {
			summary.ExpiredCount++
		}
		if service.temporarySourceHasActiveJob(session.ID) {
			summary.GeneratingCount++
		}
	}
	sort.Slice(summary.Sessions, func(i, j int) bool {
		return summary.Sessions[i].LastAccessedAt.After(summary.Sessions[j].LastAccessedAt)
	})
	return summary
}

type temporaryStorageBytes struct {
	total    int64
	source   int64
	artifact int64
	audio    int64
	progress int64
}

func (service *Service) recoverExpiredTemporarySource(id string) (TemporarySourceSession, error) {
	session, err := service.loadTemporarySourceMetadata(id)
	if err != nil {
		return TemporarySourceSession{}, err
	}
	session.Status = TemporarySourceStateExpired
	session.Text = ""
	session.SpeechText = ""
	session.Blocks = nil
	session.SkippedItems = nil
	session.Artifacts = nil
	session.Bookmarks = nil
	session.PlaybackProgress = nil
	session.Error = temporaryRecoveryMessage(TemporarySourceStateExpired)
	return session, nil
}

func (service *Service) loadTemporarySourceMetadata(id string) (TemporarySourceSession, error) {
	cleanID, err := temporarySourcePathID(id)
	if err != nil {
		return TemporarySourceSession{}, err
	}
	metadataBytes, err := os.ReadFile(filepath.Join(service.options.TemporarySourceDataDir, cleanID, temporarySourceMetadataFilename))
	if err != nil {
		if os.IsNotExist(err) {
			return TemporarySourceSession{}, ErrTemporarySourceNotFound
		}
		return TemporarySourceSession{}, err
	}
	var session TemporarySourceSession
	if err := json.Unmarshal(metadataBytes, &session); err != nil {
		return TemporarySourceSession{}, err
	}
	if strings.TrimSpace(session.ID) == "" {
		return TemporarySourceSession{}, ErrTemporarySourceNotFound
	}
	if _, err := temporarySourcePathID(session.ID); err != nil {
		return TemporarySourceSession{}, err
	}
	session.Scope = SourceArtifactScopeTemporary
	session.SourceOwner = SourceOwnerTemporary
	if session.TemporarySourceID == "" {
		session.TemporarySourceID = session.ID
	}
	return cloneTemporarySourceSession(session), nil
}

func temporarySourcePathID(id string) (string, error) {
	cleanID := strings.TrimSpace(id)
	if cleanID == "" || cleanID != safeDataPathID(cleanID) {
		return "", ErrTemporarySourceNotFound
	}
	return cleanID, nil
}

func (service *Service) loadTemporarySourceMetadataSessions() []TemporarySourceSession {
	baseDir := service.options.TemporarySourceDataDir
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return nil
	}
	sessions := make([]TemporarySourceSession, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		session, loadErr := service.loadTemporarySourceMetadata(entry.Name())
		if loadErr == nil {
			sessions = append(sessions, session)
		}
	}
	return sessions
}

func temporaryRecoveryMessage(status TemporarySourceLifecycleState) string {
	if status == TemporarySourceStateDiscarded {
		return "This temporary source was discarded and its artifacts were removed."
	}
	return "This temporary source expired. Generated files were removed, but enough metadata remains to explain what happened."
}

func firstActiveTemporaryStatus(status TemporarySourceLifecycleState) TemporarySourceLifecycleState {
	switch status {
	case TemporarySourceStateExpired, TemporarySourceStateDiscarded:
		return TemporarySourceStateReviewable
	default:
		return status
	}
}

func (service *Service) temporarySourceHasActiveJob(id string) bool {
	service.mu.RLock()
	defer service.mu.RUnlock()
	for _, job := range service.jobs {
		if job.TemporarySourceID == id && !jobStatusIsTerminal(job.Status) {
			return true
		}
	}
	return false
}

func (service *Service) removeTemporaryGeneratedAudio(session TemporarySourceSession) (int64, error) {
	cleanID, err := temporarySourcePathID(session.ID)
	if err != nil {
		return 0, err
	}
	var removed int64
	service.mu.Lock()
	for jobID, job := range service.jobs {
		if job.TemporarySourceID != session.ID {
			continue
		}
		if cancel := service.jobCancels[jobID]; cancel != nil && !jobStatusIsTerminal(job.Status) {
			cancel()
		}
		delete(service.jobs, jobID)
		delete(service.jobCancels, jobID)
	}
	service.mu.Unlock()
	for _, dir := range []string{
		filepath.Join(service.options.TemporaryAudioDir, cleanID),
		filepath.Join(service.options.TemporaryProgressDir, cleanID),
		filepath.Join(service.options.ProgressDataDir, safeDataPathID(progressTargetForTemporarySource(cleanID))),
		filepath.Join(service.options.PlaybackSessionDir, safeDataPathID(progressTargetForTemporarySource(cleanID))),
	} {
		removed += directorySize(dir)
		if err := os.RemoveAll(dir); err != nil {
			return removed, err
		}
	}
	return removed, nil
}

func (service *Service) temporarySourceStorageBytes(id string) temporaryStorageBytes {
	cleanID, err := temporarySourcePathID(id)
	if err != nil {
		return temporaryStorageBytes{}
	}
	sourceDir := filepath.Join(service.options.TemporarySourceDataDir, cleanID)
	artifactDir := filepath.Join(service.options.TemporaryArtifactDir, cleanID)
	audioDir := filepath.Join(service.options.TemporaryAudioDir, cleanID)
	progressDir := filepath.Join(service.options.TemporaryProgressDir, cleanID)
	progressTargetDir := filepath.Join(service.options.ProgressDataDir, safeDataPathID(progressTargetForTemporarySource(cleanID)))
	playbackDir := filepath.Join(service.options.PlaybackSessionDir, safeDataPathID(progressTargetForTemporarySource(cleanID)))
	bytes := temporaryStorageBytes{
		source:   directorySize(sourceDir),
		artifact: directorySize(artifactDir),
		audio:    directorySize(audioDir),
		progress: directorySize(progressDir) + directorySize(progressTargetDir) + directorySize(playbackDir),
	}
	bytes.total = bytes.source + bytes.artifact + bytes.audio + bytes.progress
	return bytes
}

func filterSourceArtifacts(artifacts []SourceArtifactRef, keep func(SourceArtifactRef) bool) []SourceArtifactRef {
	next := make([]SourceArtifactRef, 0, len(artifacts))
	for _, artifact := range artifacts {
		if keep(artifact) {
			next = append(next, artifact)
		}
	}
	return next
}

func (service *Service) PromoteTemporarySource(ctx context.Context, id string, request TemporarySourcePromotionRequest) (PreparedSource, error) {
	_ = ctx
	session, err := service.getTemporarySource(id, true)
	if err != nil {
		return PreparedSource{}, err
	}
	projectID := strings.TrimSpace(request.ProjectID)
	if projectID == "" && strings.TrimSpace(request.CreateProjectName) == "" {
		projectID = defaultProjectID
	}
	var project VoiceProject
	if name := strings.TrimSpace(request.CreateProjectName); name != "" {
		project, err = service.CreateProject(name)
	} else {
		project, err = service.GetProject(projectID)
	}
	if err != nil {
		session.PromotionStatus = TemporarySourcePromotionFailed
		session.Error = err.Error()
		_ = service.persistTemporarySource(session)
		service.mu.Lock()
		service.temporary[session.ID] = cloneTemporarySourceSession(session)
		service.mu.Unlock()
		return PreparedSource{}, err
	}
	now := time.Now().UTC()
	if requestHasTemporaryPromotionMetadata(request) {
		confirmed, confirmErr := service.ConfirmTemporarySourceReadiness(session.ID, SourceReadinessConfirmationRequest{
			Title:               request.Title,
			SourceType:          request.SourceType,
			Language:            request.Language,
			StructureChoice:     request.StructureChoice,
			StructureLabel:      request.StructureLabel,
			SpeechPolicyProfile: request.SpeechPolicyProfile,
			VoiceProfileID:      request.VoiceProfileID,
		})
		if confirmErr != nil {
			return PreparedSource{}, confirmErr
		}
		session = confirmed
	}
	source := preparedSourceFromTemporarySession(session)
	source.ID = newID()
	source.SourceOwner = SourceOwnerProject
	source.ProjectID = project.ID
	source.TemporarySourceID = ""
	source.SpeechPolicyProfile = project.SpeechPolicyProfile
	source.CreatedAt = now
	source.UpdatedAt = now
	source.Title = promotionTitle(source, request)
	if err := service.ensureTemporaryPromotionConflictFree(project.ID, source, request.ConflictResolution); err != nil {
		session.PromotionStatus = TemporarySourcePromotionFailed
		session.Error = err.Error()
		_ = service.persistTemporarySource(session)
		service.mu.Lock()
		service.temporary[session.ID] = cloneTemporarySourceSession(session)
		service.mu.Unlock()
		return PreparedSource{}, err
	}
	keep := normalizeTemporaryPromotionKeep(request)
	storageImpact, artifactWarnings := service.temporaryPromotionStorageImpact(session.ID, keep)
	if !keep.PolicySourcePin {
		source.SourceSpeechPolicyProfile = ""
	}
	if !keep.LexiconOverrides {
		source.SourceSpeechPolicyOverrides = policy.Overrides{}
	}
	source.Metadata = sanitizeTemporaryPromotionMetadata(source.Metadata, TemporarySourcePromotionManifest{
		TemporarySourceID: session.ID,
		ProjectID:         project.ID,
		SourceID:          source.ID,
		Title:             source.Title,
		SourceType:        firstNonEmpty(request.SourceType, temporaryPromotionMetadataString(session.Metadata, "sourceType")),
		Language:          firstNonEmpty(request.Language, temporaryPromotionMetadataString(session.Metadata, "language")),
		Scope:             strings.TrimSpace(request.Scope),
		Keep:              keep,
		StorageImpact:     storageImpact,
		Warnings:          artifactWarnings,
		CreatedAt:         now,
	})
	source = service.sanitizePreparedSourceWarnings(applySpeechPolicyToPreparedSourceWithEvaluator(
		source,
		speechPolicyEvaluatorForSource(project, source.SourceSpeechPolicyProfile, source.SourceSpeechPolicyOverrides, "", policy.Overrides{}),
		service.options.SourcePrepSentenceMaxRunes,
	))
	source = service.applySpeechRenderToPreparedSource(source, SpeechRenderOptions{ProjectID: project.ID})
	service.updatePreparedSource(source)
	if err := service.writePreparedSourceMetadata(source); err != nil {
		return PreparedSource{}, err
	}
	if err := service.writePreparedSourceContentIR(source); err != nil {
		return PreparedSource{}, err
	}
	if keep.GeneratedAudio {
		if _, err := service.promoteTemporarySourceJobArtifacts(session.ID, source, keep); err != nil {
			session.PromotionStatus = TemporarySourcePromotionFailed
			session.Error = err.Error()
			_ = service.persistTemporarySource(session)
			service.mu.Lock()
			service.temporary[session.ID] = cloneTemporarySourceSession(session)
			service.mu.Unlock()
			return PreparedSource{}, err
		}
	}
	session.Status = TemporarySourceStatePromoted
	session.PromotionStatus = TemporarySourcePromoted
	session.PromotedProjectID = source.ProjectID
	session.PromotedSourceID = source.ID
	session.UpdatedAt = time.Now().UTC()
	session.LastAccessedAt = session.UpdatedAt
	if err := service.persistTemporarySource(session); err != nil {
		return PreparedSource{}, err
	}
	service.mu.Lock()
	service.temporary[session.ID] = cloneTemporarySourceSession(session)
	service.mu.Unlock()
	return source, nil
}

func promotionTitle(source PreparedSource, request TemporarySourcePromotionRequest) string {
	title := strings.TrimSpace(request.Title)
	if title == "" {
		title = strings.TrimSpace(source.Title)
	}
	if title == "" {
		title = inferPreparedSourceTitle(source.Text, source.SourceName)
	}
	return title
}

func normalizeTemporaryPromotionKeep(request TemporarySourcePromotionRequest) TemporarySourcePromotionKeep {
	keep := request.Keep
	if request.ClientManifest != nil {
		keep = request.ClientManifest.Keep
	}
	if !keep.ExtractedSource && !keep.ReviewEdits && !keep.LexiconOverrides && !keep.PolicySourcePin &&
		!keep.GeneratedAudio && !keep.TimingMaps && !keep.Bookmarks && !keep.Progress && !keep.DiagnosticsReport {
		keep.ExtractedSource = true
		keep.ReviewEdits = true
	}
	if request.PreserveGeneratedArtifacts {
		keep.GeneratedAudio = true
		keep.TimingMaps = true
	}
	return keep
}

func sanitizeTemporaryPromotionMetadata(metadata map[string]any, manifest TemporarySourcePromotionManifest) map[string]any {
	next := cloneMetadataMap(metadata)
	if next == nil {
		next = map[string]any{}
	}
	for _, key := range []string{"localPath", "cachePath", "temporaryCachePath", "temporaryArtifactPath", "credentials", "credential", "token", "apiKey"} {
		delete(next, key)
	}
	next["promotion"] = manifest
	return next
}

func temporaryPromotionMetadataString(metadata map[string]any, key string) string {
	if metadata == nil {
		return ""
	}
	if value, ok := metadata[key].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func (service *Service) ensureTemporaryPromotionConflictFree(projectID string, source PreparedSource, resolution string) error {
	if strings.EqualFold(strings.TrimSpace(resolution), "keepBoth") {
		return nil
	}
	service.mu.RLock()
	defer service.mu.RUnlock()
	title := strings.EqualFold
	sourceTitle := strings.TrimSpace(source.Title)
	sourceURL := strings.TrimSpace(source.SourceURL)
	for _, existing := range service.sourcePreps {
		if existing.ProjectID != projectID {
			continue
		}
		if sourceTitle != "" && title(existing.Title, sourceTitle) {
			return fmt.Errorf("%w: title %q already exists", ErrTemporarySourceConflict, sourceTitle)
		}
		if sourceURL != "" && strings.EqualFold(strings.TrimSpace(existing.SourceURL), sourceURL) {
			return fmt.Errorf("%w: source URL already exists", ErrTemporarySourceConflict)
		}
	}
	return nil
}

func (service *Service) temporaryPromotionStorageImpact(temporarySourceID string, keep TemporarySourcePromotionKeep) (int64, []string) {
	if !keep.GeneratedAudio {
		return 0, nil
	}
	job, ok := service.latestPromotableTemporaryJob(temporarySourceID)
	if !ok {
		return 0, []string{"Generated audio was selected, but no complete or partial temporary audio is available."}
	}
	bytes := fileSize(job.AudioPath)
	warnings := make([]string, 0)
	if job.Status != JobStatusCompleted {
		warnings = append(warnings, "Generated audio is partial.")
	}
	return bytes, warnings
}

func requestHasTemporaryPromotionMetadata(request TemporarySourcePromotionRequest) bool {
	return strings.TrimSpace(request.Title) != "" ||
		strings.TrimSpace(request.SourceType) != "" ||
		strings.TrimSpace(request.Language) != "" ||
		strings.TrimSpace(request.StructureChoice) != "" ||
		strings.TrimSpace(request.StructureLabel) != "" ||
		strings.TrimSpace(request.SpeechPolicyProfile) != "" ||
		strings.TrimSpace(request.VoiceProfileID) != ""
}

func (service *Service) getTemporarySource(id string, touch bool) (TemporarySourceSession, error) {
	cleanID, err := temporarySourcePathID(id)
	if err != nil {
		return TemporarySourceSession{}, err
	}
	service.mu.RLock()
	session, ok := service.temporary[cleanID]
	service.mu.RUnlock()
	if !ok {
		recovered, loadErr := service.loadTemporarySourceMetadata(cleanID)
		if loadErr == nil && (recovered.Status == TemporarySourceStateExpired ||
			recovered.Status == TemporarySourceStateDiscarded ||
			(!recovered.ExpiresAt.IsZero() && !recovered.ExpiresAt.After(time.Now().UTC()))) {
			return TemporarySourceSession{}, ErrTemporarySourceExpired
		}
		return TemporarySourceSession{}, ErrTemporarySourceNotFound
	}
	session = cloneTemporarySourceSession(session)
	now := time.Now().UTC()
	if !session.ExpiresAt.IsZero() && !session.ExpiresAt.After(now) {
		return TemporarySourceSession{}, ErrTemporarySourceExpired
	}
	if touch {
		session.Scope = SourceArtifactScopeTemporary
		session.LastAccessedAt = now
		session.ExpiresAt = now.Add(service.options.TemporarySourceTTL)
		session.UpdatedAt = now
		_ = service.persistTemporarySource(session)
		service.mu.Lock()
		service.temporary[session.ID] = cloneTemporarySourceSession(session)
		service.mu.Unlock()
	}
	session.Scope = SourceArtifactScopeTemporary
	return session, nil
}

func (service *Service) persistTemporarySource(session TemporarySourceSession) error {
	cleanID, err := temporarySourcePathID(session.ID)
	if err != nil {
		return err
	}
	session.ID = cleanID
	session.TemporarySourceID = cleanID
	session.Scope = SourceArtifactScopeTemporary
	session.SourceOwner = SourceOwnerTemporary
	outputDir, err := filepath.Abs(filepath.Join(service.options.TemporarySourceDataDir, cleanID))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(outputDir, temporarySourceMetadataFilename), session); err != nil {
		return err
	}
	artifactDir, err := filepath.Abs(filepath.Join(service.options.TemporaryArtifactDir, cleanID))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(artifactDir, "source.txt"), []byte(session.Text), 0o644)
}

func (service *Service) reloadTemporarySources() {
	baseDir, err := filepath.Abs(service.options.TemporarySourceDataDir)
	if err != nil {
		return
	}
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}
	now := time.Now().UTC()
	sources := map[string]TemporarySourceSession{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), temporarySourceMetadataFilename))
		if readErr != nil {
			continue
		}
		var session TemporarySourceSession
		if err := json.Unmarshal(metadataBytes, &session); err != nil || strings.TrimSpace(session.ID) == "" {
			continue
		}
		if _, err := temporarySourcePathID(session.ID); err != nil {
			continue
		}
		session.Scope = SourceArtifactScopeTemporary
		session.SourceOwner = SourceOwnerTemporary
		if session.TemporarySourceID == "" {
			session.TemporarySourceID = session.ID
		}
		if !session.ExpiresAt.IsZero() && !session.ExpiresAt.After(now) {
			_, _ = service.removeTemporarySource(session, TemporarySourceStateExpired, false)
			continue
		}
		sources[session.ID] = cloneTemporarySourceSession(session)
	}
	service.mu.Lock()
	service.temporary = sources
	service.mu.Unlock()
}

func (service *Service) removeTemporarySource(session TemporarySourceSession, status TemporarySourceLifecycleState, removeMetadata bool) (int64, error) {
	cleanID, err := temporarySourcePathID(session.ID)
	if err != nil {
		return 0, err
	}
	session.ID = cleanID
	session.TemporarySourceID = cleanID
	session.Scope = SourceArtifactScopeTemporary
	session.SourceOwner = SourceOwnerTemporary
	bytesBefore := service.temporarySourceStorageBytes(cleanID).total
	service.mu.Lock()
	delete(service.temporary, cleanID)
	for jobID, job := range service.jobs {
		if job.TemporarySourceID == cleanID {
			delete(service.jobs, jobID)
			if cancel := service.jobCancels[jobID]; cancel != nil {
				cancel()
			}
			delete(service.jobCancels, jobID)
		}
	}
	service.mu.Unlock()

	session.Status = status
	session.UpdatedAt = time.Now().UTC()
	session.Error = temporaryRecoveryMessage(status)
	if !removeMetadata {
		session.Text = ""
		session.SpeechText = ""
		session.Blocks = nil
		session.SkippedItems = nil
		session.ReviewNotes = nil
		session.Artifacts = nil
		session.Bookmarks = nil
		session.PlaybackProgress = nil
		if err := os.MkdirAll(filepath.Join(service.options.TemporarySourceDataDir, cleanID), 0o755); err != nil {
			return 0, err
		}
		_ = writeJSON(filepath.Join(service.options.TemporarySourceDataDir, cleanID, temporarySourceMetadataFilename), session)
	}
	for _, dir := range []string{
		filepath.Join(service.options.TemporaryArtifactDir, cleanID),
		filepath.Join(service.options.TemporaryAudioDir, cleanID),
		filepath.Join(service.options.TemporaryProgressDir, cleanID),
		filepath.Join(service.options.ProgressDataDir, safeDataPathID(progressTargetForTemporarySource(cleanID))),
		filepath.Join(service.options.PlaybackSessionDir, safeDataPathID(progressTargetForTemporarySource(cleanID))),
	} {
		if err := os.RemoveAll(dir); err != nil {
			return 0, err
		}
	}
	if removeMetadata {
		if err := os.RemoveAll(filepath.Join(service.options.TemporarySourceDataDir, cleanID)); err != nil {
			return 0, err
		}
	}
	return bytesBefore, nil
}

func (service *Service) promoteTemporarySourceJobArtifacts(temporarySourceID string, source PreparedSource, keep TemporarySourcePromotionKeep) (VoiceJob, error) {
	sourceJob, ok := service.latestPromotableTemporaryJob(temporarySourceID)
	if !ok {
		return VoiceJob{}, nil
	}
	sourceDir, err := service.jobArtifactDirForJob(sourceJob.VoiceJob)
	if err != nil {
		return VoiceJob{}, err
	}
	if _, err := os.Stat(sourceDir); err != nil {
		return VoiceJob{}, err
	}
	promotedJob := sourceJob.VoiceJob
	promotedJob.ID = newID()
	promotedJob.ProjectID = source.ProjectID
	promotedJob.PreparedSourceID = source.ID
	promotedJob.BookSourceID = ""
	promotedJob.BookScope = nil
	promotedJob.TemporarySourceID = ""
	promotedJob.ProgressTargetID = ""
	promotedJob.RetryOfJobID = ""
	promotedJob.CreatedAt = time.Now().UTC()
	promotedJob.UpdatedAt = promotedJob.CreatedAt
	promotedJob.AudioURL = ""
	promotedJob.AudioPartialURL = ""
	if sourceJob.AudioURL != "" || sourceJob.AudioPath != "" {
		promotedJob.AudioURL = fmt.Sprintf("/api/voice-jobs/%s/audio", promotedJob.ID)
	}
	if sourceJob.AudioPartialURL != "" || sourceJob.AudioReadySegments > 0 {
		promotedJob.AudioPartialURL = fmt.Sprintf("/api/voice-jobs/%s/audio/partial", promotedJob.ID)
	}
	if keep.TimingMaps {
		promotedJob.Timing = rewriteTimingArtifactURLs(promotedJob.Timing, promotedJob.ID)
	} else {
		promotedJob.Timing = nil
	}

	targetDir, err := filepath.Abs(filepath.Join(service.options.JobDataDir, promotedJob.ID))
	if err != nil {
		return VoiceJob{}, err
	}
	if err := copyDirectory(sourceDir, targetDir); err != nil {
		return VoiceJob{}, err
	}
	if promotedJob.AudioPath != "" {
		promotedJob.AudioPath = filepath.Join(targetDir, filepath.Base(promotedJob.AudioPath))
	}
	stored := storedJob{VoiceJob: promotedJob}
	service.hydratePersistedSegmentAudio(&stored)
	service.save(stored)
	if err := service.writeJobMetadata(promotedJob); err != nil {
		return VoiceJob{}, err
	}
	return promotedJob, nil
}

func (service *Service) latestPromotableTemporaryJob(temporarySourceID string) (storedJob, bool) {
	service.mu.RLock()
	defer service.mu.RUnlock()
	var selected storedJob
	found := false
	for _, job := range service.jobs {
		if job.TemporarySourceID != temporarySourceID {
			continue
		}
		if job.Status != JobStatusCompleted && job.AudioReadySegments <= 0 {
			continue
		}
		if !found || job.UpdatedAt.After(selected.UpdatedAt) {
			selected = job
			found = true
		}
	}
	return selected, found
}

func rewriteTimingArtifactURLs(timing *TimingArtifacts, jobID string) *TimingArtifacts {
	if timing == nil {
		return nil
	}
	next := *timing
	next.HighlightMapURL = fmt.Sprintf("/api/voice-jobs/%s/highlight-map", jobID)
	next.HighlightMapV2URL = fmt.Sprintf("/api/voice-jobs/%s/highlight-map-v2", jobID)
	next.FragmentTimingURL = fmt.Sprintf("/api/voice-jobs/%s/timing/fragments", jobID)
	next.TokenTimingURL = fmt.Sprintf("/api/voice-jobs/%s/timing/tokens", jobID)
	next.AlignmentQualityURL = fmt.Sprintf("/api/voice-jobs/%s/timing/alignment", jobID)
	return &next
}

func copyDirectory(sourceDir string, targetDir string) error {
	if err := os.RemoveAll(targetDir); err != nil {
		return err
	}
	return filepath.WalkDir(sourceDir, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return err
		}
		targetPath := filepath.Join(targetDir, relative)
		if entry.IsDir() {
			return os.MkdirAll(targetPath, 0o755)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if err := copyFile(path, targetPath); err != nil {
			return err
		}
		return os.Chmod(targetPath, info.Mode())
	})
}

func temporarySessionFromPreparedSource(source PreparedSource, now time.Time, expiresAt time.Time) TemporarySourceSession {
	return TemporarySourceSession{
		ID:                          source.TemporarySourceID,
		TemporarySourceID:           source.TemporarySourceID,
		Scope:                       SourceArtifactScopeTemporary,
		SourceOwner:                 SourceOwnerTemporary,
		Status:                      TemporarySourceStateReviewable,
		PromotionStatus:             TemporarySourceNotPromoted,
		Kind:                        string(source.Kind),
		SourceReadiness:             source.SourceReadiness,
		SourceName:                  source.SourceName,
		SourceURL:                   source.SourceURL,
		SourceContentType:           source.SourceContentType,
		SourceBytes:                 source.SourceBytes,
		Title:                       source.Title,
		Text:                        source.Text,
		SpeechText:                  source.SpeechText,
		WordCount:                   source.WordCount,
		BlockCount:                  source.BlockCount,
		SegmentCount:                source.SegmentCount,
		Summary:                     &source.Summary,
		Blocks:                      source.Blocks,
		SkippedItems:                source.SkippedItems,
		SourceSpeechPolicyProfile:   source.SourceSpeechPolicyProfile,
		SourceSpeechPolicyOverrides: source.SourceSpeechPolicyOverrides,
		Warnings:                    source.Warnings,
		Metadata:                    cloneMetadataMap(source.Metadata),
		CreatedAt:                   now,
		LastAccessedAt:              now,
		ExpiresAt:                   expiresAt,
		UpdatedAt:                   now,
	}
}

func preparedSourceFromTemporarySession(session TemporarySourceSession) PreparedSource {
	summary := PreparedSourceSummary{}
	if session.Summary != nil {
		summary = *session.Summary
	}
	return PreparedSource{
		ID:                          session.ID,
		ProjectID:                   "",
		SourceOwner:                 SourceOwnerTemporary,
		TemporarySourceID:           session.ID,
		Status:                      PreparedSourceStatusReady,
		SourceReadiness:             session.SourceReadiness,
		Kind:                        PreparedSourceKind(session.Kind),
		SourceName:                  session.SourceName,
		SourceURL:                   session.SourceURL,
		SourceContentType:           session.SourceContentType,
		SourceBytes:                 session.SourceBytes,
		SpeechPolicyProfile:         string(policy.DefaultProfileName),
		SourceSpeechPolicyProfile:   session.SourceSpeechPolicyProfile,
		SourceSpeechPolicyOverrides: session.SourceSpeechPolicyOverrides,
		Title:                       session.Title,
		Text:                        session.Text,
		SpeechText:                  session.SpeechText,
		WordCount:                   session.WordCount,
		BlockCount:                  session.BlockCount,
		SegmentCount:                session.SegmentCount,
		Summary:                     summary,
		Blocks:                      session.Blocks,
		SkippedItems:                session.SkippedItems,
		Metadata:                    cloneMetadataMap(session.Metadata),
		Warnings:                    session.Warnings,
		CreatedAt:                   session.CreatedAt,
		UpdatedAt:                   session.UpdatedAt,
	}
}

func cloneTemporarySourceSession(session TemporarySourceSession) TemporarySourceSession {
	session.Blocks = cloneNarrationBlocks(session.Blocks)
	session.SkippedItems = append([]SkippedSourceItem(nil), session.SkippedItems...)
	session.ReviewNotes = append([]string(nil), session.ReviewNotes...)
	session.Artifacts = append([]SourceArtifactRef(nil), session.Artifacts...)
	session.Bookmarks = append([]ProgressBookmark(nil), session.Bookmarks...)
	if session.PlaybackProgress != nil {
		progress := clonePlaybackProgress(*session.PlaybackProgress)
		session.PlaybackProgress = &progress
	}
	session.SourceSpeechPolicyOverrides = policy.NormalizeOverrides(session.SourceSpeechPolicyOverrides)
	session.Warnings = append([]string(nil), session.Warnings...)
	session.Metadata = cloneMetadataMap(session.Metadata)
	return session
}

func cloneMetadataMap(metadata map[string]any) map[string]any {
	if metadata == nil {
		return nil
	}
	clone := make(map[string]any, len(metadata))
	for key, value := range metadata {
		clone[key] = value
	}
	return clone
}

func upsertSourceArtifact(artifacts []SourceArtifactRef, artifact SourceArtifactRef) []SourceArtifactRef {
	next := append([]SourceArtifactRef(nil), artifacts...)
	for index := range next {
		if next[index].ID == artifact.ID && next[index].Kind == artifact.Kind {
			next[index] = artifact
			return next
		}
	}
	return append(next, artifact)
}

func progressTargetForTemporarySource(id string) string {
	return "temporary-source:" + strings.TrimSpace(id)
}

func (service *Service) temporaryJobArtifactDir(job VoiceJob) (string, bool) {
	if strings.TrimSpace(job.TemporarySourceID) == "" {
		return "", false
	}
	return filepath.Join(service.options.TemporaryAudioDir, job.TemporarySourceID, job.ID), true
}

func (service *Service) jobArtifactDirForJob(job VoiceJob) (string, error) {
	if dir, ok := service.temporaryJobArtifactDir(job); ok {
		return filepath.Abs(dir)
	}
	return filepath.Abs(filepath.Join(service.options.JobDataDir, job.ID))
}

func (service *Service) jobArtifactDirByID(id string) (string, error) {
	service.mu.RLock()
	job, ok := service.jobs[strings.TrimSpace(id)]
	service.mu.RUnlock()
	if ok {
		return service.jobArtifactDirForJob(job.VoiceJob)
	}
	return filepath.Abs(filepath.Join(service.options.JobDataDir, id))
}

func (service *Service) temporarySourceIDs() []string {
	service.mu.RLock()
	defer service.mu.RUnlock()
	ids := make([]string, 0, len(service.temporary))
	for id := range service.temporary {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func (service *Service) markTemporarySourceJobCompleted(jobID string) {
	job, err := service.GetJob(jobID)
	if err != nil || strings.TrimSpace(job.TemporarySourceID) == "" {
		return
	}
	service.markTemporarySourceJobTerminal(job, TemporarySourceStateAudioReady)
}

func (service *Service) markTemporarySourceJobTerminal(job VoiceJob, status TemporarySourceLifecycleState) {
	if strings.TrimSpace(job.TemporarySourceID) == "" {
		return
	}
	service.mu.RLock()
	session, ok := service.temporary[job.TemporarySourceID]
	service.mu.RUnlock()
	if !ok {
		return
	}
	session = cloneTemporarySourceSession(session)
	now := time.Now().UTC()
	session.Status = status
	session.LastAccessedAt = now
	session.UpdatedAt = now
	audioURL := job.AudioURL
	if audioURL == "" {
		audioURL = job.AudioPartialURL
	}
	artifact := SourceArtifactRef{
		ID:        job.ID,
		Scope:     SourceArtifactScopeTemporary,
		Kind:      SourceArtifactKindGeneratedAudio,
		URL:       audioURL,
		Bytes:     fileSize(job.AudioPath),
		CreatedAt: now,
		ExpiresAt: &session.ExpiresAt,
	}
	session.Artifacts = upsertSourceArtifact(session.Artifacts, artifact)
	if job.Timing != nil {
		session.Artifacts = upsertSourceArtifact(session.Artifacts, SourceArtifactRef{
			ID:        job.ID + ":timing",
			Scope:     SourceArtifactScopeTemporary,
			Kind:      SourceArtifactKindTiming,
			URL:       job.Timing.HighlightMapURL,
			CreatedAt: now,
			ExpiresAt: &session.ExpiresAt,
		})
	}
	if job.QualityReport != nil || job.VoiceCheck.Transcript != "" {
		session.Artifacts = upsertSourceArtifact(session.Artifacts, SourceArtifactRef{
			ID:        job.ID + ":validation",
			Scope:     SourceArtifactScopeTemporary,
			Kind:      SourceArtifactKindValidation,
			CreatedAt: now,
			ExpiresAt: &session.ExpiresAt,
		})
	}
	if err := service.persistTemporarySource(session); err != nil {
		return
	}
	service.mu.Lock()
	service.temporary[session.ID] = cloneTemporarySourceSession(session)
	service.mu.Unlock()
}

func isTemporarySourceMissing(err error) bool {
	return errors.Is(err, ErrTemporarySourceNotFound) || errors.Is(err, ErrTemporarySourceExpired)
}
