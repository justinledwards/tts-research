package httpapi

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	speechmath "github.com/justinedwards/tts-research/backend/internal/math"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
	"github.com/justinedwards/tts-research/backend/internal/policy"
	systemmetrics "github.com/justinedwards/tts-research/backend/internal/systemmetrics"
)

func NewRouter(service *pipeline.Service) *fiber.App {
	maxInt := int64(int(^uint(0) >> 1))
	bodyLimit := int(maxInt)
	if maxProfileBytes := service.MaxProfileBytes(); maxProfileBytes > 0 {
		const bodyPadding = 1024 * 1024
		maxLimit := maxProfileBytes + int64(bodyPadding)
		if maxLimit > maxInt {
			bodyLimit = int(maxInt)
		} else {
			bodyLimit = int(maxLimit)
		}
	}

	app := fiber.New(fiber.Config{
		AppName:   "tts-research",
		BodyLimit: bodyLimit,
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: corsAllowedOrigins(),
		AllowMethods: []string{fiber.MethodGet, fiber.MethodPost, fiber.MethodPatch, fiber.MethodDelete, fiber.MethodOptions},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept"},
	}))

	app.Get("/api/health", func(ctx fiber.Ctx) error {
		return ctx.JSON(fiber.Map{"status": "ok"})
	})

	app.Get("/api/system-metrics", func(ctx fiber.Ctx) error {
		metrics := systemmetrics.Collect("tts-research")
		return ctx.JSON(metrics)
	})

	app.Get("/api/tts-engines", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.ListTTSEngines())
	})

	app.Post("/api/math/preview", func(ctx fiber.Ctx) error {
		var request struct {
			Input string `json:"input"`
		}
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		return ctx.JSON(speechmath.Preview(request.Input))
	})

	app.Get("/api/voices", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.ListVoices())
	})

	app.Post("/api/voices", func(ctx fiber.Ctx) error {
		fileHeader, err := ctx.FormFile("file")
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("voice file is required"))
		}
		file, err := fileHeader.Open()
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to read voice file"))
		}
		defer func() {
			_ = file.Close()
		}()

		voice, err := service.CreateCloneVoice(ctx.Context(), pipeline.VoiceUpload{
			Name:        ctx.FormValue("name"),
			Filename:    fileHeader.Filename,
			ContentType: fileHeader.Header.Get("Content-Type"),
			Reader:      file,
		})
		if err != nil {
			status := fiber.StatusInternalServerError
			if errors.Is(err, pipeline.ErrInvalidVoice) {
				status = fiber.StatusBadRequest
			}
			return ctx.Status(status).JSON(errorResponse(err.Error()))
		}

		return ctx.Status(fiber.StatusCreated).JSON(voice)
	})

	app.Get("/api/voices/:id/reference-audio", func(ctx fiber.Ctx) error {
		audioBytes, contentType, err := service.GetVoiceReferenceAudio(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		ctx.Set(fiber.HeaderContentType, contentType)
		ctx.Set(fiber.HeaderCacheControl, "no-store")
		return ctx.Send(audioBytes)
	})

	app.Get("/api/book-cinema/diagnostics", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.BookCinemaDiagnostics())
	})

	app.Get("/api/adapters/capabilities", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.AdapterCapabilities())
	})

	app.Get("/api/adapters/diagnostics", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.AdapterDiagnostics())
	})

	app.Get("/api/content-ir/:id", func(ctx fiber.Ctx) error {
		document, err := service.GetContentIR(ctx.Params("id"))
		if err != nil {
			if errors.Is(err, pipeline.ErrContentIRNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(document)
	})

	app.Post("/api/content-ir/:id/speech-policy/preview", func(ctx fiber.Ctx) error {
		var request pipeline.SpeechPolicyPreviewRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		document, err := service.PreviewContentIRSpeechPolicy(ctx.Params("id"), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrContentIRNotFound) || errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			if errors.Is(err, pipeline.ErrSpeechPolicyProfileNotFound) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(document)
	})

	app.Get("/api/policies/profiles", func(ctx fiber.Ctx) error {
		return ctx.JSON(policy.Profiles())
	})

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

	app.Get("/api/projects/:id/book-sources", func(ctx fiber.Ctx) error {
		summary := strings.EqualFold(ctx.Query("summary"), "1") ||
			strings.EqualFold(ctx.Query("summary"), "true")
		var (
			books []pipeline.BookSource
			err   error
		)
		if summary {
			books, err = service.ListProjectBookSourcesSummary(ctx.Params("id"))
		} else {
			books, err = service.ListProjectBookSources(ctx.Params("id"))
		}
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(books)
	})

	app.Post("/api/projects/:id/book-sources", func(ctx fiber.Ctx) error {
		if strings.Contains(ctx.Get(fiber.HeaderContentType), "application/json") {
			var request struct {
				URL           string                     `json:"url"`
				ImportProfile pipeline.BookImportProfile `json:"importProfile,omitempty"`
				PDFTableMode  pipeline.PDFTableMode      `json:"pdfTableMode,omitempty"`
			}
			if err := ctx.Bind().Body(&request); err != nil {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
			}
			book, err := service.CreateBookSourceFromURLWithOptions(ctx.Context(), ctx.Params("id"), request.URL, pipeline.BookSourceImportOptions{
				ImportProfile: request.ImportProfile,
				PDFTableMode:  request.PDFTableMode,
			})
			if err != nil {
				if errors.Is(err, pipeline.ErrProjectNotFound) {
					return notFound(ctx, err)
				}
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusCreated).JSON(book)
		}
		uploads, options, cleanup, err := saveUploadedBooks(ctx)
		if err != nil {
			return err
		}
		defer cleanup()
		book, err := service.CreateBookSourceWithOptions(ctx.Context(), ctx.Params("id"), uploads, options)
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(book)
	})

	app.Get("/api/projects/:id/source-preps", func(ctx fiber.Ctx) error {
		sources, err := service.ListProjectPreparedSources(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(sources)
	})

	app.Post("/api/projects/:id/source-preps", func(ctx fiber.Ctx) error {
		var request pipeline.CreatePreparedSourceRequest
		if strings.Contains(ctx.Get(fiber.HeaderContentType), "multipart/form-data") {
			tempPath, filename, size, cleanup, err := saveUploadedSource(ctx)
			if err != nil {
				return err
			}
			defer cleanup()
			bytes, err := os.ReadFile(tempPath)
			if err != nil {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to read uploaded source"))
			}
			request = pipeline.CreatePreparedSourceRequest{
				Kind:              pipeline.PreparedSourceKindFile,
				Text:              string(bytes),
				SourceName:        filename,
				SourceBytes:       size,
				MarkdownParseMode: ctx.FormValue("markdownParseMode"),
			}
		} else {
			if err := ctx.Bind().Body(&request); err != nil {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
			}
		}
		source, err := service.CreatePreparedSource(ctx.Context(), ctx.Params("id"), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			if errors.Is(err, pipeline.ErrEmptyText) || errors.Is(err, pipeline.ErrVoiceNotFound) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(source)
	})

	app.Get("/api/source-preps/:id", func(ctx fiber.Ctx) error {
		source, err := service.GetPreparedSource(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(source)
	})

	app.Get("/api/source-preps/:id/blocks/:blockId", func(ctx fiber.Ctx) error {
		block, err := service.GetPreparedSourceBlock(ctx.Params("id"), ctx.Params("blockId"))
		if err != nil {
			if errors.Is(err, pipeline.ErrPreparedSourceNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusNotFound).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(block)
	})

	app.Post("/api/source-preps/:id/speech-policy/preview", func(ctx fiber.Ctx) error {
		var request pipeline.SpeechPolicyPreviewRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		source, err := service.PreviewPreparedSourceSpeechPolicy(ctx.Params("id"), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrPreparedSourceNotFound) || errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(source)
	})

	app.Post("/api/source-preps/:id/voice-jobs", func(ctx fiber.Ctx) error {
		var request pipeline.CreateJobRequest
		if err := json.Unmarshal(ctx.Body(), &request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		job, err := service.CreatePreparedSourceJob(ctx.Context(), ctx.Params("id"), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrPreparedSourceNotFound) || errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			if errors.Is(err, pipeline.ErrEmptyText) || errors.Is(err, pipeline.ErrVoiceNotFound) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(job)
	})

	app.Get("/api/book-sources/:id", func(ctx fiber.Ctx) error {
		book, err := service.GetBookSource(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(book)
	})

	app.Get("/api/book-sources/:id/scope", func(ctx fiber.Ctx) error {
		scope := bookScopeFromQuery(ctx)
		content, err := service.GetBookSourceScope(ctx.Params("id"), scope)
		if err != nil {
			if errors.Is(err, pipeline.ErrBookSourceNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(content)
	})

	app.Post("/api/book-sources/:id/voice-jobs", func(ctx fiber.Ctx) error {
		var request pipeline.CreateJobRequest
		if err := json.Unmarshal(ctx.Body(), &request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		job, err := service.CreateBookNarrationJob(ctx.Context(), ctx.Params("id"), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrBookSourceNotFound) || errors.Is(err, pipeline.ErrProjectNotFound) {
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

	app.Get("/api/projects/:id/bundle/summary", func(ctx fiber.Ctx) error {
		summary, err := service.GetProjectBundleSummary(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(summary)
	})

	app.Get("/api/projects/:id/bundle", func(ctx fiber.Ctx) error {
		bundle, filename, err := service.ExportProjectBundle(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		ctx.Set(fiber.HeaderContentType, "application/zip")
		ctx.Set(fiber.HeaderContentDisposition, fmt.Sprintf(`attachment; filename="%s"`, filename))
		return ctx.Send(bundle)
	})

	app.Post("/api/project-bundles/preview", func(ctx fiber.Ctx) error {
		tempPath, cleanup, err := saveUploadedBundle(ctx)
		if err != nil {
			return err
		}
		defer cleanup()
		preview, err := service.PreviewProjectBundle(tempPath)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		if !preview.Valid {
			return ctx.Status(fiber.StatusBadRequest).JSON(preview)
		}
		return ctx.JSON(preview)
	})

	app.Post("/api/project-bundles/import", func(ctx fiber.Ctx) error {
		tempPath, cleanup, err := saveUploadedBundle(ctx)
		if err != nil {
			return err
		}
		defer cleanup()
		mode := pipeline.BundleImportMode(strings.TrimSpace(ctx.FormValue("mode")))
		projectID := strings.TrimSpace(ctx.FormValue("projectId"))
		result, err := service.ImportProjectBundle(
			tempPath,
			pipeline.ProjectBundleImportRequest{Mode: mode, ProjectID: projectID},
		)
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(result)
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

	app.Patch("/api/progress/:targetId", func(ctx fiber.Ctx) error {
		var request pipeline.PlaybackProgressUpdate
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		progress, err := service.UpdatePlaybackProgress(ctx.Params("targetId"), request)
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(progress)
	})

	app.Post("/api/playback-sessions", func(ctx fiber.Ctx) error {
		var request pipeline.PlaybackProgressUpdate
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		session, err := service.StartPlaybackSession(request)
		if err != nil {
			if errors.Is(err, pipeline.ErrProjectNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(session)
	})

	app.Patch("/api/playback-sessions/:id/sync", func(ctx fiber.Ctx) error {
		var request pipeline.PlaybackProgressUpdate
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		session, err := service.SyncPlaybackSession(ctx.Params("id"), request)
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(session)
	})

	app.Post("/api/playback-sessions/:id/close", func(ctx fiber.Ctx) error {
		var request pipeline.PlaybackProgressUpdate
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		session, err := service.ClosePlaybackSession(ctx.Params("id"), request)
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(session)
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

	app.Get("/api/voice-profiles", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.ListVoiceProfiles())
	})

	app.Get("/api/voice-profiles/:id", func(ctx fiber.Ctx) error {
		profile, err := service.GetVoiceProfile(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(profile)
	})

	app.Get("/api/voice-profiles/:id/lexicon", func(ctx fiber.Ctx) error {
		lex, err := service.GetVoiceProfileLexicon(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(lex)
	})

	app.Post("/api/voice-profiles/:id/lexicon", func(ctx fiber.Ctx) error {
		var request pipeline.LexiconUpsertRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		lex, err := service.UpsertVoiceProfileLexiconEntry(ctx.Params("id"), request)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.Status(fiber.StatusCreated).JSON(lex)
	})

	app.Patch("/api/voice-profiles/:id/lexicon/entries/:entryId", func(ctx fiber.Ctx) error {
		var request pipeline.LexiconUpsertRequest
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}
		request.ID = ctx.Params("entryId")
		lex, err := service.UpsertVoiceProfileLexiconEntry(ctx.Params("id"), request)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(lex)
	})

	app.Delete("/api/voice-profiles/:id/lexicon/entries/:entryId", func(ctx fiber.Ctx) error {
		lex, err := service.DeleteVoiceProfileLexiconEntry(ctx.Params("id"), ctx.Params("entryId"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(lex)
	})

	app.Post("/api/voice-profiles/:id/lexicon/import", func(ctx fiber.Ctx) error {
		file, err := openLexiconUpload(ctx)
		if err != nil {
			return err
		}
		defer file.Close()
		lex, err := service.ImportVoiceProfileLexicon(ctx.Params("id"), file)
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}
		return ctx.JSON(lex)
	})

	app.Get("/api/voice-profiles/:id/lexicon/export.pls", func(ctx fiber.Ctx) error {
		data, err := service.ExportVoiceProfileLexiconPLS(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		ctx.Set(fiber.HeaderContentType, "application/pls+xml")
		ctx.Set(fiber.HeaderContentDisposition, `attachment; filename="voice-profile-lexicon.pls"`)
		return ctx.Send(data)
	})

	app.Get("/api/voice-profile-sources/diagnostics", func(ctx fiber.Ctx) error {
		return ctx.JSON(service.GetVoiceProfileSourceDiagnostics())
	})

	app.Post("/api/voice-profile-sources", func(ctx fiber.Ctx) error {
		form, err := ctx.MultipartForm()
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid multipart form data"))
		}

		fileHeaders := form.File["file"]
		if len(fileHeaders) == 0 {
			fileHeaders = form.File["audio"]
		}
		if len(fileHeaders) == 0 {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("missing voice source file"))
		}
		file := fileHeaders[0]

		maxProfileBytes := service.MaxProfileBytes()
		sourceBytes := file.Size

		sourceFile, err := file.Open()
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("could not read uploaded file"))
		}
		defer func() {
			_ = sourceFile.Close()
		}()

		tempInput, err := os.CreateTemp("", "tts-profile-source-*"+filepath.Ext(file.Filename))
		if err != nil {
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not create upload temp file"))
		}
		tempPath := tempInput.Name()
		defer os.Remove(tempPath)

		if maxProfileBytes > 0 && sourceBytes > maxProfileBytes {
			_ = tempInput.Close()
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusRequestEntityTooLarge).JSON(errorResponse("voice source file is too large"))
		}

		copyLimit := sourceBytes
		if copyLimit <= 0 {
			if maxProfileBytes > 0 {
				copyLimit = maxProfileBytes + 1
			} else {
				copyLimit = 1 << 62
			}
		}

		copied, err := io.Copy(tempInput, io.LimitReader(sourceFile, copyLimit))
		if err != nil {
			_ = tempInput.Close()
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to save uploaded file"))
		}
		if copied == 0 {
			_ = tempInput.Close()
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("uploaded voice source is empty"))
		}
		if maxProfileBytes > 0 && copied > maxProfileBytes {
			_ = tempInput.Close()
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusRequestEntityTooLarge).JSON(errorResponse("voice source file is too large"))
		}
		if err := tempInput.Close(); err != nil {
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not finalize upload temp file"))
		}

		source, err := service.CreateVoiceProfileSource(
			ctx.Context(),
			tempPath,
			file.Filename,
			copied,
		)
		if err != nil {
			if errors.Is(err, pipeline.ErrProfileTooLarge) {
				return ctx.Status(fiber.StatusRequestEntityTooLarge).JSON(errorResponse("voice source file is too large"))
			}
			if errors.Is(err, pipeline.ErrProfileMissingAudio) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}

		return ctx.Status(fiber.StatusCreated).JSON(source)
	})

	app.Get("/api/voice-profile-sources/:id", func(ctx fiber.Ctx) error {
		source, err := service.GetVoiceProfileSource(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}

		return ctx.JSON(source)
	})

	app.Get("/api/voice-profile-sources/:id/candidates/:candidateId/preview.wav", func(ctx fiber.Ctx) error {
		audioBytes, contentType, err := service.GetVoiceProfileCandidatePreview(
			ctx.Params("id"),
			ctx.Params("candidateId"),
			ctx.Query("kind", "clean"),
		)
		if err != nil {
			if errors.Is(err, pipeline.ErrAudioNotReady) {
				return ctx.Status(fiber.StatusConflict).JSON(errorResponse(err.Error()))
			}
			return notFound(ctx, err)
		}

		ctx.Set(fiber.HeaderContentType, contentType)
		ctx.Set(fiber.HeaderCacheControl, "no-store")
		return ctx.Send(audioBytes)
	})

	app.Post("/api/voice-profile-sources/:id/candidates/:candidateId/profiles", func(ctx fiber.Ctx) error {
		var request struct {
			Name     string `json:"name"`
			Language string `json:"language"`
		}
		if err := ctx.Bind().Body(&request); err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid JSON body"))
		}

		profile, err := service.CreateVoiceProfileFromCandidate(
			ctx.Context(),
			ctx.Params("id"),
			ctx.Params("candidateId"),
			request.Name,
			request.Language,
		)
		if err != nil {
			if errors.Is(err, pipeline.ErrProfileSourceNotFound) ||
				errors.Is(err, pipeline.ErrProfileCandidateNotFound) {
				return notFound(ctx, err)
			}
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
		}

		return ctx.Status(fiber.StatusCreated).JSON(profile)
	})

	app.Post("/api/voice-profiles", func(ctx fiber.Ctx) error {
		form, err := ctx.MultipartForm()
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid multipart form data"))
		}

		fileHeaders := form.File["file"]
		if len(fileHeaders) == 0 {
			fileHeaders = form.File["audio"]
		}
		if len(fileHeaders) == 0 {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("missing voice reference file"))
		}
		file := fileHeaders[0]

		name := strings.TrimSpace(ctx.FormValue("name"))
		language := strings.TrimSpace(ctx.FormValue("language"))
		if language == "" {
			language = strings.TrimSpace(ctx.FormValue("voiceLanguage"))
		}
		maxProfileBytes := service.MaxProfileBytes()
		sourceBytes := file.Size

		sourceFile, err := file.Open()
		if err != nil {
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("could not read uploaded file"))
		}
		defer func() {
			_ = sourceFile.Close()
		}()

		tempInput, err := os.CreateTemp("", "tts-profile-*"+filepath.Ext(file.Filename))
		if err != nil {
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not create upload temp file"))
		}
		tempPath := tempInput.Name()
		defer os.Remove(tempPath)

		if maxProfileBytes > 0 && sourceBytes > maxProfileBytes {
			_ = tempInput.Close()
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusRequestEntityTooLarge).JSON(errorResponse("voice profile file is too large"))
		}

		copyLimit := sourceBytes
		if copyLimit <= 0 {
			if maxProfileBytes > 0 {
				copyLimit = maxProfileBytes + 1
			} else {
				copyLimit = 1 << 62
			}
		}

		copied, err := io.Copy(tempInput, io.LimitReader(sourceFile, copyLimit))
		if err != nil {
			_ = tempInput.Close()
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to save uploaded file"))
		}
		if copied == 0 {
			_ = tempInput.Close()
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("uploaded voice profile is empty"))
		}
		if maxProfileBytes > 0 && copied > maxProfileBytes {
			_ = tempInput.Close()
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusRequestEntityTooLarge).JSON(errorResponse("voice profile file is too large"))
		}
		if err := tempInput.Close(); err != nil {
			_ = os.Remove(tempPath)
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not finalize upload temp file"))
		}

		profile, err := service.CreateVoiceProfile(
			ctx.Context(),
			name,
			language,
			tempPath,
			file.Filename,
			copied,
		)
		if err != nil {
			if errors.Is(err, pipeline.ErrProfileTooLarge) {
				return ctx.Status(fiber.StatusRequestEntityTooLarge).JSON(errorResponse("voice profile file is too large"))
			}
			if errors.Is(err, pipeline.ErrProfileMissingAudio) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			if errors.Is(err, pipeline.ErrProfileExtractionFailed) {
				return ctx.Status(fiber.StatusBadRequest).JSON(errorResponse(err.Error()))
			}
			return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
		}

		return ctx.Status(fiber.StatusCreated).JSON(profile)
	})

	app.Delete("/api/voice-profiles/:id", func(ctx fiber.Ctx) error {
		if err := service.DeleteVoiceProfile(ctx.Params("id")); err != nil {
			return notFound(ctx, err)
		}
		return ctx.SendStatus(fiber.StatusNoContent)
	})

	return app
}

func corsAllowedOrigins() []string {
	origins := []string{
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://localhost:5174",
		"http://127.0.0.1:5174",
		"http://localhost:5175",
		"http://127.0.0.1:5175",
	}
	seen := make(map[string]struct{}, len(origins)+4)
	for _, origin := range origins {
		seen[origin] = struct{}{}
	}

	if frontendPort := strings.TrimSpace(os.Getenv("FRONTEND_PORT")); frontendPort != "" {
		addOrigin(&origins, seen, "http://localhost:"+frontendPort)
		addOrigin(&origins, seen, "http://127.0.0.1:"+frontendPort)
	}
	for _, origin := range strings.Split(os.Getenv("VOICE_CORS_ORIGINS"), ",") {
		addOrigin(&origins, seen, strings.TrimSpace(origin))
	}
	return origins
}

func addOrigin(origins *[]string, seen map[string]struct{}, origin string) {
	if origin == "" {
		return
	}
	if _, ok := seen[origin]; ok {
		return
	}
	seen[origin] = struct{}{}
	*origins = append(*origins, origin)
}

func notFound(ctx fiber.Ctx, err error) error {
	if errors.Is(err, pipeline.ErrJobNotFound) ||
		errors.Is(err, pipeline.ErrVoiceNotFound) ||
		errors.Is(err, pipeline.ErrProfileNotFound) ||
		errors.Is(err, pipeline.ErrProfileSourceNotFound) ||
		errors.Is(err, pipeline.ErrProfileCandidateNotFound) ||
		errors.Is(err, pipeline.ErrProjectNotFound) ||
		errors.Is(err, pipeline.ErrBookSourceNotFound) ||
		errors.Is(err, pipeline.ErrPreparedSourceNotFound) ||
		errors.Is(err, pipeline.ErrContentIRNotFound) ||
		errors.Is(err, pipeline.ErrProgressNotFound) ||
		errors.Is(err, pipeline.ErrPlaybackSessionNotFound) {
		return ctx.Status(fiber.StatusNotFound).JSON(errorResponse(err.Error()))
	}

	return ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse(err.Error()))
}

func errorResponse(message string) fiber.Map {
	return fiber.Map{"error": message}
}

func saveUploadedBundle(ctx fiber.Ctx) (string, func(), error) {
	form, err := ctx.MultipartForm()
	if err != nil {
		return "", nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid multipart form data"))
	}
	fileHeaders := form.File["file"]
	if len(fileHeaders) == 0 {
		fileHeaders = form.File["bundle"]
	}
	if len(fileHeaders) == 0 {
		return "", nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("missing project bundle file"))
	}
	file := fileHeaders[0]
	sourceFile, err := file.Open()
	if err != nil {
		return "", nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("could not read uploaded bundle"))
	}
	defer func() {
		_ = sourceFile.Close()
	}()
	tempInput, err := os.CreateTemp("", "voice-studio-bundle-*"+filepath.Ext(file.Filename))
	if err != nil {
		return "", nil, ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not create bundle temp file"))
	}
	tempPath := tempInput.Name()
	cleanup := func() {
		_ = os.Remove(tempPath)
	}
	if _, err := io.Copy(tempInput, sourceFile); err != nil {
		_ = tempInput.Close()
		cleanup()
		return "", nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to save uploaded bundle"))
	}
	if err := tempInput.Close(); err != nil {
		cleanup()
		return "", nil, ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not finalize uploaded bundle"))
	}
	return tempPath, cleanup, nil
}

func saveUploadedBooks(ctx fiber.Ctx) ([]pipeline.BookSourceUpload, pipeline.BookSourceImportOptions, func(), error) {
	form, err := ctx.MultipartForm()
	if err != nil {
		return nil, pipeline.BookSourceImportOptions{}, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid multipart form data"))
	}
	fileHeaders := form.File["file"]
	if len(fileHeaders) == 0 {
		fileHeaders = form.File["book"]
	}
	if len(fileHeaders) == 0 {
		return nil, pipeline.BookSourceImportOptions{}, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("missing book source file"))
	}
	tempPaths := make([]string, 0, len(fileHeaders))
	uploads := make([]pipeline.BookSourceUpload, 0, len(fileHeaders))
	cleanup := func() {
		for _, tempPath := range tempPaths {
			_ = os.Remove(tempPath)
		}
	}
	for _, file := range fileHeaders {
		sourceFile, err := file.Open()
		if err != nil {
			cleanup()
			return nil, pipeline.BookSourceImportOptions{}, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("could not read uploaded book"))
		}
		tempInput, err := os.CreateTemp("", "voice-studio-book-*"+filepath.Ext(file.Filename))
		if err != nil {
			_ = sourceFile.Close()
			cleanup()
			return nil, pipeline.BookSourceImportOptions{}, nil, ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not create book temp file"))
		}
		tempPath := tempInput.Name()
		tempPaths = append(tempPaths, tempPath)
		copied, err := io.Copy(tempInput, sourceFile)
		_ = sourceFile.Close()
		if err != nil {
			_ = tempInput.Close()
			cleanup()
			return nil, pipeline.BookSourceImportOptions{}, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to save uploaded book"))
		}
		if copied == 0 {
			_ = tempInput.Close()
			cleanup()
			return nil, pipeline.BookSourceImportOptions{}, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("uploaded book is empty"))
		}
		if err := tempInput.Close(); err != nil {
			cleanup()
			return nil, pipeline.BookSourceImportOptions{}, nil, ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not finalize uploaded book"))
		}
		uploads = append(uploads, pipeline.BookSourceUpload{
			Path:     tempPath,
			Filename: file.Filename,
			Bytes:    copied,
		})
	}
	return uploads, pipeline.BookSourceImportOptions{
		ImportProfile: pipeline.BookImportProfile(firstFormValue(form.Value["importProfile"])),
		PDFTableMode:  pipeline.PDFTableMode(firstFormValue(form.Value["pdfTableMode"])),
	}, cleanup, nil
}

func firstFormValue(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func openLexiconUpload(ctx fiber.Ctx) (io.ReadCloser, error) {
	form, err := ctx.MultipartForm()
	if err != nil {
		return nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid multipart form data"))
	}
	fileHeaders := form.File["file"]
	if len(fileHeaders) == 0 {
		fileHeaders = form.File["lexicon"]
	}
	if len(fileHeaders) == 0 {
		return nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("missing lexicon file"))
	}
	file, err := fileHeaders[0].Open()
	if err != nil {
		return nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("could not read lexicon file"))
	}
	return file, nil
}

func saveUploadedSource(ctx fiber.Ctx) (string, string, int64, func(), error) {
	form, err := ctx.MultipartForm()
	if err != nil {
		return "", "", 0, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("invalid multipart form data"))
	}
	fileHeaders := form.File["file"]
	if len(fileHeaders) == 0 {
		fileHeaders = form.File["source"]
	}
	if len(fileHeaders) == 0 {
		return "", "", 0, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("missing source file"))
	}
	file := fileHeaders[0]
	sourceFile, err := file.Open()
	if err != nil {
		return "", "", 0, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("could not read uploaded source"))
	}
	defer func() {
		_ = sourceFile.Close()
	}()
	tempInput, err := os.CreateTemp("", "voice-studio-source-*"+filepath.Ext(file.Filename))
	if err != nil {
		return "", "", 0, nil, ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not create source temp file"))
	}
	tempPath := tempInput.Name()
	cleanup := func() {
		_ = os.Remove(tempPath)
	}
	copied, err := io.Copy(tempInput, sourceFile)
	if err != nil {
		_ = tempInput.Close()
		cleanup()
		return "", "", 0, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("unable to save uploaded source"))
	}
	if copied == 0 {
		_ = tempInput.Close()
		cleanup()
		return "", "", 0, nil, ctx.Status(fiber.StatusBadRequest).JSON(errorResponse("uploaded source is empty"))
	}
	if err := tempInput.Close(); err != nil {
		cleanup()
		return "", "", 0, nil, ctx.Status(fiber.StatusInternalServerError).JSON(errorResponse("could not finalize uploaded source"))
	}
	return tempPath, file.Filename, copied, cleanup, nil
}

func bookScopeFromQuery(ctx fiber.Ctx) *pipeline.BookScope {
	scopeType := pipeline.BookScopeType(strings.TrimSpace(ctx.Query("type")))
	if scopeType == "" {
		scopeType = pipeline.BookScopeTypeChapter
	}
	scope := &pipeline.BookScope{Type: scopeType, Label: strings.TrimSpace(ctx.Query("label"))}
	switch scopeType {
	case pipeline.BookScopeTypeChapter:
		if value, err := strconv.Atoi(strings.TrimSpace(ctx.Query("chapterIndex"))); err == nil {
			scope.ChapterIndex = value
		}
	case pipeline.BookScopeTypePages:
		if value, err := strconv.Atoi(strings.TrimSpace(ctx.Query("pageStart"))); err == nil {
			scope.PageStart = value
		}
		if value, err := strconv.Atoi(strings.TrimSpace(ctx.Query("pageEnd"))); err == nil {
			scope.PageEnd = value
		}
	case pipeline.BookScopeTypeBook:
	default:
		scope.Type = pipeline.BookScopeTypeBook
	}
	return scope
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
