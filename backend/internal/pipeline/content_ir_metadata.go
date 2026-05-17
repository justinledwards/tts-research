package pipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/policy"
	"github.com/justinedwards/tts-research/backend/internal/speechplan"
)

const contentIRFilename = "content-ir.json"
const speechPlanFilename = "speech-plan.v1.json"

type contentIRSourceDescriptor struct {
	ID             string
	ProjectID      string
	Name           string
	SourceType     string
	Format         string
	AdapterVersion string
}

func preparedSourceIRDescriptor(source PreparedSource) contentIRSourceDescriptor {
	format := strings.TrimSpace(source.SourceFormat)
	if format == "" {
		format = string(source.Kind)
	}
	adapterVersion := "prepared-source-to-ir.v1"
	if format == "markdown" && strings.TrimSpace(source.PreprocessorVersion) != "" {
		adapterVersion = source.PreprocessorVersion
	}
	return contentIRSourceDescriptor{
		ID:             source.ID,
		ProjectID:      source.ProjectID,
		Name:           source.SourceName,
		SourceType:     "preparedSource",
		Format:         format,
		AdapterVersion: adapterVersion,
	}
}

func bookSourceIRDescriptor(book BookSource) contentIRSourceDescriptor {
	return contentIRSourceDescriptor{
		ID:             book.ID,
		ProjectID:      book.ProjectID,
		Name:           book.SourceFile,
		SourceType:     "bookSource",
		Format:         string(book.Kind),
		AdapterVersion: "book-source-to-ir.v1",
	}
}

func newContentIRDocument(
	descriptor contentIRSourceDescriptor,
	generatedAt time.Time,
	nodes []contentir.Node,
) contentir.Document {
	return contentir.NewDocument(
		descriptor.ID,
		descriptor.SourceType,
		descriptor.ID,
		descriptor.ProjectID,
		descriptor.Name,
		descriptor.AdapterVersion,
		generatedAt,
		nodes,
	)
}

func (service *Service) GetContentIR(id string) (contentir.Document, error) {
	return service.GetContentIRSchema(id, contentir.SchemaVersionV1)
}

func (service *Service) GetContentIRSchema(id string, schemaVersion string) (contentir.Document, error) {
	document, err := service.contentIRDocument(id)
	if err != nil {
		return contentir.Document{}, err
	}
	return contentir.ToSchemaVersion(document, schemaVersion)
}

func (service *Service) contentIRDocument(id string) (contentir.Document, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return contentir.Document{}, ErrContentIRNotFound
	}
	if source, ok := service.preparedSourceByID(id); ok {
		return service.preparedSourceContentIR(source)
	}
	if book, ok := service.bookSourceByID(id); ok {
		return service.bookSourceContentIR(book)
	}
	return contentir.Document{}, ErrContentIRNotFound
}

func (service *Service) PreviewContentIRSpeechPolicy(id string, request SpeechPolicyPreviewRequest) (contentir.Document, error) {
	return service.PreviewContentIRSpeechPolicySchema(id, request, contentir.SchemaVersionV1)
}

func (service *Service) PreviewContentIRSpeechPolicySchema(
	id string,
	request SpeechPolicyPreviewRequest,
	schemaVersion string,
) (contentir.Document, error) {
	document, err := service.contentIRDocument(id)
	if err != nil {
		return contentir.Document{}, err
	}
	document = service.evaluateContentIRSpeechPolicy(document, request, false)
	return contentir.ToSchemaVersion(document, schemaVersion)
}

func (service *Service) preparedSourceByID(id string) (PreparedSource, bool) {
	service.mu.RLock()
	source, ok := service.sourcePreps[id]
	service.mu.RUnlock()
	if !ok {
		return PreparedSource{}, false
	}
	return service.sanitizePreparedSourceWarnings(source), true
}

func (service *Service) bookSourceByID(id string) (BookSource, bool) {
	service.mu.RLock()
	book, ok := service.books[id]
	service.mu.RUnlock()
	if !ok {
		return BookSource{}, false
	}
	nextBook := book.BookSource
	ensureBookStructureMetadata(&nextBook)
	return nextBook, true
}

