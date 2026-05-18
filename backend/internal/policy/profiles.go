package policy

func Profiles() []Profile {
	profiles := []Profile{
		{
			Name:        ProfileEducation,
			Label:       "Education",
			Description: "Guided narration with concise summaries for structured learning material.",
			Settings: Settings{
				Mode:            ModeSpeak,
				TableMode:       TableModeSummary,
				TableHeaderMode: TableHeaderModeColumn,
				CodeMode:        CodeModeSummary,
				MathMode:        MathModeSemantic,
				FootnoteMode:    FootnoteModeInline,
				ImageMode:       ImageModeDescribeShort,
				CaptionMode:     CaptionModeSpeak,
				CitationMode:    CitationModeInline,
				ListMarkerMode:  ListMarkerModeAnnounce,
				AdmonitionMode:  AdmonitionModeSpeak,
				QuoteMode:       QuoteModeSpeak,
			},
		},
		{
			Name:        ProfileAccessibility,
			Label:       "Accessibility",
			Description: "Maximum structure and descriptive coverage for non-prose elements.",
			Settings: Settings{
				Mode:            ModeSpeak,
				TableMode:       TableModeRowLinear,
				TableHeaderMode: TableHeaderModeRowAndColumn,
				CodeMode:        CodeModeSyntaxAware,
				MathMode:        MathModeSemantic,
				FootnoteMode:    FootnoteModeInline,
				ImageMode:       ImageModeDescribeLong,
				CaptionMode:     CaptionModeSpeak,
				CitationMode:    CitationModeInline,
				ListMarkerMode:  ListMarkerModeAnnounce,
				AdmonitionMode:  AdmonitionModeSpeak,
				QuoteMode:       QuoteModeSpeak,
			},
		},
		{
			Name:        ProfileTechnicalDocs,
			Label:       "Technical Docs",
			Description: "Preserve technical structure while keeping generated speech predictable.",
			Settings: Settings{
				Mode:            ModeSpeak,
				TableMode:       TableModeRowLinear,
				TableHeaderMode: TableHeaderModeRowAndColumn,
				CodeMode:        CodeModeSyntaxAware,
				MathMode:        MathModeLiteralSafe,
				FootnoteMode:    FootnoteModeEndnote,
				ImageMode:       ImageModeAltFirst,
				CaptionMode:     CaptionModeSpeak,
				CitationMode:    CitationModeEndnote,
				ListMarkerMode:  ListMarkerModeAnnounce,
				AdmonitionMode:  AdmonitionModeSpeak,
				QuoteMode:       QuoteModeSpeak,
			},
		},
		{
			Name:        ProfileLanguageLearning,
			Label:       "Language Learning",
			Description: "Literal-friendly narration for pronunciation and phrase practice.",
			Settings: Settings{
				Mode:            ModeSpeak,
				TableMode:       TableModeSummary,
				TableHeaderMode: TableHeaderModeColumn,
				CodeMode:        CodeModeLiteral,
				MathMode:        MathModeSemantic,
				FootnoteMode:    FootnoteModeInline,
				ImageMode:       ImageModeDescribeShort,
				CaptionMode:     CaptionModeSpeak,
				CitationMode:    CitationModeInline,
				ListMarkerMode:  ListMarkerModeAnnounce,
				AdmonitionMode:  AdmonitionModeSpeak,
				QuoteMode:       QuoteModeSpeak,
			},
		},
		{
			Name:        ProfileEnterprise,
			Label:       "Enterprise",
			Description: "Conservative narration for business review and operational material.",
			Settings: Settings{
				Mode:            ModeSpeak,
				TableMode:       TableModeSummary,
				TableHeaderMode: TableHeaderModeColumn,
				CodeMode:        CodeModeSkip,
				MathMode:        MathModeSkip,
				FootnoteMode:    FootnoteModeOnDemand,
				ImageMode:       ImageModeAltFirst,
				CaptionMode:     CaptionModeSpeak,
				CitationMode:    CitationModeOnDemand,
				ListMarkerMode:  ListMarkerModeOmit,
				AdmonitionMode:  AdmonitionModeSpeak,
				QuoteMode:       QuoteModeSpeak,
			},
		},
	}
	return profiles
}

func PublicDefinition() Definition {
	return Definition{
		Fields: []DefinitionField{
			{
				Key:         "tableMode",
				Label:       "Tables",
				Description: "Controls whether tables are skipped, summarised, read row by row, or left interactive.",
				Options:     options("skip", "Skip", "summary", "Summary", "rowLinear", "Row linear", "interactive", "Interactive"),
			},
			{
				Key:         "tableHeaderMode",
				Label:       "Table headers",
				Description: "Controls how table headers are announced during row traversal.",
				Options:     options("none", "None", "column", "Column headers", "rowAndColumn", "Row and column"),
			},
			{
				Key:         "codeMode",
				Label:       "Code",
				Description: "Controls code block narration.",
				Options:     options("skip", "Skip", "summary", "Summary", "syntaxAware", "Syntax aware", "literal", "Literal"),
			},
			{
				Key:         "mathMode",
				Label:       "Math",
				Description: "Controls math expression narration.",
				Options:     options("skip", "Skip", "semantic", "Semantic", "literalsafe", "Literal safe"),
			},
			{
				Key:         "footnoteMode",
				Label:       "Notes",
				Description: "Controls footnotes and endnotes.",
				Options:     options("skip", "Skip", "inline", "Inline", "endnote", "Endnote", "onDemand", "On demand"),
			},
			{
				Key:         "imageMode",
				Label:       "Images",
				Description: "Controls image alt text and generated descriptions.",
				Options:     options("skip", "Skip", "altFirst", "Alt first", "describeShort", "Short description", "describeLong", "Long description"),
			},
			{
				Key:         "captionMode",
				Label:       "Captions",
				Description: "Controls figure and table captions.",
				Options:     options("skip", "Skip", "speak", "Speak", "onDemand", "On demand"),
			},
			{
				Key:         "citationMode",
				Label:       "Citations",
				Description: "Controls bibliography and citation-only material.",
				Options:     options("skip", "Skip", "inline", "Inline", "endnote", "Endnote", "onDemand", "On demand"),
			},
			{
				Key:         "listMarkerMode",
				Label:       "List markers",
				Description: "Controls whether list item markers are announced.",
				Options:     options("omit", "Omit markers", "announce", "Announce markers"),
			},
			{
				Key:         "admonitionMode",
				Label:       "Admonitions",
				Description: "Controls warning, note, and callout narration.",
				Options:     options("skip", "Skip", "speak", "Speak", "summarise", "Summarise"),
			},
			{
				Key:         "quoteMode",
				Label:       "Quotes",
				Description: "Controls quoted passage narration.",
				Options:     options("skip", "Skip", "speak", "Speak", "summarise", "Summarise"),
			},
		},
		Profiles: Profiles(),
	}
}

func options(values ...string) []DefinitionOption {
	output := make([]DefinitionOption, 0, len(values)/2)
	for index := 0; index+1 < len(values); index += 2 {
		output = append(output, DefinitionOption{Value: values[index], Label: values[index+1]})
	}
	return output
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
