import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { emitDOCXAdapter } from "./emit_ir.js";

test("DOCX adapter emits headings, lists, tables, notes, comments, captions, and images", async () => {
  const emitted = await emitDOCXAdapter(await fixtureDOCX(), {
    sourceId: "docx-fixture",
    sourceName: "fixture.docx",
  });

  assert.equal(emitted.document.schemaVersion, "content-ir.v1");
  assert.equal(emitted.title, "DOCX Fixture");
  assert.equal(emitted.author, "Adapter Writer");
  assert.equal(emitted.capabilities.features.paragraphRunProvenance, true);

  const nodes = emitted.document.nodes;
  const kinds = new Set(nodes.map((node) => node.kind));
  for (const kind of [
    "heading",
    "body",
    "list",
    "table",
    "footnote",
    "endnote",
    "comment",
    "caption",
    "image",
  ]) {
    assert(kinds.has(kind), `missing ${kind} node`);
  }

  const heading = nodes.find((node) => node.kind === "heading");
  assert.equal(heading.provenance.locator.type, "docx");
  assert.equal(heading.provenance.locator.docx.paragraphIndex, 0);
  assert.equal(heading.provenance.locator.docx.runIndex, 0);

  const image = nodes.find((node) => node.kind === "image");
  assert.equal(image.displayText, "Diagram alt text");
  assert.deepEqual(image.metadata.relationshipIds, ["rId5"]);
  assert.equal(image.metadata.relationships[0].target, "media/image1.png");

  const table = nodes.find((node) => node.kind === "table");
  assert.equal(table.metadata.tableCellPath, "table-4");
  assert.match(table.displayText, /Cell A \| Cell B/);

  assert.equal(emitted.metadata.footnotes[0].text, "Footnote detail.");
  assert.equal(emitted.metadata.endnotes[0].text, "Endnote detail.");
  assert.equal(emitted.metadata.comments[0].text, "Comment detail.");
});

async function fixtureDOCX() {
  const zip = new JSZip();
  zip.file(
    "docProps/core.xml",
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
      xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
      <dc:title>DOCX Fixture</dc:title>
      <dc:creator>Adapter Writer</dc:creator>
      <dcterms:created>2026-05-16T00:00:00Z</dcterms:created>
    </cp:coreProperties>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png" />
    </Relationships>`,
  );
  zip.file(
    "word/footnotes.xml",
    `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:footnote w:id="2"><w:p><w:r><w:t>Footnote detail.</w:t></w:r></w:p></w:footnote>
    </w:footnotes>`,
  );
  zip.file(
    "word/endnotes.xml",
    `<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:endnote w:id="3"><w:p><w:r><w:t>Endnote detail.</w:t></w:r></w:p></w:endnote>
    </w:endnotes>`,
  );
  zip.file(
    "word/comments.xml",
    `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:comment w:id="4"><w:p><w:r><w:t>Comment detail.</w:t></w:r></w:p></w:comment>
    </w:comments>`,
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
        <w:p><w:bookmarkStart w:id="7" w:name="body-bookmark" /><w:r><w:t>Body paragraph with provenance.</w:t></w:r><w:footnoteReference w:id="2" /><w:commentReference w:id="4" /></w:p>
        <w:p><w:pPr><w:numPr><w:ilvl w:val="0" /><w:numId w:val="9" /></w:numPr></w:pPr><w:r><w:t>List item one.</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:p><w:pPr><w:pStyle w:val="Caption" /></w:pPr><w:r><w:t>Figure 1. A caption.</w:t></w:r></w:p>
        <w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" descr="Diagram alt text" /><a:blip r:embed="rId5" /></wp:inline></w:drawing></w:r></w:p>
        <w:p><w:r><w:t>Paragraph with endnote.</w:t></w:r><w:endnoteReference w:id="3" /></w:p>
      </w:body>
    </w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
