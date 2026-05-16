package lexicon

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const StoreVersion = "lexicon.v1"

type Scope string

const (
	ScopeProject      Scope = "project"
	ScopeVoiceProfile Scope = "voiceProfile"
)

type Entry struct {
	ID            string    `json:"id"`
	Term          string    `json:"term"`
	Replacement   string    `json:"replacement,omitempty"`
	Alphabet      string    `json:"alphabet,omitempty"`
	Phoneme       string    `json:"phoneme,omitempty"`
	Lang          string    `json:"lang,omitempty"`
	Locale        string    `json:"locale,omitempty"`
	CaseSensitive bool      `json:"caseSensitive,omitempty"`
	Protected     bool      `json:"protected,omitempty"`
	Scope         Scope     `json:"scope"`
	Notes         string    `json:"notes,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type Lexicon struct {
	Version   string    `json:"version"`
	Scope     Scope     `json:"scope"`
	OwnerID   string    `json:"ownerId"`
	Entries   []Entry   `json:"entries"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Store struct {
	Path    string
	Scope   Scope
	OwnerID string
}

var ErrEntryNotFound = errors.New("lexicon entry not found")

func (store Store) Load() (Lexicon, error) {
	data, err := os.ReadFile(store.Path)
	if err != nil {
		if os.IsNotExist(err) {
			return store.empty(), nil
		}
		return Lexicon{}, err
	}
	var lex Lexicon
	if err := json.Unmarshal(data, &lex); err != nil {
		return Lexicon{}, err
	}
	return store.normalize(lex), nil
}

func (store Store) Save(lex Lexicon) error {
	lex = store.normalize(lex)
	if err := os.MkdirAll(filepath.Dir(store.Path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(lex, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(store.Path, append(data, '\n'), 0o644)
}

func (store Store) Upsert(entry Entry) (Lexicon, Entry, error) {
	lex, err := store.Load()
	if err != nil {
		return Lexicon{}, Entry{}, err
	}
	now := time.Now().UTC()
	entry = NormalizeEntry(entry, store.Scope, now)
	if entry.ID == "" {
		entry.ID = "lex-" + strings.ToLower(strings.ReplaceAll(entry.Term, " ", "-")) + "-" + now.Format("20060102150405")
	}
	found := false
	for index := range lex.Entries {
		if lex.Entries[index].ID == entry.ID {
			entry.CreatedAt = lex.Entries[index].CreatedAt
			entry.UpdatedAt = now
			lex.Entries[index] = entry
			found = true
			break
		}
	}
	if !found {
		entry.CreatedAt = now
		entry.UpdatedAt = now
		lex.Entries = append(lex.Entries, entry)
	}
	if err := store.Save(lex); err != nil {
		return Lexicon{}, Entry{}, err
	}
	lex, _ = store.Load()
	return lex, entry, nil
}

func (store Store) Delete(entryID string) (Lexicon, error) {
	lex, err := store.Load()
	if err != nil {
		return Lexicon{}, err
	}
	next := make([]Entry, 0, len(lex.Entries))
	found := false
	for _, entry := range lex.Entries {
		if entry.ID == strings.TrimSpace(entryID) {
			found = true
			continue
		}
		next = append(next, entry)
	}
	if !found {
		return Lexicon{}, ErrEntryNotFound
	}
	lex.Entries = next
	return lex, store.Save(lex)
}

func (store Store) empty() Lexicon {
	return Lexicon{
		Version:   StoreVersion,
		Scope:     store.Scope,
		OwnerID:   store.OwnerID,
		Entries:   []Entry{},
		UpdatedAt: time.Now().UTC(),
	}
}

func (store Store) normalize(lex Lexicon) Lexicon {
	lex.Version = StoreVersion
	lex.Scope = store.Scope
	lex.OwnerID = store.OwnerID
	if lex.UpdatedAt.IsZero() {
		lex.UpdatedAt = time.Now().UTC()
	}
	next := make([]Entry, 0, len(lex.Entries))
	seen := map[string]struct{}{}
	for _, entry := range lex.Entries {
		entry = NormalizeEntry(entry, store.Scope, time.Now().UTC())
		if entry.Term == "" || entry.ID == "" {
			continue
		}
		if _, ok := seen[entry.ID]; ok {
			continue
		}
		seen[entry.ID] = struct{}{}
		next = append(next, entry)
	}
	sort.SliceStable(next, func(left int, right int) bool {
		return strings.ToLower(next[left].Term) < strings.ToLower(next[right].Term)
	})
	lex.Entries = next
	return lex
}

func NormalizeEntry(entry Entry, scope Scope, now time.Time) Entry {
	entry.ID = strings.TrimSpace(entry.ID)
	entry.Term = strings.TrimSpace(entry.Term)
	entry.Replacement = strings.TrimSpace(entry.Replacement)
	entry.Alphabet = strings.TrimSpace(entry.Alphabet)
	entry.Phoneme = strings.TrimSpace(entry.Phoneme)
	entry.Lang = strings.TrimSpace(entry.Lang)
	entry.Locale = strings.TrimSpace(entry.Locale)
	entry.Notes = strings.TrimSpace(entry.Notes)
	entry.Scope = scope
	if entry.CreatedAt.IsZero() {
		entry.CreatedAt = now
	}
	if entry.UpdatedAt.IsZero() {
		entry.UpdatedAt = entry.CreatedAt
	}
	return entry
}

type Decision struct {
	Term         string `json:"term"`
	Spoken       string `json:"spoken"`
	Source       string `json:"source"`
	EntryID      string `json:"entryId,omitempty"`
	Scope        Scope  `json:"scope,omitempty"`
	Protected    bool   `json:"protected,omitempty"`
	StartOffset  int    `json:"startOffset"`
	EndOffset    int    `json:"endOffset"`
	OriginalText string `json:"originalText"`
}

func Apply(text string, lexicons ...Lexicon) (string, []Decision) {
	output := text
	decisions := make([]Decision, 0)
	for _, lex := range lexicons {
		for _, entry := range lex.Entries {
			output, decisions = applyEntry(output, entry, decisions)
		}
	}
	return output, decisions
}

func applyEntry(input string, entry Entry, decisions []Decision) (string, []Decision) {
	if strings.TrimSpace(entry.Term) == "" || strings.TrimSpace(entry.Replacement) == "" {
		return input, decisions
	}
	patternText := `\b` + regexp.QuoteMeta(entry.Term) + `\b`
	if !entry.CaseSensitive {
		patternText = `(?i)` + patternText
	}
	pattern, err := regexp.Compile(patternText)
	if err != nil {
		return input, decisions
	}
	matches := pattern.FindAllStringIndex(input, -1)
	if len(matches) == 0 {
		return input, decisions
	}
	var builder strings.Builder
	cursor := 0
	for _, match := range matches {
		original := input[match[0]:match[1]]
		builder.WriteString(input[cursor:match[0]])
		builder.WriteString(entry.Replacement)
		decisions = append(decisions, Decision{
			Term:         entry.Term,
			Spoken:       entry.Replacement,
			Source:       "lexicon",
			EntryID:      entry.ID,
			Scope:        entry.Scope,
			Protected:    entry.Protected,
			StartOffset:  match[0],
			EndOffset:    match[1],
			OriginalText: original,
		})
		cursor = match[1]
	}
	builder.WriteString(input[cursor:])
	return builder.String(), decisions
}