func (service *Service) preparedSourceContentIR(source PreparedSource) (contentir.Document, error) {
	path := filepath.Join(service.preparedSourceDataDir(source.ID), contentIRFilename)
	document, err := readContentIR(path)
	if err == nil {
		return service.backfillContentIRSpeechPolicy(sanitizeContentIRSentenceWarnings(document, service.options.SourcePrepSentenceMaxRunes)), nil
	}
	if !os.IsNotExist(err) {
		return contentir.Document{}, fmt.Errorf("read prepared source content IR: %w", err)
	}
	return service.backfillContentIRSpeechPolicy(sanitizeContentIRSentenceWarnings(PreparedSourceToIR(source, time.Now().UTC()), service.options.SourcePrepSentenceMaxRunes)), nil
}

func (service *Service) bookSourceContentIR(book BookSource) (contentir.Document, error) {
	path := filepath.Join(service.bookSourceDataDir(book.ID), contentIRFilename)
	document, err := readContentIR(path)
	if err == nil {
		return service.backfillContentIRSpeechPolicy(document), nil
	}
	if !os.IsNotExist(err) {
		return contentir.Document{}, fmt.Errorf("read book source content IR: %w", err)
	}
	return service.backfillContentIRSpeechPolicy(BookSourceToIR(book, time.Now().UTC())), nil
}

func (service *Service) writePreparedSourceContentIR(source PreparedSource) error {
	return service.writeContentIR(service.preparedSourceDataDir(source.ID), PreparedSourceToIR(source, time.Now().UTC()))
}

func (service *Service) writeBookSourceContentIR(book BookSource) error {
	return service.writeContentIR(service.bookSourceDataDir(book.ID), BookSourceToIR(book, time.Now().UTC()))
}

func (service *Service) writeBookSourceContentIRDocument(bookID string, document contentir.Document) error {
	return service.writeContentIR(service.bookSourceDataDir(bookID), document)
}

func (service *Service) writeContentIR(outputDir string, document contentir.Document) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	storedDocument, err := contentir.ToV1(document)
	if err != nil {
		return err
	}
	encoded, err := contentir.JSONSerializer{}.Encode(storedDocument)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(outputDir, contentIRFilename), encoded, 0o644); err != nil {
		return err
	}
	plan, err := speechplan.BuildFromContentIR(storedDocument, speechplan.BuildOptions{
		ID:          storedDocument.ID,
		GeneratedAt: time.Now().UTC(),
		LocatorKind: "highlight",
	})
	if err != nil {
		return err
	}
	encodedPlan, err := speechplan.Encode(plan)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(outputDir, speechPlanFilename), encodedPlan, 0o644)
}

func (service *Service) backfillContentIRSpeechPolicy(document contentir.Document) contentir.Document {
	return service.evaluateContentIRSpeechPolicy(document, SpeechPolicyPreviewRequest{}, true)
}

func (service *Service) evaluateContentIRSpeechPolicy(
	document contentir.Document,
	request SpeechPolicyPreviewRequest,
	onlyMissing bool,
) contentir.Document {
	evaluator := policy.NewEvaluator(policy.DefaultProfileName, request.Overrides)
	if strings.TrimSpace(document.ProjectID) != "" {
		if project, err := service.GetProject(document.ProjectID); err == nil {
			profileName := strings.TrimSpace(request.Profile)
			if profileName == "" {
				profileName = project.SpeechPolicyProfile
			}
			evaluator = projectSpeechPolicyEvaluator(project, profileName, request.Overrides)
		}
	}
	for index, node := range document.Nodes {
		if onlyMissing && !node.Speech.SpeechPolicy.IsZero() {
			if strings.TrimSpace(node.SpeechText) != "" {
				rendered := service.RenderSpeechText(node.SpeechText, SpeechRenderOptions{
					ProjectID:      document.ProjectID,
					VoiceProfileID: request.VoiceProfileID,
					Locale:         request.Locale,
					TTSEngine:      request.TTSEngine,
					Kind:           NarrationBlockKind(node.Kind),
					FallbackLang:   node.Lang,
				})
				node.SpeechText = rendered.PlainText
				node.Lang = rendered.Lang
				if node.Metadata == nil {
					node.Metadata = contentir.Metadata{}
				}
				node.Metadata[speechRenderMetadataKey] = rendered
				node.Warnings = uniqueStrings(append(node.Warnings, rendered.Warnings...))
			}
			document.Nodes[index] = node
			continue
		}
		decision := evaluator.Evaluate(policy.Element{
			Kind:     node.Kind,
			Role:     node.Role,
			Text:     firstNonEmpty(node.DisplayText, node.NormalisedText, node.SpeechText),
			Language: node.Lang,
			Warnings: node.Warnings,
		})
		node.Speech.SpeechPolicy = decision.Policy
		if !onlyMissing {
			node.SpeechText = strings.TrimSpace(decision.SpeechText)
			node.Speech.PolicyHint.Mode = string(legacySpeakModeForDecision(decision))
		}
		if strings.TrimSpace(node.SpeechText) != "" && legacySpeakModeForDecision(decision) != NarrationSpeakModeSkip {
			rendered := service.RenderSpeechText(node.SpeechText, SpeechRenderOptions{
				ProjectID:      document.ProjectID,
				VoiceProfileID: request.VoiceProfileID,
				Locale:         request.Locale,
				TTSEngine:      request.TTSEngine,
				Kind:           NarrationBlockKind(node.Kind),
				FallbackLang:   node.Lang,
			})
			node.SpeechText = rendered.PlainText
			node.Lang = rendered.Lang
			if node.Metadata == nil {
				node.Metadata = contentir.Metadata{}
			}
			node.Metadata[speechRenderMetadataKey] = rendered
			node.Warnings = uniqueStrings(append(node.Warnings, rendered.Warnings...))
		}
		document.Nodes[index] = node
	}
	return document
}

