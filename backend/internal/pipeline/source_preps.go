package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"

	"github.com/justinedwards/tts-research/backend/internal/policy"
)

const (
	preparedSourceMetadataFilename = "source-prep.json"
	playbackProgressFilename       = "progress.json"
	playbackSessionFilename        = "session.json"
	maxReadableURLBytes            = 20 << 20
	readableURLTimeout             = 20 * time.Second
	readableURLUserAgent           = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 VoiceStudio/1.0"
	maxHackerNewsComments          = 120
	warningSentenceTooLong         = "sentence_too_long"
)

type fetchedReadableSource struct {
	URL         string
	Filename    string
	ContentType string
	Bytes       []byte
}

type hackerNewsAlgoliaItem struct {
	ID       int                     `json:"id"`
	Author   string                  `json:"author"`
	Children []hackerNewsAlgoliaItem `json:"children"`
	Points   int                     `json:"points"`
	Text     string                  `json:"text"`
	Title    string                  `json:"title"`
	Type     string                  `json:"type"`
	URL      string                  `json:"url"`
}

type sourcePreprocessResult struct {
	Blocks              []NarrationBlock
	SkippedItems        []SkippedSourceItem
	Warnings            []string
	PreprocessorID      string
	PreprocessorVersion string
	SourceFormat        string
	RenderMode          string
	Title               string
	MarkdownParseMode   string
	Metadata            map[string]any
}

var (
	citationGlyphPattern      = regexp.MustCompile(`cite[^]*`)
	turnCitationPattern       = regexp.MustCompile(`\bturn\d+(?:search|view|news|fetch)\d+\b`)
	markdownLinkPattern       = regexp.MustCompile(`\[([^\]]+)\]\([^)]+\)`)
	markdownImagePattern      = regexp.MustCompile(`!\[([^\]]*)\]\([^)]+\)`)
	markdownImageOnlyLine     = regexp.MustCompile(`^!\[[^\]]*\]\([^)]+\)\s*$`)
	inlineCodeSpeechPattern   = regexp.MustCompile("`([^`]+)`")
	htmlScriptStylePattern    = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<noscript[^>]*>.*?</noscript>`)
	htmlBlockBreakPattern     = regexp.MustCompile(`(?i)</(p|div|section|article|br|h[1-6]|li|tr)>`)
	htmlTagSpeechPattern      = regexp.MustCompile(`(?s)<[^>]+>`)
	markdownHeadingLine       = regexp.MustCompile(`^(#{1,6})\s+(.+)$`)
	markdownFenceLine         = regexp.MustCompile("^```\\s*([A-Za-z0-9_-]+)?")
	markdownTableDividerLine  = regexp.MustCompile(`^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$`)
	markdownFootnoteLine      = regexp.MustCompile(`^\[\^[^\]]+\]:`)
	markdownCaptionLine       = regexp.MustCompile(`(?i)^(figure|fig\.|caption):\s+`)
	markdownInlineMathPattern = regexp.MustCompile(`\$(?:[^$\n]+)\$`)
	markdownRawURLLine        = regexp.MustCompile(`^https?://\S+$`)
	markdownListPrefixPattern = regexp.MustCompile(`^(\s*)([-*+]|\d+[.)])\s+`)
)

func (service *Service) CreatePreparedSource(
	ctx context.Context,
	projectID string,
	request CreatePreparedSourceRequest,
) (PreparedSource, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return PreparedSource{}, err
	}
	kind := request.Kind
	if kind == "" {
		kind = PreparedSourceKindText
	}

	sourceText := strings.TrimSpace(request.Text)
	sourceName := strings.TrimSpace(request.SourceName)
	sourceURL := strings.TrimSpace(request.URL)
	contentType := strings.TrimSpace(request.SourceContentType)
	sourceBytes := request.SourceBytes

	if kind == PreparedSourceKindURL {
		fetched, err := service.fetchReadableSourceURL(ctx, sourceURL)
		if err != nil {
			return PreparedSource{}, err
		}
		sourceText = string(fetched.Bytes)
		sourceName = fetched.Filename
		sourceURL = fetched.URL
		contentType = fetched.ContentType
		sourceBytes = int64(len(fetched.Bytes))
	}
	if sourceName == "" {
		sourceName = "Untitled source"
	}
	if strings.TrimSpace(sourceText) == "" {
		return PreparedSource{}, ErrEmptyText
	}
	markdownParseMode := normalizeMarkdownParseMode(request.MarkdownParseMode)

	now := time.Now().UTC()
	prepared := PreparedSource{
		ID:                newID(),
		ProjectID:         project.ID,
		Status:            PreparedSourceStatusReady,
		Kind:              kind,
		SourceName:        sourceName,
		SourceURL:         sourceURL,
		SourceContentType: contentType,
		SourceBytes:       sourceBytes,
		Text:              sourceText,
		MarkdownParseMode: markdownParseMode,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	preprocessed := preprocessReadableSource(
		sourceText,
		sourceName,
		contentType,
		service.options.SourcePrepSentenceMaxRunes,
		markdownParseMode,
	)
	prepared.PreprocessorID = preprocessed.PreprocessorID
	prepared.PreprocessorVersion = preprocessed.PreprocessorVersion
	prepared.SourceFormat = preprocessed.SourceFormat
	prepared.RenderMode = preprocessed.RenderMode
	prepared.MarkdownParseMode = preprocessed.MarkdownParseMode
	prepared.Title = firstNonEmpty(preprocessed.Title, inferPreparedSourceTitle(sourceText, sourceName))
	prepared.Blocks = preprocessed.Blocks
	prepared.Warnings = preprocessed.Warnings
	prepared.Metadata = preprocessed.Metadata
	prepared.SpeechPolicyProfile = project.SpeechPolicyProfile
	prepared = applySpeechPolicyToPreparedSourceWithEvaluator(
		prepared,
		speechPolicyEvaluatorForSource(project, prepared.SourceSpeechPolicyProfile, prepared.SourceSpeechPolicyOverrides, "", policy.Overrides{}),
		service.options.SourcePrepSentenceMaxRunes,
	)
	prepared = service.applySpeechRenderToPreparedSource(prepared, SpeechRenderOptions{
		ProjectID: project.ID,
	})

	service.updatePreparedSource(prepared)
	if err := service.writePreparedSourceMetadata(prepared); err != nil {
		return PreparedSource{}, err
	}
	if err := service.writePreparedSourceContentIR(prepared); err != nil {
		return PreparedSource{}, err
	}
	return prepared, nil
}

func (service *Service) CreateBookSourceFromURL(ctx context.Context, projectID string, rawURL string) (BookSource, error) {
	return service.CreateBookSourceFromURLWithOptions(ctx, projectID, rawURL, BookSourceImportOptions{})
}

func (service *Service) CreateBookSourceFromURLWithOptions(
	ctx context.Context,
	projectID string,
	rawURL string,
	options BookSourceImportOptions,
) (BookSource, error) {
	fetched, err := service.fetchReadableSourceURL(ctx, rawURL)
	if err != nil {
		return BookSource{}, err
	}
	kind, err := detectBookSourceKind(fetched.Filename)
	if err != nil {
		if strings.Contains(fetched.ContentType, "pdf") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, ".pdf")
		} else if strings.Contains(fetched.ContentType, "epub") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, ".epub")
		} else if strings.Contains(fetched.ContentType, "wordprocessingml") || strings.Contains(fetched.ContentType, "officedocument") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, ".docx")
		} else if strings.Contains(fetched.ContentType, "markdown") || strings.Contains(fetched.ContentType, "x-markdown") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, ".md")
		} else if strings.Contains(fetched.ContentType, "html") || strings.Contains(fetched.ContentType, "xhtml") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, ".html")
		} else if strings.Contains(fetched.ContentType, "zip") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, ".zip")
		} else if strings.HasPrefix(fetched.ContentType, "image/") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, imageExtensionForContentType(fetched.ContentType))
		}
		kind, err = detectBookSourceKind(fetched.Filename)
		if err != nil {
			return BookSource{}, fmt.Errorf("URL does not point to a PDF, EPUB, DOCX, Markdown, HTML, or image book source")
		}
	}

	tempInput, err := os.CreateTemp("", "voice-studio-book-url-*"+strings.ToLower(filepath.Ext(fetched.Filename)))
	if err != nil {
		return BookSource{}, err
	}
	tempPath := tempInput.Name()
	defer func() {
		_ = os.Remove(tempPath)
	}()
	if _, err := tempInput.Write(fetched.Bytes); err != nil {
		_ = tempInput.Close()
		return BookSource{}, err
	}
	if err := tempInput.Close(); err != nil {
		return BookSource{}, err
	}
	_ = kind
	return service.CreateBookSourceWithOptions(ctx, projectID, []BookSourceUpload{{
		Path:     tempPath,
		Filename: fetched.Filename,
		Bytes:    int64(len(fetched.Bytes)),
	}}, options)
}

