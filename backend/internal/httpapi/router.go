package httpapi

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func NewRouter(service *pipeline.Service) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName: "tts-research",
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowMethods: []string{fiber.MethodGet, fiber.MethodPost, fiber.MethodOptions},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept"},
	}))

	app.Get("/api/health", func(ctx fiber.Ctx) error {
		return ctx.JSON(fiber.Map{"status": "ok"})
	})

	app.Post("/api/voice-jobs", func(ctx fiber.Ctx) error {
		var request pipeline.CreateJobRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}

		job, err := service.CreateJob(ctx.Context(), request.Text)
		if err != nil {
			status := fiber.StatusInternalServerError
			if errors.Is(err, pipeline.ErrEmptyText) {
				status = fiber.StatusBadRequest
			}

			return ctx.Status(status).JSON(errorResponse(err.Error()))
		}

		return ctx.Status(fiber.StatusCreated).JSON(job)
	})

	app.Get("/api/voice-jobs/:id", func(ctx fiber.Ctx) error {
		job, err := service.GetJob(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}

		return ctx.JSON(job)
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

				if job.Status == pipeline.JobStatusCompleted || job.Status == pipeline.JobStatusFailed {
					return
				}

				<-ticker.C
			}
		})
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

	return app
}

func notFound(ctx fiber.Ctx, err error) error {
	if errors.Is(err, pipeline.ErrJobNotFound) {
		return ctx.Status(fiber.StatusNotFound).JSON(errorResponse(err.Error()))
	}

	return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
}

func errorResponse(message string) fiber.Map {
	return fiber.Map{"error": message}
}

func writeSSE(writer *bufio.Writer, event string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if _, err := fmt.Fprintf(writer, "event: %s\n", event); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(writer, "data: %s\n\n", data); err != nil {
		return err
	}

	return writer.Flush()
}
