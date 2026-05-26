package alignment

import "context"

func RunForcedAlignment(
	ctx context.Context,
	request AlignRequest,
	options AlignerOptions,
) (NormalizedTiming, error) {
	return Align(ctx, request, options)
}

func ForcedAlignmentStage(ok bool, detail string) AlignmentStageReport {
	status := "unavailable"
	if ok {
		status = "selected"
	}
	return AlignmentStageReport{ID: "forced-alignment", Status: status, Detail: detail}
}