func (service *Service) ListProjectPreparedSources(projectID string) ([]PreparedSource, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return nil, err
	}
	service.mu.RLock()
	sources := make([]PreparedSource, 0)
	for _, source := range service.sourcePreps {
		if source.ProjectID == project.ID {
			sources = append(sources, clonePreparedSource(source))
		}
	}
	service.mu.RUnlock()
	for index, source := range sources {
		source = service.applyCurrentSpeechPolicy(source, policy.Overrides{})
		sources[index] = summarizePreparedSourcePayload(service.sanitizePreparedSourceWarnings(source))
	}
	sort.SliceStable(sources, func(left int, right int) bool {
		return sources[left].UpdatedAt.After(sources[right].UpdatedAt)
	})
	return sources, nil
}

func (service *Service) GetPreparedSource(id string) (PreparedSource, error) {
	service.mu.RLock()
	source, ok := service.sourcePreps[strings.TrimSpace(id)]
	service.mu.RUnlock()
	if !ok {
		return PreparedSource{}, ErrPreparedSourceNotFound
	}
	source = clonePreparedSource(source)
	return service.sanitizePreparedSourceWarnings(service.applyCurrentSpeechPolicy(source, policy.Overrides{})), nil
}

func (service *Service) PreviewPreparedSourceSpeechPolicy(sourceID string, request SpeechPolicyPreviewRequest) (PreparedSource, error) {
	service.mu.RLock()
	source, ok := service.sourcePreps[strings.TrimSpace(sourceID)]
	service.mu.RUnlock()
	if !ok {
		return PreparedSource{}, ErrPreparedSourceNotFound
	}
	source = clonePreparedSource(source)
	project, err := service.GetProject(source.ProjectID)
	if err != nil {
		return PreparedSource{}, err
	}
	profileName := strings.TrimSpace(request.Profile)
	if profileName != "" {
		if _, err := resolveProjectSpeechPolicyProfile(project, profileName); err != nil {
			return PreparedSource{}, err
		}
	}
	source = applySpeechPolicyToPreparedSourceWithEvaluator(source, speechPolicyEvaluatorForSource(
		project,
		source.SourceSpeechPolicyProfile,
		source.SourceSpeechPolicyOverrides,
		profileName,
		request.Overrides,
	), service.options.SourcePrepSentenceMaxRunes)
	source = service.applySpeechRenderToPreparedSource(source, SpeechRenderOptions{
		ProjectID:      source.ProjectID,
		VoiceProfileID: request.VoiceProfileID,
		Locale:         request.Locale,
		TTSEngine:      request.TTSEngine,
	})
	return service.sanitizePreparedSourceWarnings(source), nil
}

func (service *Service) UpdatePreparedSourceSpeechPolicy(sourceID string, request SourceSpeechPolicyUpdateRequest) (PreparedSource, error) {
	service.mu.RLock()
	source, ok := service.sourcePreps[strings.TrimSpace(sourceID)]
	service.mu.RUnlock()
	if !ok {
		return PreparedSource{}, ErrPreparedSourceNotFound
	}
	source = clonePreparedSource(source)
	project, err := service.GetProject(source.ProjectID)
	if err != nil {
		return PreparedSource{}, err
	}
	if request.Clear {
		source.SourceSpeechPolicyProfile = ""
		source.SourceSpeechPolicyOverrides = policy.Overrides{}
	} else {
		profileName := strings.TrimSpace(request.Profile)
		if profileName != "" {
			resolved, err := resolveProjectSpeechPolicyProfile(project, profileName)
			if err != nil {
				return PreparedSource{}, err
			}
			source.SourceSpeechPolicyProfile = resolved
		}
		source.SourceSpeechPolicyOverrides = policy.NormalizeOverrides(request.Overrides)
	}
	source = service.sanitizePreparedSourceWarnings(applySpeechPolicyToPreparedSourceWithEvaluator(source, speechPolicyEvaluatorForSource(
		project,
		source.SourceSpeechPolicyProfile,
		source.SourceSpeechPolicyOverrides,
		"",
		policy.Overrides{},
	), service.options.SourcePrepSentenceMaxRunes))
	source = service.applySpeechRenderToPreparedSource(source, SpeechRenderOptions{
		ProjectID: source.ProjectID,
	})
	service.updatePreparedSource(source)
	if err := service.writePreparedSourceMetadata(source); err != nil {
		return PreparedSource{}, err
	}
	return source, nil
}

func (service *Service) applyCurrentSpeechPolicy(source PreparedSource, overrides policy.Overrides) PreparedSource {
	project, err := service.GetProject(source.ProjectID)
	if err != nil {
		source = applySpeechPolicyToPreparedSource(source, source.SpeechPolicyProfile, overrides, service.options.SourcePrepSentenceMaxRunes)
		return service.applySpeechRenderToPreparedSource(source, SpeechRenderOptions{ProjectID: source.ProjectID})
	}
	source = applySpeechPolicyToPreparedSourceWithEvaluator(
		source,
		speechPolicyEvaluatorForSource(project, source.SourceSpeechPolicyProfile, source.SourceSpeechPolicyOverrides, "", overrides),
		service.options.SourcePrepSentenceMaxRunes,
	)
	return service.applySpeechRenderToPreparedSource(source, SpeechRenderOptions{ProjectID: source.ProjectID})
}

func (service *Service) GetPreparedSourceBlock(sourceID string, blockID string) (NarrationBlock, error) {
	source, err := service.GetPreparedSource(sourceID)
	if err != nil {
		return NarrationBlock{}, err
	}
	for _, block := range source.Blocks {
		if block.ID == blockID {
			return block, nil
		}
	}
	return NarrationBlock{}, fmt.Errorf("prepared source block not found")
}

func (service *Service) CreatePreparedSourceJob(
	ctx context.Context,
	sourceID string,
	request CreateJobRequest,
) (VoiceJob, error) {
	service.mu.RLock()
	source, ok := service.sourcePreps[strings.TrimSpace(sourceID)]
	service.mu.RUnlock()
	if !ok {
		return VoiceJob{}, ErrPreparedSourceNotFound
	}
	source = clonePreparedSource(source)
	if source.Status != PreparedSourceStatusReady {
		return VoiceJob{}, fmt.Errorf("prepared source is not ready")
	}
	profileName := strings.TrimSpace(request.SpeechPolicyProfile)
	project, err := service.GetProject(source.ProjectID)
	if err != nil {
		return VoiceJob{}, err
	}
	if profileName != "" {
		if _, err := resolveProjectSpeechPolicyProfile(project, profileName); err != nil {
			return VoiceJob{}, err
		}
	}
	source = service.sanitizePreparedSourceWarnings(applySpeechPolicyToPreparedSourceWithEvaluator(source, speechPolicyEvaluatorForSource(
		project,
		source.SourceSpeechPolicyProfile,
		source.SourceSpeechPolicyOverrides,
		profileName,
		request.SpeechPolicyOverrides,
	), service.options.SourcePrepSentenceMaxRunes))
	source = service.applySpeechRenderToPreparedSource(source, SpeechRenderOptions{
		ProjectID:      source.ProjectID,
		VoiceProfileID: request.VoiceProfileID,
		Locale:         request.Locale,
		TTSEngine:      request.TTSEngine,
	})
	selected := map[string]struct{}{}
	for _, id := range request.SelectedBlockIDs {
		selected[strings.TrimSpace(id)] = struct{}{}
	}
	parts := make([]string, 0, len(source.Blocks))
	warnings := make([]string, 0)
	selectedIDs := make([]string, 0)
	for _, block := range source.Blocks {
		if len(selected) > 0 {
			if _, ok := selected[block.ID]; !ok {
				continue
			}
		}
		if block.SpeakMode == NarrationSpeakModeSkip {
			continue
		}
		text := strings.TrimSpace(block.SpokenText)
		if text == "" {
			text = strings.TrimSpace(block.Text)
		}
		if text == "" {
			continue
		}
		parts = append(parts, text)
		warnings = append(warnings, block.Warnings...)
		selectedIDs = append(selectedIDs, block.ID)
	}
	if len(parts) == 0 {
		return VoiceJob{}, ErrEmptyText
	}
	request.ProjectID = source.ProjectID
	request.PreparedSourceID = source.ID
	request.SelectedBlockIDs = selectedIDs
	request.SourceKind = string(source.Kind)
	request.ProgressTargetID = progressTargetForPreparedSource(source.ID)
	request.Text = strings.Join(parts, "\n\n")
	request.SpeechPolicyProfile = source.SpeechPolicyProfile
	request.SpeechPolicyOverrides = policy.NormalizeOverrides(request.SpeechPolicyOverrides)
	request.SpeechRenderApplied = true
	job, err := service.CreateJob(ctx, request)
	if err != nil {
		return VoiceJob{}, err
	}
	if len(warnings) > 0 {
		service.updateJob(job.ID, func(stored *storedJob) {
			stored.SegmentationWarnings = uniqueStrings(warnings)
		})
		updated, getErr := service.GetJob(job.ID)
		if getErr == nil {
			job = updated
		}
	}
	return job, nil
}

