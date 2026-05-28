package sourceprep

import (
	"sort"
	"strings"

	xhtml "golang.org/x/net/html"
)

type HTMLQualityOptions struct {
	PreferredContainer string
}

type HTMLAnalysis struct {
	ReadableText string
	Quality      HTMLExtractionQuality
}

type HTMLExtractionQuality struct {
	ArticleCandidateCount     int                      `json:"articleCandidateCount"`
	ChosenContainer           string                   `json:"chosenContainer"`
	ReadableTextRatio         float64                  `json:"readableTextRatio"`
	ChromeTextRatio           float64                  `json:"chromeTextRatio"`
	LinkDensity               float64                  `json:"linkDensity"`
	HeadingDepth              int                      `json:"headingDepth"`
	SkippedBlockCount         int                      `json:"skippedBlockCount"`
	NarrationBlockCount       int                      `json:"narrationBlockCount"`
	ExtractionConfidence      string                   `json:"extractionConfidence"`
	ExtractionConfidenceScore float64                  `json:"extractionConfidenceScore"`
	ArticleUncertain          bool                     `json:"articleUncertain,omitempty"`
	AlternateContainers       []HTMLContainerCandidate `json:"alternateContainers,omitempty"`
	SkippedBlocks             []HTMLSkippedBlock       `json:"skippedBlocks,omitempty"`
}

type HTMLContainerCandidate struct {
	Selector    string  `json:"selector"`
	Label       string  `json:"label"`
	Reason      string  `json:"reason"`
	WordCount   int     `json:"wordCount"`
	LinkDensity float64 `json:"linkDensity"`
	Score       float64 `json:"score"`
}

type HTMLSkippedBlock struct {
	Kind      string `json:"kind"`
	Selector  string `json:"selector"`
	Reason    string `json:"reason"`
	Text      string `json:"text"`
	WordCount int    `json:"wordCount"`
}

type htmlCandidate struct {
	node        *xhtml.Node
	public      HTMLContainerCandidate
	score       float64
	heading     int
	readable    string
	readableWds int
	linkWords   int
}

var readableClassPattern = regexp.MustCompile(`(?i)(article|post|entry-content|story|main-content|content-body|docs-content|documentation|prose|readable|article-body|blog-post)`)
var chromeClassPattern = regexp.MustCompile(`(?i)(nav|menu|breadcrumb|header|footer|aside|sidebar|social|share|newsletter|subscribe|promo|advert|ad-|comments?|related|cookie|modal|drawer|search)`)

func AnalyzeHTMLQuality(input string, options HTMLQualityOptions) HTMLAnalysis {
	root, err := xhtml.Parse(strings.NewReader(input))
	if err != nil {
		text := normalizeHTMLText(input)
		return HTMLAnalysis{
			ReadableText: text,
			Quality: HTMLExtractionQuality{
				ChosenContainer:           "document",
				ExtractionConfidence:      "low",
				ExtractionConfidenceScore: 0.25,
				ArticleUncertain:          true,
				NarrationBlockCount:       countNarrationParagraphs(text),
				ReadableTextRatio:         1,
			},
		}
	}

	body := findElement(root, "body")
	if body == nil {
		body = root
	}
	allText := visibleText(body, textOptions{})
	totalWords := countWords(allText)
	skippedBlocks := collectSkippedBlocks(body)
	chromeWords := 0
	for _, block := range skippedBlocks {
		chromeWords += block.WordCount
	}

	candidates := collectCandidates(body)
	articleCandidateCount := len(candidates)
	if len(candidates) == 0 {
		candidates = []htmlCandidate{candidateForNode(body, "body fallback", 12)}
	}
	sort.SliceStable(candidates, func(left int, right int) bool {
		return candidates[left].score > candidates[right].score
	})

	chosen := candidates[0]
	preferred := strings.TrimSpace(options.PreferredContainer)
	if preferred != "" {
		for _, candidate := range candidates {
			if candidate.public.Selector == preferred {
				chosen = candidate
				chosen.public.Reason = "preferred container override"
				break
			}
		}
	}

	readableText := strings.TrimSpace(chosen.readable)
	quality := HTMLExtractionQuality{
		ArticleCandidateCount: articleCandidateCount,
		ChosenContainer:       chosen.public.Selector,
		ReadableTextRatio:     ratio(chosen.readableWds, totalWords),
		ChromeTextRatio:       ratio(chromeWords, totalWords),
		LinkDensity:           ratio(chosen.linkWords, chosen.readableWds),
		HeadingDepth:          chosen.heading,
		SkippedBlockCount:     len(skippedBlocks),
		NarrationBlockCount:   countNarrationParagraphs(readableText),
		SkippedBlocks:         skippedBlocks,
	}
	quality.AlternateContainers = alternateContainers(candidates, chosen.public.Selector)
	quality.ExtractionConfidenceScore = extractionConfidenceScore(quality, candidates)
	quality.ExtractionConfidence = confidenceLabel(quality.ExtractionConfidenceScore)
	quality.ArticleUncertain = quality.ExtractionConfidence == "low"
	return HTMLAnalysis{ReadableText: readableText, Quality: quality}
}
func findElement(node *xhtml.Node, tag string) *xhtml.Node {
	if node == nil {
		return nil
	}
	if isElement(node) && strings.EqualFold(node.Data, tag) {
		return node
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if found := findElement(child, tag); found != nil {
			return found
		}
	}
	return nil
}
