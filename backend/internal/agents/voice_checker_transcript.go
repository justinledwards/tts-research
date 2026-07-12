package agents

import (
	"regexp"
	"strconv"
	"strings"
)

func compareVoiceTranscript(expectedText string, transcript string, provider string, threshold float64) VoiceCheckResult {
	expectedTokens := tokenizedWords(expectedText)
	transcriptTokens := tokenizedWords(transcript)
	if len(expectedTokens) == 0 || len(transcriptTokens) == 0 {
		return VoiceCheckResult{
			Complete:    false,
			Transcript:  transcript,
			NeedsResume: false,
			Reason:      "checker could not compare empty expected text or transcript",
			Provider:    provider,
			Similarity:  0,
		}
	}

	expectedNormalized := normalizedOnly(expectedTokens)
	transcriptNormalized := normalizedOnly(transcriptTokens)
	lcs := longestCommonSubsequenceLength(expectedNormalized, transcriptNormalized)
	similarity := float64(lcs) / float64(len(expectedNormalized))
	if relaxedSimilarity := similarityWithoutOptionalTokens(expectedNormalized, transcriptNormalized); relaxedSimilarity > similarity {
		similarity = relaxedSimilarity
	}
	if similarity >= threshold {
		return VoiceCheckResult{
			Complete:    true,
			Transcript:  transcript,
			NeedsResume: false,
			Reason:      "ASR transcript sufficiently matched optimized text",
			Provider:    provider,
			Similarity:  similarity,
		}
	}

	prefixLength := commonPrefixLength(expectedNormalized, transcriptNormalized)
	cleanCutoff := prefixLength > 0 &&
		prefixLength < len(expectedTokens) &&
		float64(prefixLength)/float64(len(transcriptTokens)) >= 0.65
	if cleanCutoff {
		return VoiceCheckResult{
			Complete:    false,
			Transcript:  transcript,
			ResumeText:  originalTextFromTokens(expectedTokens[prefixLength:]),
			NeedsResume: true,
			Reason:      "ASR transcript appears to be a clean cutoff; resume text was selected",
			Provider:    provider,
			Similarity:  similarity,
		}
	}

	return VoiceCheckResult{
		Complete:    false,
		Transcript:  transcript,
		NeedsResume: false,
		Reason:      "ASR transcript did not sufficiently match and did not look like a clean cutoff",
		Provider:    provider,
		Similarity:  similarity,
	}
}

type wordToken struct {
	Original   string
	Normalized string
}

func tokenizedWords(text string) []wordToken {
	fields := strings.Fields(spokenComparisonText(text))
	tokens := make([]wordToken, 0, len(fields))
	for _, field := range fields {
		normalized := normalizeSpokenWord(field)
		if normalized == "" {
			continue
		}
		if expanded := expandNormalizedWord(field, normalized); len(expanded) > 0 {
			for index, value := range expanded {
				original := field
				if index > 0 {
					original = ""
				}
				tokens = append(tokens, wordToken{Original: original, Normalized: value})
			}
			continue
		}

		tokens = append(tokens, wordToken{Original: field, Normalized: normalized})
	}

	return tokens
}

func normalizedOnly(tokens []wordToken) []string {
	values := make([]string, 0, len(tokens))
	for _, token := range tokens {
		values = append(values, token.Normalized)
	}

	return values
}

func similarityWithoutOptionalTokens(expected []string, transcript []string) float64 {
	filteredExpected := withoutOptionalComparisonTokens(expected)
	filteredTranscript := withoutOptionalComparisonTokens(transcript)
	if len(filteredExpected) == 0 || len(filteredTranscript) == 0 {
		return 0
	}

	lcs := longestCommonSubsequenceLength(filteredExpected, filteredTranscript)
	return float64(lcs) / float64(len(filteredExpected))
}

func withoutOptionalComparisonTokens(values []string) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := optionalComparisonTokens[value]; ok {
			continue
		}
		filtered = append(filtered, value)
	}

	return filtered
}

func originalTextFromTokens(tokens []wordToken) string {
	values := make([]string, 0, len(tokens))
	for _, token := range tokens {
		if token.Original == "" {
			continue
		}
		values = append(values, token.Original)
	}

	return strings.Join(values, " ")
}

func normalizeSpokenWord(value string) string {
	return nonWordPattern.ReplaceAllString(strings.ToLower(value), "")
}

