package alignment

func NormalizeProviderTiming(request NormalizeRequest) (NormalizedTiming, bool) {
	if len(request.NativeEvents) == 0 {
		return NormalizedTiming{}, false
	}
	return NormalizeNativeEvents(request)
}

func ProviderTimingStage(ok bool, detail string) AlignmentStageReport {
	status := "unavailable"
	if ok {
		status = "selected"
	}
	return AlignmentStageReport{ID: "provider-timing", Status: status, Detail: detail}
}
