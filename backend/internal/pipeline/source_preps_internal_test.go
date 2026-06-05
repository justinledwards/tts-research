package pipeline

import (
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/sourceprep"
)

func TestHackerNewsItemID(t *testing.T) {
	t.Parallel()

	parsed, err := url.Parse("https://news.ycombinator.com/item?id=48135782")
	if err != nil {
		t.Fatal(err)
	}
	id, ok := hackerNewsItemID(parsed)
	if !ok || id != "48135782" {
		t.Fatalf("hackerNewsItemID() = %q, %v; want 48135782, true", id, ok)
	}

	parsed, err = url.Parse("https://news.ycombinator.com/item?id=oops")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := hackerNewsItemID(parsed); ok {
		t.Fatalf("hackerNewsItemID() accepted non-numeric id")
	}
}

func TestHackerNewsItemMarkdown(t *testing.T) {
	t.Parallel()

	markdown := hackerNewsItemMarkdown(hackerNewsAlgoliaItem{
		Title:  "Example Story",
		URL:    "https://example.com/story",
		Author: "alice",
		Points: 42,
		Text:   "<p>Top text</p>",
		Children: []hackerNewsAlgoliaItem{{
			Author: "bob",
			Text:   "First <b>comment</b>",
			Children: []hackerNewsAlgoliaItem{{
				Author: "carol",
				Text:   "Nested reply",
			}},
		}},
	}, "https://news.ycombinator.com/item?id=1")

	for _, want := range []string{
		"# Example Story",
		"Story URL: https://example.com/story",
		"Author: alice",
		"Points: 42",
		"Top text",
		"## Comments",
		"bob: First comment",
		"> carol: Nested reply",
	} {
		if !strings.Contains(markdown, want) {
			t.Fatalf("markdown missing %q:\n%s", want, markdown)
		}
	}
}

func TestReferenceSectionsSkippedAcrossFallbackPreprocessors(t *testing.T) {
	t.Parallel()

	source := strings.Join([]string{
		"Deep Research Export",
		"",
		"The narrative section should remain available for speech.",
		"",
		"References",
		"<!-- deep-research-references:start -->",
		"",
		"one. https://opentelemetry.io/docs/what-is-opentelemetry/ two. https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf three. https://www.w3.org/TR/trace-context/",
		"",
		"<!-- deep-research-references:end -->",
		"",
		"[6](https://example.com/reference)",
		"",
		"iturn14image2turn14image5",
		"",
		"This paragraph follows the reference list and should still be spoken.",
	}, "\n")

	cases := []struct {
		name              string
		sourceName        string
		contentType       string
		markdownParseMode string
		wantFormat        string
	}{
		{
			name:              "plain paste",
			sourceName:        "Untitled source",
			contentType:       "text/plain",
			markdownParseMode: "strict",
			wantFormat:        "plain",
		},
		{
			name:              "legacy markdown",
			sourceName:        "deep-research.md",
			contentType:       "text/markdown",
			markdownParseMode: "legacy",
			wantFormat:        "markdown",
		},
		{
			name:              "strict markdown",
			sourceName:        "deep-research.md",
			contentType:       "text/markdown",
			markdownParseMode: "strict",
			wantFormat:        "markdown",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			result := preprocessReadableSource(source, tc.sourceName, tc.contentType, 0, tc.markdownParseMode, "")
			if result.SourceFormat != tc.wantFormat {
				t.Fatalf("source format = %q, want %q", result.SourceFormat, tc.wantFormat)
			}
			spoken := preparedSourceSpeechText(result.Blocks)
			if strings.Contains(spoken, "opentelemetry") || strings.Contains(spoken, "Shneiderman1996") || strings.Contains(spoken, "References") {
				t.Fatalf("reference section leaked into speech text: %q", spoken)
			}
			if strings.Contains(spoken, "turn14image") || regexp.MustCompile(`\b6\b`).MatchString(spoken) {
				t.Fatalf("standalone artifact or numeric reference leaked into speech text: %q", spoken)
			}
			if !strings.Contains(spoken, "The narrative section should remain available for speech.") ||
				!strings.Contains(spoken, "This paragraph follows the reference list and should still be spoken.") {
				t.Fatalf("spoken text lost body content: %q", spoken)
			}
			referenceBlocks := 0
			artifactBlocks := 0
			for _, block := range result.Blocks {
				if block.Kind == NarrationBlockKindReference {
					referenceBlocks += 1
					if block.SpeakMode != NarrationSpeakModeSkip || strings.TrimSpace(block.SpokenText) != "" {
						t.Fatalf("reference block = %#v, want skipped with empty spoken text", block)
					}
				}
				if block.Kind == NarrationBlockKindArtifact {
					artifactBlocks += 1
					if block.SpeakMode != NarrationSpeakModeSkip || strings.TrimSpace(block.SpokenText) != "" {
						t.Fatalf("artifact block = %#v, want skipped with empty spoken text", block)
					}
				}
			}
			if referenceBlocks == 0 {
				t.Fatalf("no reference blocks emitted: %#v", result.Blocks)
			}
			if artifactBlocks == 0 {
				t.Fatalf("no artifact token block emitted: %#v", result.Blocks)
			}
		})
	}

	t.Run("legacy markdown heading reference section", func(t *testing.T) {
		t.Parallel()

		headingSource := strings.Join([]string{
			"The opening paragraph should be spoken.",
			"",
			"# References",
			"",
			"- https://example.com/research-paper",
			"- https://doi.org/10.1234/example",
			"",
			"The next section resumes normal narration.",
		}, "\n")
		result := preprocessReadableSource(headingSource, "references.md", "text/markdown", 0, "legacy", "")
		spoken := preparedSourceSpeechText(result.Blocks)
		if strings.Contains(spoken, "References") || strings.Contains(spoken, "example.com") || strings.Contains(spoken, "doi.org") {
			t.Fatalf("heading reference section leaked into speech text: %q", spoken)
		}
		if !strings.Contains(spoken, "The opening paragraph should be spoken.") ||
			!strings.Contains(spoken, "The next section resumes normal narration.") {
			t.Fatalf("spoken text lost body content: %q", spoken)
		}
		referenceBlocks := 0
		for _, block := range result.Blocks {
			if block.Kind == NarrationBlockKindReference {
				referenceBlocks += 1
			}
		}
		if referenceBlocks == 0 {
			t.Fatalf("no reference blocks emitted for heading reference section: %#v", result.Blocks)
		}
	})
}

