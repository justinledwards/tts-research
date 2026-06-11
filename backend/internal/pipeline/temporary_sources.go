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
	ProjectID                  string `json:"projectId"`
	Title                      string `json:"title,omitempty"`
	SourceType                 string `json:"sourceType,omitempty"`
	Language                   string `json:"language,omitempty"`
	StructureChoice            string `json:"structureChoice,omitempty"`
	StructureLabel             string `json:"structureLabel,omitempty"`
	SpeechPolicyProfile        string `json:"speechPolicyProfile,omitempty"`
	VoiceProfileID             string `json:"voiceProfileId,omitempty"`
	PreserveGeneratedArtifacts bool   `json:"preserveGeneratedArtifacts,omitempty"`
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
	id := newID()
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
	return service.removeTemporarySource(session, TemporarySourceStateDiscarded)
}

func (service *Service) CleanupExpiredTemporarySources(now time.Time) ([]string, error) {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	service.mu.RLock()
	sources := make([]TemporarySourceSession, 0, len(service.temporary))
	for _, source := range service.temporary {
		if !source.ExpiresAt.After(now) {
			sources = append(sources, cloneTemporarySourceSession(source))
		}
	}
	service.mu.RUnlock()
	removed := make([]string, 0, len(sources))
	for _, source := range sources {
		if err := service.removeTemporarySource(source, TemporarySourceStateExpired); err != nil {
			return removed, err
		}
		removed = append(removed, source.ID)
	}
	return removed, nil
}

func (service *Service) PromoteTemporarySource(ctx context.Context, id string, request TemporarySourcePromotionRequest) (PreparedSource, error) {
	_ = ctx
	session, err := service.getTemporarySource(id, true)
	if err != nil {
		return PreparedSource{}, err
	}
	projectID := strings.TrimSpace(request.ProjectID)
	if projectID == "" {
		projectID = defaultProjectID
	}
	project, err := service.GetProject(projectID)
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
	source.TemporarySourceID = session.ID
	source.SpeechPolicyProfile = project.SpeechPolicyProfile
	source.CreatedAt = now
	source.UpdatedAt = now
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
	if request.PreserveGeneratedArtifacts {
		if _, err := service.promoteTemporarySourceJobArtifacts(session.ID, source); err != nil {
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
	cleanID := strings.TrimSpace(id)
	if cleanID == "" {
		return TemporarySourceSession{}, ErrTemporarySourceNotFound
	}
	service.mu.RLock()
	session, ok := service.temporary[cleanID]
	service.mu.RUnlock()
	if !ok {
		return TemporarySourceSession{}, ErrTemporarySourceNotFound
	}
	session = cloneTemporarySourceSession(session)
	now := time.Now().UTC()
	if !session.ExpiresAt.IsZero() && !session.ExpiresAt.After(now) {
		return TemporarySourceSession{}, ErrTemporarySourceExpired
	}
	if touch {
		session.LastAccessedAt = now
		session.ExpiresAt = now.Add(service.options.TemporarySourceTTL)
		session.UpdatedAt = now
		_ = service.persistTemporarySource(session)
		service.mu.Lock()
		service.temporary[session.ID] = cloneTemporarySourceSession(session)
		service.mu.Unlock()
	}
	return session, nil
}

func (service *Service) persistTemporarySource(session TemporarySourceSession) error {
	outputDir, err := filepath.Abs(filepath.Join(service.options.TemporarySourceDataDir, session.ID))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	if err := writeJSON(filepath.Join(outputDir, temporarySourceMetadataFilename), session); err != nil {
		return err
	}
	artifactDir, err := filepath.Abs(filepath.Join(service.options.TemporaryArtifactDir, session.ID))
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
		if !session.ExpiresAt.IsZero() && !session.ExpiresAt.After(now) {
			_ = service.removeTemporarySource(session, TemporarySourceStateExpired)
			continue
		}
		sources[session.ID] = cloneTemporarySourceSession(session)
	}
	service.mu.Lock()
	service.temporary = sources
	service.mu.Unlock()
}

func (service *Service) removeTemporarySource(session TemporarySourceSession, status TemporarySourceLifecycleState) error {
	service.mu.Lock()
	delete(service.temporary, session.ID)
	for jobID, job := range service.jobs {
		if job.TemporarySourceID == session.ID {
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
	_ = writeJSON(filepath.Join(service.options.TemporarySourceDataDir, session.ID, temporarySourceMetadataFilename), session)
	for _, dir := range []string{
		filepath.Join(service.options.TemporarySourceDataDir, session.ID),
		filepath.Join(service.options.TemporaryArtifactDir, session.ID),
		filepath.Join(service.options.TemporaryAudioDir, session.ID),
		filepath.Join(service.options.TemporaryProgressDir, session.ID),
		filepath.Join(service.options.ProgressDataDir, safeDataPathID(progressTargetForTemporarySource(session.ID))),
		filepath.Join(service.options.PlaybackSessionDir, safeDataPathID(progressTargetForTemporarySource(session.ID))),
	} {
		if err := os.RemoveAll(dir); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) promoteTemporarySourceJobArtifacts(temporarySourceID string, source PreparedSource) (VoiceJob, error) {
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
	promotedJob.Timing = rewriteTimingArtifactURLs(promotedJob.Timing, promotedJob.ID)

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
