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
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	preparedSourceMetadataFilename = "source-prep.json"
	playbackProgressFilename       = "progress.json"
	playbackSessionFilename        = "session.json"
	maxReadableURLBytes            = 20 << 20
	readableURLTimeout             = 20 * time.Second
)

type fetchedReadableSource struct {
	URL         string
	Filename    string
	ContentType string
	Bytes       []byte
}

var (
	citationGlyphPattern      = regexp.MustCompile(`cite[^]*`)
	turnCitationPattern       = regexp.MustCompile(`\bturn\d+(?:search|view|news|fetch)\d+\b`)
	markdownLinkPattern       = regexp.MustCompile(`\[([^\]]+)\]\([^)]+\)`)
	markdownImagePattern      = regexp.MustCompile(`!\[([^\]]*)\]\([^)]+\)`)
	inlineCodeSpeechPattern   = regexp.MustCompile("`([^`]+)`")
	htmlScriptStylePattern    = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<noscript[^>]*>.*?</noscript>`)
	htmlBlockBreakPattern     = regexp.MustCompile(`(?i)</(p|div|section|article|br|h[1-6]|li|tr)>`)
	htmlTagSpeechPattern      = regexp.MustCompile(`(?s)<[^>]+>`)
	markdownHeadingLine       = regexp.MustCompile(`^(#{1,6})\s+(.+)$`)
	markdownFenceLine         = regexp.MustCompile("^```\\s*([A-Za-z0-9_-]+)?")
	markdownTableDividerLine  = regexp.MustCompile(`^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$`)
	markdownFootnoteLine      = regexp.MustCompile(`^\[\^[^\]]+\]:`)
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
		Title:             inferPreparedSourceTitle(sourceText, sourceName),
		Text:              sourceText,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	prepared.Blocks, prepared.SkippedItems, prepared.Warnings = prepareNarrationBlocks(sourceText, service.options.StudioSegmentMaxRunes)
	prepared.SpeechText = preparedSourceSpeechText(prepared.Blocks)
	prepared.WordCount = countWords(prepared.SpeechText)
	prepared.BlockCount = len(prepared.Blocks)
	prepared.SegmentCount = countPreparedSegments(prepared.Blocks)
	prepared.Summary = summarizePreparedSource(prepared.Blocks)

	service.updatePreparedSource(prepared)
	if err := service.writePreparedSourceMetadata(prepared); err != nil {
		return PreparedSource{}, err
	}
	return prepared, nil
}

func (service *Service) CreateBookSourceFromURL(ctx context.Context, projectID string, rawURL string) (BookSource, error) {
	fetched, err := service.fetchReadableSourceURL(ctx, rawURL)
	if err != nil {
		return BookSource{}, err
	}
	kind, err := detectBookSourceKind(fetched.Filename)
	if err != nil {
		if strings.Contains(fetched.ContentType, "pdf") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, ".pdf")
		} else if strings.Contains(fetched.ContentType, "epub") || strings.Contains(fetched.ContentType, "zip") {
			fetched.Filename = ensureFilenameExtension(fetched.Filename, ".epub")
		}
		kind, err = detectBookSourceKind(fetched.Filename)
		if err != nil {
			return BookSource{}, fmt.Errorf("URL does not point to a PDF or EPUB book source")
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
	return service.CreateBookSource(ctx, projectID, tempPath, fetched.Filename, int64(len(fetched.Bytes)))
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
			sources = append(sources, summarizePreparedSourcePayload(source))
		}
	}
	service.mu.RUnlock()
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
	return source, nil
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
	source, err := service.GetPreparedSource(sourceID)
	if err != nil {
		return VoiceJob{}, err
	}
	if source.Status != PreparedSourceStatusReady {
		return VoiceJob{}, fmt.Errorf("prepared source is not ready")
	}
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
		if hasWarning(block.Warnings, "sentence_too_long") {
			return VoiceJob{}, fmt.Errorf("block %q contains a sentence that is too long to synthesize safely; edit the source before creating audio", block.Label)
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
	service.sourcePreps[source.ID] = source
	service.mu.Unlock()
}

