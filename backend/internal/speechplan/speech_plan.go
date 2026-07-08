package speechplan

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/contentir/readiumbridge"
	"github.com/justinedwards/tts-research/backend/internal/policy"
	"github.com/justinedwards/tts-research/backend/internal/ssml"
)

const SchemaVersion = "speech-plan.v1"

type Document struct {
	SchemaVersion string            `json:"schemaVersion"`
	ID            string            `json:"id"`
	SourceID      string            `json:"sourceId"`
	ProjectID     string            `json:"projectId"`
	JobID         string            `json:"jobId,omitempty"`
	GeneratedAt   time.Time         `json:"generatedAt"`
	PolicyTrace   []PolicyTraceStep `json:"policyTrace,omitempty"`
	Segments      []Segment         `json:"segments"`
	Metadata      map[string]any    `json:"metadata,omitempty"`
}

type Segment struct {
	SegmentID         string                       `json:"segmentId"`
	Index             int                          `json:"index"`
	NodeID            string                       `json:"nodeId"`
	Text              string                       `json:"text"`
	Lang              string                       `json:"lang"`
	SpeechPolicy      policy.SpeechPolicy          `json:"speechPolicy"`
	PolicyTrace       []PolicyTraceStep            `json:"policyTrace"`
	LocatorEnvelope   contentir.LocatorEnvelope    `json:"locatorEnvelope"`
	PronunciationRefs []contentir.PronunciationRef `json:"pronunciationRefs,omitempty"`
	LexiconEntryIDs   []string                     `json:"lexiconEntryIds,omitempty"`
	SerializerTargets SerializerTargets            `json:"serializerTargets"`
	Warnings          []string                     `json:"warnings,omitempty"`
}

type PolicyTraceStep struct {
	Scope     string           `json:"scope"`
	Profile   string           `json:"profile"`
	Overrides policy.Overrides `json:"overrides,omitempty"`
}

type SerializerTargets struct {
	PlainText      string          `json:"plainText"`
	SSML           string          `json:"ssml,omitempty"`
	PLSRefs        []string        `json:"plsRefs,omitempty"`
	HighlightMarks []HighlightMark `json:"highlightMarks"`
}

type HighlightMark struct {
	MarkID    string `json:"markId"`
	NodeID    string `json:"nodeId"`
	SegmentID string `json:"segmentId,omitempty"`
}

type BuildOptions struct {
	ID              string
	JobID           string
	GeneratedAt     time.Time
	PolicyTrace     []PolicyTraceStep
	LocatorKind     string
	ActiveWordStart int
}

type ManifestBoundBuildOptions struct {
	BuildOptions
	SourceID               string
	SourceRevisionID       string
	ExtractionRevisionID   string
	ReadingUnitManifestID  string
	ReadalongManifestID    string
	ReadalongUnitIDs       []string
	Units                  []ManifestBoundUnit
	VoiceID                string
	EngineID               string
	SynthesisPolicyVersion string
}

type ManifestBoundUnit struct {
	UnitID        string
	OrderKey      string
	NodeID        string
	Readiness     string
	ContentIRID   string
	Fingerprint   string
	BlockedReason string
	Warnings      []string
}

