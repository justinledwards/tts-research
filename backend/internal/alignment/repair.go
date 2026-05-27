package alignment

import "fmt"

const AlignmentRepairSchemaVersion = "alignment-repair.v1"

type AlignmentRepairOperationKind string

const (
	RepairAdjustFragmentBoundary AlignmentRepairOperationKind = "adjust-fragment-boundary"
	RepairSplitFragment          AlignmentRepairOperationKind = "split-fragment"
	RepairMergeFragments         AlignmentRepairOperationKind = "merge-fragments"
	RepairForcePhraseFallback    AlignmentRepairOperationKind = "force-phrase-fallback"
	RepairMarkTokenUnspoken      AlignmentRepairOperationKind = "mark-token-unspoken"
	RepairMarkInsertedAudio      AlignmentRepairOperationKind = "mark-inserted-audio"
	RepairRegenerateSegment      AlignmentRepairOperationKind = "regenerate-segment"
)

type AlignmentRepairOperation struct {
	Boundary        string                       `json:"boundary,omitempty"`
	CreatedAt       string                       `json:"createdAt,omitempty"`
	DeltaMS         int                          `json:"deltaMs,omitempty"`
	FragmentIndex   int                          `json:"fragmentIndex,omitempty"`
	ID              string                       `json:"id,omitempty"`
	InsertedAudioMS int                          `json:"insertedAudioMs,omitempty"`
	Kind            AlignmentRepairOperationKind `json:"kind"`
	Reason          string                       `json:"reason"`
	SplitAtMS       int                          `json:"splitAtMs,omitempty"`
	Text            string                       `json:"text,omitempty"`
	TokenIndex      int                          `json:"tokenIndex,omitempty"`
}

type AlignmentRepairMap struct {
	ContentFingerprint string                     `json:"contentFingerprint"`
	CreatedAt          string                     `json:"createdAt,omitempty"`
	GeneratedAudioID   string                     `json:"generatedAudioId"`
	InvalidatedReason  string                     `json:"invalidatedReason,omitempty"`
	Operations         []AlignmentRepairOperation `json:"operations"`
	ProjectID          string                     `json:"projectId"`
	SchemaVersion      string                     `json:"schemaVersion"`
	SourceID           string                     `json:"sourceId"`
	SpeechPlanID       string                     `json:"speechPlanId"`
	UpdatedAt          string                     `json:"updatedAt,omitempty"`
}

type AlignmentRepairContext struct {
	ContentFingerprint string
	GeneratedAudioID   string
	ProjectID          string
	SourceID           string
	SpeechPlanID       string
}

type AlignmentRepairReport struct {
	SchemaVersion string   `json:"schemaVersion"`
	Applied       int      `json:"applied"`
	Skipped       int      `json:"skipped"`
	Stale         bool     `json:"stale"`
	StaleReason   string   `json:"staleReason,omitempty"`
	Warnings      []string `json:"warnings,omitempty"`
}

func AlignmentRepairMapStale(repairMap *AlignmentRepairMap, context AlignmentRepairContext) (bool, string) {
	if repairMap == nil {
		return false, ""
	}
	if repairMap.SchemaVersion != AlignmentRepairSchemaVersion {
		return true, "repair map schema is unsupported"
	}
	if repairMap.ProjectID != context.ProjectID {
		return true, "repair map belongs to another project"
	}
	if repairMap.SourceID != context.SourceID {
		return true, "repair map belongs to another source"
	}
	if repairMap.GeneratedAudioID != context.GeneratedAudioID {
		return true, "generated audio changed"
	}
	if repairMap.SpeechPlanID != context.SpeechPlanID {
		return true, "speech plan changed"
	}
	if repairMap.ContentFingerprint != context.ContentFingerprint {
		return true, "source, policy, or run configuration changed"
	}
	if repairMap.InvalidatedReason != "" {
		return true, repairMap.InvalidatedReason
	}
	return false, ""
}

func ApplyAlignmentRepairMap(
	timing NormalizedTiming,
	repairMap *AlignmentRepairMap,
	context AlignmentRepairContext,
) (NormalizedTiming, AlignmentRepairReport) {
	report := AlignmentRepairReport{SchemaVersion: "alignment-repair-report.v1"}
	if repairMap == nil || len(repairMap.Operations) == 0 {
		return timing, report
	}
	if stale, reason := AlignmentRepairMapStale(repairMap, context); stale {
		report.Stale = true
		report.StaleReason = reason
		report.Skipped = len(repairMap.Operations)
		report.Warnings = []string{"stale alignment repair map was not applied: " + reason}
		return timing, report
	}

	repaired := cloneNormalizedTiming(timing)
	for _, operation := range repairMap.Operations {
		if applyAlignmentRepairOperation(&repaired, operation, &report) {
			report.Applied++
		} else {
			report.Skipped++
		}
	}
	if report.Applied > 0 {
		repaired.Fragments.Warnings = uniqueWarnings(append(repaired.Fragments.Warnings, report.Warnings...))
		repaired.Tokens.Warnings = uniqueWarnings(append(repaired.Tokens.Warnings, report.Warnings...))
		repaired.Fragments.Fragments, repaired.Tokens.Tokens, repaired.Fragments.Drift = CorrectDrift(
			repaired.Fragments.Fragments,
			repaired.Tokens.Tokens,
			repaired.Fragments.DurationMS,
		)
		repaired.Tokens.Drift = repaired.Fragments.Drift
	}
	return repaired, report
}

