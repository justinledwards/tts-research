package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

const readerWorkspaceRequestMaxBytes = 64 * 1024

func registerReaderWorkspaceRoutes(app *fiber.App, service *pipeline.Service) {
	app.Get("/api/projects/:id/reader-workspace", func(ctx fiber.Ctx) error {
		result, err := service.GetReaderWorkspace(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}
		setReaderWorkspaceHeaders(ctx, result.ETag)
		return ctx.JSON(result.Snapshot)
	})

	app.Put("/api/projects/:id/reader-workspace", func(ctx fiber.Ctx) error {
		if len(ctx.Body()) > readerWorkspaceRequestMaxBytes {
			return ctx.Status(fiber.StatusRequestEntityTooLarge).JSON(errorResponse("reader workspace snapshot exceeds size limit"))
		}
		ifMatch := strings.TrimSpace(ctx.Get(fiber.HeaderIfMatch))
		ifNoneMatch := strings.TrimSpace(ctx.Get(fiber.HeaderIfNoneMatch))
		if ifMatch == "" && ifNoneMatch == "" {
			return ctx.Status(fiber.StatusPreconditionRequired).JSON(errorResponse("If-Match or If-None-Match is required"))
		}
		if ifMatch != "" && ifNoneMatch != "" || ifNoneMatch != "" && ifNoneMatch != "*" {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid reader workspace precondition"))
		}
		var snapshot pipeline.ReaderWorkspaceSnapshot
		decoder := json.NewDecoder(strings.NewReader(string(ctx.Body())))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&snapshot); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		result, err := service.PutReaderWorkspace(ctx.Params("id"), snapshot, pipeline.ReaderWorkspaceWriteCondition{
			IfMatch: ifMatch, IfNoneMatch: ifNoneMatch == "*",
		})
		if err != nil {
			if errors.Is(err, pipeline.ErrReaderWorkspaceStale) {
				setReaderWorkspaceHeaders(ctx, result.ETag)
				return ctx.Status(fiber.StatusPreconditionFailed).JSON(fiber.Map{
					"error":      err.Error(),
					"current":    result.Snapshot,
					"retryToken": result.ETag,
				})
			}
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			if errors.Is(err, pipeline.ErrReaderWorkspaceInvalid) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}
		setReaderWorkspaceHeaders(ctx, result.ETag)
		return ctx.JSON(result.Snapshot)
	})
}

func setReaderWorkspaceHeaders(ctx fiber.Ctx, etag string) {
	ctx.Set(fiber.HeaderETag, etag)
	ctx.Set(fiber.HeaderCacheControl, "no-store")
}
