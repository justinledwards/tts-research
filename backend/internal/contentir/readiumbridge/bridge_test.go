package readiumbridge

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

func TestReadiumLocatorExportImportRoundTrips(t *testing.T) {
	t.Parallel()

	progression := 0.5
	goldens := readiumGoldens(t)
	cases := []struct {
		name        string
		locator     contentir.Locator
		wantType    string
		wantHref    string
		wantPartial string
	}{
		{
			name:     "markdown",
			locator:  contentir.NewMarkdownLocator("notes.md", 2, 2, 1, 8, "/children/1"),
			wantType: "text/markdown",
			wantHref: "notes.md",
		},
		{
			name:     "html",
			locator:  contentir.NewHTMLLocator("article.html", "lead", "Lead", &progression, ""),
			wantType: "text/html",
			wantHref: "article.html",
		},
		{
			name:        "epub",
			locator:     contentir.NewEPUBLocator("OPS/chapter.xhtml", "p1", "Opening words", &progression, "epubcfi(/6/chapter!/4/2)"),
			wantType:    "application/xhtml+xml",
			wantHref:    "OPS/chapter.xhtml",
			wantPartial: "/4/2",
		},
		{
			name:     "pdf",
			locator:  contentir.NewPDFLocator(2, &contentir.BBox{X: 1, Y: 2, Width: 3, Height: 4}, nil, nil),
			wantType: "application/pdf",
			wantHref: "source-1",
		},
		{
			name:     "docx",
			locator:  contentir.NewDOCXLocator(4, nil, ""),
			wantType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			wantHref: "source-1",
		},
		{
			name: "ocr",
			locator: contentir.NewOCRLocator(0, []contentir.Point{
				{X: 0, Y: 0},
				{X: 1, Y: 0},
				{X: 1, Y: 1},
				{X: 0, Y: 1},
			}, "tesseract", 0.91),
			wantType: "image/*",
			wantHref: "source-1",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			readium := ExportReadiumLocator(tc.locator, contentir.LocatorContext{
				SourceID: "source-1",
				Title:    "Opening",
				Position: 3,
			})
			if readium.Href != tc.wantHref || readium.Type != tc.wantType {
				t.Fatalf("readium locator = %#v, want href/type %q/%q", readium, tc.wantHref, tc.wantType)
			}
			if tc.wantPartial != "" && readium.Locations.PartialCFI != tc.wantPartial {
				t.Fatalf("partial CFI = %q, want %q", readium.Locations.PartialCFI, tc.wantPartial)
			}
			if expected, ok := goldens[tc.name]; !ok {
				t.Fatalf("missing golden for %q", tc.name)
			} else if !reflect.DeepEqual(readium, expected) {
				actualJSON, _ := json.MarshalIndent(readium, "", "  ")
				expectedJSON, _ := json.MarshalIndent(expected, "", "  ")
				t.Fatalf("readium golden mismatch\nactual: %s\nexpected: %s", actualJSON, expectedJSON)
			}
			roundTrip := ImportReadiumLocator(readium)
			if !LocatorsMatch(&tc.locator, &roundTrip) {
				t.Fatalf("round trip locator = %#v, want match with %#v", roundTrip, tc.locator)
			}
		})
	}
}

func TestLocatorEnvelopeMarshalRoundTrip(t *testing.T) {
	t.Parallel()

	progression := 0.5
	locator := contentir.NewEPUBLocator("OPS/chapter.xhtml", "p1", "Opening words", &progression, "epubcfi(/6/chapter!/4/2)")
	envelope := NewLocatorEnvelope(&locator, contentir.LocatorContext{
		Kind:      "bookmark",
		SourceID:  "book-1",
		NodeID:    "node-1",
		TextQuote: "Opening words",
	})
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatalf("Marshal envelope returned error: %v", err)
	}
	var decoded contentir.LocatorEnvelope
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("Unmarshal envelope returned error: %v", err)
	}
	if decoded.SchemaVersion != contentir.LocatorEnvelopeVersion || decoded.Readium == nil {
		t.Fatalf("decoded envelope = %#v", decoded)
	}
}

func readiumGoldens(t *testing.T) map[string]contentir.ReadiumLocator {
	t.Helper()

	data, err := os.ReadFile(filepath.Join("testdata", "readium_roundtrip.golden.json"))
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}
	var goldens map[string]contentir.ReadiumLocator
	if err := json.Unmarshal(data, &goldens); err != nil {
		t.Fatalf("decode golden: %v", err)
	}
	return goldens
}
