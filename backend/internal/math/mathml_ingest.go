package speechmath

import (
	"html"
	"regexp"
	"strings"
)

var (
	mathMLTagPattern = regexp.MustCompile(`(?s)<[^>]+>`)
	spacePattern     = regexp.MustCompile(`\s+`)
)

func Ingest(input string) string {
	clean := strings.TrimSpace(input)
	clean = strings.TrimPrefix(clean, "$$")
	clean = strings.TrimSuffix(clean, "$$")
	clean = strings.TrimPrefix(clean, "$")
	clean = strings.TrimSuffix(clean, "$")
	if strings.Contains(clean, "<") && strings.Contains(clean, ">") {
		clean = mathMLTagPattern.ReplaceAllString(clean, " ")
		clean = html.UnescapeString(clean)
	}
	clean = strings.NewReplacer("\\left", "", "\\right", "", "\\,", " ").Replace(clean)
	return strings.TrimSpace(spacePattern.ReplaceAllString(clean, " "))
}
