package httpapi

import (
	"bufio"
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func registerSourceManifestRoutes(app *fiber.App, service *pipeline.Service) {
	app.Get("/api/source-manifest/events", func(ctx fiber.Ctx) error {
		sourceID := strings.TrimSpace(ctx.Query("sourceId"))
		afterSequence, err := sourceManifestSequenceFromQuery(ctx, "afterSequence")
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		limit, err := sourceManifestLimitFromQuery(ctx)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		replay, err := service.ReplaySourceManifestEvents(sourceID, afterSequence, limit)
		if err != nil {
			if errors.Is(err, pipeline.ErrSourceManifestEventInvalid) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(replay)
	})

	app.Get("/api/source-manifest/snapshot", func(ctx fiber.Ctx) error {
		snapshot, err := service.GetSourceManifestSnapshot(ctx.Query("sourceId"), ctx.Query("sourceRevisionId"))
		if err != nil {
			if errors.Is(err, pipeline.ErrSourceLifecycleNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(snapshot)
	})

	app.Get("/api/source-manifest/events/stream", func(ctx fiber.Ctx) error {
		sourceID := strings.TrimSpace(ctx.Query("sourceId"))
		afterSequence, err := sourceManifestSequenceFromQuery(ctx, "afterSequence")
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		limit, err := sourceManifestLimitFromQuery(ctx)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		subscription, replay, err := service.SubscribeSourceManifestEvents(sourceID, afterSequence, limit)
		if err != nil {
			if errors.Is(err, pipeline.ErrSourceManifestEventInvalid) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}

		ctx.Set(fiber.HeaderContentType, "text/event-stream")
		ctx.Set(fiber.HeaderCacheControl, "no-cache")
		ctx.Set(fiber.HeaderConnection, "keep-alive")
		ctx.Set("X-Accel-Buffering", "no")

		once := strings.EqualFold(ctx.Query("once"), "true") || ctx.Query("once") == "1"
		return ctx.SendStreamWriter(func(writer *bufio.Writer) {
			defer subscription.Close()
			if replay.Gap {
				if err := writeSSE(writer, "source-manifest-gap", replay); err != nil {
					return
				}
			}
			for _, event := range replay.Events {
				if err := writeSSE(writer, "source-manifest-event", event); err != nil {
					return
				}
			}
			if once {
				return
			}
			for {
				select {
				case event := <-subscription.Events():
					if err := writeSSE(writer, "source-manifest-event", event); err != nil {
						return
					}
				case <-ctx.Context().Done():
					return
				}
			}
		})
	})
}

func sourceManifestSequenceFromQuery(ctx fiber.Ctx, key string) (int64, error) {
	raw := strings.TrimSpace(ctx.Query(key))
	if raw == "" {
		return 0, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 0 {
		return 0, errors.New(key + " must be a non-negative integer")
	}
	return value, nil
}

func sourceManifestLimitFromQuery(ctx fiber.Ctx) (int, error) {
	raw := strings.TrimSpace(ctx.Query("limit"))
	if raw == "" {
		return 0, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return 0, errors.New("limit must be a non-negative integer")
	}
	return value, nil
}
