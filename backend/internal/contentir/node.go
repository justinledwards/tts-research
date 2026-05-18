package contentir

import (
	"time"

	"github.com/justinedwards/tts-research/backend/internal/policy"
)

const (
	SchemaVersionV1 = "content-ir.v1"
	SchemaVersion   = SchemaVersionV1
)

type Document struct {
	SchemaVersion  string    `json:"schemaVersion"`
	ID             string    `json:"id"`
	SourceType     string    `json:"sourceType"`
	SourceID       string    `json:"sourceId"`
	ProjectID      string    `json:"projectId"`
	SourceName     string    `json:"sourceName"`
	AdapterVersion string    `json:"adapterVersion"`
	GeneratedAt    time.Time `json:"generatedAt"`
	Metadata       Metadata  `json:"metadata,omitempty"`
	Nodes          []Node    `json:"nodes"`
}

type Node struct {
	NodeID            string             `json:"nodeId"`
	ParentID          string             `json:"parentId"`
	OrderKey          string             `json:"orderKey"`
	Kind              string             `json:"kind"`
	Role              string             `json:"role"`
	DisplayText       string             `json:"displayText"`
	NormalisedText    string             `json:"normalisedText"`
	SpeechText        string             `json:"speechText"`
	Lang              string             `json:"lang"`
	Script            string             `json:"script"`
	Dir               string             `json:"dir"`
	Provenance        Provenance         `json:"provenance"`
	UI                UIHints            `json:"ui"`
	Speech            SpeechMetadata     `json:"speech"`
	Warnings          []string           `json:"warnings"`
	Confidence        float64            `json:"confidence"`
	Rights            RightsMetadata     `json:"rights"`
	Metadata          Metadata           `json:"metadata,omitempty"`
	PronunciationRefs []PronunciationRef `json:"pronunciationRefs,omitempty"`
	LexiconEntryIDs   []string           `json:"lexiconEntryIds,omitempty"`
	Phoneme           string             `json:"phoneme,omitempty"`
	Alphabet          string             `json:"alphabet,omitempty"`
	SayAs             string             `json:"sayAs,omitempty"`
	MarkID            string             `json:"markId,omitempty"`
	AdapterVersion    string             `json:"adapterVersion"`
}

type Metadata map[string]any

type PronunciationRef struct {
	Term         string `json:"term"`
	Spoken       string `json:"spoken"`
	Source       string `json:"source,omitempty"`
	EntryID      string `json:"entryId,omitempty"`
	Scope        string `json:"scope,omitempty"`
	Protected    bool   `json:"protected,omitempty"`
	StartOffset  int    `json:"startOffset"`
	EndOffset    int    `json:"endOffset"`
	OriginalText string `json:"originalText"`
	Phoneme      string `json:"phoneme,omitempty"`
	Alphabet     string `json:"alphabet,omitempty"`
}

type UIHints struct {
	ProgressionHint   string `json:"progressionHint"`
	HighlightUnitHint string `json:"highlightUnitHint"`
}

type SpeechMetadata struct {
	PolicyHint   SpeechPolicyHint    `json:"policyHint"`
	SpeechPolicy policy.SpeechPolicy `json:"speechPolicy"`
}

type RightsMetadata struct {
	Status string `json:"status"`
	Notes  string `json:"notes"`
}

func NewDocument(
	id string,
	sourceType string,
	sourceID string,
	projectID string,
	sourceName string,
	adapterVersion string,
	generatedAt time.Time,
	nodes []Node,
) Document {
	return Document{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		SourceType:     sourceType,
		SourceID:       sourceID,
		ProjectID:      projectID,
		SourceName:     sourceName,
		AdapterVersion: adapterVersion,
		GeneratedAt:    generatedAt.UTC(),
		Nodes:          nodes,
	}
}

func DefaultUIHints(progressionHint string) UIHints {
	if progressionHint == "" {
		progressionHint = "linear"
	}
	return UIHints{
		ProgressionHint:   progressionHint,
		HighlightUnitHint: "node",
	}
}

func UnknownRights() RightsMetadata {
	return RightsMetadata{Status: "unknown"}
}
