package lexicon

import (
	"encoding/xml"
	"io"
	"strings"
	"time"
)

type plsLexicon struct {
	XMLName xml.Name   `xml:"lexicon"`
	Version string     `xml:"version,attr,omitempty"`
	XMLNS   string     `xml:"xmlns,attr,omitempty"`
	Lang    string     `xml:"xml:lang,attr,omitempty"`
	Entries []plsEntry `xml:"lexeme"`
}

type plsEntry struct {
	Grapheme string `xml:"grapheme"`
	Alias    string `xml:"alias,omitempty"`
	Phoneme  string `xml:"phoneme,omitempty"`
}

func EncodePLS(lex Lexicon) ([]byte, error) {
	doc := plsLexicon{
		Version: "1.0",
		XMLNS:   "http://www.w3.org/2005/01/pronunciation-lexicon",
		Lang:    "en-GB",
		Entries: make([]plsEntry, 0, len(lex.Entries)),
	}
	for _, entry := range lex.Entries {
		doc.Entries = append(doc.Entries, plsEntry{
			Grapheme: entry.Term,
			Alias:    entry.Replacement,
			Phoneme:  entry.Phoneme,
		})
	}
	data, err := xml.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, err
	}
	return append([]byte(xml.Header), append(data, '\n')...), nil
}

func DecodePLS(reader io.Reader, scope Scope) ([]Entry, error) {
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	var doc plsLexicon
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	entries := make([]Entry, 0, len(doc.Entries))
	for _, item := range doc.Entries {
		term := strings.TrimSpace(item.Grapheme)
		if term == "" {
			continue
		}
		entries = append(entries, NormalizeEntry(Entry{
			ID:          "",
			Term:        term,
			Replacement: strings.TrimSpace(item.Alias),
			Phoneme:     strings.TrimSpace(item.Phoneme),
			Lang:        strings.TrimSpace(doc.Lang),
			Scope:       scope,
		}, scope, now))
	}
	return entries, nil
}
