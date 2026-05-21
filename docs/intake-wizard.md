# Intake Wizard

Voice Studio Intake is a guided source creation workflow. It collects intent, source path, metadata, voice defaults, and the destination stage before Review or Preview opens.

## Flow

1. Choose intent: book narration, document reading, webpage reading, technical/audio review, or voice clone experiment.
2. Choose source: file, URL, pasted text, or an existing project source.
3. Confirm metadata: title, language, source type, and detected structure.
4. Choose voice/profile: default voice, language-specific voice, or an explicit profile preset.
5. Open Review or Preview with the selected source, scope, voice, and speech policy preserved.

## Templates

The wizard ships six presets:

- Technical book
- Blog/article
- Education reading
- Accessibility full-content reading
- Enterprise summary/prose-first
- Language learning

Templates set initial intent, source path, source type, language, voice strategy, and speech policy profile. Users can still correct the detected source type and language before opening Review or Preview.

## Adapter Boundary

The wizard is the UI model. Existing source adapters still own ingestion:

- Book-like files and URLs use the book-source adapter so PDF, EPUB, DOCX, HTML, ZIP, and image imports keep structure for Book Cinema.
- Markdown, text, JSON, CSV, logs, pasted text, and readable webpages use prepared-source review.
- Existing books and prepared sources can be reopened without creating duplicate import controls.

Teleprompt, Preview, Review, and Cinema read the same selected source, scope, voice profile, and speech policy profile from workspace state after the wizard opens a stage.
