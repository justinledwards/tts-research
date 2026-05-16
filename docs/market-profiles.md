# Market Profiles

Voice Studio policy profiles decide how structured or non-prose source elements are converted into spoken preview text.

| Profile | mode | tableMode | codeMode | mathMode | footnoteMode | imageMode |
|---|---|---|---|---|---|---|
| Enterprise | speak | summary | skip | skip | onDemand | altFirst |
| Education | speak | summary | summary | semantic | inline | describeShort |
| Accessibility | speak | rowLinear | syntaxAware | semantic | inline | describeLong |
| TechnicalDocs | speak | rowLinear | syntaxAware | literalsafe | endnote | altFirst |
| LanguageLearning | speak | summary | literal | semantic | inline | describeShort |

`Enterprise` is the default profile for existing and newly created projects. Project profile selection is persistent, while advanced element-level overrides are temporary session state.
