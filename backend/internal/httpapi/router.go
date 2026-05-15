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
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
	systemmetrics "github.com/justinedwards/tts-research/backend/internal/systemmetrics"
)

func NewRouter(service *pipeline.Service) *fiber.App {
	bodyLimit := 0
	if maxProfileBytes := service.MaxProfileBytes(); maxProfileBytes > 0 {
		const bodyPadding = 1024 * 1024
		maxLimit := maxProfileBytes + int64(bodyPadding)
		maxInt := int64(int(^uint(0) >> 1))
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
		AllowOrigins: []string{
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"http://localhost:5174",
			"http://127.0.0.1:5174",
			"http://localhost:5175",
			"http://127.0.0.1:5175",
		},
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

	app.Get("/api/projects/:id/jobs", func(ctx fiber.Ctx) error {
		jobs, err := service.ListProjectJobs(ctx.Params("id"))
		if err != nil {
			return notFound(ctx, err)
		}
		return ctx.JSON(jobs)
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

func notFound(ctx fiber.Ctx, err error) error {
	if errors.Is(err, pipeline.ErrJobNotFound) ||
		errors.Is(err, pipeline.ErrProfileNotFound) ||
		errors.Is(err, pipeline.ErrProfileSourceNotFound) ||
		errors.Is(err, pipeline.ErrProfileCandidateNotFound) ||
		errors.Is(err, pipeline.ErrProjectNotFound) {
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
