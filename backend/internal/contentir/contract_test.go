package contentir

import (
	"encoding/json"
	"testing"
	"time"
)

func TestContentIRMigrationV1ToV11AndBack(t *testing.T) {
	t.Parallel()

	progress := 0.42
	document := NewDocument(
		"fixture",
		"bookSource",
		"book-1",
		"default",
		"book.epub",
		"test-adapter",
		time.Unix(0, 0).UTC(),
		[]Node{{
			NodeID:         "node-1",
			ParentID:       "",
			OrderKey:       "00000001",
			Kind:           "body",
			Role:           "body",
			DisplayText:    "Dr Nguyen arrived.",
			NormalisedText: "Dr Nguyen arrived.",
			SpeechText:     "Doctor Nguyen arrived.",
			Lang:           "en",
			Script:         "Latn",
			Dir:            "ltr",
			Provenance:     NewProvenance("epub", "book-1", NewEPUBLocator("OPS/chapter.xhtml", "p1", "Dr Nguyen arrived.", &progress, "epubcfi(/6/chapter!/p1)"), 0, 18),
			UI:             DefaultUIHints("linear"),
			Speech:         SpeechMetadata{PolicyHint: NewSpeechPolicyHint("speak", "", 0, 0)},
			Warnings:       []string{},
			Confidence:     0.95,
			Rights:         UnknownRights(),
			Metadata: Metadata{
				"speechRender": map[string]any{
					"pronunciations": []any{
						map[string]any{
							"term":         "Dr",
							"spoken":       "Doctor",
							"source":       "lexicon",
							"entryId":      "lex-dr",
							"scope":        "project",
							"startOffset":  0,
							"endOffset":    2,
							"originalText": "Dr",
							"phoneme":      "dɒktə",
							"alphabet":     "ipa",
						},
					},
				},
			},
			AdapterVersion: "test-adapter",
		}},
	)

	upgraded, err := ToV11(document)
	if err != nil {
		t.Fatalf("ToV11 returned error: %v", err)
	}
	if upgraded.SchemaVersion != SchemaVersionV11 {
		t.Fatalf("schemaVersion = %q, want %q", upgraded.SchemaVersion, SchemaVersionV11)
	}
	locator := upgraded.Nodes[0].Provenance.Locator
	if locator.EPUB == nil || locator.HTML != nil {
		t.Fatalf("v1_1 EPUB locator = %#v, want epub payload only", locator)
	}
	if got := upgraded.Nodes[0].LexiconEntryIDs; len(got) != 1 || got[0] != "lex-dr" {
		t.Fatalf("lexiconEntryIds = %#v, want lex-dr", got)
	}
	if upgraded.Nodes[0].Phoneme != "dɒktə" || upgraded.Nodes[0].Alphabet != "ipa" {
		t.Fatalf("pronunciation fields = %q/%q", upgraded.Nodes[0].Phoneme, upgraded.Nodes[0].Alphabet)
	}
	downgraded, err := ToV1(upgraded)
	if err != nil {
		t.Fatalf("ToV1 returned error: %v", err)
	}
	if downgraded.SchemaVersion != SchemaVersionV1 || downgraded.Nodes[0].Provenance.Locator.HTML == nil || downgraded.Nodes[0].Provenance.Locator.EPUB != nil {
		t.Fatalf("v1 locator downgrade = %#v", downgraded.Nodes[0].Provenance.Locator)
	}
	if len(downgraded.Nodes[0].PronunciationRefs) != 0 || downgraded.Nodes[0].MarkID != "" {
		t.Fatalf("v1 should not expose v1_1 pronunciation fields: %#v", downgraded.Nodes[0])
	}
}

func TestReadiumLocatorExportImport(t *testing.T) {
	t.Parallel()

	progression := 0.5
	locator := NewPublicEPUBLocator("OPS/chapter.xhtml", "p1", "Opening words", &progression, "epubcfi(/6/chapter!/4/2)", "chapter")
	readium := ExportReadiumLocator(locator, LocatorContext{SourceID: "book-1", Title: "Opening", Position: 3})
	if readium.Href != "OPS/chapter.xhtml" || readium.Type != "application/xhtml+xml" {
		t.Fatalf("readium locator = %#v", readium)
	}
	if readium.Locations.PartialCFI != "/4/2" {
		t.Fatalf("partial CFI = %q, want /4/2", readium.Locations.PartialCFI)
	}
	roundTrip := ImportReadiumLocator(readium)
	if !LocatorsMatch(&locator, &roundTrip) {
		t.Fatalf("round trip locator = %#v, want match with %#v", roundTrip, locator)
	}

	envelope := NewLocatorEnvelope(&locator, LocatorContext{Kind: "bookmark", SourceID: "book-1", NodeID: "node-1", TextQuote: "Opening words"})
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatalf("Marshal envelope returned error: %v", err)
	}
	var decoded LocatorEnvelope
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("Unmarshal envelope returned error: %v", err)
	}
	if decoded.SchemaVersion != LocatorEnvelopeVersion || decoded.Readium == nil {
		t.Fatalf("decoded envelope = %#v", decoded)
	}
}
