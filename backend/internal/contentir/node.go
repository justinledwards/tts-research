package contentir

import (
	"time"

	"github.com/justinedwards/tts-research/backend/internal/policy"
)

const SchemaVersion = "content-ir.v1"

type Document struct {
	SchemaVersion  string    `json:"schemaVersion"`
	ID             string    `json:"id"`
	SourceType     string    `json:"sourceType"`
	SourceID       string    `json:"sourceId"`
	ProjectID      string    `json:"projectId"`
	SourceName     string    `json:"sourceName"`
	AdapterVersion string    `json:"adapterVersion"`
	GeneratedAt    time.Time `json:"generatedAt"`
	Nodes          []Node    `json:"nodes"`
}

type Node struct {
	NodeID         string         `json:"nodeId"`
	ParentID       string         `json:"parentId"`
	OrderKey       string         `json:"orderKey"`
	Kind           string         `json:"kind"`
	Role           string         `json:"role"`
	DisplayText    string         `json:"displayText"`
	NormalisedText string         `json:"normalisedText"`
	SpeechText     string         `json:"speechText"`
	Lang           string         `json:"lang"`
	Script         string         `json:"script"`
	Dir            string         `json:"dir"`
	Provenance     Provenance     `json:"provenance"`
	UI             UIHints        `json:"ui"`
	Speech         SpeechMetadata `json:"speech"`
	Warnings       []string       `json:"warnings"`
	Confidence     float64        `json:"confidence"`
	Rights         RightsMetadata `json:"rights"`
	AdapterVersion string         `json:"adapterVersion"`
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
