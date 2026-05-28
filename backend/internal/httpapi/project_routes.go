package httpapi

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func registerProjectRoutes(app *fiber.App, service *pipeline.Service) {
	app.Get("/api/projects", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.ListProjects())
	})

	app.Post("/api/projects", func(ctx fiber.Ctx) error {
		var request struct {
			Name string `json:"name"`
		}
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		project, err := service.CreateProject(request.Name)
		if err != nil {
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(project)
	})

	app.Patch("/api/projects/:id", func(ctx fiber.Ctx) error {
		var request struct {
			Name string `json:"name"`
		}
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		project, err := service.UpdateProject(ctx.Params("id"), request.Name)
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(project)
	})

	app.Delete("/api/projects/:id", func(ctx fiber.Ctx) error {
		err := service.DeleteProject(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectProtected) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}
		return ctx.SendStatus(fiber.StatusNoContent)
	})

	app.Get("/api/projects/:id/jobs", func(ctx fiber.Ctx) error {
		jobs, err := service.ListProjectJobs(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(jobs)
	})

	app.Get("/api/projects/:id/storage", func(ctx fiber.Ctx) error {
		summary, err := service.GetProjectStorageSummary(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(summary)
	})

	app.Get("/api/projects/:id/progress", func(ctx fiber.Ctx) error {
		progress, err := service.ListProjectProgress(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(progress)
	})

	app.Get("/api/projects/:id/speech-policy", func(ctx fiber.Ctx) error {
		settings, err := service.GetProjectSpeechPolicy(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(settings)
	})

	app.Patch("/api/projects/:id/speech-policy", func(ctx fiber.Ctx) error {
		var request struct {
			Profile string `json:"profile"`
		}
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		settings, err := service.UpdateProjectSpeechPolicy(ctx.Params("id"), request.Profile)
		if err != nil {
			if errors.Is(err, pipeline.ErrSpeechPolicyProfileNotFound) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}
		return ctx.JSON(settings)
	})

	app.Post("/api/projects/:id/speech-policy/profiles", func(ctx fiber.Ctx) error {
		var request pipeline.UpsertSpeechPolicyProfileRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		settings, err := service.CreateCustomSpeechPolicyProfile(ctx.Params("id"), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(settings)
	})

	app.Patch("/api/projects/:id/speech-policy/profiles/:profileId", func(ctx fiber.Ctx) error {
		var request pipeline.UpsertSpeechPolicyProfileRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		settings, err := service.UpdateCustomSpeechPolicyProfile(ctx.Params("id"), ctx.Params("profileId"), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) || errors.Is(err, pipeline.ErrSpeechPolicyProfileNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(settings)
	})

	app.Delete("/api/projects/:id/speech-policy/profiles/:profileId", func(ctx fiber.Ctx) error {
		settings, err := service.DeleteCustomSpeechPolicyProfile(ctx.Params("id"), ctx.Params("profileId"))
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) || errors.Is(err, pipeline.ErrSpeechPolicyProfileNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(settings)
	})

	app.Get("/api/projects/:id/lexicon", func(ctx fiber.Ctx) error {
		lex, err := service.GetProjectLexicon(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(lex)
	})

	app.Post("/api/projects/:id/lexicon", func(ctx fiber.Ctx) error {
		var request pipeline.LexiconUpsertRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		lex, err := service.UpsertProjectLexiconEntry(ctx.Params("id"), request)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(lex)
	})

	app.Patch("/api/projects/:id/lexicon/entries/:entryId", func(ctx fiber.Ctx) error {
		var request pipeline.LexiconUpsertRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		request.ID = ctx.Params("entryId")
		lex, err := service.UpsertProjectLexiconEntry(ctx.Params("id"), request)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(lex)
	})

	app.Delete("/api/projects/:id/lexicon/entries/:entryId", func(ctx fiber.Ctx) error {
		lex, err := service.DeleteProjectLexiconEntry(ctx.Params("id"), ctx.Params("entryId"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(lex)
	})

	app.Post("/api/projects/:id/lexicon/import", func(ctx fiber.Ctx) error {
		file, err := openLexiconUpload(ctx)
		if err != nil {
			return err
		}
		defer file.Close()
		lex, err := service.ImportProjectLexicon(ctx.Params("id"), file)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(lex)
	})

	app.Get("/api/projects/:id/lexicon/export.pls", func(ctx fiber.Ctx) error {
		data, err := service.ExportProjectLexiconPLS(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		ctx.Set(fiber.HeaderContentType, "application/pls+xml")
		ctx.Set(fiber.HeaderContentDisposition, `attachment; filename="project-lexicon.pls"`)
		return ctx.Send(data)
	})

}
