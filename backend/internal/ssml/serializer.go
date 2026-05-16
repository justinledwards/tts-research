package ssml

import (
	"encoding/xml"
	"strings"
)

type Document struct {
	Text          string
	Lang          string
	LanguageSpans []LanguageSpan
	Substitutions []Substitution
}

type LanguageSpan struct {
	StartOffset int
	EndOffset   int
	Lang        string
}

type Substitution struct {
	StartOffset int
	EndOffset   int
	Original    string
	Alias       string
	Phoneme     string
	Alphabet    string
}

func Serialize(document Document) string {
	text := strings.TrimSpace(document.Text)
	if text == "" {
		return ""
	}
	lang := strings.TrimSpace(document.Lang)
	if lang == "" {
		lang = "en"
	}
	return `<speak version="1.1" xml:lang="` + escape(lang) + `">` + serializeText(text, document.Substitutions) + `</speak>`
}

func serializeText(text string, substitutions []Substitution) string {
	if len(substitutions) == 0 {
		return escape(text)
	}
	var builder strings.Builder
	cursor := 0
	for _, sub := range substitutions {
		if sub.StartOffset < cursor || sub.EndOffset > len(text) || sub.StartOffset >= sub.EndOffset {
			continue
		}
		builder.WriteString(escape(text[cursor:sub.StartOffset]))
		original := text[sub.StartOffset:sub.EndOffset]
		alias := strings.TrimSpace(sub.Alias)
		if alias == "" {
			alias = strings.TrimSpace(sub.Phoneme)
		}
		if alias == "" {
			builder.WriteString(escape(original))
		} else {
			builder.WriteString(`<sub alias="` + escape(alias) + `">` + escape(original) + `</sub>`)
		}
		cursor = sub.EndOffset
	}
	builder.WriteString(escape(text[cursor:]))
	return builder.String()
}

func Plain(document Document) string {
	return strings.TrimSpace(document.Text)
}

func escape(value string) string {
	var builder strings.Builder
	_ = xml.EscapeText(&builder, []byte(value))
	return builder.String()
}
