package normalise

import (
	"strings"
	"unicode"
)

const (
	DefaultLocale = "en-GB"
	DefaultLang   = "en"
	UnknownLang   = "und"
)

type LanguageSpan struct {
	StartOffset int     `json:"startOffset"`
	EndOffset   int     `json:"endOffset"`
	Text        string  `json:"text"`
	Lang        string  `json:"lang"`
	Script      string  `json:"script"`
	Confidence  float64 `json:"confidence"`
	Source      string  `json:"source"`
}

func DetectLanguageSpans(text string, fallback string) []LanguageSpan {
	cleanFallback := NormalizeLanguage(fallback)
	if cleanFallback == "" || cleanFallback == UnknownLang {
		cleanFallback = DefaultLang
	}
	chunks := splitLanguageChunks(text)
	if len(chunks) == 0 {
		return nil
	}
	spans := make([]LanguageSpan, 0, len(chunks))
	for _, chunk := range chunks {
		lang, script, confidence := detectChunkLanguage(chunk.text, cleanFallback)
		if len(spans) > 0 {
			last := &spans[len(spans)-1]
			if last.Lang == lang && last.Script == script {
				last.EndOffset = chunk.end
				last.Text += chunk.text
				if confidence < last.Confidence {
					last.Confidence = confidence
				}
				continue
			}
		}
		spans = append(spans, LanguageSpan{
			StartOffset: chunk.start,
			EndOffset:   chunk.end,
			Text:        chunk.text,
			Lang:        lang,
			Script:      script,
			Confidence:  confidence,
			Source:      "heuristic",
		})
	}
	return spans
}

func DominantLanguage(spans []LanguageSpan, fallback string) string {
	counts := map[string]int{}
	bestLang := NormalizeLanguage(fallback)
	bestCount := 0
	for _, span := range spans {
		lang := NormalizeLanguage(span.Lang)
		if lang == "" || lang == UnknownLang {
			continue
		}
		counts[lang] += runeLen(span.Text)
		if counts[lang] > bestCount {
			bestLang = lang
			bestCount = counts[lang]
		}
	}
	if bestLang == "" || bestLang == UnknownLang {
		return DefaultLang
	}
	return bestLang
}

func NormalizeLocale(locale string) string {
	clean := strings.TrimSpace(locale)
	if clean == "" {
		return DefaultLocale
	}
	clean = strings.ReplaceAll(clean, "_", "-")
	parts := strings.Split(clean, "-")
	if len(parts) == 1 {
		switch strings.ToLower(parts[0]) {
		case "sv":
			return "sv-SE"
		case "en":
			return DefaultLocale
		default:
			return strings.ToLower(parts[0])
		}
	}
	lang := strings.ToLower(parts[0])
	region := strings.ToUpper(parts[1])
	return lang + "-" + region
}

func NormalizeLanguage(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	if clean == "" {
		return ""
	}
	clean = strings.ReplaceAll(clean, "_", "-")
	if index := strings.Index(clean, "-"); index > 0 {
		clean = clean[:index]
	}
	return clean
}

func LocaleLanguage(locale string) string {
	lang := NormalizeLanguage(locale)
	if lang == "" {
		return DefaultLang
	}
	return lang
}

type languageChunk struct {
	start int
	end   int
	text  string
}

func splitLanguageChunks(text string) []languageChunk {
	chunks := make([]languageChunk, 0)
	start := -1
	last := 0
	for offset, value := range text {
		if start < 0 && !unicode.IsSpace(value) {
			start = offset
		}
		last = offset + len(string(value))
		if value == '.' || value == '!' || value == '?' || value == ';' || value == '\n' {
			if start >= 0 {
				chunks = append(chunks, languageChunk{start: start, end: last, text: text[start:last]})
				start = -1
			}
		}
	}
	if start >= 0 {
		chunks = append(chunks, languageChunk{start: start, end: len(text), text: text[start:]})
	}
	return chunks
}

func detectChunkLanguage(text string, fallback string) (string, string, float64) {
	if hasRuneIn(text, '\u0400', '\u04FF') {
		return "ru", "Cyrl", 0.82
	}
	if hasRuneIn(text, '\u3040', '\u30FF') {
		return "ja", "Jpan", 0.9
	}
	if hasRuneIn(text, '\u4E00', '\u9FFF') {
		return "zh", "Hans", 0.78
	}
	if hasRuneIn(text, '\uAC00', '\uD7AF') {
		return "ko", "Kore", 0.9
	}
	lower := strings.ToLower(text)
	switch {
	case strings.ContainsAny(lower, "åäö") || containsAnyWord(lower, []string{" och ", " är ", " det ", " som ", " inte "}):
		return "sv", "Latn", 0.76
	case strings.ContainsAny(lower, "éèêëàùç") || containsAnyWord(lower, []string{" le ", " la ", " les ", " une ", " des "}):
		return "fr", "Latn", 0.7
	case strings.ContainsAny(lower, "ñ¿¡") || containsAnyWord(lower, []string{" el ", " la ", " los ", " que ", " una "}):
		return "es", "Latn", 0.7
	case strings.ContainsAny(lower, "äöüß") || containsAnyWord(lower, []string{" der ", " die ", " das ", " und ", " nicht "}):
		return "de", "Latn", 0.72
	default:
		return fallback, scriptForLanguage(fallback), 0.52
	}
}

func scriptForLanguage(lang string) string {
	switch NormalizeLanguage(lang) {
	case "ru", "uk", "bg":
		return "Cyrl"
	case "ja":
		return "Jpan"
	case "ko":
		return "Kore"
	case "zh":
		return "Hans"
	case "ar":
		return "Arab"
	default:
		return "Latn"
	}
}

func hasRuneIn(text string, first rune, last rune) bool {
	for _, value := range text {
		if value >= first && value <= last {
			return true
		}
	}
	return false
}

func containsAnyWord(text string, words []string) bool {
	padded := " " + text + " "
	for _, word := range words {
		if strings.Contains(padded, word) {
			return true
		}
	}
	return false
}

func runeLen(text string) int {
	count := 0
	for range text {
		count++
	}
	return count
}
