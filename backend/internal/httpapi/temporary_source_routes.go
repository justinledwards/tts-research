package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

const temporarySourceUploadMaxBytes int64 = 2 * 1024 * 1024

var temporarySourceSupportedFileExtensions = map[string]string{
	".csv":      "text/csv",
	".htm":      "text/html",
	".html":     "text/html",
	".json":     "application/json",
	".log":      "text/plain",
	".markdown": "text/markdown",
	".md":       "text/markdown",
	".text":     "text/plain",
	".txt":      "text/plain",
}

func registerTemporarySourceRoutes(app *fiber.App, service *pipeline.Service) {
	app.Use("/api/temporary-sources", func(ctx fiber.Ctx) error {
		if service.TemporarySourcesEnabled() {
			return ctx.Next()
		}
		return ctx.Status(fiber.StatusNotFound).JSON(temporarySourceErrorResponse(
			"Temporary source failed.",
			pipeline.TemporarySourceFailureSourceNotReady,
		))
	})

	app.Post("/api/temporary-sources", func(ctx fiber.Ctx) error {
		if !strings.Contains(ctx.Get(fiber.HeaderContentType), "application/json") {
			fileHeader, err := ctx.FormFile("file")
			if err != nil {
				return ctx.Status(fiber.StatusBadRequest).JSON(temporarySourceErrorResponse(
					"This temporary source is not ready for review or audio.",
					pipeline.TemporarySourceFailureMetadataRequired,
				))
			}
			file, err := fileHeader.Open()
			if err != nil {
				return temporarySourceError(ctx, fmt.Errorf("%w: unable to read temporary source file", pipeline.ErrTemporarySourceUnsupportedFile))
			}
			defer file.Close()
			data, err := io.ReadAll(file)
			if err != nil {
				return temporarySourceError(ctx, fmt.Errorf("%w: unable to read temporary source file", pipeline.ErrTemporarySourceUnsupportedFile))
			}
			contentType, err := validateTemporarySourceUpload(fileHeader.Filename, fileHeader.Header.Get("Content-Type"), int64(len(data)))
			if err != nil {
				return temporarySourceError(ctx, err)
			}
			source, err := service.CreateTemporarySource(ctx.Context(), pipeline.CreateTemporarySourceRequest{
				Kind:              pipeline.PreparedSourceKindFile,
				Text:              string(data),
				SourceName:        firstNonEmpty(ctx.FormValue("sourceName"), fileHeader.Filename),
				SourceContentType: contentType,
				SourceBytes:       int64(len(data)),
				MarkdownParseMode: ctx.FormValue("markdownParseMode"),
			})
			if err != nil {
				return temporarySourceError(ctx, err)
			}
			return ctx.Status(fiber.StatusCreated).JSON(temporarySourceEnvelope(source))
		}
		var request pipeline.CreateTemporarySourceRequest
		if err := json.Unmarshal(ctx.Body(), &request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(temporarySourceErrorResponse(
				"This temporary source is not ready for review or audio.",
				pipeline.TemporarySourceFailureMetadataRequired,
			))
		}
		source, err := service.CreateTemporarySource(ctx.Context(), request)
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.Status(fiber.StatusCreated).JSON(temporarySourceEnvelope(source))
	})

	app.Get("/api/temporary-sources/storage/summary", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.TemporaryStorageUsageSummary(time.Now().UTC()))
	})

	app.Get("/api/temporary-sources/jobs", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.ListTemporarySourceJobs())
	})

	app.Post("/api/temporary-sources/cleanup-expired", func(ctx fiber.Ctx) error {
		result, err := service.ClearExpiredTemporarySources(time.Now().UTC())
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(result)
	})

	app.Post("/api/temporary-sources/clear", func(ctx fiber.Ctx) error {
		result, err := service.ClearTemporarySources()
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(result)
	})

	app.Get("/api/temporary-sources", func(ctx fiber.Ctx) error {
		sources := service.ListTemporarySources(time.Now().UTC())
		envelopes := make([]pipeline.TemporarySourceEnvelope, 0, len(sources))
		for _, source := range sources {
			envelopes = append(envelopes, temporarySourceEnvelope(source))
		}
		return ctx.JSON(envelopes)
	})

	app.Get("/api/temporary-sources/:id", func(ctx fiber.Ctx) error {
		source, err := service.GetTemporarySource(ctx.Params("id"))
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(temporarySourceEnvelope(source))
	})

	app.Post("/api/temporary-sources/:id/reopen", func(ctx fiber.Ctx) error {
		source, err := service.GetTemporarySource(ctx.Params("id"))
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(temporarySourceEnvelope(source))
	})

	app.Patch("/api/temporary-sources/:id/readiness/confirm", func(ctx fiber.Ctx) error {
		var request pipeline.SourceReadinessConfirmationRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(temporarySourceErrorResponse(
				"This temporary source is not ready for review or audio.",
				pipeline.TemporarySourceFailureMetadataRequired,
			))
		}
		source, err := service.ConfirmTemporarySourceReadiness(ctx.Params("id"), request)
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(temporarySourceEnvelope(source))
	})

	app.Post("/api/temporary-sources/:id/voice-jobs", func(ctx fiber.Ctx) error {
		var request pipeline.CreateJobRequest
		if err := json.Unmarshal(ctx.Body(), &request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(temporarySourceErrorResponse(
				"This temporary source is not ready for review or audio.",
				pipeline.TemporarySourceFailureMetadataRequired,
			))
		}
		job, err := service.CreateTemporarySourceJob(ctx.Context(), ctx.Params("id"), request)
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.Status(fiber.StatusCreated).JSON(job)
	})

	app.Get("/api/temporary-sources/:id/artifacts", func(ctx fiber.Ctx) error {
		artifacts, err := service.ListTemporarySourceArtifacts(ctx.Params("id"))
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(artifacts)
	})

	app.Delete("/api/temporary-sources/:id", func(ctx fiber.Ctx) error {
		if err := service.DeleteTemporarySource(ctx.Params("id")); err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.SendStatus(fiber.StatusNoContent)
	})

	app.Post("/api/temporary-sources/:id/cleanup", func(ctx fiber.Ctx) error {
		var request pipeline.TemporarySourceCleanupRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(temporarySourceErrorResponse(
				"Temporary source failed. Project sources are unchanged.",
				pipeline.TemporarySourceFailureCleanupFailed,
			))
		}
		result, err := service.CleanupTemporarySource(ctx.Params("id"), request)
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(result)
	})

	app.Post("/api/temporary-sources/:id/promote", func(ctx fiber.Ctx) error {
		var request pipeline.TemporarySourcePromotionRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(temporarySourceErrorResponse(
				"Unable to keep temporary source in the project. No project history was changed.",
				pipeline.TemporarySourceFailurePromotionFailed,
			))
		}
		source, err := service.PromoteTemporarySource(ctx.Context(), ctx.Params("id"), request)
		if err != nil {
			return temporarySourcePromotionError(ctx, err)
		}
		return ctx.Status(fiber.StatusCreated).JSON(source)
	})
}

