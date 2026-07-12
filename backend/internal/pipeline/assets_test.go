package pipeline

import (
	"errors"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
)

func TestDeleteVoiceProfileBlocksActiveJobReferences(t *testing.T) {
	t.Parallel()

	service := NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		Options{JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir(), VoiceProfileDir: t.TempDir()},
	)
	now := time.Now().UTC()
	service.profiles["profile-1"] = storedVoiceProfile{VoiceProfile: VoiceProfile{
		ID:        "profile-1",
		Name:      "Narrator",
		Language:  "en",
		Status:    VoiceProfileStatusReady,
		CreatedAt: now,
		UpdatedAt: now,
	}}
	service.jobs["job-1"] = storedJob{VoiceJob: VoiceJob{
		ID:             "job-1",
		ProjectID:      defaultProjectID,
		Status:         JobStatusSynthesizing,
		VoiceProfileID: "profile-1",
		CreatedAt:      now,
		UpdatedAt:      now,
	}}

	if err := service.DeleteVoiceProfile("profile-1"); !errors.Is(err, ErrAssetInUse) {
		t.Fatalf("DeleteVoiceProfile(active job) error = %v, want asset in use", err)
	}
	service.jobs["job-1"] = storedJob{VoiceJob: VoiceJob{
		ID:             "job-1",
		ProjectID:      defaultProjectID,
		Status:         JobStatusCompleted,
		VoiceProfileID: "profile-1",
		CreatedAt:      now,
		UpdatedAt:      now,
	}}
	if err := service.DeleteVoiceProfile("profile-1"); err != nil {
		t.Fatalf("DeleteVoiceProfile(completed job) returned error: %v", err)
	}
	if _, err := service.GetVoiceProfile("profile-1"); !errors.Is(err, ErrProfileNotFound) {
		t.Fatalf("GetVoiceProfile deleted error = %v, want not found", err)
	}
}
