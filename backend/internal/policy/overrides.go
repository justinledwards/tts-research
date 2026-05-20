package policy

func ResolveSettings(profileName ProfileName, overrides Overrides) (ProfileName, Settings, Overrides) {
	profile := ProfileByName(profileName)
	normalized := NormalizeOverrides(overrides)
	settings := profile.Settings
	if normalized.Mode != "" {
		settings.Mode = normalized.Mode
	}
	if normalized.TableMode != "" {
		settings.TableMode = normalized.TableMode
	}
	if normalized.TableHeaderMode != "" {
		settings.TableHeaderMode = normalized.TableHeaderMode
	}
	if normalized.CodeMode != "" {
		settings.CodeMode = normalized.CodeMode
	}
	if normalized.MathMode != "" {
		settings.MathMode = normalized.MathMode
	}
	if normalized.FootnoteMode != "" {
		settings.FootnoteMode = normalized.FootnoteMode
	}
	if normalized.ImageMode != "" {
		settings.ImageMode = normalized.ImageMode
	}
	if normalized.CaptionMode != "" {
		settings.CaptionMode = normalized.CaptionMode
	}
	if normalized.CitationMode != "" {
		settings.CitationMode = normalized.CitationMode
	}
	if normalized.ListMarkerMode != "" {
		settings.ListMarkerMode = normalized.ListMarkerMode
	}
	if normalized.AdmonitionMode != "" {
		settings.AdmonitionMode = normalized.AdmonitionMode
	}
	if normalized.QuoteMode != "" {
		settings.QuoteMode = normalized.QuoteMode
	}
	return profile.Name, settings, normalized
}

func NormalizeOverrides(overrides Overrides) Overrides {
	return Overrides{
		Mode:            normalizeMode(overrides.Mode),
		TableMode:       normalizeTableMode(overrides.TableMode),
		TableHeaderMode: normalizeTableHeaderMode(overrides.TableHeaderMode),
		CodeMode:        normalizeCodeMode(overrides.CodeMode),
		MathMode:        normalizeMathMode(overrides.MathMode),
		FootnoteMode:    normalizeFootnoteMode(overrides.FootnoteMode),
		ImageMode:       normalizeImageMode(overrides.ImageMode),
		CaptionMode:     normalizeCaptionMode(overrides.CaptionMode),
		CitationMode:    normalizeCitationMode(overrides.CitationMode),
		ListMarkerMode:  normalizeListMarkerMode(overrides.ListMarkerMode),
		AdmonitionMode:  normalizeAdmonitionMode(overrides.AdmonitionMode),
		QuoteMode:       normalizeQuoteMode(overrides.QuoteMode),
	}
}

func NormalizeSettings(settings Settings, fallback Settings) Settings {
	normalized := fallback
	if mode := normalizeMode(settings.Mode); mode != "" {
		normalized.Mode = mode
	}
	if mode := normalizeTableMode(settings.TableMode); mode != "" {
		normalized.TableMode = mode
	}
	if mode := normalizeTableHeaderMode(settings.TableHeaderMode); mode != "" {
		normalized.TableHeaderMode = mode
	}
	if mode := normalizeCodeMode(settings.CodeMode); mode != "" {
		normalized.CodeMode = mode
	}
	if mode := normalizeMathMode(settings.MathMode); mode != "" {
		normalized.MathMode = mode
	}
	if mode := normalizeFootnoteMode(settings.FootnoteMode); mode != "" {
		normalized.FootnoteMode = mode
	}
	if mode := normalizeImageMode(settings.ImageMode); mode != "" {
		normalized.ImageMode = mode
	}
	if mode := normalizeCaptionMode(settings.CaptionMode); mode != "" {
		normalized.CaptionMode = mode
	}
	if mode := normalizeCitationMode(settings.CitationMode); mode != "" {
		normalized.CitationMode = mode
	}
	if mode := normalizeListMarkerMode(settings.ListMarkerMode); mode != "" {
		normalized.ListMarkerMode = mode
	}
	if mode := normalizeAdmonitionMode(settings.AdmonitionMode); mode != "" {
		normalized.AdmonitionMode = mode
	}
	if mode := normalizeQuoteMode(settings.QuoteMode); mode != "" {
		normalized.QuoteMode = mode
	}
	return normalized
}

