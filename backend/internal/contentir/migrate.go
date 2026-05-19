package contentir

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var ErrUnsupportedSchemaVersion = errors.New("unsupported content IR schema version")

func Migrate(document Document) (Document, error) {
	version := strings.TrimSpace(document.SchemaVersion)
	switch version {
	case SchemaVersionV1:
		return normalizeReleasedV1(document), nil
	case "":
		return Document{}, fmt.Errorf("%w: missing schemaVersion", ErrUnsupportedSchemaVersion)
	default:
		return Document{}, fmt.Errorf("%w: %s", ErrUnsupportedSchemaVersion, version)
	}
}

func ToSchemaVersion(document Document, version string) (Document, error) {
	switch strings.TrimSpace(version) {
	case "", SchemaVersionV1:
		return ToV1(document)
	default:
		return Document{}, fmt.Errorf("%w: %s", ErrUnsupportedSchemaVersion, version)
	}
}

func ToV1(document Document) (Document, error) {
	version := strings.TrimSpace(document.SchemaVersion)
	switch version {
	case SchemaVersionV1:
		return normalizeReleasedV1(document), nil
	case "":
		return Document{}, fmt.Errorf("%w: missing schemaVersion", ErrUnsupportedSchemaVersion)
	default:
		return Document{}, fmt.Errorf("%w: %s", ErrUnsupportedSchemaVersion, version)
	}
}

func normalizeReleasedV1(document Document) Document {
	document.SchemaVersion = SchemaVersionV1
	for index := range document.Nodes {
		node := document.Nodes[index]
		node.Provenance.Locator = locatorToReleasedV1(node.Provenance.Locator)
		refs := pronunciationRefsFromMetadata(node.Metadata)
		if len(node.PronunciationRefs) == 0 {
			node.PronunciationRefs = refs
		}
		if len(node.LexiconEntryIDs) == 0 {
			node.LexiconEntryIDs = lexiconEntryIDs(node.PronunciationRefs)
		}
		if node.Phoneme == "" || node.Alphabet == "" {
			for _, ref := range node.PronunciationRefs {
				if node.Phoneme == "" {
					node.Phoneme = ref.Phoneme
				}
				if node.Alphabet == "" {
					node.Alphabet = ref.Alphabet
				}
				if node.Phoneme != "" && node.Alphabet != "" {
					break
				}
			}
		}
		if node.SayAs == "" {
			node.SayAs = sayAsFromMetadata(node.Metadata)
		}
		if node.MarkID == "" && strings.TrimSpace(node.SpeechText) != "" {
			node.MarkID = "mark-" + node.NodeID
		}
		document.Nodes[index] = node
	}
	return document
}

func locatorToReleasedV1(locator Locator) Locator {
	if locator.Type == "epub" && locator.EPUB == nil && locator.HTML != nil {
		locator.EPUB = &EPUBLocator{
			Href:        locator.HTML.Href,
			Fragment:    locator.HTML.Fragment,
			TextQuote:   locator.HTML.TextQuote,
			Progression: locator.HTML.Progression,
			EPUBCFI:     locator.HTML.EPUBCFI,
		}
		locator.HTML = nil
	}
	return locator
}

func pronunciationRefsFromMetadata(metadata Metadata) []PronunciationRef {
	render, ok := metadata["speechRender"]
	if !ok {
		return nil
	}
	renderMap, ok := render.(map[string]any)
	if !ok {
		if converted := structToMap(render); converted != nil {
			renderMap = converted
		} else {
			return nil
		}
	}
	raw, ok := renderMap["pronunciations"]
	if !ok {
		return nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	refs := make([]PronunciationRef, 0, len(items))
	for _, item := range items {
		value, ok := item.(map[string]any)
		if !ok {
			continue
		}
		ref := PronunciationRef{
			Term:         stringValue(value, "term"),
			Spoken:       stringValue(value, "spoken"),
			Source:       stringValue(value, "source"),
			EntryID:      firstNonEmpty(stringValue(value, "entryId"), stringValue(value, "entryID")),
			Scope:        stringValue(value, "scope"),
			Protected:    boolValue(value, "protected"),
			StartOffset:  intValue(value, "startOffset"),
			EndOffset:    intValue(value, "endOffset"),
			OriginalText: stringValue(value, "originalText"),
			Phoneme:      stringValue(value, "phoneme"),
			Alphabet:     stringValue(value, "alphabet"),
		}
		if ref.Term != "" || ref.EntryID != "" {
			refs = append(refs, ref)
		}
	}
	return refs
}

func lexiconEntryIDs(refs []PronunciationRef) []string {
	seen := map[string]struct{}{}
	ids := make([]string, 0)
	for _, ref := range refs {
		id := strings.TrimSpace(ref.EntryID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func sayAsFromMetadata(metadata Metadata) string {
	render, ok := metadata["speechRender"]
	if !ok {
		return ""
	}
	renderMap, ok := render.(map[string]any)
	if !ok {
		if converted := structToMap(render); converted != nil {
			renderMap = converted
		} else {
			return ""
		}
	}
	raw, ok := renderMap["normalisations"]
	if !ok {
		return ""
	}
	items, ok := raw.([]any)
	if !ok || len(items) == 0 {
		return ""
	}
	first, ok := items[0].(map[string]any)
	if !ok {
		return ""
	}
	return firstNonEmpty(stringValue(first, "kind"), stringValue(first, "rule"))
}

func structToMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	case fmt.Stringer:
		return map[string]any{"value": typed.String()}
	default:
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil
		}
		var decoded map[string]any
		if err := json.Unmarshal(encoded, &decoded); err != nil {
			return nil
		}
		return decoded
	}
}

func stringValue(value map[string]any, key string) string {
	raw, ok := value[key]
	if !ok {
		return ""
	}
	switch typed := raw.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func intValue(value map[string]any, key string) int {
	raw, ok := value[key]
	if !ok {
		return 0
	}
	switch typed := raw.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func boolValue(value map[string]any, key string) bool {
	raw, ok := value[key]
	if !ok {
		return false
	}
	typed, _ := raw.(bool)
	return typed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