func TestReferenceCueLeakSanitizerCleansStalePreparedBlocks(t *testing.T) {
	t.Parallel()

	bodyWithInlineCitation := newNarrationBlock(8, NarrationBlockKindBody, NarrationSpeakModeSpeak, "Body", "Noise and false alarms directly undermine trust. [43]", "Noise and false alarms directly undermine trust. forty three", 288, 340, 0)
	bodyWithInlineCitation.Warnings = append(bodyWithInlineCitation.Warnings, "citation_removed")
	bodyWithInlineCitation.Metadata = map[string]any{
		"policySpeechText": "Noise and false alarms directly undermine trust. forty three",
	}
	source := PreparedSource{
		Blocks: []NarrationBlock{
			newNarrationBlock(0, NarrationBlockKindBody, NarrationSpeakModeSpeak, "Intro", "Intro body.", "Intro body.", 0, 11, 0),
			newNarrationBlock(1, NarrationBlockKindBody, NarrationSpeakModeSpeak, "Heading", "## References", "## References", 12, 25, 0),
			newNarrationBlock(2, NarrationBlockKindEmbedded, NarrationSpeakModeSpeak, "Marker", "<!-- deep-research-references:start -->", "<!-- deep-research-references:start -->", 26, 66, 0),
			newNarrationBlock(3, NarrationBlockKindBody, NarrationSpeakModeSpeak, "References", "one. https://opentelemetry.io/docs/what-is-opentelemetry/ thirty four. https://wwwcdn.imo.org/example.pdf", "one. https://opentelemetry.io/docs/what-is-opentelemetry/ thirty four. https://wwwcdn.imo.org/example.pdf", 67, 174, 0),
			newNarrationBlock(4, NarrationBlockKindReference, NarrationSpeakModeSpeak, "Reference", "[34](https://example.com/reference)", "thirty four", 175, 210, 0),
			newNarrationBlock(5, NarrationBlockKindArtifact, NarrationSpeakModeSpeak, "Artifact", "iturn14image2", "iturn14image2", 211, 230, 0),
			newNarrationBlock(6, NarrationBlockKindEmbedded, NarrationSpeakModeSpeak, "Marker", "<!-- deep-research-references:end -->", "<!-- deep-research-references:end -->", 231, 269, 0),
			newNarrationBlock(7, NarrationBlockKindBody, NarrationSpeakModeSpeak, "Body", "After references.", "After references.", 270, 287, 0),
			bodyWithInlineCitation,
			newNarrationBlock(9, NarrationBlockKindBody, NarrationSpeakModeSpeak, "Image token", "iturn14image2turn14image5turn15image8turn15image9", "iturn14image2turn14image5turn15image8turn15image9", 341, 410, 0),
		},
	}

	clean := sanitizePreparedSourceReferenceCueLeaks(source, 0)
	spoken := preparedSourceSpeechText(clean.Blocks)
	for _, forbidden := range []string{"## References", "opentelemetry", "thirty four", "turn14image", "forty three"} {
		if strings.Contains(spoken, forbidden) {
			t.Fatalf("stale reference leak %q remained in speech text: %q", forbidden, spoken)
		}
	}
	if !strings.Contains(spoken, "Intro body.") ||
		!strings.Contains(spoken, "After references.") ||
		!strings.Contains(spoken, "Noise and false alarms directly undermine trust.") {
		t.Fatalf("sanitizer removed body prose: %q", spoken)
	}
	for _, block := range clean.Blocks[1:7] {
		if block.SpeakMode != NarrationSpeakModeSkip || strings.TrimSpace(block.SpokenText) != "" || len(block.Segments) != 0 {
			t.Fatalf("block %#v should be skipped with no spoken text or segments", block)
		}
	}
	if block := clean.Blocks[9]; block.Kind != NarrationBlockKindArtifact || block.SpeakMode != NarrationSpeakModeSkip || strings.TrimSpace(block.SpokenText) != "" {
		t.Fatalf("standalone image token block = %#v, want skipped artifact", block)
	}
	if got := clean.Blocks[8].SpokenText; got != "Noise and false alarms directly undermine trust." {
		t.Fatalf("inline citation number tail = %q", got)
	}
	if got := metadataString(clean.Blocks[8].Metadata, "policySpeechText"); got != "Noise and false alarms directly undermine trust." {
		t.Fatalf("inline citation policy speech text = %q", got)
	}
}

