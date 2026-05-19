# Adapter Fixture Corpus

Synthetic fixtures in this directory cover URL/HTML ingestion without committing live
article bodies. EPUB and DOCX container fixtures are generated inside adapter and Go
tests so the corpus can exercise package structure without binary fixture churn.

- `raw-article.html`: semantic article with heading, figure, caption, alt text, table, and language propagation.
- `hn-thread.html`: Hacker News style discussion markup with nested comments.

Live URL validation writes fetched public pages and downloadable Gutenberg files to
`output/live-ingestion/`, which is ignored by git.
