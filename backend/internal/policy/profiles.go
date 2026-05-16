package policy

func Profiles() []Profile {
	profiles := []Profile{
		{
			Name:        ProfileEducation,
			Label:       "Education",
			Description: "Guided narration with concise summaries for structured learning material.",
			Settings: Settings{
				Mode:         ModeSpeak,
				TableMode:    TableModeSummary,
				CodeMode:     CodeModeSummary,
				MathMode:     MathModeSemantic,
				FootnoteMode: FootnoteModeInline,
				ImageMode:    ImageModeDescribeShort,
			},
		},
		{
			Name:        ProfileAccessibility,
			Label:       "Accessibility",
			Description: "Maximum structure and descriptive coverage for non-prose elements.",
			Settings: Settings{
				Mode:         ModeSpeak,
				TableMode:    TableModeRowLinear,
				CodeMode:     CodeModeSyntaxAware,
				MathMode:     MathModeSemantic,
				FootnoteMode: FootnoteModeInline,
				ImageMode:    ImageModeDescribeLong,
			},
		},
		{
			Name:        ProfileTechnicalDocs,
			Label:       "Technical Docs",
			Description: "Preserve technical structure while keeping generated speech predictable.",
			Settings: Settings{
				Mode:         ModeSpeak,
				TableMode:    TableModeRowLinear,
				CodeMode:     CodeModeSyntaxAware,
				MathMode:     MathModeLiteralSafe,
				FootnoteMode: FootnoteModeEndnote,
				ImageMode:    ImageModeAltFirst,
			},
		},
		{
			Name:        ProfileLanguageLearning,
			Label:       "Language Learning",
			Description: "Literal-friendly narration for pronunciation and phrase practice.",
			Settings: Settings{
				Mode:         ModeSpeak,
				TableMode:    TableModeSummary,
				CodeMode:     CodeModeLiteral,
				MathMode:     MathModeSemantic,
				FootnoteMode: FootnoteModeInline,
				ImageMode:    ImageModeDescribeShort,
			},
		},
		{
			Name:        ProfileEnterprise,
			Label:       "Enterprise",
			Description: "Conservative narration for business review and operational material.",
			Settings: Settings{
				Mode:         ModeSpeak,
				TableMode:    TableModeSummary,
				CodeMode:     CodeModeSkip,
				MathMode:     MathModeSkip,
				FootnoteMode: FootnoteModeOnDemand,
				ImageMode:    ImageModeAltFirst,
			},
		},
	}
	return profiles
}

func ProfileByName(name ProfileName) Profile {
	clean := NormalizeProfileName(string(name))
	for _, profile := range Profiles() {
		if profile.Name == clean {
			return profile
		}
	}
	return ProfileByName(DefaultProfileName)
}

func NormalizeProfileName(name string) ProfileName {
	switch ProfileName(name) {
	case ProfileEducation:
		return ProfileEducation
	case ProfileAccessibility:
		return ProfileAccessibility
	case ProfileTechnicalDocs:
		return ProfileTechnicalDocs
	case ProfileLanguageLearning:
		return ProfileLanguageLearning
	case ProfileEnterprise:
		return ProfileEnterprise
	default:
		return DefaultProfileName
	}
}