func (service *Service) writePreparedSourceMetadata(source PreparedSource) error {
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
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return fetchedReadableSource{}, err
	}
	req.Header.Set("User-Agent", "VoiceStudio/1.0 source-prep")
	resp, err := client.Do(req)
	if err != nil {
		return fetchedReadableSource{}, err
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fetchedReadableSource{}, fmt.Errorf("URL returned HTTP %d", resp.StatusCode)
	}
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

func prepareNarrationBlocks(input string, maxRunes int) ([]NarrationBlock, []SkippedSourceItem, []string) {
	if maxRunes <= 0 {
		maxRunes = defaultStudioSegmentMaxRunes
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
		}
		block := newNarrationBlock(len(blocks), kind, NarrationSpeakModeSpeak, labelForBlock(kind, clean), raw, clean, paragraphStart, endOffset, maxRunes)
		if shouldSkipCitationBlock(clean) {
			block.Kind = NarrationBlockKindCitation
			block.SpeakMode = NarrationSpeakModeSkip
			block.SpokenText = ""
			block.Segments = nil
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
		summary := summarizeMarkdownTable(tableLinesOrRaw(raw))
		block := newNarrationBlock(len(blocks), NarrationBlockKindTable, NarrationSpeakModeSummarize, "Table summary", raw, summary, tableStart, endOffset, maxRunes)
		block.Warnings = append(block.Warnings, "table_summarized")
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
				block := newNarrationBlock(len(blocks), kind, NarrationSpeakModeSkip, "Code sample", raw, "", fenceStart, offsetCursor, maxRunes)
				block.Warnings = append(block.Warnings, "code_skipped")
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
		if markdownFootnoteLine.MatchString(trimmed) || markdownRawURLLine.MatchString(trimmed) || shouldSkipCitationBlock(trimmed) {
			flushParagraph(lineStart)
			clean := cleanMarkdownInline(trimmed)
			block := newNarrationBlock(len(blocks), NarrationBlockKindCitation, NarrationSpeakModeSkip, "Citation", trimmed, "", lineStart, offsetCursor, maxRunes)
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
			block := newNarrationBlock(len(blocks), kind, NarrationSpeakModeSpeak, clean, trimmed, clean, lineStart, offsetCursor, maxRunes)
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
	for _, block := range blocks {
		warnings = append(warnings, block.Warnings...)
	}
	return blocks, skipped, uniqueStrings(warnings)
}

func newNarrationBlock(index int, kind NarrationBlockKind, mode NarrationSpeakMode, label string, text string, spokenText string, startOffset int, endOffset int, maxRunes int) NarrationBlock {
	segments, warnings := sentenceSafeSegments(spokenText, maxRunes)
	if mode == NarrationSpeakModeSkip {
		segments = nil
	}
	return NarrationBlock{
		ID:                  fmt.Sprintf("block-%04d", index+1),
		Index:               index + 1,
		Kind:                kind,
		SpeakMode:           mode,
		Label:               strings.TrimSpace(label),
		Text:                strings.TrimSpace(text),
		SpokenText:          strings.TrimSpace(spokenText),
		StartOffset:         startOffset,
		EndOffset:           endOffset,
		EstimatedDurationMS: estimateBookDurationMS(countWords(spokenText)),
		Confidence:          confidenceForBlock(kind, mode),
		Segments:            segments,
		Warnings:            warnings,
	}
}

func sentenceSafeSegments(text string, maxRunes int) ([]NarrationSegment, []string) {
	clean := strings.TrimSpace(text)
	if clean == "" {
		return nil, nil
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
			segmentWarnings = append(segmentWarnings, "sentence_too_long")
			warnings = append(warnings, "sentence_too_long")
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
	for _, line := range strings.Split(text, "\n") {
		if matches := markdownHeadingLine.FindStringSubmatch(strings.TrimSpace(line)); len(matches) == 3 {
			return cleanMarkdownInline(matches[2])
		}
	}
	return strings.TrimSpace(fallback)
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
	if kind == NarrationBlockKindTable {
		return 0.82
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
