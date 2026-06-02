package pipeline

import (
	"fmt"
	"strings"
	"time"
)

func preparedSourceNeedsMetadataReadiness(source PreparedSource) SourceReadiness {
	return SourceReadiness{
		State:          SourceReadinessStateNeedsMetadata,
		Title:          firstNonEmpty(source.Title, source.SourceName, "Untitled source"),
		SourceType:     preparedReadinessSourceType(source),
		Language:       sourceReadinessLanguage(source.Metadata),
		StructureLabel: preparedReadinessStructureLabel(source),
		Confidence:     preparedReadinessConfidence(source),
		Detail:         "Confirm title, source type, language, and structure before Review opens.",
		RetryAction:    "confirmMetadata",
	}
}

func bookSourceNeedsMetadataReadiness(book BookSource) SourceReadiness {
	return SourceReadiness{
		State:          SourceReadinessStateNeedsMetadata,
		Title:          firstNonEmpty(book.Title, book.SourceFile, "Untitled source"),
		SourceType:     bookReadinessSourceType(book),
		Language:       "Project default",
		StructureLabel: bookReadinessStructureLabel(book),
		Confidence:     bookReadinessConfidence(book),
		Detail:         "Confirm title, source type, language, and structure before Review opens.",
		RetryAction:    "confirmMetadata",
	}
}

func preparedSourceFailedReadiness(source PreparedSource, stage SourceReadinessFailureStage, detail string) SourceReadiness {
	return SourceReadiness{
		State:          SourceReadinessStateFailed,
		Title:          firstNonEmpty(source.Title, source.SourceName, "Untitled source"),
		SourceType:     preparedReadinessSourceType(source),
		Language:       sourceReadinessLanguage(source.Metadata),
		StructureLabel: preparedReadinessStructureLabel(source),
		Confidence:     "low",
		FailureStage:   stage,
		Detail:         firstNonEmpty(detail, source.Error, "Source preparation failed."),
		RetryAction:    "retryImport",
	}
}

func bookSourceFailedReadiness(book BookSource, stage SourceReadinessFailureStage, detail string) SourceReadiness {
	return SourceReadiness{
		State:          SourceReadinessStateFailed,
		Title:          firstNonEmpty(book.Title, book.SourceFile, "Untitled source"),
		SourceType:     bookReadinessSourceType(book),
		Language:       "Project default",
		StructureLabel: bookReadinessStructureLabel(book),
		Confidence:     "low",
		FailureStage:   stage,
		Detail:         firstNonEmpty(detail, book.Error, "Source extraction failed."),
		RetryAction:    "retryImport",
	}
}

func confirmedPreparedSourceReadiness(source PreparedSource, request SourceReadinessConfirmationRequest, now time.Time) SourceReadiness {
	preparedAt := now
	title := firstNonEmpty(request.Title, source.Title, source.SourceName, "Untitled source")
	return SourceReadiness{
		State:           SourceReadinessStateReady,
		Title:           title,
		SourceType:      firstNonEmpty(request.SourceType, preparedReadinessSourceType(source)),
		Language:        firstNonEmpty(request.Language, sourceReadinessLanguage(source.Metadata)),
		StructureLabel:  firstNonEmpty(request.StructureLabel, request.StructureChoice, preparedReadinessStructureLabel(source)),
		Confidence:      preparedReadinessConfidence(source),
		ConfirmedFields: confirmedSourceReadinessFields(request),
		PreparedAt:      &preparedAt,
		Detail:          "Source metadata, structure, language, and policy defaults are confirmed for Review.",
		RetryAction:     "reconfirmMetadata",
	}
}

func confirmedBookSourceReadiness(book BookSource, request SourceReadinessConfirmationRequest, now time.Time) SourceReadiness {
	preparedAt := now
	return SourceReadiness{
		State:           SourceReadinessStateReady,
		Title:           firstNonEmpty(request.Title, book.Title, book.SourceFile, "Untitled source"),
		SourceType:      firstNonEmpty(request.SourceType, bookReadinessSourceType(book)),
		Language:        firstNonEmpty(request.Language, "Project default"),
		StructureLabel:  firstNonEmpty(request.StructureLabel, request.StructureChoice, bookReadinessStructureLabel(book)),
		Confidence:      bookReadinessConfidence(book),
		ConfirmedFields: confirmedSourceReadinessFields(request),
		PreparedAt:      &preparedAt,
		Detail:          "Source metadata, structure, language, and policy defaults are confirmed for Review.",
		RetryAction:     "reconfirmMetadata",
	}
}

func ensurePreparedSourceReadiness(source PreparedSource) PreparedSource {
	if source.Status == PreparedSourceStatusFailed {
		readiness := preparedSourceFailedReadiness(source, SourceReadinessFailureStructure, source.Error)
		source.SourceReadiness = &readiness
		return source
	}
	if source.SourceReadiness == nil {
		readiness := preparedSourceNeedsMetadataReadiness(source)
		source.SourceReadiness = &readiness
		return source
	}
	source.SourceReadiness = normalizePreparedSourceReadiness(source, *source.SourceReadiness)
	return source
}

func ensureBookSourceReadiness(book BookSource) BookSource {
	if book.Status == BookSourceStatusFailed {
		readiness := bookSourceFailedReadiness(book, SourceReadinessFailureExtraction, book.Error)
		book.SourceReadiness = &readiness
		return book
	}
	if book.SourceReadiness == nil {
		readiness := bookSourceNeedsMetadataReadiness(book)
		book.SourceReadiness = &readiness
		return book
	}
	book.SourceReadiness = normalizeBookSourceReadiness(book, *book.SourceReadiness)
	return book
}