func BuildFromContentIR(document contentir.Document, options BuildOptions) (Document, error) {
	ir, err := contentir.ToV1(document)
	if err != nil {
		return Document{}, err
	}
	if options.GeneratedAt.IsZero() {
		options.GeneratedAt = time.Now().UTC()
	}
	trace := options.PolicyTrace
	if len(trace) == 0 {
		trace = defaultTrace(ir)
	}
	id := strings.TrimSpace(options.ID)
	if id == "" {
		id = ir.ID
	}
	plan := Document{
		SchemaVersion: SchemaVersion,
		ID:            id,
		SourceID:      ir.SourceID,
		ProjectID:     ir.ProjectID,
		JobID:         strings.TrimSpace(options.JobID),
		GeneratedAt:   options.GeneratedAt.UTC(),
		PolicyTrace:   trace,
		Segments:      []Segment{},
		Metadata: map[string]any{
			"contentIrSchemaVersion": ir.SchemaVersion,
			"sourceName":             ir.SourceName,
		},
	}
	for _, node := range ir.Nodes {
		text := strings.TrimSpace(node.SpeechText)
		if text == "" || !isSpeakablePolicyMode(node.Speech.SpeechPolicy.Mode) {
			continue
		}
		index := len(plan.Segments) + 1
		segmentID := "seg-" + leftPad(index, 4)
		locator := node.Provenance.Locator
		markID := firstNonEmpty(node.MarkID, "mark-"+node.NodeID)
		plainSSML := ssmlForNode(node, text)
		plan.Segments = append(plan.Segments, Segment{
			SegmentID:    segmentID,
			Index:        index,
			NodeID:       node.NodeID,
			Text:         text,
			Lang:         firstNonEmpty(node.Lang, "und"),
			SpeechPolicy: node.Speech.SpeechPolicy,
			PolicyTrace:  trace,
			LocatorEnvelope: readiumbridge.NewLocatorEnvelope(&locator, contentir.LocatorContext{
				Kind:            firstNonEmpty(options.LocatorKind, "highlight"),
				SourceID:        ir.SourceID,
				NodeID:          node.NodeID,
				ActiveWordIndex: options.ActiveWordStart + index - 1,
				TextQuote:       firstNonEmpty(node.NormalisedText, node.DisplayText, node.SpeechText),
				Title:           ir.SourceName,
				Position:        index,
			}),
			PronunciationRefs: node.PronunciationRefs,
			LexiconEntryIDs:   node.LexiconEntryIDs,
			SerializerTargets: SerializerTargets{
				PlainText: text,
				SSML:      plainSSML,
				PLSRefs:   node.LexiconEntryIDs,
				HighlightMarks: []HighlightMark{{
					MarkID:    markID,
					NodeID:    node.NodeID,
					SegmentID: segmentID,
				}},
			},
			Warnings: node.Warnings,
		})
	}
	return plan, nil
}

