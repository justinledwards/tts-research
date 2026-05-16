package normalise

import (
	"regexp"
	"strings"
)

var acronymPattern = regexp.MustCompile(`\b[A-Z][A-Z0-9]{1,7}s?\b`)

var acronymAliases = map[string]string{
	"AI":     "A I",
	"API":    "A P I",
	"ASR":    "A S R",
	"CPU":    "C P U",
	"DOCX":   "doc x",
	"EPUB":   "e pub",
	"GPU":    "G P U",
	"HTML":   "H T M L",
	"IR":     "I R",
	"JSON":   "Jason",
	"MathML": "math M L",
	"OCR":    "O C R",
	"PDF":    "P D F",
	"PLS":    "P L S",
	"SRE":    "S R E",
	"SSML":   "S S M L",
	"TTS":    "T T S",
	"UI":     "U I",
	"URL":    "U R L",
	"UX":     "U X",
	"XML":    "X M L",
}

func NormalizeAcronyms(input string) (string, []Decision) {
	decisions := make([]Decision, 0)
	output, decisions := replaceWithDecision(input, acronymPattern, decisions, "acronym", func(value string) string {
		clean := strings.TrimSuffix(value, "s")
		if spoken, ok := acronymAliases[clean]; ok {
			if strings.HasSuffix(value, "s") && clean != value {
				return spoken + "s"
			}
			return spoken
		}
		return spellAcronym(value)
	})
	return output, decisions
}

func spellAcronym(value string) string {
	letters := make([]string, 0, len(value))
	for _, letter := range value {
		if letter >= 'A' && letter <= 'Z' {
			letters = append(letters, string(letter))
			continue
		}
		letters = append(letters, string(letter))
	}
	return strings.Join(letters, " ")
}