func TestReadableHTMLPreprocessorFocusesArticleContent(t *testing.T) {
	t.Parallel()

	const title = "Amazon, Facebook, ICE, and the FBI have access to a private intelligence-sharing network operated by Seattle police"
	result := preprocessReadableSource(
		`<!doctype html>
<html>
  <head><title>Prism Justice Requires the Full Story</title></head>
  <body>
    <header><nav><a>Features</a><a>Opinion</a><a>Instagram</a></nav></header>
    <main>
      <article>
        <h1>`+title+`</h1>
        <p>Seattle Shield requests suspicious activity reports from local private companies.</p>
      </article>
    </main>
    <aside>Subscribe Donate Search</aside>
    <footer>Facebook Instagram</footer>
  </body>
</html>`,
		"https://prismreports.org/2026/05/20/seattle-shield-private-companies-surveillance/",
		"text/html",
		240,
		"legacy",
		"",
	)

	if result.PreprocessorVersion != "html-readable-v3" {
		t.Fatalf("preprocessor version = %q, want html-readable-v3", result.PreprocessorVersion)
	}
	if result.Title != title {
		t.Fatalf("title = %q, want article h1", result.Title)
	}
	spoken := preparedSourceSpeechText(result.Blocks)
	if !strings.Contains(spoken, "Seattle Shield requests suspicious activity reports") {
		t.Fatalf("spoken article text missing: %q", spoken)
	}
	for _, chrome := range []string{"Features", "Instagram", "Subscribe", "Donate"} {
		if strings.Contains(spoken, chrome) {
			t.Fatalf("spoken text contains page chrome %q: %q", chrome, spoken)
		}
	}
	quality, ok := result.Metadata["websiteExtractionQuality"].(sourceprep.HTMLExtractionQuality)
	if !ok {
		t.Fatalf("website extraction quality metadata missing: %#v", result.Metadata)
	}
	if quality.ArticleCandidateCount == 0 || quality.ExtractionConfidence == "" {
		t.Fatalf("quality metadata incomplete: %#v", quality)
	}
}

func TestClonePreparedSourceDetachesMutableBlockState(t *testing.T) {
	t.Parallel()

	original := PreparedSource{
		Warnings: []string{"source-warning"},
		Metadata: map[string]any{"title": "original"},
		Blocks: []NarrationBlock{{
			ID:       "block-1",
			Text:     "Hello",
			Warnings: []string{"block-warning"},
			Metadata: map[string]any{"policySpeechText": "Hello"},
			Segments: []NarrationSegment{{
				Index:    0,
				Text:     "Hello",
				Warnings: []string{"segment-warning"},
			}},
		}},
	}

	cloned := clonePreparedSource(original)
	cloned.Warnings[0] = "changed-source"
	cloned.Metadata["title"] = "changed"
	cloned.Blocks[0].Metadata["policySpeechText"] = "changed"
	cloned.Blocks[0].Warnings[0] = "changed-block"
	cloned.Blocks[0].Segments[0].Warnings[0] = "changed-segment"

	if original.Warnings[0] != "source-warning" {
		t.Fatalf("source warnings were shared")
	}
	if original.Metadata["title"] != "original" {
		t.Fatalf("source metadata was shared")
	}
	if original.Blocks[0].Metadata["policySpeechText"] != "Hello" {
		t.Fatalf("block metadata was shared")
	}
	if original.Blocks[0].Warnings[0] != "block-warning" {
		t.Fatalf("block warnings were shared")
	}
	if original.Blocks[0].Segments[0].Warnings[0] != "segment-warning" {
		t.Fatalf("segment warnings were shared")
	}
}
