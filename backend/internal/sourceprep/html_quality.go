package sourceprep

import (
	"fmt"
	"html"
	"math"
	"regexp"
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

func alternateContainers(candidates []htmlCandidate, chosenSelector string) []HTMLContainerCandidate {
	alternates := make([]HTMLContainerCandidate, 0)
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		item := candidate.public
		if item.Selector == "" || item.Selector == chosenSelector {
			continue
		}
		if _, ok := seen[item.Selector]; ok {
			continue
		}
		seen[item.Selector] = struct{}{}
		alternates = append(alternates, item)
		if len(alternates) >= 5 {
			break
		}
	}
	return alternates
}

func extractionConfidenceScore(quality HTMLExtractionQuality, candidates []htmlCandidate) float64 {
	score := 0.22
	score += clamp(quality.ReadableTextRatio, 0, 1) * 0.28
	score += (1 - clamp(quality.LinkDensity, 0, 1)) * 0.18
	score += (1 - clamp(quality.ChromeTextRatio, 0, 1)) * 0.12
	score += math.Min(float64(max(quality.NarrationBlockCount, 0))/8, 1) * 0.1
	if quality.ArticleCandidateCount > 0 {
		score += 0.08
	} else {
		score -= 0.16
	}
	if quality.HeadingDepth == 1 {
		score += 0.06
	} else if quality.HeadingDepth == 0 {
		score -= 0.05
	}
	if len(candidates) > 1 {
		gap := candidates[0].score - candidates[1].score
		if gap < 12 {
			score -= 0.22
		} else if gap < 32 {
			score -= 0.08
		}
	}
	if quality.ArticleCandidateCount >= 3 && quality.LinkDensity > 0.22 {
		score -= 0.16
	}
	return roundRatio(clamp(score, 0.05, 0.98))
}

func confidenceLabel(score float64) string {
	switch {
	case score >= 0.74:
		return "high"
	case score >= 0.5:
		return "medium"
	default:
		return "low"
	}
}