func BuildFirstNarratablePrefixFromContentIR(document contentir.Document, options ManifestBoundBuildOptions) (Document, error) {
	ir, err := contentir.ToV1(document)
	if err != nil {
		return Document{}, err
	}
	if len(options.Units) == 0 {
		return Document{}, fmt.Errorf("manifest-bound speech plan requires ordered manifest units")
	}
	if err := validateManifestBoundIdentity(options); err != nil {
		return Document{}, err
	}
	if err := validateManifestUnitIdentities(options.Units); err != nil {
		return Document{}, err
	}
	if options.GeneratedAt.IsZero() {
		options.GeneratedAt = time.Now().UTC()
	}
	trace := options.PolicyTrace
	if len(trace) == 0 {
		trace = defaultTrace(ir)
	}
	id := strings.TrimSpace(options.ID)
	if id == "" {
		id = ir.ID
	}
	sourceID, err := manifestBoundSourceID(options.SourceID, ir.SourceID)
	if err != nil {
		return Document{}, err
	}
	plan := Document{
		SchemaVersion: SchemaVersion,
		ID:            id,
		SourceID:      sourceID,
		ProjectID:     ir.ProjectID,
		JobID:         strings.TrimSpace(options.JobID),
		GeneratedAt:   options.GeneratedAt.UTC(),
		PolicyTrace:   trace,
		Segments:      []Segment{},
		Metadata: map[string]any{
			"contentIrSchemaVersion":  ir.SchemaVersion,
			"sourceName":              ir.SourceName,
			"sourceRevisionId":        strings.TrimSpace(options.SourceRevisionID),
			"extractionRevisionId":    strings.TrimSpace(options.ExtractionRevisionID),
			"readingUnitManifestId":   strings.TrimSpace(options.ReadingUnitManifestID),
			"readalongManifestId":     strings.TrimSpace(options.ReadalongManifestID),
			"voiceId":                 strings.TrimSpace(options.VoiceID),
			"engineId":                strings.TrimSpace(options.EngineID),
			"synthesisPolicyVersion":  strings.TrimSpace(options.SynthesisPolicyVersion),
			"segmentBindingVersion":   "speech-plan-manifest-segment.v1",
			"segmentReuseKeyStrategy": "source+unit+node+synthesisInputHash",
		},
	}
	nodes, err := nodesByIdentity(ir)
	if err != nil {
		return Document{}, err
	}
	readalongUnits := stringSet(options.ReadalongUnitIDs)
	segmentBindings := make([]map[string]any, 0)
	for _, unit := range options.Units {
		if !manifestUnitInReadalong(unit, readalongUnits) || !isNarratableReadiness(unit.Readiness) {
			break
		}
		node, nodeErr := nodeForManifestUnit(nodes, unit)
		if nodeErr != nil {
			return Document{}, nodeErr
		}
		if strings.TrimSpace(node.NodeID) == "" {
			break
		}
		text := strings.TrimSpace(node.SpeechText)
		if text == "" || !isSpeakablePolicyMode(node.Speech.SpeechPolicy.Mode) {
			break
		}
		index := len(plan.Segments) + 1
		segmentID := "seg-" + leftPad(index, 4)
		locator := node.Provenance.Locator
		markID := firstNonEmpty(node.MarkID, "mark-"+node.NodeID)
		lang := firstNonEmpty(node.Lang, "und")
		plainSSML := ssmlForNode(node, text)
		policyHash := voiceEnginePolicyHash(options, node.Speech.SpeechPolicy)
		speechHash := speechTextHash(text)
		synthesisHash := synthesisInputHash(options, node, text, plainSSML, lang)
		reuseKey := segmentReuseKey(sourceID, unit, node, synthesisHash)
		segmentNodeID := strings.TrimSpace(node.NodeID)
		warnings := append([]string{}, unit.Warnings...)
		warnings = append(warnings, node.Warnings...)
		plan.Segments = append(plan.Segments, Segment{
			SegmentID:    segmentID,
			Index:        index,
			NodeID:       segmentNodeID,
			Text:         text,
			Lang:         lang,
			SpeechPolicy: node.Speech.SpeechPolicy,
			PolicyTrace:  trace,
			LocatorEnvelope: readiumbridge.NewLocatorEnvelope(&locator, contentir.LocatorContext{
				Kind:            firstNonEmpty(options.LocatorKind, "highlight"),
				SourceID:        sourceID,
				NodeID:          segmentNodeID,
				ScopeKey:        firstNonEmpty(unit.UnitID, node.NodeID),
				ActiveWordIndex: options.ActiveWordStart + index - 1,
				TextQuote:       firstNonEmpty(node.NormalisedText, node.DisplayText, node.SpeechText),
				Title:           ir.SourceName,
				Position:        index,
			}),
			PronunciationRefs: node.PronunciationRefs,
			LexiconEntryIDs:   node.LexiconEntryIDs,
			SerializerTargets: SerializerTargets{
				PlainText: text,
				SSML:      plainSSML,
				PLSRefs:   node.LexiconEntryIDs,
				HighlightMarks: []HighlightMark{{
					MarkID:    markID,
					NodeID:    segmentNodeID,
					SegmentID: segmentID,
				}},
			},
			Warnings: uniqueStrings(warnings),
		})
		segmentBindings = append(segmentBindings, segmentBinding(plan, segmentID, unit, node, speechHash, policyHash, synthesisHash, reuseKey))
	}
	plan.Metadata["segmentBindings"] = segmentBindings
	plan.Metadata["firstNarratablePrefixSegmentCount"] = len(plan.Segments)
	return plan, nil
}

func isSpeakablePolicyMode(mode string) bool {
	switch policy.Mode(strings.TrimSpace(mode)) {
	case policy.ModeSkip, policy.ModeOnDemand, policy.ModeInteractive:
		return false
	default:
		return true
	}
}

func Encode(document Document) ([]byte, error) {
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(encoded, '\n'), nil
}

func Decode(data []byte) (Document, error) {
	var document Document
	if err := json.Unmarshal(data, &document); err != nil {
		return Document{}, err
	}
	return document, nil
}

func defaultTrace(document contentir.Document) []PolicyTraceStep {
	profile := "Enterprise"
	if len(document.Nodes) > 0 && strings.TrimSpace(document.Nodes[0].Speech.SpeechPolicy.Profile) != "" {
		profile = document.Nodes[0].Speech.SpeechPolicy.Profile
	}
	return []PolicyTraceStep{
		{Scope: "marketProfileDefault", Profile: string(policy.DefaultProfileName)},
		{Scope: "projectOverride", Profile: profile},
	}
}

func ssmlForNode(node contentir.Node, text string) string {
	if value := speechRenderString(node.Metadata, "ssml"); value != "" {
		return value
	}
	return ssml.Serialize(ssml.Document{Text: text, Lang: firstNonEmpty(node.Lang, "en")})
}

