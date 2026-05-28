package pipeline

import (
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/policy"
)

func projectSpeechPolicyResponse(project VoiceProject) ProjectSpeechPolicy {
	project = normalizeProjectSpeechPolicy(project)
	settings, _ := projectSpeechPolicySettings(project, project.SpeechPolicyProfile)
	return ProjectSpeechPolicy{
		ProjectID:      project.ID,
		Profile:        project.SpeechPolicyProfile,
		Settings:       settings,
		CustomProfiles: cloneCustomSpeechPolicyProfiles(project.SpeechPolicyProfiles),
	}
}

func normalizeProjectSpeechPolicy(project VoiceProject) VoiceProject {
	project.SpeechPolicyProfiles = normalizeCustomSpeechPolicyProfiles(project.SpeechPolicyProfiles)
	profile, err := resolveProjectSpeechPolicyProfile(project, project.SpeechPolicyProfile)
	if err != nil {
		profile = string(policy.DefaultProfileName)
	}
	project.SpeechPolicyProfile = profile
	return project
}

func normalizeCustomSpeechPolicyProfiles(profiles []CustomSpeechPolicyProfile) []CustomSpeechPolicyProfile {
	if len(profiles) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	normalized := make([]CustomSpeechPolicyProfile, 0, len(profiles))
	for _, profile := range profiles {
		profile.ID = strings.TrimSpace(profile.ID)
		if profile.ID == "" {
			continue
		}
		if _, ok := seen[profile.ID]; ok {
			continue
		}
		seen[profile.ID] = struct{}{}
		profile.Name = cleanSpeechPolicyProfileName(profile.Name)
		profile.BaseProfile = resolveBaseSpeechPolicyProfile(profile.BaseProfile)
		profile.Settings = normalizeCustomSpeechPolicySettings(profile.Settings, profile.BaseProfile)
		if profile.CreatedAt.IsZero() {
			profile.CreatedAt = time.Now().UTC()
		}
		if profile.UpdatedAt.IsZero() {
			profile.UpdatedAt = profile.CreatedAt
		}
		normalized = append(normalized, profile)
	}
	return normalized
}

func cloneCustomSpeechPolicyProfiles(profiles []CustomSpeechPolicyProfile) []CustomSpeechPolicyProfile {
	if len(profiles) == 0 {
		return nil
	}
	cloned := append([]CustomSpeechPolicyProfile(nil), profiles...)
	return cloned
}

func resolveProjectSpeechPolicyProfile(project VoiceProject, profileName string) (string, error) {
	profileName = strings.TrimSpace(profileName)
	for _, profile := range project.SpeechPolicyProfiles {
		if profile.ID == profileName {
			return profile.ID, nil
		}
	}
	if isBuiltinSpeechPolicyProfile(profileName) {
		return string(policy.NormalizeProfileName(profileName)), nil
	}
	return "", ErrSpeechPolicyProfileNotFound
}

func isBuiltinSpeechPolicyProfile(profileName string) bool {
	profileName = strings.TrimSpace(profileName)
	for _, profile := range policy.Profiles() {
		if string(profile.Name) == profileName {
			return true
		}
	}
	return false
}

func resolveBaseSpeechPolicyProfile(profileName string) string {
	if isBuiltinSpeechPolicyProfile(profileName) {
		return string(policy.NormalizeProfileName(profileName))
	}
	return string(policy.DefaultProfileName)
}

func projectSpeechPolicySettings(project VoiceProject, profileName string) (policy.Settings, error) {
	profileName = strings.TrimSpace(profileName)
	for _, custom := range project.SpeechPolicyProfiles {
		if custom.ID == profileName {
			fallback := policy.ProfileByName(policy.NormalizeProfileName(custom.BaseProfile)).Settings
			return policy.NormalizeSettings(custom.Settings, fallback), nil
		}
	}
	if isBuiltinSpeechPolicyProfile(profileName) {
		_, settings, _ := policy.ResolveSettings(policy.NormalizeProfileName(profileName), policy.Overrides{})
		return settings, nil
	}
	return policy.ProfileByName(policy.DefaultProfileName).Settings, ErrSpeechPolicyProfileNotFound
}

func projectSpeechPolicyEvaluator(project VoiceProject, profileName string, overrides policy.Overrides) policy.Evaluator {
	return projectSpeechPolicyEvaluatorWithLayers(project, profileName, policy.Overrides{}, overrides, "profile")
}

func normalizeCustomSpeechPolicySettings(settings policy.Settings, baseProfile string) policy.Settings {
	fallback := policy.ProfileByName(policy.NormalizeProfileName(resolveBaseSpeechPolicyProfile(baseProfile))).Settings
	return policy.NormalizeSettings(settings, fallback)
}

func cleanSpeechPolicyProfileName(name string) string {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return "Custom Profile"
	}
	return clean
}

func cleanProjectName(name string) string {
	clean := strings.TrimSpace(name)
	if clean == "" {
		return "Untitled Project"
	}
	return clean
}
