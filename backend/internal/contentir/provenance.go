package contentir

type Provenance struct {
	Format     string                `json:"format"`
	SourceID   string                `json:"sourceId"`
	Locator    Locator               `json:"locator"`
	Offsets    TextOffsets           `json:"offsets"`
	Extraction *ExtractionProvenance `json:"extraction,omitempty"`
}

type TextOffsets struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

type ExtractionProvenance struct {
	Extractor        string  `json:"extractor"`
	ExtractorVersion string  `json:"extractorVersion"`
	SupportTier      string  `json:"supportTier"`
	Step             string  `json:"step"`
	Confidence       float64 `json:"confidence"`
}

func NewProvenance(format string, sourceID string, locator Locator, start int, end int) Provenance {
	return Provenance{
		Format:   format,
		SourceID: sourceID,
		Locator:  locator,
		Offsets: TextOffsets{
			Start: start,
			End:   end,
		},
	}
}
