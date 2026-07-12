package policy

import (
	"fmt"
	"strings"
)

func Explain(profileLabel string, element string, elementMode string, finalMode Mode, source string) string {
	profileLabel = strings.TrimSpace(profileLabel)
	if profileLabel == "" {
		profileLabel = string(DefaultProfileName)
	}
	sourceLabel := profileSourceLabel(profileLabel)
	if source == "session override" {
		sourceLabel = "a session override"
	} else if source == "source override" {
		sourceLabel = "a source override"
	}
	switch finalMode {
	case ModeSkip:
		return fmt.Sprintf("%s is skipped because %s sets %s to %s.", elementLabel(element), sourceLabel, element, elementMode)
	case ModeSummarise:
		return fmt.Sprintf("%s is summarised because %s sets %s to %s.", elementLabel(element), sourceLabel, element, elementMode)
	case ModeOnDemand:
		return fmt.Sprintf("%s is available on demand because %s sets %s to %s.", elementLabel(element), sourceLabel, element, elementMode)
	case ModeInteractive:
		return fmt.Sprintf("%s is interactive because %s sets %s to %s.", elementLabel(element), sourceLabel, element, elementMode)
	case ModeLiteral:
		return fmt.Sprintf("%s is read literally because %s sets %s to %s.", elementLabel(element), sourceLabel, element, elementMode)
	case ModeDescribeShort, ModeDescribeLong:
		return fmt.Sprintf("%s is described because %s sets %s to %s.", elementLabel(element), sourceLabel, element, elementMode)
	default:
		if element == "prose" {
			return fmt.Sprintf("Prose is spoken because %s sets mode to %s.", sourceLabel, finalMode)
		}
		return fmt.Sprintf("%s is spoken because %s sets %s to %s.", elementLabel(element), sourceLabel, element, elementMode)
	}
}

func profileSourceLabel(profileLabel string) string {
	if strings.HasSuffix(strings.ToLower(profileLabel), " profile") {
		return "the " + profileLabel
	}
	return "the " + profileLabel + " profile"
}

func elementLabel(element string) string {
	switch element {
	case "admonition":
		return "This admonition"
	case "quote":
		return "This quote"
	case "list":
		return "This list item"
	case "table":
		return "This table"
	case "code":
		return "This code block"
	case "math":
		return "This math expression"
	case "footnote":
		return "This note"
	case "frontmatter":
		return "This frontmatter"
	case "embedded":
		return "This embedded construct"
	case "directive":
		return "This directive"
	case "image":
		return "This image"
	case "caption":
		return "This caption"
	case "citation":
		return "This citation"
	case "reference":
		return "This reference"
	case "artifact_token":
		return "This artifact token"
	case "unknown_inline_marker":
		return "This inline marker"
	default:
		return "This prose"
	}
}
