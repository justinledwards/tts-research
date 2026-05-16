package policy

const DefaultProfileName ProfileName = ProfileEnterprise

type ProfileName string

const (
	ProfileEducation        ProfileName = "Education"
	ProfileAccessibility    ProfileName = "Accessibility"
	ProfileTechnicalDocs    ProfileName = "TechnicalDocs"
	ProfileLanguageLearning ProfileName = "LanguageLearning"
	ProfileEnterprise       ProfileName = "Enterprise"
)

type Mode string

const (
	ModeSpeak         Mode = "speak"
	ModeSkip          Mode = "skip"
	ModeSummarise     Mode = "summarise"
	ModeLiteral       Mode = "literal"
	ModeSpell         Mode = "spell"
	ModeDescribeShort Mode = "describeShort"
	ModeDescribeLong  Mode = "describeLong"
	ModeOnDemand      Mode = "onDemand"
	ModeInteractive   Mode = "interactive"
)

type TableMode string

const (
	TableModeSkip        TableMode = "skip"
	TableModeSummary     TableMode = "summary"
	TableModeRowLinear   TableMode = "rowLinear"
	TableModeInteractive TableMode = "interactive"
)

type CodeMode string

const (
	CodeModeSkip        CodeMode = "skip"
	CodeModeSummary     CodeMode = "summary"
	CodeModeSyntaxAware CodeMode = "syntaxAware"
	CodeModeLiteral     CodeMode = "literal"
)

type MathMode string

const (
	MathModeSkip        MathMode = "skip"
	MathModeSemantic    MathMode = "semantic"
	MathModeLiteralSafe MathMode = "literalsafe"
)

type FootnoteMode string

const (
	FootnoteModeSkip     FootnoteMode = "skip"
	FootnoteModeInline   FootnoteMode = "inline"
	FootnoteModeEndnote  FootnoteMode = "endnote"
	FootnoteModeOnDemand FootnoteMode = "onDemand"
)

type ImageMode string

const (
	ImageModeSkip          ImageMode = "skip"
	ImageModeAltFirst      ImageMode = "altFirst"
	ImageModeDescribeShort ImageMode = "describeShort"
	ImageModeDescribeLong  ImageMode = "describeLong"
)

type Settings struct {
	Mode         Mode         `json:"mode"`
	TableMode    TableMode    `json:"tableMode"`
	CodeMode     CodeMode     `json:"codeMode"`
	MathMode     MathMode     `json:"mathMode"`
	FootnoteMode FootnoteMode `json:"footnoteMode"`
	ImageMode    ImageMode    `json:"imageMode"`
}

type Overrides struct {
	Mode         Mode         `json:"mode,omitempty"`
	TableMode    TableMode    `json:"tableMode,omitempty"`
	CodeMode     CodeMode     `json:"codeMode,omitempty"`
	MathMode     MathMode     `json:"mathMode,omitempty"`
	FootnoteMode FootnoteMode `json:"footnoteMode,omitempty"`
	ImageMode    ImageMode    `json:"imageMode,omitempty"`
}

type Profile struct {
	Name        ProfileName `json:"name"`
	Label       string      `json:"label"`
	Description string      `json:"description"`
	Settings    Settings    `json:"settings"`
}

type Element struct {
	Kind     string
	Role     string
	Text     string
	Language string
	Warnings []string
}

type SpeechPolicy struct {
	Profile     string `json:"profile"`
	Element     string `json:"element,omitempty"`
	ElementMode string `json:"elementMode,omitempty"`
	Mode        string `json:"mode"`
	Explanation string `json:"explanation"`
}

type Decision struct {
	Policy     SpeechPolicy
	SpeechText string
}

func (speechPolicy SpeechPolicy) IsZero() bool {
	return speechPolicy.Profile == "" &&
		speechPolicy.Element == "" &&
		speechPolicy.ElementMode == "" &&
		speechPolicy.Mode == "" &&
		speechPolicy.Explanation == ""
}
