package contentir

type Provenance struct {
	Format   string      `json:"format"`
	SourceID string      `json:"sourceId"`
	Locator  Locator     `json:"locator"`
	Offsets  TextOffsets `json:"offsets"`
}

type TextOffsets struct {
	Start int `json:"start"`
	End   int `json:"end"`
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
