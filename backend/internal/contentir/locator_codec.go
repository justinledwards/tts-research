package contentir

const LocatorEnvelopeVersion = "locator-envelope.v1"

type ReadiumLocator struct {
	Href      string                 `json:"href"`
	Type      string                 `json:"type"`
	Title     string                 `json:"title,omitempty"`
	Locations ReadiumLocations       `json:"locations,omitempty"`
	Text      *ReadiumText           `json:"text,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type ReadiumLocations struct {
	Fragments        []string `json:"fragments,omitempty"`
	Progression      *float64 `json:"progression,omitempty"`
	TotalProgression *float64 `json:"totalProgression,omitempty"`
	Position         int      `json:"position,omitempty"`
	CSSSelector      string   `json:"cssSelector,omitempty"`
	PartialCFI       string   `json:"partialCfi,omitempty"`
}

type ReadiumText struct {
	Before    string `json:"before,omitempty"`
	Highlight string `json:"highlight,omitempty"`
	After     string `json:"after,omitempty"`
}

type LocatorEnvelope struct {
	SchemaVersion   string          `json:"schemaVersion"`
	Kind            string          `json:"kind"`
	SourceID        string          `json:"sourceId"`
	NodeID          string          `json:"nodeId,omitempty"`
	ScopeKey        string          `json:"scopeKey,omitempty"`
	ActiveWordIndex int             `json:"activeWordIndex,omitempty"`
	Locator         *Locator        `json:"locator,omitempty"`
	Readium         *ReadiumLocator `json:"readium,omitempty"`
	TextQuote       string          `json:"textQuote,omitempty"`
}

type LocatorContext struct {
	Kind             string
	SourceID         string
	NodeID           string
	ScopeKey         string
	ActiveWordIndex  int
	Title            string
	TextQuote        string
	TotalProgression *float64
	Position         int
}