func (service *Service) updatePreparedSource(source PreparedSource) {
	service.mu.Lock()
	source.UpdatedAt = time.Now().UTC()
	service.sourcePreps[source.ID] = clonePreparedSource(source)
	service.mu.Unlock()
}

func clonePreparedSource(source PreparedSource) PreparedSource {
	source = normalizePreparedSourceTranscriptFields(source)
	source.Blocks = cloneNarrationBlocks(source.Blocks)
	source.SkippedItems = append([]SkippedSourceItem(nil), source.SkippedItems...)
	source.Warnings = cloneStringSlice(source.Warnings)
	source.Metadata = cloneAnyMap(source.Metadata)
	source.TranscriptMetadata = cloneTranscriptMetadata(source.TranscriptMetadata)
	source.TranscriptGeneratedAt = cloneTimePtr(source.TranscriptGeneratedAt)
	return source
}

func cloneNarrationBlocks(blocks []NarrationBlock) []NarrationBlock {
	if len(blocks) == 0 {
		return nil
	}
	cloned := make([]NarrationBlock, len(blocks))
	for index, block := range blocks {
		block.Segments = cloneNarrationSegments(block.Segments)
		block.Warnings = cloneStringSlice(block.Warnings)
		block.Metadata = cloneAnyMap(block.Metadata)
		if len(block.LanguageSpans) > 0 {
			block.LanguageSpans = append(block.LanguageSpans[:0:0], block.LanguageSpans...)
		}
		if len(block.Pronunciations) > 0 {
			block.Pronunciations = append(block.Pronunciations[:0:0], block.Pronunciations...)
		}
		if len(block.Normalisations) > 0 {
			block.Normalisations = append(block.Normalisations[:0:0], block.Normalisations...)
		}
		cloned[index] = block
	}
	return cloned
}

func cloneNarrationSegments(segments []NarrationSegment) []NarrationSegment {
	if len(segments) == 0 {
		return nil
	}
	cloned := make([]NarrationSegment, len(segments))
	for index, segment := range segments {
		segment.Warnings = cloneStringSlice(segment.Warnings)
		cloned[index] = segment
	}
	return cloned
}

func cloneStringSlice(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	return append([]string(nil), values...)
}

func cloneAnyMap(values map[string]any) map[string]any {
	if len(values) == 0 {
		return nil
	}
	cloned := make(map[string]any, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func (service *Service) sanitizePreparedSourceWarnings(source PreparedSource) PreparedSource {
	maxSentenceRunes := service.options.SourcePrepSentenceMaxRunes
	if maxSentenceRunes <= 0 {
		maxSentenceRunes = defaultSourcePrepSentenceMaxRunes
	}
	blocks := make([]NarrationBlock, 0, len(source.Blocks))
	for _, block := range source.Blocks {
		blocks = append(blocks, sanitizeNarrationBlockWarnings(block, maxSentenceRunes))
	}
	source.Blocks = blocks
	warnings := make([]string, 0)
	for _, block := range source.Blocks {
		warnings = append(warnings, block.Warnings...)
	}
	source.Warnings = uniqueStrings(warnings)
	source.Summary = summarizePreparedSource(source.Blocks)
	return source
}

func sanitizeNarrationBlockWarnings(block NarrationBlock, maxSentenceRunes int) NarrationBlock {
	if !hasWarning(block.Warnings, warningSentenceTooLong) {
		return block
	}
	if narrationBlockHasUnsafeSentence(block, maxSentenceRunes) {
		return block
	}
	block.Warnings = removeWarning(block.Warnings, warningSentenceTooLong)
	for index, segment := range block.Segments {
		segment.Warnings = removeWarning(segment.Warnings, warningSentenceTooLong)
		block.Segments[index] = segment
	}
	return block
}

func narrationBlockHasUnsafeSentence(block NarrationBlock, maxSentenceRunes int) bool {
	if maxSentenceRunes <= 0 {
		maxSentenceRunes = defaultSourcePrepSentenceMaxRunes
	}
	if len(block.Segments) > 0 {
		for _, segment := range block.Segments {
			if utf8.RuneCountInString(segment.Text) > maxSentenceRunes {
				return true
			}
		}
		return false
	}
	text := firstNonEmpty(block.SpokenText, block.Text)
	for _, sentence := range splitSentencePieces(text) {
		if utf8.RuneCountInString(strings.TrimSpace(sentence)) > maxSentenceRunes {
			return true
		}
	}
	return false
}

func (service *Service) writePreparedSourceMetadata(source PreparedSource) error {
	source = normalizePreparedSourceTranscriptFields(source)
	outputDir, err := filepath.Abs(filepath.Join(service.options.SourcePrepDir, source.ID))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, preparedSourceMetadataFilename), source)
}

func (service *Service) reloadSourcePreps() {
	baseDir, err := filepath.Abs(service.options.SourcePrepDir)
	if err != nil {
		return
	}
	sources := make(map[string]PreparedSource)
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), preparedSourceMetadataFilename))
		if readErr != nil {
			continue
		}
		var source PreparedSource
		if err := jsonUnmarshal(metadataBytes, &source); err != nil || source.ID == "" {
			continue
		}
		source = normalizePreparedSourceTranscriptFields(source)
		sources[source.ID] = source
	}
	service.mu.Lock()
	service.sourcePreps = sources
	service.mu.Unlock()
}

func (service *Service) fetchReadableSourceURL(ctx context.Context, rawURL string) (fetchedReadableSource, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fetchedReadableSource{}, fmt.Errorf("enter a valid http or https URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fetchedReadableSource{}, fmt.Errorf("only http and https URLs are supported")
	}

	client := &http.Client{
		Timeout: readableURLTimeout,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			DialContext: func(ctx context.Context, network string, address string) (net.Conn, error) {
				host, port, err := net.SplitHostPort(address)
				if err != nil {
					return nil, err
				}
				ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
				if err != nil {
					return nil, err
				}
				for _, ip := range ips {
					if !service.options.SourceURLAllowPrivate && isPrivateOrLocalIP(ip) {
						return nil, fmt.Errorf("URL resolves to a private or local address")
					}
				}
				return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, net.JoinHostPort(host, port))
			},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("URL redirected too many times")
			}
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return fmt.Errorf("URL redirected to an unsupported scheme")
			}
			return nil
		},
	}
	if fallback, ok, fallbackErr := service.fetchHackerNewsItemFallback(ctx, client, parsed); ok && fallbackErr == nil {
		return fallback, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return fetchedReadableSource{}, err
	}
	setReadableURLRequestHeaders(req)
	resp, err := client.Do(req)
	if err != nil {
		return fetchedReadableSource{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		statusCode := resp.StatusCode
		_ = resp.Body.Close()
		if statusCode == http.StatusTooManyRequests {
			fallback, ok, fallbackErr := service.fetchHackerNewsItemFallback(ctx, client, parsed)
			if ok && fallbackErr == nil {
				return fallback, nil
			}
			if ok && fallbackErr != nil {
				return fetchedReadableSource{}, fmt.Errorf("URL returned HTTP %d and Hacker News fallback failed: %w", statusCode, fallbackErr)
			}
		}
		return fetchedReadableSource{}, fmt.Errorf("URL returned HTTP %d", statusCode)
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	contentType := strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0])
	limited := io.LimitReader(resp.Body, maxReadableURLBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return fetchedReadableSource{}, err
	}
	if len(body) > maxReadableURLBytes {
		return fetchedReadableSource{}, fmt.Errorf("URL content is too large")
	}
	filename := filenameFromURL(resp.Request.URL, contentType)
	return fetchedReadableSource{
		URL:         resp.Request.URL.String(),
		Filename:    filename,
		ContentType: contentType,
		Bytes:       body,
	}, nil
}

