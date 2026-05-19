package speechmath

import "strings"

type BrowserPreview struct {
	Markup   string   `json:"markup"`
	Speech   string   `json:"speech"`
	Source   string   `json:"source"`
	Warnings []string `json:"warnings,omitempty"`
}

func BrowserPreviewFallback(input string) BrowserPreview {
	preview := Preview(input)
	return BrowserPreview{
		Markup:   strings.TrimSpace(preview.PreviewMath),
		Speech:   preview.Speech,
		Source:   preview.Source,
		Warnings: preview.Warnings,
	}
}