func normalizePreparedSourceReadiness(source PreparedSource, readiness SourceReadiness) *SourceReadiness {
	if readiness.Title == "" {
		readiness.Title = firstNonEmpty(source.Title, source.SourceName, "Untitled source")
	}
	if readiness.SourceType == "" {
		readiness.SourceType = preparedReadinessSourceType(source)
	}
	if readiness.Language == "" {
		readiness.Language = sourceReadinessLanguage(source.Metadata)
	}
	if readiness.StructureLabel == "" {
		readiness.StructureLabel = preparedReadinessStructureLabel(source)
	}
	if readiness.Confidence == "" {
		readiness.Confidence = preparedReadinessConfidence(source)
	}
	if readiness.State == SourceReadinessStateReady && readiness.PreparedAt != nil && source.UpdatedAt.After(*readiness.PreparedAt) {
		readiness.State = SourceReadinessStateStale
		readiness.StaleReason = "Source changed after metadata confirmation."
		readiness.Detail = "Refresh or reconfirm source metadata before Review opens."
		readiness.RetryAction = "reconfirmMetadata"
	}
	if readiness.Detail == "" {
		readiness.Detail = "Source readiness is available."
	}
	return &readiness
}

func normalizeBookSourceReadiness(book BookSource, readiness SourceReadiness) *SourceReadiness {
	if readiness.Title == "" {
		readiness.Title = firstNonEmpty(book.Title, book.SourceFile, "Untitled source")
	}
	if readiness.SourceType == "" {
		readiness.SourceType = bookReadinessSourceType(book)
	}
	if readiness.Language == "" {
		readiness.Language = "Project default"
	}
	if readiness.StructureLabel == "" {
		readiness.StructureLabel = bookReadinessStructureLabel(book)
	}
	if readiness.Confidence == "" {
		readiness.Confidence = bookReadinessConfidence(book)
	}
	if readiness.State == SourceReadinessStateReady && readiness.PreparedAt != nil && book.UpdatedAt.After(*readiness.PreparedAt) {
		readiness.State = SourceReadinessStateStale
		readiness.StaleReason = "Source changed after metadata confirmation."
		readiness.Detail = "Refresh or reconfirm source metadata before Review opens."
		readiness.RetryAction = "reconfirmMetadata"
	}
	if readiness.Detail == "" {
		readiness.Detail = "Source readiness is available."
	}
	return &readiness
}

func confirmedSourceReadinessFields(request SourceReadinessConfirmationRequest) []string {
	fields := []string{"title", "sourceType", "language", "structure"}
	if strings.TrimSpace(request.SpeechPolicyProfile) != "" {
		fields = append(fields, "policy")
	}
	if strings.TrimSpace(request.VoiceProfileID) != "" {
		fields = append(fields, "voice")
	}
	if request.Scope != nil {
		fields = append(fields, "scope")
	}
	return fields
}

func preparedReadinessSourceType(source PreparedSource) string {
	switch source.Kind {
	case PreparedSourceKindURL:
		return "webpage"
	case PreparedSourceKindText:
		return "draft"
	case PreparedSourceKindBook:
		return "book"
	default:
		return "document"
	}
}

func bookReadinessSourceType(book BookSource) string {
	if book.Kind == BookSourceKindHTML {
		return "webpage"
	}
	return "book"
}

func preparedReadinessStructureLabel(source PreparedSource) string {
	if source.Summary.SpokenBlockCount > 0 || source.BlockCount > 0 {
		return strings.TrimSpace(formatCount(source.Summary.SpokenBlockCount, "spoken block"))
	}
	if source.SegmentCount > 0 {
		return strings.TrimSpace(formatCount(source.SegmentCount, "sentence segment"))
	}
	return "Structure needs review"
}

func bookReadinessStructureLabel(book BookSource) string {
	if len(book.Sections) > 0 {
		return formatCount(len(book.Sections), "section")
	}
	if book.ChapterCount > 0 {
		return formatCount(book.ChapterCount, "chapter")
	}
	if book.PageCount > 0 {
		return formatCount(book.PageCount, "page")
	}
	return "Structure needs review"
}

func preparedReadinessConfidence(source PreparedSource) string {
	if source.Status != PreparedSourceStatusReady || source.BlockCount == 0 {
		return "low"
	}
	if source.Summary.SpokenBlockCount == 0 || len(source.Warnings) > 0 {
		return "medium"
	}
	return "high"
}

func bookReadinessConfidence(book BookSource) string {
	if book.Ingestion != nil && book.Ingestion.Confidence > 0 {
		if book.Ingestion.Confidence >= 0.8 {
			return "high"
		}
		if book.Ingestion.Confidence >= 0.45 {
			return "medium"
		}
		return "low"
	}
	if book.Status != BookSourceStatusReady || book.WordCount == 0 {
		return "low"
	}
	if len(book.Warnings) > 0 {
		return "medium"
	}
	return "high"
}

func sourceReadinessLanguage(metadata map[string]any) string {
	language := metadataValueString(metadata, "language")
	if strings.TrimSpace(language) == "" {
		return "Project default"
	}
	return language
}

func formatCount(count int, noun string) string {
	if count == 1 {
		return "1 " + noun
	}
	return fmt.Sprintf("%d %ss", count, noun)
}
