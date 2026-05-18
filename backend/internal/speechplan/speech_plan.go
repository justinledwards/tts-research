package speechplan

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/contentir/readiumbridge"
	"github.com/justinedwards/tts-research/backend/internal/policy"
	"github.com/justinedwards/tts-research/backend/internal/ssml"
)

const SchemaVersion = "speech-plan.v1"

type Document struct {
	SchemaVersion string            `json:"schemaVersion"`
	ID            string            `json:"id"`
	SourceID      string            `json:"sourceId"`
	ProjectID     string            `json:"projectId"`
	JobID         string            `json:"jobId,omitempty"`
	GeneratedAt   time.Time         `json:"generatedAt"`
	PolicyTrace   []PolicyTraceStep `json:"policyTrace,omitempty"`
	Segments      []Segment         `json:"segments"`
	Metadata      map[string]any    `json:"metadata,omitempty"`
}

type Segment struct {
	SegmentID         string                       `json:"segmentId"`
	Index             int                          `json:"index"`
	NodeID            string                       `json:"nodeId"`
	Text              string                       `json:"text"`
	Lang              string                       `json:"lang"`
	SpeechPolicy      policy.SpeechPolicy          `json:"speechPolicy"`
	PolicyTrace       []PolicyTraceStep            `json:"policyTrace"`
	LocatorEnvelope   contentir.LocatorEnvelope    `json:"locatorEnvelope"`
	PronunciationRefs []contentir.PronunciationRef `json:"pronunciationRefs,omitempty"`
	LexiconEntryIDs   []string                     `json:"lexiconEntryIds,omitempty"`
	SerializerTargets SerializerTargets            `json:"serializerTargets"`
	Warnings          []string                     `json:"warnings,omitempty"`
}

type PolicyTraceStep struct {
	Scope     string           `json:"scope"`
	Profile   string           `json:"profile"`
	Overrides policy.Overrides `json:"overrides,omitempty"`
}

type SerializerTargets struct {
	PlainText      string          `json:"plainText"`
	SSML           string          `json:"ssml,omitempty"`
	PLSRefs        []string        `json:"plsRefs,omitempty"`
	HighlightMarks []HighlightMark `json:"highlightMarks"`
}

type HighlightMark struct {
	MarkID    string `json:"markId"`
	NodeID    string `json:"nodeId"`
	SegmentID string `json:"segmentId,omitempty"`
}

type BuildOptions struct {
	ID              string
	JobID           string
	GeneratedAt     time.Time
	PolicyTrace     []PolicyTraceStep
	LocatorKind     string
	ActiveWordStart int
}

func BuildFromContentIR(document contentir.Document, options BuildOptions) (Document, error) {
	ir, err := contentir.ToV1(document)
	if err != nil {
		return Document{}, err
	}
	if options.GeneratedAt.IsZero() {
		options.GeneratedAt = time.Now().UTC()
	}
	trace := options.PolicyTrace
	if len(trace) == 0 {
		trace = defaultTrace(ir)
	}
	id := strings.TrimSpace(options.ID)
	if id == "" {
		id = ir.ID
	}
	plan := Document{
		SchemaVersion: SchemaVersion,
		ID:            id,
		SourceID:      ir.SourceID,
		ProjectID:     ir.ProjectID,
		JobID:         strings.TrimSpace(options.JobID),
		GeneratedAt:   options.GeneratedAt.UTC(),
		PolicyTrace:   trace,
		Segments:      []Segment{},
		Metadata: map[string]any{
			"contentIrSchemaVersion": ir.SchemaVersion,
			"sourceName":             ir.SourceName,
		},
	}
	for _, node := range ir.Nodes {
		text := strings.TrimSpace(node.SpeechText)
		if text == "" || strings.EqualFold(node.Speech.SpeechPolicy.Mode, string(policy.ModeSkip)) {
			continue
		}
		index := len(plan.Segments) + 1
		segmentID := "seg-" + leftPad(index, 4)
		locator := node.Provenance.Locator
		markID := firstNonEmpty(node.MarkID, "mark-"+node.NodeID)
		plainSSML := ssmlForNode(node, text)
		plan.Segments = append(plan.Segments, Segment{
			SegmentID:    segmentID,
			Index:        index,
			NodeID:       node.NodeID,
			Text:         text,
			Lang:         firstNonEmpty(node.Lang, "und"),
			SpeechPolicy: node.Speech.SpeechPolicy,
			PolicyTrace:  trace,
			LocatorEnvelope: readiumbridge.NewLocatorEnvelope(&locator, contentir.LocatorContext{
				Kind:            firstNonEmpty(options.LocatorKind, "highlight"),
				SourceID:        ir.SourceID,
				NodeID:          node.NodeID,
				ActiveWordIndex: options.ActiveWordStart + index - 1,
				TextQuote:       firstNonEmpty(node.NormalisedText, node.DisplayText, node.SpeechText),
				Title:           ir.SourceName,
				Position:        index,
			}),
			PronunciationRefs: node.PronunciationRefs,
			LexiconEntryIDs:   node.LexiconEntryIDs,
			SerializerTargets: SerializerTargets{
				PlainText: text,
				SSML:      plainSSML,
				PLSRefs:   node.LexiconEntryIDs,
				HighlightMarks: []HighlightMark{{
					MarkID:    markID,
					NodeID:    node.NodeID,
					SegmentID: segmentID,
				}},
			},
			Warnings: node.Warnings,
		})
	}
	return plan, nil
}

func Encode(document Document) ([]byte, error) {
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(encoded, '\n'), nil
}

func Decode(data []byte) (Document, error) {
	var document Document
	if err := json.Unmarshal(data, &document); err != nil {
		return Document{}, err
	}
	return document, nil
}

func defaultTrace(document contentir.Document) []PolicyTraceStep {
	profile := "Enterprise"
	if len(document.Nodes) > 0 && strings.TrimSpace(document.Nodes[0].Speech.SpeechPolicy.Profile) != "" {
		profile = document.Nodes[0].Speech.SpeechPolicy.Profile
	}
	return []PolicyTraceStep{
		{Scope: "marketProfileDefault", Profile: string(policy.DefaultProfileName)},
		{Scope: "projectOverride", Profile: profile},
	}
}

func ssmlForNode(node contentir.Node, text string) string {
	if value := speechRenderString(node.Metadata, "ssml"); value != "" {
		return value
	}
	return ssml.Serialize(ssml.Document{Text: text, Lang: firstNonEmpty(node.Lang, "en")})
}

func speechRenderString(metadata contentir.Metadata, key string) string {
	raw, ok := metadata["speechRender"]
	if !ok {
		return ""
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return ""
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		return ""
	}
	value, ok := decoded[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func leftPad(value int, width int) string {
	text := strconv.Itoa(value)
	for len(text) < width {
		text = "0" + text
	}
	return text
}
