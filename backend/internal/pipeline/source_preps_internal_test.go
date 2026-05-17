package pipeline

import (
	"net/url"
	"strings"
	"testing"
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
