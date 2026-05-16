package speechmath

import (
	"regexp"
	"strings"
)

type PreviewResult struct {
	Input        string   `json:"input"`
	Normalized   string   `json:"normalized"`
	Speech       string   `json:"speech"`
	Source       string   `json:"source"`
	PreviewMath  string   `json:"previewMath,omitempty"`
	Warnings     []string `json:"warnings,omitempty"`
	ToolOptional bool     `json:"toolOptional"`
}

var (
	fracPattern  = regexp.MustCompile(`\\frac\{([^{}]+)\}\{([^{}]+)\}`)
	sqrtPattern  = regexp.MustCompile(`\\sqrt\{([^{}]+)\}`)
	powerPattern = regexp.MustCompile(`([A-Za-z0-9]+)\s*\^\s*\{?([A-Za-z0-9+\-]+)\}?`)
)

func Preview(input string) PreviewResult {
	normalized := Ingest(input)
	speech := Verbalise(normalized)
	return PreviewResult{
		Input:        input,
		Normalized:   normalized,
		Speech:       speech,
		Source:       "deterministic-fallback",
		PreviewMath:  normalized,
		Warnings:     []string{"mathcat_optional"},
		ToolOptional: true,
	}
}

func Verbalise(input string) string {
	clean := Ingest(input)
	if clean == "" {
		return ""
	}
	clean = fracPattern.ReplaceAllString(clean, " fraction $1 over $2 ")
	clean = sqrtPattern.ReplaceAllString(clean, " square root of $1 ")
	clean = powerPattern.ReplaceAllString(clean, "$1 to the power of $2")
	replacer := strings.NewReplacer(
		"\\alpha", " alpha ",
		"\\beta", " beta ",
		"\\gamma", " gamma ",
		"\\Delta", " delta ",
		"\\pi", " pi ",
		"≤", " less than or equal to ",
		">=", " greater than or equal to ",
		"<=", " less than or equal to ",
		"=", " equals ",
		"+", " plus ",
		"-", " minus ",
		"*", " times ",
		"×", " times ",
		"/", " divided by ",
		"(", " open parenthesis ",
		")", " close parenthesis ",
	)
	clean = replacer.Replace(clean)
	clean = strings.Join(strings.Fields(clean), " ")
	return "Math expression: " + clean + "."
}
