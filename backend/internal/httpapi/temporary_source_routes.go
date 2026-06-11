package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func registerTemporarySourceRoutes(app *fiber.App, service *pipeline.Service) {
	app.Post("/api/temporary-sources", func(ctx fiber.Ctx) error {
		if !strings.Contains(ctx.Get(fiber.HeaderContentType), "application/json") {
			fileHeader, err := ctx.FormFile("file")
			if err != nil {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("temporary source file is required"))
			}
			file, err := fileHeader.Open()
			if err != nil {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to read temporary source file"))
			}
			defer file.Close()
			data, err := io.ReadAll(file)
			if err != nil {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to read temporary source file"))
			}
			source, err := service.CreateTemporarySource(ctx.Context(), pipeline.CreateTemporarySourceRequest{
				Kind:              pipeline.PreparedSourceKindFile,
				Text:              string(data),
				SourceName:        firstNonEmpty(ctx.FormValue("sourceName"), fileHeader.Filename),
				SourceContentType: fileHeader.Header.Get("Content-Type"),
				SourceBytes:       int64(len(data)),
				MarkdownParseMode: ctx.FormValue("markdownParseMode"),
			})
			if err != nil {
				return temporarySourceError(ctx, err)
			}
			return ctx.Status(fiber.StatusCreated).JSON(source)
		}
		var request pipeline.CreateTemporarySourceRequest
		if err := json.Unmarshal(ctx.Body(), &request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		source, err := service.CreateTemporarySource(ctx.Context(), request)
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.Status(fiber.StatusCreated).JSON(source)
	})

	app.Get("/api/temporary-sources/:id", func(ctx fiber.Ctx) error {
		source, err := service.GetTemporarySource(ctx.Params("id"))
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(source)
	})

	app.Patch("/api/temporary-sources/:id/readiness/confirm", func(ctx fiber.Ctx) error {
		var request pipeline.SourceReadinessConfirmationRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		source, err := service.ConfirmTemporarySourceReadiness(ctx.Params("id"), request)
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.JSON(source)
	})

	app.Post("/api/temporary-sources/:id/voice-jobs", func(ctx fiber.Ctx) error {
		var request pipeline.CreateJobRequest
		if err := json.Unmarshal(ctx.Body(), &request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
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

	app.Post("/api/temporary-sources/:id/promote", func(ctx fiber.Ctx) error {
		var request pipeline.TemporarySourcePromotionRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		source, err := service.PromoteTemporarySource(ctx.Context(), ctx.Params("id"), request)
		if err != nil {
			return temporarySourceError(ctx, err)
		}
		return ctx.Status(fiber.StatusCreated).JSON(source)
	})
}

func temporarySourceError(ctx fiber.Ctx, err error) error {
	if errors.Is(err, pipeline.ErrTemporarySourceNotFound) ||
		errors.Is(err, pipeline.ErrTemporarySourceExpired) ||
		errors.Is(err, pipeline.ErrProjectNotFound) {
		return notFound(ctx, err)
	}
	if errors.Is(err, pipeline.ErrEmptyText) ||
		errors.Is(err, pipeline.ErrVoiceNotFound) ||
		errors.Is(err, pipeline.ErrSpeechPolicyProfileNotFound) {
		return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
	}
	return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
