# Markdown Adapter

## Status

The v2 Markdown adapter is strict by default and runs through the local Node bridge at
`adapters/markdown/cli.js`. It parses Markdown into mdast, transforms mdast into semantic
narration nodes, then emits prepared-source blocks and Content IR metadata for the Go pipeline.

## Capability Report

| Capability | Status | Notes |
| --- | --- | --- |
| CommonMark | Supported | Parsed through `remark-parse`. |
| GFM | Supported | Tables, task lists, strikethrough, autolinks, and footnotes use `remark-gfm`. |
| YAML frontmatter | Supported | Stored in metadata and skipped by speech policy. |
| TOML frontmatter | Supported | Stored in metadata and skipped by speech policy. |
| Directives | Supported | Directive identity and attributes are preserved. Known admonition directives are spoken as callouts; unknown directives become explicit fallback nodes. |
| MDX | Safe subset | JSX, expressions, and ESM become explicit embedded nodes. Surrounding prose remains speakable when present. |
| MyST safe subset | Partial | Fenced `{note}`-style directives and inline roles become admonition or embedded fallback nodes. |
| Unknown constructs | Safe fallback | Unsupported nodes become explicit `embedded` nodes with warnings instead of being dropped. |

## Parse Modes

- `strict`: default for new Markdown source imports. Uses the v2 adapter and records source spans,
  AST paths, metadata, and explicit embedded fallback nodes.
- `legacy`: compatibility mode for imports that should keep the older block classification and
  speech output as closely as possible.

If the Node bridge is unavailable during a strict import, the backend falls back to legacy parsing
and adds `markdown_adapter_fallback` to source warnings.

## Metadata Shape

Prepared-source blocks and Content IR nodes may include:

- `astPath`, `lineStart`, `lineEnd`, `columnStart`, `columnEnd`, and `sourceSlice`
- `language` and `codeMeta` for fenced code
- `headers`, `rows`, and `align` for tables
- `frontmatterFormat`, `frontmatterRaw`, and parsed `frontmatter`
- `directiveName`, `directiveType`, `directiveAttributes`, and `directiveFamily`
- `embeddedFamily`, `embeddedName`, and optional fallback text

Document metadata stores adapter capability flags and collected frontmatter entries.

## Speech Semantics

- Frontmatter is metadata and is not spoken.
- Tables and code are emitted structurally and then handled by the active speech policy.
- Admonitions and callouts are speakable prose with callout metadata.
- Unknown directives, MDX/JSX, and interactive MyST constructs are explicit fallback nodes and are
  available on demand/skipped by default.
- Inline citations are stripped from spoken prose and recorded with citation warnings.

## Fixtures And Snapshots

The fixture corpus lives in `fixtures/markdown/`. Adapter tests compare AST and IR snapshots under
`adapters/markdown/__snapshots__/`.

Run:

```sh
pnpm test:markdown-adapter
```

Update snapshots intentionally with:

```sh
UPDATE_MARKDOWN_SNAPSHOTS=1 pnpm test:markdown-adapter
```

## Benchmark

Run the local parser benchmark against one or more large Markdown files:

```sh
pnpm bench:markdown demo/deep-research-report.md
```

The command reports source bytes, parse time, transform time, emit time, semantic node count, block
count, and adapter warnings.
