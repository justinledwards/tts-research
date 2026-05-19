package pipeline

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var ErrVoiceProfileCredentialEmpty = errors.New("hugging face token is required")

type VoiceProfileCredentialStatus struct {
	HuggingFaceTokenConfigured bool   `json:"huggingFaceTokenConfigured"`
	HuggingFaceTokenSource     string `json:"huggingFaceTokenSource"`
}

type voiceProfileCredentialFile struct {
	HuggingFaceToken string `json:"huggingFaceToken"`
}

func (service *Service) GetVoiceProfileCredentialStatus() VoiceProfileCredentialStatus {
	_, source := service.activeVoiceProfileHuggingFaceToken()
	return VoiceProfileCredentialStatus{
		HuggingFaceTokenConfigured: source != "none",
		HuggingFaceTokenSource:     source,
	}
}

func (service *Service) SaveVoiceProfileHuggingFaceToken(token string) (VoiceProfileCredentialStatus, error) {
	clean := strings.TrimSpace(token)
	if clean == "" {
		return VoiceProfileCredentialStatus{}, ErrVoiceProfileCredentialEmpty
	}
	path := service.voiceProfileCredentialsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return VoiceProfileCredentialStatus{}, fmt.Errorf("create credential directory: %w", err)
	}
	payload, err := json.MarshalIndent(voiceProfileCredentialFile{HuggingFaceToken: clean}, "", "  ")
	if err != nil {
		return VoiceProfileCredentialStatus{}, err
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		return VoiceProfileCredentialStatus{}, fmt.Errorf("write credential file: %w", err)
	}
	_ = os.Chmod(filepath.Dir(path), 0o700)
	_ = os.Chmod(path, 0o600)
	return service.GetVoiceProfileCredentialStatus(), nil
}

func (service *Service) ClearVoiceProfileHuggingFaceToken() (VoiceProfileCredentialStatus, error) {
	path := service.voiceProfileCredentialsPath()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return VoiceProfileCredentialStatus{}, fmt.Errorf("remove credential file: %w", err)
	}
	return service.GetVoiceProfileCredentialStatus(), nil
}

func (service *Service) activeVoiceProfileHuggingFaceToken() (string, string) {
	if token := strings.TrimSpace(service.readLocalVoiceProfileHuggingFaceToken()); token != "" {
		return token, "local"
	}
	if token := strings.TrimSpace(service.options.VoiceProfileDiarizationToken); token != "" {
		return token, "env"
	}
	return "", "none"
}

func (service *Service) readLocalVoiceProfileHuggingFaceToken() string {
	data, err := os.ReadFile(service.voiceProfileCredentialsPath())
	if err != nil {
		return ""
	}
	var payload voiceProfileCredentialFile
	if err := json.Unmarshal(data, &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.HuggingFaceToken)
}

func (service *Service) voiceProfileCredentialsPath() string {
	path := strings.TrimSpace(service.options.VoiceProfileCredentialsPath)
	if path == "" {
		path = defaultVoiceProfileCredentialsPath
	}
	if abs, err := filepath.Abs(path); err == nil {
		return abs
	}
	return path
}