func spokenComparisonText(text string) string {
	replaced := comparisonTLDRPattern.ReplaceAllString(text, " too long did not read ")
	replaced = comparisonUS3Pattern.ReplaceAllString(replaced, " U S ")
	replaced = comparisonWhoisPattern.ReplaceAllString(replaced, " who is ")
	replaced = comparisonDashPattern.ReplaceAllString(replaced, " ")
	replaced = comparisonItalicDomainPattern.ReplaceAllStringFunc(replaced, func(value string) string {
		match := comparisonItalicDomainPattern.FindStringSubmatch(value)
		if len(match) != 2 {
			return value
		}

		return spokenComparisonDomain("*." + match[1])
	})
	replaced = comparisonEmailPattern.ReplaceAllStringFunc(replaced, spokenComparisonEmail)
	replaced = comparisonDomainPattern.ReplaceAllStringFunc(replaced, spokenComparisonDomain)
	replaced = comparisonDotFragmentPattern.ReplaceAllStringFunc(replaced, spokenComparisonDotFragment)
	replaced = spokenSymbolReplacer.Replace(replaced)
	replaced = digitLetterBoundary.ReplaceAllString(replaced, "$1 $2")
	return letterDigitBoundary.ReplaceAllString(replaced, "$1 $2")
}

func spokenComparisonDotFragment(value string) string {
	match := comparisonDotFragmentPattern.FindStringSubmatch(value)
	if len(match) != 2 {
		return value
	}

	return " dot " + spokenComparisonDomainLabel(match[1], true, []string{match[1]})
}

func spokenComparisonEmail(value string) string {
	match := comparisonEmailPattern.FindStringSubmatch(value)
	if len(match) != 3 {
		return value
	}

	local := strings.NewReplacer(
		".", " dot ",
		"_", " underscore ",
		"-", " dash ",
		"+", " plus ",
	).Replace(match[1])

	return local + " at " + spokenComparisonDomain(match[2])
}

func spokenComparisonDomain(value string) string {
	domain := strings.Trim(value, ".,;:()[]{}<>\"'")
	wildcard := strings.HasPrefix(domain, "*.")
	domain = strings.TrimPrefix(domain, "*.")
	labels := strings.Split(domain, ".")
	words := make([]string, 0, len(labels)*2+2)
	if wildcard {
		words = append(words, "wildcard", "dot")
	}

	for index, label := range labels {
		if index > 0 {
			words = append(words, "dot")
		}
		words = append(words, spokenComparisonDomainLabel(label, index == len(labels)-1, labels))
	}

	return strings.Join(words, " ")
}

func spokenComparisonDomainLabel(label string, isTLD bool, labels []string) string {
	normalized := strings.ToLower(label)
	if normalized == "us" {
		return "U S"
	}
	if len(normalized) == 2 && strings.EqualFold(labels[len(labels)-1], "us") {
		return strings.Join(strings.Split(strings.ToUpper(normalized), ""), " ")
	}
	if isTLD && (normalized == "io" || normalized == "co") {
		return strings.Join(strings.Split(strings.ToUpper(normalized), ""), " ")
	}

	return strings.ReplaceAll(normalized, "-", " dash ")
}

func expandNormalizedWord(original string, normalized string) []string {
	if values := expandComparisonAcronym(original, normalized); len(values) > 0 {
		return values
	}

	if values, ok := unitAliases[normalized]; ok {
		return values
	}

	number, err := strconv.Atoi(normalized)
	if err != nil {
		return nil
	}

	words := numberToWords(number)
	if words == "" {
		return nil
	}

	values := strings.Fields(words)
	for index, value := range values {
		values[index] = normalizeSpokenWord(value)
	}
	if len(values) == 1 && values[0] == normalizeSpokenWord(original) {
		return nil
	}

	return values
}

func expandComparisonAcronym(original string, normalized string) []string {
	if _, ok := comparisonAcronyms[normalized]; !ok {
		return nil
	}

	values := make([]string, 0, len(normalized))
	for _, value := range normalized {
		if value >= 'a' && value <= 'z' {
			values = append(values, string(value))
		}
	}

	return values
}

