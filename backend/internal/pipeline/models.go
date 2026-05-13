package pipeline

import "time"

type JobStatus string

const (
	JobStatusQueued       JobStatus = "queued"
	JobStatusOptimizing   JobStatus = "optimizing"
	JobStatusSynthesizing JobStatus = "synthesizing"
	JobStatusChecking     JobStatus = "checking"
	JobStatusRetrying     JobStatus = "retrying"
	JobStatusCompleted    JobStatus = "completed"
	JobStatusFailed       JobStatus = "failed"
)

type StageStatus string

const (
	StageStatusWaiting StageStatus = "waiting"
	StageStatusRunning StageStatus = "running"
	StageStatusDone    StageStatus = "done"
	StageStatusFailed  StageStatus = "failed"
)

type CreateJobRequest struct {
	Text string `json:"text"`
}

type RetryMetadata struct {
	MaxRetries      int `json:"maxRetries"`
	Attempts        int `json:"attempts"`
	SegmentAttempts int `json:"segmentAttempts"`
	CurrentSegment  int `json:"currentSegment"`
	TotalSegments   int `json:"totalSegments"`
}

type PipelineStages struct {
	Optimization StageStatus `json:"optimization"`
	Synthesis    StageStatus `json:"synthesis"`
	Checker      StageStatus `json:"checker"`
}

type VoiceCheck struct {
	Complete    bool    `json:"complete"`
	Transcript  string  `json:"transcript"`
	ResumeText  string  `json:"resumeText,omitempty"`
	NeedsResume bool    `json:"needsResume"`
	Reason      string  `json:"reason"`
	Provider    string  `json:"provider"`
	Similarity  float64 `json:"similarity"`
}

type JobProgress struct {
	Message        string     `json:"message"`
	Detail         string     `json:"detail"`
	ActiveStage    string     `json:"activeStage"`
	CurrentSegment int        `json:"currentSegment,omitempty"`
	TotalSegments  int        `json:"totalSegments,omitempty"`
	StartedAt      *time.Time `json:"startedAt,omitempty"`
}

type VoiceJob struct {
	ID            string         `json:"id"`
	Status        JobStatus      `json:"status"`
	Stages        PipelineStages `json:"stages"`
	InputText     string         `json:"inputText"`
	OptimizedText string         `json:"optimizedText"`
	Optimizer     string         `json:"optimizer"`
	AudioURL      string         `json:"audioUrl"`
	AudioPath     string         `json:"audioPath,omitempty"`
	ContentType   string         `json:"contentType"`
	DurationMS    int            `json:"durationMs"`
	Provider      string         `json:"provider"`
	Voice         string         `json:"voice"`
	Retries       RetryMetadata  `json:"retries"`
	VoiceCheck    VoiceCheck     `json:"voiceCheck"`
	Progress      JobProgress    `json:"progress"`
	Error         string         `json:"error,omitempty"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	CompletedAt   *time.Time     `json:"completedAt,omitempty"`
}

type storedJob struct {
	VoiceJob
	audio []byte
}
