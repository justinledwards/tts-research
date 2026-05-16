#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { emitEPUBAdapter } from "../adapters/epub/emit_ir.js";
import { emitHTMLAdapter } from "../adapters/html/emit_ir.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.LIVE_INGESTION_OUTPUT_DIR ?? path.join(rootDir, "output", "live-ingestion");
const userAgent = "tts-research-live-ingestion-validator/1.0 (+local validation)";

const requiredHTMLTargets = [
  {
    name: "svt-inrikes",
    url: "https://www.svt.se/nyheter/inrikes/16-maj-nattens-nyheter-od8pzc",
  },
  {
    name: "svt-utrikes",
    url: "https://www.svt.se/nyheter/utrikes/bil-har-kort-in-i-folkmassa-i-italien",
  },
  {
    name: "hn-thread-48160807",
    url: "https://news.ycombinator.com/item?id=48160807",
  },
];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});

async function main() {
  await mkdir(outputDir, { recursive: true });
  const results = [];

  for (const target of requiredHTMLTargets) {
    results.push(await validateHTMLTarget(target));
  }

  const hnFront = await validateHTMLTarget({
    name: "hn-front-page",
    url: "https://news.ycombinator.com/",
  });
  results.push(hnFront);
  results.push(...(await validateHNTopStory()));

  results.push(await validateGutenbergPair("https://www.gutenberg.org/ebooks/24145"));

  const guardianFront = await fetchText("https://www.theguardian.com/international");
  await writeTextFixture("guardian-international.html", guardianFront.text);
  const guardianURL = firstGuardianArticleURL(guardianFront.text);
  if (!guardianURL) {
    throw new Error("Unable to locate a Guardian article link on the international front page.");
  }
  results.push(
    await validateHTMLTarget({
      name: "guardian-international-top-article",
      url: guardianURL,
    }),
  );

  const summaryPath = path.join(outputDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(results, null, 2)}\n`);
  for (const result of results) {
    console.log(`${result.name}: ${result.status}`);
  }
  console.log(`Summary written to ${summaryPath}`);
}

async function validateHTMLTarget(target) {
  const fetched = await fetchText(target.url);
  await writeTextFixture(`${target.name}.html`, fetched.text);
  if (!/html/i.test(fetched.contentType)) {
    throw new Error(
      `${target.name} returned ${fetched.contentType || "unknown content type"}, expected HTML.`,
    );
  }
  const emitted = emitHTMLAdapter(fetched.text, {
    href: target.url,
    sourceName: `${target.name}.html`,
    sourceUrl: target.url,
  });
  assertReadableDocument(target.name, emitted.document);
  const kinds = nodeKinds(emitted.document);
  return {
    kind: "html",
    name: target.name,
    nodeCount: emitted.document.nodes.length,
    status: "ok",
    title: emitted.title,
    url: target.url,
    warnings: emitted.warnings,
    nodeKinds: Object.fromEntries(kinds),
  };
}

async function validateHNTopStory() {
  const htmlPath = path.join(outputDir, "hn-front-page.html");
  const html = await readOutputText(htmlPath);
  const storyURL = firstHNStoryURL(html);
  const discussionURL = firstHNDiscussionURL(html);
  const results = [];
  if (!storyURL) {
    throw new Error("Unable to locate top Hacker News story URL.");
  }
  const story = await fetchText(storyURL);
  await writeTextFixture("hn-top-story.html", story.text);
  if (/html/i.test(story.contentType)) {
    const emitted = emitHTMLAdapter(story.text, {
      href: storyURL,
      sourceName: "hn-top-story.html",
      sourceUrl: storyURL,
    });
    assertReadableDocument("hn-top-story", emitted.document);
    results.push({
      kind: "html",
      name: "hn-top-story",
      nodeCount: emitted.document.nodes.length,
      status: "ok",
      title: emitted.title,
      url: storyURL,
      nodeKinds: Object.fromEntries(nodeKinds(emitted.document)),
    });
  } else {
    results.push({
      contentType: story.contentType,
      kind: "html",
      name: "hn-top-story",
      status: "skipped-non-html",
      url: storyURL,
    });
  }
  if (!discussionURL) {
    throw new Error("Unable to locate top Hacker News discussion URL.");
  }
  results.push(await validateHTMLTarget({ name: "hn-top-discussion", url: discussionURL }));
  return results;
}

async function validateGutenbergPair(pageURL) {
  const page = await fetchText(pageURL);
  await writeTextFixture("gutenberg-24145.html", page.text);
  const epubURL =
    firstMatchingHref(page.text, pageURL, /24145[^"']*\.epub[^"']*/i) ??
    "https://www.gutenberg.org/ebooks/24145.epub.images";
  const pdfCandidates = [
    firstMatchingHref(page.text, pageURL, /24145[^"']*\.pdf[^"']*/i),
    "https://www.gutenberg.org/ebooks/24145.pdf.images",
    "https://www.gutenberg.org/files/24145/24145-pdf.pdf",
  ].filter(Boolean);

  const epub = await fetchBinary(epubURL);
  await writeFile(path.join(outputDir, "gutenberg-24145.epub"), Buffer.from(epub.bytes));
  const emitted = await emitEPUBAdapter(Buffer.from(epub.bytes), {
    sourceName: "gutenberg-24145.epub",
  });
  assertReadableDocument("gutenberg-24145-epub", emitted.document);

  const pdf = await fetchFirstBinary(pdfCandidates, (candidate) => {
    const header = Buffer.from(candidate.bytes).subarray(0, 4).toString("utf8");
    return header === "%PDF" || /pdf/i.test(candidate.contentType);
  });
  await writeFile(path.join(outputDir, "gutenberg-24145.pdf"), Buffer.from(pdf.bytes));

  return {
    epubNodeCount: emitted.document.nodes.length,
    epubTitle: emitted.title,
    epubUrl: epub.url,
    kind: "gutenberg-pair",
    name: "gutenberg-24145-epub-pdf",
    pdfBytes: pdf.bytes.byteLength,
    pdfContentType: pdf.contentType,
    pdfUrl: pdf.url,
    status: "ok",
    url: pageURL,
  };
}

function assertReadableDocument(name, document) {
  if (!document?.nodes?.length) {
    throw new Error(`${name} produced no Content IR nodes.`);
  }
  const readable = document.nodes.filter(
    (node) => String(node.displayText ?? "").trim().length > 0,
  );
  if (readable.length === 0) {
    throw new Error(`${name} produced only empty Content IR nodes.`);
  }
}

function firstHNStoryURL(html) {
  const match = /<span class=["']titleline["'][\s\S]*?<a href=["']([^"']+)["']/i.exec(html);
  return match ? new URL(match[1], "https://news.ycombinator.com/").href : "";
}

function firstHNDiscussionURL(html) {
  const match = /<a href=["']item\?id=(\d+)["'][^>]*>\s*(?:\d+&nbsp;)?comments?/i.exec(html);
  return match ? `https://news.ycombinator.com/item?id=${match[1]}` : "";
}