func speechRenderString(metadata contentir.Metadata, key string) string {
	raw, ok := metadata["speechRender"]
	if !ok {
		return ""
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return ""
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		return ""
	}
	value, ok := decoded[key].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func manifestBoundSourceID(optionSourceID string, irSourceID string) (string, error) {
	optionSourceID = strings.TrimSpace(optionSourceID)
	irSourceID = strings.TrimSpace(irSourceID)
	if optionSourceID != "" && irSourceID != "" && optionSourceID != irSourceID {
		return "", fmt.Errorf("manifest-bound speech plan sourceId mismatch: options sourceId %q does not match content IR sourceId %q", optionSourceID, irSourceID)
	}
	sourceID := firstNonEmpty(optionSourceID, irSourceID)
	if sourceID == "" {
		return "", fmt.Errorf("manifest-bound speech plan requires non-empty sourceId")
	}
	return sourceID, nil
}

func validateManifestBoundIdentity(options ManifestBoundBuildOptions) error {
	required := []struct {
		field string
		value string
	}{
		{field: "sourceRevisionId", value: options.SourceRevisionID},
		{field: "extractionRevisionId", value: options.ExtractionRevisionID},
		{field: "readingUnitManifestId", value: options.ReadingUnitManifestID},
		{field: "readalongManifestId", value: options.ReadalongManifestID},
	}
	for _, item := range required {
		if strings.TrimSpace(item.value) == "" {
			return fmt.Errorf("manifest-bound speech plan requires non-empty %s", item.field)
		}
	}
	return nil
}

func validateManifestUnitIdentities(units []ManifestBoundUnit) error {
	seenUnitIDs := map[string]struct{}{}
	for index, unit := range units {
		unitID := strings.TrimSpace(unit.UnitID)
		if unitID == "" {
			return fmt.Errorf("manifest-bound speech plan unit at index %d requires non-empty unitId", index)
		}
		if strings.TrimSpace(unit.OrderKey) == "" {
			return fmt.Errorf("manifest-bound speech plan unitId %q requires non-empty orderKey", unitID)
		}
		if strings.TrimSpace(unit.Fingerprint) == "" {
			return fmt.Errorf("manifest-bound speech plan unitId %q requires non-empty fingerprint", unitID)
		}
		if _, ok := seenUnitIDs[unitID]; ok {
			return fmt.Errorf("manifest-bound speech plan duplicate manifest unitId %q", unitID)
		}
		seenUnitIDs[unitID] = struct{}{}
	}
	return nil
}

func nodesByIdentity(document contentir.Document) (map[string]contentir.Node, error) {
	output := make(map[string]contentir.Node, len(document.Nodes)*2)
	for _, node := range document.Nodes {
		if id := strings.TrimSpace(node.NodeID); id != "" {
			if _, ok := output[id]; ok {
				return nil, fmt.Errorf("manifest-bound speech plan duplicate content IR nodeId %q", id)
			}
			output[id] = node
		}
	}
	return output, nil
}

func stringSet(values []string) map[string]struct{} {
	output := map[string]struct{}{}
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			output[trimmed] = struct{}{}
		}
	}
	return output
}

func manifestUnitInReadalong(unit ManifestBoundUnit, readalongUnits map[string]struct{}) bool {
	unitID := strings.TrimSpace(unit.UnitID)
	if unitID == "" {
		return false
	}
	if len(readalongUnits) == 0 {
		return true
	}
	_, ok := readalongUnits[unitID]
	return ok
}

func isNarratableReadiness(readiness string) bool {
	switch strings.TrimSpace(readiness) {
	case "narratable", "alignable":
		return true
	default:
		return false
	}
}

func nodeForManifestUnit(nodes map[string]contentir.Node, unit ManifestBoundUnit) (contentir.Node, error) {
	unitID := strings.TrimSpace(unit.UnitID)
	if nodeID := strings.TrimSpace(unit.NodeID); nodeID != "" {
		if node, ok := nodes[nodeID]; ok {
			return node, nil
		}
		return contentir.Node{}, fmt.Errorf("manifest-bound speech plan stale nodeId %q for unitId %q", nodeID, unitID)
	}
	if node, ok := nodes[unitID]; ok {
		return node, nil
	}
	return contentir.Node{}, fmt.Errorf("manifest-bound speech plan missing content IR node for unitId %q", unitID)
}

func speechTextHash(text string) string {
	return stableHash("speech-text", strings.TrimSpace(text))
}

