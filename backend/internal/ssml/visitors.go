package ssml

func VisitSubstitutions(document Document, visit func(Substitution)) {
	for _, substitution := range document.Substitutions {
		visit(substitution)
	}
}

func VisitLanguageSpans(document Document, visit func(LanguageSpan)) {
	for _, span := range document.LanguageSpans {
		visit(span)
	}
}
