package sourceprep

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAnalyzeHTMLQualityCleanArticle(t *testing.T) {
	t.Parallel()

	analysis := analyzeFixture(t, "clean_article.html", HTMLQualityOptions{})

	if analysis.Quality.ArticleCandidateCount != 1 {
		t.Fatalf("candidate count = %d, want 1", analysis.Quality.ArticleCandidateCount)
	}
	if !strings.Contains(analysis.Quality.ChosenContainer, "article#clean-story") {
		t.Fatalf("chosen container = %q, want article#clean-story", analysis.Quality.ChosenContainer)
	}
	if analysis.Quality.ExtractionConfidence != "high" {
		t.Fatalf("confidence = %q, want high; quality=%#v", analysis.Quality.ExtractionConfidence, analysis.Quality)
	}
	if strings.Contains(analysis.ReadableText, "Subscribe") {
		t.Fatalf("readable text contains chrome: %q", analysis.ReadableText)
	}
}

func TestAnalyzeHTMLQualitySkipsChromeButKeepsArticle(t *testing.T) {
	t.Parallel()

	analysis := analyzeFixture(t, "cluttered_article.html", HTMLQualityOptions{})

	for _, chrome := range []string{"Instagram", "Subscribe to our newsletter", "Privacy Terms"} {
		if strings.Contains(analysis.ReadableText, chrome) {
			t.Fatalf("readable text contains skipped chrome %q: %q", chrome, analysis.ReadableText)
		}
	}
	if !strings.Contains(analysis.ReadableText, "clear lead paragraph") {
		t.Fatalf("article lead missing from readable text: %q", analysis.ReadableText)
	}
	if analysis.Quality.SkippedBlockCount < 3 {
		t.Fatalf("skipped block count = %d, want at least 3", analysis.Quality.SkippedBlockCount)
	}
	if analysis.Quality.ChromeTextRatio <= 0 {
		t.Fatalf("chrome ratio = %f, want positive", analysis.Quality.ChromeTextRatio)
	}
}

func TestAnalyzeHTMLQualityHandlesDocsSidebarAndArticleLikeContainers(t *testing.T) {
	t.Parallel()

	docs := analyzeFixture(t, "docs_with_sidebar.html", HTMLQualityOptions{})
	if strings.Contains(docs.ReadableText, "Install Overview CLI") {
		t.Fatalf("docs sidebar leaked into readable text: %q", docs.ReadableText)
	}
	if docs.Quality.HeadingDepth != 1 {
		t.Fatalf("docs heading depth = %d, want 1", docs.Quality.HeadingDepth)
	}

	noArticle := analyzeFixture(t, "no_article_tag.html", HTMLQualityOptions{})
	if !strings.Contains(noArticle.Quality.ChosenContainer, "content-body") {
		t.Fatalf("chosen container = %q, want content-body", noArticle.Quality.ChosenContainer)
	}
	if noArticle.Quality.ExtractionConfidence == "low" {
		t.Fatalf("article-like container should not be low confidence: %#v", noArticle.Quality)
	}
}

func TestAnalyzeHTMLQualitySupportsPreferredAlternateContainer(t *testing.T) {
	t.Parallel()

	analysis := analyzeFixture(t, "multi_article_listing.html", HTMLQualityOptions{})
	if analysis.Quality.ArticleCandidateCount < 3 {
		t.Fatalf("candidate count = %d, want at least 3", analysis.Quality.ArticleCandidateCount)
	}
	if analysis.Quality.ExtractionConfidence != "low" || !analysis.Quality.ArticleUncertain {
		t.Fatalf("listing confidence = %q uncertain=%v, want low uncertain", analysis.Quality.ExtractionConfidence, analysis.Quality.ArticleUncertain)
	}
	if len(analysis.Quality.AlternateContainers) == 0 {
		t.Fatalf("expected alternate containers for listing page")
	}

	overrideSelector := analysis.Quality.AlternateContainers[0].Selector
	override := analyzeFixture(t, "multi_article_listing.html", HTMLQualityOptions{
		PreferredContainer: overrideSelector,
	})
	if override.Quality.ChosenContainer != overrideSelector {
		t.Fatalf("override chose %q, want %q", override.Quality.ChosenContainer, overrideSelector)
	}
}

func TestAnalyzeHTMLQualityRecoversMalformedAndNewsletterBlocks(t *testing.T) {
	t.Parallel()

	malformed := analyzeFixture(t, "malformed.html.fixture", HTMLQualityOptions{})
	if !strings.Contains(malformed.ReadableText, "parser should still recover") {
		t.Fatalf("malformed readable text missing body: %q", malformed.ReadableText)
	}

	blog := analyzeFixture(t, "blog_newsletter.html", HTMLQualityOptions{})
	if strings.Contains(blog.ReadableText, "mailing list") {
		t.Fatalf("newsletter block leaked into readable text: %q", blog.ReadableText)
	}
	if blog.Quality.SkippedBlockCount == 0 {
		t.Fatalf("expected newsletter block to be inspectable")
	}
}

func analyzeFixture(t *testing.T, name string, options HTMLQualityOptions) HTMLAnalysis {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return AnalyzeHTMLQuality(string(data), options)
}
