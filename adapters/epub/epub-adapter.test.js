import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert(nodes.some((node) => node.provenance.locator.epub.fragment === "p-intro"));
  assert.deepEqual(emitted.metadata.pronunciationLexicons, [
    {
      href: "EPUB/speech/en.pls",
      hreflang: "en",
      rel: "pronunciation",
      title: "",
      type: "application/pls+xml",
    },
  ]);
  assert(emitted.metadata.cssSpeechStyles.some((style) => style.includes("speak-as")));
  const ssmlNode = nodes.find((node) => node.displayText.includes("EPUB 3 speech metadata"));
  assert(ssmlNode, "fixture should expose a node with SSML pronunciation metadata");
  assert.equal(ssmlNode.phoneme, "iːpʌb θriː spiːtʃ ˈmɛtədəɪtə");
  assert.equal(ssmlNode.alphabet, "ipa");
  assert.equal(ssmlNode.sayAs, "spell-out");
  assert.equal(ssmlNode.speech.policyHint.pauseBeforeMs, 250);
  assert.equal(ssmlNode.metadata.cssSpeech["speak-as"], "spell-out");
  assert.equal(ssmlNode.pronunciationRefs[0].phoneme, "iːpʌb θriː spiːtʃ ˈmɛtədəɪtə");
  assert.equal(ssmlNode.pronunciationRefs[0].alphabet, "ipa");
  const inheritedNode = nodes.find((node) => node.displayText.includes("Inherited alphabet"));
  assert(inheritedNode, "fixture should expose inherited SSML alphabet metadata");
  assert.equal(inheritedNode.pronunciationRefs[0].alphabet, "ipa");
  assert.equal(inheritedNode.pronunciationRefs[0].term, "nested term");
  const cssNode = nodes.find((node) => node.displayText.includes("CSS speech hints"));
  assert(cssNode, "fixture should expose inline CSS Speech metadata");
  assert.equal(cssNode.sayAs, "digits");
  assert.equal(cssNode.speech.policyHint.pauseBeforeMs, 100);
  assert.equal(cssNode.speech.policyHint.pauseAfterMs, 220);
  assert.equal(cssNode.metadata.cssSpeech["voice-rate"], "slow");
  assert(
    nodes.every((node) => typeof node.provenance.locator.epub.epubCfi === "string"),
    "all EPUB nodes should expose best-effort CFI locators",
  );

  assert.deepEqual(await speechFidelitySnapshot(emitted), await speechFidelityGolden());
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
    `<html lang="en" xmlns:ssml="http://www.w3.org/2001/10/synthesis" ssml:alphabet="ipa"><head>
      <title>Raw Intro</title>
      <link rel="pronunciation" type="application/pls+xml" hreflang="en" href="speech/en.pls" />
      <style>.initialism { speak-as: spell-out; pause-after: 120ms; }</style>
    </head><body>
      <h1 id="intro-heading">Raw Intro</h1>
      <p id="p-intro">The introduction uses fragment level locators.</p>
      <p id="p-ssml" ssml:ph="iːpʌb θriː spiːtʃ ˈmɛtədəɪtə" style="speak-as: spell-out; pause-before: 250ms;">EPUB 3 speech metadata.</p>
      <p id="p-inherited">Inherited alphabet keeps <span ssml:ph="nɛstɪd tɝm">nested term</span> pronunciation.</p>
      <p id="p-css" style="speak-as: digits; pause: 100ms 220ms; voice-rate: slow;">CSS speech hints are inline.</p>
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

async function speechFidelitySnapshot(emitted) {
  const nodes = emitted.document.nodes;
  const wanted = [
    "EPUB 3 speech metadata.",
    "Inherited alphabet keeps",
    "CSS speech hints are inline.",
  ];
  return {
    pronunciationLexicons: emitted.metadata.pronunciationLexicons,
    cssSpeechStyles: emitted.metadata.cssSpeechStyles,
    nodes: wanted.map((text) =>
      speechNodeSnapshot(nodes.find((node) => node.displayText.includes(text))),
    ),
  };
}

function speechNodeSnapshot(node) {
  assert(node, "speech fidelity node should exist");
  return {
    displayText: node.displayText,
    phoneme: node.phoneme ?? "",
    alphabet: node.alphabet ?? "",
    sayAs: node.sayAs ?? "",
    pauseBeforeMs: node.speech.policyHint.pauseBeforeMs,
    pauseAfterMs: node.speech.policyHint.pauseAfterMs,
    cssSpeech: node.metadata.cssSpeech ?? {},
    pronunciationRefs: (node.pronunciationRefs ?? []).map((ref) => ({
      term: ref.term,
      originalText: ref.originalText,
      phoneme: ref.phoneme,
      alphabet: ref.alphabet,
      source: ref.source,
      startOffset: ref.startOffset,
      endOffset: ref.endOffset,
    })),
  };
}

async function speechFidelityGolden() {
  return JSON.parse(
    await readFile(new URL("./testdata/speech-fidelity.golden.json", import.meta.url), "utf8"),
  );
}