func normalizeMode(mode Mode) Mode {
	switch mode {
	case ModeSpeak, ModeSkip, ModeSummarise, ModeLiteral, ModeSpell, ModeDescribeShort, ModeDescribeLong, ModeOnDemand, ModeInteractive:
		return mode
	default:
		return ""
	}
}

func normalizeTableMode(mode TableMode) TableMode {
	switch mode {
	case TableModeSkip, TableModeSummary, TableModeRowLinear, TableModeInteractive:
		return mode
	default:
		return ""
	}
}

func normalizeTableHeaderMode(mode TableHeaderMode) TableHeaderMode {
	switch mode {
	case TableHeaderModeNone, TableHeaderModeColumn, TableHeaderModeRowAndColumn:
		return mode
	default:
		return ""
	}
}

func normalizeCodeMode(mode CodeMode) CodeMode {
	switch mode {
	case CodeModeSkip, CodeModeSummary, CodeModeSyntaxAware, CodeModeLiteral:
		return mode
	default:
		return ""
	}
}

func normalizeMathMode(mode MathMode) MathMode {
	switch mode {
	case MathModeSkip, MathModeSemantic, MathModeLiteralSafe:
		return mode
	default:
		return ""
	}
}

func normalizeFootnoteMode(mode FootnoteMode) FootnoteMode {
	switch mode {
	case FootnoteModeSkip, FootnoteModeInline, FootnoteModeEndnote, FootnoteModeOnDemand:
		return mode
	default:
		return ""
	}
}

func normalizeImageMode(mode ImageMode) ImageMode {
	switch mode {
	case ImageModeSkip, ImageModeAltFirst, ImageModeDescribeShort, ImageModeDescribeLong:
		return mode
	default:
		return ""
	}
}

func normalizeCaptionMode(mode CaptionMode) CaptionMode {
	switch mode {
	case CaptionModeSkip, CaptionModeSpeak, CaptionModeOnDemand:
		return mode
	default:
		return ""
	}
}

func normalizeCitationMode(mode CitationMode) CitationMode {
	switch mode {
	case CitationModeSkip, CitationModeInline, CitationModeEndnote, CitationModeOnDemand:
		return mode
	default:
		return ""
	}
}

func normalizeListMarkerMode(mode ListMarkerMode) ListMarkerMode {
	switch mode {
	case ListMarkerModeOmit, ListMarkerModeAnnounce:
		return mode
	default:
		return ""
	}
}

func normalizeAdmonitionMode(mode AdmonitionMode) AdmonitionMode {
	switch mode {
	case AdmonitionModeSkip, AdmonitionModeSpeak, AdmonitionModeSummarise:
		return mode
	default:
		return ""
	}
}

func normalizeQuoteMode(mode QuoteMode) QuoteMode {
	switch mode {
	case QuoteModeSkip, QuoteModeSpeak, QuoteModeSummarise:
		return mode
	default:
		return ""
	}
}

func OverrideSourceForElement(element string, overrides Overrides) string {
	switch element {
	case "table":
		if normalizeTableMode(overrides.TableMode) != "" || normalizeTableHeaderMode(overrides.TableHeaderMode) != "" {
			return "session override"
		}
	case "code":
		if normalizeCodeMode(overrides.CodeMode) != "" {
			return "session override"
		}
	case "math":
		if normalizeMathMode(overrides.MathMode) != "" {
			return "session override"
		}
	case "footnote":
		if normalizeFootnoteMode(overrides.FootnoteMode) != "" {
			return "session override"
		}
	case "image":
		if normalizeImageMode(overrides.ImageMode) != "" {
			return "session override"
		}
	case "caption":
		if normalizeCaptionMode(overrides.CaptionMode) != "" {
			return "session override"
		}
	case "citation", "reference", "artifact_token", "unknown_inline_marker":
		if normalizeCitationMode(overrides.CitationMode) != "" {
			return "session override"
		}
	case "list":
		if normalizeListMarkerMode(overrides.ListMarkerMode) != "" {
			return "session override"
		}
	case "admonition":
		if normalizeAdmonitionMode(overrides.AdmonitionMode) != "" {
			return "session override"
		}
	case "quote":
		if normalizeQuoteMode(overrides.QuoteMode) != "" {
			return "session override"
		}
	default:
		if normalizeMode(overrides.Mode) != "" {
			return "session override"
		}
	}
	return "profile"
}