function firstGuardianArticleURL(html) {
  const candidates = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((href) => /(?:theguardian\.com)?\/.+\/\d{4}\/[a-z]{3}\/\d{2}\//i.test(href));
  return candidates.length > 0 ? new URL(candidates[0], "https://www.theguardian.com").href : "";
}

function firstMatchingHref(html, baseURL, pattern) {
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    if (pattern.test(match[1])) {
      return new URL(match[1], baseURL).href;
    }
  }
  return "";
}

function nodeKinds(document) {
  const kinds = new Map();
  for (const node of document.nodes) {
    kinds.set(node.kind, (kinds.get(node.kind) ?? 0) + 1);
  }
  return [...kinds.entries()].sort(([left], [right]) => left.localeCompare(right));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`GET ${url} returned ${response.status}`);
  }
  return {
    contentType: response.headers.get("content-type") ?? "",
    text: await response.text(),
    url: response.url,
  };
}

async function fetchBinary(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/epub+zip,application/pdf,*/*;q=0.1" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`GET ${url} returned ${response.status}`);
  }
  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") ?? "",
    url: response.url,
  };
}

async function fetchFirstBinary(urls, predicate) {
  const errors = [];
  for (const url of urls) {
    try {
      const fetched = await fetchBinary(url);
      if (predicate(fetched)) {
        return fetched;
      }
      errors.push(`${url}: unexpected ${fetched.contentType || "content"}`);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No candidate binary matched.\n${errors.join("\n")}`);
}

async function writeTextFixture(filename, text) {
  await writeFile(path.join(outputDir, filename), text);
}

async function readOutputText(filename) {
  const { readFile } = await import("node:fs/promises");
  return readFile(filename, "utf8");
}
