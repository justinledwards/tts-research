package pipeline

import (
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/policy"
)

func speechPolicyEvaluatorForSource(
	project VoiceProject,
	sourceProfile string,
	sourceOverrides policy.Overrides,
	sessionProfile string,
	sessionOverrides policy.Overrides,
) policy.Evaluator {
	project = normalizeProjectSpeechPolicy(project)
	profileName := project.SpeechPolicyProfile
	baseSource := "profile"
	sourceProfile = strings.TrimSpace(sourceProfile)
	normalizedSourceOverrides := policy.NormalizeOverrides(sourceOverrides)
	normalizedSessionOverrides := policy.NormalizeOverrides(sessionOverrides)
	if sourceProfile != "" {
		if resolved, err := resolveProjectSpeechPolicyProfile(project, sourceProfile); err == nil {
			profileName = resolved
			baseSource = "source override"
		}
	}
	sessionProfile = strings.TrimSpace(sessionProfile)
	if sessionProfile != "" {
		if resolved, err := resolveProjectSpeechPolicyProfile(project, sessionProfile); err == nil {
			profileName = resolved
			baseSource = "session override"
			normalizedSourceOverrides = policy.Overrides{}
		}
	}
	return projectSpeechPolicyEvaluatorWithLayers(
		project,
		profileName,
		normalizedSourceOverrides,
		normalizedSessionOverrides,
		baseSource,
	)
}

func projectSpeechPolicyEvaluatorWithLayers(
	project VoiceProject,
	profileName string,
	sourceOverrides policy.Overrides,
	sessionOverrides policy.Overrides,
	baseSource string,
) policy.Evaluator {
	project = normalizeProjectSpeechPolicy(project)
	profileName, err := resolveProjectSpeechPolicyProfile(project, profileName)
	if err != nil {
		profileName = project.SpeechPolicyProfile
	}
	for _, custom := range project.SpeechPolicyProfiles {
		if custom.ID == profileName {
			settings, _ := projectSpeechPolicySettings(project, profileName)
			return policy.NewLayeredEvaluatorForSettings(
				custom.ID,
				custom.Name,
				settings,
				sourceOverrides,
				sessionOverrides,
				baseSource,
			)
		}
	}
	profile := policy.ProfileByName(policy.NormalizeProfileName(profileName))
	return policy.NewLayeredEvaluatorForSettings(
		string(profile.Name),
		profile.Label,
		profile.Settings,
		sourceOverrides,
		sessionOverrides,
		baseSource,
	)
}