func collectCandidates(root *xhtml.Node) []htmlCandidate {
	candidates := make([]htmlCandidate, 0)
	seen := map[string]struct{}{}
	var walk func(*xhtml.Node)
	walk = func(node *xhtml.Node) {
		if node == nil {
			return
		}
		if isElement(node) && !isChromeNode(node) && !hasChromeAncestor(node) {
			if reason, baseScore, ok := candidateReason(node); ok {
				candidate := candidateForNode(node, reason, baseScore)
				if candidate.readableWds >= 12 {
					key := candidate.public.Selector
					if _, exists := seen[key]; !exists {
						seen[key] = struct{}{}
						candidates = append(candidates, candidate)
					}
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return candidates
}

func candidateForNode(node *xhtml.Node, reason string, baseScore float64) htmlCandidate {
	readable := visibleText(node, textOptions{skipChrome: true})
	readableWords := countWords(readable)
	linkWords := linkTextWords(node)
	linkDensity := ratio(linkWords, readableWords)
	heading := firstHeadingDepth(node)
	score := baseScore + math.Min(float64(readableWords), 1200)/12
	score -= linkDensity * 55
	if heading == 1 {
		score += 8
	} else if heading == 0 {
		score -= 5
	}
	selector := nodeSelector(node)
	return htmlCandidate{
		node:        node,
		score:       score,
		heading:     heading,
		readable:    readable,
		readableWds: readableWords,
		linkWords:   linkWords,
		public: HTMLContainerCandidate{
			Selector:    selector,
			Label:       candidateLabel(node, selector),
			Reason:      reason,
			WordCount:   readableWords,
			LinkDensity: linkDensity,
			Score:       roundRatio(score),
		},
	}
}

func candidateReason(node *xhtml.Node) (string, float64, bool) {
	tag := strings.ToLower(node.Data)
	identity := nodeIdentity(node)
	switch {
	case tag == "article":
		return "article element", 78, true
	case tag == "main":
		return "main element", 70, true
	case attrValue(node, "role") == "main":
		return "role=main", 68, true
	case readableClassPattern.MatchString(identity):
		return "article-like class or id", 58, true
	case (tag == "div" || tag == "section") && countWords(visibleText(node, textOptions{skipChrome: true})) >= 55:
		return "dense text container", 34, true
	default:
		return "", 0, false
	}
}

func collectSkippedBlocks(root *xhtml.Node) []HTMLSkippedBlock {
	blocks := make([]HTMLSkippedBlock, 0)
	var walk func(*xhtml.Node)
	walk = func(node *xhtml.Node) {
		if node == nil {
			return
		}
		if isElement(node) && isChromeNode(node) {
			text := visibleText(node, textOptions{})
			words := countWords(text)
			if words > 0 {
				blocks = append(blocks, HTMLSkippedBlock{
					Kind:      chromeKind(node),
					Selector:  nodeSelector(node),
					Reason:    chromeReason(node),
					Text:      truncateText(text, 260),
					WordCount: words,
				})
			}
			return
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return blocks
}

type textOptions struct {
	skipChrome bool
}

func visibleText(node *xhtml.Node, options textOptions) string {
	var parts []string
	var walk func(*xhtml.Node)
	walk = func(current *xhtml.Node) {
		if current == nil {
			return
		}
		if isElement(current) {
			tag := strings.ToLower(current.Data)
			if tag == "script" || tag == "style" || tag == "noscript" || tag == "template" {
				return
			}
			if options.skipChrome && isChromeNode(current) {
				return
			}
			if isBlockLike(tag) && len(parts) > 0 {
				parts = append(parts, "\n\n")
			}
		}
		if current.Type == xhtml.TextNode {
			text := normalizeWhitespace(html.UnescapeString(current.Data))
			if text != "" {
				parts = append(parts, text)
			}
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return normalizeParagraphText(strings.Join(parts, " "))
}

func linkTextWords(node *xhtml.Node) int {
	total := 0
	var walk func(*xhtml.Node)
	walk = func(current *xhtml.Node) {
		if current == nil {
			return
		}
		if isElement(current) && isChromeNode(current) {
			return
		}
		if isElement(current) && strings.EqualFold(current.Data, "a") {
			total += countWords(visibleText(current, textOptions{}))
			return
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return total
}

func firstHeadingDepth(node *xhtml.Node) int {
	depth := 0
	var walk func(*xhtml.Node)
	walk = func(current *xhtml.Node) {
		if current == nil || depth == 1 {
			return
		}
		if isElement(current) {
			tag := strings.ToLower(current.Data)
			if len(tag) == 2 && tag[0] == 'h' && tag[1] >= '1' && tag[1] <= '6' {
				level := int(tag[1] - '0')
				if depth == 0 || level < depth {
					depth = level
				}
			}
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return depth
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

func isChromeNode(node *xhtml.Node) bool {
	tag := strings.ToLower(node.Data)
	switch tag {
	case "nav", "header", "footer", "aside", "form", "dialog":
		return true
	}
	role := strings.ToLower(attrValue(node, "role"))
	switch role {
	case "navigation", "banner", "contentinfo", "complementary", "search":
		return true
	}
	return chromeClassPattern.MatchString(nodeIdentity(node))
}

func hasChromeAncestor(node *xhtml.Node) bool {
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		if isElement(parent) && isChromeNode(parent) {
			return true
		}
	}
	return false
}

func chromeKind(node *xhtml.Node) string {
	tag := strings.ToLower(node.Data)
	if tag == "aside" || strings.Contains(nodeIdentity(node), "sidebar") {
		return "sidebar"
	}
	if tag == "nav" || attrValue(node, "role") == "navigation" || strings.Contains(nodeIdentity(node), "menu") {
		return "navigation"
	}
	if strings.Contains(nodeIdentity(node), "social") || strings.Contains(nodeIdentity(node), "share") {
		return "social"
	}
	if strings.Contains(nodeIdentity(node), "newsletter") || strings.Contains(nodeIdentity(node), "subscribe") {
		return "newsletter"
	}
	if strings.Contains(nodeIdentity(node), "promo") || strings.Contains(nodeIdentity(node), "advert") {
		return "promotion"
	}
	return tag
}

func chromeReason(node *xhtml.Node) string {
	return fmt.Sprintf("skipped page chrome: %s", chromeKind(node))
}

func isElement(node *xhtml.Node) bool {
	return node.Type == xhtml.ElementNode
}

func isBlockLike(tag string) bool {
	switch tag {
	case "article", "aside", "blockquote", "br", "div", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "li", "main", "nav", "p", "section", "tr":
		return true
	default:
		return false
	}
}

func candidateLabel(node *xhtml.Node, fallback string) string {
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if isElement(child) {
			tag := strings.ToLower(child.Data)
			if len(tag) == 2 && tag[0] == 'h' && tag[1] >= '1' && tag[1] <= '6' {
				if text := truncateText(visibleText(child, textOptions{}), 80); text != "" {
					return text
				}
			}
		}
	}
	return fallback
}

func nodeSelector(node *xhtml.Node) string {
	if node == nil || !isElement(node) {
		return "document"
	}
	parts := []string{}
	for current := node; current != nil && isElement(current); current = current.Parent {
		tag := strings.ToLower(current.Data)
		if tag == "html" {
			break
		}
		part := tag
		if id := attrValue(current, "id"); id != "" {
			part += "#" + sanitizeSelectorToken(id)
		} else if className := selectorClasses(current); className != "" {
			part += className
		}
		if nth, siblings := nthOfType(current); siblings > 1 && attrValue(current, "id") == "" {
			part += fmt.Sprintf(":nth-of-type(%d)", nth)
		}
		parts = append(parts, part)
		if attrValue(current, "id") != "" || tag == "body" {
			break
		}
	}
	for left, right := 0, len(parts)-1; left < right; left, right = left+1, right-1 {
		parts[left], parts[right] = parts[right], parts[left]
	}
	return strings.Join(parts, " > ")
}

func selectorClasses(node *xhtml.Node) string {
	classes := strings.Fields(attrValue(node, "class"))
	if len(classes) == 0 {
		return ""
	}
	limit := min(len(classes), 2)
	parts := make([]string, 0, limit)
	for _, className := range classes[:limit] {
		if token := sanitizeSelectorToken(className); token != "" {
			parts = append(parts, "."+token)
		}
	}
	return strings.Join(parts, "")
}

func nthOfType(node *xhtml.Node) (int, int) {
	if node.Parent == nil {
		return 1, 1
	}
	index := 0
	total := 0
	tag := strings.ToLower(node.Data)
	for sibling := node.Parent.FirstChild; sibling != nil; sibling = sibling.NextSibling {
		if !isElement(sibling) || !strings.EqualFold(sibling.Data, tag) {
			continue
		}
		total += 1
		if sibling == node {
			index = total
		}
	}
	return max(index, 1), max(total, 1)
}

func attrValue(node *xhtml.Node, key string) string {
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, key) {
			return strings.TrimSpace(attr.Val)
		}
	}
	return ""
}

func nodeIdentity(node *xhtml.Node) string {
	return strings.ToLower(strings.TrimSpace(attrValue(node, "id") + " " + attrValue(node, "class")))
}

func normalizeHTMLText(input string) string {
	root, err := xhtml.Parse(strings.NewReader(input))
	if err != nil {
		return normalizeParagraphText(html.UnescapeString(input))
	}
	return visibleText(root, textOptions{skipChrome: true})
}

func normalizeWhitespace(input string) string {
	return strings.Join(strings.Fields(input), " ")
}

func normalizeParagraphText(input string) string {
	normalized := strings.ReplaceAll(input, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	paragraphs := strings.Split(normalized, "\n\n")
	clean := make([]string, 0, len(paragraphs))
	for _, paragraph := range paragraphs {
		text := normalizeWhitespace(paragraph)
		if text != "" {
			clean = append(clean, text)
		}
	}
	if len(clean) == 0 {
		return normalizeWhitespace(normalized)
	}
	return strings.Join(clean, "\n\n")
}

func countWords(input string) int {
	count := 0
	for _, part := range strings.Fields(input) {
		if strings.Trim(part, " \t\n\r.,;:!?()[]{}\"'") != "" {
			count += 1
		}
	}
	return count
}

func countNarrationParagraphs(input string) int {
	count := 0
	for _, paragraph := range strings.Split(normalizeParagraphText(input), "\n\n") {
		if countWords(paragraph) > 0 {
			count += 1
		}
	}
	return count
}

func ratio(numerator int, denominator int) float64 {
	if denominator <= 0 {
		return 0
	}
	return roundRatio(float64(numerator) / float64(denominator))
}

func roundRatio(value float64) float64 {
	return math.Round(value*1000) / 1000
}

func clamp(value float64, low float64, high float64) float64 {
	return math.Max(low, math.Min(high, value))
}

func truncateText(input string, limit int) string {
	text := normalizeWhitespace(input)
	if len(text) <= limit {
		return text
	}
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:max(limit-1, 0)]) + "..."
}

func sanitizeSelectorToken(input string) string {
	var builder strings.Builder
	for _, value := range input {
		if value == '-' || value == '_' || value == ':' || value == '.' || value == '#' || value == '[' || value == ']' || (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') || (value >= '0' && value <= '9') {
			builder.WriteRune(value)
			continue
		}
		builder.WriteRune('-')
	}
	return strings.Trim(builder.String(), "-")
}