func validateTemporarySourceUpload(filename string, contentType string, size int64) (string, error) {
	extension := strings.ToLower(filepath.Ext(strings.TrimSpace(filename)))
	normalizedContentType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	expectedContentType, ok := temporarySourceSupportedFileExtensions[extension]
	if !ok {
		return "", fmt.Errorf("%w: choose a supported file such as TXT, Markdown, HTML, CSV, JSON, or LOG", pipeline.ErrTemporarySourceUnsupportedFile)
	}
	if size <= 0 {
		return "", fmt.Errorf("%w: supported file is empty", pipeline.ErrEmptyText)
	}
	if size > temporarySourceUploadMaxBytes {
		return "", fmt.Errorf("%w: supported file must be 2 MB or smaller", pipeline.ErrTemporarySourceFileTooLarge)
	}
	if normalizedContentType == "" || normalizedContentType == "application/octet-stream" {
		return expectedContentType, nil
	}
	if strings.HasPrefix(normalizedContentType, "text/") ||
		normalizedContentType == "application/json" ||
		normalizedContentType == "application/x-ndjson" {
		return normalizedContentType, nil
	}
	return "", fmt.Errorf("%w: content type %q is not supported for temporary narration", pipeline.ErrTemporarySourceUnsupportedFile, normalizedContentType)
}

func temporarySourceEnvelope(source pipeline.TemporarySourceSession) pipeline.TemporarySourceEnvelope {
	return pipeline.TemporarySourceEnvelope{
		SourceOwner:       pipeline.SourceOwnerTemporary,
		Scope:             pipeline.SourceArtifactScopeTemporary,
		TemporarySourceID: source.TemporarySourceID,
		Source:            source,
	}
}

func temporarySourceError(ctx fiber.Ctx, err error) error {
	code := temporarySourceFailureCode(err)
	message := temporarySourceErrorMessage(code)
	if errors.Is(err, pipeline.ErrTemporarySourceNotFound) ||
		errors.Is(err, pipeline.ErrTemporarySourceExpired) {
		return ctx.Status(fiber.StatusNotFound).JSON(temporarySourceErrorResponse(message, code))
	}
	if errors.Is(err, pipeline.ErrProjectNotFound) {
		return ctx.Status(fiber.StatusNotFound).JSON(temporarySourceErrorResponse(
			"Unable to keep temporary source in the project. No project history was changed.",
			pipeline.TemporarySourceFailurePromotionFailed,
		))
	}
	if errors.Is(err, pipeline.ErrEmptyText) ||
		errors.Is(err, pipeline.ErrTemporarySourceUnsupportedFile) ||
		errors.Is(err, pipeline.ErrTemporarySourceFileTooLarge) ||
		errors.Is(err, pipeline.ErrVoiceNotFound) ||
		errors.Is(err, pipeline.ErrSpeechPolicyProfileNotFound) {
		return ctx.Status(fiber.StatusBadRequest).JSON(temporarySourceErrorResponse(message, code))
	}
	if errors.Is(err, pipeline.ErrTemporarySourceConflict) {
		return ctx.Status(fiber.StatusConflict).JSON(temporarySourceErrorResponse(message, code))
	}
	return ctx.Status(fiber.StatusInternalServerError).JSON(temporarySourceErrorResponse(message, code))
}

