package agents

import "testing"

func TestCompareVoiceTranscriptAcceptsNumericPercent(t *testing.T) {
	t.Parallel()

	result := compareVoiceTranscript(
		"Hello world. CPU usage is ninety percent.",
		"Hello world. CPU usage is 90%.",
		"test",
		0.86,
	)

	if !result.Complete {
		t.Fatalf("Complete = false, reason: %s", result.Reason)
	}
	if result.NeedsResume {
		t.Fatal("NeedsResume = true, want false")
	}
}

func TestCompareVoiceTranscriptDetectsCleanCutoff(t *testing.T) {
	t.Parallel()

	result := compareVoiceTranscript(
		"Hello world. CPU usage is ninety percent.",
		"Hello world. CPU usage is",
		"test",
		0.86,
	)

	if result.Complete {
		t.Fatal("Complete = true, want false")
	}
	if !result.NeedsResume {
		t.Fatal("NeedsResume = false, want true")
	}
	if result.ResumeText != "ninety percent." {
		t.Fatalf("ResumeText = %q, want %q", result.ResumeText, "ninety percent.")
	}
}
