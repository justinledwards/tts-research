package pipeline

import (
	"fmt"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

func PreparedSourceToIR(source PreparedSource, generatedAt time.Time) contentir.Document {
	descriptor := preparedSourceIRDescriptor(source)
	normalizedSourceText := normalizeReadableSourceText(source.Text)
	nodes := make([]contentir.Node, 0, len(source.Blocks))
	for index, block := range source.Blocks {
		nodes = append(nodes, preparedBlockToIRNode(descriptor, normalizedSourceText, block, index))
	}
	return newContentIRDocument(descriptor, generatedAt, nodes)
}

func preparedBlockToIRNode(
	descriptor contentIRSourceDescriptor,
	sourceText string,
	block NarrationBlock,
	index int,
) contentir.Node {
	locator := preparedBlockLocator(descriptor, sourceText, block, index)
	return contentir.Node{
		NodeID:         block.ID,
		ParentID:       "",
		OrderKey:       fmt.Sprintf("%08d", index+1),
		Kind:           string(block.Kind),
		Role:           string(block.Kind),
		DisplayText:    strings.TrimSpace(block.Text),
		NormalisedText: contentIRText(block.Text),
		SpeechText:     strings.TrimSpace(block.SpokenText),
		Lang:           "und",
		Script:         "Latn",
		Dir:            "ltr",
		Provenance:     contentir.NewProvenance(descriptor.Format, descriptor.ID, locator, block.StartOffset, block.EndOffset),
		UI:             preparedBlockUIHints(block),
		Speech: contentir.SpeechMetadata{
			PolicyHint: contentir.NewSpeechPolicyHint(
				string(block.SpeakMode),
				block.Emphasis,
				block.PauseBeforeMS,
				block.PauseAfterMS,
			),
		},
		Warnings:       contentIRStringSlice(block.Warnings),
		Confidence:     block.Confidence,
		Rights:         contentir.UnknownRights(),
		AdapterVersion: descriptor.AdapterVersion,
	}
}

func preparedBlockLocator(
	descriptor contentIRSourceDescriptor,
	sourceText string,
	block NarrationBlock,
	index int,
) contentir.Locator {
	if descriptor.Format == "html" {
		return contentir.NewHTMLLocator(descriptor.Name, "", textQuote(block.Text), nil, "")
	}
	lineStart, lineEnd, columnStart, columnEnd := lineColumnRange(sourceText, block.StartOffset, block.EndOffset)
	return contentir.NewMarkdownLocator(
		descriptor.Name,
		lineStart,
		lineEnd,
		columnStart,
		columnEnd,
		fmt.Sprintf("/blocks/%d", index),
	)
}

func preparedBlockUIHints(block NarrationBlock) contentir.UIHints {
	hints := contentir.DefaultUIHints("linear")
	if len(block.Segments) > 0 {
		hints.HighlightUnitHint = "segment"
	}
	return hints
}

func lineColumnRange(text string, startOffset int, endOffset int) (int, int, int, int) {
	if startOffset < 0 {
		startOffset = 0
	}
	if endOffset < startOffset {
		endOffset = startOffset
	}
	lineStart, columnStart := lineColumnAtOffset(text, startOffset)
	lineEnd, columnEnd := lineColumnAtOffset(text, endOffset)
	return lineStart, lineEnd, columnStart, columnEnd
}

func lineColumnAtOffset(text string, offset int) (int, int) {
	line := 1
	column := 1
	for index, r := range text {
		if index >= offset {
			break
		}
		if r == '\n' {
			line++
			column = 1
			continue
		}
		column++
	}
	return line, column
}

func textQuote(value string) string {
	const maxRunes = 120
	return truncateString(contentIRText(value), maxRunes)
}
