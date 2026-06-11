package pipeline

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/contentir/readiumbridge"
	"github.com/justinedwards/tts-research/backend/internal/policy"
	"github.com/justinedwards/tts-research/backend/internal/speechplan"
	"github.com/justinedwards/tts-research/backend/internal/ssml"
)

func (service *Service) writeJobSpeechPlan(id string) error {
	job, err := service.storedJobSnapshot(id)
	if err != nil {
		return err
	}
	plan := jobSpeechPlan(job.VoiceJob, time.Now().UTC())
	jobDir, err := service.jobArtifactDir(id)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		return err
	}
	encoded, err := speechplan.Encode(plan)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(jobDir, speechPlanFilename), encoded, 0o644)
}

func (service *Service) GetJobSpeechPlan(id string) (speechplan.Document, error) {
	if _, err := service.GetJob(id); err != nil {
		return speechplan.Document{}, err
	}
	jobDir, err := service.jobArtifactDir(id)
	if err != nil {
		return speechplan.Document{}, err
	}
	data, err := os.ReadFile(filepath.Join(jobDir, speechPlanFilename))
	if err == nil {
		return speechplan.Decode(data)
	}
	if !os.IsNotExist(err) {
		return speechplan.Document{}, err
	}
	if err := service.writeJobSpeechPlan(id); err != nil {
		return speechplan.Document{}, err
	}
	data, err = os.ReadFile(filepath.Join(jobDir, speechPlanFilename))
	if err != nil {
		return speechplan.Document{}, err
	}
	return speechplan.Decode(data)
}

func jobSpeechPlan(job VoiceJob, generatedAt time.Time) speechplan.Document {
	sourceID := firstNonEmpty(job.PreparedSourceID, job.BookSourceID, job.TemporarySourceID, job.ID)
	trace := jobPolicyTrace(job)
	plan := speechplan.Document{
		SchemaVersion: speechplan.SchemaVersion,
		ID:            job.ID,
		SourceID:      sourceID,
		ProjectID:     job.ProjectID,
		JobID:         job.ID,
		GeneratedAt:   generatedAt.UTC(),
		PolicyTrace:   trace,
		Segments:      []speechplan.Segment{},
		Metadata: map[string]any{
			"sourceKind":          job.SourceKind,
			"speechRenderApplied": job.SpeechRenderApplied,
			"ttsEngine":           job.TTSEngine,
		},
	}
	for _, segment := range job.Segments {
		text := strings.TrimSpace(segment.Text)
		if text == "" {
			continue
		}
		segmentID := "job-seg-" + leftPadInt(segment.Index, 4)
		policyDecision := policy.SpeechPolicy{
			Profile:     firstNonEmpty(job.SpeechPolicyProfile, string(policy.DefaultProfileName)),
			Element:     "prose",
			ElementMode: "speak",
			Mode:        string(policy.ModeSpeak),
			Explanation: "Speech plan segment uses resolved synthesis text after project, source, and session policy preprocessing.",
		}
		envelope := readiumbridge.NewLocatorEnvelope(nil, contentir.LocatorContext{
			Kind:            "highlight",
			SourceID:        sourceID,
			ScopeKey:        scopeKeyForJob(job),
			ActiveWordIndex: max(0, segment.Index-1),
			TextQuote:       textQuote(text),
			Position:        segment.Index,
		})
		plan.Segments = append(plan.Segments, speechplan.Segment{
			SegmentID:       segmentID,
			Index:           segment.Index,
			NodeID:          "",
			Text:            text,
			Lang:            firstNonEmpty(job.TTSLanguage, job.Locale, job.VoiceProfileLanguage, "und"),
			SpeechPolicy:    policyDecision,
			PolicyTrace:     trace,
			LocatorEnvelope: envelope,
			SerializerTargets: speechplan.SerializerTargets{
				PlainText: text,
				SSML:      ssml.Serialize(ssml.Document{Text: text, Lang: firstNonEmpty(job.TTSLanguage, job.Locale, "en")}),
				HighlightMarks: []speechplan.HighlightMark{{
					MarkID:    "mark-" + segmentID,
					SegmentID: segmentID,
				}},
			},
			Warnings: job.SegmentationWarnings,
		})
	}
	return plan
}

func jobPolicyTrace(job VoiceJob) []speechplan.PolicyTraceStep {
	trace := []speechplan.PolicyTraceStep{
		{Scope: "marketProfileDefault", Profile: string(policy.DefaultProfileName)},
	}
	profile := firstNonEmpty(job.SpeechPolicyProfile, string(policy.DefaultProfileName))
	trace = append(trace, speechplan.PolicyTraceStep{Scope: "projectOverride", Profile: profile})
	if strings.TrimSpace(job.PreparedSourceID) != "" || strings.TrimSpace(job.BookSourceID) != "" {
		trace = append(trace, speechplan.PolicyTraceStep{Scope: "sourceOverride", Profile: profile})
	}
	if job.SpeechPolicyOverrides != (policy.Overrides{}) {
		trace = append(trace, speechplan.PolicyTraceStep{
			Scope:     "sessionOverride",
			Profile:   profile,
			Overrides: job.SpeechPolicyOverrides,
		})
	}
	return trace
}

func leftPadInt(value int, width int) string {
	text := strconv.Itoa(value)
	for len(text) < width {
		text = "0" + text
	}
	return text
}