func temporarySourcePromotionError(ctx fiber.Ctx, err error) error {
	status := fiber.StatusInternalServerError
	if errors.Is(err, pipeline.ErrTemporarySourceNotFound) ||
		errors.Is(err, pipeline.ErrTemporarySourceExpired) ||
		errors.Is(err, pipeline.ErrProjectNotFound) {
		status = fiber.StatusNotFound
	} else if errors.Is(err, pipeline.ErrTemporarySourceConflict) {
		status = fiber.StatusConflict
	} else if errors.Is(err, pipeline.ErrEmptyText) ||
		errors.Is(err, pipeline.ErrTemporarySourceUnsupportedFile) ||
		errors.Is(err, pipeline.ErrTemporarySourceFileTooLarge) {
		status = fiber.StatusBadRequest
	}
	return ctx.Status(status).JSON(temporarySourceErrorResponse(
		"Unable to keep temporary source in the project. No project history was changed.",
		pipeline.TemporarySourceFailurePromotionFailed,
	))
}

func temporarySourceErrorResponse(message string, code pipeline.TemporarySourceFailureCode) fiber.Map {
	return fiber.Map{
		"code":            code,
		"error":           message,
		"temporarySource": true,
	}
}

func temporarySourceFailureCode(err error) pipeline.TemporarySourceFailureCode {
	switch {
	case errors.Is(err, pipeline.ErrTemporarySourceExpired):
		return pipeline.TemporarySourceFailureExpired
	case errors.Is(err, pipeline.ErrTemporarySourceUnsupportedFile):
		return pipeline.TemporarySourceFailureUnsupportedFile
	case errors.Is(err, pipeline.ErrTemporarySourceFileTooLarge):
		return pipeline.TemporarySourceFailureFileTooLarge
	case errors.Is(err, pipeline.ErrEmptyText):
		return pipeline.TemporarySourceFailureMetadataRequired
	case errors.Is(err, pipeline.ErrVoiceNotFound):
		return pipeline.TemporarySourceFailureProviderUnavailable
	case errors.Is(err, pipeline.ErrSpeechPolicyProfileNotFound):
		return pipeline.TemporarySourceFailureSourceNotReady
	case errors.Is(err, pipeline.ErrTemporarySourceConflict), errors.Is(err, pipeline.ErrProjectNotFound):
		return pipeline.TemporarySourceFailurePromotionFailed
	case errors.Is(err, pipeline.ErrTemporarySourceNotFound):
		return pipeline.TemporarySourceFailureExpired
	default:
		message := strings.ToLower(err.Error())
		switch {
		case strings.Contains(message, "safe") || strings.Contains(message, "blocked"):
			return pipeline.TemporarySourceFailureUnsafeURL
		case strings.Contains(message, "fetch") || strings.Contains(message, "url"):
			return pipeline.TemporarySourceFailureFetchFailed
		case strings.Contains(message, "align"):
			return pipeline.TemporarySourceFailureAlignmentFailed
		case strings.Contains(message, "provider") || strings.Contains(message, "tts engine"):
			return pipeline.TemporarySourceFailureProviderUnavailable
		case strings.Contains(message, "generation") || strings.Contains(message, "voice job"):
			return pipeline.TemporarySourceFailureGenerationFailed
		case strings.Contains(message, "cleanup") || strings.Contains(message, "remove"):
			return pipeline.TemporarySourceFailureCleanupFailed
		case strings.Contains(message, "promot") || strings.Contains(message, "project"):
			return pipeline.TemporarySourceFailurePromotionFailed
		case strings.Contains(message, "extract"):
			return pipeline.TemporarySourceFailureExtractionFailed
		default:
			return pipeline.TemporarySourceFailureSourceNotReady
		}
	}
}

func temporarySourceErrorMessage(code pipeline.TemporarySourceFailureCode) string {
	switch code {
	case pipeline.TemporarySourceFailureExpired:
		return "Temporary source expired after inactivity. Extend expiry before reopening it."
	case pipeline.TemporarySourceFailureDiscarded:
		return "Temporary source was discarded. Start Quick Listen again to create a new temporary source."
	case pipeline.TemporarySourceFailureMetadataRequired, pipeline.TemporarySourceFailureSourceNotReady:
		return "This temporary source is not ready for review or audio."
	case pipeline.TemporarySourceFailurePromotionFailed:
		return "Unable to keep temporary source in the project. No project history was changed."
	case pipeline.TemporarySourceFailureCleanupFailed:
		return "Temporary source failed. Project sources are unchanged."
	case pipeline.TemporarySourceFailureProviderUnavailable:
		return "Temporary source failed. Provider-backed generation is unavailable."
	default:
		if code == pipeline.TemporarySourceFailureUnsupportedFile || code == pipeline.TemporarySourceFailureFileTooLarge {
			return "Temporary source failed. Choose a supported file and try Quick Listen again."
		}
		return "Temporary source failed."
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