func applyAlignmentRepairOperation(
	timing *NormalizedTiming,
	operation AlignmentRepairOperation,
	report *AlignmentRepairReport,
) bool {
	switch operation.Kind {
	case RepairAdjustFragmentBoundary:
		return applyBoundaryRepair(timing, operation)
	case RepairSplitFragment:
		return applySplitRepair(timing, operation)
	case RepairMergeFragments:
		return applyMergeRepair(timing, operation)
	case RepairForcePhraseFallback:
		timing.Tokens.Confidence.Token = 0
		timing.Tokens.Drift.LowConfidence = true
		timing.Fragments.Drift.LowConfidence = true
		report.Warnings = append(report.Warnings, repairWarning(operation, "forced phrase-level fallback"))
		return true
	case RepairMarkTokenUnspoken:
		if operation.TokenIndex < 0 || operation.TokenIndex >= len(timing.Tokens.Tokens) {
			return false
		}
		timing.Tokens.Tokens[operation.TokenIndex].Confidence = 0
		report.Warnings = append(report.Warnings, repairWarning(operation, "marked token as unspoken"))
		return true
	case RepairMarkInsertedAudio:
		report.Warnings = append(report.Warnings, repairWarning(operation, "marked inserted audio"))
		return true
	case RepairRegenerateSegment:
		report.Warnings = append(report.Warnings, repairWarning(operation, "segment regeneration requested"))
		return true
	default:
		return false
	}
}

func applyBoundaryRepair(timing *NormalizedTiming, operation AlignmentRepairOperation) bool {
	if operation.FragmentIndex < 0 || operation.FragmentIndex >= len(timing.Fragments.Fragments) || operation.DeltaMS == 0 {
		return false
	}
	fragment := &timing.Fragments.Fragments[operation.FragmentIndex]
	if operation.Boundary == "start" {
		fragment.StartMS = maxInt(0, fragment.StartMS+operation.DeltaMS)
		if fragment.StartMS >= fragment.EndMS {
			fragment.StartMS = maxInt(0, fragment.EndMS-1)
		}
		return true
	}
	fragment.EndMS = maxInt(fragment.StartMS+1, fragment.EndMS+operation.DeltaMS)
	if fragment.EndMS > timing.Fragments.DurationMS {
		fragment.EndMS = timing.Fragments.DurationMS
	}
	return true
}

func applySplitRepair(timing *NormalizedTiming, operation AlignmentRepairOperation) bool {
	if operation.FragmentIndex < 0 || operation.FragmentIndex >= len(timing.Fragments.Fragments) {
		return false
	}
	fragment := timing.Fragments.Fragments[operation.FragmentIndex]
	splitAt := operation.SplitAtMS
	if splitAt <= fragment.StartMS || splitAt >= fragment.EndMS {
		splitAt = fragment.StartMS + ((fragment.EndMS - fragment.StartMS) / 2)
	}
	if splitAt <= fragment.StartMS || splitAt >= fragment.EndMS {
		return false
	}
	left := fragment
	right := fragment
	left.EndMS = splitAt
	right.StartMS = splitAt
	right.Text = operation.Text
	if right.Text == "" {
		right.Text = fragment.Text
	}
	fragments := append([]FragmentTiming{}, timing.Fragments.Fragments[:operation.FragmentIndex]...)
	fragments = append(fragments, left, right)
	fragments = append(fragments, timing.Fragments.Fragments[operation.FragmentIndex+1:]...)
	timing.Fragments.Fragments = reindexFragments(fragments)
	for index := range timing.Tokens.Tokens {
		if timing.Tokens.Tokens[index].FragmentIndex == operation.FragmentIndex && timing.Tokens.Tokens[index].StartMS >= splitAt {
			timing.Tokens.Tokens[index].FragmentIndex = operation.FragmentIndex + 1
		}
	}
	return true
}

func applyMergeRepair(timing *NormalizedTiming, operation AlignmentRepairOperation) bool {
	if operation.FragmentIndex < 0 || operation.FragmentIndex+1 >= len(timing.Fragments.Fragments) {
		return false
	}
	left := timing.Fragments.Fragments[operation.FragmentIndex]
	right := timing.Fragments.Fragments[operation.FragmentIndex+1]
	left.EndMS = maxInt(left.EndMS, right.EndMS)
	if operation.Text != "" {
		left.Text = operation.Text
	} else if right.Text != "" {
		left.Text = left.Text + " " + right.Text
	}
	fragments := append([]FragmentTiming{}, timing.Fragments.Fragments[:operation.FragmentIndex]...)
	fragments = append(fragments, left)
	fragments = append(fragments, timing.Fragments.Fragments[operation.FragmentIndex+2:]...)
	timing.Fragments.Fragments = reindexFragments(fragments)
	for index := range timing.Tokens.Tokens {
		if timing.Tokens.Tokens[index].FragmentIndex == operation.FragmentIndex+1 {
			timing.Tokens.Tokens[index].FragmentIndex = operation.FragmentIndex
		} else if timing.Tokens.Tokens[index].FragmentIndex > operation.FragmentIndex+1 {
			timing.Tokens.Tokens[index].FragmentIndex--
		}
	}
	return true
}

func cloneNormalizedTiming(timing NormalizedTiming) NormalizedTiming {
	timing.Fragments.Fragments = append([]FragmentTiming(nil), timing.Fragments.Fragments...)
	timing.Fragments.Warnings = append([]string(nil), timing.Fragments.Warnings...)
	timing.Tokens.Tokens = append([]TokenTiming(nil), timing.Tokens.Tokens...)
	timing.Tokens.Warnings = append([]string(nil), timing.Tokens.Warnings...)
	return timing
}

func repairWarning(operation AlignmentRepairOperation, label string) string {
	if operation.Reason == "" {
		return label
	}
	return fmt.Sprintf("%s: %s", label, operation.Reason)
}

func reindexFragments(fragments []FragmentTiming) []FragmentTiming {
	for index := range fragments {
		fragments[index].Index = index
	}
	return fragments
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
