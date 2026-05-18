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

type TableHeaderMode string

const (
	TableHeaderModeNone         TableHeaderMode = "none"
	TableHeaderModeColumn       TableHeaderMode = "column"
	TableHeaderModeRowAndColumn TableHeaderMode = "rowAndColumn"
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

type CaptionMode string

const (
	CaptionModeSkip     CaptionMode = "skip"
	CaptionModeSpeak    CaptionMode = "speak"
	CaptionModeOnDemand CaptionMode = "onDemand"
)

type CitationMode string

const (
	CitationModeSkip     CitationMode = "skip"
	CitationModeInline   CitationMode = "inline"
	CitationModeEndnote  CitationMode = "endnote"
	CitationModeOnDemand CitationMode = "onDemand"
)

type ListMarkerMode string

const (
	ListMarkerModeOmit     ListMarkerMode = "omit"
	ListMarkerModeAnnounce ListMarkerMode = "announce"
)

type AdmonitionMode string

const (
	AdmonitionModeSkip      AdmonitionMode = "skip"
	AdmonitionModeSpeak     AdmonitionMode = "speak"
	AdmonitionModeSummarise AdmonitionMode = "summarise"
)

type QuoteMode string

const (
	QuoteModeSkip      QuoteMode = "skip"
	QuoteModeSpeak     QuoteMode = "speak"
	QuoteModeSummarise QuoteMode = "summarise"
)

type Settings struct {
	Mode            Mode            `json:"mode"`
	TableMode       TableMode       `json:"tableMode"`
	TableHeaderMode TableHeaderMode `json:"tableHeaderMode"`
	CodeMode        CodeMode        `json:"codeMode"`
	MathMode        MathMode        `json:"mathMode"`
	FootnoteMode    FootnoteMode    `json:"footnoteMode"`
	ImageMode       ImageMode       `json:"imageMode"`
	CaptionMode     CaptionMode     `json:"captionMode"`
	CitationMode    CitationMode    `json:"citationMode"`
	ListMarkerMode  ListMarkerMode  `json:"listMarkerMode"`
	AdmonitionMode  AdmonitionMode  `json:"admonitionMode"`
	QuoteMode       QuoteMode       `json:"quoteMode"`
}

type Overrides struct {
	Mode            Mode            `json:"mode,omitempty"`
	TableMode       TableMode       `json:"tableMode,omitempty"`
	TableHeaderMode TableHeaderMode `json:"tableHeaderMode,omitempty"`
	CodeMode        CodeMode        `json:"codeMode,omitempty"`
	MathMode        MathMode        `json:"mathMode,omitempty"`
	FootnoteMode    FootnoteMode    `json:"footnoteMode,omitempty"`
	ImageMode       ImageMode       `json:"imageMode,omitempty"`
	CaptionMode     CaptionMode     `json:"captionMode,omitempty"`
	CitationMode    CitationMode    `json:"citationMode,omitempty"`
	ListMarkerMode  ListMarkerMode  `json:"listMarkerMode,omitempty"`
	AdmonitionMode  AdmonitionMode  `json:"admonitionMode,omitempty"`
	QuoteMode       QuoteMode       `json:"quoteMode,omitempty"`
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

type Definition struct {
	Fields   []DefinitionField `json:"fields"`
	Profiles []Profile         `json:"profiles"`
}

type DefinitionField struct {
	Key         string             `json:"key"`
	Label       string             `json:"label"`
	Description string             `json:"description"`
	Options     []DefinitionOption `json:"options"`
}

type DefinitionOption struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

func (speechPolicy SpeechPolicy) IsZero() bool {
	return speechPolicy.Profile == "" &&
		speechPolicy.Element == "" &&
		speechPolicy.ElementMode == "" &&
		speechPolicy.Mode == "" &&
		speechPolicy.Explanation == ""
}
