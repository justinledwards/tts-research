package pipeline

import (
	"errors"
	"io"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/lexicon"
)

type LexiconUpsertRequest struct {
	ID            string `json:"id,omitempty"`
	Term          string `json:"term"`
	Replacement   string `json:"replacement,omitempty"`
	Alphabet      string `json:"alphabet,omitempty"`
	Phoneme       string `json:"phoneme,omitempty"`
	Lang          string `json:"lang,omitempty"`
	Locale        string `json:"locale,omitempty"`
	CaseSensitive bool   `json:"caseSensitive,omitempty"`
	Protected     bool   `json:"protected,omitempty"`
	Notes         string `json:"notes,omitempty"`
}

func (service *Service) GetProjectLexicon(projectID string) (lexicon.Lexicon, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return lexicon.Lexicon{}, err
	}
	return service.projectLexiconStore(project.ID).Load()
}

func (service *Service) UpsertProjectLexiconEntry(projectID string, request LexiconUpsertRequest) (lexicon.Lexicon, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return lexicon.Lexicon{}, err
	}
	lex, _, err := service.projectLexiconStore(project.ID).Upsert(lexiconEntryFromRequest(request, lexicon.ScopeProject))
	return lex, err
}

func (service *Service) DeleteProjectLexiconEntry(projectID string, entryID string) (lexicon.Lexicon, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return lexicon.Lexicon{}, err
	}
	return service.projectLexiconStore(project.ID).Delete(entryID)
}

func (service *Service) ImportProjectLexicon(projectID string, reader io.Reader) (lexicon.Lexicon, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return lexicon.Lexicon{}, err
	}
	return service.importLexiconEntries(service.projectLexiconStore(project.ID), reader)
}

func (service *Service) ExportProjectLexiconPLS(projectID string) ([]byte, error) {
	lex, err := service.GetProjectLexicon(projectID)
	if err != nil {
		return nil, err
	}
	return lexicon.EncodePLS(lex)
}

func (service *Service) GetVoiceProfileLexicon(profileID string) (lexicon.Lexicon, error) {
	if _, err := service.GetVoiceProfile(profileID); err != nil {
		return lexicon.Lexicon{}, err
	}
	return service.voiceProfileLexiconStore(profileID).Load()
}

func (service *Service) UpsertVoiceProfileLexiconEntry(profileID string, request LexiconUpsertRequest) (lexicon.Lexicon, error) {
	if _, err := service.GetVoiceProfile(profileID); err != nil {
		return lexicon.Lexicon{}, err
	}
	lex, _, err := service.voiceProfileLexiconStore(profileID).Upsert(lexiconEntryFromRequest(request, lexicon.ScopeVoiceProfile))
	return lex, err
}

func (service *Service) DeleteVoiceProfileLexiconEntry(profileID string, entryID string) (lexicon.Lexicon, error) {
	if _, err := service.GetVoiceProfile(profileID); err != nil {
		return lexicon.Lexicon{}, err
	}
	return service.voiceProfileLexiconStore(profileID).Delete(entryID)
}

func (service *Service) ImportVoiceProfileLexicon(profileID string, reader io.Reader) (lexicon.Lexicon, error) {
	if _, err := service.GetVoiceProfile(profileID); err != nil {
		return lexicon.Lexicon{}, err
	}
	return service.importLexiconEntries(service.voiceProfileLexiconStore(profileID), reader)
}

func (service *Service) ExportVoiceProfileLexiconPLS(profileID string) ([]byte, error) {
	lex, err := service.GetVoiceProfileLexicon(profileID)
	if err != nil {
		return nil, err
	}
	return lexicon.EncodePLS(lex)
}

func (service *Service) importLexiconEntries(store lexicon.Store, reader io.Reader) (lexicon.Lexicon, error) {
	entries, err := lexicon.DecodePLS(reader, store.Scope)
	if err != nil {
		return lexicon.Lexicon{}, err
	}
	if len(entries) == 0 {
		return store.Load()
	}
	var lex lexicon.Lexicon
	for _, entry := range entries {
		lex, _, err = store.Upsert(entry)
		if err != nil {
			return lexicon.Lexicon{}, err
		}
	}
	return lex, nil
}

func lexiconEntryFromRequest(request LexiconUpsertRequest, scope lexicon.Scope) lexicon.Entry {
	return lexicon.Entry{
		ID:            strings.TrimSpace(request.ID),
		Term:          request.Term,
		Replacement:   request.Replacement,
		Alphabet:      request.Alphabet,
		Phoneme:       request.Phoneme,
		Lang:          request.Lang,
		Locale:        request.Locale,
		CaseSensitive: request.CaseSensitive,
		Protected:     request.Protected,
		Scope:         scope,
		Notes:         request.Notes,
	}
}

func (service *Service) projectLexiconStore(projectID string) lexicon.Store {
	return lexicon.ProjectStore(service.options.ProjectDataDir, projectID)
}

func (service *Service) voiceProfileLexiconStore(profileID string) lexicon.Store {
	return lexicon.VoiceProfileStore(service.options.VoiceProfileDir, profileID)
}

func isLexiconNotFound(err error) bool {
	return errors.Is(err, lexicon.ErrEntryNotFound)
}
