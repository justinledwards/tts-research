import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

const FRONTMATTER_OPTIONS = [
  "yaml",
  {
    type: "toml",
    marker: "+",
    anywhere: false,
  },
];

export const MARKDOWN_ADAPTER_VERSION = "markdown-adapter-v2";

export function parseMarkdown(source, options = {}) {
  const warnings = [];
  const parseMode = options.parseMode === "legacy" ? "legacy" : "strict";
  try {
    return {
      parseMode,
      tree: parseWithProcessor(source, createProcessor({ mdx: true })),
      warnings,
    };
  } catch (error) {
    warnings.push("markdown_mdx_parse_recovered");
    if (options.includeParseErrors) {
      warnings.push(`markdown_parse_error:${String(error.message ?? error)}`);
    }
    return {
      parseMode,
      tree: parseWithProcessor(source, createProcessor({ mdx: false })),
      warnings,
    };
  }
}

export function snapshotAst(tree) {
  return compactNode(tree);
}

function createProcessor({ mdx }) {
  const processor = unified().use(remarkParse);
  if (mdx) {
    processor.use(remarkMdx);
  }
  return processor.use(remarkGfm).use(remarkFrontmatter, FRONTMATTER_OPTIONS).use(remarkDirective);
}

function parseWithProcessor(source, processor) {
  const tree = processor.parse(source);
  return processor.runSync(tree);
}

function compactNode(node) {
  const output = {
    type: node.type,
  };
  if (typeof node.value === "string") {
    output.value = node.value;
  }
  if (typeof node.lang === "string" && node.lang.length > 0) {
    output.lang = node.lang;
  }
  if (typeof node.name === "string" && node.name.length > 0) {
    output.name = node.name;
  }
  if (node.attributes && Object.keys(node.attributes).length > 0) {
    output.attributes = node.attributes;
  }
  if (node.position) {
    output.position = {
      start: {
        line: node.position.start.line,
        column: node.position.start.column,
        offset: node.position.start.offset,
      },
      end: {
        line: node.position.end.line,
        column: node.position.end.column,
        offset: node.position.end.offset,
      },
    };
  }
  if (Array.isArray(node.children) && node.children.length > 0) {
    output.children = node.children.map((child) => compactNode(child));
  }
  return output;
}
