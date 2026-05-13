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

func TestCompareVoiceTranscriptAcceptsDomainAndAcronymVariants(t *testing.T) {
	t.Parallel()

	result := compareVoiceTranscript(
		"Send the Interim dot U S Domain Template to seattle dot W A dot U S and update D N S entries.",
		"Send the Interim .US Domain Template to seattle.wa.us and update DNS entries.",
		"test",
		0.9,
	)

	if !result.Complete {
		t.Fatalf("Complete = false, reason: %s, similarity: %f", result.Reason, result.Similarity)
	}
}

func TestCompareVoiceTranscriptAcceptsWildcardDomainVariants(t *testing.T) {
	t.Parallel()

	result := compareVoiceTranscript(
		"Setting up a free wildcard dot city dot state dot U S locality domain.",
		"Setting up a free *city.state.us* locality domain.",
		"test",
		0.9,
	)

	if !result.Complete {
		t.Fatalf("Complete = false, reason: %s, similarity: %f", result.Reason, result.Similarity)
	}
}

func TestCompareVoiceTranscriptAcceptsASRDotFragments(t *testing.T) {
	t.Parallel()

	result := compareVoiceTranscript(
		"Send the Interim dot U S Domain Template to seattle dot W A dot U S and configure D N S records in A W S Lightsail.",
		"Send the interim .us domain template to Seattle .wa .us and configure DNS records in a WS Lightsail.",
		"test",
		0.9,
	)

	if !result.Complete {
		t.Fatalf("Complete = false, reason: %s, similarity: %f", result.Reason, result.Similarity)
	}
}