func readContentIR(path string) (contentir.Document, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return contentir.Document{}, err
	}
	return contentir.JSONSerializer{}.Decode(data)
}

func (service *Service) GetSpeechPlan(id string) (speechplan.Document, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return speechplan.Document{}, ErrContentIRNotFound
	}
	if source, ok := service.preparedSourceByID(id); ok {
		return service.sourceSpeechPlan(service.preparedSourceDataDir(source.ID), id)
	}
	if book, ok := service.bookSourceByID(id); ok {
		return service.sourceSpeechPlan(service.bookSourceDataDir(book.ID), id)
	}
	return speechplan.Document{}, ErrContentIRNotFound
}

func (service *Service) sourceSpeechPlan(outputDir string, id string) (speechplan.Document, error) {
	path := filepath.Join(outputDir, speechPlanFilename)
	data, err := os.ReadFile(path)
	if err == nil {
		return speechplan.Decode(data)
	}
	if !os.IsNotExist(err) {
		return speechplan.Document{}, err
	}
	document, err := service.GetContentIRSchema(id, contentir.SchemaVersionV11)
	if err != nil {
		return speechplan.Document{}, err
	}
	plan, err := speechplan.BuildFromContentIR(document, speechplan.BuildOptions{
		ID:          document.ID,
		GeneratedAt: time.Now().UTC(),
		LocatorKind: "highlight",
	})
	if err != nil {
		return speechplan.Document{}, err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return speechplan.Document{}, err
	}
	encoded, err := speechplan.Encode(plan)
	if err != nil {
		return speechplan.Document{}, err
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		return speechplan.Document{}, err
	}
	return plan, nil
}

func (service *Service) preparedSourceDataDir(id string) string {
	outputDir, err := filepath.Abs(filepath.Join(service.options.SourcePrepDir, id))
	if err != nil {
		return filepath.Join(service.options.SourcePrepDir, id)
	}
	return outputDir
}

func (service *Service) bookSourceDataDir(id string) string {
	outputDir, err := filepath.Abs(filepath.Join(service.options.BookSourceDir, id))
	if err != nil {
		return filepath.Join(service.options.BookSourceDir, id)
	}
	return outputDir
}

func contentIRText(value string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
}

func contentIRStringSlice(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	output := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			output = append(output, value)
		}
	}
	return output
}

func sanitizeContentIRSentenceWarnings(document contentir.Document, maxSentenceRunes int) contentir.Document {
	if maxSentenceRunes <= 0 {
		maxSentenceRunes = defaultSourcePrepSentenceMaxRunes
	}
	for index, node := range document.Nodes {
		if !hasWarning(node.Warnings, warningSentenceTooLong) {
			continue
		}
		text := firstNonEmpty(node.SpeechText, node.NormalisedText, node.DisplayText)
		if textHasUnsafeSentence(text, maxSentenceRunes) {
			continue
		}
		node.Warnings = removeWarning(node.Warnings, warningSentenceTooLong)
		document.Nodes[index] = node
	}
	return document
}

func textHasUnsafeSentence(text string, maxSentenceRunes int) bool {
	for _, sentence := range splitSentencePieces(text) {
		if utf8.RuneCountInString(strings.TrimSpace(sentence)) > maxSentenceRunes {
			return true
		}
	}
	return false
}
