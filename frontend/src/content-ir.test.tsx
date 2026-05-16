import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContentIRDrawer } from "./ContentIrDrawer";
import {
  contentIRNodePreview,
  formatContentIRLocator,
  type ContentIRDocument,
  type ContentIRNode,
} from "./content-ir";

const noop = () => null;

describe("Content IR UI helpers", () => {
  it("formats supported locator variants", () => {
    expect(
      formatContentIRLocator({
        type: "markdown",
        markdown: {
          path: "notes.md",
          lineStart: 2,
          lineEnd: 4,
          columnStart: 1,
          columnEnd: 8,
          astPath: "/blocks/1",
        },
      }),
    ).toBe("notes.md:lines 2-4");
    expect(formatContentIRLocator({ type: "pdf", pdf: { pageIndex: 0 } })).toBe("page 1");
    expect(
      formatContentIRLocator({
        type: "epub",
        html: { href: "OPS/chapter.xhtml", fragment: "p1" },
      }),
    ).toBe("OPS/chapter.xhtml#p1");
    expect(
      formatContentIRLocator({
        type: "html",
        html: { href: "https://example.test/article", fragment: "lead" },
      }),
    ).toBe("https://example.test/article#lead");
    expect(formatContentIRLocator({ type: "docx", docx: { paragraphIndex: 4 } })).toBe(
      "paragraph 5",
    );
  });

  it("renders loading, error, and document drawer states", () => {
    expect(
      renderToStaticMarkup(
        <ContentIRDrawer
          document={null}
          error={null}
          isLoading={false}
          isOpen={false}
          title="Hidden"
          onClose={noop}
        />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <ContentIRDrawer
          document={null}
          error={null}
          isLoading
          isOpen
          title="Loading"
          onClose={noop}
        />,
      ),
    ).toContain("Loading structure");
    expect(
      renderToStaticMarkup(
        <ContentIRDrawer
          document={null}
          error="Unable to load"
          isLoading={false}
          isOpen
          title="Error"
          onClose={noop}
        />,
      ),
    ).toContain("Unable to load");

    const markup = renderToStaticMarkup(
      <ContentIRDrawer
        document={makeContentIRDocument()}
        error={null}
        isLoading={false}
        isOpen
        title="Demo"
        onClose={noop}
      />,
    );
    expect(markup).toContain("Inspect Structure");
    expect(markup).toContain("notes.md:line 1");
    expect(markup).toContain("Hello spoken text");
  });

  it("prefers spoken text for node previews", () => {
    expect(contentIRNodePreview({ ...makeContentIRNode(), speechText: "Speech first" })).toBe(
      "Speech first",
    );
  });
});

function makeContentIRDocument(): ContentIRDocument {
  return {
    schemaVersion: "content-ir.v1",
    id: "demo",
    sourceType: "preparedSource",
    sourceId: "demo",
    projectId: "default",
    sourceName: "notes.md",
    adapterVersion: "prepared-source-to-ir.v1",
    generatedAt: "2026-05-16T12:00:00Z",
    nodes: [makeContentIRNode()],
  };
}

function makeContentIRNode(): ContentIRNode {
  return {
    nodeId: "block-0001",
    parentId: "",
    orderKey: "00000001",
    kind: "body",
    role: "body",
    displayText: "Hello display text",
    normalisedText: "Hello display text",
    speechText: "Hello spoken text",
    lang: "und",
    script: "Latn",
    dir: "ltr",
    provenance: {
      format: "markdown",
      sourceId: "demo",
      locator: {
        type: "markdown",
        markdown: {
          path: "notes.md",
          lineStart: 1,
          lineEnd: 1,
          columnStart: 1,
          columnEnd: 8,
          astPath: "/blocks/0",
        },
      },
      offsets: { start: 0, end: 8 },
    },
    ui: { progressionHint: "linear", highlightUnitHint: "segment" },
    speech: {
      policyHint: {
        mode: "speak",
        emphasis: "",
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
      },
      speechPolicy: {
        explanation: "Prose is spoken.",
        mode: "speak",
        profile: "Enterprise",
      },
    },
    warnings: [],
    confidence: 0.94,
    rights: { status: "unknown", notes: "" },
    adapterVersion: "prepared-source-to-ir.v1",
  };
}
