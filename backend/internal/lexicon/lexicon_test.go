package lexicon

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func TestApplyPrefersEarlierLexicon(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	project := Lexicon{
		Entries: []Entry{NormalizeEntry(Entry{
			ID:          "project-1",
			Term:        "Nguyen",
			Replacement: "Nuh-goo-yen",
		}, ScopeProject, now)},
	}
	profile := Lexicon{
		Entries: []Entry{NormalizeEntry(Entry{
			ID:          "profile-1",
			Term:        "Nguyen",
			Replacement: "Win",
			Protected:   true,
		}, ScopeVoiceProfile, now)},
	}

	spoken, decisions := Apply("Dr Nguyen arrived.", profile, project)
	if !strings.Contains(spoken, "Win") || strings.Contains(spoken, "Nuh-goo-yen") {
		t.Fatalf("spoken = %q, want voice profile pronunciation to win", spoken)
	}
	if len(decisions) != 1 || decisions[0].Scope != ScopeVoiceProfile || !decisions[0].Protected {
		t.Fatalf("decisions = %#v, want protected voice profile decision", decisions)
	}
}

func TestPLSRoundTrip(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	lex := Lexicon{
		Version: StoreVersion,
		Scope:   ScopeProject,
		OwnerID: "project-1",
		Entries: []Entry{NormalizeEntry(Entry{
			ID:          "entry-1",
			Term:        "SSML",
			Replacement: "S S M L",
			Lang:        "en",
		}, ScopeProject, now)},
	}

	encoded, err := EncodePLS(lex)
	if err != nil {
		t.Fatalf("EncodePLS returned error: %v", err)
	}
	entries, err := DecodePLS(bytes.NewReader(encoded), ScopeProject)
	if err != nil {
		t.Fatalf("DecodePLS returned error: %v", err)
	}
	if len(entries) != 1 || entries[0].Term != "SSML" || entries[0].Replacement != "S S M L" {
		t.Fatalf("entries = %#v, want SSML alias round trip", entries)
	}
}
