package pipeline

import (
	"fmt"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/policy"
)

func BookSourceToIR(book BookSource, generatedAt time.Time) contentir.Document {
	ensureBookStructureMetadata(&book)
	descriptor := bookSourceIRDescriptor(book)
	nodes := bookSourceIRNodes(descriptor, book)
	return newContentIRDocument(descriptor, generatedAt, nodes)
}

func bookSourceIRNodes(descriptor contentIRSourceDescriptor, book BookSource) []contentir.Node {
	if book.Kind == BookSourceKindPDF && len(book.Pages) > 0 {
		return pdfBookNodes(descriptor, book)
	}
	if len(book.Chapters) > 0 {
		return epubBookNodes(descriptor, book)
	}
	return fallbackBookNodes(descriptor, book)
}

func epubBookNodes(descriptor contentIRSourceDescriptor, book BookSource) []contentir.Node {
	nodes := make([]contentir.Node, 0, len(book.Chapters))
	for index, chapter := range book.Chapters {
		nodes = append(nodes, epubChapterNode(descriptor, book, chapter, index))
	}
	return nodes
}

func epubChapterNode(
	descriptor contentIRSourceDescriptor,
	book BookSource,
	chapter BookSourceChapter,
	index int,
) contentir.Node {
	start, end := chapterOffsets(book, chapter)
	progress := progression(index, len(book.Chapters))
	nodeID := firstNonEmpty(chapter.ID, fmt.Sprintf("chapter-%04d", chapter.Index))
	return bookNode(descriptor, bookNodePayload{
		id:          nodeID,
		order:       index + 1,
		kind:        "chapter",
		role:        chapter.Role,
		displayText: chapter.Text,
		speechText:  chapter.Text,
		locator:     contentir.NewEPUBLocator(chapter.SourceHref, "", textQuote(chapter.Text), &progress, ""),
		start:       start,
		end:         end,
		warnings:    chapter.Warnings,
		confidence:  0.94,
	})
}

func pdfBookNodes(descriptor contentIRSourceDescriptor, book BookSource) []contentir.Node {
	nodes := make([]contentir.Node, 0, len(book.Pages))
	for index, page := range book.Pages {
		nodes = append(nodes, pdfPageNode(descriptor, book, page, index))
	}
	return nodes
}

func pdfPageNode(
	descriptor contentIRSourceDescriptor,
	book BookSource,
	page BookSourcePage,
	index int,
) contentir.Node {
	start, end := pageOffsets(book, page)
	readingOrder := index
	return bookNode(descriptor, bookNodePayload{
		id:          fmt.Sprintf("page-%04d", page.Index),
		order:       index + 1,
		kind:        "page",
		role:        "body",
		displayText: page.Text,
		speechText:  page.Text,
		locator:     contentir.NewPDFLocator(max(0, page.Index-1), nil, nil, &readingOrder),
		start:       start,
		end:         end,
		warnings:    nil,
		confidence:  0.9,
	})
}

func fallbackBookNodes(descriptor contentIRSourceDescriptor, book BookSource) []contentir.Node {
	if strings.TrimSpace(book.Text) == "" {
		return []contentir.Node{}
	}
	return []contentir.Node{
		bookNode(descriptor, bookNodePayload{
			id:          "document-0001",
			order:       1,
			kind:        "document",
			role:        "body",
			displayText: book.Text,
			speechText:  book.Text,
			locator:     contentir.NewMarkdownLocator(book.SourceFile, 1, 1, 1, 1, "/document"),
			start:       0,
			end:         len(book.Text),
			warnings:    book.Warnings,
			confidence:  0.85,
		}),
	}
}

type bookNodePayload struct {
	id          string
	order       int
	kind        string
	role        string
	displayText string
	speechText  string
	locator     contentir.Locator
	start       int
	end         int
	warnings    []string
	confidence  float64
}

func bookNode(descriptor contentIRSourceDescriptor, payload bookNodePayload) contentir.Node {
	role := strings.TrimSpace(payload.role)
	if role == "" {
		role = "body"
	}
	return contentir.Node{
		NodeID:         payload.id,
		ParentID:       "",
		OrderKey:       fmt.Sprintf("%08d", payload.order),
		Kind:           payload.kind,
		Role:           role,
		DisplayText:    strings.TrimSpace(payload.displayText),
		NormalisedText: contentIRText(payload.displayText),
		SpeechText:     strings.TrimSpace(payload.speechText),
		Lang:           "und",
		Script:         "Latn",
		Dir:            "ltr",
		Provenance:     contentir.NewProvenance(descriptor.Format, descriptor.ID, payload.locator, payload.start, payload.end),
		UI:             contentir.DefaultUIHints("linear"),
		Speech: contentir.SpeechMetadata{
			PolicyHint: contentir.NewSpeechPolicyHint("speak", "", 0, 0),
			SpeechPolicy: policy.NewEvaluator(policy.DefaultProfileName, policy.Overrides{}).Evaluate(policy.Element{
				Kind: string(payload.kind),
				Role: role,
				Text: payload.displayText,
			}).Policy,
		},
		Warnings:       contentIRStringSlice(payload.warnings),
		Confidence:     payload.confidence,
		Rights:         contentir.UnknownRights(),
		AdapterVersion: descriptor.AdapterVersion,
	}
}

func chapterOffsets(book BookSource, chapter BookSourceChapter) (int, int) {
	var start, end int
	found := false
	for _, span := range book.WordSpans {
		if span.Chapter != chapter.Index {
			continue
		}
		if !found || span.StartOffset < start {
			start = span.StartOffset
		}
		if span.EndOffset > end {
			end = span.EndOffset
		}
		found = true
	}
	return fallbackOffsets(book.Text, chapter.Text, start, end, found)
}

func pageOffsets(book BookSource, page BookSourcePage) (int, int) {
	var start, end int
	found := false
	for _, span := range book.WordSpans {
		if span.PageIndex != page.Index {
			continue
		}
		if !found || span.StartOffset < start {
			start = span.StartOffset
		}
		if span.EndOffset > end {
			end = span.EndOffset
		}
		found = true
	}
	return fallbackOffsets(book.Text, page.Text, start, end, found)
}

func fallbackOffsets(fullText string, partText string, start int, end int, found bool) (int, int) {
	if found {
		return start, end
	}
	index := strings.Index(fullText, strings.TrimSpace(partText))
	if index < 0 {
		return 0, len(strings.TrimSpace(partText))
	}
	return index, index + len(strings.TrimSpace(partText))
}

func progression(index int, total int) float64 {
	if total <= 1 {
		return 0
	}
	return float64(index) / float64(total-1)
}