func setReadableURLRequestHeaders(req *http.Request) {
	req.Header.Set("User-Agent", readableURLUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.7,*/*;q=0.5")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Cache-Control", "no-cache")
}

func (service *Service) fetchHackerNewsItemFallback(
	ctx context.Context,
	client *http.Client,
	parsed *url.URL,
) (fetchedReadableSource, bool, error) {
	itemID, ok := hackerNewsItemID(parsed)
	if !ok {
		return fetchedReadableSource{}, false, nil
	}
	apiURL := "https://hn.algolia.com/api/v1/items/" + itemID
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return fetchedReadableSource{}, true, err
	}
	setReadableURLRequestHeaders(req)
	resp, err := client.Do(req)
	if err != nil {
		return fetchedReadableSource{}, true, err
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fetchedReadableSource{}, true, fmt.Errorf("HN API returned HTTP %d", resp.StatusCode)
	}
	limited := io.LimitReader(resp.Body, maxReadableURLBytes+1)
	body, err := io.ReadAll(limited)
	if err != nil {
		return fetchedReadableSource{}, true, err
	}
	if len(body) > maxReadableURLBytes {
		return fetchedReadableSource{}, true, fmt.Errorf("HN API content is too large")
	}
	var item hackerNewsAlgoliaItem
	if err := json.Unmarshal(body, &item); err != nil {
		return fetchedReadableSource{}, true, err
	}
	markdown := hackerNewsItemMarkdown(item, parsed.String())
	if strings.TrimSpace(markdown) == "" {
		return fetchedReadableSource{}, true, fmt.Errorf("HN API returned no readable text")
	}
	return fetchedReadableSource{
		URL:         parsed.String(),
		Filename:    "hacker-news-" + itemID + ".md",
		ContentType: "text/markdown",
		Bytes:       []byte(markdown),
	}, true, nil
}

func hackerNewsItemID(parsed *url.URL) (string, bool) {
	host := strings.ToLower(strings.TrimPrefix(parsed.Hostname(), "www."))
	if host != "news.ycombinator.com" || strings.Trim(parsed.Path, "/") != "item" {
		return "", false
	}
	id := strings.TrimSpace(parsed.Query().Get("id"))
	if id == "" {
		return "", false
	}
	for _, value := range id {
		if value < '0' || value > '9' {
			return "", false
		}
	}
	return id, true
}

func hackerNewsItemMarkdown(item hackerNewsAlgoliaItem, sourceURL string) string {
	var builder strings.Builder
	title := firstNonEmpty(item.Title, "Hacker News item")
	builder.WriteString("# ")
	builder.WriteString(title)
	builder.WriteString("\n\n")
	if strings.TrimSpace(item.URL) != "" {
		builder.WriteString("Story URL: ")
		builder.WriteString(strings.TrimSpace(item.URL))
		builder.WriteString("\n\n")
	}
	builder.WriteString("Hacker News URL: ")
	builder.WriteString(sourceURL)
	builder.WriteString("\n")
	if strings.TrimSpace(item.Author) != "" {
		builder.WriteString("Author: ")
		builder.WriteString(strings.TrimSpace(item.Author))
		builder.WriteString("\n")
	}
	if item.Points > 0 {
		builder.WriteString("Points: ")
		builder.WriteString(strconv.Itoa(item.Points))
		builder.WriteString("\n")
	}
	if text := hackerNewsReadableText(item.Text); text != "" {
		builder.WriteString("\n")
		builder.WriteString(text)
		builder.WriteString("\n")
	}
	commentCount := 0
	for _, child := range item.Children {
		writeHackerNewsCommentMarkdown(&builder, child, 0, &commentCount)
		if commentCount >= maxHackerNewsComments {
			break
		}
	}
	return strings.TrimSpace(builder.String()) + "\n"
}

func writeHackerNewsCommentMarkdown(
	builder *strings.Builder,
	item hackerNewsAlgoliaItem,
	depth int,
	commentCount *int,
) {
	if *commentCount >= maxHackerNewsComments {
		return
	}
	text := hackerNewsReadableText(item.Text)
	if text != "" {
		*commentCount += 1
		if *commentCount == 1 {
			builder.WriteString("\n## Comments\n")
		}
		builder.WriteString("\n")
		for range max(0, depth) {
			builder.WriteString("> ")
		}
		if strings.TrimSpace(item.Author) != "" {
			builder.WriteString(strings.TrimSpace(item.Author))
			builder.WriteString(": ")
		}
		builder.WriteString(text)
		builder.WriteString("\n")
	}
	for _, child := range item.Children {
		writeHackerNewsCommentMarkdown(builder, child, depth+1, commentCount)
		if *commentCount >= maxHackerNewsComments {
			return
		}
	}
}

func hackerNewsReadableText(input string) string {
	return strings.Join(strings.Fields(normalizeReadableSourceText(input)), " ")
}

func prepareNarrationBlocks(input string, maxSentenceRunes int) ([]NarrationBlock, []SkippedSourceItem, []string) {
	result := preprocessReadableSource(input, "book-scope.md", "text/markdown", maxSentenceRunes, "legacy")
	return result.Blocks, result.SkippedItems, result.Warnings
}

func preprocessReadableSource(
	input string,
	sourceName string,
	contentType string,
	maxSentenceRunes int,
	markdownParseMode string,
) sourcePreprocessResult {
	sourceFormat := detectPreparedSourceFormat(sourceName, contentType, input)
	switch sourceFormat {
	case "html":
		blocks, skipped, warnings := preparePlainNarrationBlocks(normalizeReadableSourceText(input), maxSentenceRunes)
		return sourcePreprocessResult{
			Blocks:              blocks,
			SkippedItems:        skipped,
			Warnings:            warnings,
			PreprocessorID:      "html-readable",
			PreprocessorVersion: "html-readable-v1",
			SourceFormat:        sourceFormat,
			RenderMode:          "blocks",
			Title:               inferPreparedSourceTitle(normalizeReadableSourceText(input), sourceName),
		}
	case "structured":
		blocks, skipped, warnings := preparePlainNarrationBlocks(input, maxSentenceRunes)
		return sourcePreprocessResult{
			Blocks:              blocks,
			SkippedItems:        skipped,
			Warnings:            warnings,
			PreprocessorID:      "structured-readable",
			PreprocessorVersion: "structured-readable-v1",
			SourceFormat:        sourceFormat,
			RenderMode:          "blocks",
			Title:               inferPreparedSourceTitle(input, sourceName),
		}
	case "plain":
		blocks, skipped, warnings := preparePlainNarrationBlocks(input, maxSentenceRunes)
		return sourcePreprocessResult{
			Blocks:              blocks,
			SkippedItems:        skipped,
			Warnings:            warnings,
			PreprocessorID:      "plain-text",
			PreprocessorVersion: "plain-text-v1",
			SourceFormat:        sourceFormat,
			RenderMode:          "blocks",
			Title:               inferPreparedSourceTitle(input, sourceName),
		}
	default:
		markdownParseMode = normalizeMarkdownParseMode(markdownParseMode)
		if markdownParseMode == "strict" {
			if result, ok := prepareMarkdownNarrationBlocksWithAdapter(input, sourceName, maxSentenceRunes); ok {
				return result
			}
		}
		blocks, skipped, warnings := prepareMarkdownNarrationBlocks(input, maxSentenceRunes)
		return sourcePreprocessResult{
			Blocks:              blocks,
			SkippedItems:        skipped,
			Warnings:            appendAdapterFallbackWarning(warnings, markdownParseMode),
			PreprocessorID:      "markdown-legacy",
			PreprocessorVersion: "markdown-legacy-v1",
			SourceFormat:        "markdown",
			RenderMode:          "markdown",
			Title:               firstNonEmpty(markdownFirstHeading(input), inferPreparedSourceTitle(input, sourceName)),
			MarkdownParseMode:   "legacy",
		}
	}
}

func preparePlainNarrationBlocks(input string, maxSentenceRunes int) ([]NarrationBlock, []SkippedSourceItem, []string) {
	if maxSentenceRunes <= 0 {
		maxSentenceRunes = defaultSourcePrepSentenceMaxRunes
	}
	text := normalizeReadableSourceText(input)
	paragraphs := strings.Split(text, "\n\n")
	blocks := make([]NarrationBlock, 0)
	skipped := make([]SkippedSourceItem, 0)
	warnings := make([]string, 0)
	offsetCursor := 0
	for _, paragraph := range paragraphs {
		raw := strings.TrimSpace(paragraph)
		if raw == "" {
			offsetCursor += len(paragraph) + 2
			continue
		}
		start := strings.Index(text[offsetCursor:], raw)
		if start >= 0 {
			start += offsetCursor
		} else {
			start = offsetCursor
		}
		end := start + len(raw)
		clean := cleanMarkdownInline(raw)
		kind := NarrationBlockKindBody
		mode := NarrationSpeakModeSpeak
		if markdownRawURLLine.MatchString(clean) || shouldSkipCitationBlock(clean) {
			kind = NarrationBlockKindCitation
		}
		block := newNarrationBlock(len(blocks), kind, mode, labelForBlock(kind, clean), raw, clean, start, end, maxSentenceRunes)
		if kind == NarrationBlockKindCitation {
			block.Warnings = append(block.Warnings, "citation_skipped")
			skipped = append(skipped, skippedSourceItem(block, "citation or raw URL skipped"))
		}
		blocks = append(blocks, block)
		warnings = append(warnings, block.Warnings...)
		offsetCursor = end
	}
	return blocks, skipped, uniqueStrings(warnings)
}

type markdownAdapterResponse struct {
	AdapterVersion string                 `json:"adapterVersion"`
	Blocks         []markdownAdapterBlock `json:"blocks"`
	Metadata       map[string]any         `json:"metadata"`
	ParseMode      string                 `json:"parseMode"`
	Title          string                 `json:"title"`
	Warnings       []string               `json:"warnings"`
}

type markdownAdapterBlock struct {
	ID          string         `json:"id"`
	Index       int            `json:"index"`
	Kind        string         `json:"kind"`
	SpeakMode   string         `json:"speakMode"`
	Label       string         `json:"label"`
	Text        string         `json:"text"`
	SpokenText  string         `json:"spokenText"`
	Language    string         `json:"language"`
	StartOffset int            `json:"startOffset"`
	EndOffset   int            `json:"endOffset"`
	Confidence  float64        `json:"confidence"`
	Warnings    []string       `json:"warnings"`
	Metadata    map[string]any `json:"metadata"`
}

func prepareMarkdownNarrationBlocksWithAdapter(
	input string,
	sourceName string,
	maxSentenceRunes int,
) (sourcePreprocessResult, bool) {
	scriptPath, ok := markdownAdapterCLIPath()
	if !ok {
		return sourcePreprocessResult{}, false
	}
	request := map[string]any{
		"parseMode":  "strict",
		"source":     input,
		"sourceName": sourceName,
	}
	encoded, err := json.Marshal(request)
	if err != nil {
		return sourcePreprocessResult{}, false
	}
	cmd := exec.Command(markdownAdapterNodePath(), scriptPath)
	cmd.Stdin = bytes.NewReader(encoded)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return sourcePreprocessResult{}, false
	}
	var response markdownAdapterResponse
	if err := json.Unmarshal(output, &response); err != nil {
		return sourcePreprocessResult{}, false
	}
	blocks := make([]NarrationBlock, 0, len(response.Blocks))
	warnings := append([]string{}, response.Warnings...)
	for index, adapterBlock := range response.Blocks {
		block := narrationBlockFromMarkdownAdapter(adapterBlock, index, maxSentenceRunes)
		blocks = append(blocks, block)
		warnings = append(warnings, block.Warnings...)
	}
	return sourcePreprocessResult{
		Blocks:              blocks,
		SkippedItems:        nil,
		Warnings:            uniqueStrings(warnings),
		PreprocessorID:      "markdown-ast",
		PreprocessorVersion: firstNonEmpty(response.AdapterVersion, "markdown-adapter-v2"),
		SourceFormat:        "markdown",
		RenderMode:          "markdown",
		Title:               response.Title,
		MarkdownParseMode:   "strict",
		Metadata:            response.Metadata,
	}, true
}

func narrationBlockFromMarkdownAdapter(
	adapterBlock markdownAdapterBlock,
	index int,
	maxSentenceRunes int,
) NarrationBlock {
	kind := NarrationBlockKind(adapterBlock.Kind)
	if kind == "" {
		kind = NarrationBlockKindEmbedded
	}
	mode := NarrationSpeakMode(adapterBlock.SpeakMode)
	if mode == "" {
		mode = NarrationSpeakModeSpeak
	}
	block := newNarrationBlock(
		index,
		kind,
		mode,
		firstNonEmpty(adapterBlock.Label, labelForBlock(kind, adapterBlock.SpokenText)),
		adapterBlock.Text,
		adapterBlock.SpokenText,
		adapterBlock.StartOffset,
		adapterBlock.EndOffset,
		maxSentenceRunes,
	)
	if strings.TrimSpace(adapterBlock.ID) != "" {
		block.ID = adapterBlock.ID
	}
	if adapterBlock.Index > 0 {
		block.Index = adapterBlock.Index
	}
	block.Language = adapterBlock.Language
	block.Metadata = adapterBlock.Metadata
	block.Warnings = uniqueStrings(append(block.Warnings, adapterBlock.Warnings...))
	if adapterBlock.Confidence > 0 {
		block.Confidence = adapterBlock.Confidence
	}
	return block
}

func markdownAdapterNodePath() string {
	if configured := strings.TrimSpace(os.Getenv("VOICE_MARKDOWN_ADAPTER_NODE_PATH")); configured != "" {
		return configured
	}
	return "node"
}

func markdownAdapterCLIPath() (string, bool) {
	candidates := []string{}
	if configured := strings.TrimSpace(os.Getenv("VOICE_MARKDOWN_ADAPTER_CLI_PATH")); configured != "" {
		candidates = append(candidates, configured)
	}
	candidates = append(candidates,
		"adapters/markdown/cli.js",
		"../adapters/markdown/cli.js",
		"../../adapters/markdown/cli.js",
		"../../../adapters/markdown/cli.js",
		"../../../../adapters/markdown/cli.js",
	)
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, true
		}
	}
	return "", false
}

func normalizeMarkdownParseMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "legacy", "compat", "compatibility":
		return "legacy"
	default:
		return "strict"
	}
}

func appendAdapterFallbackWarning(warnings []string, requestedMode string) []string {
	if normalizeMarkdownParseMode(requestedMode) != "strict" {
		return warnings
	}
	return uniqueStrings(append(warnings, "markdown_adapter_fallback"))
}

func prepareMarkdownNarrationBlocks(input string, maxSentenceRunes int) ([]NarrationBlock, []SkippedSourceItem, []string) {
	if maxSentenceRunes <= 0 {
		maxSentenceRunes = defaultSourcePrepSentenceMaxRunes
	}
	text := normalizeReadableSourceText(input)
	lines := strings.Split(text, "\n")
	blocks := make([]NarrationBlock, 0)
	skipped := make([]SkippedSourceItem, 0)
	warnings := make([]string, 0)
	var paragraph []string
	paragraphStart := 0
	offsetCursor := 0
	inFence := false
	fenceLang := ""
	var fenceLines []string
	fenceStart := 0
	inMath := false
	var mathLines []string
	mathStart := 0
	var tableLines []string
	tableStart := 0

	flushParagraph := func(endOffset int) {
		if len(paragraph) == 0 {
			return
		}
		raw := strings.Join(paragraph, " ")
		paragraph = nil
		clean := cleanMarkdownInline(raw)
		if strings.TrimSpace(clean) == "" {
			return
		}
		kind := NarrationBlockKindBody
		if strings.HasPrefix(strings.TrimSpace(raw), ">") {
			kind = NarrationBlockKindQuote
			clean = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(clean), ">"))
		} else if markdownInlineMathPattern.MatchString(strings.TrimSpace(raw)) && strings.TrimSpace(raw) == markdownInlineMathPattern.FindString(strings.TrimSpace(raw)) {
			kind = NarrationBlockKindMath
		}
		block := newNarrationBlock(len(blocks), kind, NarrationSpeakModeSpeak, labelForBlock(kind, clean), raw, clean, paragraphStart, endOffset, maxSentenceRunes)
		if shouldSkipCitationBlock(clean) {
			block.Kind = NarrationBlockKindCitation
			block.Warnings = append(block.Warnings, "citation_skipped")
			skipped = append(skipped, skippedSourceItem(block, "citation markup removed from spoken playback"))
		} else if containsCitationMarkup(raw) {
			block.Warnings = append(block.Warnings, "citation_removed")
			skipped = append(skipped, SkippedSourceItem{
				ID:     block.ID + "-citation",
				Kind:   NarrationBlockKindCitation,
				Text:   "inline citation markup",
				Reason: "inline citation removed from spoken playback",
				Offset: paragraphStart,
			})
		}
		blocks = append(blocks, block)
	}
	flushTable := func(endOffset int) {
		if len(tableLines) == 0 {
			return
		}
		raw := strings.Join(tableLines, "\n")
		tableLines = nil
		block := newNarrationBlock(len(blocks), NarrationBlockKindTable, NarrationSpeakModeSpeak, "Table", raw, raw, tableStart, endOffset, maxSentenceRunes)
		block.Warnings = append(block.Warnings, "table_policy")
		blocks = append(blocks, block)
	}
	flushMath := func(endOffset int) {
		if len(mathLines) == 0 {
			return
		}
		raw := strings.Join(mathLines, "\n")
		mathLines = nil
		block := newNarrationBlock(len(blocks), NarrationBlockKindMath, NarrationSpeakModeSpeak, "Math expression", raw, raw, mathStart, endOffset, maxSentenceRunes)
		block.Warnings = append(block.Warnings, "math_policy")
		blocks = append(blocks, block)
	}

	for _, line := range lines {
		lineStart := offsetCursor
		offsetCursor += len(line) + 1
		trimmed := strings.TrimSpace(line)
		if inFence {
			if strings.HasPrefix(trimmed, "```") {
				raw := strings.Join(fenceLines, "\n")
				kind := NarrationBlockKindCode
				reason := "code block omitted from spoken playback"
				if strings.EqualFold(fenceLang, "mermaid") {
					reason = "diagram omitted from spoken playback"
				}
				block := newNarrationBlock(len(blocks), kind, NarrationSpeakModeSpeak, "Code sample", raw, raw, fenceStart, offsetCursor, maxSentenceRunes)
				block.Language = fenceLang
				block.Warnings = append(block.Warnings, "code_policy")
				blocks = append(blocks, block)
				skipped = append(skipped, skippedSourceItem(block, reason))
				fenceLines = nil
				fenceLang = ""
				inFence = false
				continue
			}
			fenceLines = append(fenceLines, line)
			continue
		}
		if inMath {
			if trimmed == "$$" {
				flushMath(offsetCursor)
				inMath = false
				continue
			}
			mathLines = append(mathLines, line)
			continue
		}
		if matches := markdownFenceLine.FindStringSubmatch(trimmed); len(matches) > 0 {
			flushParagraph(lineStart)
			flushTable(lineStart)
			inFence = true
			fenceStart = lineStart
			if len(matches) > 1 {
				fenceLang = strings.TrimSpace(matches[1])
			}
			continue
		}
		if trimmed == "$$" {
			flushParagraph(lineStart)
			flushTable(lineStart)
			inMath = true
			mathStart = lineStart
			continue
		}
		if strings.HasPrefix(trimmed, "$$") && strings.HasSuffix(trimmed, "$$") && len(trimmed) > 4 {
			flushParagraph(lineStart)
			flushTable(lineStart)
			block := newNarrationBlock(len(blocks), NarrationBlockKindMath, NarrationSpeakModeSpeak, "Math expression", trimmed, trimmed, lineStart, offsetCursor, maxSentenceRunes)
			block.Warnings = append(block.Warnings, "math_policy")
			blocks = append(blocks, block)
			continue
		}
		if trimmed == "" {
			flushParagraph(lineStart)
			flushTable(lineStart)
			continue
		}
		if strings.Contains(trimmed, "|") || markdownTableDividerLine.MatchString(trimmed) {
			flushParagraph(lineStart)
			if len(tableLines) == 0 {
				tableStart = lineStart
			}
			if !markdownTableDividerLine.MatchString(trimmed) {
				tableLines = append(tableLines, line)
			}
			continue
		}
		flushTable(lineStart)
		if markdownImageOnlyLine.MatchString(trimmed) {
			flushParagraph(lineStart)
			block := newNarrationBlock(len(blocks), NarrationBlockKindImage, NarrationSpeakModeSpeak, "Image", trimmed, cleanMarkdownInline(trimmed), lineStart, offsetCursor, maxSentenceRunes)
			block.Warnings = append(block.Warnings, "image_policy")
			blocks = append(blocks, block)
			continue
		}
		if markdownCaptionLine.MatchString(trimmed) {
			flushParagraph(lineStart)
			clean := cleanMarkdownInline(markdownCaptionLine.ReplaceAllString(trimmed, ""))
			block := newNarrationBlock(len(blocks), NarrationBlockKindCaption, NarrationSpeakModeSpeak, "Caption", trimmed, clean, lineStart, offsetCursor, maxSentenceRunes)
			block.Warnings = append(block.Warnings, "caption_policy")
			blocks = append(blocks, block)
			continue
		}
		if markdownFootnoteLine.MatchString(trimmed) || markdownRawURLLine.MatchString(trimmed) || shouldSkipCitationBlock(trimmed) {
			flushParagraph(lineStart)
			clean := cleanMarkdownInline(trimmed)
			block := newNarrationBlock(len(blocks), NarrationBlockKindCitation, NarrationSpeakModeSpeak, "Citation", trimmed, clean, lineStart, offsetCursor, maxSentenceRunes)
			block.Warnings = append(block.Warnings, "citation_skipped")
			blocks = append(blocks, block)
			skipped = append(skipped, SkippedSourceItem{ID: block.ID, Kind: block.Kind, Text: clean, Reason: "citation or raw URL skipped", Offset: lineStart})
			continue
		}
		if matches := markdownHeadingLine.FindStringSubmatch(trimmed); len(matches) == 3 {
			flushParagraph(lineStart)
			level := utf8.RuneCountInString(matches[1])
			kind := NarrationBlockKindHeading
			if level > 1 {
				kind = NarrationBlockKindSubheading
			}
			clean := cleanMarkdownInline(matches[2])
			block := newNarrationBlock(len(blocks), kind, NarrationSpeakModeSpeak, clean, trimmed, clean, lineStart, offsetCursor, maxSentenceRunes)
			block.Warnings = append(block.Warnings, "heading_emphasis")
			blocks = append(blocks, block)
			continue
		}
		if len(paragraph) == 0 {
			paragraphStart = lineStart
		}
		paragraph = append(paragraph, markdownListPrefixPattern.ReplaceAllString(trimmed, ""))
	}
	flushParagraph(offsetCursor)
	flushTable(offsetCursor)
	flushMath(offsetCursor)
	for _, block := range blocks {
		warnings = append(warnings, block.Warnings...)
	}
	return blocks, skipped, uniqueStrings(warnings)
}

func newNarrationBlock(index int, kind NarrationBlockKind, mode NarrationSpeakMode, label string, text string, spokenText string, startOffset int, endOffset int, maxSentenceRunes int) NarrationBlock {
	segments, warnings := sentenceSafeSegments(spokenText, maxSentenceRunes)
	if mode == NarrationSpeakModeSkip {
		segments = nil
	}
	emphasis, pauseBefore, pauseAfter := narrationEmphasis(kind, mode)
	return NarrationBlock{
		ID:                  fmt.Sprintf("block-%04d", index+1),
		Index:               index + 1,
		Kind:                kind,
		SpeakMode:           mode,
		Label:               strings.TrimSpace(label),
		Text:                strings.TrimSpace(text),
		SpokenText:          strings.TrimSpace(spokenText),
		Emphasis:            emphasis,
		PauseBeforeMS:       pauseBefore,
		PauseAfterMS:        pauseAfter,
		StartOffset:         startOffset,
		EndOffset:           endOffset,
		EstimatedDurationMS: estimateBookDurationMS(countWords(spokenText)),
		Confidence:          confidenceForBlock(kind, mode),
		Segments:            segments,
		Warnings:            warnings,
		SpeechPolicy: policy.SpeechPolicy{
			Profile:     string(policy.DefaultProfileName),
			Element:     policy.ElementKind(string(kind), string(kind), text, warnings),
			ElementMode: string(mode),
			Mode:        string(policy.ModeSpeak),
			Explanation: "Policy has not been evaluated yet.",
		},
	}
}

func applySpeechPolicyToPreparedSource(source PreparedSource, profileName string, overrides policy.Overrides, maxSentenceRunes int) PreparedSource {
	evaluator := policy.NewEvaluator(policy.NormalizeProfileName(profileName), overrides)
	return applySpeechPolicyToPreparedSourceWithEvaluator(source, evaluator, maxSentenceRunes)
}

func applySpeechPolicyToPreparedSourceWithEvaluator(source PreparedSource, evaluator policy.Evaluator, maxSentenceRunes int) PreparedSource {
	source.SpeechPolicyProfile = evaluator.ProfileID()
	source.SkippedItems = nil
	for index := range source.Blocks {
		block := source.Blocks[index]
		decision := evaluator.Evaluate(policy.Element{
			Kind:     string(block.Kind),
			Role:     string(block.Kind),
			Text:     policyElementText(block),
			Language: block.Language,
			Warnings: block.Warnings,
		})
		block.SpeechPolicy = decision.Policy
		block.SpokenText = strings.TrimSpace(decision.SpeechText)
		if block.Metadata == nil {
			block.Metadata = map[string]any{}
		}
		block.Metadata["policySpeechText"] = block.SpokenText
		block.LanguageSpans = nil
		block.Pronunciations = nil
		block.Normalisations = nil
		block.MathPreview = nil
		block.SpeakMode = legacySpeakModeForDecision(decision)
		if block.SpeakMode == NarrationSpeakModeSkip {
			block.SpokenText = ""
			block.Segments = nil
			block.EstimatedDurationMS = 0
			source.SkippedItems = append(source.SkippedItems, skippedSourceItem(block, decision.Policy.Explanation))
		} else {
			block.Segments, block.Warnings = resetPolicySegments(block, maxSentenceRunes)
			block.EstimatedDurationMS = estimateBookDurationMS(countWords(block.SpokenText))
		}
		block.Emphasis, block.PauseBeforeMS, block.PauseAfterMS = narrationEmphasis(block.Kind, block.SpeakMode)
		block.Confidence = confidenceForBlock(block.Kind, block.SpeakMode)
		source.Blocks[index] = block
	}
	source.SpeechText = preparedSourceSpeechText(source.Blocks)
	source.WordCount = countWords(source.SpeechText)
	source.BlockCount = len(source.Blocks)
	source.SegmentCount = countPreparedSegments(source.Blocks)
	source.Summary = summarizePreparedSource(source.Blocks)
	return source
}

func policyElementText(block NarrationBlock) string {
	switch block.Kind {
	case NarrationBlockKindTable,
		NarrationBlockKindCode,
		NarrationBlockKindMath,
		NarrationBlockKindImage,
		NarrationBlockKindCaption,
		NarrationBlockKindCitation,
		NarrationBlockKindList,
		NarrationBlockKindDirective,
		NarrationBlockKindEmbedded,
		NarrationBlockKindFrontmatter:
		return firstNonEmpty(block.Text, block.SpokenText)
	default:
		if text := metadataString(block.Metadata, "policySpeechText"); text != "" {
			return text
		}
		return firstNonEmpty(block.SpokenText, block.Text)
	}
}

func resetPolicySegments(block NarrationBlock, maxSentenceRunes int) ([]NarrationSegment, []string) {
	segments, sentenceWarnings := sentenceSafeSegments(block.SpokenText, maxSentenceRunes)
	warnings := removeWarning(block.Warnings, warningSentenceTooLong)
	warnings = append(warnings, sentenceWarnings...)
	return segments, uniqueStrings(warnings)
}

func legacySpeakModeForDecision(decision policy.Decision) NarrationSpeakMode {
	if strings.TrimSpace(decision.SpeechText) == "" {
		return NarrationSpeakModeSkip
	}
	switch policy.Mode(decision.Policy.Mode) {
	case policy.ModeSkip, policy.ModeOnDemand, policy.ModeInteractive:
		return NarrationSpeakModeSkip
	case policy.ModeSummarise:
		return NarrationSpeakModeSummarize
	default:
		return NarrationSpeakModeSpeak
	}
}

func narrationEmphasis(kind NarrationBlockKind, mode NarrationSpeakMode) (string, int, int) {
	if mode != NarrationSpeakModeSpeak {
		return "", 0, 0
	}
	switch kind {
	case NarrationBlockKindHeading:
		return "heading", 420, 520
	case NarrationBlockKindSubheading:
		return "subheading", 280, 360
	case NarrationBlockKindAdmonition:
		return "admonition", 180, 220
	default:
		return "", 0, 0
	}
}

func sentenceSafeSegments(text string, maxRunes int) ([]NarrationSegment, []string) {
	clean := strings.TrimSpace(text)
	if clean == "" {
		return nil, nil
	}
	if maxRunes <= 0 {
		maxRunes = defaultSourcePrepSentenceMaxRunes
	}
	sentences := splitSentencePieces(clean)
	segments := make([]NarrationSegment, 0, len(sentences))
	warnings := make([]string, 0)
	cursor := 0
	for _, sentence := range sentences {
		sentence = strings.TrimSpace(sentence)
		if sentence == "" {
			continue
		}
		start := strings.Index(clean[cursor:], sentence)
		if start < 0 {
			start = cursor
		} else {
			start += cursor
		}
		end := start + len(sentence)
		segmentWarnings := []string{}
		if utf8.RuneCountInString(sentence) > maxRunes {
			segmentWarnings = append(segmentWarnings, warningSentenceTooLong)
			warnings = append(warnings, warningSentenceTooLong)
		}
		segments = append(segments, NarrationSegment{
			Index:       len(segments) + 1,
			Text:        sentence,
			StartOffset: start,
			EndOffset:   end,
			Warnings:    segmentWarnings,
		})
		cursor = end
	}
	return segments, uniqueStrings(warnings)
}

func normalizeReadableSourceText(input string) string {
	trimmed := strings.TrimSpace(strings.ReplaceAll(input, "\r\n", "\n"))
	trimmed = strings.ReplaceAll(trimmed, "\r", "\n")
	if strings.Contains(trimmed, "<") && strings.Contains(trimmed, ">") {
		trimmed = htmlScriptStylePattern.ReplaceAllString(trimmed, " ")
		trimmed = htmlBlockBreakPattern.ReplaceAllString(trimmed, "\n")
		trimmed = htmlTagSpeechPattern.ReplaceAllString(trimmed, " ")
		trimmed = html.UnescapeString(trimmed)
	}
	return strings.TrimSpace(trimmed)
}

func cleanMarkdownInline(input string) string {
	clean := citationGlyphPattern.ReplaceAllString(input, " ")
	clean = turnCitationPattern.ReplaceAllString(clean, " ")
	clean = markdownImagePattern.ReplaceAllString(clean, "$1")
	clean = markdownLinkPattern.ReplaceAllString(clean, "$1")
	clean = inlineCodeSpeechPattern.ReplaceAllString(clean, "$1")
	clean = strings.NewReplacer("**", "", "__", "", "~~", "", "•", "").Replace(clean)
	clean = strings.Trim(clean, " \t-*`_")
	return strings.Join(strings.Fields(clean), " ")
}

func shouldSkipCitationBlock(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	citationStripped := citationGlyphPattern.ReplaceAllString(trimmed, "")
	citationStripped = turnCitationPattern.ReplaceAllString(citationStripped, "")
	citationStripped = strings.Trim(citationStripped, " []().,;:|")
	if citationStripped == "" {
		return true
	}
	return strings.Count(trimmed, "cite") >= 2 && countWords(citationStripped) <= 6
}

func containsCitationMarkup(text string) bool {
	return citationGlyphPattern.MatchString(text) || turnCitationPattern.MatchString(text)
}

func tableLinesOrRaw(raw string) []string {
	lines := strings.Split(raw, "\n")
	output := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			output = append(output, line)
		}
	}
	return output
}

func summarizeMarkdownTable(lines []string) string {
	if len(lines) == 0 {
		return "A table appears here and is omitted from spoken playback."
	}
	headers := markdownTableCells(lines[0])
	if len(headers) > 0 {
		return fmt.Sprintf("A table appears here with columns: %s.", strings.Join(headers, ", "))
	}
	return "A table appears here and is summarized for spoken playback."
}

func markdownTableCells(line string) []string {
	parts := strings.Split(strings.Trim(line, "| "), "|")
	cells := make([]string, 0, len(parts))
	for _, part := range parts {
		cell := cleanMarkdownInline(part)
		if cell != "" {
			cells = append(cells, cell)
		}
	}
	return cells
}

func preparedSourceSpeechText(blocks []NarrationBlock) string {
	parts := make([]string, 0, len(blocks))
	for _, block := range blocks {
		if block.SpeakMode == NarrationSpeakModeSkip {
			continue
		}
		text := strings.TrimSpace(block.SpokenText)
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n\n")
}

func countPreparedSegments(blocks []NarrationBlock) int {
	total := 0
	for _, block := range blocks {
		if block.SpeakMode != NarrationSpeakModeSkip {
			total += len(block.Segments)
		}
	}
	return total
}

func summarizePreparedSource(blocks []NarrationBlock) PreparedSourceSummary {
	var summary PreparedSourceSummary
	for _, block := range blocks {
		switch block.Kind {
		case NarrationBlockKindHeading, NarrationBlockKindSubheading:
			summary.HeadingCount += 1
		case NarrationBlockKindCitation:
			if block.SpeakMode == NarrationSpeakModeSkip {
				summary.CitationSkipCount += 1
			}
		}
		if hasWarning(block.Warnings, "citation_removed") {
			summary.CitationSkipCount += 1
		}
		if block.SpeakMode == NarrationSpeakModeSkip {
			summary.SkippedBlockCount += 1
		} else {
			summary.SpokenBlockCount += 1
			summary.SentenceSegmentCount += len(block.Segments)
		}
	}
	return summary
}

func summarizePreparedSourcePayload(source PreparedSource) PreparedSource {
	source.Text = ""
	source.SpeechText = ""
	for index := range source.Blocks {
		source.Blocks[index].Text = truncateString(source.Blocks[index].Text, 220)
		source.Blocks[index].SpokenText = truncateString(source.Blocks[index].SpokenText, 220)
	}
	return source
}

func skippedSourceItem(block NarrationBlock, reason string) SkippedSourceItem {
	return SkippedSourceItem{
		ID:     block.ID,
		Kind:   block.Kind,
		Text:   truncateString(block.Text, 240),
		Reason: reason,
		Offset: block.StartOffset,
	}
}

func inferPreparedSourceTitle(text string, fallback string) string {
	if title := markdownFirstHeading(text); title != "" {
		return title
	}
	for _, line := range strings.Split(text, "\n") {
		if matches := markdownHeadingLine.FindStringSubmatch(strings.TrimSpace(line)); len(matches) == 3 {
			return cleanMarkdownInline(matches[2])
		}
	}
	return strings.TrimSpace(fallback)
}

func detectPreparedSourceFormat(sourceName string, contentType string, input string) string {
	lowerName := strings.ToLower(strings.TrimSpace(sourceName))
	lowerType := strings.ToLower(strings.TrimSpace(contentType))
	switch {
	case strings.Contains(lowerType, "markdown") || strings.HasSuffix(lowerName, ".md") || strings.HasSuffix(lowerName, ".markdown"):
		return "markdown"
	case strings.Contains(lowerType, "html") || strings.HasSuffix(lowerName, ".html") || strings.HasSuffix(lowerName, ".htm"):
		return "html"
	case strings.HasSuffix(lowerName, ".csv") || strings.HasSuffix(lowerName, ".json") || strings.HasSuffix(lowerName, ".log"):
		return "structured"
	case strings.Contains(strings.TrimSpace(input), "\n# ") || strings.HasPrefix(strings.TrimSpace(input), "# "):
		return "markdown"
	default:
		return "plain"
	}
}

func markdownFirstHeading(input string) string {
	source := []byte(input)
	reader := text.NewReader(source)
	document := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithParserOptions(parser.WithAutoHeadingID()),
	).Parser().Parse(reader)
	title := ""
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if title != "" || !entering {
			return ast.WalkContinue, nil
		}
		heading, ok := node.(*ast.Heading)
		if !ok || heading.Level > 3 {
			return ast.WalkContinue, nil
		}
		title = cleanMarkdownInline(string(heading.Text(source)))
		if title != "" {
			return ast.WalkStop, nil
		}
		return ast.WalkContinue, nil
	})
	return title
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func labelForBlock(kind NarrationBlockKind, text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return string(kind)
	}
	return truncateString(trimmed, 70)
}

func confidenceForBlock(kind NarrationBlockKind, mode NarrationSpeakMode) float64 {
	if mode == NarrationSpeakModeSkip {
		return 0.98
	}
	switch kind {
	case NarrationBlockKindTable:
		return 0.82
	case NarrationBlockKindDirective, NarrationBlockKindEmbedded:
		return 0.72
	}
	return 0.94
}

func countWords(text string) int {
	return len(strings.Fields(strings.TrimSpace(text)))
}

func hasWarning(warnings []string, warning string) bool {
	for _, item := range warnings {
		if item == warning {
			return true
		}
	}
	return false
}

func removeWarning(warnings []string, warning string) []string {
	if len(warnings) == 0 {
		return warnings
	}
	output := make([]string, 0, len(warnings))
	for _, item := range warnings {
		if item != warning {
			output = append(output, item)
		}
	}
	if len(output) == 0 {
		return nil
	}
	return output
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	output := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		output = append(output, value)
	}
	return output
}

func truncateString(value string, maxRunes int) string {
	if maxRunes <= 0 || utf8.RuneCountInString(value) <= maxRunes {
		return value
	}
	runes := []rune(value)
	return strings.TrimSpace(string(runes[:maxRunes-1])) + "…"
}

func filenameFromURL(parsed *url.URL, contentType string) string {
	name := path.Base(parsed.Path)
	if name == "." || name == "/" || name == "" {
		name = "source"
	}
	if ext := filepath.Ext(name); ext == "" {
		if extensions, err := mime.ExtensionsByType(contentType); err == nil && len(extensions) > 0 {
			name += extensions[0]
		}
	}
	return name
}

func ensureFilenameExtension(name string, extension string) string {
	if strings.EqualFold(filepath.Ext(name), extension) {
		return name
	}
	return strings.TrimSuffix(name, filepath.Ext(name)) + extension
}

func isPrivateOrLocalIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

func progressTargetForPreparedSource(sourceID string) string {
	return "prepared:" + strings.TrimSpace(sourceID)
}

func progressTargetForBookScope(bookID string, scope *BookScope) string {
	parts := []string{"book", strings.TrimSpace(bookID)}
	if scope != nil {
		parts = append(parts, string(scope.Type), strconv.Itoa(scope.ChapterIndex), strconv.Itoa(scope.PageStart), strconv.Itoa(scope.PageEnd))
	}
	return strings.Join(parts, ":")
}

func jsonUnmarshal(data []byte, output any) error {
	decoder := jsonDecoder(bytes.NewReader(data))
	return decoder.Decode(output)
}

func jsonDecoder(reader io.Reader) interface{ Decode(any) error } {
	return json.NewDecoder(reader)
}
