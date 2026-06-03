package httpapi

import (
	"bufio"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func registerVoiceJobRoutes(app *fiber.App, service *pipeline.Service) {
	app.Post("/api/voice-previews", func(ctx fiber.Ctx) error {
		var request pipeline.CreateJobRequest
		if err := json.Unmarshal(ctx.Body(), &request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		preview, err := service.CreateVoicePreview(ctx.Context(), request)
		if err != nil {
			return ctx.Status(voicePreviewErrorStatus(err)).JSON(errorResponse(err.Error()))
		}

		ctx.Set(fiber.HeaderContentType, preview.ContentType)
		ctx.Set(fiber.HeaderCacheControl, "no-store")
		ctx.Set("Pragma", "no-cache")
		ctx.Set("Expires", "0")
		ctx.Set("X-Voice-Preview-Duration-Ms", strconv.Itoa(preview.DurationMS))
		ctx.Set("X-Voice-Preview-Provider", preview.Provider)
		ctx.Set("X-Voice-Preview-Voice", preview.Voice)
		return ctx.Send(preview.Audio)
	})

	app.Post("/api/voice-jobs", func(ctx fiber.Ctx) error {
		var request pipeline.CreateJobRequest
		if err := json.Unmarshal(ctx.Body(), &request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		job, err := service.CreateJob(ctx.Context(), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			status := fiber.StatusInternalServerError
			if errors.Is(err, pipeline.ErrEmptyText) || errors.Is(err, pipeline.ErrVoiceNotFound) {
				status = fiber.StatusBadRequest
			}

			return ctx.Status(status).JSON(errorResponse(err.Error()))
		}

		return ctx.Status(fiber.StatusCreated).JSON(job)
	})

	app.Get("/api/voice-jobs/:id", func(ctx fiber.Ctx) error {
		includeTiming := ctx.Query("includeTiming") == "1" || strings.EqualFold(ctx.Query("includeTiming"), "true")
		job, err := service.GetJobWithTiming(ctx.Params("id"), includeTiming)
		if err != nil {
			return notFound(ctx, err)
		}

		return ctx.JSON(job)
	})

	app.Get("/api/voice-jobs/:id/highlight-map", func(ctx fiber.Ctx) error {
		payload, err := service.GetHighlightMap(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}
		return ctx.JSON(payload)
	})

	app.Get("/api/voice-jobs/:id/highlight-map-v2", func(ctx fiber.Ctx) error {
		payload, err := service.GetHighlightMapV2(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}
		return ctx.JSON(payload)
	})

	app.Get("/api/voice-jobs/:id/speech-plan", func(ctx fiber.Ctx) error {
		payload, err := service.GetJobSpeechPlan(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(payload)
	})

	app.Get("/api/voice-jobs/:id/timing/fragments", func(ctx fiber.Ctx) error {
		payload, err := service.GetFragmentTiming(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}
		return ctx.JSON(payload)
	})

	app.Get("/api/voice-jobs/:id/timing/tokens", func(ctx fiber.Ctx) error {
		payload, err := service.GetTokenTiming(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}
		return ctx.JSON(payload)
	})

	app.Get("/api/voice-jobs/:id/timing/alignment", func(ctx fiber.Ctx) error {
		payload, err := service.GetAlignmentQuality(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}
		return ctx.JSON(payload)
	})

	app.Get("/api/voice-jobs/:id/events", func(ctx fiber.Ctx) error {
		id := ctx.Params("id")
		if _, err := service.GetJob(id); err != nil {
			return notFound(ctx, err)
		}

		ctx.Set(fiber.HeaderContentType, "text/event-stream")
		ctx.Set(fiber.HeaderCacheControl, "no-cache")
		ctx.Set(fiber.HeaderConnection, "keep-alive")
		ctx.Set("X-Accel-Buffering", "no")

		return ctx.SendStreamWriter(func(writer *bufio.Writer) {
			ticker := time.NewTicker(1500 * time.Millisecond)
			defer ticker.Stop()

			for {
				job, err := service.GetJob(id)
				if err != nil {
					_ = writeSSE(writer, "voice-job-error", errorResponse(err.Error()))
					return
				}

				if err := writeSSE(writer, "voice-job", job); err != nil {
					return
				}

				if job.Status == pipeline.JobStatusCompleted || job.Status == pipeline.JobStatusFailed || job.Status == pipeline.JobStatusCancelled {
					return
				}

				<-ticker.C
			}
		})
	})

	app.Post("/api/voice-jobs/:id/cancel", func(ctx fiber.Ctx) error {
		if err := service.CancelJob(ctx.Params("id")); err != nil {
			return notFound(ctx, err)
		}

		return ctx.SendStatus(fiber.StatusNoContent)
	})

	app.Post("/api/voice-jobs/:id/retry", func(ctx fiber.Ctx) error {
		job, err := service.RetryJob(ctx.Context(), ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrJobNotRetriable) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}
			if errors.Is(err, pipeline.ErrProjectNotFound) ||
				errors.Is(err, pipeline.ErrVoiceNotFound) ||
				errors.Is(err, pipeline.ErrEmptyText) ||
				strings.Contains(err.Error(), "tts engine") {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}

		return ctx.Status(fiber.StatusCreated).JSON(job)
	})

	app.Get("/api/voice-jobs/:id/audio", func(ctx fiber.Ctx) error {
		audio, contentType, err := service.GetAudio(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}

			return notFound(ctx, err)
		}

		ctx.Set(fiber.HeaderContentType, contentType)
		ctx.Set(fiber.HeaderCacheControl, "no-store")
		ctx.Set("Pragma", "no-cache")
		ctx.Set("Expires", "0")
		return ctx.Send(audio)
	})

	app.Get("/api/voice-jobs/:id/audio/partial", func(ctx fiber.Ctx) error {
		audio, contentType, err := service.GetPartialAudio(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}

			return notFound(ctx, err)
		}

		ctx.Set(fiber.HeaderContentType, contentType)
		ctx.Set(fiber.HeaderCacheControl, "no-store")
		ctx.Set("Pragma", "no-cache")
		ctx.Set("Expires", "0")
		return ctx.Send(audio)
	})

	app.Get("/api/voice-jobs/:id/audio/segment/:index", func(ctx fiber.Ctx) error {
		segmentIndex, err := strconv.Atoi(ctx.Params("index"))
		if err != nil || segmentIndex < 1 {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("segment index must be a positive integer"))
		}

		audio, contentType, err := service.GetAudioSegment(ctx.Params("id"), segmentIndex)
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}

			return notFound(ctx, err)
		}

		ctx.Set(fiber.HeaderContentType, contentType)
		ctx.Set(fiber.HeaderCacheControl, "no-store")
		ctx.Set("Pragma", "no-cache")
		ctx.Set("Expires", "0")
		return ctx.Send(audio)
	})
}

func voicePreviewErrorStatus(err error) int {
	if errors.Is(err, pipeline.ErrEmptyText) ||
		errors.Is(err, pipeline.ErrVoiceNotFound) ||
		errors.Is(err, pipeline.ErrProfileNotFound) ||
		errors.Is(err, pipeline.ErrProfileMissingAudio) ||
		errors.Is(err, pipeline.ErrProfileUnsupported) ||
		errors.Is(err, pipeline.ErrProfileArtifactMissing) ||
		errors.Is(err, pipeline.ErrProfileArtifactUnsupported) ||
		strings.Contains(err.Error(), "tts engine") {
		return fiber.StatusBadRequest
	}
	if errors.Is(err, pipeline.ErrProjectNotFound) {
		return fiber.StatusNotFound
	}
	return fiber.StatusBadGateway
}
