package pipeline

import "testing"

func TestResolveSegmentSettings_AdaptiveModeOnlyAffectsReferenceProfiles(t *testing.T) {
	t.Parallel()

	service := NewService(
		nil,
		nil,
		nil,
		Options{
			SegmentWorkers:                2,
			SegmentMaxRunes:               240,
			StudioSegmentWorkers:          3,
			StudioSegmentMaxRunes:         210,
			StudioSegmentWorkersAdaptive:  6,
			StudioSegmentMaxRunesAdaptive: 120,
			JobDataDir:                    t.TempDir(),
			ProjectDataDir:                t.TempDir(),
		},
	)

	nonReferenceWorkers, nonReferenceRunes := service.resolveSegmentSettings(false, true)
	if nonReferenceWorkers != 2 {
		t.Fatalf("non-reference workers = %d, want %d", nonReferenceWorkers, 2)
	}
	if nonReferenceRunes != 240 {
		t.Fatalf("non-reference max runes = %d, want %d", nonReferenceRunes, 240)
	}

	referenceWorkers, referenceRunes := service.resolveSegmentSettings(true, true)
	if referenceWorkers != 6 {
		t.Fatalf("reference workers = %d, want %d", referenceWorkers, 6)
	}
	if referenceRunes != 120 {
		t.Fatalf("reference max runes = %d, want %d", referenceRunes, 120)
	}
}

func TestResolveSegmentSettings_PerformanceModes(t *testing.T) {
	t.Parallel()

	service := NewService(
		nil,
		nil,
		nil,
		Options{
			SegmentWorkers:                2,
			SegmentMaxRunes:               240,
			StudioSegmentWorkers:          3,
			StudioSegmentMaxRunes:         210,
			StudioSegmentWorkersAdaptive:  6,
			StudioSegmentMaxRunesAdaptive: 120,
			JobDataDir:                    t.TempDir(),
			ProjectDataDir:                t.TempDir(),
		},
	)

	balancedWorkers, balancedRunes := service.resolveSegmentSettingsForMode(true, PerformanceModeBalanced)
	if balancedWorkers != 3 || balancedRunes != 210 {
		t.Fatalf("balanced reference settings = (%d, %d), want (3, 210)", balancedWorkers, balancedRunes)
	}

	throughputWorkers, throughputRunes := service.resolveSegmentSettingsForMode(true, PerformanceModeThroughput)
	if throughputWorkers != 6 || throughputRunes != 120 {
		t.Fatalf("throughput reference settings = (%d, %d), want (6, 120)", throughputWorkers, throughputRunes)
	}

	qualityWorkers, qualityRunes := service.resolveSegmentSettingsForMode(true, PerformanceModeQuality)
	if qualityWorkers != 1 || qualityRunes != 240 {
		t.Fatalf("quality reference settings = (%d, %d), want (1, 240)", qualityWorkers, qualityRunes)
	}
}

func TestResolveSegmentSettings_CapsReferenceWorkersToClonePool(t *testing.T) {
	t.Parallel()

	service := NewService(
		nil,
		nil,
		nil,
		Options{
			SegmentWorkers:                2,
			SegmentMaxRunes:               240,
			StudioSegmentWorkers:          3,
			StudioSegmentMaxRunes:         210,
			StudioSegmentWorkersAdaptive:  6,
			StudioSegmentMaxRunesAdaptive: 120,
			ReferenceWorkerCount:          1,
			JobDataDir:                    t.TempDir(),
			ProjectDataDir:                t.TempDir(),
		},
	)

	referenceWorkers, referenceRunes := service.resolveSegmentSettingsForMode(
		true,
		PerformanceModeThroughput,
	)
	if referenceWorkers != 1 {
		t.Fatalf("reference workers = %d, want clone worker cap %d", referenceWorkers, 1)
	}
	if referenceRunes != 120 {
		t.Fatalf("reference max runes = %d, want %d", referenceRunes, 120)
	}

	nonReferenceWorkers, _ := service.resolveSegmentSettingsForMode(
		false,
		PerformanceModeThroughput,
	)
	if nonReferenceWorkers != 2 {
		t.Fatalf("non-reference workers = %d, want uncapped base workers %d", nonReferenceWorkers, 2)
	}
}
