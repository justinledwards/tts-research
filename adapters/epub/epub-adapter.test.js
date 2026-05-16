import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { emitEPUBAdapter } from "./emit_ir.js";

test("EPUB adapter traverses package spine, nav labels, fragments, and media overlays", async () => {
  const emitted = await emitEPUBAdapter(await fixtureEPUB(), {
    sourceId: "epub-fixture",
    sourceName: "fixture.epub",
  });

  assert.equal(emitted.document.schemaVersion, "content-ir.v1");
  assert.equal(emitted.title, "Synthetic Textbook");
  assert.equal(emitted.author, "Adapter Author");
  assert.equal(emitted.capabilities.features.spineTraversal, true);
  assert.equal(emitted.metadata.mediaOverlays.length, 1);
  assert.deepEqual(
    emitted.metadata.sections.map((section) => section.title),
    ["Introduction", "Chapter 1: Tables and Figures"],
  );

  const nodes = emitted.document.nodes;
  assert(nodes.length >= 6);
  assert(nodes.every((node) => node.provenance.locator.type === "epub"));
  assert(nodes.some((node) => node.kind === "caption" && node.displayText.includes("caption")));
  assert(nodes.some((node) => node.kind === "table" && node.displayText.includes("Term")));
  assert(nodes.some((node) => node.provenance.locator.html.fragment === "p-intro"));
  assert(
    nodes.every((node) => typeof node.provenance.locator.html.epubCfi === "string"),
    "all EPUB nodes should expose best-effort CFI locators",
  );
});

async function fixtureEPUB() {
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles><rootfile full-path="EPUB/package.opf" /></rootfiles>
    </container>`,
  );
  zip.file(
    "EPUB/package.opf",
    `<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata>
        <dc:title>Synthetic Textbook</dc:title>
        <dc:creator>Adapter Author</dc:creator>
        <dc:language>en</dc:language>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
        <item id="intro" href="intro.xhtml" media-type="application/xhtml+xml" media-overlay="mo1" />
        <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" />
        <item id="mo1" href="intro.smil" media-type="application/smil+xml" />
      </manifest>
      <spine>
        <itemref idref="intro" />
        <itemref idref="chapter" />
      </spine>
    </package>`,
  );
  zip.file(
    "EPUB/nav.xhtml",
    `<html><body><nav epub:type="toc"><ol>
      <li><a href="intro.xhtml">Introduction</a></li>
      <li><a href="chapter.xhtml">Chapter 1: Tables and Figures</a></li>
    </ol></nav></body></html>`,
  );
  zip.file(
    "EPUB/intro.xhtml",
    `<html lang="en"><head><title>Raw Intro</title></head><body>
      <h1 id="intro-heading">Raw Intro</h1>
      <p id="p-intro">The introduction uses fragment level locators.</p>
      <figure><img src="cover.jpg" alt="Cover alt text" /><figcaption>Opening image caption.</figcaption></figure>
    </body></html>`,
  );
  zip.file(
    "EPUB/chapter.xhtml",
    `<html><head><title>Raw Chapter</title></head><body>
      <h1>Raw Chapter</h1>
      <p>Body prose for the table chapter.</p>
      <table><tr><th>Term</th><td>Definition</td></tr></table>
    </body></html>`,
  );
  zip.file(
    "EPUB/intro.smil",
    `<smil><body><seq><par><text src="intro.xhtml#p-intro" /><audio src="audio/intro.mp3" /></par></seq></body></smil>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
