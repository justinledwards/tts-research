package contentir

import (
	"testing"
	"time"
)

func TestContentIRNormalizesPreReleaseV1ToPublicV1(t *testing.T) {
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
			Provenance: NewProvenance("epub", "book-1", Locator{
				Type: "epub",
				HTML: &HTMLLocator{
					Href:        "OPS/chapter.xhtml",
					Fragment:    "p1",
					TextQuote:   "Dr Nguyen arrived.",
					Progression: &progress,
					EPUBCFI:     "epubcfi(/6/chapter!/p1)",
				},
			}, 0, 18),
			UI:         DefaultUIHints("linear"),
			Speech:     SpeechMetadata{PolicyHint: NewSpeechPolicyHint("speak", "", 0, 0)},
			Warnings:   []string{},
			Confidence: 0.95,
			Rights:     UnknownRights(),
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

	upgraded, err := ToV1(document)
	if err != nil {
		t.Fatalf("ToV1 returned error: %v", err)
	}
	if upgraded.SchemaVersion != SchemaVersionV1 {
		t.Fatalf("schemaVersion = %q, want %q", upgraded.SchemaVersion, SchemaVersionV1)
	}
	locator := upgraded.Nodes[0].Provenance.Locator
	if locator.EPUB == nil || locator.HTML != nil {
		t.Fatalf("public v1 EPUB locator = %#v, want epub payload only", locator)
	}
	if got := upgraded.Nodes[0].LexiconEntryIDs; len(got) != 1 || got[0] != "lex-dr" {
		t.Fatalf("lexiconEntryIds = %#v, want lex-dr", got)
	}
	if upgraded.Nodes[0].Phoneme != "dɒktə" || upgraded.Nodes[0].Alphabet != "ipa" {
		t.Fatalf("pronunciation fields = %q/%q", upgraded.Nodes[0].Phoneme, upgraded.Nodes[0].Alphabet)
	}
	if upgraded.Nodes[0].MarkID == "" {
		t.Fatalf("public v1 should expose markId: %#v", upgraded.Nodes[0])
	}
}

func TestContentIRRejectsUnreleasedVersions(t *testing.T) {
	t.Parallel()

	document := Document{SchemaVersion: "content-ir.v1_1"}
	if _, err := ToSchemaVersion(document, "content-ir.v1_1"); err == nil {
		t.Fatal("ToSchemaVersion accepted unreleased content-ir.v1_1")
	}
}