func numberToWords(value int) string {
	if value < 0 || value > 9999 {
		return ""
	}
	if value < 20 {
		return smallNumberWords[value]
	}
	if value < 100 {
		tens := value / 10
		remainder := value % 10
		if remainder == 0 {
			return tensNumberWords[tens]
		}

		return tensNumberWords[tens] + " " + smallNumberWords[remainder]
	}
	if value < 1000 {
		hundreds := value / 100
		remainder := value % 100
		if remainder == 0 {
			return smallNumberWords[hundreds] + " hundred"
		}

		return smallNumberWords[hundreds] + " hundred " + numberToWords(remainder)
	}

	thousands := value / 1000
	remainder := value % 1000
	if remainder == 0 {
		return smallNumberWords[thousands] + " thousand"
	}

	return smallNumberWords[thousands] + " thousand " + numberToWords(remainder)
}

func commonPrefixLength(left []string, right []string) int {
	limit := min(len(left), len(right))
	for index := 0; index < limit; index++ {
		if left[index] != right[index] {
			return index
		}
	}

	return limit
}

func longestCommonSubsequenceLength(left []string, right []string) int {
	if len(left) == 0 || len(right) == 0 {
		return 0
	}

	previous := make([]int, len(right)+1)
	current := make([]int, len(right)+1)
	for _, leftValue := range left {
		for rightIndex, rightValue := range right {
			if leftValue == rightValue {
				current[rightIndex+1] = previous[rightIndex] + 1
			} else {
				current[rightIndex+1] = max(current[rightIndex], previous[rightIndex+1])
			}
		}
		previous, current = current, previous
		for index := range current {
			current[index] = 0
		}
	}

	return previous[len(right)]
}

var (
	nonWordPattern                = regexp.MustCompile(`[^a-z0-9]+`)
	digitLetterBoundary           = regexp.MustCompile(`([0-9])([A-Za-z])`)
	letterDigitBoundary           = regexp.MustCompile(`([A-Za-z])([0-9])`)
	comparisonTLDRPattern         = regexp.MustCompile(`(?i)\btl\s*;\s*dr\b`)
	comparisonUS3Pattern          = regexp.MustCompile(`(?i)\bus3\b`)
	comparisonWhoisPattern        = regexp.MustCompile(`(?i)\bwhois\b`)
	comparisonDashPattern         = regexp.MustCompile(`[-‐‑‒–—―]+`)
	comparisonDomainPattern       = regexp.MustCompile(`(?i)(\*\.)?([a-z0-9][a-z0-9-]*\.)+(us|org|com|net|edu|gov|io|dev|co)\b`)
	comparisonItalicDomainPattern = regexp.MustCompile(`(?i)\*((?:[a-z0-9][a-z0-9-]*\.)+(?:us|org|com|net|edu|gov|io|dev|co))\*`)
	comparisonEmailPattern        = regexp.MustCompile(`(?i)\b([a-z0-9._%+\-]+)@((?:[a-z0-9][a-z0-9-]*\.)+(?:us|org|com|net|edu|gov|io|dev|co))\b`)
	comparisonDotFragmentPattern  = regexp.MustCompile(`(?i)\.([a-z]{2,4})\b`)
	spokenSymbolReplacer          = strings.NewReplacer(
		"%", " percent ",
		"+", " plus ",
		"=", " equals ",
		"&", " and ",
	)
	comparisonAcronyms = map[string]struct{}{
		"asr":   {},
		"aws":   {},
		"cpu":   {},
		"dns":   {},
		"faq":   {},
		"ftp":   {},
		"gpu":   {},
		"html":  {},
		"http":  {},
		"https": {},
		"ip":    {},
		"tld":   {},
		"tts":   {},
		"url":   {},
		"us":    {},
		"usb":   {},
		"wa":    {},
	}
	optionalComparisonTokens = map[string]struct{}{
		"dash": {},
		"dot":  {},
	}
	unitAliases = map[string][]string{
		"gb":  {"gigabytes"},
		"kb":  {"kilobytes"},
		"mb":  {"megabytes"},
		"ms":  {"milliseconds"},
		"sec": {"seconds"},
		"tb":  {"terabytes"},
	}
	smallNumberWords = []string{
		"zero",
		"one",
		"two",
		"three",
		"four",
		"five",
		"six",
		"seven",
		"eight",
		"nine",
		"ten",
		"eleven",
		"twelve",
		"thirteen",
		"fourteen",
		"fifteen",
		"sixteen",
		"seventeen",
		"eighteen",
		"nineteen",
	}
	tensNumberWords = []string{
		"",
		"",
		"twenty",
		"thirty",
		"forty",
		"fifty",
		"sixty",
		"seventy",
		"eighty",
		"ninety",
	}
)