func voiceEnginePolicyHash(options ManifestBoundBuildOptions, speechPolicy policy.SpeechPolicy) string {
	payload := struct {
		EngineID               string              `json:"engineId"`
		SpeechPolicy           policy.SpeechPolicy `json:"speechPolicy"`
		SynthesisPolicyVersion string              `json:"synthesisPolicyVersion"`
		VoiceID                string              `json:"voiceId"`
	}{
		EngineID:               strings.TrimSpace(options.EngineID),
		SpeechPolicy:           speechPolicy,
		SynthesisPolicyVersion: strings.TrimSpace(options.SynthesisPolicyVersion),
		VoiceID:                strings.TrimSpace(options.VoiceID),
	}
	return stableJSONHash("voice-engine-policy", payload)
}

func synthesisInputHash(options ManifestBoundBuildOptions, node contentir.Node, text string, ssmlText string, lang string) string {
	payload := struct {
		EngineID               string                       `json:"engineId"`
		Language               string                       `json:"language"`
		PlainText              string                       `json:"plainText"`
		PLSRefs                []string                     `json:"plsRefs,omitempty"`
		PronunciationRefs      []contentir.PronunciationRef `json:"pronunciationRefs,omitempty"`
		SSML                   string                       `json:"ssml"`
		SpeechPolicy           policy.SpeechPolicy          `json:"speechPolicy"`
		SynthesisPolicyVersion string                       `json:"synthesisPolicyVersion"`
		VoiceID                string                       `json:"voiceId"`
	}{
		EngineID:               strings.TrimSpace(options.EngineID),
		Language:               strings.TrimSpace(lang),
		PlainText:              strings.TrimSpace(text),
		PLSRefs:                append([]string{}, node.LexiconEntryIDs...),
		PronunciationRefs:      append([]contentir.PronunciationRef{}, node.PronunciationRefs...),
		SSML:                   strings.TrimSpace(ssmlText),
		SpeechPolicy:           node.Speech.SpeechPolicy,
		SynthesisPolicyVersion: strings.TrimSpace(options.SynthesisPolicyVersion),
		VoiceID:                strings.TrimSpace(options.VoiceID),
	}
	return stableJSONHash("synthesis-input", payload)
}

func segmentReuseKey(sourceID string, unit ManifestBoundUnit, node contentir.Node, synthesisHash string) string {
	return stableHash("speech-plan-segment-reuse", strings.Join([]string{
		strings.TrimSpace(sourceID),
		strings.TrimSpace(unit.UnitID),
		strings.TrimSpace(node.NodeID),
		synthesisHash,
	}, "\x00"))
}

func segmentBinding(plan Document, segmentID string, unit ManifestBoundUnit, node contentir.Node, speechHash string, policyHash string, synthesisHash string, reuseKey string) map[string]any {
	return map[string]any{
		"segmentId":             segmentID,
		"sourceId":              plan.SourceID,
		"sourceRevisionId":      plan.Metadata["sourceRevisionId"],
		"extractionRevisionId":  plan.Metadata["extractionRevisionId"],
		"readingUnitManifestId": plan.Metadata["readingUnitManifestId"],
		"readalongManifestId":   plan.Metadata["readalongManifestId"],
		"readingUnitId":         strings.TrimSpace(unit.UnitID),
		"unitId":                strings.TrimSpace(unit.UnitID),
		"nodeId":                strings.TrimSpace(node.NodeID),
		"orderKey":              strings.TrimSpace(unit.OrderKey),
		"contentIrId":           strings.TrimSpace(unit.ContentIRID),
		"unitFingerprint":       strings.TrimSpace(unit.Fingerprint),
		"speechTextHash":        speechHash,
		"voiceEnginePolicyHash": policyHash,
		"synthesisInputHash":    synthesisHash,
		"reuseKey":              reuseKey,
	}
}

func stableHash(domain string, value string) string {
	checksum := sha256.Sum256([]byte(strings.TrimSpace(domain) + "\x00" + value))
	return "sha256:" + hex.EncodeToString(checksum[:])
}

func stableJSONHash(domain string, value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return stableHash(domain, fmt.Sprintf("%#v", value))
	}
	return stableHash(domain, string(encoded))
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	output := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		output = append(output, trimmed)
	}
	return output
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func leftPad(value int, width int) string {
	text := strconv.Itoa(value)
	for len(text) < width {
		text = "0" + text
	}
	return text
}
