package normalise

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Decision struct {
	Kind        string `json:"kind"`
	Original    string `json:"original"`
	Spoken      string `json:"spoken"`
	Rule        string `json:"rule"`
	StartOffset int    `json:"startOffset"`
	EndOffset   int    `json:"endOffset"`
}

var (
	currencyPattern  = regexp.MustCompile(`(?i)(£|\$|€)\s?([0-9]+(?:[.,][0-9]{1,2})?)`)
	isoDatePattern   = regexp.MustCompile(`\b([12][0-9]{3})-([01][0-9])-([0-3][0-9])\b`)
	slashDatePattern = regexp.MustCompile(`\b([0-3]?[0-9])/([01]?[0-9])/([12][0-9]{3})\b`)
	percentPattern   = regexp.MustCompile(`\b([0-9]+(?:[.,][0-9]+)?)%`)
	decimalPattern   = regexp.MustCompile(`\b[0-9]+[.,][0-9]+\b`)
	integerPattern   = regexp.MustCompile(`\b[0-9]{1,6}\b`)
	spacePattern     = regexp.MustCompile(`\s+`)
)

func NormalizeNumbersDatesCurrency(input string, locale string) (string, []Decision) {
	locale = NormalizeLocale(locale)
	output := input
	decisions := make([]Decision, 0)
	output, decisions = replaceWithDecision(output, currencyPattern, decisions, "currency", func(value string) string {
		matches := currencyPattern.FindStringSubmatch(value)
		if len(matches) != 3 {
			return value
		}
		return speakCurrency(matches[1], matches[2], locale)
	})
	output, decisions = replaceWithDecision(output, isoDatePattern, decisions, "date", func(value string) string {
		parsed, err := time.Parse("2006-01-02", value)
		if err != nil {
			return value
		}
		return speakDate(parsed, locale)
	})
	output, decisions = replaceWithDecision(output, slashDatePattern, decisions, "date", func(value string) string {
		matches := slashDatePattern.FindStringSubmatch(value)
		if len(matches) != 4 {
			return value
		}
		day, _ := strconv.Atoi(matches[1])
		month, _ := strconv.Atoi(matches[2])
		year, _ := strconv.Atoi(matches[3])
		parsed := time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
		if parsed.Day() != day || int(parsed.Month()) != month {
			return value
		}
		return speakDate(parsed, locale)
	})
	output, decisions = replaceWithDecision(output, percentPattern, decisions, "percent", func(value string) string {
		unit := "percent"
		if LocaleLanguage(locale) == "sv" {
			unit = "procent"
		}
		return speakDecimal(strings.TrimSuffix(value, "%"), locale) + " " + unit
	})
	output, decisions = replaceWithDecision(output, decimalPattern, decisions, "number", func(value string) string {
		return speakDecimal(value, locale)
	})
	output, decisions = replaceWithDecision(output, integerPattern, decisions, "number", func(value string) string {
		number, err := strconv.Atoi(value)
		if err != nil {
			return value
		}
		return speakInteger(number, locale)
	})
	output = strings.TrimSpace(spacePattern.ReplaceAllString(output, " "))
	return output, decisions
}

func replaceWithDecision(input string, pattern *regexp.Regexp, decisions []Decision, kind string, speak func(string) string) (string, []Decision) {
	matches := pattern.FindAllStringIndex(input, -1)
	if len(matches) == 0 {
		return input, decisions
	}
	var builder strings.Builder
	cursor := 0
	for _, match := range matches {
		original := input[match[0]:match[1]]
		spoken := speak(original)
		builder.WriteString(input[cursor:match[0]])
		builder.WriteString(spoken)
		if spoken != original {
			decisions = append(decisions, Decision{
				Kind:        kind,
				Original:    original,
				Spoken:      spoken,
				Rule:        "locale-" + kind,
				StartOffset: match[0],
				EndOffset:   match[1],
			})
		}
		cursor = match[1]
	}
	builder.WriteString(input[cursor:])
	return builder.String(), decisions
}

func speakCurrency(symbol string, value string, locale string) string {
	unit := map[string]string{"£": "pounds", "$": "dollars", "€": "euros"}[symbol]
	fractionUnit := map[string]string{"£": "pence", "$": "cents", "€": "cents"}[symbol]
	if LocaleLanguage(locale) == "sv" {
		unit = map[string]string{"£": "pund", "$": "dollar", "€": "euro"}[symbol]
		fractionUnit = map[string]string{"£": "pence", "$": "cent", "€": "cent"}[symbol]
	}
	parts := strings.FieldsFunc(value, func(r rune) bool { return r == '.' || r == ',' })
	if len(parts) == 2 && len(parts[1]) == 2 {
		major, majorErr := strconv.Atoi(parts[0])
		minor, minorErr := strconv.Atoi(parts[1])
		if majorErr == nil && minorErr == nil && minor > 0 {
			return speakInteger(major, locale) + " " + unit + " " + speakInteger(minor, locale) + " " + fractionUnit
		}
	}
	return speakDecimal(value, locale) + " " + unit
}

func speakDate(value time.Time, locale string) string {
	monthsEN := []string{"", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"}
	monthsSV := []string{"", "januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"}
	if LocaleLanguage(locale) == "sv" {
		return speakInteger(value.Day(), locale) + " " + monthsSV[value.Month()] + " " + speakInteger(value.Year(), locale)
	}
	return ordinal(value.Day()) + " " + monthsEN[value.Month()] + " " + speakInteger(value.Year(), locale)
}

func speakDecimal(value string, locale string) string {
	separator := " point "
	if LocaleLanguage(locale) == "sv" {
		separator = " komma "
	}
	parts := strings.FieldsFunc(value, func(r rune) bool { return r == '.' || r == ',' })
	if len(parts) != 2 {
		number, err := strconv.Atoi(value)
		if err != nil {
			return value
		}
		return speakInteger(number, locale)
	}
	left, _ := strconv.Atoi(parts[0])
	rightDigits := make([]string, 0, len(parts[1]))
	for _, digit := range parts[1] {
		rightDigits = append(rightDigits, speakInteger(int(digit-'0'), locale))
	}
	return speakInteger(left, locale) + separator + strings.Join(rightDigits, " ")
}

func speakInteger(number int, locale string) string {
	if LocaleLanguage(locale) == "sv" {
		return speakIntegerSV(number)
	}
	return speakIntegerEN(number)
}

func ordinal(day int) string {
	if day >= 11 && day <= 13 {
		return speakIntegerEN(day) + "th"
	}
	switch day % 10 {
	case 1:
		return speakIntegerEN(day) + "st"
	case 2:
		return speakIntegerEN(day) + "nd"
	case 3:
		return speakIntegerEN(day) + "rd"
	default:
		return speakIntegerEN(day) + "th"
	}
}
