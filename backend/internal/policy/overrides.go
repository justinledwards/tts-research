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
	return profile.Name, settings, normalized
}

func NormalizeOverrides(overrides Overrides) Overrides {
	return Overrides{
		Mode:         normalizeMode(overrides.Mode),
		TableMode:    normalizeTableMode(overrides.TableMode),
		CodeMode:     normalizeCodeMode(overrides.CodeMode),
		MathMode:     normalizeMathMode(overrides.MathMode),
		FootnoteMode: normalizeFootnoteMode(overrides.FootnoteMode),
		ImageMode:    normalizeImageMode(overrides.ImageMode),
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

func OverrideSourceForElement(element string, overrides Overrides) string {
	switch element {
	case "table":
		if normalizeTableMode(overrides.TableMode) != "" {
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
	default:
		if normalizeMode(overrides.Mode) != "" {
			return "session override"
		}
	}
	return "profile"
}
